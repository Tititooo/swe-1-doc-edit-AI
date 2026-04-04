from __future__ import annotations

import os
from dataclasses import dataclass


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(slots=True)
class Settings:
    database_url: str | None
    jwt_secret: str
    jwt_algorithm: str
    jwt_access_token_expire_minutes: int
    jwt_refresh_token_expire_days: int
    groq_api_key: str | None
    groq_model: str
    groq_fallback_model: str
    groq_request_timeout_seconds: float
    ai_per_user_daily_token_limit: int
    ai_per_request_token_cap: int
    cors_origins: list[str]
    api_port: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.getenv("DATABASE_URL"),
            jwt_secret=os.getenv("JWT_SECRET", "dev-secret-change-me"),
            jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
            jwt_access_token_expire_minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "15")),
            jwt_refresh_token_expire_days=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7")),
            groq_api_key=os.getenv("GROQ_API_KEY"),
            groq_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            groq_fallback_model=os.getenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant"),
            groq_request_timeout_seconds=float(os.getenv("GROQ_REQUEST_TIMEOUT_SECONDS", "30")),
            ai_per_user_daily_token_limit=int(os.getenv("AI_PER_USER_DAILY_TOKEN_LIMIT", "50000")),
            ai_per_request_token_cap=int(os.getenv("AI_PER_REQUEST_TOKEN_CAP", "4000")),
            cors_origins=_split_csv(os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")),
            api_port=int(os.getenv("API_PORT", "4000")),
        )
