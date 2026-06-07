"""Application configuration, loaded from the environment only.

No secrets are hard-coded. Values come from environment variables (see
`.env.example`); in production they are injected by the host (Render/Railway/Fly).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str = ""
    # HS256 secret used to verify end-user JWTs minted by Supabase Auth.
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""

    allowed_origins: str = "http://localhost:8081,http://localhost:19006"
    environment: str = "development"
    log_level: str = "INFO"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
