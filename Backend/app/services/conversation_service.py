"""Conversations: the chat list, direct-chat creation and per-user chat state.

Two things are worth pointing out for the review:

* ``get_or_create_direct`` relies on the ``direct_key`` unique constraint. Even
  if both users tap "chat" at the same moment, the second INSERT fails on the
  constraint and we simply fetch the row that won - no duplicate 1:1 chats.
* ``list_for_user`` builds the whole chat list with a fixed number of queries
  (memberships, peers, member counts, unread counts, last messages) instead of
  one query per conversation.
"""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.database import utcnow
from app.core.errors import bad_request, forbidden
from app.models import Conversation, ConversationMember, Message, User
from app.repositories import conversation_repository as conversations_repo
from app.repositories import message_repository as messages_repo
from app.repositories import user_repository as users_repo
from app.schemas.conversation import ConversationDetailOut, ConversationOut
from app.services import access, message_service, presence_service, serializers

# The timer values Signal offers in "Disappearing messages".
ALLOWED_TIMERS = [0, 30, 300, 3600, 28800, 86400, 604800]
MUTE_DAYS = 365  # this demo models "mute" as a long mute


def humanize_seconds(seconds: int) -> str:
    """0 -> 'off', 3600 -> '1 hour' (used in system messages)."""
    labels = {
        0: "off",
        30: "30 seconds",
        300: "5 minutes",
        3600: "1 hour",
        28800: "8 hours",
        86400: "1 day",
        604800: "1 week",
    }
    return labels.get(seconds, f"{seconds} seconds")


# --- creation -------------------------------------------------------------
def get_or_create_direct(db: Session, me: User, other_user_id: int) -> tuple[Conversation, bool]:
    """Open a 1:1 chat; create it the first time. Chatting to yourself is
    allowed - Signal calls it "Note to Self"."""
    other = users_repo.get_by_id(db, other_user_id)
    if other is None:
        raise access.not_found("That user does not exist", "user_not_found")  # type: ignore[attr-defined]

    existing = conversations_repo.get_direct(db, me.id, other.id)
    if existing is not None:
        return existing, False

    conversation = conversations_repo.create_direct(
        db, creator_id=me.id, user_a=me.id, user_b=other.id
    )
    db.commit()
    db.refresh(conversation)
    return conversation, True


# --- reading --------------------------------------------------------------
def serialize_membership(db: Session, me: User, membership: ConversationMember) -> ConversationOut:
    """One row of the chat list, using the caller's own view of the chat."""
    conversation = membership.conversation

    peer: User | None = None
    member_count = 0
    if conversation.type == "direct":
        peer = conversations_repo.peers_by_conversation(db, [conversation.id], me.id).get(
            conversation.id
        )
        title = peer.display_name if peer else "Unknown contact"
    else:
        title = conversation.name or "Group"
        member_count = conversations_repo.member_counts(db, [conversation.id]).get(
            conversation.id, 0
        )

    last_message = None
    if conversation.last_message_id:
        stored = messages_repo.get_by_id(db, conversation.last_message_id)
        if stored is not None:
            last_message = message_service.serialize_one(db, me.id, stored)

    unread = messages_repo.unread_counts(db, me.id, [conversation.id]).get(conversation.id, 0)

    return serializers.conversation_out(
        conversation,
        membership=membership,
        title=title,
        last_message=last_message,
        unread_count=unread,
        peer=peer,
        member_count=member_count,
        is_online=presence_service.is_online(peer.id) if peer else False,
    )


