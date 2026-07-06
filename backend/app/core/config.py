from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "DURAKHSHON CRM"
    ENVIRONMENT: str = "development"  # development | production
    SECRET_KEY: str = "change-me-in-env"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    DATABASE_URL: str = "postgresql+psycopg2://durakhshon:durakhshon@localhost:5432/durakhshon"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    COOKIE_SECURE: bool = False  # set True in production (HTTPS)
    COOKIE_SAMESITE: str = "lax"  # "none" when frontend and backend are on different origins (e.g. Railway); requires COOKIE_SECURE=true
    LOGIN_RATE_LIMIT_ATTEMPTS: int = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 60
    LOCKOUT_THRESHOLD: int = 10
    LOCKOUT_MINUTES: int = 15

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
