"""Contacts: the address book behind "New chat" and "Add contact"."""

from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict, not_found
from app.models import Contact, User
from app.repositories import contact_repository as contacts_repo
from app.repositories import user_repository as users_repo
from app.schemas.contact import ContactOut, UserLookupOut
from app.services import serializers
from app.services.auth_service import parse_identifier


def list_contacts(db: Session, me: User) -> list[ContactOut]:
    return [serializers.contact_out(contact) for contact in contacts_repo.list_for_owner(db, me.id)]


def search_contacts(db: Session, me: User, query: str) -> list[ContactOut]:
    return [serializers.contact_out(contact) for contact in contacts_repo.search(db, me.id, query)]


def lookup_users(db: Session, me: User, query: str) -> UserLookupOut:
    """Find people by phone number or username.

    An exact phone/username hit is returned separately so the UI can offer
    "start a chat with +91 90000 00003" straight away.
    """
    exact: User | None = None
    try:
        phone, username = parse_identifier(query)
        exact = users_repo.get_by_identifier(db, phone or username or query)
    except Exception:
        exact = None

    matches = [
        user
        for user in users_repo.search(db, query)
        if user.id != me.id and (exact is None or user.id != exact.id)
    ]
    return UserLookupOut(
        users=[serializers.user_out(user) for user in matches],
        exact_match=serializers.user_out(exact) if exact and exact.id != me.id else None,
    )


def add_contact(db: Session, me: User, identifier: str, nickname: str | None = None) -> ContactOut:
    """Add somebody to my address book. The other side is *not* affected -
    a contact is a one-way edge (that is how Signal models it)."""
    try:
        phone, username = parse_identifier(identifier)
    except Exception as exc:
        raise bad_request("Use a phone number or a username", "invalid_identifier") from exc

    other = users_repo.get_by_identifier(db, phone or username or identifier)
    if other is None:
        raise not_found("No account matches that phone number or username", "user_not_found")
    if other.id == me.id:
        raise bad_request("That is your own number", "self_contact")
    if contacts_repo.get(db, me.id, other.id) is not None:
        raise conflict("That person is already in your contacts", "contact_exists")

    contact: Contact = contacts_repo.create(db, me.id, other.id, nickname)
    db.commit()
    db.refresh(contact)
    return serializers.contact_out(contact)


def delete_contact(db: Session, me: User, contact_id: int) -> None:
    contact = contacts_repo.get_by_id(db, contact_id)
    if contact is None or contact.owner_id != me.id:
        raise not_found("Contact not found", "contact_not_found")
    contacts_repo.delete(db, contact)
    db.commit()


def set_blocked(db: Session, me: User, contact_id: int, blocked: bool) -> ContactOut:
    contact = contacts_repo.get_by_id(db, contact_id)
    if contact is None or contact.owner_id != me.id:
        raise not_found("Contact not found", "contact_not_found")
    contacts_repo.set_blocked(db, contact, blocked)
    db.commit()
    db.refresh(contact)
    return serializers.contact_out(contact)
