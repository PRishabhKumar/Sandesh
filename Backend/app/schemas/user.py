"""User-shaped responses shared by several endpoints."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    """Public view of a user (never exposes anything private)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None = None
    phone_number: str | None = None
    display_name: str
    about: str | None = None
    avatar_url: str | None = None
    avatar_color: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime


class UserSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    read_receipts: bool
    typing_indicators: bool
    show_last_seen: bool
    theme: str
    notification_content: str
    default_disappearing_secs: int


class MeOut(BaseModel):
    """The logged-in user plus their settings (used to hydrate the app)."""

    user: UserOut
    settings: UserSettingsOut


class AuthResultOut(BaseModel):
    token: str
    user: UserOut
    is_new: bool
    needs_profile: bool
