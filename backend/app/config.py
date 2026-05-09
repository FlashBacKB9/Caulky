import secrets
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings

_SECRET_FILE = Path(__file__).parent.parent / ".secret_key"


def _load_or_create_secret() -> str:
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_text().strip()
    key = secrets.token_hex(32)
    _SECRET_FILE.write_text(key)
    return key


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:spendly@localhost:5432/spendly"
    CORS_ORIGINS: str = "http://localhost:5173"
    SECRET_KEY: str = Field(default_factory=_load_or_create_secret)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    COOKIE_SECURE: bool = False  # Set True in production (requires HTTPS)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    model_config = {"env_file": ".env"}


settings = Settings()
