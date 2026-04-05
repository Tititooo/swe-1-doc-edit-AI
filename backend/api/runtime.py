from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

import asyncpg

from ai.quota import AIQuotaExceededError

from .auth import hash_password, verify_password
from .config import Settings
from .store import DEFAULT_DOCUMENT_CONTENT, InMemoryDocumentStore

FeedbackAction = Literal["accepted", "rejected", "partial", "cancelled"]
FeatureName = Literal["rewrite", "summarize", "translate", "restructure", "continue"]
RoleName = Literal["owner", "editor", "commenter", "viewer"]

DEFAULT_FEATURE_ACCESS: dict[RoleName, list[FeatureName]] = {
    "owner": ["rewrite", "summarize", "translate", "restructure", "continue"],
    "editor": ["rewrite", "summarize", "translate", "restructure", "continue"],
    "commenter": [],
    "viewer": [],
}


@dataclass(slots=True)
class RuntimeDocument:
    id: str
    owner_user_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: datetime | None = None


@dataclass(slots=True)
class RuntimeUser:
    id: str
    email: str
    name: str
    role: RoleName
    hashed_password: str
    daily_ai_tokens_used: int = 0
    ai_tokens_reset_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=1))


@dataclass(slots=True)
class RuntimePermission:
    id: str
    doc_id: str
    user_id: str
    role: RoleName
    created_at: datetime


