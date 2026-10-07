"""Client -> server WebSocket events.

``HANDLERS`` is a plain dispatch table ``{"event name": coroutine}``, which
keeps the socket loop trivial: read JSON, look up the handler, run it. Each
handler opens its own short-lived database session, so a long-lived socket can
never hold a stale session.

Every handler answers with either an event or an ``error`` envelope - a bad
message never kills the connection.
"""

import logging
from collections import defaultdict, deque

from fastapi import WebSocket

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.errors import ApiError
from app.core.security import decode_token
from app.models import User
from app.repositories import conversation_repository as conversations_repo
from app.services import (
    access,
    message_service,
    receipt_service,
    settings_service,
)
from app.ws import events

logger = logging.getLogger("app.ws")

# --- very small in-memory rate limiter ------------------------------------
# Protects the socket from a runaway client: N message sends per window.
RATE_LIMIT_MAX = 20
RATE_LIMIT_WINDOW_SECONDS = 10
_send_times: dict[int, deque] = defaultdict(deque)


def _rate_limited(user_id: int) -> bool:
    import time

    now = time.monotonic()
    window = _send_times[user_id]
    while window and now - window[0] > RATE_LIMIT_WINDOW_SECONDS:
        window.popleft()
    if len(window) >= RATE_LIMIT_MAX:
        return True
    window.append(now)
    return False


# --- handlers -------------------------------------------------------------
async def on_message_send(websocket: WebSocket, user_id: int, data: dict) -> None:
    """The main path for sending a message (REST exists as a fallback)."""
    if _rate_limited(user_id):
        await events.send_error(websocket, "rate_limited", "Slow down a moment - too many messages")
        return

    conversation_id = int(data.get("conversation_id") or 0)
    client_id = data.get("client_id")
    body = data.get("body") or ""
    reply_to_id = data.get("reply_to_id")

    with SessionLocal() as db:
        sender = db.get(User, user_id)
        message, recipients, conversation = message_service.send(
            db,
            sender,
            conversation_id,
            body,
            client_id=client_id,
            reply_to_id=reply_to_id,
        )
        dto = message_service.serialize_one(db, user_id, message)

        # 1. ack to the sending tab (sending -> sent)
        await events.send_ack(websocket, client_id, dto)
        # 2. fan out + stamp deliveries
        await events.broadcast_new_message(db, user_id, dto, recipients)
        # 3. refresh every member's chat list row
        await events.broadcast_conversation_updates(
            conversation.id, conversations_repo.active_member_ids(db, conversation.id)
        )


async def on_message_delivered(websocket: WebSocket, user_id: int, data: dict) -> None:
    """Client tells us it received messages (used when it was offline)."""
    message_ids = [int(mid) for mid in data.get("message_ids", [])]
    with SessionLocal() as db:
        changed = receipt_service.mark_delivered(db, user_id, message_ids)
        await events.emit_status_updates(db, changed)


async def on_message_read(websocket: WebSocket, user_id: int, data: dict) -> None:
    """The recipient's screen shows the messages -> mark them read."""
    conversation_id = int(data.get("conversation_id") or 0)
    up_to_message_id = int(data.get("up_to_message_id") or 0)

    with SessionLocal() as db:
        reader = db.get(User, user_id)
        changed = receipt_service.mark_read(db, reader, conversation_id, up_to_message_id)
        await events.emit_status_updates(db, changed)
        await events.broadcast_conversation_updates(
            conversation_id, conversations_repo.active_member_ids(db, conversation_id)
        )


async def on_typing(websocket: WebSocket, user_id: int, data: dict) -> None:
    """Relay-only: typing is never persisted (it would be noise in the DB)."""
    conversation_id = int(data.get("conversation_id") or 0)
    is_typing = bool(data.get("is_typing", True))

    with SessionLocal() as db:
        try:
            access.require_membership(db, conversation_id, user_id)
        except ApiError:
            return

        # Privacy: only if the sender shows typing, and only to people who
        # have typing indicators switched on themselves.
        if not settings_service.settings_for(db, user_id).typing_indicators:
            return

        recipients = [
            recipient_id
            for recipient_id in conversations_repo.active_member_ids(db, conversation_id)
            if recipient_id != user_id
            and settings_service.settings_for(db, recipient_id).typing_indicators
        ]

    await events.broadcast_typing(recipients, conversation_id, user_id, is_typing)


async def on_reaction_set(websocket: WebSocket, user_id: int, data: dict) -> None:
    message_id = int(data.get("message_id") or 0)
    emoji = data.get("emoji")

    with SessionLocal() as db:
        user = db.get(User, user_id)
        message, conversation_id = message_service.set_reaction(db, user, message_id, emoji)
        dto = message_service.serialize_one(db, user_id, message)
        await events.broadcast_reaction(
            conversation_id, conversations_repo.active_member_ids(db, conversation_id), dto
        )


async def on_presence_ping(websocket: WebSocket, user_id: int, data: dict) -> None:
    """Heartbeat: keeps proxies from closing an idle socket."""
    await websocket.send_json(events.envelope("presence.pong", {"user_id": user_id}))


HANDLERS = {
    "message.send": on_message_send,
    "message.delivered": on_message_delivered,
    "message.read": on_message_read,
    "typing.start": on_typing,
    "typing.stop": on_typing,
    "reaction.set": on_reaction_set,
    "presence.ping": on_presence_ping,
}


async def dispatch(websocket: WebSocket, user_id: int, raw: dict) -> None:
    """Route one incoming frame. Never raises: errors go back as events."""
    event_type = (raw or {}).get("type", "")
    handler = HANDLERS.get(event_type)

    if handler is None:
        await events.send_error(websocket, "unknown_event", f"Unsupported event '{event_type}'")
        return

    payload = dict(raw.get("data") or {})
    if event_type == "typing.start":
        payload["is_typing"] = True
    elif event_type == "typing.stop":
        payload["is_typing"] = False

    try:
        await handler(websocket, user_id, payload)
    except ApiError as exc:
        await events.send_error(websocket, exc.code, exc.message, ref_id=raw.get("id"))
    except Exception:  # pragma: no cover - defensive
        logger.exception("handler %s failed", event_type)
        await events.send_error(websocket, "internal_error", "Something went wrong")


def authenticate(token: str | None) -> int | None:
    """The socket authenticates with the same JWT as REST."""
    return decode_token(token) if token else None


def max_message_length() -> int:
    return settings.MAX_MESSAGE_LENGTH
