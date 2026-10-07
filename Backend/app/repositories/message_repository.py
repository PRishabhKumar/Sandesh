"""Database access for messages, receipts and reactions."""

from datetime import datetime

from sqlalchemy import and_, exists, func, or_, select, true
from sqlalchemy import delete as sql_delete
from sqlalchemy.orm import Session

from app.core.database import utcnow
from app.models import (
    Attachment,
    ConversationMember,
    Message,
    MessageDeletion,
    MessageReceipt,
    Reaction,
)


def get_by_id(db: Session, message_id: int) -> Message | None:
    return db.get(Message, message_id)


def get_by_client_id(db: Session, sender_id: int, client_id: str) -> Message | None:
    """Idempotency lookup: has this exact send already been stored?"""
    return db.scalar(
        select(Message).where(Message.sender_id == sender_id, Message.client_id == client_id)
    )


def create(
    db: Session,
    *,
    conversation_id: int,
    sender_id: int | None,
    body: str | None,
    client_id: str | None = None,
    kind: str = "text",
    reply_to_id: int | None = None,
    system_event: str | None = None,
    system_payload: str | None = None,
    expires_at: datetime | None = None,
) -> Message:
    message = Message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        client_id=client_id,
        kind=kind,
        body=body,
        reply_to_id=reply_to_id,
        system_event=system_event,
        system_payload=system_payload,
        expires_at=expires_at,
    )
    db.add(message)
    db.flush()
    return message


def create_receipts(db: Session, message_id: int, recipient_ids: list[int]) -> None:
    """One receipt row per recipient - the basis of delivered/read ticks."""
    for user_id in recipient_ids:
        db.add(MessageReceipt(message_id=message_id, user_id=user_id))
    db.flush()


def create_attachment(
    db: Session,
    *,
    message_id: int,
    file_name: str,
    mime_type: str,
    size_bytes: int,
    storage_path: str,
    width: int | None = None,
    height: int | None = None,
) -> Attachment:
    """Metadata for a file that already lives on disk."""
    attachment = Attachment(
        message_id=message_id,
        file_name=file_name,
        mime_type=mime_type,
        size_bytes=size_bytes,
        storage_path=storage_path,
        width=width,
        height=height,
    )
    db.add(attachment)
    db.flush()
    return attachment


def _not_hidden_for(viewer_id: int | None):
    """SQL condition: this message is not in the viewer's 'deleted for me' list."""
    if viewer_id is None:
        return true()
    return ~exists().where(
        and_(MessageDeletion.message_id == Message.id, MessageDeletion.user_id == viewer_id)
    )


def list_messages(
    db: Session,
    conversation_id: int,
    *,
    before: int | None = None,
    after: int | None = None,
    limit: int = 50,
    viewer_id: int | None = None,
) -> list[Message]:
    """Cursor pagination by message id (never OFFSET).

    ``before`` scrolls up into history (returns the newest ``limit`` messages
    older than the cursor); ``after`` is used to re-sync after a reconnect.
    """
    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .where(_not_hidden_for(viewer_id))
    )

    if before is not None:
        query = query.where(Message.id < before).order_by(Message.id.desc()).limit(limit)
        return list(reversed(list(db.scalars(query))))

    if after is not None:
        query = query.where(Message.id > after).order_by(Message.id.asc()).limit(limit)
        return list(db.scalars(query))

    query = query.order_by(Message.id.desc()).limit(limit)
    return list(reversed(list(db.scalars(query))))


def count_messages(db: Session, conversation_id: int) -> int:
    return (
        db.scalar(select(func.count(Message.id)).where(Message.conversation_id == conversation_id))
        or 0
    )


def reply_previews(db: Session, message_ids: list[int]) -> dict[int, Message]:
    """Batch-load quoted messages so the serializer does not query per row."""
    if not message_ids:
        return {}
    rows = db.scalars(select(Message).where(Message.id.in_(message_ids)))
    return {row.id: row for row in rows}


def unread_counts(db: Session, user_id: int, conversation_ids: list[int]) -> dict[int, int]:
    """Unread messages per conversation for one user, in a single query.

    Source of truth is ``conversation_members.last_read_message_id`` (not
    receipts) because that marker is updated even when the user has read
    receipts switched off - so unread badges stay correct for everybody.

    Unread = newer than my marker, not written by me, not a system message and
    not deleted.
    """
    if not conversation_ids:
        return {}

    rows = db.execute(
        select(Message.conversation_id, func.count(Message.id))
        .join(
            ConversationMember,
            and_(
                ConversationMember.conversation_id == Message.conversation_id,
                ConversationMember.user_id == user_id,
            ),
        )
        .where(
            Message.conversation_id.in_(conversation_ids),
            or_(
                ConversationMember.last_read_message_id.is_(None),
                Message.id > ConversationMember.last_read_message_id,
            ),
            Message.sender_id != user_id,
            Message.kind != "system",
            Message.deleted_at.is_(None),
        )
        .group_by(Message.conversation_id)
    ).all()
    return dict(rows)


