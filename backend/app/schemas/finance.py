from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.finance import PAYMENT_METHODS
from app.schemas.common import ORMModel


class PaymentBase(BaseModel):
    student_id: int
    group_id: int | None = None
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=2100)
    amount: Decimal = Field(gt=0)
    paid_amount: Decimal = Field(default=Decimal("0"), ge=0)
    due_date: date | None = None
    paid_date: date | None = None
    method: str = Field(default="cash")
    note: str = Field(default="", max_length=2000)

    @field_validator("method")
    @classmethod
    def validate_method(cls, v: str) -> str:
        if v not in PAYMENT_METHODS:
            raise ValueError(f"method must be one of {PAYMENT_METHODS}")
        return v


class PaymentCreate(PaymentBase):
    pass


class PaymentUpdate(PaymentBase):
    pass


class PaymentOut(ORMModel):
    id: int
    student_id: int
    group_id: int | None
    month: int
    year: int
    amount: Decimal
    paid_amount: Decimal
    status: str
    due_date: date | None
    paid_date: date | None
    method: str
    note: str
    created_at: datetime
    student_name: str | None = None
    group_name: str | None = None
