"""Message rules: validate -> persist -> return everything the adapters need.

The function ``send`` is the *only* way a user message enters the database. The
REST fallback route and the WebSocket handler both call it, which is why the
two paths cannot drift apart.
"""

import json
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import utcnow
from app.core.errors import bad_request, forbidden, not_found
from app.models import Conversation, Message, User
from app.repositories import conversation_repository as conversations_repo
from app.repositories import message_repository as messages_repo
from app.repositories import user_repository as users_repo
from app.schemas.message import MessageOut, MessagePageOut
from app.services import access, receipt_service, serializers

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def send(
    db: Session,
    sender: User,
    conversation_id: int,
    body: str,
    *,
    client_id: str | None = None,
    reply_to_id: int | None = None,
) -> tuple[Message, list[int], Conversation]:
    """Store a message and return ``(message, recipient_ids, conversation)``.

    The caller (WS handler or REST route) is responsible for fan-out; this
    function owns validation, idempotency and persistence.
    """
    conversation = access.get_conversation_or_404(db, conversation_id)
    membership = access.require_membership(db, conversation_id, sender.id)

    if (
        conversation.type == "group"
        and conversation.only_admins_can_send
        and membership.role != "admin"
    ):
        raise forbidden("Only admins can send messages in this group", "admins_only_send")

    clean_body = (body or "").strip()
    if not clean_body:
        raise bad_request("Message cannot be empty", "empty_message")
    if len(clean_body) > settings.MAX_MESSAGE_LENGTH:
        raise bad_request(
            f"Messages are limited to {settings.MAX_MESSAGE_LENGTH} characters", "message_too_long"
        )

    recipients = conversations_repo.recipients_for(db, conversation_id, sender.id)

    # Idempotency: the browser retries with the same client_id after a dropped
    # socket, so we return the message that already exists instead of a copy.
    if client_id:
        existing = messages_repo.get_by_client_id(db, sender.id, client_id)
        if existing is not None:
            return existing, recipients, conversation

    if reply_to_id is not None:
        quoted = messages_repo.get_by_id(db, reply_to_id)
        if quoted is None or quoted.conversation_id != conversation_id:
            raise bad_request(
                "You can only reply to a message from this conversation", "invalid_reply"
            )

    expires_at = None
    if conversation.disappearing_secs:
        expires_at = utcnow() + timedelta(seconds=conversation.disappearing_secs)

    message = messages_repo.create(
        db,
        conversation_id=conversation_id,
        sender_id=sender.id,
        body=clean_body,
        client_id=client_id,
        kind="text",
        reply_to_id=reply_to_id,
        expires_at=expires_at,
    )
    messages_repo.create_receipts(db, message.id, recipients)
    conversations_repo.touch_last_message(db, conversation, message)

    db.commit()
    db.refresh(message)
    return message, recipients, conversation


def send_attachment(
    db: Session,
    sender: User,
    conversation_id: int,
    *,
    file_name: str,
    mime_type: str,
    size_bytes: int,
    storage_path: str,
    caption: str | None = None,
) -> tuple[Message, list[int], Conversation]:
    """Store an attachment message. Same rules as a text message, plus a row in
    ``attachments`` pointing at the file on disk."""
    conversation = access.get_conversation_or_404(db, conversation_id)
    membership = access.require_membership(db, conversation_id, sender.id)

    if (
        conversation.type == "group"
        and conversation.only_admins_can_send
        and membership.role != "admin"
    ):
        raise forbidden("Only admins can send messages in this group", "admins_only_send")

    recipients = conversations_repo.recipients_for(db, conversation_id, sender.id)

    expires_at = None
    if conversation.disappearing_secs:
        expires_at = utcnow() + timedelta(seconds=conversation.disappearing_secs)

    message = messages_repo.create(
        db,
        conversation_id=conversation_id,
        sender_id=sender.id,
        body=caption,
        kind="attachment",
        expires_at=expires_at,
    )
    messages_repo.create_attachment(
        db,
        message_id=message.id,
        file_name=file_name,
        mime_type=mime_type,
        size_bytes=size_bytes,
        storage_path=storage_path,
    )
    messages_repo.create_receipts(db, message.id, recipients)
    conversations_repo.touch_last_message(db, conversation, message)

    db.commit()
    db.refresh(message)
    return message, recipients, conversation


def create_system_message(
    db: Session,
    conversation: Conversation,
    body: str,
    system_event: str,
    system_payload: dict | None = None,
) -> Message:
    """Group events ("Meera added Aarav") are messages without a sender.

    ``system_payload`` keeps the machine-readable detail (actor, targets, value)
    next to the human sentence, so the client can render "You added Meera".
    """
    message = messages_repo.create(
        db,
        conversation_id=conversation.id,
        sender_id=None,
        body=body,
        kind="system",
        system_event=system_event,
        system_payload=json.dumps(system_payload) if system_payload else None,
    )
    conversations_repo.touch_last_message(db, conversation, message)
    db.flush()
    return message


