from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_client_ip, require_staff
from app.db.session import get_db
from app.models import User, Teacher
from app.schemas.common import Page, Message
from app.schemas.people import TeacherCreate, TeacherUpdate, TeacherOut
from app.services.audit import log_action

router = APIRouter(prefix="/teachers", tags=["teachers"])


@router.get("", response_model=Page[TeacherOut])
def list_teachers(
    search: str = "",
    status_filter: str = Query("", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(Teacher).options(selectinload(Teacher.groups))
    if search:
        like = f"%{search}%"
        query = query.filter(or_(
            Teacher.first_name.ilike(like), Teacher.last_name.ilike(like), Teacher.subject.ilike(like),
        ))
    if status_filter:
        query = query.filter(Teacher.status == status_filter)
    total = query.count()
    items = query.order_by(Teacher.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{teacher_id}", response_model=TeacherOut)
def get_teacher(teacher_id: int, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    teacher = db.get(Teacher, teacher_id)
    if teacher is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")
    return teacher


@router.post("", response_model=TeacherOut, status_code=status.HTTP_201_CREATED)
def create_teacher(
    data: TeacherCreate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    teacher = Teacher(**data.model_dump())
    db.add(teacher)
    db.flush()
    log_action(db, actor, "create", "teacher", teacher.id, teacher.full_name, ip=get_client_ip(request))
    db.commit()
    db.refresh(teacher)
    return teacher


@router.put("/{teacher_id}", response_model=TeacherOut)
def update_teacher(
    teacher_id: int,
    data: TeacherUpdate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    teacher = db.get(Teacher, teacher_id)
    if teacher is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")
    for field, value in data.model_dump().items():
        setattr(teacher, field, value)
    log_action(db, actor, "update", "teacher", teacher.id, teacher.full_name, ip=get_client_ip(request))
    db.commit()
    db.refresh(teacher)
    return teacher


@router.delete("/{teacher_id}", response_model=Message)
def delete_teacher(
    teacher_id: int,
    request: Request,
    hard: bool = False,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    teacher = db.get(Teacher, teacher_id)
    if teacher is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")
    name = teacher.full_name
    if hard:
        db.delete(teacher)
        action = "delete"
    else:
        teacher.status = "inactive"
        action = "deactivate"
    log_action(db, actor, action, "teacher", teacher_id, name, ip=get_client_ip(request))
    db.commit()
    return Message(detail=f"Teacher {action}d")
