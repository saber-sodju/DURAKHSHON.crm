from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    get_client_ip, get_current_user, require_staff,
    ensure_teacher_owns_group, accessible_student_ids, get_teacher_profile,
)
from app.db.session import get_db
from app.models import User, Role, Exam, Grade, Group
from app.schemas.academics import ExamCreate, ExamUpdate, ExamOut, GradeBulkCreate, GradeOut
from app.schemas.common import Page, Message
from app.services.audit import log_action
from app.services.notify import notify_student_and_parents

router = APIRouter(prefix="/exams", tags=["exams"])

EDITOR_ROLES = (Role.DIRECTOR.value, Role.ADMIN.value, Role.TEACHER.value)


def grade_label_for(percentage: Decimal) -> str:
    if percentage >= 90:
        return "A"
    if percentage >= 80:
        return "B"
    if percentage >= 70:
        return "C"
    if percentage >= 60:
        return "D"
    return "F"


def _serialize_exam(exam: Exam) -> ExamOut:
    out = ExamOut.model_validate(exam)
    out.group_name = exam.group.name if exam.group else None
    out.teacher_name = exam.teacher.full_name if exam.teacher else None
    out.grades_count = len(exam.grades)
    return out


def _serialize_grade(grade: Grade) -> GradeOut:
    out = GradeOut.model_validate(grade)
    out.student_name = grade.student.full_name if grade.student else None
    if grade.exam:
        out.exam_title = grade.exam.title
        out.exam_date = grade.exam.exam_date
        out.max_score = grade.exam.max_score
        out.group_name = grade.exam.group.name if grade.exam.group else None
    return out


