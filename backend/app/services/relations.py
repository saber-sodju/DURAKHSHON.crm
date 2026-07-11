from sqlalchemy import select, update, insert
from sqlalchemy.orm import Session

from app.models.people import parent_students, Parent


def find_duplicate_parent(db: Session, phone: str, email: str) -> Parent | None:
    """Exact (not fuzzy) match on phone or email — used to warn admins before they
    create a second parent record for someone already in the system."""
    if phone:
        existing = db.query(Parent).filter(Parent.phone == phone).first()
        if existing:
            return existing
    if email:
        existing = db.query(Parent).filter(Parent.email.ilike(email)).first()
        if existing:
            return existing
    return None


def link_parent_student(db: Session, parent_id: int, student_id: int, relation: str = "") -> None:
    """Idempotently links a parent/student pair and (re)sets the relation label,
    without touching the ORM collection (student.parents / parent.children) — safe
    to call alongside existing relationship-based code paths."""
    existing = db.execute(
        select(parent_students.c.parent_id).where(
            parent_students.c.parent_id == parent_id,
            parent_students.c.student_id == student_id,
        )
    ).first()
    if existing is None:
        db.execute(insert(parent_students).values(
            parent_id=parent_id, student_id=student_id, relation_type=relation,
        ))
    elif relation:
        db.execute(update(parent_students).where(
            parent_students.c.parent_id == parent_id,
            parent_students.c.student_id == student_id,
        ).values(relation_type=relation))


def unlink_parent_student(db: Session, parent_id: int, student_id: int) -> bool:
    from sqlalchemy import delete
    result = db.execute(delete(parent_students).where(
        parent_students.c.parent_id == parent_id,
        parent_students.c.student_id == student_id,
    ))
    return result.rowcount > 0


def relation_map_for_student(db: Session, student_id: int) -> dict[int, str]:
    rows = db.execute(
        select(parent_students.c.parent_id, parent_students.c.relation_type)
        .where(parent_students.c.student_id == student_id)
    ).all()
    return {parent_id: relation for parent_id, relation in rows}


def relation_map_for_parent(db: Session, parent_id: int) -> dict[int, str]:
    rows = db.execute(
        select(parent_students.c.student_id, parent_students.c.relation_type)
        .where(parent_students.c.parent_id == parent_id)
    ).all()
    return {student_id: relation for student_id, relation in rows}
