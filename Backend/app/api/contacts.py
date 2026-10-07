"""Address book routes: /contacts/*"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.schemas.contact import ContactCreateIn, ContactOut
from app.services import contact_service

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=list[ContactOut])
def list_contacts(
    q: str | None = Query(default=None, max_length=80, description="Optional client-side search"),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> list[ContactOut]:
    if q:
        return contact_service.search_contacts(db, me, q)
    return contact_service.list_contacts(db, me)


@router.post("", response_model=ContactOut, status_code=201)
def add_contact(
    payload: ContactCreateIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> ContactOut:
    return contact_service.add_contact(db, me, payload.identifier, payload.nickname)


@router.delete("/{contact_id}", status_code=204)
def delete_contact(
    contact_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)
) -> None:
    contact_service.delete_contact(db, me, contact_id)


@router.post("/{contact_id}/block", response_model=ContactOut)
def block_contact(
    contact_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)
) -> ContactOut:
    return contact_service.set_blocked(db, me, contact_id, True)


@router.post("/{contact_id}/unblock", response_model=ContactOut)
def unblock_contact(
    contact_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)
) -> ContactOut:
    return contact_service.set_blocked(db, me, contact_id, False)
