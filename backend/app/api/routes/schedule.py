from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    get_client_ip, get_current_user, require_staff,
    get_teacher_profile, get_student_profile, get_parent_profile,
)
from app.db.session import get_db
from app.models import User, Role, Group, Schedule
from app.schemas.common import Message
from app.schemas.group import ScheduleCreate, ScheduleUpdate, ScheduleOut
from app.services.audit import log_action
from app.services.schedule import find_teacher_conflict

router = APIRouter(prefix="/schedule", tags=["schedule"])


def _serialize(slot: Schedule) -> ScheduleOut:
    out = ScheduleOut.model_validate(slot)
    out.group_name = slot.group.name if slot.group else None
    teacher = slot.group.teacher if slot.group else None
    out.teacher_name = f"{teacher.first_name} {teacher.last_name}" if teacher else None
    return out


@router.get("", response_model=list[ScheduleOut])
def list_schedule(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Schedule).options(joinedload(Schedule.group).joinedload(Group.teacher))
    if user.role == Role.TEACHER.value:
        teacher = get_teacher_profile(db, user)
        query = query.join(Group).filter(Group.teacher_id == teacher.id)
    elif user.role == Role.STUDENT.value:
        student = get_student_profile(db, user)
        group_ids = [g.id for g in student.groups]
        query = query.filter(Schedule.group_id.in_(group_ids or [0]))
    elif user.role == Role.PARENT.value:
        parent = get_parent_profile(db, user)
        group_ids = {g.id for child in parent.children for g in child.groups}
        query = query.filter(Schedule.group_id.in_(group_ids or {0}))
    slots = query.order_by(Schedule.day_of_week, Schedule.start_time).all()
    return [_serialize(s) for s in slots]


@router.post("", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
def create_slot(
    data: ScheduleCreate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    group = db.get(Group, data.group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    conflict = find_teacher_conflict(db, group.teacher_id, data.day_of_week, data.start_time, data.end_time)
    if conflict is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Teacher already has a lesson at this time (group '{conflict.group.name}')")
    slot = Schedule(**data.model_dump())
    db.add(slot)
    db.flush()
    log_action(db, actor, "create", "schedule", slot.id, f"group={group.name}", ip=get_client_ip(request))
    db.commit()
    db.refresh(slot)
    return _serialize(slot)


@router.put("/{slot_id}", response_model=ScheduleOut)
def update_slot(
    slot_id: int,
    data: ScheduleUpdate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    slot = db.get(Schedule, slot_id)
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule slot not found")
    group = slot.group
    conflict = find_teacher_conflict(
        db, group.teacher_id if group else None, data.day_of_week, data.start_time, data.end_time,
        exclude_group_id=slot.group_id,
    )
    if conflict is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Teacher already has a lesson at this time (group '{conflict.group.name}')")
    for field, value in data.model_dump().items():
        setattr(slot, field, value)
    log_action(db, actor, "update", "schedule", slot.id, ip=get_client_ip(request))
    db.commit()
    db.refresh(slot)
    return _serialize(slot)


@router.delete("/{slot_id}", response_model=Message)
def delete_slot(
    slot_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    slot = db.get(Schedule, slot_id)
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule slot not found")
    db.delete(slot)
    log_action(db, actor, "delete", "schedule", slot_id, ip=get_client_ip(request))
    db.commit()
    return Message(detail="Schedule slot deleted")
