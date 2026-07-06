from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel


class GroupTag(ORMModel):
    id: int
    name: str


class ParentTag(ORMModel):
    id: int
    first_name: str
    last_name: str


class StudentTag(ORMModel):
    id: int
    first_name: str
    last_name: str


# ---------- Students ----------

class StudentBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(default="", max_length=30)
    email: str = Field(default="", max_length=255)
    date_of_birth: date | None = None
    gender: str = Field(default="", max_length=10)
    status: str = Field(default="active")
    enrollment_date: date | None = None
    notes: str = Field(default="", max_length=5000)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("active", "inactive"):
            raise ValueError("status must be 'active' or 'inactive'")
        return v

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: str) -> str:
        if v not in ("", "male", "female"):
            raise ValueError("gender must be 'male', 'female' or empty")
        return v


class StudentCreate(StudentBase):
    parent_ids: list[int] = []
    group_ids: list[int] = []


class StudentUpdate(StudentBase):
    parent_ids: list[int] | None = None
    group_ids: list[int] | None = None


class StudentOut(ORMModel):
    id: int
    user_id: int | None
    first_name: str
    last_name: str
    phone: str
    email: str
    date_of_birth: date | None
    gender: str
    status: str
    enrollment_date: date | None
    notes: str
    created_at: datetime
    parents: list[ParentTag] = []
    groups: list[GroupTag] = []


# ---------- Teachers ----------

class TeacherBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(default="", max_length=30)
    email: str = Field(default="", max_length=255)
    subject: str = Field(default="", max_length=100)
    status: str = Field(default="active")
    salary: Decimal | None = Field(default=None, ge=0)
    notes: str = Field(default="", max_length=5000)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("active", "inactive"):
            raise ValueError("status must be 'active' or 'inactive'")
        return v


class TeacherCreate(TeacherBase):
    pass


class TeacherUpdate(TeacherBase):
    pass


class TeacherOut(ORMModel):
    id: int
    user_id: int | None
    first_name: str
    last_name: str
    phone: str
    email: str
    subject: str
    status: str
    salary: Decimal | None
    notes: str
    created_at: datetime
    groups: list[GroupTag] = []


# ---------- Parents ----------

class ParentBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(default="", max_length=30)
    email: str = Field(default="", max_length=255)
    status: str = Field(default="active")
    notes: str = Field(default="", max_length=5000)


class ParentCreate(ParentBase):
    child_ids: list[int] = []


class ParentUpdate(ParentBase):
    child_ids: list[int] | None = None


class ParentOut(ORMModel):
    id: int
    user_id: int | None
    first_name: str
    last_name: str
    phone: str
    email: str
    status: str
    notes: str
    created_at: datetime
    children: list[StudentTag] = []
