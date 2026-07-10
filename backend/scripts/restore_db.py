"""Restore a JSON backup produced by backup_db.py into a target database.

Inserts rows in FK-safe order. Intended for disaster recovery into an EMPTY
database — existing rows are left alone unless --wipe is passed, in which
case every table is truncated first (in reverse FK order) before inserting.

Usage:
    python scripts/restore_db.py BACKUP_FILE [--database-url URL] [--wipe] [--yes]
"""
import argparse
import gzip
import json
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, Date, DateTime, Time, Numeric

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app.models  # noqa: F401
from app.db.session import Base


def _restore_value(value, col_type):
    """JSON round-trips datetimes/decimals as strings — convert them back to
    the Python types each dialect's DBAPI actually expects on insert."""
    if value is None:
        return None
    if isinstance(col_type, DateTime):
        return datetime.fromisoformat(value) if isinstance(value, str) else value
    if isinstance(col_type, Date):
        return date.fromisoformat(value) if isinstance(value, str) else value
    if isinstance(col_type, Time):
        return time.fromisoformat(value) if isinstance(value, str) else value
    if isinstance(col_type, Numeric):
        return Decimal(value) if isinstance(value, str) else value
    return value


def restore(backup_path: Path, database_url: str, wipe: bool) -> None:
    with gzip.open(backup_path, "rt", encoding="utf-8") as f:
        dump = json.load(f)

    engine = create_engine(database_url)
    with engine.begin() as conn:
        if wipe:
            for table in reversed(Base.metadata.sorted_tables):
                conn.execute(table.delete())
        for table in Base.metadata.sorted_tables:
            rows = dump.get(table.name, [])
            if not rows:
                continue
            converters = {col.name: col.type for col in table.columns}
            converted = [
                {k: _restore_value(v, converters[k]) for k, v in row.items()}
                for row in rows
            ]
            conn.execute(table.insert(), converted)

    total = sum(len(v) for v in dump.values())
    print(f"Restored {len(dump)} tables, {total} rows.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("backup_file")
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--wipe", action="store_true", help="Delete existing rows before restoring")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    if args.database_url:
        db_url = args.database_url
    else:
        from app.core.config import settings
        db_url = settings.DATABASE_URL

    if not args.yes:
        target = db_url.rsplit("@", 1)[-1]
        answer = input(
            f"This will restore into {target}"
            f"{' and WIPE existing data first' if args.wipe else ''}. Continue? [y/N] "
        )
        if answer.strip().lower() != "y":
            print("Aborted.")
            sys.exit(1)

    restore(Path(args.backup_file), db_url, args.wipe)
