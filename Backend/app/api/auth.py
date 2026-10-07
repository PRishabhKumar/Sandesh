"""Auth + onboarding routes: /auth/*"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.schemas.auth import ProfileIn, RequestOtpIn, RequestOtpOut, VerifyOtpIn
from app.schemas.user import AuthResultOut, MeOut, UserOut, UserSettingsOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp", response_model=RequestOtpOut)
def request_otp(payload: RequestOtpIn, db: Session = Depends(get_db)) -> RequestOtpOut:
    """Step 1: ask for a verification code (mocked - always succeeds)."""
    return auth_service.request_otp(db, payload.identifier)


@router.post("/verify-otp", response_model=AuthResultOut)
def verify_otp(payload: VerifyOtpIn, db: Session = Depends(get_db)) -> AuthResultOut:
    """Step 2: exchange the code for a session token."""
    token, user, is_new = auth_service.verify_otp(db, payload.identifier, payload.code)
    return AuthResultOut(
        token=token,
        user=UserOut.model_validate(user),
        is_new=is_new,
        # New accounts have a placeholder name -> send them to the profile step.
        needs_profile=is_new,
    )


@router.post("/profile", response_model=UserOut)
def set_profile(
    payload: ProfileIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    """Step 3 (onboarding) and the Profile section of Settings."""
    return UserOut.model_validate(auth_service.update_profile(db, user, payload))


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeOut:
    """Who am I? Used to hydrate the app after a refresh."""
    user_settings = user.settings
    return MeOut(
        user=UserOut.model_validate(user),
        settings=UserSettingsOut.model_validate(user_settings),
    )


@router.post("/logout", status_code=204)
def logout(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    """Stateless JWT: the client drops the token; we only record last-seen."""
    from app.repositories import user_repository as users_repo

    users_repo.touch_last_seen(db, user)
    db.commit()
