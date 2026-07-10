from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "DURAKHSHON CRM"
    ENVIRONMENT: str = "development"  # development | production
    SECRET_KEY: str = "change-me-in-env"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # refresh-token lifetimes: short when "remember me" is off, long when on
    REFRESH_TOKEN_DAYS: int = 1
    REFRESH_TOKEN_REMEMBER_DAYS: int = 14
    DATABASE_URL: str = "postgresql+psycopg2://durakhshon:durakhshon@localhost:5432/durakhshon"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    COOKIE_SECURE: bool = False  # set True in production (HTTPS)
    COOKIE_SAMESITE: str = "lax"  # "none" when frontend and backend are on different origins (e.g. Railway); requires COOKIE_SECURE=true
    LOGIN_RATE_LIMIT_ATTEMPTS: int = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 60
    LOCKOUT_THRESHOLD: int = 10
    LOCKOUT_MINUTES: int = 15
    SEED_DEMO: bool = False  # only true in demo deployments; guarded in production
    BACKUP_DIR: str = "./backups"
    BACKUP_ENABLED: bool = False  # in-process daily scheduler (enable on the always-on server)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    def production_config_errors(self) -> list[str]:
        """Misconfigurations that must block startup in production."""
        errors: list[str] = []
        if not self.is_production:
            return errors
        if self.SECRET_KEY in ("change-me-in-env", "dev-only-secret-key-not-for-production", ""):
            errors.append("SECRET_KEY must be set to a strong unique value in production")
        if len(self.SECRET_KEY) < 32:
            errors.append("SECRET_KEY must be at least 32 characters in production")
        if not self.COOKIE_SECURE:
            errors.append("COOKIE_SECURE must be true in production (HTTPS)")
        origins = self.cors_origins_list
        if any(o == "*" for o in origins):
            errors.append("CORS_ORIGINS must not contain '*' in production")
        if any("localhost" in o or "127.0.0.1" in o for o in origins):
            errors.append("CORS_ORIGINS must not contain localhost in production")
        if not origins:
            errors.append("CORS_ORIGINS must list the real frontend origin in production")
        if self.SEED_DEMO:
            errors.append("SEED_DEMO must be false in production")
        return errors


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
