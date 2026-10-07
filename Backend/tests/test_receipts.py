"""Message status lifecycle - the part most likely to break, so it is tested
directly: sending -> sent -> delivered -> read, group = lowest common status,
and the mutual read-receipts privacy rule.
"""


def _send(client, actor, conversation_id, body, client_id=None):
    response = client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={"body": body, "client_id": client_id},
        headers=actor.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()  # 201 Created -> the message itself


def _status_of(client, actor, conversation_id, message_id):
    """Read the status back the way the UI would: the newest page of history."""
    page = client.get(
        f"/api/v1/conversations/{conversation_id}/messages?after={message_id - 1}",
        headers=actor.headers,
    ).json()
    return next(message["status"] for message in page["messages"] if message["id"] == message_id)


def test_recipient_idempotency(client, make_user, open_direct):
    """The same client_id must never create two messages (safe retries)."""
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    conversation_id = open_direct(a, b)

    first = _send(client, a, conversation_id, "hello", client_id="same-id")
    second = _send(client, a, conversation_id, "hello", client_id="same-id")
    assert first["id"] == second["id"]


def test_direct_lifecycle_sent_delivered_read(client, make_user, open_direct):
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    conversation_id = open_direct(a, b)

    message = _send(client, a, conversation_id, "are you there?")
    assert message["status"] == "sent"  # stored, nobody received it yet

    # the recipient's client acknowledges receipt
    client.post(
        f"/api/v1/conversations/{conversation_id}/read",
        json={"up_to_message_id": message["id"]},
        headers=b.headers,
    )
    assert _status_of(client, a, conversation_id, message["id"]) == "read"


def test_read_receipts_are_mutual(client, make_user, open_direct):
    """If the reader has receipts off, the sender must not see 'read'."""
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    conversation_id = open_direct(a, b)

    client.patch("/api/v1/settings", json={"read_receipts": False}, headers=b.headers)

    message = _send(client, a, conversation_id, "seen?")
    client.post(
        f"/api/v1/conversations/{conversation_id}/read",
        json={"up_to_message_id": message["id"]},
        headers=b.headers,
    )
    # Delivered is never optional (the sender always gets its double tick),
    # but "read" must not leak while Bea has read receipts switched off.
    assert _status_of(client, a, conversation_id, message["id"]) == "delivered"

    # the badge still clears for the reader even with receipts switched off
    conversations = client.get("/api/v1/conversations", headers=b.headers).json()
    mine = next(c for c in conversations if c["id"] == conversation_id)
    assert mine["unread_count"] == 0


def test_group_status_is_the_lowest_common_status(client, make_user):
    """One member reading is not enough - all current members must read."""
    a = make_user(name="Admin")
    b = make_user(name="Bea")
    c = make_user(name="Cara")

    group = client.post(
        "/api/v1/groups",
        json={"name": "Receipts QA", "member_ids": [b.id, c.id]},
        headers=a.headers,
    ).json()
    group_id = group["id"]

    message = _send(client, a, group_id, "confirm please?")

    client.post(
        f"/api/v1/conversations/{group_id}/read",
        json={"up_to_message_id": message["id"]},
        headers=b.headers,
    )
    assert _status_of(client, a, group_id, message["id"]) == "sent"

    client.post(
        f"/api/v1/conversations/{group_id}/read",
        json={"up_to_message_id": message["id"]},
        headers=c.headers,
    )
    assert _status_of(client, a, group_id, message["id"]) == "read"


def test_unread_count_tracks_last_read_marker(client, make_user, open_direct):
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    conversation_id = open_direct(a, b)

    for index in range(3):
        _send(client, a, conversation_id, f"message {index}")

    conversations = client.get("/api/v1/conversations", headers=b.headers).json()
    mine = next(c for c in conversations if c["id"] == conversation_id)
    assert mine["unread_count"] == 3

    # sending my own message does not bump my own unread count
    _send(client, b, conversation_id, "replying")
    conversations = client.get("/api/v1/conversations", headers=b.headers).json()
    mine = next(c for c in conversations if c["id"] == conversation_id)
    assert mine["unread_count"] == 3
