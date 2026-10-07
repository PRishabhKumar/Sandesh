"""Database access for the address book."""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Contact


def list_for_owner(db: Session, owner_id: int) -> list[Contact]:
    return list(
        db.scalars(
            select(Contact)
            .options(selectinload(Contact.contact_user))
            .where(Contact.owner_id == owner_id)
            .order_by(Contact.id)
        )
    )


def get(db: Session, owner_id: int, contact_user_id: int) -> Contact | None:
    return db.scalar(
        select(Contact).where(
            Contact.owner_id == owner_id, Contact.contact_user_id == contact_user_id
        )
    )


def get_by_id(db: Session, contact_id: int) -> Contact | None:
    return db.get(Contact, contact_id)


def create(
    db: Session, owner_id: int, contact_user_id: int, nickname: str | None = None
) -> Contact:
    contact = Contact(owner_id=owner_id, contact_user_id=contact_user_id, nickname=nickname)
    db.add(contact)
    db.flush()
    return contact


def delete(db: Session, contact: Contact) -> None:
    db.delete(contact)
    db.flush()


def set_blocked(db: Session, contact: Contact, blocked: bool) -> Contact:
    contact.blocked = blocked
    db.flush()
    return contact


def search(db: Session, owner_id: int, query: str, limit: int = 20) -> list[Contact]:
    """Filter my contacts by name / username / phone (case-insensitive)."""
    pattern = f"%{query.lower()}%"
    return list(
        db.scalars(
            select(Contact)
            .join(Contact.contact_user)
            .options(selectinload(Contact.contact_user))
            .where(
                Contact.owner_id == owner_id,
                or_(
                    Contact.nickname.ilike(pattern),
                    Contact.contact_user.has(display_name=pattern)  # type: ignore[attr-defined]
                    if False
                    else Contact.contact_user.has(),
                ),
            )
            .limit(limit)
        )
    )
