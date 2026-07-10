"""Remove seeded demo data from a database — safely, without touching real records.

Demo data is identified by the markers the seed script uses:
  * user accounts with an @durakhshon.demo email or a known demo username
  * the specific sample people and groups created by app/seed.py

Real users/students/groups created later do NOT match these markers and are left
untouched. Deleting demo students and groups cascades to their attendance,
grades, exams, payments and schedules; deleting demo users cascades to their
notifications and sessions.

Usage:
    python -m app.commands.purge_demo_data          # dry run — shows what would go
    python -m app.commands.purge_demo_data --yes    # actually delete
"""
import argparse
import sys

from sqlalchemy import or_

from app.db.session import SessionLocal
from app.models import (
    User, Student, Teacher, Parent, Group,
    AttendanceRecord, Grade, Exam, Payment, Schedule, Notification, UserSession,
    group_students, parent_students,
)

DEMO_EMAIL_DOMAIN = "@durakhshon.demo"
DEMO_USERNAMES = {"director", "admin", "teacher", "teacher2", "parent", "student"}
DEMO_STUDENT_NAMES = {("Mike", "Brown"), ("Emma", "Davis"), ("James", "Wilson"), ("Anna", "Brown")}
DEMO_TEACHER_NAMES = {("Sarah", "Williams"), ("David", "Clark")}
DEMO_PARENT_NAMES = {("Linda", "Brown")}
DEMO_GROUP_NAMES = {"Math A1", "English B2"}


def _demo_users(db):
    return db.query(User).filter(
        or_(User.email.ilike(f"%{DEMO_EMAIL_DOMAIN}"), User.username.in_(DEMO_USERNAMES))
    ).all()


def _by_name(rows, names):
    return [r for r in rows if (r.first_name, r.last_name) in names]


def collect(db):
    users = _demo_users(db)
    user_ids = {u.id for u in users}
    students = [s for s in db.query(Student).all()
                if s.user_id in user_ids or (s.first_name, s.last_name) in DEMO_STUDENT_NAMES]
    teachers = [t for t in db.query(Teacher).all()
                if t.user_id in user_ids or (t.first_name, t.last_name) in DEMO_TEACHER_NAMES]
    parents = [p for p in db.query(Parent).all()
               if p.user_id in user_ids or (p.first_name, p.last_name) in DEMO_PARENT_NAMES]
    groups = db.query(Group).filter(Group.name.in_(DEMO_GROUP_NAMES)).all()
    return users, students, teachers, parents, groups


def purge(apply: bool) -> None:
    db = SessionLocal()
    try:
        users, students, teachers, parents, groups = collect(db)
        print("Demo data found:")
        print(f"  users:    {len(users)}  {[u.username for u in users]}")
        print(f"  students: {len(students)} {[s.full_name for s in students]}")
        print(f"  teachers: {len(teachers)} {[t.full_name for t in teachers]}")
        print(f"  parents:  {len(parents)}  {[p.full_name for p in parents]}")
        print(f"  groups:   {len(groups)}  {[g.name for g in groups]}")

        if not apply:
            print("\nDry run — nothing deleted. Re-run with --yes to delete.")
            return

        student_ids = [s.id for s in students]
        group_ids = [g.id for g in groups]
        teacher_ids = [t.id for t in teachers]
        parent_ids = [p.id for p in parents]
        user_ids = [u.id for u in users]
        exam_ids = [e.id for e in db.query(Exam.id).filter(Exam.group_id.in_(group_ids or [0]))]

        def _del(model, cond):
            db.query(model).filter(cond).delete(synchronize_session=False)

        # delete dependent rows first — explicit, so it works regardless of whether
        # the DB backend enforces ON DELETE CASCADE (SQLite doesn't by default)
        _del(Grade, or_(Grade.student_id.in_(student_ids or [0]), Grade.exam_id.in_(exam_ids or [0])))
        _del(Exam, Exam.group_id.in_(group_ids or [0]))
        _del(AttendanceRecord, or_(AttendanceRecord.student_id.in_(student_ids or [0]),
                                   AttendanceRecord.group_id.in_(group_ids or [0])))
        _del(Payment, or_(Payment.student_id.in_(student_ids or [0]),
                          Payment.group_id.in_(group_ids or [0])))
        _del(Schedule, Schedule.group_id.in_(group_ids or [0]))
        db.execute(group_students.delete().where(
            or_(group_students.c.group_id.in_(group_ids or [0]),
                group_students.c.student_id.in_(student_ids or [0]))))
        db.execute(parent_students.delete().where(
            or_(parent_students.c.parent_id.in_(parent_ids or [0]),
                parent_students.c.student_id.in_(student_ids or [0]))))
        _del(Notification, Notification.user_id.in_(user_ids or [0]))
        _del(UserSession, UserSession.user_id.in_(user_ids or [0]))

        _del(Group, Group.id.in_(group_ids or [0]))
        _del(Student, Student.id.in_(student_ids or [0]))
        _del(Teacher, Teacher.id.in_(teacher_ids or [0]))
        _del(Parent, Parent.id.in_(parent_ids or [0]))
        _del(User, User.id.in_(user_ids or [0]))
        db.commit()
        print("\nDemo data deleted.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="Actually delete (default is dry run)")
    args = parser.parse_args()
    if args.yes:
        confirm = input("This permanently deletes demo data. Make sure you have a backup. Continue? [y/N] ")
        if confirm.strip().lower() != "y":
            print("Aborted.")
            sys.exit(1)
    purge(args.yes)
