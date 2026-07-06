from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_client_ip, require_staff, require_director
from app.core.security import hash_password
from app.db.session import get_db
from app.models import User, Role, Student, Teacher, Parent, AuditLog
from app.schemas.common import Page, Message
from app.schemas.users import UserOut, UserCreate, UserUpdate, AuditLogOut
from app.services.audit import log_action

router = APIRouter(prefix="/users", tags=["users"])

PROFILE_MODELS = {
    Role.TEACHER.value: Teacher,
    Role.STUDENT.value: Student,
    Role.PARENT.value: Parent,
}


@router.get("", response_model=Page[UserOut])
def list_users(
    search: str = "",
    role: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(User.username.ilike(like), User.full_name.ilike(like), User.email.ilike(like)))
    if role:
        query = query.filter(User.role == role)
    total = query.count()
    items = query.order_by(User.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    # only the director may create directors/admins
    if data.role in (Role.DIRECTOR.value, Role.ADMIN.value) and actor.role != Role.DIRECTOR.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only the director can create staff accounts")
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    if data.email and db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        full_name=data.full_name,
        is_active=data.is_active,
    )
    db.add(user)
    db.flush()

    # link user account to an existing profile (teacher/student/parent)
    if data.profile_id is not None:
        model = PROFILE_MODELS.get(data.role)
        if model is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="profile_id is only valid for teacher/student/parent roles")
        profile = db.get(model, data.profile_id)
        if profile is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
        if profile.user_id is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Profile already has an account")
        profile.user_id = user.id
        if not user.full_name:
            user.full_name = f"{profile.first_name} {profile.last_name}"

    log_action(db, actor, "create", "user", user.id, f"role={data.role} username={data.username}",
               ip=get_client_ip(request))
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role == Role.DIRECTOR.value and actor.role != Role.DIRECTOR.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins cannot modify the director")
    if data.is_active is False and user.role == Role.DIRECTOR.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The director account cannot be deactivated")

    if data.email is not None:
        existing = db.query(User).filter(User.email == data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
        user.email = data.email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password:
        user.password_hash = hash_password(data.password)

    log_action(db, actor, "update", "user", user.id, ip=get_client_ip(request))
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", response_model=Message)
def deactivate_user(
    user_id: int,
    request: Request,
    actor: User = Depends(require_director),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == actor.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")
    if user.role == Role.DIRECTOR.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The director account cannot be deactivated")
    user.is_active = False
    log_action(db, actor, "deactivate", "user", user.id, ip=get_client_ip(request))
    db.commit()
    return Message(detail="User deactivated")


@router.get("/audit-logs", response_model=Page[AuditLogOut])
def audit_logs(
    entity: str = "",
    action: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if entity:
        query = query.filter(AuditLog.entity == entity)
    if action:
        query = query.filter(AuditLog.action == action)
    total = query.count()
    logs = query.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for log in logs:
        out = AuditLogOut.model_validate(log)
        out.username = log.user.username if log.user else None
        items.append(out)
    return Page(items=items, total=total, page=page, page_size=page_size)
