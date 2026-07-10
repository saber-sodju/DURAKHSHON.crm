from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.services import backup as backup_service
from app.api.routes import (
    auth, users, students, teachers, parents, groups, schedule,
    attendance, payments, exams, notifications, reports, dashboard,
    sessions, backups,
)

# Refuse to start in production with an unsafe configuration.
_config_errors = settings.production_config_errors()
if _config_errors:
    raise RuntimeError(
        "Refusing to start: unsafe production configuration:\n  - "
        + "\n  - ".join(_config_errors)
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    backup_service.start_scheduler()
    yield
    backup_service.stop_scheduler()


app = FastAPI(
    title=settings.APP_NAME,
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


API_PREFIX = "/api"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(sessions.router, prefix=API_PREFIX)
app.include_router(backups.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(students.router, prefix=API_PREFIX)
app.include_router(teachers.router, prefix=API_PREFIX)
app.include_router(parents.router, prefix=API_PREFIX)
app.include_router(groups.router, prefix=API_PREFIX)
app.include_router(schedule.router, prefix=API_PREFIX)
app.include_router(attendance.router, prefix=API_PREFIX)
app.include_router(payments.router, prefix=API_PREFIX)
app.include_router(exams.router, prefix=API_PREFIX)
app.include_router(exams.grades_router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)


@app.get("/api/health")
def health():
    return {"status": "ok"}
