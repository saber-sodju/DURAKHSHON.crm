from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class NotificationOut(ORMModel):
    id: int
    title: str
    body: str
    kind: str
    is_read: bool
    created_at: datetime


class UnreadCount(BaseModel):
    unread: int


class SessionOut(ORMModel):
    id: int
    device_name: str
    user_agent: str
    ip_address: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    is_current: bool = False


class BackupOut(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime
    kind: str  # daily | weekly | monthly | manual
