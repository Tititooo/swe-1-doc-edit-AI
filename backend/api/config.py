from __future__ import annotations

import os
from dataclasses import dataclass


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _to_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(slots=True)
class Settings:
    database_url: str | None
    jwt_secret: str
    jwt_algorithm: str
    jwt_access_token_expire_minutes: int
    jwt_refresh_token_expire_days: int
    dev_bootstrap_email: str
    dev_bootstrap_password: str
    groq_api_key: str | None
    groq_model: str
    groq_fallback_model: str
    groq_request_timeout_seconds: float
    ai_per_user_daily_token_limit: int
    ai_org_monthly_token_budget: int
    ai_per_request_token_cap: int
    ai_require_auth: bool
    ai_fake_mode: bool
    cors_origins: list[str]
    api_port: int
    collab_ws_url: str
    realtime_token_ttl_seconds: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.getenv("DATABASE_URL"),
            jwt_secret=os.getenv("JWT_SECRET", "dev-secret-change-me"),
            jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
            jwt_access_token_expire_minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "15")),
            jwt_refresh_token_expire_days=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7")),
            dev_bootstrap_email=os.getenv("DEV_BOOTSTRAP_EMAIL", "atharv.dev@local"),
            dev_bootstrap_password=os.getenv("DEV_BOOTSTRAP_PASSWORD", "atharv-preview-pass"),
            groq_api_key=os.getenv("GROQ_API_KEY"),
            groq_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            groq_fallback_model=os.getenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant"),
            groq_request_timeout_seconds=float(os.getenv("GROQ_REQUEST_TIMEOUT_SECONDS", "30")),
            ai_per_user_daily_token_limit=int(os.getenv("AI_PER_USER_DAILY_TOKEN_LIMIT", "50000")),
            ai_org_monthly_token_budget=int(os.getenv("AI_ORG_MONTHLY_TOKEN_BUDGET", "1000000")),
            ai_per_request_token_cap=int(os.getenv("AI_PER_REQUEST_TOKEN_CAP", "4000")),
            ai_require_auth=_to_bool(os.getenv("AI_REQUIRE_AUTH"), False),
            ai_fake_mode=_to_bool(os.getenv("AI_FAKE_MODE"), False),
            cors_origins=_split_csv(os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")),
            api_port=int(os.getenv("API_PORT", "4000")),
            collab_ws_url=os.getenv("COLLAB_WS_URL", "ws://127.0.0.1:1234"),
            realtime_token_ttl_seconds=int(os.getenv("REALTIME_TOKEN_TTL_SECONDS", "600")),
        )
