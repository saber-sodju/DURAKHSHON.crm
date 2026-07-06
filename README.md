# DURAKHSHON — Learning Center CRM

Full-stack CRM for a learning center: students, teachers, parents, groups, schedule,
attendance, payments, exams & grades, reports, notifications and role-based access control.

**Stack:** FastAPI · PostgreSQL · SQLAlchemy 2 · Alembic · React 19 + TypeScript · Tailwind CSS 4 ·
TanStack Query · React Hook Form + Zod · Recharts · Docker Compose

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
  **refresh token** in a `httpOnly` + `SameSite=Lax` cookie scoped to `/api/auth`.
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
