from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

import asyncpg

from ai.quota import AIQuotaExceededError

from .auth import hash_password, verify_password
from .config import Settings
from .store import InMemoryDocumentStore

FeedbackAction = Literal["accepted", "rejected", "partial", "cancelled"]
FeatureName = Literal["rewrite", "summarize", "translate", "restructure", "continue"]
RoleName = Literal["owner", "editor", "commenter", "viewer"]


@dataclass(slots=True)
class RuntimeDocument:
    owner_user_id: str
    doc_id: str
    title: str


@dataclass(slots=True)
class RuntimeUser:
    id: str
    email: str
    name: str
    role: RoleName
    hashed_password: str
    daily_ai_tokens_used: int = 0
    ai_tokens_reset_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=1))


class AppRuntime:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pool: asyncpg.Pool | None = None
        self._document: RuntimeDocument | None = None
        self._memory_history: list[dict[str, Any]] = []
        self._memory_users_by_id: dict[str, RuntimeUser] = {}
        self._memory_users_by_email: dict[str, RuntimeUser] = {}

    @property
    def connected(self) -> bool:
        return self._pool is not None

    @property
    def document(self) -> RuntimeDocument:
        if self._document is None:
            raise RuntimeError("Runtime has not been started yet.")
        return self._document

    async def startup(self, store: InMemoryDocumentStore) -> None:
        if self._settings.database_url:
            self._pool = await asyncpg.create_pool(self._settings.database_url, min_size=1, max_size=4)
            await self._ensure_enum_values()
            self._document = await self._ensure_demo_identity()
        else:
            self._document = self._ensure_memory_bootstrap()
        store.set_identity(self._document.doc_id, self._document.title)

    async def shutdown(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    async def _ensure_enum_values(self) -> None:
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.execute("ALTER TYPE ai_status ADD VALUE IF NOT EXISTS 'generated'")
            await conn.execute("ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'continue'")

    def _ensure_memory_bootstrap(self) -> RuntimeDocument:
        bootstrap_email = self._settings.dev_bootstrap_email.strip().lower()
        existing = self._memory_users_by_email.get(bootstrap_email)
        if existing is None:
            existing = RuntimeUser(
                id=str(uuid4()),
                email=bootstrap_email,
                name="Preview Owner",
                role="owner",
                hashed_password=hash_password(self._settings.dev_bootstrap_password),
            )
            self._memory_users_by_id[existing.id] = existing
            self._memory_users_by_email[existing.email] = existing
        return RuntimeDocument(owner_user_id=existing.id, doc_id="doc-001", title="Sample Document")

    async def _ensure_demo_identity(self) -> RuntimeDocument:
        assert self._pool is not None
        hashed_password = hash_password(self._settings.dev_bootstrap_password)

        async with self._pool.acquire() as conn:
            user_id = await conn.fetchval(
                """
                INSERT INTO users (email, hashed_password, name)
                VALUES ($1, $2, 'Preview Owner')
                ON CONFLICT (email) DO UPDATE
                SET hashed_password = EXCLUDED.hashed_password,
                    name = EXCLUDED.name
                RETURNING id
                """,
                self._settings.dev_bootstrap_email.strip().lower(),
                hashed_password,
            )

            doc_id = await conn.fetchval(
                """
                SELECT id
                FROM documents
                WHERE title = 'Sample Document' AND owner_id = $1
                ORDER BY created_at ASC
                LIMIT 1
                """,
                user_id,
            )

            if doc_id is None:
                doc_id = await conn.fetchval(
                    """
                    INSERT INTO documents (title, owner_id)
                    VALUES ('Sample Document', $1)
                    RETURNING id
                    """,
                    user_id,
                )

            await conn.execute(
                """
                INSERT INTO permissions (doc_id, user_id, role)
                VALUES ($1, $2, 'owner')
                ON CONFLICT (doc_id, user_id) DO UPDATE
                SET role = EXCLUDED.role
                """,
                doc_id,
                user_id,
            )

        return RuntimeDocument(owner_user_id=str(user_id), doc_id=str(doc_id), title="Sample Document")

    def get_preview_user(self) -> RuntimeUser:
        if self._pool is None:
            return self._memory_users_by_email[self._settings.dev_bootstrap_email.strip().lower()]
        raise RuntimeError("Preview user is only available in memory mode.")

    async def register_user(self, email: str, password: str, name: str | None) -> RuntimeUser:
        email = email.strip().lower()
        display_name = (name or email.split("@", 1)[0]).strip()

        if self._pool is None:
            if email in self._memory_users_by_email:
                raise ValueError("An account with this email already exists.")
            user = RuntimeUser(
                id=str(uuid4()),
                email=email,
                name=display_name,
                role="editor",
                hashed_password=hash_password(password),
            )
            self._memory_users_by_id[user.id] = user
            self._memory_users_by_email[user.email] = user
            return user

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            try:
                user_id = await conn.fetchval(
                    """
                    INSERT INTO users (email, hashed_password, name)
                    VALUES ($1, $2, $3)
                    RETURNING id
                    """,
                    email,
                    hash_password(password),
                    display_name,
                )
            except asyncpg.UniqueViolationError as exc:
                raise ValueError("An account with this email already exists.") from exc

            await conn.execute(
                """
                INSERT INTO permissions (doc_id, user_id, role)
                VALUES ($1, $2, 'editor')
                ON CONFLICT (doc_id, user_id) DO UPDATE
                SET role = EXCLUDED.role
                """,
                UUID(self.document.doc_id),
                user_id,
            )

        return await self._fetch_db_user(user_id)

    async def authenticate_user(self, email: str, password: str) -> RuntimeUser | None:
        email = email.strip().lower()
        if self._pool is None:
            user = self._memory_users_by_email.get(email)
            if user is None or not verify_password(password, user.hashed_password):
                return None
            return user

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.email, u.name, u.hashed_password,
                       COALESCE(p.role::text, 'viewer') AS role,
                       u.daily_ai_tokens_used, u.ai_tokens_reset_at
                FROM users u
                LEFT JOIN permissions p
                  ON p.user_id = u.id AND p.doc_id = $2
                WHERE u.email = $1
                """,
                email,
                UUID(self.document.doc_id),
            )

        if row is None or not verify_password(password, row["hashed_password"]):
            return None
        return self._row_to_user(row)

    async def get_user(self, user_id: str) -> RuntimeUser | None:
        if self._pool is None:
            return self._memory_users_by_id.get(user_id)

        try:
            return await self._fetch_db_user(UUID(user_id))
        except (ValueError, asyncpg.DataError):
            return None

    async def _fetch_db_user(self, user_id: UUID) -> RuntimeUser:
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.email, u.name, u.hashed_password,
                       COALESCE(p.role::text, 'viewer') AS role,
                       u.daily_ai_tokens_used, u.ai_tokens_reset_at
                FROM users u
                LEFT JOIN permissions p
                  ON p.user_id = u.id AND p.doc_id = $2
                WHERE u.id = $1
                """,
                user_id,
                UUID(self.document.doc_id),
            )
        if row is None:
            raise ValueError("User not found.")
        return self._row_to_user(row)

    def _row_to_user(self, row: asyncpg.Record) -> RuntimeUser:
        return RuntimeUser(
            id=str(row["id"]),
            email=row["email"],
            name=row["name"],
            role=row["role"],
            hashed_password=row["hashed_password"],
            daily_ai_tokens_used=int(row["daily_ai_tokens_used"]),
            ai_tokens_reset_at=row["ai_tokens_reset_at"],
        )

    @property
    def preview_doc_id(self) -> str:
        return self.document.doc_id

    async def enforce_quota(self, user_id: str, estimated_input_tokens: int) -> None:
        if estimated_input_tokens > self._settings.ai_per_request_token_cap:
            raise AIQuotaExceededError("This request exceeds the per-request token cap.")

        if self._pool is None:
            user = self._memory_users_by_id[user_id]
            now = datetime.now(timezone.utc)
            if user.ai_tokens_reset_at <= now:
                user.daily_ai_tokens_used = 0
                user.ai_tokens_reset_at = now + timedelta(days=1)
            if user.daily_ai_tokens_used + estimated_input_tokens > self._settings.ai_per_user_daily_token_limit:
                raise AIQuotaExceededError("Daily AI token quota exceeded for this user.")
            return

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT daily_ai_tokens_used, ai_tokens_reset_at
                FROM users
                WHERE id = $1
                """,
                UUID(user_id),
            )
            if row is None:
                return

            now = datetime.now(timezone.utc)
            used = int(row["daily_ai_tokens_used"])
            reset_at = row["ai_tokens_reset_at"]

            if reset_at <= now:
                used = 0
                await conn.execute(
                    """
                    UPDATE users
                    SET daily_ai_tokens_used = 0, ai_tokens_reset_at = $2
                    WHERE id = $1
                    """,
                    UUID(user_id),
                    now + timedelta(days=1),
                )

            if used + estimated_input_tokens > self._settings.ai_per_user_daily_token_limit:
                raise AIQuotaExceededError("Daily AI token quota exceeded for this user.")

    async def begin_interaction(
        self,
        *,
        user_id: str,
        doc_id: str,
        feature: FeatureName,
        input_text: str,
    ) -> str:
        interaction_id = str(uuid4())

        if self._pool is None:
            self._memory_history.insert(
                0,
                {
                    "id": interaction_id,
                    "feature": feature,
                    "input_text": input_text,
                    "suggestion_text": None,
                    "status": "generated",
                    "tokens_used": 0,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "user_id": user_id,
                    "doc_id": doc_id,
                },
            )
            return interaction_id

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            created_id = await conn.fetchval(
                """
                INSERT INTO ai_interactions (doc_id, user_id, feature, input_text, suggestion_text, status, tokens_used)
                VALUES ($1, $2, $3::ai_feature, $4, NULL, 'generated'::ai_status, 0)
                RETURNING id
                """,
                UUID(doc_id),
                UUID(user_id),
                feature,
                input_text,
            )
        return str(created_id)

    async def complete_interaction(
        self,
        interaction_id: str | None,
        suggestion_text: str,
        tokens_used: int,
        *,
        user_id: str,
    ) -> None:
        if interaction_id is None:
            return

        if self._pool is None:
            for item in self._memory_history:
                if item["id"] == interaction_id:
                    item["suggestion_text"] = suggestion_text
                    item["tokens_used"] = tokens_used
                    break
            user = self._memory_users_by_id[user_id]
            user.daily_ai_tokens_used += tokens_used
            return

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE ai_interactions
                SET suggestion_text = $2, tokens_used = $3
                WHERE id = $1 AND user_id = $4
                """,
                UUID(interaction_id),
                suggestion_text,
                tokens_used,
                UUID(user_id),
            )
            await conn.execute(
                """
                UPDATE users
                SET daily_ai_tokens_used = daily_ai_tokens_used + $2
                WHERE id = $1
                """,
                UUID(user_id),
                tokens_used,
            )

    async def record_feedback(self, interaction_id: str, action: FeedbackAction, *, user_id: str | None = None) -> bool:
        if self._pool is None:
            for item in self._memory_history:
                if item["id"] == interaction_id and (user_id is None or item["user_id"] == user_id):
                    item["status"] = action
                    return True
            return False

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE ai_interactions
                SET status = $2::ai_status
                WHERE id = $1
                  AND ($3::uuid IS NULL OR user_id = $3)
                """,
                UUID(interaction_id),
                action,
                UUID(user_id) if user_id else None,
            )
        return result.endswith("1")

    async def list_history(
        self,
        *,
        user_id: str,
        doc_id: str,
        limit: int = 10,
        feature: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        if self._pool is None:
            items = [
                item
                for item in self._memory_history
                if item["user_id"] == user_id and item["doc_id"] == doc_id
            ]
            if feature:
                items = [item for item in items if item["feature"] == feature]
            if status:
                items = [item for item in items if item["status"] == status]
            return items[:limit]

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, feature::text AS feature, input_text, suggestion_text,
                       status::text AS status, tokens_used, created_at
                FROM ai_interactions
                WHERE user_id = $1
                  AND doc_id = $2
                  AND ($3::text IS NULL OR feature::text = $3)
                  AND ($4::text IS NULL OR status::text = $4)
                ORDER BY created_at DESC
                LIMIT $5
                """,
                UUID(user_id),
                UUID(doc_id),
                feature,
                status,
                limit,
            )

        return [dict(row) | {"id": str(row["id"]), "created_at": row["created_at"].isoformat()} for row in rows]
