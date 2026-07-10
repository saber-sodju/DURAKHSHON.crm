from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import decode_token_payload, hash_jti
from app.db.session import get_db
from app.models import User, UserSession
from app.schemas.common import Message
from app.schemas.system import SessionOut

router = APIRouter(prefix="/sessions", tags=["sessions"])

REFRESH_COOKIE = "refresh_token"


def _current_jti_hash(request: Request) -> str | None:
    token = request.cookies.get(REFRESH_COOKIE)
    payload = decode_token_payload(token, "refresh") if token else None
    if payload and "jti" in payload:
        return hash_jti(payload["jti"])
    return None


@router.get("", response_model=list[SessionOut])
def list_sessions(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    current_hash = _current_jti_hash(request)
    rows = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        .order_by(UserSession.last_seen_at.desc())
        .all()
    )
    result = []
    for s in rows:
        out = SessionOut.model_validate(s)
        out.is_current = s.refresh_token_jti_hash == current_hash
        result.append(out)
    return result


@router.delete("/{session_id}", response_model=Message)
def revoke_one(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.get(UserSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return Message(detail="Session revoked")


@router.post("/logout-all", response_model=Message)
def logout_all(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revoke every session except the one making this request."""
    current_hash = _current_jti_hash(request)
    query = db.query(UserSession).filter(
        UserSession.user_id == user.id, UserSession.revoked_at.is_(None)
    )
    if current_hash:
        query = query.filter(UserSession.refresh_token_jti_hash != current_hash)
    count = query.update({UserSession.revoked_at: datetime.now(timezone.utc)})
    db.commit()
    return Message(detail=f"Revoked {count} other session(s)")
