from sqlalchemy.orm import Session

from app.models import Notification, Student


def notify_user(db: Session, user_id: int | None, title: str, body: str = "", kind: str = "info") -> None:
    if user_id is None:
        return
    db.add(Notification(user_id=user_id, title=title, body=body, kind=kind))


def notify_student_and_parents(db: Session, student: Student, title: str, body: str = "", kind: str = "info") -> None:
    notify_user(db, student.user_id, title, body, kind)
    for parent in student.parents:
        notify_user(db, parent.user_id, title, body, kind)
