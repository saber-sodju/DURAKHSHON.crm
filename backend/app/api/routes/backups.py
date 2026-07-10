from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_director, get_client_ip
from app.db.session import get_db
from app.models import User
from app.schemas.system import BackupOut
from app.services import backup as backup_service
from app.services.audit import log_action

router = APIRouter(prefix="/backups", tags=["backups"])


@router.get("", response_model=list[BackupOut])
def list_backups(_: User = Depends(require_director)):
    return backup_service.list_backups()


@router.post("", response_model=BackupOut)
def create_backup(
    request: Request,
    actor: User = Depends(require_director),
    db: Session = Depends(get_db),
):
    try:
        path = backup_service.run_backup()
        backup_service.prune()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Backup failed: {exc}")
    log_action(db, actor, "backup", "database", detail=path.name, ip=get_client_ip(request))
    db.commit()
    stat = path.stat()
    dt = backup_service._parse_stamp(path) or datetime.now()
    return BackupOut(filename=path.name, size_bytes=stat.st_size,
                     created_at=dt.replace(tzinfo=timezone.utc),
                     kind=backup_service.classify(dt))


@router.get("/{filename}/download")
def download_backup(filename: str, _: User = Depends(require_director)):
    # prevent path traversal — only allow plain backup filenames
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")
    path = backup_service.backup_dir() / filename
    if not path.is_file() or not filename.startswith(backup_service.FILENAME_PREFIX):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup not found")
    return FileResponse(path, media_type="application/gzip", filename=filename)
