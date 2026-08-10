from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "韧性云图 API"
    api_prefix: str = "/api"
    database_url: str = "postgresql+asyncpg://resilience:resilience-dev@localhost:5432/resilience_atlas"
    jwt_secret: str = "development-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24
    s3_endpoint: str = "http://localhost:9000"
    s3_public_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "resilience"
    s3_secret_key: str = "resilience-dev"
    s3_bucket: str = "datasets"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:8080"]
    max_upload_mb: int = 1024
    raster_preview_max_dimension: int = 2048
    platform_admin_username: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

