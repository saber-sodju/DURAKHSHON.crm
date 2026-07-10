"""Server-side database backups that run on the host itself (no developer laptop).

Uses a portable logical dump (every table -> gzipped JSON) via SQLAlchemy, so it
works against any Postgres version with no extra client binaries. A background
thread started in the app lifespan runs one backup per day and prunes old files
with a daily(7) / weekly(4) / monthly(6) retention window.

Backups are written to settings.BACKUP_DIR, which on Railway is a mounted volume
so they survive redeploys.
"""
import gzip
import json
import threading
import time as _time
from datetime import datetime, date, time as dtime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, select

from app.core.config import settings
from app.db.session import Base
import app.models  # noqa: F401  register tables

FILENAME_PREFIX = "durakhshon_backup_"
FILENAME_SUFFIX = ".json.gz"


def _json_default(value):
    if isinstance(value, (datetime, date, dtime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    raise TypeError(f"Cannot serialize {type(value)}")


def backup_dir() -> Path:
    d = Path(settings.BACKUP_DIR)
    d.mkdir(parents=True, exist_ok=True)
    return d


def run_backup(database_url: str | None = None) -> Path:
    database_url = database_url or settings.DATABASE_URL
    engine = create_engine(database_url)
    out_dir = backup_dir()
    stamp = datetime.now().strftime("%Y_%m_%d_%H_%M")
    out_path = out_dir / f"{FILENAME_PREFIX}{stamp}{FILENAME_SUFFIX}"

    dump: dict[str, list[dict]] = {}
    with engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            rows = conn.execute(select(table)).mappings().all()
            dump[table.name] = [dict(r) for r in rows]
    engine.dispose()

    with gzip.open(out_path, "wt", encoding="utf-8") as f:
        json.dump(dump, f, default=_json_default, ensure_ascii=False)
    return out_path


def _parse_stamp(path: Path) -> datetime | None:
    name = path.name
    if not (name.startswith(FILENAME_PREFIX) and name.endswith(FILENAME_SUFFIX)):
        return None
    core = name[len(FILENAME_PREFIX):-len(FILENAME_SUFFIX)]
    try:
        return datetime.strptime(core, "%Y_%m_%d_%H_%M")
    except ValueError:
        return None


def classify(dt: datetime, now: datetime | None = None) -> str:
    now = now or datetime.now()
    age = (now.date() - dt.date()).days
    if age <= 7:
        return "daily"
    if age <= 28:
        return "weekly"
    return "monthly"


def list_backups() -> list[dict]:
    out = []
    for p in sorted(backup_dir().glob(f"{FILENAME_PREFIX}*{FILENAME_SUFFIX}"), reverse=True):
        dt = _parse_stamp(p)
        if dt is None:
            continue
        out.append({
            "filename": p.name,
            "size_bytes": p.stat().st_size,
            "created_at": dt.replace(tzinfo=timezone.utc),
            "kind": classify(dt),
        })
    return out


def prune() -> list[str]:
    """Retention: keep every backup from the last 7 days; then one per ISO week
    for ~4 weeks; then one per month for ~6 months; delete the rest."""
    now = datetime.now()
    files = []
    for p in backup_dir().glob(f"{FILENAME_PREFIX}*{FILENAME_SUFFIX}"):
        dt = _parse_stamp(p)
        if dt:
            files.append((dt, p))
    files.sort(reverse=True)  # newest first

    keep: set[Path] = set()
    seen_weeks: set = set()
    seen_months: set = set()
    for dt, p in files:
        age = (now.date() - dt.date()).days
        if age <= 7:
            keep.add(p)
        elif age <= 35:
            wk = (dt.isocalendar().year, dt.isocalendar().week)
            if wk not in seen_weeks:
                seen_weeks.add(wk)
                keep.add(p)
        elif age <= 190:
            mo = (dt.year, dt.month)
            if mo not in seen_months:
                seen_months.add(mo)
                keep.add(p)
    removed = []
    for _dt, p in files:
        if p not in keep:
            p.unlink(missing_ok=True)
            removed.append(p.name)
    return removed


def _has_backup_today() -> bool:
    today = datetime.now().date()
    for p in backup_dir().glob(f"{FILENAME_PREFIX}*{FILENAME_SUFFIX}"):
        dt = _parse_stamp(p)
        if dt and dt.date() == today:
            return True
    return False


def _scheduler_loop(stop: threading.Event) -> None:
    # check hourly; run a backup once per day after 03:00 local time
    while not stop.is_set():
        try:
            now = datetime.now()
            if now.time() >= dtime(3, 0) and not _has_backup_today():
                run_backup()
                prune()
        except Exception as exc:  # never let the loop die
            print(f"[backup] scheduled run failed: {exc}", flush=True)
        stop.wait(3600)


_stop_event: threading.Event | None = None
_thread: threading.Thread | None = None


def start_scheduler() -> None:
    global _stop_event, _thread
    if not settings.BACKUP_ENABLED or _thread is not None:
        return
    _stop_event = threading.Event()
    _thread = threading.Thread(target=_scheduler_loop, args=(_stop_event,), daemon=True)
    _thread.start()
    print("[backup] daily scheduler started", flush=True)


def stop_scheduler() -> None:
    if _stop_event is not None:
        _stop_event.set()
