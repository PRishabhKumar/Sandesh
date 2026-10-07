"""Group routes: /groups/*

The permission matrix (TRD section 7) is enforced in ``group_service``; these
routes are thin adapters that translate the outcome into WebSocket events.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.repositories import conversation_repository as conversations_repo
from app.schemas.conversation import ConversationDetailOut
from app.schemas.group import GroupCreateIn, GroupUpdateIn, MemberRoleIn, MembersAddIn
from app.services import conversation_service, group_service, message_service
from app.ws import events

router = APIRouter(prefix="/groups", tags=["groups"])


@router.post("", response_model=ConversationDetailOut, status_code=201)
async def create_group(
    payload: GroupCreateIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> ConversationDetailOut:
    """Create a group; the creator becomes its first admin."""
    conversation, system_message, member_ids = group_service.create(db, me, payload)
    dto = message_service.serialize_one(db, me.id, system_message)
    await events.broadcast_group_event(conversation.id, "group_created", dto, member_ids)
    return conversation_service.get_detail(db, me, conversation.id)


@router.patch("/{conversation_id}", response_model=ConversationDetailOut)
async def update_group(
    conversation_id: int,
    payload: GroupUpdateIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> ConversationDetailOut:
    """Admin-only: name, description, permissions."""
    conversation, system_message, member_ids = group_service.update_info(
        db, me, conversation_id, payload
    )
    dto = message_service.serialize_one(db, me.id, system_message) if system_message else None
    await events.broadcast_group_event(conversation_id, "group_updated", dto, member_ids)
    return conversation_service.get_detail(db, me, conversation_id)


@router.post("/{conversation_id}/members", response_model=ConversationDetailOut)
async def add_members(
    conversation_id: int,
    payload: MembersAddIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> ConversationDetailOut:
    """Add people (admins always, members when ``members_can_add``)."""
    conversation, system_message, member_ids, added_ids = group_service.add_members(
        db, me, conversation_id, payload.user_ids
    )
    dto = message_service.serialize_one(db, me.id, system_message) if system_message else None

    # Existing members get the update; new members also need the conversation
    # itself pushed, otherwise it would appear only after a manual refresh.
    await events.broadcast_group_event(conversation_id, "member_added", dto, member_ids)
    await events.broadcast_conversation_updates(conversation_id, added_ids)

    return conversation_service.get_detail(db, me, conversation_id)


@router.delete("/{conversation_id}/members/{user_id}", status_code=204)
async def remove_member(
    conversation_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> None:
    """Leaving is done by removing *yourself*; removing anybody else needs admin."""
    if user_id == me.id:
        conversation, system_message, member_ids = group_service.leave(db, me, conversation_id)
        dto = message_service.serialize_one(db, me.id, system_message)
        await events.broadcast_group_event(conversation_id, "member_left", dto, member_ids)
        return

    conversation, system_message, member_ids, _target = group_service.remove_member(
        db, me, conversation_id, user_id
    )
    dto = message_service.serialize_one(db, me.id, system_message)
    await events.broadcast_group_event(conversation_id, "member_removed", dto, member_ids)
    # Tell the removed member so their UI can react immediately.
    await events.send_to_users(
        [user_id],
        events.envelope(
            "removed.from_group",
            {"conversation_id": conversation_id, "conversation_name": conversation.name},
        ),
    )


@router.patch("/{conversation_id}/members/{user_id}", response_model=ConversationDetailOut)
async def set_member_role(
    conversation_id: int,
    user_id: int,
    payload: MemberRoleIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> ConversationDetailOut:
    """Promote / demote an admin (admins only; the last admin cannot step down)."""
    conversation, system_message, member_ids = group_service.set_member_role(
        db, me, conversation_id, user_id, payload.role
    )
    dto = message_service.serialize_one(db, me.id, system_message) if system_message else None
    await events.broadcast_group_event(conversation_id, "role_changed", dto, member_ids)
    return conversation_service.get_detail(db, me, conversation_id)


@router.get("/{conversation_id}/members", response_model=ConversationDetailOut)
def list_group_members(
    conversation_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)
) -> ConversationDetailOut:
    """Members with their roles (used by the group details panel)."""
    _ = conversations_repo.active_member_ids(db, conversation_id)  # membership check below
    return conversation_service.get_detail(db, me, conversation_id)


@router.get("/{conversation_id}", response_model=ConversationDetailOut)
def read_group(
    conversation_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)
) -> ConversationDetailOut:
    """Group details - the same payload as ``GET /conversations/{id}``, kept here
    so the group endpoints read naturally."""
    return conversation_service.get_detail(db, me, conversation_id)
