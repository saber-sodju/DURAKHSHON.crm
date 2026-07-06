from datetime import date, time, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel
from app.schemas.people import StudentTag


class TeacherTag(ORMModel):
    id: int
    first_name: str
    last_name: str


class ScheduleBase(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    room: str = Field(default="", max_length=50)

    @model_validator(mode="after")
    def validate_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ScheduleCreate(ScheduleBase):
    group_id: int


class ScheduleUpdate(ScheduleBase):
    pass


class ScheduleOut(ORMModel):
    id: int
    group_id: int
    day_of_week: int
    start_time: time
    end_time: time
    room: str
    group_name: str | None = None
    teacher_name: str | None = None


class GroupBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    course_name: str = Field(min_length=1, max_length=100)
    teacher_id: int | None = None
    price_per_month: Decimal = Field(default=Decimal("0"), ge=0)
    status: str = Field(default="active")
    start_date: date | None = None
    end_date: date | None = None
    room: str = Field(default="", max_length=50)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("active", "inactive"):
            raise ValueError("status must be 'active' or 'inactive'")
        return v


class GroupCreate(GroupBase):
    student_ids: list[int] = []
    schedules: list[ScheduleBase] = []


class GroupUpdate(GroupBase):
    student_ids: list[int] | None = None
    schedules: list[ScheduleBase] | None = None


class GroupOut(ORMModel):
    id: int
    name: str
    course_name: str
    teacher_id: int | None
    price_per_month: Decimal
    status: str
    start_date: date | None
    end_date: date | None
    room: str
    created_at: datetime
    teacher: TeacherTag | None = None
    students: list[StudentTag] = []
    schedules: list[ScheduleOut] = []


class GroupStudentsUpdate(BaseModel):
    student_ids: list[int]
