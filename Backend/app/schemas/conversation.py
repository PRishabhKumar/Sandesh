"""Conversation list / detail responses."""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.message import MessageOut
from app.schemas.user import UserOut


class MemberOut(BaseModel):
    user: UserOut
    role: str  # admin | member
    joined_at: datetime
    last_read_message_id: int | None = None


class ConversationOut(BaseModel):
    """One row of the left pane *and* the payload of the chat header."""

    id: int
    type: str  # direct | group
    title: str  # peer name, or the group name
    avatar_url: str | None = None
    avatar_color: str | None = None
    about: str | None = None  # peer's status line, or the group description

    # direct chats carry the peer; groups carry their member count
    peer: UserOut | None = None
    member_count: int = 0

    last_message: MessageOut | None = None
    last_message_at: datetime | None = None

    unread_count: int = 0
    pinned: bool = False
    muted: bool = False
    archived: bool = False
    role: str | None = None  # my role (groups)

    disappearing_secs: int = 0
    members_can_add: bool = False
    only_admins_can_send: bool = False
    is_online: bool = False  # direct chats: is the peer connected right now?


class ConversationDetailOut(ConversationOut):
    members: list[MemberOut] = []


class DirectConversationIn(BaseModel):
    user_id: int


class MembershipPatchIn(BaseModel):
    """Everything a user can change about *their own* view of a chat."""

    pinned: bool | None = None
    muted: bool | None = None
    archived: bool | None = None


class DisappearingIn(BaseModel):
    disappearing_secs: int  # 0 turns it off


class MarkReadIn(BaseModel):
    up_to_message_id: int
