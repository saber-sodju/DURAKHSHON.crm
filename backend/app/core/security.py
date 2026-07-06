import time
from datetime import datetime, timedelta, timezone
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from jose import jwt, JWTError

from app.core.config import settings

ALGORITHM = "HS256"
_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def _create_token(subject: str, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(user_id: int) -> str:
    return _create_token(str(user_id), "access", timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(user_id: int) -> str:
    return _create_token(str(user_id), "refresh", timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token: str, expected_type: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    try:
        return int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        return None


class LoginRateLimiter:
    """In-memory sliding-window rate limiter + per-account lockout for the login endpoint."""

    def __init__(self) -> None:
        self._attempts: dict[str, list[float]] = {}
        self._failures: dict[str, list[float]] = {}

    def _prune(self, bucket: dict[str, list[float]], key: str, window: float) -> list[float]:
        now = time.monotonic()
        entries = [t for t in bucket.get(key, []) if now - t < window]
        if entries:
            bucket[key] = entries
        else:
            bucket.pop(key, None)
        return entries

    def is_rate_limited(self, ip: str) -> bool:
        entries = self._prune(self._attempts, ip, settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS)
        return len(entries) >= settings.LOGIN_RATE_LIMIT_ATTEMPTS

    def record_attempt(self, ip: str) -> None:
        self._attempts.setdefault(ip, []).append(time.monotonic())

    def is_locked_out(self, username: str) -> bool:
        entries = self._prune(self._failures, username.lower(), settings.LOCKOUT_MINUTES * 60)
        return len(entries) >= settings.LOCKOUT_THRESHOLD

    def record_failure(self, username: str) -> None:
        self._failures.setdefault(username.lower(), []).append(time.monotonic())

    def reset_failures(self, username: str) -> None:
        self._failures.pop(username.lower(), None)


login_limiter = LoginRateLimiter()
