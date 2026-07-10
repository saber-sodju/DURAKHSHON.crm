from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models import UserSession

PASSWORD = "TestPass123!"


def _login(client, username, remember=False):
    """Log in and return (access_token, refresh_cookie_value), leaving the
    shared client's cookie jar clean so tests manage the refresh cookie explicitly."""
    r = client.post("/api/auth/login", json={"username": username, "password": PASSWORD,
                                              "remember_me": remember})
    assert r.status_code == 200, r.text
    refresh = client.cookies.get("refresh_token")
    client.cookies.clear()
    return r.json()["access_token"], refresh


def _latest_session(username):
    db = SessionLocal()
    try:
        from app.models import User
        user = db.query(User).filter(User.username == username).first()
        return (
            db.query(UserSession)
            .filter(UserSession.user_id == user.id)
            .order_by(UserSession.id.desc())
            .first()
        )
    finally:
        db.close()


class TestRememberMe:
    def test_remember_me_creates_long_session(self, client):
        _login(client, "director", remember=True)
        s = _latest_session("director")
        days = (s.expires_at - s.created_at).days
        assert days >= 13  # ~14 day window

    def test_without_remember_me_creates_short_session(self, client):
        _login(client, "admin", remember=False)
        s = _latest_session("admin")
        days = (s.expires_at - s.created_at).days
        assert days <= 2  # ~1 day window


class TestRefreshRotation:
    def test_refresh_issues_new_access_token(self, client):
        _, refresh = _login(client, "teacher")
        r = client.post("/api/auth/refresh", cookies={"refresh_token": refresh})
        assert r.status_code == 200
        assert r.json()["access_token"]

    def test_old_refresh_token_cannot_be_reused(self, client):
        _, refresh = _login(client, "teacher")
        first = client.post("/api/auth/refresh", cookies={"refresh_token": refresh})
        assert first.status_code == 200
        # the original refresh token was rotated away — replaying it must fail
        client.cookies.clear()
        replay = client.post("/api/auth/refresh", cookies={"refresh_token": refresh})
        assert replay.status_code == 401

    def test_rotated_token_still_works(self, client):
        _, refresh = _login(client, "teacher")
        r1 = client.post("/api/auth/refresh", cookies={"refresh_token": refresh})
        new_cookie = client.cookies.get("refresh_token")
        client.cookies.clear()
        r2 = client.post("/api/auth/refresh", cookies={"refresh_token": new_cookie})
        assert r2.status_code == 200


class TestLogout:
    def test_logout_revokes_current_session(self, client):
        _, refresh = _login(client, "parent")
        client.post("/api/auth/logout", cookies={"refresh_token": refresh})
        client.cookies.clear()
        r = client.post("/api/auth/refresh", cookies={"refresh_token": refresh})
        assert r.status_code == 401

    def test_revoked_session_cannot_refresh(self, client):
        _, refresh = _login(client, "student")
        s = _latest_session("student")
        db = SessionLocal()
        try:
            row = db.get(UserSession, s.id)
            row.revoked_at = datetime.now(timezone.utc)
            db.commit()
        finally:
            db.close()
        r = client.post("/api/auth/refresh", cookies={"refresh_token": refresh})
        assert r.status_code == 401


class TestSessionsApi:
    def test_list_and_logout_all(self, client, tokens):
        # create three sessions for director
        for _ in range(3):
            _login(client, "director")
        listed = client.get("/api/sessions", headers=tokens["director"])
        assert listed.status_code == 200
        assert len(listed.json()) >= 3
        killed = client.post("/api/sessions/logout-all", headers=tokens["director"])
        assert killed.status_code == 200

    def test_change_password_revokes_all_sessions(self, client):
        # dedicated throwaway user so we don't disturb other tests' passwords
        from app.models import User, Role
        from app.core.security import hash_password
        db = SessionLocal()
        try:
            u = User(username="pwtest", role=Role.ADMIN.value,
                     password_hash=hash_password(PASSWORD), full_name="Pw Test")
            db.add(u)
            db.commit()
        finally:
            db.close()
        access, refresh = _login(client, "pwtest")
        resp = client.post("/api/auth/change-password", headers={"Authorization": f"Bearer {access}"},
                           json={"current_password": PASSWORD, "new_password": "NewPass456!"})
        assert resp.status_code == 200
        client.cookies.clear()
        r = client.post("/api/auth/refresh", cookies={"refresh_token": refresh})
        assert r.status_code == 401
