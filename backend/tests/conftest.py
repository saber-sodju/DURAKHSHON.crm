import os
import pathlib

TEST_DB = pathlib.Path(__file__).parent / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["LOGIN_RATE_LIMIT_ATTEMPTS"] = "1000"  # the limiter itself is unit-tested separately

import pytest
from fastapi.testclient import TestClient

from app.db.session import Base, engine, SessionLocal
from app.core.security import hash_password
from app.main import app
from app.models import User, Role, Student, Teacher, Parent, Group

PASSWORD = "TestPass123!"


@pytest.fixture(scope="session")
def client():
    if TEST_DB.exists():
        engine.dispose()
        TEST_DB.unlink()
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        def make_user(username: str, role: str) -> User:
            user = User(username=username, role=role, full_name=username.title(),
                        password_hash=hash_password(PASSWORD))
            db.add(user)
            db.flush()
            return user

        make_user("director", Role.DIRECTOR.value)
        make_user("admin", Role.ADMIN.value)
        teacher_user = make_user("teacher", Role.TEACHER.value)
        other_teacher_user = make_user("teacher2", Role.TEACHER.value)
        parent_user = make_user("parent", Role.PARENT.value)
        student_user = make_user("student", Role.STUDENT.value)

        teacher = Teacher(user_id=teacher_user.id, first_name="Own", last_name="Teacher", subject="Math")
        other_teacher = Teacher(user_id=other_teacher_user.id, first_name="Other", last_name="Teacher",
                                subject="English")
        db.add_all([teacher, other_teacher])
        db.flush()

        my_child = Student(user_id=student_user.id, first_name="My", last_name="Child")
        other_child = Student(first_name="Other", last_name="Child")
        classmate = Student(first_name="Class", last_name="Mate")
        db.add_all([my_child, other_child, classmate])
        db.flush()

        parent = Parent(user_id=parent_user.id, first_name="The", last_name="Parent")
        parent.children = [my_child]
        db.add(parent)

        own_group = Group(name="Own Group", course_name="Math", teacher_id=teacher.id)
        own_group.students = [my_child, classmate]
        other_group = Group(name="Other Group", course_name="English", teacher_id=other_teacher.id)
        other_group.students = [other_child]
        db.add_all([own_group, other_group])
        db.commit()
    finally:
        db.close()

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def tokens(client):
    result = {}
    for username in ("director", "admin", "teacher", "parent", "student"):
        response = client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
        assert response.status_code == 200, f"login failed for {username}: {response.text}"
        result[username] = {"Authorization": f"Bearer {response.json()['access_token']}"}
    return result
