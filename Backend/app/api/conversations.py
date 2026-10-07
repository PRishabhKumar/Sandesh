"""Chat list, history and per-user chat settings: /conversations/*

The send + read endpoints exist over REST as well as WebSocket. They call the
same services and emit the same events, so the two transports stay identical in
behaviour (useful for testing with curl and for clients that cannot use WS).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.repositories import conversation_repository as conversations_repo
from app.schemas.conversation import (
    ConversationDetailOut,
    ConversationOut,
    DirectConversationIn,
    DisappearingIn,
    MarkReadIn,
    MembershipPatchIn,
)
from app.schemas.message import MessageOut, MessagePageOut, SendMessageIn
from app.services import conversation_service, message_service, receipt_service
from app.ws import events

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    q: str | None = Query(default=None, max_length=80, description="Search chats + previews"),
    filter: str | None = Query(default=None, pattern="^(all|unread|groups)$"),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> list[ConversationOut]:
    """The left pane, ordered by most recent activity (pinned first)."""
    return conversation_service.list_for_user(
        db, me, query=q, filter_by=None if filter in (None, "all") else filter
    )


@router.get("/{conversation_id}", response_model=ConversationDetailOut)
def get_conversation(
    conversation_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)
) -> ConversationDetailOut:
    """Chat header + member list (group details panel)."""
    return conversation_service.get_detail(db, me, conversation_id)


@router.post("/direct", response_model=ConversationOut, status_code=201)
def open_direct_conversation(
    payload: DirectConversationIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> ConversationOut:
    """Get-or-create a 1:1 chat with somebody."""
    conversation, _created = conversation_service.get_or_create_direct(db, me, payload.user_id)
    membership = conversations_repo.get_membership(db, conversation.id, me.id)
    return conversation_service.serialize_membership(db, me, membership)


@router.patch("/{conversation_id}/me", response_model=ConversationOut)
def patch_my_membership(
    conversation_id: int,
    payload: MembershipPatchIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> ConversationOut:
    """Pin / mute / archive - my own view of the chat."""
    return conversation_service.update_my_membership(
        db,
        me,
        conversation_id,
        pinned=payload.pinned,
        muted=payload.muted,
        archived=payload.archived,
    )


@router.patch("/{conversation_id}/disappearing", response_model=ConversationOut)
async def set_disappearing(
    conversation_id: int,
    payload: DisappearingIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> ConversationOut:
    """Set (or turn off) the self-destruct timer for this chat."""
    conversation, system_message, member_ids = conversation_service.set_disappearing(
        db, me, conversation_id, payload.disappearing_secs
    )
    dto = message_service.serialize_one(db, me.id, system_message)
    await events.broadcast_group_event(conversation_id, "timer_changed", dto, member_ids)

    membership = conversations_repo.get_membership(db, conversation_id, me.id)
    return conversation_service.serialize_membership(db, me, membership)


@router.post("/{conversation_id}/read", status_code=204)
async def mark_conversation_read(
    conversation_id: int,
    payload: MarkReadIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> None:
    """Everything up to a message id counts as read (also clears the badge)."""
    changed = receipt_service.mark_read(db, me, conversation_id, payload.up_to_message_id)
    await events.emit_status_updates(db, changed)
    await events.broadcast_conversation_updates(
        conversation_id, conversations_repo.active_member_ids(db, conversation_id)
    )


@router.get("/{conversation_id}/messages", response_model=MessagePageOut)
def list_messages(
    conversation_id: int,
    before: int | None = Query(default=None, description="Cursor: older than this message id"),
    after: int | None = Query(default=None, description="Re-sync: newer than this message id"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> MessagePageOut:
    """Cursor-paginated history (no OFFSET - the index does the work)."""
    return message_service.get_history(
        db, me, conversation_id, before=before, after=after, limit=limit
    )


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def send_message_rest(
    conversation_id: int,
    payload: SendMessageIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> MessageOut:
    """REST fallback for sending (the UI uses the socket; this keeps the API
    complete and is handy for `curl` demos).

    Idempotent on ``client_id``: retrying with the same id returns the message
    that already exists instead of creating a duplicate.
    """
    message, recipients, _conversation = message_service.send(
        db,
        me,
        conversation_id,
        payload.body,
        client_id=payload.client_id,
        reply_to_id=payload.reply_to_id,
    )
    dto = message_service.serialize_one(db, me.id, message)
    await events.broadcast_new_message(db, me.id, dto, recipients)
    await events.broadcast_conversation_updates(
        conversation_id, conversations_repo.active_member_ids(db, conversation_id)
    )
    return dto
