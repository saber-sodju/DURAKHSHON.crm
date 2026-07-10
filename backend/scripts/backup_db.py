"""Logical backup of the database to a single timestamped, gzipped JSON file.

Doesn't need the pg_dump binary — dumps every row via SQLAlchemy, in FK-safe
table order, so it runs anywhere the backend's own dependencies are installed.

Usage:
    python scripts/backup_db.py [--database-url URL] [--out-dir DIR] [--keep N]

Defaults to DATABASE_URL from the environment/.env, ./backups next to this
script, and keeping the 30 most recent backups (older ones are deleted).
"""
import argparse
import gzip
import json
import sys
from datetime import datetime, date, time
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app.models  # noqa: F401  registers all tables on Base.metadata
from app.db.session import Base


def _json_default(value):
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    raise TypeError(f"Cannot serialize {type(value)}")


def backup(database_url: str, out_dir: Path, keep: int) -> Path:
    engine = create_engine(database_url)
    out_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = out_dir / f"durakhshon_backup_{timestamp}.json.gz"

    dump: dict[str, list[dict]] = {}
    with engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            rows = conn.execute(select(table)).mappings().all()
            dump[table.name] = [dict(row) for row in rows]

    with gzip.open(out_path, "wt", encoding="utf-8") as f:
        json.dump(dump, f, default=_json_default, ensure_ascii=False)

    total_rows = sum(len(v) for v in dump.values())
    print(f"Backed up {len(dump)} tables, {total_rows} rows -> {out_path}")

    existing = sorted(out_dir.glob("durakhshon_backup_*.json.gz"))
    for old in existing[:-keep] if keep > 0 else []:
        old.unlink()
        print(f"Pruned old backup: {old.name}")

    return out_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--out-dir", default=None)
    parser.add_argument("--keep", type=int, default=30)
    args = parser.parse_args()

    if args.database_url:
        db_url = args.database_url
    else:
        from app.core.config import settings
        db_url = settings.DATABASE_URL

    out_dir = Path(args.out_dir) if args.out_dir else Path(__file__).resolve().parent.parent / "backups"
    backup(db_url, out_dir, args.keep)
