# DURAKHSHON — Learning Center CRM

Full-stack CRM for a learning center: students, teachers, parents, groups, schedule,
attendance, payments, exams & grades, reports, notifications and role-based access control.

**Stack:** FastAPI · PostgreSQL · SQLAlchemy 2 · Alembic · React 19 + TypeScript · Tailwind CSS 4 ·
TanStack Query · React Hook Form + Zod · Recharts · Docker Compose

**Live demo (Railway):** https://frontend-production-be90.up.railway.app
(demo users below, password `Demo1234!`)

---

## Deploying to Railway

The project runs as three services in one Railway project: PostgreSQL, `backend`, `frontend`.
Frontend and backend get their own public Railway domains, and the browser calls the backend
directly (cross-origin) rather than through a server-side proxy — this sidesteps Railway's
private networking between services, which was unreliable in testing.

```bash
railway login
railway init                                    # creates the project
railway add --database postgres

railway add --service backend
railway variable set ENVIRONMENT=production --service backend
railway variable set SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')" --service backend
railway variable set 'DATABASE_URL=postgresql+psycopg2://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}' --service backend
railway variable set COOKIE_SECURE=true --service backend
railway variable set COOKIE_SAMESITE=none --service backend   # frontend/backend are different origins
railway up ./backend --path-as-root --service backend
railway domain --service backend --port 8000    # note the generated URL

railway add --service frontend
railway variable set VITE_API_BASE_URL="https://<backend-domain>/api" --service frontend
railway up ./frontend --path-as-root --service frontend
railway domain --service frontend --port 80     # note the generated URL

# now that both domains are known, close the loop:
railway variable set CORS_ORIGINS="https://<frontend-domain>" --service backend
```

Notes:
- `--path-as-root` is required for monorepo subfolders — without it Railway uploads the repo root.
- `VITE_API_BASE_URL` is a **build-time** arg (see `frontend/Dockerfile`); leaving it unset makes
  the frontend call the relative `/api` path instead, proxied by nginx — that's what happens in
  the Docker Compose setup below, where frontend and backend share one origin.
- Rotate `SECRET_KEY` and demo passwords before treating a deployment as more than a demo.

---

## Environment variables (backend)

| Variable | Example (production) | Notes |
|----------|----------------------|-------|
| `ENVIRONMENT` | `production` | in production the app refuses to start if the config is unsafe |
| `SECRET_KEY` | 64-char random | `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DATABASE_URL` | `postgresql+psycopg2://...` | Railway reference expression, see above |
| `CORS_ORIGINS` | `https://<frontend-domain>` | no `*`, no localhost in production |
| `COOKIE_SECURE` | `true` | required in production (HTTPS) |
| `COOKIE_SAMESITE` | `none` | `none` when frontend/backend are different origins; else `lax` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | short-lived access token |
| `REFRESH_TOKEN_DAYS` | `1` | session length without "remember me" |
| `REFRESH_TOKEN_REMEMBER_DAYS` | `14` | session length with "remember me" |
| `SEED_DEMO` | `false` | **must be false in production**; gates the demo seed |
| `BACKUP_ENABLED` | `true` | daily in-process backup scheduler |
| `BACKUP_DIR` | `/data/backups` | point at a mounted Railway **volume** |

The frontend build takes `VITE_API_BASE_URL` (absolute backend URL) as a build arg.

### Production startup guard
In `ENVIRONMENT=production` the backend **will not boot** if `SECRET_KEY` is weak,
`COOKIE_SECURE` is false, `CORS_ORIGINS` contains `*` or localhost, or `SEED_DEMO` is
true. This prevents shipping an unsafe configuration by accident.

---

## Demo deployment vs production deployment

**Demo** (what you want for a sandbox): `ENVIRONMENT=development` or a non-production
env, `SEED_DEMO=true`, then `python -m app.seed` creates demo users
(director / admin / teacher / teacher2 / parent / student, password from
`SEED_DEMO_PASSWORD`).

**Production** (real learning center):

1. Set the production env vars above (`SEED_DEMO=false`, strong `SECRET_KEY`, HTTPS
   cookies, real `CORS_ORIGINS`).
2. Apply migrations: `alembic upgrade head` (the backend Docker image does this on start).
3. **Create the first real director:**
   ```bash
   python -m app.commands.create_director
   # prompts for username, email, password, first/last name
   ```
4. **Remove demo data** if the database was ever seeded (take a backup first — see
   BACKUP_AND_RESTORE.md):
   ```bash
   python -m app.commands.purge_demo_data        # dry run: shows what would be deleted
   python -m app.commands.purge_demo_data --yes  # actually delete
   ```
   It only removes records matching the seed's demo markers; real data is left intact.
5. Attach a backup volume and enable backups (see BACKUP_AND_RESTORE.md).

See **BACKUP_AND_RESTORE.md** for backups/restore and **MOBILE_QA.md** for the mobile
test checklist.

