from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import Settings


class AuthError(Exception):
    """Raised when a token cannot be validated."""


@dataclass(slots=True)
class AuthSubject:
    user_id: str
    email: str
    role: str
    name: str


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    if not hashed_password or hashed_password == "n/a":
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def _encode_token(subject: AuthSubject, *, settings: Settings, token_type: str, expires_in: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject.user_id,
        "email": subject.email,
        "role": subject.role,
        "name": subject.name,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_in).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(subject: AuthSubject, settings: Settings) -> str:
    return _encode_token(
        subject,
        settings=settings,
        token_type="access",
        expires_in=timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )


def create_refresh_token(subject: AuthSubject, settings: Settings) -> str:
    return _encode_token(
        subject,
        settings=settings,
        token_type="refresh",
        expires_in=timedelta(days=settings.jwt_refresh_token_expire_days),
    )


def decode_token(token: str, *, settings: Settings, expected_type: str) -> dict[str, str]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid or expired token.") from exc

    token_type = str(payload.get("type", ""))
    if token_type != expected_type:
        raise AuthError("Invalid token type.")

    return {
        "sub": str(payload.get("sub", "")),
        "email": str(payload.get("email", "")),
        "role": str(payload.get("role", "")),
        "name": str(payload.get("name", "")),
    }
