"""Group management payloads."""

from pydantic import BaseModel, Field


class GroupCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    member_ids: list[int] = Field(default_factory=list)
    description: str | None = Field(default=None, max_length=500)
    avatar_color: str | None = None
    disappearing_secs: int = 0


class GroupUpdateIn(BaseModel):
    """Admin-only edits to the group itself."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    avatar_color: str | None = None
    members_can_add: bool | None = None
    only_admins_can_send: bool | None = None


class MembersAddIn(BaseModel):
    user_ids: list[int] = Field(min_length=1)


class MemberRoleIn(BaseModel):
    role: str  # admin | member
