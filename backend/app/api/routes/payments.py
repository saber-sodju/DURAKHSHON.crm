from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, get_current_user, require_staff, accessible_student_ids
from app.db.session import get_db
from app.models import User, Role, Payment, Student, Group
from app.schemas.common import Page, Message
from app.schemas.finance import PaymentCreate, PaymentUpdate, PaymentOut
from app.services.audit import log_action
from app.services.notify import notify_student_and_parents
from app.services.payments import compute_payment_status

router = APIRouter(prefix="/payments", tags=["payments"])

VIEWER_ROLES = (Role.DIRECTOR.value, Role.ADMIN.value, Role.PARENT.value, Role.STUDENT.value)


def _serialize(payment: Payment) -> PaymentOut:
    out = PaymentOut.model_validate(payment)
    out.student_name = payment.student.full_name if payment.student else None
    out.group_name = payment.group.name if payment.group else None
    return out


def _refresh_overdue(db: Session, payments: list[Payment]) -> None:
    """Keep stored status in sync with the due-date rule when records are read."""
    changed = False
    for payment in payments:
        new_status = compute_payment_status(payment.amount, payment.paid_amount, payment.due_date)
        if payment.status != new_status:
            payment.status = new_status
            changed = True
    if changed:
        db.commit()


@router.get("", response_model=Page[PaymentOut])
def list_payments(
    search: str = "",
    student_id: int | None = None,
    group_id: int | None = None,
    status_filter: str = Query("", alias="status"),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in VIEWER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Teachers do not have access to financial data")
    query = db.query(Payment).options(joinedload(Payment.student), joinedload(Payment.group))
    allowed = accessible_student_ids(db, user)
    if allowed is not None:
        query = query.filter(Payment.student_id.in_(allowed or {0}))
    if search:
        like = f"%{search}%"
        query = query.join(Student).filter(
            (Student.first_name.ilike(like)) | (Student.last_name.ilike(like))
        )
    if student_id is not None:
        query = query.filter(Payment.student_id == student_id)
    if group_id is not None:
        query = query.filter(Payment.group_id == group_id)
    if month is not None:
        query = query.filter(Payment.month == month)
    if year is not None:
        query = query.filter(Payment.year == year)

    all_matching = query.all()
    _refresh_overdue(db, all_matching)

    if status_filter:
        query = query.filter(Payment.status == status_filter)
    total = query.count()
    payments = (
        query.order_by(Payment.year.desc(), Payment.month.desc(), Payment.id.desc())
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    return Page(items=[_serialize(p) for p in payments], total=total, page=page, page_size=page_size)


def _validate_refs(db: Session, data: PaymentCreate | PaymentUpdate) -> tuple[Student, Group | None]:
    student = db.get(Student, data.student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    group = None
    if data.group_id is not None:
        group = db.get(Group, data.group_id)
        if group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return student, group


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    data: PaymentCreate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student, group = _validate_refs(db, data)
    duplicate = db.query(Payment).filter(
        Payment.student_id == data.student_id,
        Payment.group_id == data.group_id,
        Payment.month == data.month,
        Payment.year == data.year,
    ).first()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="A payment for this student, group and month already exists")

    payment = Payment(**data.model_dump())
    payment.status = compute_payment_status(data.amount, data.paid_amount, data.due_date)
    if payment.status == "paid" and payment.paid_date is None:
        payment.paid_date = date.today()
    db.add(payment)
    db.flush()

    if payment.status in ("unpaid", "partial", "overdue"):
        notify_student_and_parents(
            db, student,
            title="Payment due",
            body=f"Payment of {data.amount} for {group.name if group else 'tuition'} "
                 f"({data.month:02d}/{data.year}) — status: {payment.status}",
            kind="payment",
        )
    log_action(db, actor, "create", "payment", payment.id,
               f"student={student.full_name} {data.month:02d}/{data.year} amount={data.amount}",
               ip=get_client_ip(request))
    db.commit()
    db.refresh(payment)
    return _serialize(payment)


@router.put("/{payment_id}", response_model=PaymentOut)
def update_payment(
    payment_id: int,
    data: PaymentUpdate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    student, _ = _validate_refs(db, data)
    was_paid = payment.status == "paid"
    for field, value in data.model_dump().items():
        setattr(payment, field, value)
    payment.status = compute_payment_status(payment.amount, payment.paid_amount, payment.due_date)
    if payment.status == "paid" and payment.paid_date is None:
        payment.paid_date = date.today()
    if payment.status == "paid" and not was_paid:
        notify_student_and_parents(
            db, student,
            title="Payment received",
            body=f"Payment for {payment.month:02d}/{payment.year} has been marked as paid. Thank you!",
            kind="payment",
        )
    log_action(db, actor, "update", "payment", payment.id,
               f"student={student.full_name} status={payment.status}", ip=get_client_ip(request))
    db.commit()
    db.refresh(payment)
    return _serialize(payment)


@router.delete("/{payment_id}", response_model=Message)
def delete_payment(
    payment_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    log_action(db, actor, "delete", "payment", payment_id,
               f"student_id={payment.student_id} {payment.month:02d}/{payment.year}", ip=get_client_ip(request))
    db.delete(payment)
    db.commit()
    return Message(detail="Payment deleted")
