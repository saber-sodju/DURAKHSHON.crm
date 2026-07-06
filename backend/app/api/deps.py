from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models import User, Role, Student, Teacher, Parent, Group

bearer_scheme = HTTPBearer(auto_error=False)

STAFF_ROLES = (Role.DIRECTOR.value, Role.ADMIN.value)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = decode_token(credentials.credentials, "access")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is inactive")
    return user


def require_roles(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return checker


require_staff = require_roles(*STAFF_ROLES)
require_director = require_roles(Role.DIRECTOR.value)


def get_client_ip(request: Request) -> str:
    if request.client:
        return request.client.host
    return ""


# ---------- profile lookups ----------

def get_teacher_profile(db: Session, user: User) -> Teacher:
    teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
    if teacher is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No teacher profile linked to this account")
    return teacher


def get_student_profile(db: Session, user: User) -> Student:
    student = db.query(Student).filter(Student.user_id == user.id).first()
    if student is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No student profile linked to this account")
    return student


def get_parent_profile(db: Session, user: User) -> Parent:
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if parent is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No parent profile linked to this account")
    return parent


# ---------- object-level authorization helpers ----------

def ensure_teacher_owns_group(db: Session, user: User, group_id: int) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if user.role in STAFF_ROLES:
        return group
    if user.role == Role.TEACHER.value:
        teacher = get_teacher_profile(db, user)
        if group.teacher_id == teacher.id:
            return group
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")


def accessible_student_ids(db: Session, user: User) -> set[int] | None:
    """Returns the set of student ids the user may see, or None for unrestricted (staff)."""
    if user.role in STAFF_ROLES:
        return None
    if user.role == Role.TEACHER.value:
        teacher = get_teacher_profile(db, user)
        ids: set[int] = set()
        for group in teacher.groups:
            ids.update(s.id for s in group.students)
        return ids
    if user.role == Role.PARENT.value:
        parent = get_parent_profile(db, user)
        return {c.id for c in parent.children}
    if user.role == Role.STUDENT.value:
        student = get_student_profile(db, user)
        return {student.id}
    return set()


def ensure_can_view_student(db: Session, user: User, student_id: int) -> Student:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    allowed = accessible_student_ids(db, user)
    if allowed is not None and student_id not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this student")
    return student
