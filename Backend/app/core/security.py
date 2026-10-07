"""JWT helpers (authentication only - encryption is simulated in this clone).

A token is just a signed JSON blob: ``{"sub": "<user id>", "exp": <timestamp>}``.
The same helper is used by the REST dependency and by the WebSocket handshake,
which is why the token is passed both as an ``Authorization`` header and (for
WebSockets, where custom headers are awkward) as a query parameter.
"""

from datetime import timedelta

import jwt

from app.core.config import settings
from app.core.database import utcnow


def create_access_token(user_id: int) -> str:
    """Sign a token that identifies the user."""
    now = utcnow()
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=settings.JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> int | None:
    """Return the user id inside a valid token, or ``None`` if it is invalid."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None
