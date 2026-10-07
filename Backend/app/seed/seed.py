"""Idempotent demo seed.

Runs automatically on boot when ``SEED_ON_BOOT=true`` and the ``users`` table is
empty, or manually with::

    python -m app.seed.seed

It creates:
* 8 users (two documented demo logins below)
* contacts between everybody
* 7 direct chats + 2 groups (Aarav, the main demo login, is in six of them)
* 180+ messages spread over the last week, with realistic delivered/read
  states, replies, reactions, a pinned chat, a muted group and a block

Demo logins - any phone below, code ``123456``:
    +91 90000 00001  -> Aarav Sharma (has unread chats)
    +91 90000 00002  -> Meera Iyer
"""

import logging
import random
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, utcnow
from app.models import (
    Contact,
    Conversation,
    ConversationMember,
    Message,
    MessageReceipt,
    Reaction,
    User,
    UserSettings,
)

logger = logging.getLogger("app.seed")

RNG = random.Random(42)  # deterministic demo data

DEMO_USERS = [
    {
        "phone": "+919000000001",
        "username": "aarav",
        "name": "Aarav Sharma",
        "about": "Speak Freely",
        "color": "#E3F2FD",
    },
    {
        "phone": "+919000000002",
        "username": "meera",
        "name": "Meera Iyer",
        "about": "Building things quietly",
        "color": "#F3E5F5",
    },
    {
        "phone": "+919000000003",
        "username": "rohan",
        "name": "Rohan Verma",
        "about": "Weekend trekker",
        "color": "#E8F5E9",
    },
    {
        "phone": "+919000000004",
        "username": "ananya",
        "name": "Ananya Rao",
        "about": "Coffee first",
        "color": "#FFF3E0",
    },
    {
        "phone": "+919000000005",
        "username": "kabir",
        "name": "Kabir Nair",
        "about": "On a bike somewhere",
        "color": "#FCE4EC",
    },
    {
        "phone": "+919000000006",
        "username": "priya",
        "name": "Priya Menon",
        "about": "Reading, mostly",
        "color": "#E0F7FA",
    },
    {
        "phone": "+919000000007",
        "username": "dev",
        "name": "Dev Patel",
        "about": "Shippin' it",
        "color": "#EDE7F6",
    },
    {
        "phone": "+919000000008",
        "username": "sara",
        "name": "Sara Khan",
        "about": "Available",
        "color": "#FFFDE7",
    },
]

