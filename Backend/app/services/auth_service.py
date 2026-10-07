"""Authentication / onboarding business rules.

Flow (simplified on purpose - the real Signal uses SMS + key material):
1. ``request_otp``  - we store a code row and "send" it (logged to the console).
2. ``verify_otp``   - code accepted -> find the user or create one -> issue a JWT.
3. ``update_profile`` - the onboarding step where the name/avatar get set.
"""

import logging
import re

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import bad_request
from app.core.security import create_access_token
from app.models import User
from app.repositories import user_repository as users_repo
from app.schemas.auth import ProfileIn, RequestOtpOut

logger = logging.getLogger("app.auth")

# Soft pastel avatar backgrounds used when a user has no uploaded picture.
AVATAR_COLORS = [
    "#E3F2FD",
    "#F3E5F5",
    "#E8F5E9",
    "#FFF3E0",
    "#FCE4EC",
    "#E0F7FA",
    "#EDE7F6",
    "#FFFDE7",
]

USERNAME_RE = re.compile(r"^[a-z0-9._]{3,30}$")


def parse_identifier(identifier: str) -> tuple[str | None, str | None]:
    """Split a login identifier into ``(phone_number, username)``.

    Digits (optionally prefixed with ``+``) are treated as a phone number,
    anything else as a username. Exactly one of the two is returned.
    """
    value = identifier.strip()
    digits = re.sub(r"[\s\-()]", "", value)
    is_phone = digits.startswith("+") or digits.isdigit()

    if is_phone:
        phone = digits if digits.startswith("+") else f"+{digits}"
        if len(re.sub(r"\D", "", phone)) < 8:
            raise bad_request("Enter a valid phone number", "invalid_phone")
        return phone, None

    username = value.lower()
    if not USERNAME_RE.match(username):
        raise bad_request(
            "Usernames use 3-30 characters: letters, numbers, dot or underscore",
            "invalid_username",
        )
    return None, username


def request_otp(db: Session, identifier: str) -> RequestOtpOut:
    """Create a (mock) verification code for the identifier."""
    phone, username = parse_identifier(identifier)
    stored_identifier = phone or username or identifier

    users_repo.create_otp(db, stored_identifier, settings.MOCK_OTP)
    db.commit()

    # A real implementation would call an SMS provider here.
    logger.info("MOCK OTP for %s is %s", stored_identifier, settings.MOCK_OTP)

    return RequestOtpOut(
        identifier=stored_identifier,
        is_phone=phone is not None,
        expires_in_seconds=users_repo.OTP_TTL_SECONDS,
        dev_code=settings.MOCK_OTP,
    )


def verify_otp(db: Session, identifier: str, code: str) -> tuple[str, User, bool]:
    """Check the code, create the account on first login, return ``(token, user, is_new)``."""
    phone, username = parse_identifier(identifier)
    stored_identifier = phone or username or identifier

    # The demo accepts the fixed code from settings; any code we generated is
    # also accepted, so the stored/consumed lifecycle stays meaningful.
    is_valid = code == settings.MOCK_OTP or users_repo.get_valid_otp(db, stored_identifier, code)
    if not is_valid:
        raise bad_request("That code is not correct", "invalid_otp")

    user = users_repo.get_by_identifier(db, stored_identifier)
    is_new = user is None

    if user is None:
        # Fresh account: seed a friendly placeholder name that onboarding replaces.
        placeholder = username or phone or "New user"
        user = users_repo.create_user(
            db,
            phone_number=phone,
            username=username,
            display_name=placeholder.title() if username else (phone or "New user"),
            avatar_color=AVATAR_COLORS[0],
        )
        db.flush()
        # Pick a stable colour from the palette now that we know the id.
        user.avatar_color = AVATAR_COLORS[user.id % len(AVATAR_COLORS)]

    db.commit()
    db.refresh(user)
    return create_access_token(user.id), user, is_new


def update_profile(db: Session, user: User, payload: ProfileIn) -> User:
    """Set display name / about / avatar colour (onboarding step 4 and settings)."""
    user.display_name = payload.display_name.strip()
    if payload.about is not None:
        user.about = payload.about.strip() or None
    if payload.avatar_color:
        user.avatar_color = payload.avatar_color
    db.commit()
    db.refresh(user)
    return user
