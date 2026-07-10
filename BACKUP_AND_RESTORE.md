# Backup & Restore — DURAKHSHON CRM

The database is PostgreSQL on Railway. This document covers how backups are made,
where they live, how to download and restore them, how to test a restore, and what
to do if the production database is damaged.

Backups are **logical dumps**: every table is exported to a single gzipped JSON file.
This format is portable (works across Postgres versions, no `pg_dump` binary needed)
and is restored by `scripts/restore_db.py`. Files are named:

```
durakhshon_backup_YYYY_MM_DD_HH_MM.json.gz
```

---

## 1. Automatic backups (no laptop required)

The backend runs its own daily backup on the server. This is controlled by
environment variables on the **backend** Railway service:

| Variable        | Value for production            | Meaning |
|-----------------|---------------------------------|---------|
| `BACKUP_ENABLED`| `true`                          | Turns the in-process daily scheduler on |
| `BACKUP_DIR`    | `/data/backups`                 | Where dumps are written (a Railway **volume**, so they survive redeploys) |

The scheduler runs once per day after 03:00 (server time) and applies retention:

- **daily** backups kept for 7 days
- **weekly** backups kept for ~4 weeks
- **monthly** backups kept for ~6 months

> **Important:** `BACKUP_DIR` must point at a mounted Railway **volume**. Without a
> volume the files are written to the container's ephemeral disk and are lost on the
> next redeploy. See "Railway volume setup" below.

### Railway volume setup (one time)

```bash
# attach a 1 GB volume to the backend service, mounted at /data
railway volume add --service backend --mount-path /data
railway variables --service backend \
  --set BACKUP_ENABLED=true \
  --set BACKUP_DIR=/data/backups
```

Redeploy the backend afterwards so it picks up the new mount and variables.

---

## 2. Backups in the app (director only)

Sign in as a **director** → **Settings** → **Database backups**:

- see the list of existing backups (name, size, date, type)
- **Back up now** — create an on-demand backup immediately
- **Download** — save any backup file to your computer (keep an off-site copy!)

---

## 3. Manual backup from the command line

Runs anywhere the backend dependencies are installed. Credentials come from the
`DATABASE_URL` environment variable — never hard-code them.

```bash
cd backend
# against production (get the public URL from Railway):
DATABASE_URL="$(railway variables --service Postgres-1xMA --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)" \
  .venv/Scripts/python.exe scripts/backup_db.py --out-dir backups --keep 30
```

`scripts/backup_db.py` prints the file it wrote. `--keep N` prunes to the newest N.

---

## 4. Restore

`scripts/restore_db.py` restores a dump into a target database. It inserts rows in
foreign-key-safe order and converts dates/decimals back to native types.

```bash
cd backend
# restore into an EMPTY database (schema must already exist — run migrations first)
DATABASE_URL="postgresql+psycopg2://USER:PASS@HOST:PORT/DB" \
  .venv/Scripts/python.exe scripts/restore_db.py path/to/durakhshon_backup_2026_07_10_03_00.json.gz

# to overwrite an existing database, wipe it first (DANGEROUS):
DATABASE_URL="..." .venv/Scripts/python.exe scripts/restore_db.py BACKUP.json.gz --wipe
```

The script asks for confirmation unless `--yes` is passed. `DATABASE_URL` uses the
SQLAlchemy form `postgresql+psycopg2://...`.

---

## 5. How to test a restore (do this at least once)

```bash
cd backend
# 1. spin up a throwaway SQLite database with the current schema
DATABASE_URL="sqlite:///./restore_test.db" .venv/Scripts/python.exe -c \
  "from app.db.session import Base, engine; import app.models; Base.metadata.create_all(engine)"

# 2. restore a real backup into it
DATABASE_URL="sqlite:///./restore_test.db" .venv/Scripts/python.exe \
  scripts/restore_db.py backups/durakhshon_backup_XXXX.json.gz --yes

# 3. check row counts look right, then delete the test file
DATABASE_URL="sqlite:///./restore_test.db" .venv/Scripts/python.exe -c \
  "from sqlalchemy import create_engine,text; e=create_engine('sqlite:///./restore_test.db'); \
   c=e.connect(); print('users', c.execute(text('SELECT COUNT(*) FROM users')).scalar())"
rm restore_test.db
```

This was verified during setup: a production backup (14 tables, 104 rows) restored
cleanly into a fresh database with timestamps intact.

---

## 6. If the production database is damaged

1. **Don't panic and don't run migrations against it blindly.** Take a fresh dump
   first if the DB is still reachable at all (`scripts/backup_db.py`).
2. Pick the most recent good backup (from the app's Backups panel, the Railway
   volume at `/data/backups`, or your off-site copy).
3. Provision a clean database (a new Railway Postgres service, or reset the current
   one), and point `DATABASE_URL` at it.
4. Create the schema: `alembic upgrade head`.
5. Restore: `scripts/restore_db.py BACKUP.json.gz` (add `--wipe` if restoring over
   existing rows).
6. Update the backend's `DATABASE_URL` to the recovered database and redeploy.
7. Log in and spot-check students, payments, grades, attendance.

---

## 7. Recommended: keep an off-site copy

The automatic backups live on a Railway volume in the same project as the database.
That protects against accidental deletion, bad migrations and app bugs, but not
against losing the whole Railway account. Periodically download a backup from the
Settings → Backups panel and store it somewhere else (Google Drive, a laptop, etc.),
or add a scheduled job that uploads `/data/backups` to external storage
(S3 / Cloudflare R2 / Dropbox). This is an optional future improvement.
