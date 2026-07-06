from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    get_client_ip, get_current_user, require_staff,
    ensure_teacher_owns_group, accessible_student_ids, get_teacher_profile,
)
from app.db.session import get_db
from app.models import User, Role, AttendanceRecord, Student
from app.schemas.academics import AttendanceBulkCreate, AttendanceUpdate, AttendanceOut
from app.schemas.common import Page, Message
from app.services.audit import log_action
from app.services.notify import notify_student_and_parents

router = APIRouter(prefix="/attendance", tags=["attendance"])

MARKER_ROLES = (Role.DIRECTOR.value, Role.ADMIN.value, Role.TEACHER.value)


def _serialize(rec: AttendanceRecord) -> AttendanceOut:
    out = AttendanceOut.model_validate(rec)
    out.student_name = rec.student.full_name if rec.student else None
    out.group_name = rec.group.name if rec.group else None
    out.teacher_name = rec.teacher.full_name if rec.teacher else None
    return out


@router.get("", response_model=Page[AttendanceOut])
def list_attendance(
    group_id: int | None = None,
    student_id: int | None = None,
    teacher_id: int | None = None,
    status_filter: str = Query("", alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(AttendanceRecord).options(
        joinedload(AttendanceRecord.student),
        joinedload(AttendanceRecord.group),
        joinedload(AttendanceRecord.teacher),
    )
    allowed = accessible_student_ids(db, user)
    if allowed is not None:
        query = query.filter(AttendanceRecord.student_id.in_(allowed or {0}))
    if group_id is not None:
        query = query.filter(AttendanceRecord.group_id == group_id)
    if student_id is not None:
        query = query.filter(AttendanceRecord.student_id == student_id)
    if teacher_id is not None:
        query = query.filter(AttendanceRecord.teacher_id == teacher_id)
    if status_filter:
        query = query.filter(AttendanceRecord.status == status_filter)
    if date_from is not None:
        query = query.filter(AttendanceRecord.date >= date_from)
    if date_to is not None:
        query = query.filter(AttendanceRecord.date <= date_to)
    total = query.count()
    records = (
        query.order_by(AttendanceRecord.date.desc(), AttendanceRecord.id.desc())
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    return Page(items=[_serialize(r) for r in records], total=total, page=page, page_size=page_size)


@router.post("", response_model=list[AttendanceOut])
def mark_attendance(
    data: AttendanceBulkCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upsert attendance for a group and date: existing records are updated, not duplicated."""
    if user.role not in MARKER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    group = ensure_teacher_owns_group(db, user, data.group_id)

    teacher_id = group.teacher_id
    if user.role == Role.TEACHER.value:
        teacher_id = get_teacher_profile(db, user).id

    group_student_ids = {s.id for s in group.students}
    result: list[AttendanceRecord] = []
    for item in data.items:
        if item.student_id not in group_student_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Student {item.student_id} is not in this group")
        record = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.student_id == item.student_id,
                AttendanceRecord.group_id == data.group_id,
                AttendanceRecord.date == data.date,
            )
            .first()
        )
        if record is None:
            record = AttendanceRecord(
                student_id=item.student_id, group_id=data.group_id,
                teacher_id=teacher_id, date=data.date,
            )
            db.add(record)
        was_absent = record.status == "absent" if record.id else False
        record.status = item.status
        record.note = item.note
        result.append(record)

        if item.status == "absent" and not was_absent:
            student = db.get(Student, item.student_id)
            if student is not None:
                notify_student_and_parents(
                    db, student,
                    title="Absence recorded",
                    body=f"{student.full_name} was marked absent in {group.name} on {data.date.isoformat()}",
                    kind="attendance",
                )

    log_action(db, user, "mark", "attendance", group.id,
               f"group={group.name} date={data.date.isoformat()} records={len(data.items)}",
               ip=get_client_ip(request))
    db.commit()
    for r in result:
        db.refresh(r)
    return [_serialize(r) for r in result]


@router.put("/{record_id}", response_model=AttendanceOut)
def update_attendance(
    record_id: int,
    data: AttendanceUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in MARKER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    record = db.get(AttendanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
    ensure_teacher_owns_group(db, user, record.group_id)
    record.status = data.status
    record.note = data.note
    log_action(db, user, "update", "attendance", record.id, ip=get_client_ip(request))
    db.commit()
    db.refresh(record)
    return _serialize(record)


@router.delete("/{record_id}", response_model=Message)
def delete_attendance(
    record_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    record = db.get(AttendanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
    db.delete(record)
    log_action(db, actor, "delete", "attendance", record_id, ip=get_client_ip(request))
    db.commit()
    return Message(detail="Attendance record deleted")
