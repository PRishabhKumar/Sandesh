"""WebSocket protocol tests - two live sockets talking to each other.

These replicate the "two browser windows" demo in an automated way: connect two
sockets, send a message from one, and walk it through
ack -> message.new -> receipt.update(delivered) -> receipt.update(read).
"""

import pytest
from fastapi.testclient import TestClient  # noqa: F401  (typing only)


def _events_of(websocket, wanted: str, limit: int = 12) -> dict:
    """Read frames until one of the wanted type shows up."""
    for _ in range(limit):
        event = websocket.receive_json()
        if event["type"] == wanted:
            return event
    raise AssertionError(f"never received '{wanted}'")


@pytest.fixture
def two_users(client, make_user, open_direct):
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    conversation_id = open_direct(a, b)
    return a, b, conversation_id


def test_message_round_trip_over_websocket(client, two_users):
    a, b, conversation_id = two_users

    with (
        client.websocket_connect(f"/ws?token={a.token}") as socket_a,
        client.websocket_connect(f"/ws?token={b.token}") as socket_b,
    ):
        socket_a.send_json(
            {
                "type": "message.send",
                "data": {
                    "conversation_id": conversation_id,
                    "client_id": "ws-1",
                    "body": "hello over the socket",
                },
            }
        )

        # 1. the sender is acknowledged -> its bubble flips "sending -> sent"
        ack = _events_of(socket_a, "message.ack")
        assert ack["data"]["client_id"] == "ws-1"
        message_id = ack["data"]["message"]["id"]
        assert ack["data"]["message"]["body"] == "hello over the socket"

        # 2. the recipient is pushed the message
        incoming = _events_of(socket_b, "message.new")
        assert incoming["data"]["message"]["id"] == message_id
        assert incoming["data"]["message"]["sender_name"] == "Ali"

        # 3. the recipient is online, so delivery is stamped immediately
        delivered = _events_of(socket_a, "receipt.update")
        assert delivered["data"]["status"] == "delivered"
        assert message_id in delivered["data"]["message_ids"]

        # 4. the recipient reads it -> the sender sees "read"
        socket_b.send_json(
            {
                "type": "message.read",
                "data": {"conversation_id": conversation_id, "up_to_message_id": message_id},
            }
        )
        read = _events_of(socket_a, "receipt.update")
        assert read["data"]["status"] == "read"


def test_typing_indicator_is_relayed_to_the_other_user(client, two_users):
    a, b, conversation_id = two_users

    with (
        client.websocket_connect(f"/ws?token={a.token}") as socket_a,
        client.websocket_connect(f"/ws?token={b.token}") as socket_b,
    ):
        socket_b.send_json({"type": "typing.start", "data": {"conversation_id": conversation_id}})
        typing = _events_of(socket_a, "typing")
        assert typing["data"]["user_id"] == b.id
        assert typing["data"]["is_typing"] is True

        socket_b.send_json({"type": "typing.stop", "data": {"conversation_id": conversation_id}})
        stopped = _events_of(socket_a, "typing")
        assert stopped["data"]["is_typing"] is False


def test_presence_is_broadcast_on_connect_and_disconnect(client, two_users):
    a, b, _conversation_id = two_users

    with client.websocket_connect(f"/ws?token={a.token}") as socket_a:
        with client.websocket_connect(f"/ws?token={b.token}"):
            online = _events_of(socket_a, "presence")
            assert online["data"]["user_id"] == b.id
            assert online["data"]["online"] is True

        offline = _events_of(socket_a, "presence")
        assert offline["data"]["user_id"] == b.id
        assert offline["data"]["online"] is False
        assert offline["data"]["last_seen_at"] is not None


def test_reading_reaction_from_the_socket(client, two_users):
    a, b, conversation_id = two_users

    with (
        client.websocket_connect(f"/ws?token={a.token}") as socket_a,
        client.websocket_connect(f"/ws?token={b.token}") as socket_b,
    ):
        socket_a.send_json(
            {
                "type": "message.send",
                "data": {
                    "conversation_id": conversation_id,
                    "client_id": "react-1",
                    "body": "rate this",
                },
            }
        )
        message_id = _events_of(socket_a, "message.ack")["data"]["message"]["id"]
        _events_of(socket_b, "message.new")

        socket_b.send_json(
            {"type": "reaction.set", "data": {"message_id": message_id, "emoji": "🔥"}}
        )
        reaction = _events_of(socket_a, "message.reaction")
        assert reaction["data"]["message"]["reactions"][0]["emoji"] == "🔥"


def test_bad_event_and_unauthorized_socket(client, two_users):
    _a, _b, _conversation_id = two_users

    # the server closes an unauthenticated socket; the client sees a close, so a
    # receive here should not yield a normal event
    with (
        client.websocket_connect("/ws?token=not-a-token") as socket,
        pytest.raises(Exception),  # noqa: B017 - starlette raises a close
    ):
        socket.receive_json()

    with client.websocket_connect(f"/ws?token={_a.token}") as socket:
        socket.send_json({"type": "nonsense.event", "data": {}})
        error = _events_of(socket, "error")
        assert error["data"]["code"] == "unknown_event"
