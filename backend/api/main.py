from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sse_starlette.sse import EventSourceResponse

from ai.groq_client import GroqChatClient, GroqClientError
from ai.quota import AIQuotaExceededError, estimate_tokens
from ai.service import AIService, FakeAIService

from .auth import (
    AuthError,
    AuthSubject,
    create_access_token,
    create_doc_access_token,
    create_refresh_token,
    create_share_link_token,
    decode_share_link_token,
    decode_token,
)
from .config import Settings
from .runtime import AppRuntime, RuntimeUser
from .schemas import (
    AIHistoryItem,
    AISettingsPatchRequest,
    AISettingsResponse,
    AuthRequest,
    AuthResponse,
    ContinueRequest,
    CreateDocumentRequest,
    CreateSnapshotRequest,
    DocumentContentResponse,
    DocumentCreateResponse,
    DocumentDetailResponse,
    DocumentListItem,
    DocumentMutationResponse,
    DocumentVersionItem,
    FeedbackRequest,
    HealthResponse,
    PatchDocumentRequest,
    PermissionCreateRequest,
    PermissionListItem,
    PermissionMutationResponse,
    PermissionUpdateRequest,
    RefreshRequest,
    RealtimeSessionRequest,
    RealtimeSessionResponse,
    RegisterRequest,
    RealtimeAwarenessUser,
    RevertResponse,
    RestructureRequest,
    ShareLinkAcceptRequest,
    ShareLinkAcceptResponse,
    ShareLinkCreateRequest,
    ShareLinkCreateResponse,
    StreamingRewriteRequest,
    SuggestionEvent,
    SummarizeRequest,
    TranslateRequest,
    UpdateDocumentPayload,
    UserResponse,
)
from .store import InMemoryDocumentStore, VersionConflictError

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
load_dotenv()


def _extract_selection_text(payload: dict[str, Any]) -> str:
    selection = payload.get("selection")
    if isinstance(selection, dict):
        text = selection.get("text")
        if isinstance(text, str) and text.strip():
            return text.strip()
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"message": "selection.text is required for streaming AI requests", "code": "INVALID_REQUEST"},
    )


