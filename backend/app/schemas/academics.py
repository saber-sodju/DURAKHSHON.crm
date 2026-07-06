from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.academics import ATTENDANCE_STATUSES, EXAM_STATUSES
from app.schemas.common import ORMModel


# ---------- Attendance ----------

class AttendanceItem(BaseModel):
    student_id: int
    status: str = "present"
    note: str = Field(default="", max_length=1000)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ATTENDANCE_STATUSES:
            raise ValueError(f"status must be one of {ATTENDANCE_STATUSES}")
        return v


class AttendanceBulkCreate(BaseModel):
    group_id: int
    date: date
    items: list[AttendanceItem]


class AttendanceUpdate(BaseModel):
    status: str
    note: str = Field(default="", max_length=1000)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ATTENDANCE_STATUSES:
            raise ValueError(f"status must be one of {ATTENDANCE_STATUSES}")
        return v


class AttendanceOut(ORMModel):
    id: int
    student_id: int
    group_id: int
    teacher_id: int | None
    date: date
    status: str
    note: str
    student_name: str | None = None
    group_name: str | None = None
    teacher_name: str | None = None


# ---------- Exams ----------

class ExamBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    group_id: int
    exam_date: date
    max_score: Decimal = Field(default=Decimal("100"), gt=0)
    description: str = Field(default="", max_length=5000)
    status: str = Field(default="draft")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in EXAM_STATUSES:
            raise ValueError(f"status must be one of {EXAM_STATUSES}")
        return v


class ExamCreate(ExamBase):
    pass


class ExamUpdate(ExamBase):
    pass


class ExamOut(ORMModel):
    id: int
    title: str
    group_id: int
    teacher_id: int | None
    exam_date: date
    max_score: Decimal
    description: str
    status: str
    created_at: datetime
    group_name: str | None = None
    teacher_name: str | None = None
    grades_count: int = 0


# ---------- Grades ----------

class GradeItem(BaseModel):
    student_id: int
    score: Decimal = Field(ge=0)
    grade_label: str = Field(default="", max_length=20)
    comment: str = Field(default="", max_length=2000)


class GradeBulkCreate(BaseModel):
    exam_id: int
    items: list[GradeItem]


class GradeOut(ORMModel):
    id: int
    exam_id: int
    student_id: int
    score: Decimal
    percentage: Decimal
    grade_label: str
    comment: str
    created_at: datetime
    student_name: str | None = None
    exam_title: str | None = None
    exam_date: date | None = None
    max_score: Decimal | None = None
    group_name: str | None = None
