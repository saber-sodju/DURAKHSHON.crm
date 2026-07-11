from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.api.deps import (
    get_client_ip, get_current_user, require_staff,
    accessible_student_ids, ensure_can_view_student,
)
from app.core.security import hash_password
from app.db.session import get_db
from app.models import User, Role, Student, Parent, Group
from app.schemas.common import Page, Message
from app.schemas.people import (
    StudentCreate, StudentUpdate, StudentOut, ParentOut, NewParentIn, ExistingParentLink,
    GeneratedAccountOut, DuplicateParentWarning, StudentCreateResult, ParentLinkResult,
)
from app.services.audit import log_action
from app.services.credentials import create_login_account, generate_temp_password
from app.services.relations import (
    link_parent_student, unlink_parent_student, relation_map_for_student, find_duplicate_parent,
)

router = APIRouter(prefix="/students", tags=["students"])


def _apply_links(db: Session, student: Student, parent_ids: list[int] | None, group_ids: list[int] | None) -> None:
    if parent_ids is not None:
        parents = db.query(Parent).filter(Parent.id.in_(parent_ids)).all() if parent_ids else []
        if len(parents) != len(set(parent_ids)):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more parents not found")
        student.parents = parents
    if group_ids is not None:
        groups = db.query(Group).filter(Group.id.in_(group_ids)).all() if group_ids else []
        if len(groups) != len(set(group_ids)):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more groups not found")
        student.groups = groups


def _with_parent_relations(db: Session, student: Student) -> StudentOut:
    out = StudentOut.model_validate(student)
    rel_map = relation_map_for_student(db, student.id)
    out.parents = [p.model_copy(update={"relation": rel_map.get(p.id, "")}) for p in out.parents]
    return out


def _create_new_parent(
    db: Session, actor: User, ip: str, student: Student, np: NewParentIn,
) -> tuple[Parent, GeneratedAccountOut | None]:
    parent = Parent(first_name=np.first_name, last_name=np.last_name,
                     phone=np.phone, email=np.email, notes=np.notes)
    db.add(parent)
    db.flush()
    link_parent_student(db, parent.id, student.id, np.relation)
    log_action(db, actor, "create", "parent", parent.id, parent.full_name, ip=ip)
    log_action(db, actor, "link", "parent_student", student.id,
               f"parent={parent.full_name} relation={np.relation}", ip=ip)

    account: GeneratedAccountOut | None = None
    if np.create_user_account:
        user, password = create_login_account(
            db, first_name=parent.first_name, last_name=parent.last_name,
            role=Role.PARENT.value, username_prefix="parent",
        )
        parent.user_id = user.id
        log_action(db, actor, "create_account", "parent", parent.id, f"username={user.username}", ip=ip)
        account = GeneratedAccountOut(role="parent", owner_name=parent.full_name,
                                       username=user.username, temporary_password=password, user_id=user.id)
    return parent, account


