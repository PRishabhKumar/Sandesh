"""Request/response bodies for the auth + onboarding endpoints."""

from pydantic import BaseModel, Field, field_validator


class RequestOtpIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=80, description="Phone number or username")

    @field_validator("identifier")
    @classmethod
    def clean(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("identifier is required")
        return value


class RequestOtpOut(BaseModel):
    identifier: str
    is_phone: bool
    expires_in_seconds: int
    # Demo convenience: the mocked code is echoed back so the UI can show a hint.
    dev_code: str | None = None


class VerifyOtpIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=80)
    code: str = Field(min_length=4, max_length=10)


class ProfileIn(BaseModel):
    """Used both right after sign-up and when editing the profile later."""

    display_name: str = Field(min_length=1, max_length=80)
    about: str | None = Field(default=None, max_length=140)
    avatar_color: str | None = Field(default=None, max_length=9)

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("display name cannot be empty")
        return value