# --- conversation scripts: (sender index, text[, index of the message it replies to]) ---
DIRECT_SCRIPTS = {
    (0, 1): [  # Aarav <-> Meera (ends with messages Aarav has not read yet)
        (0, "Hey Meera! Are we still on for the trek this weekend?"),
        (1, "Yes! I booked the cab for 5:30 am, hope that's okay 🙂"),
        (0, "Perfect. I'll bring the snacks and the first-aid kit."),
        (1, "Take the good thermos too, it's going to be cold up there."),
        (0, "Noted. Did Rohan confirm?"),
        (1, "He's in. He's bringing two friends."),
        (0, "Great, more the merrier. Sharing the trail map now."),
        (1, "Got it. This looks like a solid route: https://example.com/trail-map"),
        (0, "Yeah the last stretch is steep but short."),
        (1, "I'll pack extra water then."),
        (0, "Also, sunrise is at 6:04 am, so we'll catch it from the ridge."),
        (1, "That's the whole reason I'm coming, honestly."),
        (0, "Ha! Then don't forget your camera."),
        (1, "Charged and packed already."),
        (0, "Deal. See you Saturday!"),
        (1, "By the way, did you see the new Signal release notes?"),
        (1, "They finally shipped the thing we talked about."),
        (1, "Ping me when you're free, I want your take on it."),
        (0, "Just read them. The queue handling is the interesting part."),
        (0, "It means the socket can drop without losing anything.", 18),
        (1, "Exactly. That's the bit I wanted your take on."),
        (1, "We do something cruder on our side, a queue per client."),
        (0, "Same idea really. Ours just retries with a backoff.", 19),
        (1, "Do you keep the messages in the browser as well?"),
        (0, "Only until they are acknowledged, then the server is the truth."),
        (1, "Clean. I'll steal that."),
        (0, "Steal away. Better than the reverse."),
        (1, "Ha. Switching topics - who's driving on Saturday?"),
        (0, "You are, if you don't mind. I'll navigate."),
        (1, "Fine, but you're on playlist duty."),
        (0, "Deal. Adding three hours of questionable music now."),
        (1, "Expected nothing less."),
        (0, "Also I ordered the trail snacks, arriving tomorrow."),
        (1, "How many? We're five now."),
        (0, "Twelve bars, two packs of dates, and the salted nuts you like."),
        (1, "Perfect. I'll bring fruit."),
        (0, "Anything I should pick up from the pharmacy?"),
        (1, "Just blister plasters. I still have the painkillers."),
        (0, "Adding it to the list."),
        (1, "And please bring the good thermos, not the leaky one."),
        (0, "It was one time."),
        (1, "It was my rucksack."),
        (0, "Fair. Good thermos it is."),
        (1, "Thank you."),
        (0, "Sunrise at 6:04, remember. So we're walking by half past five."),
        (1, "I'll be there at five fifteen with coffee."),
        (0, "You're a good person."),
        (1, "Don't tell anyone."),
        (0, "Your secret is safe with this chat."),
        (1, "Sending the cab number in the morning."),
        (1, "Also Rohan wants to know if he can bring a friend."),
        (1, "Any objection? He asked twice."),
    ],
    (1, 2): [  # Meera <-> Rohan
        (2, "Meera, can you review the deck before tomorrow?"),
        (1, "Sure, send it over."),
        (2, "Sent. It's the same one from last week plus the pricing slide."),
        (1, "The pricing slide is much clearer now."),
        (2, "That was Ananya's suggestion 🙂"),
        (1, "Left two comments on slides 4 and 7."),
        (2, "On it. Thanks!"),
        (1, "No rush, tomorrow morning is fine."),
        (2, "Morning works. I'll fold in the comments before the call."),
        (1, "Also mention the two-week rollout, the client asked about that twice."),
        (2, "Good catch, adding it now."),
        (1, "The narrative is strong otherwise."),
        (2, "Means a lot, thank you."),
        (1, "Go get some sleep."),
        (2, "You too. Night!"),
        (1, "Night."),
        (2, "Also - I'll bring the printed deck tomorrow."),
        (2, "Thanks again for turning it around so fast."),
    ],
    (0, 3): [  # Aarav <-> Kabir
        (3, "Bhai, are you in Chennai this week?"),
        (0, "Yes, until Friday."),
        (3, "Let's grab dinner. That place near the beach?"),
        (0, "Thursday works."),
        (3, "Done. 8 pm."),
        (0, "Bringing the trek photos."),
        (3, "Haha, the ones where I fell?"),
        (0, "All eleven of them. I made a slideshow."),
        (3, "I'm not coming."),
        (0, "You're coming."),
        (3, "Fine. But I'm choosing the dessert."),
        (0, "Deal."),
        (3, "Also the new exhaust is on, you'll hear me coming."),
        (0, "The whole neighbourhood will."),
        (3, "Exactly the point."),
    ],
    (3, 4): [  # Ananya <-> Kabir
        (4, "Kabir, did you take the bike to work again?"),
        (3, "Obviously. Parking is a nightmare otherwise."),
        (4, "Come pick me up someday, I want to see the new exhaust."),
        (3, "Saturday?"),
        (4, "Saturday is the trek."),
        (3, "Right. Sunday then."),
        (4, "Sunday is the deploy."),
        (3, "Monday?"),
        (4, "Monday I'm in Bangalore."),
        (3, "We're not very good at this."),
        (4, "Ha! Next week, I promise."),
        (3, "I'll hold you to it."),
    ],
    (0, 5): [  # Aarav <-> Priya (Aarav sent the last two: shows delivered, not read)
        (0, "Priya, did you get the reading list I sent?"),
        (5, "Yes! Already two books in."),
        (0, "Fast. Which one are you on?"),
        (5, "The one about queueing theory. Dense but worth it."),
        (0, "Chapter 4 is the good one."),
        (5, "Noted, saving it for the weekend."),
        (0, "Any book you'd add for the group?"),
        (5, "Something lighter, honestly. We need a break."),
        (0, "Agreed, pick one and I'll order a few copies."),
        (5, "I'll decide by Friday."),
        (0, "Perfect."),
        (0, "Also sending the trek photos this evening."),
        (0, "There's one where you're mid-sentence that is genuinely great."),
    ],
    (0, 7): [  # Aarav <-> Sara
        (7, "Hi! Ananya said you'd help with the venue booking?"),
        (0, "Happy to. Which weekend?"),
        (7, "The 22nd, if it's still free."),
        (0, "It is. I'll hold it until Thursday."),
        (7, "Do they allow outside food?"),
        (0, "Yes, but there's a small fee."),
        (7, "Fine by me. I'll send the guest list tomorrow."),
        (0, "Thirty guests is comfortable in that room."),
        (7, "Thirty two, but two are maybe's."),
        (0, "Then it fits."),
    ],
    (2, 4): [  # Rohan <-> Ananya
        (4, "The staging deploy is green."),
        (2, "Nice. Did the migration run?"),
        (4, "Ran clean, no downtime."),
        (2, "Great work. Let's ship it Monday."),
        (4, "I'll write the release notes today."),
        (2, "Include the API changes, Dev asked."),
        (4, "Already on it. Two endpoints changed shape."),
        (2, "Then let's give people a week's notice."),
        (4, "Agreed. Deprecation notice goes out Friday."),
        (2, "Perfect."),
    ],
}

