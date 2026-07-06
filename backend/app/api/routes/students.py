from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.api.deps import (
    get_client_ip, get_current_user, require_staff,
    accessible_student_ids, ensure_can_view_student,
)
from app.db.session import get_db
from app.models import User, Student, Parent, Group
from app.schemas.common import Page, Message
from app.schemas.people import StudentCreate, StudentUpdate, StudentOut
from app.services.audit import log_action

router = APIRouter(prefix="/students", tags=["students"])


def _apply_links(db: Session, student: Student, parent_ids: list[int] | None, group_ids: list[int] | None) -> None:
    if parent_ids is not None:
        parents = db.query(Parent).filter(Parent.id.in_(parent_ids)).all() if parent_ids else []
        if len(parents) != len(set(parent_ids)):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more parents not found")
        student.parents = parents
    if group_ids is not None:
        groups = db.query(Group).filter(Group.id.in_(group_ids)).all() if group_ids else []
        if len(groups) != len(set(group_ids)):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more groups not found")
        student.groups = groups


@router.get("", response_model=Page[StudentOut])
def list_students(
    search: str = "",
    group_id: int | None = None,
    status_filter: str = Query("", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Student).options(selectinload(Student.parents), selectinload(Student.groups))
    allowed = accessible_student_ids(db, user)
    if allowed is not None:
        query = query.filter(Student.id.in_(allowed or {0}))
    if search:
        like = f"%{search}%"
        query = query.filter(or_(
            Student.first_name.ilike(like), Student.last_name.ilike(like), Student.phone.ilike(like),
        ))
    if group_id is not None:
        query = query.filter(Student.groups.any(Group.id == group_id))
    if status_filter:
        query = query.filter(Student.status == status_filter)
    total = query.count()
    items = query.order_by(Student.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{student_id}", response_model=StudentOut)
def get_student(
    student_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ensure_can_view_student(db, user, student_id)


@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
def create_student(
    data: StudentCreate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = Student(**data.model_dump(exclude={"parent_ids", "group_ids"}))
    _apply_links(db, student, data.parent_ids, data.group_ids)
    db.add(student)
    db.flush()
    log_action(db, actor, "create", "student", student.id, student.full_name, ip=get_client_ip(request))
    db.commit()
    db.refresh(student)
    return student


@router.put("/{student_id}", response_model=StudentOut)
def update_student(
    student_id: int,
    data: StudentUpdate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    for field, value in data.model_dump(exclude={"parent_ids", "group_ids"}).items():
        setattr(student, field, value)
    _apply_links(db, student, data.parent_ids, data.group_ids)
    log_action(db, actor, "update", "student", student.id, student.full_name, ip=get_client_ip(request))
    db.commit()
    db.refresh(student)
    return student


@router.delete("/{student_id}", response_model=Message)
def delete_student(
    student_id: int,
    request: Request,
    hard: bool = False,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    name = student.full_name
    if hard:
        db.delete(student)
        action = "delete"
    else:
        student.status = "inactive"
        action = "deactivate"
    log_action(db, actor, action, "student", student_id, name, ip=get_client_ip(request))
    db.commit()
    return Message(detail=f"Student {action}d")
