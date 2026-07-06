from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_client_ip
from app.core.config import settings
from app.core.security import (
    create_access_token, create_refresh_token, decode_token,
    hash_password, verify_password, login_limiter,
)
from app.db.session import get_db
from app.models import User, Role, Student, Teacher, Parent
from app.schemas.auth import LoginRequest, TokenResponse, MeResponse, ChangePasswordRequest
from app.schemas.common import Message
from app.services.audit import log_action

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path="/api/auth",
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    if login_limiter.is_rate_limited(ip):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="Too many login attempts. Try again later.")
    login_limiter.record_attempt(ip)

    if login_limiter.is_locked_out(data.username):
        raise HTTPException(status_code=status.HTTP_423_LOCKED,
                            detail="Account temporarily locked due to repeated failed logins.")

    user = db.query(User).filter(User.username == data.username).first()
    if user is None or not verify_password(data.password, user.password_hash):
        login_limiter.record_failure(data.username)
        log_action(db, user, "login_failed", "auth", detail=f"username={data.username}", ip=ip)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    login_limiter.reset_failures(data.username)
    log_action(db, user, "login", "auth", ip=ip)
    db.commit()

    _set_refresh_cookie(response, create_refresh_token(user.id))
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    user_id = decode_token(token, "refresh") if token else None
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is inactive")
    _set_refresh_cookie(response, create_refresh_token(user.id))
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/logout", response_model=Message)
def logout(response: Response):
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    return Message(detail="Logged out")


def _profile_id(db: Session, user: User) -> int | None:
    model = {
        Role.TEACHER.value: Teacher,
        Role.STUDENT.value: Student,
        Role.PARENT.value: Parent,
    }.get(user.role)
    if model is None:
        return None
    profile = db.query(model).filter(model.user_id == user.id).first()
    return profile.id if profile else None


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = MeResponse.model_validate(user)
    data.profile_id = _profile_id(db, user)
    return data


@router.post("/change-password", response_model=Message)
def change_password(
    data: ChangePasswordRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    log_action(db, user, "change_password", "auth", ip=get_client_ip(request))
    db.commit()
    return Message(detail="Password changed")
