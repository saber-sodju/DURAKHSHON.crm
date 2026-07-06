from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    get_current_user, get_teacher_profile, get_student_profile, get_parent_profile,
)
from app.db.session import get_db
from app.models import (
    User, Role, Student, Teacher, Group, AttendanceRecord, Payment, Grade, Exam, Schedule,
)
from app.services.payments import compute_payment_status

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _staff_dashboard(db: Session) -> dict:
    today = date.today()
    active_students = db.query(func.count(Student.id)).filter(Student.status == "active").scalar()
    active_teachers = db.query(func.count(Teacher.id)).filter(Teacher.status == "active").scalar()
    active_groups = db.query(func.count(Group.id)).filter(Group.status == "active").scalar()

    payments = db.query(Payment).filter(Payment.year == today.year, Payment.month == today.month).all()
    payment_stats = {"paid": 0, "unpaid": 0, "partial": 0, "overdue": 0}
    for p in payments:
        payment_stats[compute_payment_status(p.amount, p.paid_amount, p.due_date)] += 1

    todays = db.query(AttendanceRecord.status, func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.date == today
    ).group_by(AttendanceRecord.status).all()
    attendance_today = {"present": 0, "absent": 0, "late": 0, "excused": 0}
    for status_val, count in todays:
        attendance_today[status_val] = count

    recent_students = [
        {"id": s.id, "name": s.full_name, "status": s.status,
         "parent": s.parents[0].full_name if s.parents else None}
        for s in db.query(Student).options(joinedload(Student.parents))
        .order_by(Student.id.desc()).limit(5).all()
    ]
    recent_payments = [
        {"id": p.id, "student": p.student.full_name if p.student else "",
         "group": p.group.name if p.group else "", "status": p.status, "amount": float(p.amount)}
        for p in db.query(Payment).options(joinedload(Payment.student), joinedload(Payment.group))
        .order_by(Payment.id.desc()).limit(5).all()
    ]

    upcoming_payments = [
        {"id": p.id, "student": p.student.full_name if p.student else "",
         "amount": float(p.amount) - float(p.paid_amount),
         "due_date": p.due_date.isoformat() if p.due_date else None}
        for p in db.query(Payment).options(joinedload(Payment.student))
        .filter(Payment.status.in_(("unpaid", "partial")), Payment.due_date >= today)
        .order_by(Payment.due_date).limit(5).all()
    ]

    weekday = today.weekday()
    upcoming_classes = [
        {"group": s.group.name if s.group else "", "start_time": s.start_time.strftime("%H:%M"),
         "end_time": s.end_time.strftime("%H:%M"),
         "teacher": s.group.teacher.full_name if s.group and s.group.teacher else None, "room": s.room}
        for s in db.query(Schedule).options(joinedload(Schedule.group).joinedload(Group.teacher))
        .filter(Schedule.day_of_week == weekday).order_by(Schedule.start_time).all()
    ]

    return {
        "role": "staff",
        "active_students": active_students,
        "active_teachers": active_teachers,
        "active_groups": active_groups,
        "payments_this_month": payment_stats,
        "attendance_today": attendance_today,
        "recent_students": recent_students,
        "recent_payments": recent_payments,
        "upcoming_payments": upcoming_payments,
        "todays_classes": upcoming_classes,
    }


def _teacher_dashboard(db: Session, user: User) -> dict:
    teacher = get_teacher_profile(db, user)
    today = date.today()
    groups = [g for g in teacher.groups if g.status == "active"]
    group_ids = [g.id for g in groups]

    todays = db.query(AttendanceRecord.status, func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.date == today, AttendanceRecord.group_id.in_(group_ids or [0])
    ).group_by(AttendanceRecord.status).all()
    attendance_today = {"present": 0, "absent": 0, "late": 0, "excused": 0}
    for status_val, count in todays:
        attendance_today[status_val] = count

    weekday = today.weekday()
    todays_lessons = [
        {"group_id": s.group_id, "group": s.group.name if s.group else "",
         "start_time": s.start_time.strftime("%H:%M"), "end_time": s.end_time.strftime("%H:%M"), "room": s.room}
        for s in db.query(Schedule).options(joinedload(Schedule.group))
        .filter(Schedule.group_id.in_(group_ids or [0]), Schedule.day_of_week == weekday)
        .order_by(Schedule.start_time).all()
    ]

    recent_grades = [
        {"student": g.student.full_name if g.student else "",
         "exam": g.exam.title if g.exam else "", "score": float(g.score), "percentage": float(g.percentage)}
        for g in db.query(Grade).options(joinedload(Grade.student), joinedload(Grade.exam))
        .join(Exam, Grade.exam_id == Exam.id)
        .filter(Exam.group_id.in_(group_ids or [0]))
        .order_by(Grade.id.desc()).limit(5).all()
    ]

    return {
        "role": "teacher",
        "my_groups": [
            {"id": g.id, "name": g.name, "course": g.course_name, "students": len(g.students)}
            for g in groups
        ],
        "todays_lessons": todays_lessons,
        "attendance_today": attendance_today,
        "recent_grades": recent_grades,
    }


def _student_payload(db: Session, student: Student) -> dict:
    today = date.today()
    attendance = db.query(AttendanceRecord.status, func.count(AttendanceRecord.id)).filter(
        AttendanceRecord.student_id == student.id
    ).group_by(AttendanceRecord.status).all()
    attendance_stats = {"present": 0, "absent": 0, "late": 0, "excused": 0}
    for status_val, count in attendance:
        attendance_stats[status_val] = count
    total = sum(attendance_stats.values())
    attended = attendance_stats["present"] + attendance_stats["late"]

    grades = [
        {"exam": g.exam.title if g.exam else "", "score": float(g.score),
         "percentage": float(g.percentage), "label": g.grade_label,
         "date": g.exam.exam_date.isoformat() if g.exam else None}
        for g in db.query(Grade).options(joinedload(Grade.exam))
        .join(Exam, Grade.exam_id == Exam.id)
        .filter(Grade.student_id == student.id, Exam.status != "draft")
        .order_by(Grade.id.desc()).limit(5).all()
    ]

    next_payment = (
        db.query(Payment)
        .filter(Payment.student_id == student.id, Payment.status.in_(("unpaid", "partial", "overdue")))
        .order_by(Payment.due_date.is_(None), Payment.due_date)
        .first()
    )

    return {
        "id": student.id,
        "name": student.full_name,
        "groups": [{"id": g.id, "name": g.name, "course": g.course_name} for g in student.groups],
        "attendance": {**attendance_stats,
                       "percentage": round(attended / total * 100, 1) if total else None},
        "recent_grades": grades,
        "next_payment": {
            "amount_due": float(next_payment.amount) - float(next_payment.paid_amount),
            "due_date": next_payment.due_date.isoformat() if next_payment.due_date else None,
            "status": next_payment.status,
            "month": next_payment.month, "year": next_payment.year,
        } if next_payment else None,
    }


def _student_dashboard(db: Session, user: User) -> dict:
    student = get_student_profile(db, user)
    return {"role": "student", "me": _student_payload(db, student)}


def _parent_dashboard(db: Session, user: User) -> dict:
    parent = get_parent_profile(db, user)
    return {"role": "parent", "children": [_student_payload(db, c) for c in parent.children]}


@router.get("")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role in (Role.DIRECTOR.value, Role.ADMIN.value):
        return _staff_dashboard(db)
    if user.role == Role.TEACHER.value:
        return _teacher_dashboard(db, user)
    if user.role == Role.STUDENT.value:
        return _student_dashboard(db, user)
    return _parent_dashboard(db, user)
