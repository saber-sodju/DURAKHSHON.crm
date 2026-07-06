from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_client_ip, get_current_user, require_staff, get_teacher_profile
from app.db.session import get_db
from app.models import User, Role, Group, Student, Teacher, Schedule
from app.schemas.common import Page, Message
from app.schemas.group import (
    GroupCreate, GroupUpdate, GroupOut, GroupStudentsUpdate,
    ScheduleBase, ScheduleOut,
)
from app.services.audit import log_action
from app.services.schedule import find_teacher_conflict

router = APIRouter(prefix="/groups", tags=["groups"])

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _check_teacher(db: Session, teacher_id: int | None) -> None:
    if teacher_id is not None and db.get(Teacher, teacher_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")


def _check_conflicts(db: Session, teacher_id: int | None, slots: list[ScheduleBase],
                     exclude_group_id: int | None = None) -> None:
    for slot in slots:
        conflict = find_teacher_conflict(
            db, teacher_id, slot.day_of_week, slot.start_time, slot.end_time, exclude_group_id
        )
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Teacher schedule conflict on {DAY_NAMES[slot.day_of_week]}: "
                    f"group '{conflict.group.name}' already has a lesson "
                    f"{conflict.start_time:%H:%M}–{conflict.end_time:%H:%M}"
                ),
            )
    # also check the new slots against each other
    for i, a in enumerate(slots):
        for b in slots[i + 1:]:
            if a.day_of_week == b.day_of_week and a.start_time < b.end_time and b.start_time < a.end_time:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                    detail="Schedule slots overlap each other")


def _apply_students(db: Session, group: Group, student_ids: list[int] | None) -> None:
    if student_ids is None:
        return
    students = db.query(Student).filter(Student.id.in_(student_ids)).all() if student_ids else []
    if len(students) != len(set(student_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more students not found")
    group.students = students


@router.get("", response_model=Page[GroupOut])
def list_groups(
    search: str = "",
    status_filter: str = Query("", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Group).options(
        selectinload(Group.students), selectinload(Group.teacher), selectinload(Group.schedules),
    )
    if user.role == Role.TEACHER.value:
        teacher = get_teacher_profile(db, user)
        query = query.filter(Group.teacher_id == teacher.id)
    elif user.role not in (Role.DIRECTOR.value, Role.ADMIN.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Group.name.ilike(like), Group.course_name.ilike(like)))
    if status_filter:
        query = query.filter(Group.status == status_filter)
    total = query.count()
    items = query.order_by(Group.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{group_id}", response_model=GroupOut)
def get_group(group_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if user.role == Role.TEACHER.value:
        teacher = get_teacher_profile(db, user)
        if group.teacher_id != teacher.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")
    elif user.role == Role.STUDENT.value:
        from app.api.deps import get_student_profile
        student = get_student_profile(db, user)
        if student.id not in {s.id for s in group.students}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")
    elif user.role == Role.PARENT.value:
        from app.api.deps import get_parent_profile
        parent = get_parent_profile(db, user)
        child_ids = {c.id for c in parent.children}
        if not child_ids & {s.id for s in group.students}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")
    return group


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    data: GroupCreate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    _check_teacher(db, data.teacher_id)
    _check_conflicts(db, data.teacher_id, data.schedules)
    group = Group(**data.model_dump(exclude={"student_ids", "schedules"}))
    _apply_students(db, group, data.student_ids)
    group.schedules = [Schedule(**slot.model_dump()) for slot in data.schedules]
    db.add(group)
    db.flush()
    log_action(db, actor, "create", "group", group.id, group.name, ip=get_client_ip(request))
    db.commit()
    db.refresh(group)
    return group


@router.put("/{group_id}", response_model=GroupOut)
def update_group(
    group_id: int,
    data: GroupUpdate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    _check_teacher(db, data.teacher_id)
    if data.schedules is not None:
        _check_conflicts(db, data.teacher_id, data.schedules, exclude_group_id=group_id)
    for field, value in data.model_dump(exclude={"student_ids", "schedules"}).items():
        setattr(group, field, value)
    _apply_students(db, group, data.student_ids)
    if data.schedules is not None:
        group.schedules = [Schedule(**slot.model_dump()) for slot in data.schedules]
    log_action(db, actor, "update", "group", group.id, group.name, ip=get_client_ip(request))
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}", response_model=Message)
def delete_group(
    group_id: int,
    request: Request,
    hard: bool = False,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    name = group.name
    if hard:
        db.delete(group)
        action = "delete"
    else:
        group.status = "inactive"
        action = "deactivate"
    log_action(db, actor, action, "group", group_id, name, ip=get_client_ip(request))
    db.commit()
    return Message(detail=f"Group {action}d")


@router.post("/{group_id}/students", response_model=GroupOut)
def set_group_students(
    group_id: int,
    data: GroupStudentsUpdate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    _apply_students(db, group, data.student_ids)
    log_action(db, actor, "update", "group", group.id, f"students={data.student_ids}", ip=get_client_ip(request))
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}/students/{student_id}", response_model=GroupOut)
def remove_group_student(
    group_id: int,
    student_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    group.students = [s for s in group.students if s.id != student_id]
    log_action(db, actor, "update", "group", group.id, f"removed student {student_id}", ip=get_client_ip(request))
    db.commit()
    db.refresh(group)
    return group
