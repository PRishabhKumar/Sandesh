"""Settings routes: /settings/*"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.schemas.contact import SettingsPatchIn
from app.schemas.user import UserSettingsOut
from app.services import settings_service

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=UserSettingsOut)
def read_settings(
    db: Session = Depends(get_db), me: User = Depends(get_current_user)
) -> UserSettingsOut:
    """Appearance / Privacy / Notifications values for the Settings screen."""
    user_settings = settings_service.settings_for(db, me.id)
    db.commit()  # persist the row if it had to be created
    return UserSettingsOut.model_validate(user_settings)


@router.patch("/settings", response_model=UserSettingsOut)
def update_settings(
    payload: SettingsPatchIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> UserSettingsOut:
    """Partial update - only the keys present in the body change."""
    return UserSettingsOut.model_validate(settings_service.update_settings(db, me, payload))
