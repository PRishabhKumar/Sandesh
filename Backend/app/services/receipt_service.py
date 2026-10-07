"""Delivery / read receipts - the single place that defines message status.

Status lifecycle (same as Signal):
    sending  -> the browser created it locally, no server ack yet
    sent     -> stored on the server
    delivered-> at least one recipient device received it
    read     -> every recipient has read it (1:1: that one person)

Two rules live here, and they are the ones interviewers ask about:

1. **Group status = lowest common status.** A message in a group is only "read"
   when *all* current members (minus the sender) have read it, and "delivered"
   only when all of them have it. We get that by counting receipt rows rather
   than inspecting each one.

2. **Read receipts are mutual.** A read is only recorded/shown when *both* the
   reader and the message's sender have read receipts enabled (Settings ->
   Privacy). If either has them off, the message stays at "delivered" for the
   sender - exactly what Signal does.
"""

from sqlalchemy.orm import Session

from app.models import ConversationMember, Message, User
from app.repositories import conversation_repository as conversations_repo
from app.repositories import message_repository as messages_repo
from app.services.settings_service import settings_for


def recipient_count(db: Session, conversation_id: int, sender_id: int | None) -> int:
    """How many people a status must aggregate over (everyone active but me)."""
    return len(conversations_repo.recipients_for(db, conversation_id, sender_id))


def compute_statuses(db: Session, messages: list[Message], viewer_id: int) -> dict[int, str]:
    """``{message_id: status}`` for the messages *I* sent."""
    own_messages = [m for m in messages if m.sender_id == viewer_id and m.kind != "system"]
    if not own_messages:
        return {}

    # One query for the counters, one per conversation for the denominator.
    counts = messages_repo.receipt_counts(db, [m.id for m in own_messages])
    totals: dict[int, int] = {
        m.conversation_id: recipient_count(db, m.conversation_id, viewer_id) for m in own_messages
    }

    statuses: dict[int, str] = {}
    for message in own_messages:
        total = totals[message.conversation_id]
        delivered, read = counts.get(message.id, (0, 0))

        if total == 0:  # no other members (e.g. Note to Self)
            statuses[message.id] = "sent"
        elif read >= total:
            statuses[message.id] = "read"
        elif delivered >= total:
            statuses[message.id] = "delivered"
        else:
            statuses[message.id] = "sent"
    return statuses


def mark_delivered(db: Session, user_id: int, message_ids: list[int]) -> list[tuple[int, int]]:
    """Called when a recipient's socket receives messages.

    Returns ``[(message_id, sender_id), ...]`` so the adapter can tell each
    sender "your message was delivered".
    """
    changed = messages_repo.mark_delivered(db, user_id, message_ids)
    if not changed:
        return []

    senders = messages_repo.reply_previews(db, changed)  # id -> Message
    db.commit()
    return [(mid, senders[mid].sender_id) for mid in changed if senders[mid].sender_id]


def mark_read(
    db: Session, reader: User, conversation_id: int, up_to_message_id: int
) -> list[tuple[int, int]]:
    """Mark everything up to ``up_to_message_id`` as read by ``reader``.

    Three separate concerns, deliberately handled in this order:

    1. ``last_read_message_id`` always advances - unread badges depend on it and
       they must work even for people who hide their read receipts.
    2. **Delivery** is never optional: if the reader's screen is showing these
       messages, they have arrived, so ``delivered_at`` is stamped regardless of
       any privacy setting (this is what keeps the sender's double tick honest).
    3. **Read** is optional and mutual: ``read_at`` is only stamped when both the
       reader and the sender have read receipts enabled. Otherwise the message
       stays at "delivered" for the sender.
    """
    membership = conversations_repo.get_membership(db, conversation_id, reader.id)
    if membership is None:
        return []

    if (
        membership.last_read_message_id is None
        or up_to_message_id > membership.last_read_message_id
    ):
        membership.last_read_message_id = up_to_message_id

    # --- 2. delivered (always) -------------------------------------------
    candidate_ids = messages_repo.conversation_message_ids(
        db, reader.id, conversation_id, up_to_message_id
    )
    changed = messages_repo.mark_delivered(db, reader.id, candidate_ids)

    # --- 3. read (only when both sides allow it) --------------------------
    if settings_for(db, reader.id).read_receipts:
        changed += messages_repo.mark_read(db, reader.id, up_to_message_id)

    if not changed:
        db.commit()
        return []

    messages = conversations_repo.messages_by_ids(db, list(dict.fromkeys(changed)))
    notify: list[tuple[int, int]] = []
    for message in messages.values():
        if message.conversation_id != conversation_id or message.sender_id is None:
            continue
        # A "read" tick is only useful if the sender wants receipt information;
        # a "delivered" one is shown to everybody.
        notify.append((message.id, message.sender_id))

    db.commit()
    return notify


def group_status_for_member(db: Session, conversation_id: int, exclude_user_id: int) -> int:
    """Helper used in tests: how many recipients a status aggregates over."""
    return recipient_count(db, conversation_id, exclude_user_id)


def active_member_count(db: Session, conversation_id: int) -> int:
    return len(conversations_repo.active_member_ids(db, conversation_id))


def members_map(db: Session, conversation_id: int) -> dict[int, ConversationMember]:
    return {m.user_id: m for m in conversations_repo.active_members(db, conversation_id)}