### Long login sessions
Access tokens are short (30 min) and refresh automatically from an httpOnly refresh
cookie, so users are not logged out mid-session. The login screen has a
**"Keep me signed in"** checkbox: off → session lasts ~1 day, on → ~14 days. Refresh
tokens rotate on every use (a stolen/old token can't be replayed), and
**Settings → My devices** lists active sessions with "log out this device" and
"log out all other devices". Changing the password logs out every session.

---

## Quick start (Docker)

```bash
cp .env.example .env        # then edit SECRET_KEY and POSTGRES_PASSWORD
docker compose up --build
```

Open **http://localhost:3000**. Migrations and demo seed run automatically on first start.

## Quick start (local development, no Docker)

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on Linux/macOS)
pip install -r requirements.txt
copy .env.example .env            # SQLite is used by default for local dev
alembic upgrade head
python -m app.seed
uvicorn app.main:app --port 8800
```

Frontend (separate terminal):

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api to :8800)
```

## Demo users

All seeded with password **`Demo1234!`** (override via `SEED_DEMO_PASSWORD` env var):

| Username   | Role     | What they see |
|------------|----------|---------------|
| `director` | Director | Everything, including Users & Roles and the audit log |
| `admin`    | Admin    | Students, parents, groups, payments, schedule, reports |
| `teacher`  | Teacher  | Only own groups; marks attendance; creates exams and grades |
| `teacher2` | Teacher  | Second teacher (English B2) |
| `parent`   | Parent   | Only own children (Mike & Anna): attendance, grades, payments |
| `student`  | Student  | Only own data: schedule, attendance, grades, notifications |

> Demo passwords exist only in the seed script and are read from the environment —
> nothing is hardcoded in production code paths.

## Project structure

```
backend/
  app/
    core/        config (pydantic-settings), security (argon2, JWT, rate limiter)
    db/          SQLAlchemy engine/session
    models/      users, students/teachers/parents, groups+schedule, attendance,
                 exams+grades, payments, notifications, audit_logs
    schemas/     Pydantic request/response models
    api/         deps (RBAC + object-level authorization), routes per module
    services/    payment status rules, schedule conflict detection, audit, notify
    seed.py      demo data seeder (idempotent)
  alembic/       migrations
  tests/         permission & business-rule tests (pytest)
frontend/
  src/
    lib/         axios client with auto-refresh, types, utils
    context/     Auth (access token in memory + httpOnly refresh cookie), Toasts
    components/  UI kit (buttons, modals, tables, badges, skeletons), Layout
    pages/       Dashboard (per role), Students, Teachers, Parents, Groups,
                 Schedule, Attendance, Payments, Exams, Grades, Reports,
                 Users & Roles + Audit, Notifications, Settings
docker-compose.yml   Postgres + backend + frontend (nginx)
```

## Key business rules

- **Attendance** is unique per (student, group, date) — re-marking updates instead of duplicating.
- **Payments**: group price is auto-suggested; status is computed:
  paid in full → *Paid*, partly → *Partially Paid*, past due date and unpaid → *Overdue*.
  One payment per (student, group, month, year).
- **Schedule**: a teacher cannot have two overlapping lessons (409 with details).
- **Exams**: percentage and letter grade computed automatically; *draft* exams are
  hidden from students/parents; publishing notifies them.
- **Object-level access**: teachers see only their groups/students, parents only their
  children, students only themselves — enforced in the API, not just the UI.

## Running tests

```bash
cd backend
.venv\Scripts\python -m pytest tests -q
```

28 tests cover authentication, role guards, object-level authorization (IDOR protection),
attendance upsert, grade computation and payment status rules.

## Security notes

- Passwords hashed with **Argon2**; `password_hash` never leaves the API.
- **JWT access token** (30 min) returned in JSON and kept in memory on the client;
  **refresh token** in a `httpOnly` cookie scoped to `/api/auth`. `SameSite=Lax` when
  frontend and backend share an origin (Docker Compose); `SameSite=None` + `Secure`
  when they're separate origins (Railway) — set via `COOKIE_SAMESITE`.
- **Login rate limiting** (5 attempts/min per IP) + **account lockout**
  (10 failed attempts → 15 min).
- **RBAC** via dependencies plus per-object ownership checks against IDOR.
- All queries go through the ORM (no raw SQL) — SQL injection protected.
- Validation on both sides: Pydantic (API) and Zod (forms).
- CORS restricted to the configured frontend origin; explicit security headers
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS in production).
- **Audit log** records logins, failed logins and create/update/delete of students,
  payments, groups, attendance, exams and grades with IP addresses.
- Secrets only in `.env` (see `.env.example`); API docs are disabled outside development.
- Admins cannot modify or deactivate the director; only the director creates staff accounts.
- **Production checklist:** serve over HTTPS, set `COOKIE_SECURE=true`,
  `ENVIRONMENT=production`, a strong `SECRET_KEY`, and change all demo passwords.

## API overview

`POST /api/auth/login|refresh|logout|change-password`, `GET /api/auth/me` ·
CRUD: `/api/students`, `/api/teachers`, `/api/parents`, `/api/groups` (+`/students`),
`/api/schedule`, `/api/users` ·
`GET|POST|PUT /api/attendance` (bulk upsert) · `GET|POST|PUT|DELETE /api/payments` ·
`/api/exams`, `/api/grades` (bulk upsert) ·
`GET /api/reports/attendance|payments|student-progress|teacher-workload|charts` (`?export=csv`) ·
`/api/notifications` · `GET /api/dashboard` (role-aware) · `GET /api/users/audit-logs`

Interactive docs (dev only): http://localhost:8800/api/docs
