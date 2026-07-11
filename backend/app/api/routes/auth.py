from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_client_ip, verify_same_origin
from app.core.config import settings
from app.core.security import (
    create_access_token, decode_token_payload,
    hash_password, verify_password, login_limiter,
)
from app.db.session import get_db
from app.models import User, Role, Student, Teacher, Parent
from app.schemas.auth import LoginRequest, TokenResponse, MeResponse, ChangePasswordRequest
from app.schemas.common import Message
from app.services.audit import log_action
from app.services.sessions import (
    create_session, rotate_session, find_active_session, revoke_session, revoke_all_sessions,
)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
COOKIE_PATH = "/api/auth"


def _refresh_days(remember: bool) -> int:
    return settings.REFRESH_TOKEN_REMEMBER_DAYS if remember else settings.REFRESH_TOKEN_DAYS


def _set_refresh_cookie(response: Response, token: str, days: int) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=days * 24 * 3600,
        path=COOKIE_PATH,
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
    days = _refresh_days(data.remember_me)
    token = create_session(db, user.id, days, request.headers.get("user-agent", ""), ip)
    user.last_login_at = datetime.now(timezone.utc)
    log_action(db, user, "login", "auth", detail=f"remember={data.remember_me}", ip=ip)
    db.commit()

    _set_refresh_cookie(response, token, days)
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    verify_same_origin(request)
    token = request.cookies.get(REFRESH_COOKIE)
    payload = decode_token_payload(token, "refresh") if token else None
    if payload is None or "jti" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    session = find_active_session(db, user_id, payload["jti"])
    if session is None:
        # token not recognised / already rotated / revoked / expired
        response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        revoke_session(session)
        db.commit()
        response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is inactive")

    # keep the same overall lifetime bucket the session was created with
    remaining_days = max(1, (session.expires_at - session.created_at).days or 1)
    new_token = rotate_session(db, session, remaining_days)
    session.ip_address = get_client_ip(request)[:64]
    db.commit()

    _set_refresh_cookie(response, new_token, remaining_days)
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/logout", response_model=Message)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    verify_same_origin(request)
    token = request.cookies.get(REFRESH_COOKIE)
    payload = decode_token_payload(token, "refresh") if token else None
    if payload and "jti" in payload:
        try:
            session = find_active_session(db, int(payload["sub"]), payload["jti"])
            if session:
                revoke_session(session)
                db.commit()
        except (ValueError, TypeError):
            pass
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
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
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    # changing the password kills every existing session for safety
    revoke_all_sessions(db, user.id)
    log_action(db, user, "change_password", "auth", ip=get_client_ip(request))
    db.commit()
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    return Message(detail="Password changed")
