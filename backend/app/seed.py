"""Demo seed script. Run with:  python -m app.seed

Creates demo users (passwords come from env or default demo values),
sample students, teachers, parents, groups, schedules, attendance,
payments, exams and grades. Intended for demo/dev environments only.
"""
import os
from datetime import date, time, timedelta
from decimal import Decimal

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal, engine, Base
from app.models import (
    User, Role, Student, Teacher, Parent, Group, Schedule,
    AttendanceRecord, Payment, Exam, Grade,
)
from app.services.payments import compute_payment_status

DEMO_PASSWORD = os.environ.get("SEED_DEMO_PASSWORD", "Demo1234!")


def seed() -> None:
    if not settings.SEED_DEMO:
        print("SEED_DEMO is not enabled — skipping demo seed (this is correct for production).")
        return
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("Database already seeded — skipping.")
            return

        def make_user(username: str, role: str, full_name: str, email: str | None = None) -> User:
            user = User(
                username=username, email=email, role=role, full_name=full_name,
                password_hash=hash_password(DEMO_PASSWORD),
            )
            db.add(user)
            db.flush()
            return user

        director = make_user("director", Role.DIRECTOR.value, "Alex Johnson", "director@durakhshon.demo")
        admin = make_user("admin", Role.ADMIN.value, "Nilufar Karimova", "admin@durakhshon.demo")
        teacher_user = make_user("teacher", Role.TEACHER.value, "Sarah Williams", "sarah@durakhshon.demo")
        teacher2_user = make_user("teacher2", Role.TEACHER.value, "David Clark", "david@durakhshon.demo")
        parent_user = make_user("parent", Role.PARENT.value, "Linda Brown", "linda@durakhshon.demo")
        student_user = make_user("student", Role.STUDENT.value, "Mike Brown", "mike@durakhshon.demo")

        sarah = Teacher(user_id=teacher_user.id, first_name="Sarah", last_name="Williams",
                        phone="+1-555-0202", email="sarah@durakhshon.demo", subject="Mathematics")
        david = Teacher(user_id=teacher2_user.id, first_name="David", last_name="Clark",
                        phone="+1-555-0303", email="david@durakhshon.demo", subject="English")
        db.add_all([sarah, david])
        db.flush()

        linda = Parent(user_id=parent_user.id, first_name="Linda", last_name="Brown",
                       phone="+1-555-0101", email="linda@lc.com")
        db.add(linda)
        db.flush()

        today = date.today()
        mike = Student(user_id=student_user.id, first_name="Mike", last_name="Brown",
                       phone="+1-555-0404", gender="male",
                       date_of_birth=date(2010, 4, 12), enrollment_date=today - timedelta(days=90))
        emma = Student(first_name="Emma", last_name="Davis", phone="+1-555-0505", gender="female",
                       date_of_birth=date(2011, 8, 3), enrollment_date=today - timedelta(days=60))
        james = Student(first_name="James", last_name="Wilson", phone="+1-555-0606", gender="male",
                        date_of_birth=date(2009, 12, 21), enrollment_date=today - timedelta(days=30))
        anna = Student(first_name="Anna", last_name="Brown", phone="+1-555-0707", gender="female",
                       date_of_birth=date(2012, 2, 17), enrollment_date=today - timedelta(days=20))
        db.add_all([mike, emma, james, anna])
        db.flush()
        linda.children = [mike, anna]  # one parent, two children

        math_a1 = Group(name="Math A1", course_name="Mathematics", teacher_id=sarah.id,
                        price_per_month=Decimal("150.00"), start_date=today - timedelta(days=90))
        english_b2 = Group(name="English B2", course_name="English Language", teacher_id=david.id,
                           price_per_month=Decimal("120.00"), start_date=today - timedelta(days=60))
        db.add_all([math_a1, english_b2])
        db.flush()
        math_a1.students = [mike, emma, anna]
        english_b2.students = [mike, james]

        db.add_all([
            Schedule(group_id=math_a1.id, day_of_week=0, start_time=time(9, 0), end_time=time(10, 30), room="101"),
            Schedule(group_id=math_a1.id, day_of_week=2, start_time=time(9, 0), end_time=time(10, 30), room="101"),
            Schedule(group_id=math_a1.id, day_of_week=4, start_time=time(9, 0), end_time=time(10, 30), room="101"),
            Schedule(group_id=english_b2.id, day_of_week=1, start_time=time(14, 0), end_time=time(15, 30), room="202"),
            Schedule(group_id=english_b2.id, day_of_week=3, start_time=time(14, 0), end_time=time(15, 30), room="202"),
        ])

        statuses = ["present", "present", "late", "absent", "present"]
        for offset in range(1, 6):
            day = today - timedelta(days=offset)
            for i, student in enumerate(math_a1.students):
                db.add(AttendanceRecord(
                    student_id=student.id, group_id=math_a1.id, teacher_id=sarah.id,
                    date=day, status=statuses[(offset + i) % len(statuses)],
                ))
            for i, student in enumerate(english_b2.students):
                db.add(AttendanceRecord(
                    student_id=student.id, group_id=english_b2.id, teacher_id=david.id,
                    date=day, status=statuses[(offset + i + 2) % len(statuses)],
                ))

        def add_payment(student: Student, group: Group, month: int, year: int,
                        amount: Decimal, paid: Decimal, due_day: int = 5) -> None:
            due = date(year, month, min(due_day, 28))
            payment = Payment(
                student_id=student.id, group_id=group.id, month=month, year=year,
                amount=amount, paid_amount=paid, due_date=due,
                status=compute_payment_status(amount, paid, due),
                paid_date=due if paid >= amount else None,
            )
            db.add(payment)

        m, y = today.month, today.year
        prev_m, prev_y = (m - 1, y) if m > 1 else (12, y - 1)
        add_payment(mike, math_a1, m, y, Decimal("150.00"), Decimal("150.00"))
        add_payment(emma, math_a1, m, y, Decimal("150.00"), Decimal("0.00"))
        add_payment(anna, math_a1, m, y, Decimal("150.00"), Decimal("100.00"))
        add_payment(james, english_b2, m, y, Decimal("120.00"), Decimal("60.00"))
        add_payment(mike, english_b2, m, y, Decimal("120.00"), Decimal("0.00"))
        add_payment(mike, math_a1, prev_m, prev_y, Decimal("150.00"), Decimal("150.00"))
        add_payment(emma, math_a1, prev_m, prev_y, Decimal("150.00"), Decimal("150.00"))

        exam = Exam(title="Algebra Midterm", group_id=math_a1.id, teacher_id=sarah.id,
                    exam_date=today - timedelta(days=7), max_score=Decimal("100"), status="published",
                    description="Chapters 1-4: equations and functions")
        db.add(exam)
        db.flush()
        for student, score, label in ((mike, 88, "B"), (emma, 95, "A"), (anna, 72, "C")):
            db.add(Grade(exam_id=exam.id, student_id=student.id, score=Decimal(score),
                         percentage=Decimal(score), grade_label=label,
                         comment="Good effort", created_by_id=teacher_user.id))

        db.commit()
        print("Seed complete.")
        print(f"Demo users (password: {DEMO_PASSWORD}):")
        for u in ("director", "admin", "teacher", "teacher2", "parent", "student"):
            print(f"  - {u}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
