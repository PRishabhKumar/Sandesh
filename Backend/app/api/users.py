"""User profile + lookup routes: /users/*"""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import bad_request
from app.models import User
from app.schemas.auth import ProfileIn
from app.schemas.contact import UserLookupOut
from app.schemas.user import UserOut
from app.services import auth_service, contact_service

router = APIRouter(prefix="/users", tags=["users"])

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


@router.get("/lookup", response_model=UserLookupOut)
def lookup(
    q: str = Query(min_length=1, max_length=80, description="Phone number or username"),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> UserLookupOut:
    """Find somebody to chat with ("New chat" -> search field)."""
    return contact_service.lookup_users(db, me, q)


@router.get("/me", response_model=UserOut)
def read_me(me: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(me)


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: ProfileIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> UserOut:
    """Edit display name / about / avatar colour from Settings -> Profile."""
    return UserOut.model_validate(auth_service.update_profile(db, me, payload))


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> UserOut:
    """Upload a profile picture (stored on disk, served from /uploads)."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise bad_request("Upload a PNG, JPEG, WEBP or GIF image", "unsupported_file_type")

    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise bad_request(
            f"Images must be smaller than {settings.MAX_UPLOAD_MB} MB", "file_too_large"
        )

    suffix = Path(file.filename or "avatar.png").suffix or ".png"
    relative_path = Path("avatars") / f"{uuid.uuid4().hex}{suffix}"
    target = Path(settings.UPLOAD_DIR) / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(contents)

    me.avatar_url = f"/uploads/{relative_path.as_posix()}"
    db.commit()
    db.refresh(me)
    return UserOut.model_validate(me)
