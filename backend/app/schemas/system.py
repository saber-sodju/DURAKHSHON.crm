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