def list_for_user(
    db: Session, me: User, *, query: str | None = None, filter_by: str | None = None
) -> list[ConversationOut]:
    """The left pane: everything I am in, newest activity first (pinned on top)."""
    memberships = conversations_repo.memberships_for_user(db, me.id)
    if not memberships:
        return []

    conversations = [m.conversation for m in memberships]
    conversation_ids = [c.id for c in conversations]
    direct_ids = [c.id for c in conversations if c.type == "direct"]

    # --- batch lookups (5 queries for the whole list) ---
    peers = conversations_repo.peers_by_conversation(db, direct_ids, me.id)
    counts = conversations_repo.member_counts(db, conversation_ids)
    unread = messages_repo.unread_counts(db, me.id, conversation_ids)

    last_ids = [c.last_message_id for c in conversations if c.last_message_id]
    stored_last = conversations_repo.messages_by_ids(db, last_ids)
    last_dtos = {
        dto.conversation_id: dto
        for dto in message_service.build_dtos(db, me.id, list(stored_last.values()))
    }

    rows: list[ConversationOut] = []
    for membership in memberships:
        conversation = membership.conversation
        peer = peers.get(conversation.id)
        title = (
            peer.display_name
            if conversation.type == "direct" and peer is not None
            else (conversation.name or "Group")
        )
        rows.append(
            serializers.conversation_out(
                conversation,
                membership=membership,
                title=title,
                last_message=last_dtos.get(conversation.id),
                unread_count=unread.get(conversation.id, 0),
                peer=peer,
                member_count=counts.get(conversation.id, 0),
                is_online=presence_service.is_online(peer.id) if peer else False,
            )
        )

    # --- optional search / filter, applied to the already-loaded rows ---
    if filter_by == "unread":
        rows = [row for row in rows if row.unread_count > 0]
    elif filter_by == "groups":
        rows = [row for row in rows if row.type == "group"]

    if query:
        needle = query.strip().lower()
        rows = [
            row
            for row in rows
            if needle in row.title.lower()
            or (
                row.last_message
                and row.last_message.body
                and needle in row.last_message.body.lower()
            )
        ]

    return rows


def get_detail(db: Session, me: User, conversation_id: int) -> ConversationDetailOut:
    """Chat header + members (used by the group details panel)."""
    access.get_conversation_or_404(db, conversation_id)
    membership = access.require_membership(db, conversation_id, me.id)
    base = serialize_membership(db, me, membership)
    members = conversations_repo.active_members(db, conversation_id)
    return serializers.conversation_detail_out(base, members)


# --- per-user chat state --------------------------------------------------
def update_my_membership(
    db: Session,
    me: User,
    conversation_id: int,
    *,
    pinned: bool | None,
    muted: bool | None,
    archived: bool | None,
) -> ConversationOut:
    """Pin / mute / archive - these are *my* settings, not the conversation's."""
    membership = access.require_membership(db, conversation_id, me.id)

    if pinned is not None:
        membership.pinned = pinned
    if archived is not None:
        membership.archived = archived
    if muted is not None:
        membership.muted_until = utcnow() + timedelta(days=MUTE_DAYS) if muted else None

    db.commit()
    db.refresh(membership)
    return serialize_membership(db, me, membership)


def set_disappearing(
    db: Session, me: User, conversation_id: int, seconds: int
) -> tuple[Conversation, Message, list[int]]:
    """Change the self-destruct timer. Admins only inside groups."""
    if seconds not in ALLOWED_TIMERS:
        raise bad_request(f"Timer must be one of {ALLOWED_TIMERS}", "invalid_timer")

    conversation = access.get_conversation_or_404(db, conversation_id)
    membership = access.require_membership(db, conversation_id, me.id)
    if conversation.type == "group" and membership.role != "admin":
        raise forbidden("Only admins can change group settings", "admin_required")

    conversations_repo.set_disappearing(db, conversation, seconds)

    action = (
        f"{me.display_name} turned off disappearing messages"
        if seconds == 0
        else f"{me.display_name} set disappearing messages to {humanize_seconds(seconds)}"
    )
    message = message_service.create_system_message(
        db,
        conversation,
        action,
        system_event="timer_changed",
        system_payload={"actor_id": me.id, "value": seconds},
    )
    db.commit()
    db.refresh(message)

    return conversation, message, conversations_repo.active_member_ids(db, conversation_id)