def create_app() -> FastAPI:
    settings = Settings.from_env()
    store = InMemoryDocumentStore()
    ai_service = FakeAIService() if settings.ai_fake_mode else AIService(GroqChatClient(settings))
    runtime = AppRuntime(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await runtime.startup(store)
        yield
        await runtime.shutdown()

    app = FastAPI(title="Collab Editor API", version="0.4.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.store = store
    app.state.ai_service = ai_service
    app.state.runtime = runtime

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException | StarletteHTTPException):
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        if "message" not in detail:
            detail["message"] = "Request failed."
        return JSONResponse(status_code=exc.status_code, content=detail)

    def get_store(request: Request) -> InMemoryDocumentStore:
        return request.app.state.store

    def get_ai_service(request: Request) -> AIService:
        return request.app.state.ai_service

    def get_runtime(request: Request) -> AppRuntime:
        return request.app.state.runtime

    def as_user_response(user: RuntimeUser) -> UserResponse:
        return UserResponse(id=user.id, email=user.email, name=user.name, role=user.role)

    def as_auth_response(user: RuntimeUser) -> AuthResponse:
        subject = AuthSubject(user_id=user.id, email=user.email, role=user.role, name=user.name)
        return AuthResponse(
            accessToken=create_access_token(subject, settings),
            refreshToken=create_refresh_token(subject, settings),
            user=as_user_response(user),
            expiresIn=settings.jwt_access_token_expire_minutes * 60,
        )

    async def resolve_user(request: Request, *, allow_fallback: bool = False) -> RuntimeUser:
        authorization = request.headers.get("Authorization")
        state_runtime = get_runtime(request)

        if not authorization:
            if allow_fallback:
                if state_runtime.connected:
                    fallback_user = await state_runtime.get_user(state_runtime.preview_owner_user_id)
                    if fallback_user is not None:
                        return fallback_user
                return state_runtime.get_preview_user()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"message": "Authentication is required.", "code": "TOKEN_EXPIRED"},
            )

        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"message": "Invalid authorization header.", "code": "TOKEN_EXPIRED"},
            )

        try:
            payload = decode_token(token, settings=settings, expected_type="access")
        except AuthError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"message": str(exc), "code": "TOKEN_EXPIRED"},
            ) from exc

        user = await state_runtime.get_user(payload["sub"])
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"message": "Session is no longer valid.", "code": "TOKEN_EXPIRED"},
            )
        return user

    async def require_document_role(
        request: Request,
        *,
        doc_id: str,
        user: RuntimeUser,
        allowed: set[str] | None = None,
        denied_message: str = "Your role cannot access this document.",
    ) -> str:
        role = await get_runtime(request).get_document_role(doc_id, user.id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            )
        if allowed is not None and role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": denied_message, "code": "INSUFFICIENT_PERMISSION"},
            )
        return role

    async def require_admin(request: Request, user: RuntimeUser) -> None:
        if not await get_runtime(request).is_admin_user(user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Only the organization admin can access this resource.", "code": "INSUFFICIENT_PERMISSION"},
            )

    async def ensure_ai_feature_enabled(request: Request, *, feature: str, role: str) -> None:
        enabled = await get_runtime(request).is_ai_feature_enabled_for_role(feature, role)  # type: ignore[arg-type]
        if not enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "This AI feature is disabled for your role.", "code": "INSUFFICIENT_PERMISSION"},
            )

    @app.get("/health", response_model=HealthResponse)
    async def health(request: Request) -> HealthResponse:
        state_settings: Settings = request.app.state.settings
        state_runtime = get_runtime(request)
        state_ai_service = get_ai_service(request)
        return HealthResponse(
            status="ok",
            service="collab-editor-backend",
            groq_configured=state_ai_service.configured,
            database_configured=state_runtime.connected and bool(state_settings.database_url),
            auth_required=state_settings.ai_require_auth,
            timestamp=datetime.now(timezone.utc),
        )

    @app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
    async def register(payload: RegisterRequest, request: Request) -> AuthResponse:
        try:
            user = await get_runtime(request).register_user(payload.email, payload.password, payload.name)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": str(exc), "code": "ACCOUNT_EXISTS"},
            ) from exc
        return as_auth_response(user)

    @app.post("/api/auth/login", response_model=AuthResponse)
    async def login(payload: AuthRequest, request: Request) -> AuthResponse:
        user = await get_runtime(request).authenticate_user(payload.email, payload.password)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"message": "Invalid email or password.", "code": "INVALID_CREDENTIALS"},
            )
        return as_auth_response(user)

    @app.post("/api/auth/refresh", response_model=AuthResponse)
    async def refresh(payload: RefreshRequest, request: Request) -> AuthResponse:
        try:
            token_payload = decode_token(payload.refreshToken, settings=settings, expected_type="refresh")
        except AuthError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"message": str(exc), "code": "TOKEN_EXPIRED"},
            ) from exc

        user = await get_runtime(request).get_user(token_payload["sub"])
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"message": "Session is no longer valid.", "code": "TOKEN_EXPIRED"},
            )
        return as_auth_response(user)

    @app.get("/api/users/me", response_model=UserResponse)
    async def me(request: Request) -> UserResponse:
        return as_user_response(await resolve_user(request))

    @app.get("/api/documents", response_model=list[DocumentListItem])
    async def list_documents(request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        items = await get_runtime(request).list_documents_for_user(user.id)
        return [DocumentListItem.model_validate(item) for item in items]

    @app.post("/api/documents", response_model=DocumentCreateResponse, status_code=status.HTTP_201_CREATED)
    async def create_document(payload: CreateDocumentRequest, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        created = await get_runtime(request).create_document(user.id, payload.title.strip())
        return DocumentCreateResponse.model_validate(created)

    @app.get("/api/documents/{doc_id}", response_model=DocumentDetailResponse)
    async def get_document_by_id(doc_id: str, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            detail = await get_runtime(request).get_document_detail(doc_id, user.id)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Your role cannot access this document.", "code": "INSUFFICIENT_PERMISSION"},
            ) from exc
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc
        return DocumentDetailResponse.model_validate(detail)

    @app.patch("/api/documents/{doc_id}", response_model=DocumentMutationResponse)
    async def patch_document(doc_id: str, payload: PatchDocumentRequest, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            updated = await get_runtime(request).update_document_title(doc_id, payload.title.strip(), user.id)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Your role cannot rename this document.", "code": "INSUFFICIENT_PERMISSION"},
            ) from exc
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc
        return updated

    @app.delete("/api/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_document(doc_id: str, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            await get_runtime(request).soft_delete_document(doc_id, user.id)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Only the owner can delete this document.", "code": "INSUFFICIENT_PERMISSION"},
            ) from exc
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/documents/{doc_id}/restore", response_model=DocumentMutationResponse)
    async def restore_document(doc_id: str, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            restored = await get_runtime(request).restore_document(doc_id, user.id)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Only the owner can restore this document.", "code": "INSUFFICIENT_PERMISSION"},
            ) from exc
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": str(exc), "code": "INVALID_REQUEST"},
            ) from exc
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc
        return DocumentMutationResponse.model_validate(restored)

    @app.post("/api/realtime/session", response_model=RealtimeSessionResponse)
    async def create_realtime_session(payload: RealtimeSessionRequest, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        role = await require_document_role(request, doc_id=payload.doc_id, user=user)
        doc_token = create_doc_access_token(
            user_id=user.id,
            doc_id=payload.doc_id,
            role=role,
            settings=settings,
        )
        ws_url = f"{settings.collab_ws_url.rstrip('/')}/doc/{payload.doc_id}"
        ws_url = f"{ws_url}?token={doc_token}"
        expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=settings.realtime_token_ttl_seconds
        )
        palette = ["#0f766e", "#1d4ed8", "#7c3aed", "#be123c", "#a16207", "#4338ca"]
        color = palette[sum(ord(char) for char in user.id) % len(palette)]
        return RealtimeSessionResponse(
            doc_id=payload.doc_id,
            ws_url=ws_url,
            role=role,
            expires_at=expires_at.isoformat(),
            awareness_user=RealtimeAwarenessUser(id=user.id, name=user.name, color=color),
        )

    @app.post("/api/documents/{doc_id}/snapshot", response_model=RevertResponse)
    async def snapshot_document(doc_id: str, payload: CreateSnapshotRequest, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        await require_document_role(
            request,
            doc_id=doc_id,
            user=user,
            allowed={"owner", "editor"},
            denied_message="Your role cannot snapshot this document.",
        )
        try:
            version = await get_store(request).create_snapshot(doc_id, user.id, payload.snapshot)
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc
        return RevertResponse(version_id=version.version_id, created_at=version.created_at)

    @app.get("/api/documents/{doc_id}/versions", response_model=list[DocumentVersionItem])
    async def list_document_versions(doc_id: str, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        await require_document_role(request, doc_id=doc_id, user=user)
        try:
            return await get_store(request).list_versions(doc_id)
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc

    @app.post("/api/documents/{doc_id}/revert/{version_id}", response_model=RevertResponse)
    async def revert_document(doc_id: str, version_id: int, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        await require_document_role(
            request,
            doc_id=doc_id,
            user=user,
            allowed={"owner", "editor"},
            denied_message="Your role cannot revert this document.",
        )
        try:
            version = await get_store(request).revert_document(doc_id, version_id, user.id)
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document or version not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc
        return RevertResponse(version_id=version.version_id, created_at=version.created_at)

    @app.get("/api/documents/{doc_id}/export")
    async def export_document(doc_id: str, request: Request, format: str = Query(pattern="^(pdf|docx|md)$")):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        await require_document_role(request, doc_id=doc_id, user=user)
        try:
            exported = await get_store(request).export_document(doc_id, format)  # type: ignore[arg-type]
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc
        headers = {"Content-Disposition": f'attachment; filename="{exported.filename}"'}
        return Response(content=exported.content, media_type=exported.media_type, headers=headers)

    @app.get("/api/documents/{doc_id}/permissions", response_model=list[PermissionListItem])
    async def list_document_permissions(doc_id: str, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            permissions = await get_runtime(request).list_permissions(doc_id, user.id)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Your role cannot view document permissions.", "code": "INSUFFICIENT_PERMISSION"},
            ) from exc
        return [PermissionListItem.model_validate(item) for item in permissions]

    @app.post("/api/documents/{doc_id}/permissions", response_model=PermissionMutationResponse, status_code=status.HTTP_201_CREATED)
    async def create_document_permission(doc_id: str, payload: PermissionCreateRequest, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            created = await get_runtime(request).add_permission(doc_id, user.id, payload.user_email, payload.role)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Only the owner can share this document.", "code": "INSUFFICIENT_PERMISSION"},
            ) from exc
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": str(exc), "code": "INVALID_REQUEST"},
            ) from exc
        return PermissionMutationResponse.model_validate(created)

    @app.patch("/api/documents/{doc_id}/permissions/{permission_id}", response_model=PermissionMutationResponse)
    async def patch_document_permission(doc_id: str, permission_id: str, payload: PermissionUpdateRequest, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            updated = await get_runtime(request).update_permission(doc_id, permission_id, user.id, payload.role)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Only the owner can manage sharing.", "code": "INSUFFICIENT_PERMISSION"},
            ) from exc
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Permission not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc
        return PermissionMutationResponse.model_validate(updated)

    @app.delete("/api/documents/{doc_id}/permissions/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_document_permission(doc_id: str, permission_id: str, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            await get_runtime(request).delete_permission(doc_id, permission_id, user.id)
        except PermissionError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Only the owner can manage sharing.", "code": "INSUFFICIENT_PERMISSION"},
            ) from exc
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": str(exc), "code": "INVALID_REQUEST"},
            ) from exc
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Permission not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/documents/{doc_id}/share-link", response_model=ShareLinkCreateResponse, status_code=status.HTTP_201_CREATED)
    async def create_share_link(doc_id: str, payload: ShareLinkCreateRequest, request: Request):
        """Mint a stateless share-link token for this document. Only owners can create links.
        Recipients call POST /api/share/accept to join with the embedded role."""
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        await require_document_role(request, doc_id=doc_id, user=user, allowed={"owner"})
        ttl_hours = 72
        token = create_share_link_token(
            doc_id=doc_id, role=payload.role, settings=settings, ttl_hours=ttl_hours
        )
        return ShareLinkCreateResponse(token=token, role=payload.role, expires_in_hours=ttl_hours)

    @app.post("/api/share/accept", response_model=ShareLinkAcceptResponse)
    async def accept_share_link(payload: ShareLinkAcceptRequest, request: Request):
        """Accept a share-link token. Grants the authenticated user the role encoded in the
        token. Idempotent — owners are never downgraded."""
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            claims = decode_share_link_token(payload.token, settings=settings)
        except AuthError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": str(exc), "code": "INVALID_REQUEST"},
            ) from exc
        doc_id = claims["doc_id"]
        link_role = claims["role"]

        # Defence-in-depth: token payload is trusted (signed with JWT_SECRET) but
        # we never let a claim escalate beyond what share-link creation allows.
        if link_role not in {"editor", "commenter", "viewer"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Invalid role in share link.", "code": "INVALID_REQUEST"},
            )

        existing_role = await get_runtime(request).get_document_role(doc_id, user.id)
        # Never downgrade an existing privileged role via a share link
        role_rank = {"owner": 4, "editor": 3, "commenter": 2, "viewer": 1}
        if existing_role is None or role_rank.get(link_role, 0) > role_rank.get(existing_role, 0):
            try:
                await get_runtime(request).create_or_update_permission(doc_id, user.id, link_role)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"message": "Could not grant access.", "code": "INVALID_REQUEST"},
                ) from exc
            effective_role = link_role
        else:
            effective_role = existing_role

        try:
            doc = await get_runtime(request).get_document_detail(doc_id, user.id)
        except KeyError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            )
        return ShareLinkAcceptResponse(doc_id=doc_id, role=effective_role, doc_title=doc.get("title", "Untitled"))

    @app.get("/api/ai/history", response_model=list[AIHistoryItem])
    async def ai_history(
        request: Request,
        limit: int = 10,
        feature: str | None = None,
        doc_id: str | None = None,
        history_status: str | None = Query(default=None, alias="status"),
    ):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        active_doc_id = doc_id or get_runtime(request).preview_doc_id
        await require_document_role(
            request,
            doc_id=active_doc_id,
            user=user,
            allowed={"owner", "editor"},
            denied_message="Your role cannot use AI features.",
        )
        history = await get_runtime(request).list_history(
            user_id=user.id,
            doc_id=active_doc_id,
            limit=limit,
            feature=feature,
            status=history_status,
        )
        return [AIHistoryItem.model_validate(item) for item in history]

    @app.delete("/api/ai/history/{interaction_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_ai_history_item(interaction_id: str, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        deleted = await get_runtime(request).delete_history_item(interaction_id, user_id=user.id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "AI history item not found.", "code": "DOCUMENT_NOT_FOUND"},
            )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/admin/ai-settings", response_model=AISettingsResponse)
    async def get_admin_ai_settings(request: Request):
        user = await resolve_user(request)
        await require_admin(request, user)
        settings_payload = await get_runtime(request).get_ai_settings()
        return AISettingsResponse.model_validate(settings_payload)

    @app.patch("/api/admin/ai-settings", response_model=AISettingsResponse)
    async def patch_admin_ai_settings(payload: AISettingsPatchRequest, request: Request):
        user = await resolve_user(request)
        await require_admin(request, user)
        updated = await get_runtime(request).update_ai_settings(
            acting_user_id=user.id,
            feature_access=payload.feature_access,
            daily_token_limit=payload.daily_token_limit,
            monthly_token_budget=payload.monthly_org_token_budget,
            consent_required=payload.consent_required,
        )
        return AISettingsResponse.model_validate(updated)

    @app.put("/api/documents/{doc_id}", response_model=DocumentContentResponse)
    async def update_document_by_id(doc_id: str, payload: UpdateDocumentPayload, request: Request) -> DocumentContentResponse:
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        await require_document_role(
            request,
            doc_id=doc_id,
            user=user,
            allowed={"owner", "editor"},
            denied_message="Your role cannot edit this document.",
        )
        try:
            return await get_store(request).update_document(doc_id, payload.content, payload.versionId, user.id)
        except VersionConflictError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": str(exc), "code": "VERSION_CONFLICT"},
            ) from exc
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc

    async def stream_feature(feature: str, payload: dict[str, Any], request: Request) -> EventSourceResponse:
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        doc_id = str(payload.get("doc_id") or get_runtime(request).preview_doc_id)
        role = await require_document_role(
            request,
            doc_id=doc_id,
            user=user,
            allowed={"owner", "editor"},
            denied_message="Your role cannot use AI features.",
        )
        await ensure_ai_feature_enabled(request, feature=feature, role=role)

        state_ai_service = get_ai_service(request)
        state_runtime = get_runtime(request)
        selected_text = _extract_selection_text(payload)
        kwargs: dict[str, Any] = {}

        if feature == "rewrite":
            kwargs["style"] = payload.get("style")
        elif feature == "translate":
            kwargs["target_lang"] = payload.get("target_lang")
        elif feature == "restructure":
            kwargs["instructions"] = payload.get("instructions")
        elif feature == "continue":
            kwargs["instructions"] = payload.get("instructions") or payload.get("notes")

        interaction_id = None
        accumulated_text = ""
        estimated_input_tokens = estimate_tokens(selected_text)

        try:
            await state_runtime.enforce_quota(user.id, estimated_input_tokens)
            interaction_id = await state_runtime.begin_interaction(
                user_id=user.id,
                doc_id=doc_id,
                feature=feature,  # type: ignore[arg-type]
                input_text=selected_text,
            )
            handle, iterator = await state_ai_service.stream_feature(feature, selected_text, **kwargs)
            if interaction_id:
                handle.suggestion_id = interaction_id
        except GroqClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"message": str(exc), "code": "AI_SERVICE_UNAVAILABLE"},
            ) from exc
        except AIQuotaExceededError as exc:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"message": str(exc), "code": "AI_QUOTA_EXCEEDED"},
            ) from exc

        async def event_generator():
            nonlocal accumulated_text
            try:
                async for token in iterator:
                    if await request.is_disconnected():
                        await state_ai_service.cancel(handle.suggestion_id)
                        if interaction_id is not None:
                            await state_runtime.record_feedback(interaction_id, "cancelled", user_id=user.id)
                        return

                    accumulated_text += token
                    event = SuggestionEvent(
                        token=token,
                        done=False,
                        suggestion_id=handle.suggestion_id,
                        feature=feature,
                    )
                    yield {"event": "token", "data": event.model_dump_json()}

                await state_runtime.complete_interaction(
                    interaction_id,
                    accumulated_text,
                    estimate_tokens(selected_text, accumulated_text),
                    user_id=user.id,
                )
                done_event = SuggestionEvent(
                    token="",
                    done=True,
                    suggestion_id=handle.suggestion_id,
                    feature=feature,
                )
                yield {"event": "done", "data": done_event.model_dump_json()}
            except GroqClientError as exc:
                if interaction_id is not None:
                    await state_runtime.record_feedback(interaction_id, "cancelled", user_id=user.id)
                yield {
                    "event": "error",
                    "data": json.dumps(
                        {"message": str(exc), "code": "AI_SERVICE_UNAVAILABLE", "suggestion_id": handle.suggestion_id}
                    ),
                }

        return EventSourceResponse(event_generator())

    @app.post("/api/ai/rewrite")
    async def rewrite(request: Request):
        body = await request.json()

        StreamingRewriteRequest.model_validate(body)
        return await stream_feature("rewrite", body, request)

    @app.post("/api/ai/summarize")
    async def summarize(request_body: SummarizeRequest, request: Request):
        return await stream_feature("summarize", request_body.model_dump(), request)

    @app.post("/api/ai/translate")
    async def translate(request_body: TranslateRequest, request: Request):
        return await stream_feature("translate", request_body.model_dump(), request)

    @app.post("/api/ai/restructure")
    async def restructure(request_body: RestructureRequest, request: Request):
        return await stream_feature("restructure", request_body.model_dump(), request)

    @app.post("/api/ai/continue")
    async def continue_writing(request_body: ContinueRequest, request: Request):
        payload = {
            "doc_id": request_body.doc_id,
            "selection": request_body.selection.model_dump(),
            "notes": request_body.notes,
        }
        return await stream_feature("continue", payload, request)

    @app.post("/api/ai/cancel/{suggestion_id}")
    async def cancel_suggestion(suggestion_id: str, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        cancelled = await get_ai_service(request).cancel(suggestion_id)
        await get_runtime(request).record_feedback(suggestion_id, "cancelled", user_id=user.id)
        if not cancelled:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Suggestion not found.", "code": "DOCUMENT_NOT_FOUND"},
            )
        return {"ok": True, "suggestion_id": suggestion_id}

    @app.post("/api/ai/feedback")
    async def feedback(payload: FeedbackRequest, request: Request):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        updated = await get_runtime(request).record_feedback(payload.suggestion_id, payload.action, user_id=user.id)
        return {"ok": True, "received": payload.model_dump(), "persisted": updated}

    return app


app = create_app()
