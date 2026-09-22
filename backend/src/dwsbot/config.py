"""Application settings, loaded from environment (12-factor) with .env fallback."""
from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Discord bot ---
    discord_token: str = Field(..., description="Bot token from the Discord developer portal")
    guild_id: int = Field(..., description="Alliance Discord server ID")

    # --- Discord OAuth2 (backoffice login) ---
    discord_client_id: str = ""
    discord_client_secret: str = ""
    # Where Discord sends the user back to. Must exactly match a redirect URI
    # registered on the application, and points at THIS api, not the SPA.
    oauth_redirect_uri: str = "https://dws-api.xronocore.qzz.io/auth/callback"
    # Where the API bounces the browser once a session is minted.
    frontend_url: str = "https://pou.actuallyplaying.com"

    # The Pass Occupation War map generator — a second static frontend on the
    # same API. Separate origin, so it needs its own CORS entry below.
    passwar_url: str = "https://pou-rocks.github.io/pou-pass-war"

    # Discord role names that may use the backoffice and admin bot commands.
    admin_roles: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["R5", "R4"]
    )

    # --- Database ---
    database_url: str = Field(
        default="postgresql+asyncpg://dws_manager@192.168.1.136:5432/dws_manager"
    )

    # --- Security ---
    jwt_secret: str = Field(..., description="HMAC key for backoffice session tokens")
    jwt_ttl_hours: int = 12

    # Origins allowed to call this API from a browser. The custom domain is the
    # production one; localhost entries make `npm run dev` work.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "https://pou.actuallyplaying.com",
            # The Pages address. It redirects to the custom domain, so nothing
            # calls from it today; kept so removing the domain fails soft.
            "https://dws-manager-bot.github.io",
            # CORS matches scheme+host only, so this covers /pou-pass-war and the
            # hive map alike — both are served from the same Pages origin.
            "https://pou-rocks.github.io",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8742",
        ]
    )

    # --- Runtime ---
    timezone: str = "Asia/Seoul"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    log_level: str = "INFO"

    @field_validator("admin_roles", "cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, v):
        """Accept both a JSON list and a plain comma-separated env string."""
        if isinstance(v, str) and not v.strip().startswith("["):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @property
    def oauth_enabled(self) -> bool:
        return bool(self.discord_client_id and self.discord_client_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
