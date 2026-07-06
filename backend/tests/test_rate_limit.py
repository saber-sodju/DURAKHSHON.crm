from app.core.security import LoginRateLimiter
from app.core import security


def test_rate_limiter_blocks_after_threshold(monkeypatch):
    monkeypatch.setattr(security.settings, "LOGIN_RATE_LIMIT_ATTEMPTS", 3)
    limiter = LoginRateLimiter()
    ip = "10.0.0.1"
    for _ in range(3):
        assert not limiter.is_rate_limited(ip)
        limiter.record_attempt(ip)
    assert limiter.is_rate_limited(ip)


def test_lockout_after_repeated_failures(monkeypatch):
    monkeypatch.setattr(security.settings, "LOCKOUT_THRESHOLD", 3)
    limiter = LoginRateLimiter()
    for _ in range(3):
        assert not limiter.is_locked_out("victim")
        limiter.record_failure("victim")
    assert limiter.is_locked_out("victim")
    limiter.reset_failures("victim")
    assert not limiter.is_locked_out("victim")