@router.get("", response_model=Page[ExamOut])
def list_exams(
    group_id: int | None = None,
    status_filter: str = Query("", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Exam).options(
        joinedload(Exam.group), joinedload(Exam.teacher), joinedload(Exam.grades),
    )
    if user.role == Role.TEACHER.value:
        teacher = get_teacher_profile(db, user)
        query = query.join(Group, Exam.group_id == Group.id).filter(Group.teacher_id == teacher.id)
    elif user.role in (Role.STUDENT.value, Role.PARENT.value):
        from app.models import group_students
        allowed = accessible_student_ids(db, user) or {0}
        group_ids = {
            gid for (gid,) in db.query(group_students.c.group_id)
            .filter(group_students.c.student_id.in_(allowed)).all()
        }
        query = query.filter(Exam.group_id.in_(group_ids or {0}), Exam.status != "draft")
    if group_id is not None:
        query = query.filter(Exam.group_id == group_id)
    if status_filter:
        query = query.filter(Exam.status == status_filter)
    total = query.count()
    exams = query.order_by(Exam.exam_date.desc(), Exam.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=[_serialize_exam(e) for e in exams], total=total, page=page, page_size=page_size)


@router.post("", response_model=ExamOut, status_code=status.HTTP_201_CREATED)
def create_exam(
    data: ExamCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    group = ensure_teacher_owns_group(db, user, data.group_id)
    teacher_id = group.teacher_id
    if user.role == Role.TEACHER.value:
        teacher_id = get_teacher_profile(db, user).id
    exam = Exam(**data.model_dump(), teacher_id=teacher_id)
    db.add(exam)
    db.flush()
    log_action(db, user, "create", "exam", exam.id, exam.title, ip=get_client_ip(request))
    db.commit()
    db.refresh(exam)
    return _serialize_exam(exam)


@router.put("/{exam_id}", response_model=ExamOut)
def update_exam(
    exam_id: int,
    data: ExamUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    ensure_teacher_owns_group(db, user, exam.group_id)
    if data.group_id != exam.group_id:
        ensure_teacher_owns_group(db, user, data.group_id)
    was_published = exam.status == "published"
    for field, value in data.model_dump().items():
        setattr(exam, field, value)
    if exam.status == "published" and not was_published:
        for grade in exam.grades:
            if grade.student:
                notify_student_and_parents(
                    db, grade.student,
                    title="New grade published",
                    body=f"Grade for '{exam.title}': {grade.score}/{exam.max_score} ({grade.percentage}%)",
                    kind="grade",
                )
    log_action(db, user, "update", "exam", exam.id, exam.title, ip=get_client_ip(request))
    db.commit()
    db.refresh(exam)
    return _serialize_exam(exam)


@router.delete("/{exam_id}", response_model=Message)
def delete_exam(
    exam_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    ensure_teacher_owns_group(db, user, exam.group_id)
    log_action(db, user, "delete", "exam", exam_id, exam.title, ip=get_client_ip(request))
    db.delete(exam)
    db.commit()
    return Message(detail="Exam deleted")


# ---------- Grades ----------

grades_router = APIRouter(prefix="/grades", tags=["grades"])


def _parent_can_view_group(db: Session, user: User, group_id: int) -> bool:
    """A parent may see the whole group's grades if at least one of their children is in it."""
    from app.api.deps import get_parent_profile
    from app.models import group_students
    parent = get_parent_profile(db, user)
    child_ids = {c.id for c in parent.children}
    if not child_ids:
        return False
    return db.query(group_students).filter(
        group_students.c.group_id == group_id,
        group_students.c.student_id.in_(child_ids),
    ).first() is not None


@grades_router.get("", response_model=Page[GradeOut])
def list_grades(
    exam_id: int | None = None,
    student_id: int | None = None,
    group_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Grade).options(
        joinedload(Grade.student),
        joinedload(Grade.exam).joinedload(Exam.group),
    )
    # A parent asking for a specific group their child belongs to sees the
    # whole group's grades (published exams only) — otherwise only own children.
    group_wide_for_parent = (
        user.role == Role.PARENT.value
        and group_id is not None
        and _parent_can_view_group(db, user, group_id)
    )
    if not group_wide_for_parent:
        allowed = accessible_student_ids(db, user)
        if allowed is not None:
            query = query.filter(Grade.student_id.in_(allowed or {0}))
    if user.role in (Role.STUDENT.value, Role.PARENT.value):
        query = query.join(Exam, Grade.exam_id == Exam.id).filter(Exam.status != "draft")
        if group_id is not None:
            query = query.filter(Exam.group_id == group_id)
    elif group_id is not None:
        query = query.join(Exam, Grade.exam_id == Exam.id).filter(Exam.group_id == group_id)
    if exam_id is not None:
        query = query.filter(Grade.exam_id == exam_id)
    if student_id is not None:
        query = query.filter(Grade.student_id == student_id)
    total = query.count()
    grades = query.order_by(Grade.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=[_serialize_grade(g) for g in grades], total=total, page=page, page_size=page_size)


@grades_router.post("", response_model=list[GradeOut])
def upsert_grades(
    data: GradeBulkCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    exam = db.get(Exam, data.exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    group = ensure_teacher_owns_group(db, user, exam.group_id)
    group_student_ids = {s.id for s in group.students}

    result: list[Grade] = []
    for item in data.items:
        if item.student_id not in group_student_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Student {item.student_id} is not in this exam's group")
        if item.score > exam.max_score:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Score {item.score} exceeds max score {exam.max_score}")
        percentage = (Decimal(item.score) / Decimal(exam.max_score) * 100).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        grade = db.query(Grade).filter(
            Grade.exam_id == data.exam_id, Grade.student_id == item.student_id
        ).first()
        if grade is None:
            grade = Grade(exam_id=data.exam_id, student_id=item.student_id, score=0, percentage=0)
            db.add(grade)
        grade.score = item.score
        grade.percentage = percentage
        grade.grade_label = item.grade_label or grade_label_for(percentage)
        grade.comment = item.comment
        grade.created_by_id = user.id
        result.append(grade)

        if exam.status == "published":
            student = next((s for s in group.students if s.id == item.student_id), None)
            if student is not None:
                notify_student_and_parents(
                    db, student,
                    title="New grade published",
                    body=f"Grade for '{exam.title}': {item.score}/{exam.max_score} ({percentage}%)",
                    kind="grade",
                )

    log_action(db, user, "grade", "exam", exam.id,
               f"exam={exam.title} grades={len(data.items)}", ip=get_client_ip(request))
    db.commit()
    for g in result:
        db.refresh(g)
    return [_serialize_grade(g) for g in result]