# When each thread happened: (how long ago its newest message is, in hours,
# average minutes between messages). Keeping the *newest* message pinned and
# laying the history backwards is what makes the chat list look alive.
DIRECT_TIMING = {
    (0, 1): (0, 42),  # Aarav <-> Meera: busy right now, long history to page
    (0, 3): (5, 95),
    (0, 5): (26, 130),
    (0, 7): (70, 460),
    (1, 2): (19, 80),
    (2, 4): (46, 110),
    (3, 4): (50, 120),
}
DEFAULT_DIRECT_TIMING = (36, 120)  # used if a script has no entry above
GROUP_TIMING = {"Weekend Trek": (28, 150), "Project Falcon": (31, 170)}

GROUPS = [
    {
        "name": "Weekend Trek",
        "description": "Trail plans, gear lists and photos.",
        "creator": 0,  # Aarav is admin
        "members": [1, 4, 5, 2],  # Meera, Kabir, Priya, Rohan
        "script": [
            (0, "Welcome everyone! This group is for the trek logistics."),
            (1, "Thanks for setting it up."),
            (4, "Is the trail safe for beginners?"),
            (0, "Yes, the first 6 km are easy. We can turn back any time."),
            (5, "I'll bring two extra torches."),
            (2, "What time are we starting?"),
            (0, "5:30 am from the usual spot."),
            (4, "That's ambitious 😅"),
            (1, "Coffee is on me."),
            (5, "Adding the packing list here: https://example.com/packing-list"),
            (2, "Noted."),
            (4, "Do we need proper boots or are running shoes fine?"),
            (0, "Boots. The last stretch is loose gravel."),
            (2, "My shoes have seen worse."),
            (1, "Famous last words."),
            (5, "I have a spare pair of size 9 boots if anyone needs them."),
            (4, "That's me! Thank you."),
            (0, "Weather looks clear for Saturday."),
            (2, "Perfect. Bringing the drone."),
            (1, "Please don't fly it near the eagles."),
            (2, "Noted, keeping it low."),
            (0, "Right, that's everything. See you all at 5:30."),
            (5, "Bringing the spare boots for Ananya."),
            (4, "Life saver. See you Saturday!"),
        ],
    },
    {
        "name": "Project Falcon",
        "description": "Delivery squad for the Falcon release.",
        "creator": 1,  # Meera is admin
        "members": [0, 2, 3, 6],  # Aarav, Rohan, Ananya, Dev
        "script": [
            (1, "Sprint starts today, scope is frozen."),
            (6, "Backend contracts are done, docs updated."),
            (0, "Design tokens are in, working on the chat pane."),
            (3, "Can we get the API schema before Friday?"),
            (6, "Yes, publishing it today."),
            (2, "Frontend build is green on staging."),
            (1, "Good. Let's do a dry run on Monday."),
            (0, "I'll prepare the demo script."),
            (3, "Please include the group admin flow, it's the risky one."),
            (0, "Adding it right after the receipts demo."),
            (6, "Receipts are the part people ask about, worth showing twice."),
            (2, "Agreed. The two-window demo sells it."),
            (1, "Keep it under ten minutes."),
            (3, "Do we have a fallback if the socket drops during the demo?"),
            (6, "Yes, it reconnects and re-syncs automatically."),
            (0, "I'll also keep the seeded data ready."),
            (2, "Seeded data is a good idea for the reviewers."),
            (1, "Great. Anything blocked?"),
            (0, "Nothing on my side."),
            (6, "All clear."),
        ],
    },
]


def _add_message(
    db: Session,
    conversation: Conversation,
    *,
    sender: User | None,
    body: str,
    created_at,
    kind: str = "text",
    system_event: str | None = None,
    system_payload: str | None = None,
    reply_to: Message | None = None,
) -> Message:
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender.id if sender else None,
        client_id=f"seed-{conversation.id}-{int(created_at.timestamp())}-{(sender.id if sender else 0)}",
        kind=kind,
        body=body,
        system_event=system_event,
        system_payload=system_payload,
        reply_to_id=reply_to.id if reply_to else None,
        created_at=created_at,
    )
    db.add(message)
    db.flush()
    return message