def get_history(
    db: Session,
    viewer: User,
    conversation_id: int,
    *,
    before: int | None = None,
    after: int | None = None,
    limit: int = DEFAULT_PAGE_SIZE,
) -> MessagePageOut:
    """One page of history, oldest -> newest, plus a cursor for the next page."""
    access.get_conversation_or_404(db, conversation_id)
    access.require_membership(db, conversation_id, viewer.id)
    limit = max(1, min(limit, MAX_PAGE_SIZE))

    # Fetch one extra row to know whether older messages exist. The extra row
    # is always the *oldest* of the batch, except when paging forward from a
    # cursor (`after=`), where it is the newest.
    rows = messages_repo.list_messages(
        db, conversation_id, before=before, after=after, limit=limit + 1, viewer_id=viewer.id
    )
    has_more = len(rows) > limit

    # Two different windows: forward paging keeps the newest `limit` rows, while
    # the newest-first fetch drops the extra oldest row. Written out because the
    # nested-ternary version is harder to read than the two cases it covers.
    if after is not None:  # noqa: SIM108
        page = rows[:limit]
    else:
        # newest-first window: drop the extra oldest row, keep the newest ones
        page = rows[1:] if has_more else rows

    return MessagePageOut(
        messages=build_dtos(db, viewer.id, page),
        next_cursor=page[0].id if (has_more and page and after is None) else None,
        has_more=has_more,
    )


def build_dtos(db: Session, viewer_id: int, messages: list[Message]) -> list[MessageOut]:
    """Serialize a batch of messages with three extra queries, never N+1.

    1. statuses  - aggregated receipts (own messages only)
    2. replies   - quoted messages in one lookup
    3. names     - display names of everyone who appears
    """
    if not messages:
        return []

    statuses = receipt_service.compute_statuses(db, messages, viewer_id)
    reply_ids = [m.reply_to_id for m in messages if m.reply_to_id]
    replies = messages_repo.reply_previews(db, reply_ids)

    user_ids = {m.sender_id for m in messages if m.sender_id}
    user_ids |= {r.sender_id for r in replies.values() if r.sender_id}
    names = users_repo.names_for(db, list(user_ids))

    dtos: list[MessageOut] = []
    for message in messages:
        quoted = replies.get(message.reply_to_id) if message.reply_to_id else None
        dtos.append(
            serializers.message_out(
                message,
                status=statuses.get(message.id, "sent"),
                sender_name=names.get(message.sender_id),
                reply_preview=quoted,
                reply_sender_name=names.get(quoted.sender_id) if quoted else None,
            )
        )
    return dtos


def serialize_one(db: Session, viewer_id: int, message: Message) -> MessageOut:
    return build_dtos(db, viewer_id, [message])[0]


def delete_message(db: Session, user: User, message_id: int, scope: str) -> tuple[Message, int]:
    """``scope='everyone'`` leaves a tombstone; ``scope='me'`` hides it for me only."""
    message = messages_repo.get_by_id(db, message_id)
    if message is None:
        raise not_found("Message not found", "message_not_found")

    access.require_membership(db, message.conversation_id, user.id)

    if scope == "me":
        messages_repo.hide_for_user(db, message_id, user.id)
        db.commit()
        return message, message.conversation_id

    is_sender = message.sender_id == user.id
    is_admin = False
    if not is_sender:
        membership = access.require_membership(db, message.conversation_id, user.id)
        is_admin = membership.role == "admin"
    if not (is_sender or is_admin):
        raise forbidden("You can only delete your own messages", "not_message_owner")

    # Tombstone instead of a hard delete: other clients render
    # "This message was deleted" and the id/ordering stays stable.
    message.deleted_at = utcnow()
    message.body = None
    db.commit()
    db.refresh(message)
    return message, message.conversation_id


def set_reaction(
    db: Session, user: User, message_id: int, emoji: str | None
) -> tuple[Message, int]:
    """Add, change or clear my reaction (one emoji per user per message)."""
    message = messages_repo.get_by_id(db, message_id)
    if message is None:
        raise not_found("Message not found", "message_not_found")
    access.require_membership(db, message.conversation_id, user.id)

    if emoji is None:
        messages_repo.clear_reaction(db, message_id, user.id)
    else:
        if len(emoji) > 8:
            raise bad_request("That is not a valid reaction", "invalid_emoji")
        messages_repo.set_reaction(db, message_id, user.id, emoji)

    db.commit()
    db.refresh(message)
    return message, message.conversation_id
