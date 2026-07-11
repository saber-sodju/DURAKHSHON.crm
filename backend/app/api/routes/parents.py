from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_client_ip, require_staff
from app.db.session import get_db
from app.models import User, Parent, Student
from app.schemas.common import Page, Message
from app.schemas.people import (
    ParentCreate, ParentUpdate, ParentOut, ParentSearchOut, GeneratedAccountOut,
)
from app.services.audit import log_action
from app.services.credentials import create_login_account, generate_temp_password
from app.services.relations import relation_map_for_parent
from app.core.security import hash_password

router = APIRouter(prefix="/parents", tags=["parents"])


def _apply_children(db: Session, parent: Parent, child_ids: list[int] | None) -> None:
    if child_ids is None:
        return
    children = db.query(Student).filter(Student.id.in_(child_ids)).all() if child_ids else []
    if len(children) != len(set(child_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more students not found")
    parent.children = children


@router.get("", response_model=Page[ParentOut])
def list_parents(
    search: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(Parent).options(selectinload(Parent.children))
    if search:
        like = f"%{search}%"
        query = query.filter(or_(
            Parent.first_name.ilike(like), Parent.last_name.ilike(like), Parent.phone.ilike(like),
        ))
    total = query.count()
    items = query.order_by(Parent.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/search", response_model=list[ParentSearchOut])
def search_parents(
    q: str = Query("", min_length=0),
    limit: int = Query(15, ge=1, le=20),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Fast, bounded autocomplete for the student-create flow: never loads all
    parents, always caps results, so this stays fast with 1000+ parent records."""
    query = db.query(Parent).options(selectinload(Parent.children))
    q = q.strip()
    if q:
        like = f"%{q}%"
        full_name = Parent.first_name + " " + Parent.last_name
        query = query.filter(or_(
            Parent.first_name.ilike(like), Parent.last_name.ilike(like),
            full_name.ilike(like), Parent.phone.ilike(like), Parent.email.ilike(like),
        ))
    parents = query.order_by(Parent.last_name, Parent.first_name).limit(limit).all()
    return [
        ParentSearchOut(
            id=p.id, full_name=p.full_name, phone=p.phone, email=p.email,
            children_count=len(p.children), has_account=p.user_id is not None,
        )
        for p in parents
    ]


@router.get("/{parent_id}", response_model=ParentOut)
def get_parent(parent_id: int, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    parent = db.get(Parent, parent_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent not found")
    out = ParentOut.model_validate(parent)
    rel_map = relation_map_for_parent(db, parent_id)
    out.children = [
        c.model_copy(update={"relation": rel_map.get(c.id, "")}) for c in out.children
    ]
    return out


@router.post("/{parent_id}/create-account", response_model=GeneratedAccountOut)
def create_parent_account(
    parent_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    parent = db.get(Parent, parent_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent not found")
    if parent.user_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parent already has a login account")
    user, password = create_login_account(
        db, first_name=parent.first_name, last_name=parent.last_name,
        role="parent", username_prefix="parent",
    )
    parent.user_id = user.id
    log_action(db, actor, "create_account", "parent", parent.id,
               f"username={user.username}", ip=get_client_ip(request))
    db.commit()
    return GeneratedAccountOut(role="parent", owner_name=parent.full_name,
                               username=user.username, temporary_password=password, user_id=user.id)


@router.post("/{parent_id}/reset-password", response_model=GeneratedAccountOut)
def reset_parent_password(
    parent_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    parent = db.get(Parent, parent_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent not found")
    if parent.user_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent has no login account")
    user = db.get(User, parent.user_id)
    password = generate_temp_password()
    user.password_hash = hash_password(password)
    user.must_change_password = True
    log_action(db, actor, "reset_password", "parent", parent.id, ip=get_client_ip(request))
    db.commit()
    return GeneratedAccountOut(role="parent", owner_name=parent.full_name,
                               username=user.username, temporary_password=password, user_id=user.id)


@router.post("", response_model=ParentOut, status_code=status.HTTP_201_CREATED)
def create_parent(
    data: ParentCreate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    parent = Parent(**data.model_dump(exclude={"child_ids"}))
    _apply_children(db, parent, data.child_ids)
    db.add(parent)
    db.flush()
    log_action(db, actor, "create", "parent", parent.id, parent.full_name, ip=get_client_ip(request))
    db.commit()
    db.refresh(parent)
    return parent


@router.put("/{parent_id}", response_model=ParentOut)
def update_parent(
    parent_id: int,
    data: ParentUpdate,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    parent = db.get(Parent, parent_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent not found")
    for field, value in data.model_dump(exclude={"child_ids"}).items():
        setattr(parent, field, value)
    _apply_children(db, parent, data.child_ids)
    log_action(db, actor, "update", "parent", parent.id, parent.full_name, ip=get_client_ip(request))
    db.commit()
    db.refresh(parent)
    return parent


@router.delete("/{parent_id}", response_model=Message)
def delete_parent(
    parent_id: int,
    request: Request,
    actor: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    parent = db.get(Parent, parent_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent not found")
    name = parent.full_name
    db.delete(parent)
    log_action(db, actor, "delete", "parent", parent_id, name, ip=get_client_ip(request))
    db.commit()
    return Message(detail="Parent deleted")
