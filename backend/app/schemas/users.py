from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import Role
from app.schemas.common import ORMModel

ASSIGNABLE_ROLES = {r.value for r in Role}


class UserOut(ORMModel):
    id: int
    username: str
    email: str | None
    role: str
    full_name: str
    is_active: bool
    must_change_password: bool = False
    last_login_at: datetime | None = None
    created_at: datetime


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_.@-]+$")
    email: EmailStr | None = None
    password: str = Field(min_length=8, max_length=200)
    role: str
    full_name: str = Field(default="", max_length=200)
    is_active: bool = True
    # optional link to an existing profile
    profile_id: int | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ASSIGNABLE_ROLES:
            raise ValueError(f"role must be one of {sorted(ASSIGNABLE_ROLES)}")
        return v


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)
    is_active: bool | None = None


class AuditLogOut(ORMModel):
    id: int
    user_id: int | None
    action: str
    entity: str
    entity_id: int | None
    detail: str
    ip_address: str
    created_at: datetime
    username: str | None = None
