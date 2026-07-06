from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_client_ip, require_staff
from app.db.session import get_db
from app.models import User, Parent, Student
from app.schemas.common import Page, Message
from app.schemas.people import ParentCreate, ParentUpdate, ParentOut
from app.services.audit import log_action

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


@router.get("/{parent_id}", response_model=ParentOut)
def get_parent(parent_id: int, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    parent = db.get(Parent, parent_id)
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent not found")
    return parent


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