@router.get("", response_model=Page[StudentOut])
def list_students(
    search: str = "",
    group_id: int | None = None,
    status_filter: str = Query("", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Student).options(selectinload(Student.parents), selectinload(Student.groups))
    allowed = accessible_student_ids(db, user)
    if allowed is not None:
        query = query.filter(Student.id.in_(allowed or {0}))
    if search:
        like = f"%{search}%"
        query = query.filter(or_(
            Student.first_name.ilike(like), Student.last_name.ilike(like), Student.phone.ilike(like),
        ))
    if group_id is not None:
        query = query.filter(Student.groups.any(Group.id == group_id))
    if status_filter:
        query = query.filter(Student.status == status_filter)
    total = query.count()
    items = query.order_by(Student.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{student_id}", response_model=StudentOut)
def get_student(
    student_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    student = ensure_can_view_student(db, user, student_id)
    return _with_parent_relations(db, student)


@router.post("", response_model=StudentCreateResult, status_code=status.HTTP_201_CREATED)
def create_student(
    data: StudentCreate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Creates a student together with its parents/guardians (existing, linked by id,
    or brand new inline) and, optionally, login accounts for the student and any new
    parent — all in one request/one transaction. Nothing is written to the database
    until every check below passes; if anything raises, get_db()'s session.close()
    rolls back the whole thing (see app/db/session.py), so a failure never leaves a
    half-created student or orphaned parent behind."""
    ip = get_client_ip(request)

    # 1. Duplicate-protection pre-check happens before any writes: if a new parent's
    # phone/email already belongs to someone in the system (and the caller hasn't
    # explicitly opted in via allow_duplicate), reject the whole request and tell the
    # caller exactly which entries collided with which existing parent so the UI can
    # offer "link existing instead" / "create anyway".
    duplicates: list[DuplicateParentWarning] = []
    for i, np in enumerate(data.new_parents):
        if np.allow_duplicate:
            continue
        existing = find_duplicate_parent(db, np.phone, np.email)
        if existing is not None:
            field = "phone" if (np.phone and existing.phone == np.phone) else "email"
            value = np.phone if field == "phone" else np.email
            duplicates.append(DuplicateParentWarning(
                index=i, field=field, value=value, parent=ParentOut.model_validate(existing),
            ))
    if duplicates:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "duplicate_parents",
                    "duplicates": [d.model_dump(mode="json") for d in duplicates]},
        )

    # 2. Existing parent ids must all resolve to real parents
    existing_parent_objs: dict[int, Parent] = {}
    for link in data.existing_parent_links:
        parent = db.get(Parent, link.parent_id)
        if parent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"Parent {link.parent_id} not found")
        existing_parent_objs[link.parent_id] = parent

    # 3. Create the student itself, then attach groups (parents are handled below via
    # the relation-aware link helper, not the plain ORM collection, so relation_type
    # is preserved either way).
    student = Student(**data.model_dump(exclude={
        "group_ids", "existing_parent_links", "new_parents", "create_student_user_account",
    }))
    db.add(student)
    db.flush()
    _apply_links(db, student, None, data.group_ids or None)

    accounts: list[GeneratedAccountOut] = []
    created_parents: list[Parent] = []
    linked_parents: list[Parent] = []

    for link in data.existing_parent_links:
        parent = existing_parent_objs[link.parent_id]
        link_parent_student(db, parent.id, student.id, link.relation)
        linked_parents.append(parent)
        log_action(db, actor, "link", "parent_student", student.id,
                   f"parent={parent.full_name} relation={link.relation}", ip=ip)

    for np in data.new_parents:
        parent, account = _create_new_parent(db, actor, ip, student, np)
        created_parents.append(parent)
        if account:
            accounts.append(account)

    if data.create_student_user_account:
        user, password = create_login_account(
            db, first_name=student.first_name, last_name=student.last_name,
            role=Role.STUDENT.value, username_prefix="",
        )
        student.user_id = user.id
        log_action(db, actor, "create_account", "student", student.id, f"username={user.username}", ip=ip)
        accounts.append(GeneratedAccountOut(role="student", owner_name=student.full_name,
                                            username=user.username, temporary_password=password,
                                            user_id=user.id))

    log_action(db, actor, "create", "student", student.id, student.full_name, ip=ip)
    db.commit()
    db.refresh(student)

    return StudentCreateResult(
        student=_with_parent_relations(db, student),
        created_parents=[ParentOut.model_validate(p) for p in created_parents],
        linked_parents=[ParentOut.model_validate(p) for p in linked_parents],
        accounts=accounts,
    )


@router.put("/{student_id}", response_model=StudentOut)
def update_student(
    student_id: int,
    data: StudentUpdate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    for field, value in data.model_dump(exclude={"parent_ids", "group_ids"}).items():
        setattr(student, field, value)
    _apply_links(db, student, data.parent_ids, data.group_ids)
    log_action(db, actor, "update", "student", student.id, student.full_name, ip=get_client_ip(request))
    db.commit()
    db.refresh(student)
    return _with_parent_relations(db, student)


@router.delete("/{student_id}", response_model=Message)
def delete_student(
    student_id: int,
    request: Request,
    hard: bool = False,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    name = student.full_name
    if hard:
        db.delete(student)
        action = "delete"
    else:
        student.status = "inactive"
        action = "deactivate"
    log_action(db, actor, action, "student", student_id, name, ip=get_client_ip(request))
    db.commit()
    return Message(detail=f"Student {action}d")


# ---------- Parents / guardians management (post-creation) ----------

@router.post("/{student_id}/parents", response_model=StudentOut)
def link_existing_parent(
    student_id: int,
    data: ExistingParentLink,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    parent = db.get(Parent, data.parent_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent not found")
    link_parent_student(db, parent.id, student.id, data.relation)
    log_action(db, actor, "link", "parent_student", student.id,
               f"parent={parent.full_name} relation={data.relation}", ip=get_client_ip(request))
    db.commit()
    db.refresh(student)
    return _with_parent_relations(db, student)


@router.post("/{student_id}/parents/new", response_model=ParentLinkResult)
def create_and_link_parent(
    student_id: int,
    data: NewParentIn,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    if not data.allow_duplicate:
        existing = find_duplicate_parent(db, data.phone, data.email)
        if existing is not None:
            field = "phone" if (data.phone and existing.phone == data.phone) else "email"
            value = data.phone if field == "phone" else data.email
            warning = DuplicateParentWarning(index=0, field=field, value=value,
                                             parent=ParentOut.model_validate(existing))
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "duplicate_parents", "duplicates": [warning.model_dump(mode="json")]},
            )

    ip = get_client_ip(request)
    parent, account = _create_new_parent(db, actor, ip, student, data)
    db.commit()
    db.refresh(parent)
    return ParentLinkResult(parent=ParentOut.model_validate(parent), account=account)


@router.delete("/{student_id}/parents/{parent_id}", response_model=Message)
def unlink_parent(
    student_id: int,
    parent_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    parent = db.get(Parent, parent_id)
    if student is None or parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student or parent not found")
    removed = unlink_parent_student(db, parent_id, student_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    log_action(db, actor, "unlink", "parent_student", student_id,
               f"parent={parent.full_name} student={student.full_name}", ip=get_client_ip(request))
    db.commit()
    return Message(detail="Parent unlinked from student")


# ---------- Login account management ----------

@router.post("/{student_id}/create-account", response_model=GeneratedAccountOut)
def create_student_account(
    student_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    if student.user_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Student already has a login account")
    user, password = create_login_account(
        db, first_name=student.first_name, last_name=student.last_name,
        role=Role.STUDENT.value, username_prefix="",
    )
    student.user_id = user.id
    log_action(db, actor, "create_account", "student", student.id,
               f"username={user.username}", ip=get_client_ip(request))
    db.commit()
    return GeneratedAccountOut(role="student", owner_name=student.full_name,
                               username=user.username, temporary_password=password, user_id=user.id)


@router.post("/{student_id}/reset-password", response_model=GeneratedAccountOut)
def reset_student_password(
    student_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    if student.user_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student has no login account")
    user = db.get(User, student.user_id)
    password = generate_temp_password()
    user.password_hash = hash_password(password)
    user.must_change_password = True
    log_action(db, actor, "reset_password", "student", student.id, ip=get_client_ip(request))
    db.commit()
    return GeneratedAccountOut(role="student", owner_name=student.full_name,
                               username=user.username, temporary_password=password, user_id=user.id)
