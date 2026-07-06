from datetime import datetime, date

from sqlalchemy import String, Date, DateTime, ForeignKey, Text, Numeric, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

PAYMENT_STATUSES = ("paid", "unpaid", "partial", "overdue")
PAYMENT_METHODS = ("cash", "card", "bank_transfer", "other")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("student_id", "group_id", "month", "year", name="uq_payment_student_group_month_year"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    month: Mapped[int] = mapped_column(Integer, index=True)  # 1..12
    year: Mapped[int] = mapped_column(Integer, index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    paid_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="unpaid", index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    method: Mapped[str] = mapped_column(String(20), default="cash")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    student = relationship("Student")
    group = relationship("Group")