def _add_members(
    db: Session, conversation: Conversation, member_ids: list[int], admin_ids: list[int]
) -> None:
    for user_id in member_ids:
        db.add(
            ConversationMember(
                conversation_id=conversation.id,
                user_id=user_id,
                role="admin" if user_id in admin_ids else "member",
                joined_at=utcnow() - timedelta(days=7),
            )
        )
    db.flush()


def _trailing_unread(messages: list[Message], user_id: int, cap: int) -> int:
    """How many of the newest messages this user has not read.

    Walks back from the end and stops at the user's own last message, so the
    badge always matches the "unread" divider the client draws.
    """
    if cap <= 0:
        return 0
    count = 0
    for message in reversed(messages):
        if message.kind == "system" or message.sender_id == user_id:
            break
        count += 1
        if count >= cap:
            break
    return count


# Only the two documented demo logins start with unread chats; everybody else
# has read everything, which keeps the badges meaningful.
UNREAD_CAP = {0: 3, 1: 2}


def seed(db: Session) -> None:
    """Create the demo dataset. The caller owns the session."""
    now = utcnow()

    # 1. users + their settings -------------------------------------------
    users: list[User] = []
    for spec in DEMO_USERS:
        user = User(
            phone_number=spec["phone"],
            username=spec["username"],
            display_name=spec["name"],
            about=spec["about"],
            avatar_color=spec["color"],
            last_seen_at=now - timedelta(minutes=RNG.randint(3, 600)),
            created_at=now - timedelta(days=30),
        )
        db.add(user)
        users.append(user)
    db.flush()

    for user in users:
        db.add(UserSettings(user_id=user.id))
    db.flush()

    # 2. contacts: everyone knows everyone, so "New chat" is populated -----
    for owner in users:
        for other in users:
            if owner.id != other.id:
                db.add(
                    Contact(
                        owner_id=owner.id,
                        contact_user_id=other.id,
                        created_at=now - timedelta(days=20),
                    )
                )
    db.flush()

    # 3. conversations + messages -----------------------------------------
    conversations: list[tuple[Conversation, list[int]]] = []

    for (first_index, second_index), script in DIRECT_SCRIPTS.items():
        first, second = users[first_index], users[second_index]
        conversation = Conversation(
            type="direct",
            direct_key=f"{min(first.id, second.id)}:{max(first.id, second.id)}",
            created_by=first.id,
            created_at=now - timedelta(days=7),
        )
        db.add(conversation)
        db.flush()
        _add_members(db, conversation, [first.id, second.id], [])
        conversations.append((conversation, [first.id, second.id]))

        # Lay the script backwards from a fixed "newest message" time, so each
        # thread ends where we want it in the chat list.
        ends_hours_ago, gap = DIRECT_TIMING.get((first_index, second_index), DEFAULT_DIRECT_TIMING)
        newest = now - timedelta(hours=ends_hours_ago, minutes=RNG.randint(0, 20))
        jitter = max(gap // 5, 1)
        start = newest - timedelta(minutes=gap * (len(script) - 1))

        written: list[Message] = []
        for index, entry in enumerate(script):
            sender_index, text = entry[0], entry[1]
            reply_index = entry[2] if len(entry) > 2 else None
            created = start + timedelta(minutes=gap * index + RNG.randint(-jitter, jitter))
            written.append(
                _add_message(
                    db,
                    conversation,
                    sender=users[sender_index],
                    body=text,
                    created_at=created,
                    reply_to=written[reply_index] if reply_index is not None else None,
                )
            )

    for spec in GROUPS:
        creator = users[spec["creator"]]
        conversation = Conversation(
            type="group",
            name=spec["name"],
            description=spec["description"],
            created_by=creator.id,
            avatar_color=creator.avatar_color,
            created_at=now - timedelta(days=7),
        )
        db.add(conversation)
        db.flush()

        all_member_ids = [creator.id] + [users[index].id for index in spec["members"]]
        _add_members(db, conversation, all_member_ids, [creator.id])

        _add_message(
            db,
            conversation,
            sender=None,
            body=f"{creator.display_name} created the group",
            created_at=now - timedelta(days=7),
            kind="system",
            system_event="group_created",
            system_payload=f'{{"actor_id": {creator.id}, "target_ids": {all_member_ids[1:]}}}',
        )

        ends_hours_ago, gap = GROUP_TIMING[spec["name"]]
        script = spec["script"]
        newest = now - timedelta(hours=ends_hours_ago)
        start = newest - timedelta(minutes=gap * (len(script) - 1))
        for index, (sender_index, text) in enumerate(script):
            created = start + timedelta(minutes=gap * index)
            _add_message(
                db, conversation, sender=users[sender_index], body=text, created_at=created
            )

        conversations.append((conversation, all_member_ids))

    db.flush()

    # 4. read state, last-message pointers and receipts ---------------------
    caps = {users[index].id: cap for index, cap in UNREAD_CAP.items()}
    for conversation, member_ids in conversations:
        messages = list(
            db.scalars(
                select(Message)
                .where(Message.conversation_id == conversation.id)
                .order_by(Message.id)
            )
        )
        if not messages:
            continue

        conversation.last_message_id = messages[-1].id
        conversation.last_message_at = messages[-1].created_at

        unread = {
            user_id: _trailing_unread(messages, user_id, caps.get(user_id, 0))
            for user_id in member_ids
        }

        read_marks: dict[int, int] = {}
        for user_id in member_ids:
            skip = unread[user_id]
            read_marks[user_id] = messages[-1 - skip].id if skip < len(messages) else 0

            membership = db.scalar(
                select(ConversationMember).where(
                    ConversationMember.conversation_id == conversation.id,
                    ConversationMember.user_id == user_id,
                )
            )
            membership.last_read_message_id = read_marks[user_id] or None

        # receipts: everyone received; read up to their own marker
        for message in messages:
            for user_id in member_ids:
                if user_id == message.sender_id:
                    continue
                delivered_at = min(message.created_at + timedelta(seconds=RNG.randint(2, 40)), now)
                read_at = None
                if message.id <= read_marks[user_id]:
                    read_at = min(delivered_at + timedelta(seconds=RNG.randint(5, 240)), now)
                db.add(
                    MessageReceipt(
                        message_id=message.id,
                        user_id=user_id,
                        delivered_at=delivered_at,
                        read_at=read_at,
                    )
                )

    db.flush()

    # 5. reactions, so the chips are visible on first load ------------------
    aarav, meera = users[0], users[1]
    chat = db.scalar(
        select(Conversation).where(
            Conversation.direct_key == f"{min(aarav.id, meera.id)}:{max(aarav.id, meera.id)}"
        )
    )
    if chat is not None:
        messages = list(
            db.scalars(
                select(Message).where(Message.conversation_id == chat.id).order_by(Message.id)
            )
        )
        for offset, emoji, user in (
            (1, "\U0001f44d", aarav),
            (2, "\u2764\ufe0f", meera),
            (7, "\U0001f602", meera),
            (-1, "\U0001f44c", aarav),
        ):
            if len(messages) > abs(offset):
                db.add(Reaction(message_id=messages[offset].id, user_id=user.id, emoji=emoji))

    # 6. per-user chat state: a pinned favourite, a muted group, a block -----
    trek = db.scalar(select(Conversation).where(Conversation.name == "Weekend Trek"))
    ananya_chat = db.scalar(
        select(Conversation).where(
            Conversation.direct_key == f"{min(aarav.id, users[3].id)}:{max(aarav.id, users[3].id)}"
        )
    )
    for conversation, pinned, muted in ((ananya_chat, True, False), (trek, False, True)):
        if conversation is None:
            continue
        membership = db.scalar(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conversation.id,
                ConversationMember.user_id == aarav.id,
            )
        )
        membership.pinned = pinned
        # muted_until is the source of truth: any future timestamp means muted
        membership.muted_until = utcnow() + timedelta(days=365) if muted else None

    dev = db.scalar(
        select(Contact).where(Contact.owner_id == aarav.id, Contact.contact_user_id == users[6].id)
    )
    if dev is not None:
        dev.blocked = True

    db.commit()
    logger.info(
        "seeded %d users, %d conversations, %d messages",
        db.scalar(select(func.count(User.id))),
        db.scalar(select(func.count(Conversation.id))),
        db.scalar(select(func.count(Message.id))),
    )


def seed_if_empty() -> None:
    """Boot-time hook: only seed when the database has no users.

    Safe to call on every start (idempotent), which is how the app recovers its
    demo data on hosts with an ephemeral disk.
    """
    from app.core.database import init_db

    init_db()  # works standalone too: python -m app.seed.seed
    with SessionLocal() as db:
        if db.scalar(select(func.count(User.id))):
            return
        seed(db)


if __name__ == "__main__":  # python -m app.seed.seed
    logging.basicConfig(level=logging.INFO)
    seed_if_empty()
    print("Seed complete. Demo logins: +919000000001 (Aarav) / +919000000002 (Meera), OTP 123456")
