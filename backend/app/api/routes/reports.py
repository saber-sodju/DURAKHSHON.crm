import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_staff
from app.db.session import get_db
from app.models import (
    User, Student, Teacher, Group, AttendanceRecord, Payment, Exam, Grade,
)
from app.services.payments import compute_payment_status

router = APIRouter(prefix="/reports", tags=["reports"])


def _csv_response(header: list[str], rows: list[list], filename: str) -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/attendance")
def attendance_report(
    group_id: int | None = None,
    student_id: int | None = None,
    teacher_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    export: str = Query("", pattern="^(|csv)$"),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(AttendanceRecord).options(
        joinedload(AttendanceRecord.student), joinedload(AttendanceRecord.group),
    )
    if group_id is not None:
        query = query.filter(AttendanceRecord.group_id == group_id)
    if student_id is not None:
        query = query.filter(AttendanceRecord.student_id == student_id)
    if teacher_id is not None:
        query = query.filter(AttendanceRecord.teacher_id == teacher_id)
    if date_from is not None:
        query = query.filter(AttendanceRecord.date >= date_from)
    if date_to is not None:
        query = query.filter(AttendanceRecord.date <= date_to)
    records = query.all()

    per_student: dict[int, dict] = {}
    for r in records:
        stats = per_student.setdefault(r.student_id, {
            "student_id": r.student_id,
            "student_name": r.student.full_name if r.student else "",
            "present": 0, "absent": 0, "late": 0, "excused": 0, "total": 0,
        })
        if r.status in stats:
            stats[r.status] += 1
        stats["total"] += 1
    rows = []
    for stats in per_student.values():
        attended = stats["present"] + stats["late"]
        stats["attendance_pct"] = round(attended / stats["total"] * 100, 1) if stats["total"] else 0.0
        rows.append(stats)
    rows.sort(key=lambda s: s["student_name"])

    if export == "csv":
        return _csv_response(
            ["Student", "Present", "Absent", "Late", "Excused", "Total", "Attendance %"],
            [[r["student_name"], r["present"], r["absent"], r["late"], r["excused"], r["total"], r["attendance_pct"]]
             for r in rows],
            "attendance_report.csv",
        )
    return {"items": rows, "total_records": len(records)}


@router.get("/payments")
def payments_report(
    group_id: int | None = None,
    student_id: int | None = None,
    status: str = "",
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
    export: str = Query("", pattern="^(|csv)$"),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(Payment).options(joinedload(Payment.student), joinedload(Payment.group))
    if group_id is not None:
        query = query.filter(Payment.group_id == group_id)
    if student_id is not None:
        query = query.filter(Payment.student_id == student_id)
    if month is not None:
        query = query.filter(Payment.month == month)
    if year is not None:
        query = query.filter(Payment.year == year)
    payments = query.all()

    for p in payments:
        p.status = compute_payment_status(p.amount, p.paid_amount, p.due_date)
    db.commit()
    if status:
        payments = [p for p in payments if p.status == status]

    summary = {"paid": 0, "unpaid": 0, "partial": 0, "overdue": 0,
               "total_amount": 0.0, "total_paid": 0.0, "total_outstanding": 0.0}
    items = []
    for p in payments:
        summary[p.status] = summary.get(p.status, 0) + 1
        summary["total_amount"] += float(p.amount)
        summary["total_paid"] += float(p.paid_amount)
        items.append({
            "id": p.id,
            "student_name": p.student.full_name if p.student else "",
            "group_name": p.group.name if p.group else "",
            "month": p.month, "year": p.year,
            "amount": float(p.amount), "paid_amount": float(p.paid_amount),
            "status": p.status,
            "due_date": p.due_date.isoformat() if p.due_date else None,
            "paid_date": p.paid_date.isoformat() if p.paid_date else None,
        })
    summary["total_outstanding"] = round(summary["total_amount"] - summary["total_paid"], 2)

    if export == "csv":
        return _csv_response(
            ["Student", "Group", "Month", "Year", "Amount", "Paid", "Status", "Due date", "Paid date"],
            [[i["student_name"], i["group_name"], i["month"], i["year"], i["amount"], i["paid_amount"],
              i["status"], i["due_date"] or "", i["paid_date"] or ""] for i in items],
            "payments_report.csv",
        )
    return {"items": items, "summary": summary}


@router.get("/student-progress")
def student_progress_report(
    student_id: int | None = None,
    group_id: int | None = None,
    export: str = Query("", pattern="^(|csv)$"),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(Grade).options(
        joinedload(Grade.student), joinedload(Grade.exam).joinedload(Exam.group),
    )
    if student_id is not None:
        query = query.filter(Grade.student_id == student_id)
    if group_id is not None:
        query = query.join(Exam, Grade.exam_id == Exam.id).filter(Exam.group_id == group_id)
    grades = query.all()

    per_student: dict[int, dict] = {}
    for g in grades:
        stats = per_student.setdefault(g.student_id, {
            "student_id": g.student_id,
            "student_name": g.student.full_name if g.student else "",
            "exams_taken": 0, "avg_percentage": 0.0, "best": 0.0, "worst": 100.0,
        })
        pct = float(g.percentage)
        stats["exams_taken"] += 1
        stats["avg_percentage"] += pct
        stats["best"] = max(stats["best"], pct)
        stats["worst"] = min(stats["worst"], pct)
    rows = []
    for stats in per_student.values():
        if stats["exams_taken"]:
            stats["avg_percentage"] = round(stats["avg_percentage"] / stats["exams_taken"], 1)
        rows.append(stats)
    rows.sort(key=lambda s: -s["avg_percentage"])

    if export == "csv":
        return _csv_response(
            ["Student", "Exams taken", "Average %", "Best %", "Worst %"],
            [[r["student_name"], r["exams_taken"], r["avg_percentage"], r["best"], r["worst"]] for r in rows],
            "student_progress_report.csv",
        )
    return {"items": rows}


@router.get("/teacher-workload")
def teacher_workload_report(
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    teachers = db.query(Teacher).filter(Teacher.status == "active").all()
    items = []
    for t in teachers:
        active_groups = [g for g in t.groups if g.status == "active"]
        student_count = len({s.id for g in active_groups for s in g.students})
        weekly_slots = sum(len(g.schedules) for g in active_groups)
        items.append({
            "teacher_id": t.id,
            "teacher_name": t.full_name,
            "subject": t.subject,
            "groups": len(active_groups),
            "students": student_count,
            "weekly_lessons": weekly_slots,
        })
    items.sort(key=lambda i: -i["groups"])
    return {"items": items}


@router.get("/charts")
def dashboard_charts(
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Data for dashboard charts: monthly payments, attendance trend, student growth."""
    today = date.today()

    # payments collected per month (last 6 months)
    months: list[tuple[int, int]] = []
    y, m = today.year, today.month
    for _i in range(6):
        months.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    months.reverse()

    payments_by_month = []
    for (py, pm) in months:
        paid = db.query(func.coalesce(func.sum(Payment.paid_amount), 0)).filter(
            Payment.year == py, Payment.month == pm
        ).scalar()
        expected = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.year == py, Payment.month == pm
        ).scalar()
        payments_by_month.append({
            "month": f"{py}-{pm:02d}", "collected": float(paid), "expected": float(expected),
        })

    # attendance trend: last 14 days
    attendance_trend = []
    rows = (
        db.query(AttendanceRecord.date, AttendanceRecord.status, func.count(AttendanceRecord.id))
        .group_by(AttendanceRecord.date, AttendanceRecord.status)
        .order_by(AttendanceRecord.date.desc())
        .limit(200)
        .all()
    )
    by_date: dict[str, dict] = {}
    for d, status_val, count in rows:
        entry = by_date.setdefault(d.isoformat(), {"date": d.isoformat(), "present": 0, "absent": 0, "late": 0, "excused": 0})
        entry[status_val] = count
    attendance_trend = sorted(by_date.values(), key=lambda e: e["date"])[-14:]

    # student growth: cumulative enrollments per month (last 6 months)
    student_growth = []
    for (gy, gm) in months:
        end_of_month = date(gy + (1 if gm == 12 else 0), 1 if gm == 12 else gm + 1, 1)
        count = db.query(func.count(Student.id)).filter(Student.created_at < end_of_month).scalar()
        student_growth.append({"month": f"{gy}-{gm:02d}", "students": count})

    return {
        "payments_by_month": payments_by_month,
        "attendance_trend": attendance_trend,
        "student_growth": student_growth,
    }
