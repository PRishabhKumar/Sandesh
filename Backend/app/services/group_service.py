"""Groups: creation, membership changes and admin rules.

Every membership change follows the same four steps:

    1. check the permission (``access.require_admin`` / membership rule)  -> 403
    2. change the rows (soft-remove with ``left_at`` so history survives)
    3. write a **system message** so the change is visible in the timeline
    4. return the ids to broadcast so every open client updates live

Authorization always happens here, never in the UI. The frontend hides buttons,
but the 403 is the real guard (and the QA script checks exactly that).
"""

from sqlalchemy.orm import Session

from app.core.errors import bad_request, forbidden
from app.models import Conversation, Message, User
from app.repositories import conversation_repository as conversations_repo
from app.repositories import user_repository as users_repo
from app.schemas.group import GroupCreateIn, GroupUpdateIn
from app.services import access, message_service


def _system(
    db: Session, conversation: Conversation, body: str, event: str, payload: dict
) -> Message:
    return message_service.create_system_message(
        db, conversation, body=body, system_event=event, system_payload=payload
    )


def _role_changed_body(me: User, target: User | None, role: str) -> str:
    """System-message copy for a role change ("X made Y an admin")."""
    who = target.display_name if target else "a member"
    if role == "admin":
        return f"{me.display_name} made {who} an admin"
    return f"{me.display_name} removed {who} as admin"


def _names(users: list[User]) -> str:
    names = [user.display_name for user in users]
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + f" and {names[-1]}"


def create(
    db: Session, creator: User, payload: GroupCreateIn
) -> tuple[Conversation, Message, list[int]]:
    """Create the group; the creator is always the first admin."""
    name = payload.name.strip()
    if not name:
        raise bad_request("Give the group a name", "empty_group_name")

    member_ids = [uid for uid in dict.fromkeys(payload.member_ids) if uid != creator.id]
    members = [users_repo.get_by_id(db, uid) for uid in member_ids]
    if any(member is None for member in members):
        raise bad_request("One of the selected members does not exist", "unknown_member")

    conversation = conversations_repo.create_group(
        db,
        creator_id=creator.id,
        name=name,
        description=payload.description,
        avatar_color=payload.avatar_color,
        disappearing_secs=payload.disappearing_secs,
    )
    for user_id in member_ids:
        conversations_repo.add_member(db, conversation.id, user_id, role="member")

    message = _system(
        db,
        conversation,
        f"{creator.display_name} created the group",
        "group_created",
        {"actor_id": creator.id, "target_ids": member_ids},
    )
    db.commit()
    db.refresh(conversation)
    db.refresh(message)

    return conversation, message, conversations_repo.active_member_ids(db, conversation.id)


def update_info(
    db: Session, me: User, conversation_id: int, payload: GroupUpdateIn
) -> tuple[Conversation, Message | None, list[int]]:
    """Admin-only edits to the group name, description and permissions."""
    conversation = access.require_group(db, conversation_id)
    access.require_admin(db, conversation_id, me.id)

    system_message: Message | None = None

    if payload.name is not None and payload.name.strip() != (conversation.name or ""):
        new_name = payload.name.strip()
        conversation.name = new_name
        system_message = _system(
            db,
            conversation,
            f"{me.display_name} changed the group name to {new_name}",
            "name_changed",
            {"actor_id": me.id, "value": new_name},
        )

    if payload.description is not None:
        conversation.description = payload.description.strip() or None
    if payload.avatar_color is not None:
        conversation.avatar_color = payload.avatar_color
    if payload.members_can_add is not None:
        conversation.members_can_add = payload.members_can_add
    if payload.only_admins_can_send is not None:
        conversation.only_admins_can_send = payload.only_admins_can_send

    db.commit()
    db.refresh(conversation)
    if system_message is not None:
        db.refresh(system_message)

    return conversation, system_message, conversations_repo.active_member_ids(db, conversation_id)


