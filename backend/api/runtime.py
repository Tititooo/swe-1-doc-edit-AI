from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

import asyncpg

from ai.quota import AIQuotaExceededError
from api.config import Settings
from api.store import InMemoryDocumentStore

FeedbackAction = Literal["accepted", "rejected", "partial", "cancelled"]
FeatureName = Literal["rewrite", "summarize", "translate", "restructure", "continue"]


@dataclass(slots=True)
class RuntimeIdentity:
    user_id: str
    doc_id: str
    title: str


class AppRuntime:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pool: asyncpg.Pool | None = None
        self._identity: RuntimeIdentity | None = None
        self._memory_history: list[dict[str, Any]] = []

    @property
    def connected(self) -> bool:
        return self._pool is not None

    async def startup(self, store: InMemoryDocumentStore) -> None:
        if not self._settings.database_url:
            return

        self._pool = await asyncpg.create_pool(self._settings.database_url, min_size=1, max_size=4)
        await self._ensure_enum_values()
        self._identity = await self._ensure_demo_identity()
        store.set_identity(self._identity.doc_id, self._identity.title)

    async def shutdown(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    async def _ensure_enum_values(self) -> None:
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.execute("ALTER TYPE ai_status ADD VALUE IF NOT EXISTS 'generated'")
            await conn.execute("ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'continue'")

    async def _ensure_demo_identity(self) -> RuntimeIdentity:
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            user_id = await conn.fetchval(
                """
                INSERT INTO users (email, hashed_password, name)
                VALUES ('temiko.dev@local', 'n/a', 'Temiko Dev')
                ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
                RETURNING id
                """
            )

            doc_id = await conn.fetchval(
                """
                INSERT INTO documents (title, owner_id)
                VALUES ('Sample Document', $1)
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                user_id,
            )

            if doc_id is None:
                doc_id = await conn.fetchval(
                    """
                    SELECT id FROM documents
                    WHERE title = 'Sample Document' AND owner_id = $1
                    ORDER BY created_at ASC
                    LIMIT 1
                    """,
                    user_id,
                )

            await conn.execute(
                """
                INSERT INTO permissions (doc_id, user_id, role)
                VALUES ($1, $2, 'owner')
                ON CONFLICT (doc_id, user_id) DO NOTHING
                """,
                doc_id,
                user_id,
            )

        return RuntimeIdentity(user_id=str(user_id), doc_id=str(doc_id), title="Sample Document")

    async def enforce_quota(self, estimated_input_tokens: int) -> None:
        if self._pool is None or self._identity is None:
            return

        if estimated_input_tokens > self._settings.ai_per_request_token_cap:
            raise AIQuotaExceededError("This request exceeds the per-request token cap.")

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT daily_ai_tokens_used, ai_tokens_reset_at
                FROM users
                WHERE id = $1
                """,
                UUID(self._identity.user_id),
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
                    UUID(self._identity.user_id),
                    now + timedelta(days=1),
                )

            if used >= self._settings.ai_per_user_daily_token_limit:
                raise AIQuotaExceededError("Daily AI token quota exceeded for this user.")

    async def begin_interaction(self, feature: FeatureName, input_text: str) -> str | None:
        if self._pool is None or self._identity is None:
            interaction_id = str(UUID(bytes=b"\x00" * 16)).replace(
                "00000000-0000-0000-0000-000000000000",
                __import__("uuid").uuid4().hex[:8] + "-0000-0000-0000-000000000000",
            )
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
                },
            )
            return interaction_id

        async with self._pool.acquire() as conn:
            interaction_id = await conn.fetchval(
                """
                INSERT INTO ai_interactions (doc_id, user_id, feature, input_text, suggestion_text, status, tokens_used)
                VALUES ($1, $2, $3::ai_feature, $4, NULL, 'generated'::ai_status, 0)
                RETURNING id
                """,
                UUID(self._identity.doc_id),
                UUID(self._identity.user_id),
                feature,
                input_text,
            )
        return str(interaction_id) if interaction_id else None

    async def complete_interaction(self, interaction_id: str | None, suggestion_text: str, tokens_used: int) -> None:
        if interaction_id is None:
            return

        if self._pool is None or self._identity is None:
            for item in self._memory_history:
                if item["id"] == interaction_id:
                    item["suggestion_text"] = suggestion_text
                    item["tokens_used"] = tokens_used
                    return
            return

        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE ai_interactions
                SET suggestion_text = $2, tokens_used = $3
                WHERE id = $1
                """,
                UUID(interaction_id),
                suggestion_text,
                tokens_used,
            )
            await conn.execute(
                """
                UPDATE users
                SET daily_ai_tokens_used = daily_ai_tokens_used + $2
                WHERE id = $1
                """,
                UUID(self._identity.user_id),
                tokens_used,
            )

    async def record_feedback(self, interaction_id: str, action: FeedbackAction) -> bool:
        if self._pool is None:
            for item in self._memory_history:
                if item["id"] == interaction_id:
                    item["status"] = action
                    return True
            return False

        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE ai_interactions
                SET status = $2::ai_status
                WHERE id = $1
                """,
                UUID(interaction_id),
                action,
            )
        return result.endswith("1")

    async def list_history(self, limit: int = 10) -> list[dict[str, Any]]:
        if self._pool is None or self._identity is None:
            return self._memory_history[:limit]

        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, feature::text AS feature, input_text, suggestion_text, status::text AS status, tokens_used, created_at
                FROM ai_interactions
                WHERE doc_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                UUID(self._identity.doc_id),
                limit,
            )
        return [dict(row) | {"id": str(row["id"]), "created_at": row["created_at"].isoformat()} for row in rows]
