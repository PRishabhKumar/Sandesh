"""Conversations (direct 1:1 chats and groups) and their membership rows.

Key design points
-----------------
* ``direct_key`` = ``"{min_id}:{max_id}"`` for 1:1 chats. A unique constraint on
  it makes "get or create a direct chat" race-free: two users opening a chat at
  the same moment can never produce two conversations.
* Membership is a table (not a column) because a member has state of their own:
  role, ``last_read_message_id`` (unread counting), pinned / muted / archived.
* ``last_message_at`` is denormalised onto the conversation so the chat list can
  be ordered by a single indexed column instead of a per-row subquery.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, utcnow


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("type IN ('direct', 'group')", name="ck_conversations_type"),
        Index("ix_conversations_last_message_at", "last_message_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # direct | group
    direct_key: Mapped[str | None] = mapped_column(
        String(40), unique=True
    )  # "3:7" for direct chats

    # group-only fields
    name: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(String(255))
    avatar_color: Mapped[str | None] = mapped_column(
        String(9)
    )  # fallback colour for the group avatar

    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    # disappearing messages: seconds after which a message is deleted (0 = off)
    disappearing_secs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # group permissions
    members_can_add: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    only_admins_can_send: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # denormalised pointers to the newest message (drives the chat list)
    last_message_id: Mapped[int | None] = mapped_column(Integer)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    members: Mapped[list["ConversationMember"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_members_conversation_user"),
        CheckConstraint("role IN ('admin', 'member')", name="ck_members_role"),
        # "give me my chat list" lookup
        Index("ix_members_user_archived_pinned", "user_id", "archived", "pinned"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(10), default="member", nullable=False
    )  # admin | member
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    # Soft remove: keeping the row preserves history and lets us show
    # "You left"/"X was removed" without losing the message author.
    left_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Source of truth for unread counts: messages newer than this id, not sent by me.
    last_read_message_id: Mapped[int | None] = mapped_column(Integer)

    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    muted_until: Mapped[datetime | None] = mapped_column(DateTime)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    conversation: Mapped[Conversation] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()  # noqa: F821

    @property
    def is_active(self) -> bool:
        return self.left_at is None
