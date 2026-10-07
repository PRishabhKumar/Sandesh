"""Application settings.

All configuration is read from environment variables (or a .env file sitting
next to this project). Keeping every tunable in one place makes the service
easy to explain and easy to deploy.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    APP_NAME: str = "Signal Clone API"
    APP_VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"

    # --- Database ---
    # SQLite is mandated by the assignment. The URL lives in env so the same
    # code can point at Postgres later without touching a single model.
    DATABASE_URL: str = "sqlite:///./signal_clone.db"

    # --- Auth ---
    JWT_SECRET: str = "dev-secret-change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 720  # 30 days - demo friendly

    # --- Mocked verification ---
    MOCK_OTP: str = "123456"

    # --- CORS (comma separated list of frontend origins) ---
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # --- Uploads ---
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 10

    # --- Behaviour ---
    SEED_ON_BOOT: bool = True
    MAX_MESSAGE_LENGTH: int = 4000
    SWEEPER_INTERVAL_SECONDS: int = 5  # disappearing-message sweeper

    @property
    def allowed_origins(self) -> list[str]:
        """CORS wants a list, env vars are strings."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached so the .env file is parsed once per process."""
    return Settings()


settings = get_settings()