class AppRuntime:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pool: asyncpg.Pool | None = None
        self._store: InMemoryDocumentStore | None = None
        self._preview_doc_id: str | None = None
        self._preview_owner_user_id: str | None = None
        self._memory_history: list[dict[str, Any]] = []
        self._memory_users_by_id: dict[str, RuntimeUser] = {}
        self._memory_users_by_email: dict[str, RuntimeUser] = {}
        self._memory_documents: dict[str, RuntimeDocument] = {}
        self._memory_permissions: dict[str, dict[str, RuntimePermission]] = {}
        self._memory_ai_settings: dict[str, Any] = {
            "feature_access": {role: list(features) for role, features in DEFAULT_FEATURE_ACCESS.items()},
            "daily_token_limit": settings.ai_per_user_daily_token_limit,
            "monthly_org_token_budget": settings.ai_org_monthly_token_budget,
            "consent_required": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": None,
        }

    @property
    def connected(self) -> bool:
        return self._pool is not None

    @property
    def preview_doc_id(self) -> str:
        if self._preview_doc_id is None:
            raise RuntimeError("Runtime has not been started yet.")
        return self._preview_doc_id

    @property
    def preview_owner_user_id(self) -> str:
        if self._preview_owner_user_id is None:
            raise RuntimeError("Runtime has not been started yet.")
        return self._preview_owner_user_id

    async def startup(self, store: InMemoryDocumentStore) -> None:
        self._store = store
        if self._settings.database_url:
            self._pool = await asyncpg.create_pool(self._settings.database_url, min_size=1, max_size=4)
            await self._ensure_enum_values()
            await self._ensure_runtime_tables()
        await store.bind_pool(self._pool)

        if self._pool is None:
            preview_doc = self._ensure_memory_bootstrap()
        else:
            preview_doc = await self._ensure_demo_identity()

        self._preview_doc_id = preview_doc.id
        self._preview_owner_user_id = preview_doc.owner_user_id
        await store.ensure_document(
            preview_doc.id,
            preview_doc.title,
            preview_doc.owner_user_id,
            DEFAULT_DOCUMENT_CONTENT,
        )

    async def shutdown(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    async def _ensure_enum_values(self) -> None:
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.execute("ALTER TYPE ai_status ADD VALUE IF NOT EXISTS 'generated'")
            await conn.execute("ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'continue'")

    async def _ensure_runtime_tables(self) -> None:
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ")
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS org_ai_settings (
                    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
                    feature_access JSONB NOT NULL,
                    daily_token_limit INT NOT NULL,
                    monthly_token_budget BIGINT NOT NULL,
                    consent_required BOOLEAN NOT NULL DEFAULT TRUE,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_by UUID REFERENCES users (id) ON DELETE SET NULL
                )
                """
            )
            await conn.execute(
                """
                ALTER TABLE org_ai_settings
                ADD COLUMN IF NOT EXISTS monthly_token_budget BIGINT NOT NULL DEFAULT 1000000
                """
            )
            await conn.execute(
                """
                ALTER TABLE org_ai_settings
                ADD COLUMN IF NOT EXISTS consent_required BOOLEAN NOT NULL DEFAULT TRUE
                """
            )
            await conn.execute(
                """
                INSERT INTO org_ai_settings (singleton, feature_access, daily_token_limit, monthly_token_budget, consent_required)
                VALUES (TRUE, $1::jsonb, $2, $3, TRUE)
                ON CONFLICT (singleton) DO NOTHING
                """,
                self._default_feature_access_json(),
                self._settings.ai_per_user_daily_token_limit,
                self._settings.ai_org_monthly_token_budget,
            )

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

        now = datetime.now(timezone.utc)
        document = self._memory_documents.get("doc-001")
        if document is None:
            document = RuntimeDocument(
                id="doc-001",
                owner_user_id=existing.id,
                title="Sample Document",
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            self._memory_documents[document.id] = document
        self._memory_permissions.setdefault(document.id, {})
        if not any(permission.user_id == existing.id for permission in self._memory_permissions[document.id].values()):
            permission = RuntimePermission(
                id=str(uuid4()),
                doc_id=document.id,
                user_id=existing.id,
                role="owner",
                created_at=now,
            )
            self._memory_permissions[document.id][permission.id] = permission
        return document

    def _default_feature_access_json(self) -> str:
        return (
            '{"owner":["rewrite","summarize","translate","restructure","continue"],'
            '"editor":["rewrite","summarize","translate","restructure","continue"],'
            '"commenter":[],"viewer":[]}'
        )

    def _ai_settings_payload(
        self,
        *,
        feature_access: dict[str, list[str]] | None = None,
        daily_token_limit: int | None = None,
        monthly_org_token_budget: int | None = None,
        consent_required: bool | None = None,
        updated_at: datetime | None = None,
        updated_by: str | None = None,
    ) -> dict[str, Any]:
        return {
            "feature_access": feature_access or {role: list(features) for role, features in DEFAULT_FEATURE_ACCESS.items()},
            "daily_token_limit": daily_token_limit or self._settings.ai_per_user_daily_token_limit,
            "monthly_org_token_budget": monthly_org_token_budget or self._settings.ai_org_monthly_token_budget,
            "consent_required": True if consent_required is None else consent_required,
            "updated_at": (updated_at or datetime.now(timezone.utc)).isoformat(),
            "updated_by": updated_by,
        }

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

            row = await conn.fetchrow(
                """
                SELECT id, title, owner_id, created_at, updated_at, is_deleted, deleted_at
                FROM documents
                WHERE title = 'Sample Document' AND owner_id = $1
                ORDER BY created_at ASC
                LIMIT 1
                """,
                user_id,
            )

            if row is None:
                row = await conn.fetchrow(
                    """
                    INSERT INTO documents (title, owner_id)
                    VALUES ('Sample Document', $1)
                    RETURNING id, title, owner_id, created_at, updated_at, is_deleted, deleted_at
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
                row["id"],
                user_id,
            )

        return RuntimeDocument(
            id=str(row["id"]),
            owner_user_id=str(row["owner_id"]),
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            is_deleted=row["is_deleted"],
            deleted_at=row["deleted_at"],
        )

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
            permission = RuntimePermission(
                id=str(uuid4()),
                doc_id=self.preview_doc_id,
                user_id=user.id,
                role="editor",
                created_at=datetime.now(timezone.utc),
            )
            self._memory_permissions.setdefault(self.preview_doc_id, {})[permission.id] = permission
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
                UUID(self.preview_doc_id),
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
                SELECT id, email, name, hashed_password,
                       daily_ai_tokens_used, ai_tokens_reset_at
                FROM users
                WHERE email = $1
                """,
                email,
            )

        if row is None or not verify_password(password, row["hashed_password"]):
            return None
        return self._row_to_user(row, role="editor")

    async def get_user(self, user_id: str) -> RuntimeUser | None:
        if self._pool is None:
            return self._memory_users_by_id.get(user_id)

        try:
            return await self._fetch_db_user(UUID(user_id))
        except (ValueError, asyncpg.DataError):
            return None

    async def get_user_by_email(self, email: str) -> RuntimeUser | None:
        email = email.strip().lower()
        if self._pool is None:
            return self._memory_users_by_email.get(email)

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, email, name, hashed_password,
                       daily_ai_tokens_used, ai_tokens_reset_at
                FROM users
                WHERE email = $1
                """,
                email,
            )
        if row is None:
            return None
        return self._row_to_user(row, role="editor")

    async def is_admin_user(self, user_id: str) -> bool:
        user = await self.get_user(user_id)
        if user is None:
            return False
        return user.email == self._settings.dev_bootstrap_email.strip().lower()

    async def _fetch_db_user(self, user_id: UUID) -> RuntimeUser:
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, email, name, hashed_password,
                       daily_ai_tokens_used, ai_tokens_reset_at
                FROM users
                WHERE id = $1
                """,
                user_id,
            )
        if row is None:
            raise ValueError("User not found.")
        return self._row_to_user(row, role="editor")

    def _row_to_user(self, row: asyncpg.Record, *, role: RoleName) -> RuntimeUser:
        return RuntimeUser(
            id=str(row["id"]),
            email=row["email"],
            name=row["name"],
            role=role,
            hashed_password=row["hashed_password"],
            daily_ai_tokens_used=int(row["daily_ai_tokens_used"]),
            ai_tokens_reset_at=row["ai_tokens_reset_at"],
        )

    async def get_document_role(self, doc_id: str, user_id: str) -> RoleName | None:
        if self._pool is None:
            permissions = self._memory_permissions.get(doc_id, {})
            for permission in permissions.values():
                if permission.user_id == user_id:
                    return permission.role
            return None

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            role = await conn.fetchval(
                """
                SELECT role::text
                FROM permissions
                WHERE doc_id = $1 AND user_id = $2
                """,
                UUID(doc_id),
                UUID(user_id),
            )
        return role

    async def list_documents_for_user(self, user_id: str) -> list[dict[str, Any]]:
        if self._pool is None:
            results: list[dict[str, Any]] = []
            for doc in self._memory_documents.values():
                if doc.is_deleted:
                    continue
                role = await self.get_document_role(doc.id, user_id)
                if role is None:
                    continue
                results.append(
                    {
                        "id": doc.id,
                        "title": doc.title,
                        "role": role,
                        "updated_at": doc.updated_at.isoformat(),
                    }
                )
            results.sort(key=lambda item: item["updated_at"], reverse=True)
            return results

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT d.id, d.title, p.role::text AS role, d.updated_at
                FROM documents d
                JOIN permissions p ON p.doc_id = d.id
                WHERE d.is_deleted = FALSE AND p.user_id = $1
                ORDER BY d.updated_at DESC
                """,
                UUID(user_id),
            )
        return [
            {
                "id": str(row["id"]),
                "title": row["title"],
                "role": row["role"],
                "updated_at": row["updated_at"].isoformat(),
            }
            for row in rows
        ]

    async def create_document(self, owner_user_id: str, title: str) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        if self._pool is None:
            doc_id = str(uuid4())
            document = RuntimeDocument(
                id=doc_id,
                owner_user_id=owner_user_id,
                title=title,
                created_at=now,
                updated_at=now,
            )
            self._memory_documents[doc_id] = document
            permission = RuntimePermission(
                id=str(uuid4()),
                doc_id=doc_id,
                user_id=owner_user_id,
                role="owner",
                created_at=now,
            )
            self._memory_permissions.setdefault(doc_id, {})[permission.id] = permission
            assert self._store is not None
            await self._store.ensure_document(doc_id, title, owner_user_id, "")
            return {
                "id": doc_id,
                "title": title,
                "owner_id": owner_user_id,
                "created_at": now.isoformat(),
            }

        assert self._pool is not None
        assert self._store is not None
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    INSERT INTO documents (title, owner_id)
                    VALUES ($1, $2)
                    RETURNING id, title, owner_id, created_at
                    """,
                    title,
                    UUID(owner_user_id),
                )
                await conn.execute(
                    """
                    INSERT INTO permissions (doc_id, user_id, role)
                    VALUES ($1, $2, 'owner')
                    """,
                    row["id"],
                    UUID(owner_user_id),
                )
        await self._store.ensure_document(str(row["id"]), row["title"], owner_user_id, "")
        return {
            "id": str(row["id"]),
            "title": row["title"],
            "owner_id": str(row["owner_id"]),
            "created_at": row["created_at"].isoformat(),
        }

    async def get_document_detail(self, doc_id: str, user_id: str) -> dict[str, Any]:
        if self._pool is None:
            document = self._memory_documents.get(doc_id)
            if document is None or document.is_deleted:
                raise KeyError(doc_id)
            role = await self.get_document_role(doc_id, user_id)
            if role is None:
                raise PermissionError(doc_id)
            owner = self._memory_users_by_id[document.owner_user_id]
            permissions = await self.list_permissions(doc_id, user_id)
            assert self._store is not None
            content = await self._store.get_document(doc_id)
            return {
                "id": document.id,
                "title": document.title,
                "content": content.content,
                "owner": {"id": owner.id, "email": owner.email, "name": owner.name},
                "permissions": permissions,
                "updated_at": document.updated_at.isoformat(),
                "version_id": content.versionId,
            }

        assert self._pool is not None
        assert self._store is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT d.id, d.title, d.owner_id, d.updated_at,
                       owner.email AS owner_email, owner.name AS owner_name
                FROM documents d
                JOIN permissions p ON p.doc_id = d.id
                JOIN users owner ON owner.id = d.owner_id
                WHERE d.id = $1 AND d.is_deleted = FALSE AND p.user_id = $2
                """,
                UUID(doc_id),
                UUID(user_id),
            )
        if row is None:
            raise KeyError(doc_id)
        content = await self._store.get_document(doc_id)
        permissions = await self.list_permissions(doc_id, user_id)
        return {
            "id": str(row["id"]),
            "title": row["title"],
            "content": content.content,
            "owner": {"id": str(row["owner_id"]), "email": row["owner_email"], "name": row["owner_name"]},
            "permissions": permissions,
            "updated_at": row["updated_at"].isoformat(),
            "version_id": content.versionId,
        }

    async def update_document_title(self, doc_id: str, title: str, user_id: str) -> dict[str, Any]:
        role = await self.get_document_role(doc_id, user_id)
        if role not in {"owner", "editor"}:
            raise PermissionError(doc_id)

        if self._pool is None:
            document = self._memory_documents.get(doc_id)
            if document is None or document.is_deleted:
                raise KeyError(doc_id)
            document.title = title
            document.updated_at = datetime.now(timezone.utc)
            assert self._store is not None
            await self._store.ensure_document(doc_id, title, document.owner_user_id, "")
            return {"id": doc_id, "title": title, "updated_at": document.updated_at.isoformat()}

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE documents
                SET title = $2, updated_at = NOW()
                WHERE id = $1 AND is_deleted = FALSE
                RETURNING id, title, updated_at, owner_id
                """,
                UUID(doc_id),
                title,
            )
        if row is None:
            raise KeyError(doc_id)
        assert self._store is not None
        await self._store.ensure_document(doc_id, title, str(row["owner_id"]), "")
        return {"id": str(row["id"]), "title": row["title"], "updated_at": row["updated_at"].isoformat()}

    async def soft_delete_document(self, doc_id: str, user_id: str) -> None:
        role = await self.get_document_role(doc_id, user_id)
        if role != "owner":
            raise PermissionError(doc_id)

        if self._pool is None:
            document = self._memory_documents.get(doc_id)
            if document is None:
                raise KeyError(doc_id)
            document.is_deleted = True
            document.updated_at = datetime.now(timezone.utc)
            document.deleted_at = document.updated_at
            return

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE documents
                SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
                WHERE id = $1
                """,
                UUID(doc_id),
            )
        if result.endswith("0"):
            raise KeyError(doc_id)

    async def restore_document(self, doc_id: str, user_id: str) -> dict[str, Any]:
        role = await self.get_document_role(doc_id, user_id)
        if role != "owner":
            raise PermissionError(doc_id)

        if self._pool is None:
            document = self._memory_documents.get(doc_id)
            if document is None:
                raise KeyError(doc_id)
            if not document.is_deleted:
                return {"id": document.id, "title": document.title, "updated_at": document.updated_at.isoformat(), "restored": True}
            if document.deleted_at and datetime.now(timezone.utc) - document.deleted_at > timedelta(days=30):
                raise ValueError("This document is beyond the 30-day restore window.")
            document.is_deleted = False
            document.deleted_at = None
            document.updated_at = datetime.now(timezone.utc)
            return {"id": document.id, "title": document.title, "updated_at": document.updated_at.isoformat(), "restored": True}

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, title, updated_at, deleted_at
                FROM documents
                WHERE id = $1
                """,
                UUID(doc_id),
            )
            if row is None:
                raise KeyError(doc_id)
            if row["deleted_at"] and datetime.now(timezone.utc) - row["deleted_at"] > timedelta(days=30):
                raise ValueError("This document is beyond the 30-day restore window.")
            row = await conn.fetchrow(
                """
                UPDATE documents
                SET is_deleted = FALSE, deleted_at = NULL, updated_at = NOW()
                WHERE id = $1
                RETURNING id, title, updated_at
                """,
                UUID(doc_id),
            )
        return {"id": str(row["id"]), "title": row["title"], "updated_at": row["updated_at"].isoformat(), "restored": True}

    async def list_permissions(self, doc_id: str, user_id: str) -> list[dict[str, Any]]:
        role = await self.get_document_role(doc_id, user_id)
        if role is None:
            raise PermissionError(doc_id)

        if self._pool is None:
            permissions = self._memory_permissions.get(doc_id, {})
            items = []
            for permission in permissions.values():
                target = self._memory_users_by_id[permission.user_id]
                items.append(
                    {
                        "permission_id": permission.id,
                        "user_id": target.id,
                        "email": target.email,
                        "name": target.name,
                        "role": permission.role,
                    }
                )
            return sorted(items, key=lambda item: (item["role"] != "owner", item["email"]))

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT p.id, u.id AS user_id, u.email, u.name, p.role::text AS role
                FROM permissions p
                JOIN users u ON u.id = p.user_id
                WHERE p.doc_id = $1
                ORDER BY CASE WHEN p.role::text = 'owner' THEN 0 ELSE 1 END, u.email ASC
                """,
                UUID(doc_id),
            )
        return [
            {
                "permission_id": str(row["id"]),
                "user_id": str(row["user_id"]),
                "email": row["email"],
                "name": row["name"],
                "role": row["role"],
            }
            for row in rows
        ]

    async def add_permission(self, doc_id: str, acting_user_id: str, user_email: str, role: RoleName) -> dict[str, Any]:
        acting_role = await self.get_document_role(doc_id, acting_user_id)
        if acting_role != "owner":
            raise PermissionError(doc_id)

        target = await self.get_user_by_email(user_email)
        if target is None:
            raise ValueError("The target user must register before the document can be shared.")

        if self._pool is None:
            permissions = self._memory_permissions.setdefault(doc_id, {})
            existing = next((item for item in permissions.values() if item.user_id == target.id), None)
            if existing is not None:
                existing.role = role
                return {"permission_id": existing.id, "user_id": target.id, "role": role}
            permission = RuntimePermission(
                id=str(uuid4()),
                doc_id=doc_id,
                user_id=target.id,
                role=role,
                created_at=datetime.now(timezone.utc),
            )
            permissions[permission.id] = permission
            return {"permission_id": permission.id, "user_id": target.id, "role": role}

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO permissions (doc_id, user_id, role)
                VALUES ($1, $2, $3::permission_role)
                ON CONFLICT (doc_id, user_id) DO UPDATE
                SET role = EXCLUDED.role
                RETURNING id, user_id, role::text AS role
                """,
                UUID(doc_id),
                UUID(target.id),
                role,
            )
        return {"permission_id": str(row["id"]), "user_id": str(row["user_id"]), "role": row["role"]}

    async def update_permission(self, doc_id: str, permission_id: str, acting_user_id: str, role: RoleName) -> dict[str, Any]:
        acting_role = await self.get_document_role(doc_id, acting_user_id)
        if acting_role != "owner":
            raise PermissionError(doc_id)

        if self._pool is None:
            permission = self._memory_permissions.get(doc_id, {}).get(permission_id)
            if permission is None:
                raise KeyError(permission_id)
            permission.role = role
            return {"permission_id": permission.id, "user_id": permission.user_id, "role": permission.role}

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE permissions
                SET role = $3::permission_role
                WHERE id = $1 AND doc_id = $2
                RETURNING id, user_id, role::text AS role
                """,
                UUID(permission_id),
                UUID(doc_id),
                role,
            )
        if row is None:
            raise KeyError(permission_id)
        return {"permission_id": str(row["id"]), "user_id": str(row["user_id"]), "role": row["role"]}

    async def delete_permission(self, doc_id: str, permission_id: str, acting_user_id: str) -> None:
        acting_role = await self.get_document_role(doc_id, acting_user_id)
        if acting_role != "owner":
            raise PermissionError(doc_id)

        if self._pool is None:
            permissions = self._memory_permissions.get(doc_id, {})
            permission = permissions.get(permission_id)
            if permission is None:
                raise KeyError(permission_id)
            if permission.role == "owner":
                raise ValueError("The owner permission cannot be removed.")
            del permissions[permission_id]
            return

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT role::text AS role
                FROM permissions
                WHERE id = $1 AND doc_id = $2
                """,
                UUID(permission_id),
                UUID(doc_id),
            )
            if row is None:
                raise KeyError(permission_id)
            if row["role"] == "owner":
                raise ValueError("The owner permission cannot be removed.")
            result = await conn.execute(
                """
                DELETE FROM permissions
                WHERE id = $1 AND doc_id = $2
                """,
                UUID(permission_id),
                UUID(doc_id),
            )
        if result.endswith("0"):
            raise KeyError(permission_id)

    async def get_ai_settings(self) -> dict[str, Any]:
        if self._pool is None:
            return self._memory_ai_settings

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT feature_access, daily_token_limit, monthly_token_budget, consent_required, updated_at, updated_by
                FROM org_ai_settings
                WHERE singleton = TRUE
                """
            )
        if row is None:
            return self._ai_settings_payload()
        return {
            "feature_access": row["feature_access"],
            "daily_token_limit": int(row["daily_token_limit"]),
            "monthly_org_token_budget": int(row["monthly_token_budget"]),
            "consent_required": bool(row["consent_required"]),
            "updated_at": row["updated_at"].isoformat(),
            "updated_by": str(row["updated_by"]) if row["updated_by"] else None,
        }

    async def update_ai_settings(
        self,
        *,
        acting_user_id: str,
        feature_access: dict[str, list[str]] | None = None,
        daily_token_limit: int | None = None,
        monthly_token_budget: int | None = None,
        consent_required: bool | None = None,
    ) -> dict[str, Any]:
        if not await self.is_admin_user(acting_user_id):
            raise PermissionError("admin")

        current = await self.get_ai_settings()
        next_feature_access = feature_access or current["feature_access"]
        next_daily_limit = daily_token_limit or current["daily_token_limit"]
        next_monthly_budget = monthly_token_budget or current["monthly_org_token_budget"]

        if self._pool is None:
            self._memory_ai_settings = self._ai_settings_payload(
                feature_access=next_feature_access,
                daily_token_limit=next_daily_limit,
                monthly_org_token_budget=next_monthly_budget,
                consent_required=consent_required,
                updated_by=acting_user_id,
            )
            return self._memory_ai_settings

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO org_ai_settings (singleton, feature_access, daily_token_limit, monthly_token_budget, consent_required, updated_by)
                VALUES (TRUE, $1::jsonb, $2, $3, $4, $5)
                ON CONFLICT (singleton) DO UPDATE
                SET feature_access = EXCLUDED.feature_access,
                    daily_token_limit = EXCLUDED.daily_token_limit,
                    monthly_token_budget = EXCLUDED.monthly_token_budget,
                    consent_required = EXCLUDED.consent_required,
                    updated_at = NOW(),
                    updated_by = EXCLUDED.updated_by
                RETURNING feature_access, daily_token_limit, monthly_token_budget, consent_required, updated_at, updated_by
                """,
                next_feature_access,
                next_daily_limit,
                next_monthly_budget,
                True if consent_required is None else consent_required,
                UUID(acting_user_id),
            )
        return {
            "feature_access": row["feature_access"],
            "daily_token_limit": int(row["daily_token_limit"]),
            "monthly_org_token_budget": int(row["monthly_token_budget"]),
            "consent_required": bool(row["consent_required"]),
            "updated_at": row["updated_at"].isoformat(),
            "updated_by": str(row["updated_by"]) if row["updated_by"] else None,
        }

    async def is_ai_feature_enabled_for_role(self, feature: FeatureName, role: RoleName) -> bool:
        settings = await self.get_ai_settings()
        feature_access = settings["feature_access"]
        allowed = feature_access.get(role, [])
        return feature in allowed

    async def enforce_quota(self, user_id: str, estimated_input_tokens: int) -> None:
        ai_settings = await self.get_ai_settings()
        daily_limit = int(ai_settings["daily_token_limit"])
        monthly_budget = int(ai_settings["monthly_org_token_budget"])

        if estimated_input_tokens > self._settings.ai_per_request_token_cap:
            raise AIQuotaExceededError("This request exceeds the per-request token cap.")

        if self._pool is None:
            user = self._memory_users_by_id[user_id]
            now = datetime.now(timezone.utc)
            if user.ai_tokens_reset_at <= now:
                user.daily_ai_tokens_used = 0
                user.ai_tokens_reset_at = now + timedelta(days=1)
            monthly_used = sum(
                int(item["tokens_used"])
                for item in self._memory_history
                if datetime.fromisoformat(item["created_at"]).year == now.year
                and datetime.fromisoformat(item["created_at"]).month == now.month
            )
            if monthly_used + estimated_input_tokens > monthly_budget:
                raise AIQuotaExceededError("Monthly AI token quota exceeded for the organization.")
            if user.daily_ai_tokens_used + estimated_input_tokens > daily_limit:
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

            monthly_used = await conn.fetchval(
                """
                SELECT COALESCE(SUM(tokens_used), 0)
                FROM ai_interactions
                WHERE created_at >= date_trunc('month', NOW())
                """
            )
            if int(monthly_used or 0) + estimated_input_tokens > monthly_budget:
                raise AIQuotaExceededError("Monthly AI token quota exceeded for the organization.")

            if used + estimated_input_tokens > daily_limit:
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

    async def delete_history_item(self, interaction_id: str, *, user_id: str) -> bool:
        if self._pool is None:
            before = len(self._memory_history)
            self._memory_history = [
                item for item in self._memory_history if not (item["id"] == interaction_id and item["user_id"] == user_id)
            ]
            return len(self._memory_history) != before

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM ai_interactions
                WHERE id = $1 AND user_id = $2
                """,
                UUID(interaction_id),
                UUID(user_id),
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

    async def delete_history_item(self, interaction_id: str, *, user_id: str) -> bool:
        if self._pool is None:
            before = len(self._memory_history)
            self._memory_history = [
                item for item in self._memory_history if not (item["id"] == interaction_id and item["user_id"] == user_id)
            ]
            return len(self._memory_history) != before

        assert self._pool is not None
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM ai_interactions
                WHERE id = $1 AND user_id = $2
                """,
                UUID(interaction_id),
                UUID(user_id),
            )
        return result.endswith("1")
