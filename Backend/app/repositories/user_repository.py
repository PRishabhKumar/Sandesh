"""Database access for users, settings and OTP codes.

Repositories only speak SQL/ORM. Business rules live in the service layer, so
these functions stay small and easy to reason about.
"""

from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import utcnow
from app.models import OtpCode, User, UserSettings

OTP_TTL_SECONDS = 300


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_by_identifier(db: Session, identifier: str) -> User | None:
    """Find a user by phone number or username (case-insensitive for usernames)."""
    return db.scalar(
        select(User).where(
            or_(User.phone_number == identifier, User.username == identifier.lower())
        )
    )


def search(db: Session, query: str, limit: int = 20) -> list[User]:
    """Look up users by partial phone number, username or display name."""
    pattern = f"%{query.lower()}%"
    return list(
        db.scalars(
            select(User)
            .where(
                or_(
                    User.username.ilike(pattern),
                    User.display_name.ilike(pattern),
                    User.phone_number.ilike(f"%{query}%"),
                )
            )
            .order_by(User.display_name)
            .limit(limit)
        )
    )


def create_user(
    db: Session,
    *,
    phone_number: str | None,
    username: str | None,
    display_name: str,
    avatar_color: str | None = None,
) -> User:
    user = User(
        phone_number=phone_number,
        username=username,
        display_name=display_name,
        avatar_color=avatar_color,
    )
    db.add(user)
    db.flush()  # assigns user.id
    db.add(UserSettings(user_id=user.id))
    db.flush()
    return user


def create_otp(db: Session, identifier: str, code: str) -> OtpCode:
    otp = OtpCode(
        identifier=identifier,
        code=code,
        expires_at=utcnow() + timedelta(seconds=OTP_TTL_SECONDS),
    )
    db.add(otp)
    db.flush()
    return otp


def get_valid_otp(db: Session, identifier: str, code: str) -> OtpCode | None:
    return db.scalar(
        select(OtpCode)
        .where(
            OtpCode.identifier == identifier,
            OtpCode.code == code,
            OtpCode.consumed.is_(False),
            OtpCode.expires_at > utcnow(),
        )
        .order_by(OtpCode.id.desc())
    )


def touch_last_seen(db: Session, user: User) -> None:
    user.last_seen_at = utcnow()
    db.flush()


def names_for(db: Session, user_ids: list[int]) -> dict[int, str]:
    """``{user_id: display_name}`` in one query (avoids per-message lookups)."""
    if not user_ids:
        return {}
    rows = db.execute(select(User.id, User.display_name).where(User.id.in_(user_ids))).all()
    return dict(rows)