def receipt_counts(db: Session, message_ids: list[int]) -> dict[int, tuple[int, int]]:
    """``{message_id: (delivered_count, read_count)}`` for status computation."""
    if not message_ids:
        return {}
    rows = db.execute(
        select(
            MessageReceipt.message_id,
            func.count(MessageReceipt.delivered_at),
            func.count(MessageReceipt.read_at),
        )
        .where(MessageReceipt.message_id.in_(message_ids))
        .group_by(MessageReceipt.message_id)
    ).all()
    return {message_id: (delivered, read) for message_id, delivered, read in rows}


def mark_delivered(db: Session, user_id: int, message_ids: list[int]) -> list[int]:
    """Stamp ``delivered_at``; returns the ids that actually changed."""
    if not message_ids:
        return []
    receipts = list(
        db.scalars(
            select(MessageReceipt).where(
                MessageReceipt.user_id == user_id,
                MessageReceipt.message_id.in_(message_ids),
                MessageReceipt.delivered_at.is_(None),
            )
        )
    )
    now = utcnow()
    for receipt in receipts:
        receipt.delivered_at = now
    db.flush()
    return [receipt.message_id for receipt in receipts]


def conversation_message_ids(
    db: Session, user_id: int, conversation_id: int, up_to_message_id: int
) -> list[int]:
    """Message ids in one conversation that this user should have received."""
    return list(
        db.scalars(
            select(Message.id)
            .join(MessageReceipt, MessageReceipt.message_id == Message.id)
            .where(
                MessageReceipt.user_id == user_id,
                Message.conversation_id == conversation_id,
                Message.id <= up_to_message_id,
            )
        )
    )


def mark_read(db: Session, user_id: int, up_to_message_id: int) -> list[int]:
    """Stamp ``read_at`` on my unread receipts up to a message id.

    Receipts are only stamped for messages I actually received; the privacy
    rule (both sides must allow read receipts) is applied by the service layer.
    """
    receipts = list(
        db.scalars(
            select(MessageReceipt).where(
                MessageReceipt.user_id == user_id,
                MessageReceipt.message_id <= up_to_message_id,
                MessageReceipt.read_at.is_(None),
            )
        )
    )
    now = utcnow()
    for receipt in receipts:
        receipt.read_at = now
        if receipt.delivered_at is None:
            receipt.delivered_at = now
    db.flush()
    return [receipt.message_id for receipt in receipts]


def delivered_undelivered_messages(db: Session, user_id: int) -> list[Message]:
    """Messages addressed to me that I have not received yet (offline catch-up)."""
    return list(
        db.scalars(
            select(Message)
            .join(MessageReceipt, MessageReceipt.message_id == Message.id)
            .where(
                MessageReceipt.user_id == user_id,
                MessageReceipt.delivered_at.is_(None),
                Message.deleted_at.is_(None),
            )
            .order_by(Message.id.asc())
        )
    )


# --- reactions ------------------------------------------------------------
def set_reaction(db: Session, message_id: int, user_id: int, emoji: str) -> Reaction:
    """One reaction per user per message (upsert)."""
    reaction = db.get(Reaction, (message_id, user_id))
    if reaction is None:
        reaction = Reaction(message_id=message_id, user_id=user_id, emoji=emoji)
        db.add(reaction)
    else:
        reaction.emoji = emoji
    db.flush()
    return reaction


def clear_reaction(db: Session, message_id: int, user_id: int) -> bool:
    result = db.execute(
        sql_delete(Reaction).where(Reaction.message_id == message_id, Reaction.user_id == user_id)
    )
    db.flush()
    return bool(result.rowcount)


def reactions_for(db: Session, message_ids: list[int]) -> dict[int, list[Reaction]]:
    if not message_ids:
        return {}
    grouped: dict[int, list[Reaction]] = {}
    for reaction in db.scalars(select(Reaction).where(Reaction.message_id.in_(message_ids))):
        grouped.setdefault(reaction.message_id, []).append(reaction)
    return grouped


def hide_for_user(db: Session, message_id: int, user_id: int) -> MessageDeletion:
    """'Delete for me' - idempotent."""
    existing = db.get(MessageDeletion, (message_id, user_id))
    if existing is not None:
        return existing
    deletion = MessageDeletion(message_id=message_id, user_id=user_id)
    db.add(deletion)
    db.flush()
    return deletion
