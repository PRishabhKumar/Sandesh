"""Contacts - a user's personal address book.

Signal models this as a directed edge: "A has B in their contacts". B does not
automatically have A. That is why this is its own table rather than a
self-referencing many-to-many on ``users``.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, utcnow


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        # The same person cannot be added twice to one address book.
        UniqueConstraint("owner_id", "contact_user_id", name="uq_contacts_owner_contact"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    contact_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    nickname: Mapped[str | None] = mapped_column(String(80))
    blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])  # noqa: F821
    contact_user: Mapped["User"] = relationship(foreign_keys=[contact_user_id])  # noqa: F821
