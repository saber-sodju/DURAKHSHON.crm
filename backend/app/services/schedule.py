from datetime import time

from sqlalchemy.orm import Session

from app.models import Group, Schedule


def find_teacher_conflict(
    db: Session,
    teacher_id: int | None,
    day_of_week: int,
    start_time: time,
    end_time: time,
    exclude_group_id: int | None = None,
) -> Schedule | None:
    """Return an existing schedule slot that overlaps with the given slot for the same teacher."""
    if teacher_id is None:
        return None
    query = (
        db.query(Schedule)
        .join(Group, Schedule.group_id == Group.id)
        .filter(
            Group.teacher_id == teacher_id,
            Group.status == "active",
            Schedule.day_of_week == day_of_week,
            Schedule.start_time < end_time,
            Schedule.end_time > start_time,
        )
    )
    if exclude_group_id is not None:
        query = query.filter(Schedule.group_id != exclude_group_id)
    return query.first()
