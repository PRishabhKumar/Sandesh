"""Shared FastAPI dependencies (auth + membership checks)."""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import forbidden, unauthorized
from app.core.security import decode_token
from app.models import ConversationMember, User

# auto_error=False so we can raise our own consistent error payload.
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the ``Authorization: Bearer <jwt>`` header into a User row."""
    if credentials is None or not credentials.credentials:
        raise unauthorized("Sign in to continue")

    user_id = decode_token(credentials.credentials)
    if user_id is None:
        raise unauthorized("Your session expired - please sign in again")

    user = db.get(User, user_id)
    if user is None:
        raise unauthorized("Account no longer exists")
    return user


def load_membership(db: Session, conversation_id: int, user_id: int) -> ConversationMember:
    """Return the caller's active membership row or raise 403.

    Used by every conversation-scoped endpoint: authorization lives in the
    service/API layer, never in the UI.
    """
    membership = (
        db.query(ConversationMember)
        .filter(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
            ConversationMember.left_at.is_(None),
        )
        .one_or_none()
    )
    if membership is None:
        raise forbidden("You are not a member of this conversation", "not_a_member")
    return membership
