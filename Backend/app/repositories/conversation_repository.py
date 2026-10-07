"""Database access for conversations and their memberships."""

from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import utcnow
from app.models import Conversation, ConversationMember, Message, User


def get(db: Session, conversation_id: int) -> Conversation | None:
    return db.get(Conversation, conversation_id)


def direct_key_for(user_a: int, user_b: int) -> str:
    """Stable key for a 1:1 chat - same value no matter who opens it first."""
    return f"{min(user_a, user_b)}:{max(user_a, user_b)}"


def get_direct(db: Session, user_a: int, user_b: int) -> Conversation | None:
    return db.scalar(
        select(Conversation).where(Conversation.direct_key == direct_key_for(user_a, user_b))
    )


def create_direct(db: Session, creator_id: int, user_a: int, user_b: int) -> Conversation:
    conversation = Conversation(
        type="direct", direct_key=direct_key_for(user_a, user_b), created_by=creator_id
    )
    db.add(conversation)
    db.flush()
    add_member(db, conversation.id, user_a, role="member")
    add_member(db, conversation.id, user_b, role="member")
    db.flush()
    return conversation


def create_group(
    db: Session,
    *,
    creator_id: int,
    name: str,
    description: str | None = None,
    avatar_color: str | None = None,
    disappearing_secs: int = 0,
) -> Conversation:
    conversation = Conversation(
        type="group",
        name=name,
        description=description,
        avatar_color=avatar_color,
        created_by=creator_id,
        disappearing_secs=disappearing_secs,
    )
    db.add(conversation)
    db.flush()
    add_member(db, conversation.id, creator_id, role="admin")
    db.flush()
    return conversation


# --- membership -----------------------------------------------------------
def get_membership(db: Session, conversation_id: int, user_id: int) -> ConversationMember | None:
    return db.scalar(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )


def add_member(
    db: Session, conversation_id: int, user_id: int, role: str = "member"
) -> ConversationMember:
    """Add a member, or bring back someone who left earlier."""
    membership = get_membership(db, conversation_id, user_id)
    if membership is not None:
        membership.left_at = None
        if role == "admin":
            membership.role = "admin"
        db.flush()
        return membership

    membership = ConversationMember(conversation_id=conversation_id, user_id=user_id, role=role)
    db.add(membership)
    db.flush()
    return membership


def active_members(db: Session, conversation_id: int) -> list[ConversationMember]:
    """Members still in the conversation, with their user row eager-loaded."""
    return list(
        db.scalars(
            select(ConversationMember)
            .options(selectinload(ConversationMember.user))
            .where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.left_at.is_(None),
            )
            .order_by(ConversationMember.role.desc(), ConversationMember.id)
        )
    )


def active_member_ids(db: Session, conversation_id: int) -> list[int]:
    return list(
        db.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.left_at.is_(None),
            )
        )
    )


def recipients_for(db: Session, conversation_id: int, sender_id: int | None) -> list[int]:
    """Everyone who should receive a message written by ``sender_id``."""
    return [uid for uid in active_member_ids(db, conversation_id) if uid != sender_id]


def set_role(db: Session, membership: ConversationMember, role: str) -> ConversationMember:
    membership.role = role
    db.flush()
    return membership


def mark_left(db: Session, membership: ConversationMember) -> ConversationMember:
    """Soft-remove: history and authorship stay intact."""
    membership.left_at = utcnow()
    db.flush()
    return membership


def memberships_for_user(
    db: Session, user_id: int, *, include_archived: bool = False
) -> list[ConversationMember]:
    """My chat list, newest activity first, pinned on top.

    Ordering lives in SQL (one indexed sort) rather than in Python.
    """
    query = (
        select(ConversationMember)
        .join(Conversation, Conversation.id == ConversationMember.conversation_id)
        .options(selectinload(ConversationMember.conversation))
        .where(ConversationMember.user_id == user_id, ConversationMember.left_at.is_(None))
    )
    if not include_archived:
        query = query.where(ConversationMember.archived.is_(False))

    query = query.order_by(
        ConversationMember.pinned.desc(),
        Conversation.last_message_at.is_(None),
        Conversation.last_message_at.desc(),
        Conversation.id.desc(),
    )
    return list(db.scalars(query))


def touch_last_message(db: Session, conversation: Conversation, message: Message) -> None:
    """Keep the denormalised pointer in sync (drives the chat list ordering)."""
    conversation.last_message_id = message.id
    conversation.last_message_at = message.created_at
    db.flush()


def set_disappearing(db: Session, conversation: Conversation, seconds: int) -> Conversation:
    conversation.disappearing_secs = seconds
    db.flush()
    return conversation


def messages_by_ids(db: Session, message_ids: list[int]) -> dict[int, Message]:
    if not message_ids:
        return {}
    rows = db.scalars(select(Message).where(Message.id.in_(message_ids)))
    return {row.id: row for row in rows}


def last_read_marks(db: Session, conversation_id: int) -> dict[int, datetime | None]:
    """Used by the "seen by" style aggregations if ever needed."""
    rows = db.execute(
        select(ConversationMember.user_id, ConversationMember.last_read_message_id).where(
            ConversationMember.conversation_id == conversation_id
        )
    ).all()
    return dict(rows)


def shared_conversation_ids(db: Session, user_a: int, user_b: int) -> list[int]:
    """Conversations two users are both active in (used for presence fan-out)."""
    a = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_a, ConversationMember.left_at.is_(None)
    )
    b = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_b, ConversationMember.left_at.is_(None)
    )
    return list(
        db.scalars(
            select(a.subquery().c.conversation_id).where(
                a.subquery().c.conversation_id == b.subquery().c.conversation_id
            )
        )
    )


def peers_of_user(db: Session, user_id: int) -> list[int]:
    """Everyone who shares an active conversation with this user."""
    my_conversations = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_id, ConversationMember.left_at.is_(None)
    )
    peers = db.scalars(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id.in_(my_conversations),
            ConversationMember.user_id != user_id,
            ConversationMember.left_at.is_(None),
        )
    )
    return list(set(peers))


def active_membership_filter(conversation_id: int, user_id: int):
    """Reusable SQL condition: 'this user is an active member'."""
    return and_(
        ConversationMember.conversation_id == conversation_id,
        ConversationMember.user_id == user_id,
        ConversationMember.left_at.is_(None),
    )


def peers_by_conversation(db: Session, conversation_ids: list[int], me_id: int) -> dict[int, User]:
    """For direct chats: ``{conversation_id: the other person}`` in one query."""
    if not conversation_ids:
        return {}
    rows = db.execute(
        select(ConversationMember.conversation_id, User)
        .join(User, User.id == ConversationMember.user_id)
        .where(
            ConversationMember.conversation_id.in_(conversation_ids),
            ConversationMember.user_id != me_id,
            ConversationMember.left_at.is_(None),
        )
    ).all()
    return dict(rows)


def member_counts(db: Session, conversation_ids: list[int]) -> dict[int, int]:
    """``{conversation_id: active member count}`` in one query."""
    if not conversation_ids:
        return {}
    rows = db.execute(
        select(ConversationMember.conversation_id, func.count(ConversationMember.id))
        .where(
            ConversationMember.conversation_id.in_(conversation_ids),
            ConversationMember.left_at.is_(None),
        )
        .group_by(ConversationMember.conversation_id)
    ).all()
    return dict(rows)
