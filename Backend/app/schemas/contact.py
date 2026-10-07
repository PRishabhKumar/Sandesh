"""Contacts, user lookup and settings payloads."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.user import UserOut


class ContactOut(BaseModel):
    id: int
    user: UserOut
    nickname: str | None = None
    blocked: bool = False
    created_at: datetime


class ContactCreateIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=80, description="Phone number or username")
    nickname: str | None = Field(default=None, max_length=80)


class UserLookupOut(BaseModel):
    """Result of "find someone by phone/username"."""

    users: list[UserOut]
    exact_match: UserOut | None = None


class SettingsPatchIn(BaseModel):
    read_receipts: bool | None = None
    typing_indicators: bool | None = None
    show_last_seen: bool | None = None
    theme: str | None = None
    notification_content: str | None = None
    default_disappearing_secs: int | None = None
