"""Message-shaped responses (the DTO the frontend actually renders)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    emoji: str
    user_id: int


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_name: str
    mime_type: str
    size_bytes: int
    url: str  # ready-to-use URL for <img src=...>


class ReplyPreviewOut(BaseModel):
    """The small "you replied to..." block inside a bubble."""

    id: int
    sender_id: int | None = None
    sender_name: str | None = None
    body: str | None = None


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int | None = None
    sender_name: str | None = None
    client_id: str | None = None
    kind: str  # text | attachment | system
    body: str | None = None
    system_event: str | None = None
    system_payload: dict | None = None

    reply_to: ReplyPreviewOut | None = None
    reactions: list[ReactionOut] = []
    attachments: list[AttachmentOut] = []

    # sending | sent | delivered | read  (computed, never stored)
    status: str = "sent"

    created_at: datetime
    edited_at: datetime | None = None
    deleted_at: datetime | None = None
    expires_at: datetime | None = None


class MessagePageOut(BaseModel):
    """One page of history. ``next_cursor`` = pass it as ``before=`` for older."""

    messages: list[MessageOut]  # oldest -> newest
    next_cursor: int | None = None
    has_more: bool = False


class SendMessageIn(BaseModel):
    body: str
    client_id: str | None = None
    reply_to_id: int | None = None


class ReactionIn(BaseModel):
    """``emoji=null`` removes the reaction."""

    emoji: str | None = None
