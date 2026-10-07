"""Server -> client WebSocket events (the output half of the protocol).

Everything a client receives has the same envelope::

    {"type": "message.new", "data": { ... }}

Two rules are enforced here:

* **Per-viewer payloads.** ``conversation.updated`` contains *my* unread count
  and *my* pin/mute flags, so it cannot be broadcast verbatim - it is serialized
  once per member.
* **Statuses are recomputed, never guessed.** After any receipt change we ask
  ``receipt_service`` for the sender's aggregate status (min over recipients in
  a group) and push that. The client never has to work out ticks itself.
"""

from collections import defaultdict

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models import User
from app.repositories import conversation_repository as conversations_repo
from app.repositories import message_repository as messages_repo
from app.repositories import user_repository as users_repo
from app.schemas.message import MessageOut
from app.services import conversation_service, message_service, presence_service, receipt_service
from app.ws.connection_manager import manager


def envelope(event_type: str, data: dict | None = None) -> dict:
    """Wrap a payload in the standard envelope (datetimes -> ISO strings)."""
    return {"type": event_type, "data": jsonable_encoder(data or {})}


async def send_to_users(user_ids: list[int], event: dict) -> None:
    await manager.send_to_users(user_ids, event)


async def send_error(
    websocket: WebSocket, code: str, message: str, ref_id: str | None = None
) -> None:
    await websocket.send_json(
        envelope("error", {"code": code, "message": message, "ref_id": ref_id})
    )


async def send_ack(websocket: WebSocket, client_id: str | None, message: MessageOut) -> None:
    """The sender's own screen flips *sending -> sent* on this event."""
    await websocket.send_json(envelope("message.ack", {"client_id": client_id, "message": message}))


async def broadcast_new_message(
    db: Session, sender_id: int, message: MessageOut, recipients: list[int]
) -> None:
    """Fan out a new message to recipients + the sender's other tabs, then
    stamp delivery for whoever is online right now."""
    payload = envelope("message.new", {"message": message})
    await manager.send_to_users(recipients, payload)
    if recipients:
        # Multi-tab: keep the sender's other windows in sync too.
        await manager.send_to_user(sender_id, payload)

    delivered_pairs: list[tuple[int, int]] = []
    for recipient_id in recipients:
        if presence_service.is_online(recipient_id):
            # Server-side delivery: we know the socket exists, so the message
            # has reached a device - no client round trip needed.
            receipt_service.mark_delivered(db, recipient_id, [message.id])
            delivered_pairs.append((message.id, sender_id))

    if delivered_pairs:
        await emit_status_updates(db, delivered_pairs)


async def emit_status_updates(db: Session, pairs: list[tuple[int, int]]) -> None:
    """``pairs`` = ``[(message_id, sender_id), ...]``.

    Recomputes each sender's aggregate status and pushes one event per distinct
    status, so the frontend just applies "these ids are now read".
    """
    if not pairs:
        return

    by_sender: dict[int, list[int]] = defaultdict(list)
    for message_id, sender_id in pairs:
        by_sender[sender_id].append(message_id)

    for sender_id, message_ids in by_sender.items():
        messages = [m for m in (messages_repo.get_by_id(db, mid) for mid in message_ids) if m]
        if not messages:
            continue
        statuses = receipt_service.compute_statuses(db, messages, sender_id)

        grouped: dict[str, list[int]] = defaultdict(list)
        for message_id, status in statuses.items():
            grouped[status].append(message_id)

        for status, ids in grouped.items():
            await manager.send_to_user(
                sender_id,
                envelope(
                    "receipt.update",
                    {
                        "conversation_id": messages[0].conversation_id,
                        "message_ids": ids,
                        "status": status,
                    },
                ),
            )


async def broadcast_typing(
    recipient_ids: list[int], conversation_id: int, user_id: int, is_typing: bool
) -> None:
    await manager.send_to_users(
        recipient_ids,
        envelope(
            "typing",
            {"conversation_id": conversation_id, "user_id": user_id, "is_typing": is_typing},
        ),
    )


async def broadcast_presence(user: User, online: bool) -> None:
    """Tell everyone who shares a chat with this user."""
    with SessionLocal() as db:
        peers = presence_service.peers_to_notify(db, user.id)
    await manager.send_to_users(peers, presence_service.presence_event(user, online))


async def broadcast_conversation_updates(conversation_id: int, member_ids: list[int]) -> None:
    """Send each member *their own* chat-list row (unread count, flags, ...)."""
    with SessionLocal() as db:
        for user_id in member_ids:
            user = users_repo.get_by_id(db, user_id)
            membership = conversations_repo.get_membership(db, conversation_id, user_id)
            if user is None or membership is None or membership.left_at is not None:
                continue
            dto = conversation_service.serialize_membership(db, user, membership)
            await manager.send_to_user(
                user_id, envelope("conversation.updated", {"conversation": dto})
            )


async def broadcast_group_event(
    conversation_id: int,
    event_type: str,
    system_message: MessageOut | None,
    member_ids: list[int],
) -> None:
    """Group membership changes: refresh the list and drop in the system message."""
    payload = envelope(
        "group.updated",
        {
            "conversation_id": conversation_id,
            "event": event_type,
            "message": system_message,
        },
    )
    await manager.send_to_users(member_ids, payload)
    await broadcast_conversation_updates(conversation_id, member_ids)


async def broadcast_message_deleted(
    conversation_id: int, member_ids: list[int], message_id: int, scope: str
) -> None:
    await manager.send_to_users(
        member_ids,
        envelope(
            "message.deleted",
            {"conversation_id": conversation_id, "message_id": message_id, "scope": scope},
        ),
    )


async def broadcast_reaction(
    conversation_id: int, member_ids: list[int], message: MessageOut
) -> None:
    await manager.send_to_users(
        member_ids,
        envelope("message.reaction", {"conversation_id": conversation_id, "message": message}),
    )


async def deliver_pending_messages(user_id: int) -> None:
    """Catch-up on connect: push everything this user has not received yet.

    This is what makes "close the tab, send three messages, reopen" behave the
    way people expect - and it is also how senders finally get their
    "delivered" tick after the recipient was offline.
    """
    with SessionLocal() as db:
        pending = messages_repo.delivered_undelivered_messages(db, user_id)
        if not pending:
            return

        dtos = message_service.build_dtos(db, user_id, pending)
        await manager.send_to_user(user_id, envelope("message.batch", {"messages": dtos}))

        message_ids = [message.id for message in pending]
        receipt_service.mark_delivered(db, user_id, message_ids)
        await emit_status_updates(
            db, [(m.id, m.sender_id) for m in pending if m.sender_id is not None]
        )
