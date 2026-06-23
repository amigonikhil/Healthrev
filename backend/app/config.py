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

    # Fernet key for encrypting wearable OAuth tokens at rest (M1).
    token_encryption_key: str = ""

    # Whoop OAuth app credentials (M1). Free developer app.
    whoop_client_id: str = ""
    whoop_client_secret: str = ""
    # Where Whoop redirects after consent; must match the registered app.
    whoop_redirect_uri: str = "http://localhost:8000/wearables/whoop/callback"

    allowed_origins: str = "http://localhost:8081,http://localhost:19006"
    environment: str = "development"
    log_level: str = "INFO"

    # Demo mode: serves a clickable web walkthrough at /demo and a /demo/token
    # endpoint that mints a short-lived JWT. MUST stay off in production — it is
    # an intentional auth shortcut for the hosted demo only.
    demo_mode: bool = False

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
