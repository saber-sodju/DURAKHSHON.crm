"""Refresh-token session lifecycle: create, rotate, revoke.

Each login creates a UserSession row keyed by a hash of the refresh token's jti.
Refreshing rotates the token (new jti) and updates the same row, so a stolen or
already-used refresh token cannot be replayed. Logout revokes the row.
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.security import create_refresh_token, hash_jti
from app.models import UserSession


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; Postgres returns aware. Treat naive as UTC
    so comparisons work identically on both backends."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _device_name(user_agent: str) -> str:
    ua = user_agent.lower()
    browser = next((b for b in ("edg", "chrome", "firefox", "safari") if b in ua), "")
    browser = {"edg": "Edge", "chrome": "Chrome", "firefox": "Firefox", "safari": "Safari"}.get(browser, "Browser")
    if "android" in ua:
        platform = "Android"
    elif "iphone" in ua or "ipad" in ua or "ios" in ua:
        platform = "iOS"
    elif "windows" in ua:
        platform = "Windows"
    elif "mac os" in ua or "macintosh" in ua:
        platform = "macOS"
    elif "linux" in ua:
        platform = "Linux"
    else:
        platform = "Unknown device"
    return f"{browser} · {platform}"


def create_session(db: Session, user_id: int, days: int, user_agent: str, ip: str) -> str:
    """Create a session and return the refresh token to hand to the client."""
    token, jti, expires_at = create_refresh_token(user_id, days)
    session = UserSession(
        user_id=user_id,
        refresh_token_jti_hash=hash_jti(jti),
        device_name=_device_name(user_agent),
        user_agent=user_agent[:400],
        ip_address=ip[:64],
        expires_at=expires_at,
    )
    db.add(session)
    return token


def rotate_session(db: Session, session: UserSession, days: int) -> str:
    """Issue a new refresh token for an existing session, invalidating the old jti."""
    token, jti, expires_at = create_refresh_token(session.user_id, days)
    session.refresh_token_jti_hash = hash_jti(jti)
    session.expires_at = expires_at
    session.last_seen_at = _now()
    return token


def find_active_session(db: Session, user_id: int, jti: str) -> UserSession | None:
    session = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user_id,
            UserSession.refresh_token_jti_hash == hash_jti(jti),
        )
        .first()
    )
    if session is None or session.revoked_at is not None:
        return None
    if _as_aware(session.expires_at) <= _now():
        return None
    return session


def revoke_session(session: UserSession) -> None:
    if session.revoked_at is None:
        session.revoked_at = _now()


def revoke_all_sessions(db: Session, user_id: int) -> int:
    count = (
        db.query(UserSession)
        .filter(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .update({UserSession.revoked_at: _now()})
    )
    return count
