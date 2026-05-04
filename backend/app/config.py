from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:spendly@localhost:5432/spendly"
    CORS_ORIGINS: str = "http://localhost:5173"
    SECRET_KEY: str = "CHANGE-THIS-IN-PRODUCTION-USE-A-RANDOM-32-CHAR-STRING"
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    COOKIE_SECURE: bool = False  # Set True in production (requires HTTPS)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    model_config = {"env_file": ".env"}


settings = Settings()
