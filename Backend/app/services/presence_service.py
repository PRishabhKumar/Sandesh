"""Presence: who is connected right now, and when everybody was last seen.

* The **live** part is an in-memory set of user ids - presence is inherently
  ephemeral and does not belong in the database.
* The **durable** part (``users.last_seen_at``) *is* persisted, so the chat
  header can still say "last seen today at 4:12 PM" after a restart.

This module deliberately knows nothing about WebSockets, so it stays importable
from services and testable on its own.
"""

import threading

from sqlalchemy.orm import Session

from app.core.database import utcnow
from app.models import User
from app.repositories import conversation_repository as conversations_repo
from app.repositories import user_repository as users_repo

_online_users: set[int] = set()
_lock = threading.Lock()


def mark_online(user_id: int) -> bool:
    """Returns True when this is the user's *first* live socket."""
    with _lock:
        was_offline = user_id not in _online_users
        _online_users.add(user_id)
        return was_offline


def mark_offline(user_id: int) -> bool:
    """Returns True when the user's *last* socket closed."""
    with _lock:
        _online_users.discard(user_id)
        return user_id not in _online_users


def is_online(user_id: int) -> bool:
    return user_id in _online_users


def online_user_ids() -> set[int]:
    return set(_online_users)


def peers_to_notify(db: Session, user_id: int) -> list[int]:
    """Everyone who shares a conversation with this user (they see the dot)."""
    return conversations_repo.peers_of_user(db, user_id)


def store_last_seen(db: Session, user: User) -> None:
    users_repo.touch_last_seen(db, user)
    db.commit()


def presence_event(user: User, online: bool) -> dict:
    """The event payload clients listen for."""
    return {
        "type": "presence",
        "data": {
            "user_id": user.id,
            "online": online,
            "last_seen_at": user.last_seen_at.isoformat() if user.last_seen_at else None,
        },
    }


def current_time() -> str:
    return utcnow().isoformat()
