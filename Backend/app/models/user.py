"""User aggregate: the account, its settings and its (mock) OTP codes."""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, utcnow


class User(Base):
    """A person. Identified by a phone number and/or a username."""

    __tablename__ = "users"
    __table_args__ = (
        # A user must be reachable by at least one identifier.
        CheckConstraint(
            "phone_number IS NOT NULL OR username IS NOT NULL",
            name="ck_users_has_identifier",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(40), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    about: Mapped[str | None] = mapped_column(String(140), default="Speak Freely")
    avatar_url: Mapped[str | None] = mapped_column(String(255))
    avatar_color: Mapped[str | None] = mapped_column(String(9))  # fallback initials colour
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    settings: Mapped["UserSettings"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<User id={self.id} name={self.display_name!r}>"


class UserSettings(Base):
    """Per-user privacy / appearance preferences (Settings screen)."""

    __tablename__ = "user_settings"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    read_receipts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    typing_indicators: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_last_seen: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    theme: Mapped[str] = mapped_column(
        String(10), default="system", nullable=False
    )  # system|light|dark
    notification_content: Mapped[str] = mapped_column(
        String(20), default="name_and_message", nullable=False
    )  # name_and_message|name_only|none
    default_disappearing_secs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user: Mapped[User] = relationship(back_populates="settings")


class OtpCode(Base):
    """Mocked phone/username verification codes.

    The demo accepts a fixed code (``MOCK_OTP``), but rows are still written so
    the flow - and the expiring/consumed logic - is real.
    """

    __tablename__ = "otp_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    identifier: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(10), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
