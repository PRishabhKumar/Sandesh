"""User settings (Appearance / Privacy / Notifications screens)."""

from sqlalchemy.orm import Session

from app.core.errors import bad_request
from app.models import User, UserSettings
from app.repositories import user_repository as users_repo
from app.schemas.contact import SettingsPatchIn

VALID_THEMES = {"system", "light", "dark"}
VALID_NOTIFICATION_CONTENT = {"name_and_message", "name_only", "none"}


def settings_for(db: Session, user_id: int) -> UserSettings:
    """Always returns a row: it is created with the user, but stay defensive."""
    found = db.get(UserSettings, user_id)
    if found is None:
        found = UserSettings(user_id=user_id)
        db.add(found)
        db.flush()
    return found


def update_settings(db: Session, user: User, patch: SettingsPatchIn) -> UserSettings:
    user_settings = settings_for(db, user.id)

    if patch.theme is not None:
        if patch.theme not in VALID_THEMES:
            raise bad_request(f"theme must be one of {sorted(VALID_THEMES)}", "invalid_theme")
        user_settings.theme = patch.theme

    if patch.notification_content is not None:
        if patch.notification_content not in VALID_NOTIFICATION_CONTENT:
            raise bad_request(
                f"notification_content must be one of {sorted(VALID_NOTIFICATION_CONTENT)}",
                "invalid_notification_content",
            )
        user_settings.notification_content = patch.notification_content

    if patch.read_receipts is not None:
        user_settings.read_receipts = patch.read_receipts
    if patch.typing_indicators is not None:
        user_settings.typing_indicators = patch.typing_indicators
    if patch.show_last_seen is not None:
        user_settings.show_last_seen = patch.show_last_seen
    if patch.default_disappearing_secs is not None:
        if patch.default_disappearing_secs < 0:
            raise bad_request("default disappearing duration cannot be negative")
        user_settings.default_disappearing_secs = patch.default_disappearing_secs

    db.commit()
    db.refresh(user_settings)
    return user_settings


def touch_last_seen(db: Session, user: User) -> None:
    users_repo.touch_last_seen(db, user)
    db.commit()