def add_members(
    db: Session, me: User, conversation_id: int, user_ids: list[int]
) -> tuple[Conversation, Message | None, list[int], list[int]]:
    """Add people. Admins may always add; members only when ``members_can_add``.

    Returns ``(conversation, system_message, all_member_ids, added_ids)`` - the
    new members need the conversation pushed to them, everybody else just needs
    the refreshed list.
    """
    conversation = access.require_group(db, conversation_id)
    membership = access.require_membership(db, conversation_id, me.id)

    if membership.role != "admin" and not conversation.members_can_add:
        raise forbidden("Only admins can add members to this group", "admin_required")

    existing_ids = set(conversations_repo.active_member_ids(db, conversation_id))
    to_add = [uid for uid in dict.fromkeys(user_ids) if uid not in existing_ids]
    if not to_add:
        raise bad_request("Those people are already in the group", "already_member")

    added: list[User] = []
    for user_id in to_add:
        user = users_repo.get_by_id(db, user_id)
        if user is None:
            raise bad_request(f"User {user_id} does not exist", "unknown_member")
        conversations_repo.add_member(db, conversation_id, user_id, role="member")
        added.append(user)

    system_message = _system(
        db,
        conversation,
        f"{me.display_name} added {_names(added)}",
        "member_added",
        {"actor_id": me.id, "target_ids": to_add},
    )
    db.commit()

    return (
        conversation,
        system_message,
        conversations_repo.active_member_ids(db, conversation_id),
        to_add,
    )


def remove_member(
    db: Session, me: User, conversation_id: int, user_id: int
) -> tuple[Conversation, Message, list[int], User]:
    """Admin-only removal (soft delete: the member keeps contributing history)."""
    conversation = access.require_group(db, conversation_id)
    access.require_admin(db, conversation_id, me.id)

    if user_id == me.id:
        raise bad_request("Use 'Leave group' to remove yourself", "use_leave")

    target_membership = conversations_repo.get_membership(db, conversation_id, user_id)
    if target_membership is None or target_membership.left_at is not None:
        raise bad_request("That person is not in this group", "not_a_member")

    target = users_repo.get_by_id(db, user_id)
    conversations_repo.mark_left(db, target_membership)

    system_message = _system(
        db,
        conversation,
        f"{me.display_name} removed {(target.display_name if target else 'a member')}",
        "member_removed",
        {"actor_id": me.id, "target_ids": [user_id]},
    )
    db.commit()

    return (
        conversation,
        system_message,
        conversations_repo.active_member_ids(db, conversation_id),
        target,
    )


def set_member_role(
    db: Session, me: User, conversation_id: int, user_id: int, role: str
) -> tuple[Conversation, Message | None, list[int]]:
    """Promote / demote. The last admin can never demote themselves - otherwise
    nobody could manage the group any more."""
    if role not in ("admin", "member"):
        raise bad_request("Role must be 'admin' or 'member'", "invalid_role")

    conversation = access.require_group(db, conversation_id)
    access.require_admin(db, conversation_id, me.id)

    target_membership = access.require_membership(db, conversation_id, user_id)

    if role == "member" and target_membership.role == "admin":
        admins = [
            m for m in conversations_repo.active_members(db, conversation_id) if m.role == "admin"
        ]
        if len(admins) == 1:
            raise bad_request("Promote someone else before stepping down", "last_admin")

    conversations_repo.set_role(db, target_membership, role)
    target = users_repo.get_by_id(db, user_id)

    system_message = _system(
        db,
        conversation,
        _role_changed_body(me, target, role),
        "role_changed",
        {"actor_id": me.id, "target_ids": [user_id], "value": role},
    )
    db.commit()

    return conversation, system_message, conversations_repo.active_member_ids(db, conversation_id)


def leave(db: Session, me: User, conversation_id: int) -> tuple[Conversation, Message, list[int]]:
    """Leaving is open to everyone. If the last admin leaves, the oldest
    remaining member is promoted so the group keeps an owner."""
    conversation = access.require_group(db, conversation_id)
    membership = access.require_membership(db, conversation_id, me.id)

    others = [
        m for m in conversations_repo.active_members(db, conversation_id) if m.user_id != me.id
    ]
    if membership.role == "admin":
        other_admins = [m for m in others if m.role == "admin"]
        if not other_admins and others:
            conversations_repo.set_role(db, others[0], "admin")

    conversations_repo.mark_left(db, membership)

    system_message = _system(
        db,
        conversation,
        f"{me.display_name} left the group",
        "member_left",
        {"actor_id": me.id, "target_ids": []},
    )
    db.commit()

    return conversation, system_message, conversations_repo.active_member_ids(db, conversation_id)
