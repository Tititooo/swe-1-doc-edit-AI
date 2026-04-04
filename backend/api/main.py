from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sse_starlette.sse import EventSourceResponse

from ai.groq_client import GroqChatClient, GroqClientError
from ai.quota import AIQuotaExceededError, estimate_tokens
from ai.service import AIService

from .auth import AuthError, AuthSubject, create_access_token, create_refresh_token, decode_token
from .config import Settings
from .runtime import AppRuntime, RuntimeUser
from .schemas import (
    AIHistoryItem,
    AuthRequest,
    AuthResponse,
    CompatibilityRewriteRequest,
    CompatibilityRewriteResponse,
    ContinueRequest,
    DocumentResponse,
    FeedbackRequest,
    HealthResponse,
    RefreshRequest,
    RegisterRequest,
    RestructureRequest,
    StreamingRewriteRequest,
    SuggestionEvent,
    SummarizeRequest,
    TranslateRequest,
    UpdateDocumentPayload,
    UserResponse,
    VersionResponse,
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


def _extract_compat_text(payload: CompatibilityRewriteRequest) -> str:
    if payload.feature == "continue":
        if payload.documentText and payload.documentText.strip():
            return payload.documentText.strip()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "documentText is required for continue mode", "code": "INVALID_REQUEST"},
        )

    if payload.selectedText.strip():
        return payload.selectedText.strip()

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"message": "selectedText is required for this AI action", "code": "INVALID_REQUEST"},
    )


def create_app() -> FastAPI:
    settings = Settings.from_env()
    store = InMemoryDocumentStore()
    ai_service = AIService(GroqChatClient(settings))
    runtime = AppRuntime(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await runtime.startup(store)
        yield
        await runtime.shutdown()

    app = FastAPI(title="Collab Editor API", version="0.3.0", lifespan=lifespan)
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
                    fallback_user = await state_runtime.get_user(state_runtime.document.owner_user_id)
                    if fallback_user is None:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail={"message": "Authentication is required.", "code": "TOKEN_EXPIRED"},
                        )
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

    def require_roles(user: RuntimeUser, allowed: set[str], message: str) -> None:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": message, "code": "INSUFFICIENT_PERMISSION"},
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

    @app.get("/api/ai/history", response_model=list[AIHistoryItem])
    async def ai_history(
        request: Request,
        limit: int = 10,
        feature: str | None = None,
        history_status: str | None = Query(default=None, alias="status"),
    ):
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        require_roles(user, {"owner", "editor"}, "Your role cannot use AI features.")
        state_runtime = get_runtime(request)
        history = await state_runtime.list_history(
            user_id=user.id,
            doc_id=state_runtime.preview_doc_id,
            limit=limit,
            feature=feature,
            status=history_status,
        )
        return [AIHistoryItem.model_validate(item) for item in history]

    @app.get("/api/document", response_model=DocumentResponse)
    async def get_document(request: Request) -> DocumentResponse:
        await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        return await get_store(request).get_document()

    @app.put("/api/document", response_model=DocumentResponse)
    async def put_document(payload: UpdateDocumentPayload, request: Request) -> DocumentResponse:
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        require_roles(user, {"owner", "editor"}, "Your role cannot edit this document.")
        try:
            return await get_store(request).update_document(payload.content, payload.versionId)
        except VersionConflictError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": str(exc), "code": "VERSION_CONFLICT"},
            ) from exc

    @app.get("/api/document/version", response_model=VersionResponse)
    async def get_document_version(request: Request) -> VersionResponse:
        await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        return VersionResponse(versionId=await get_store(request).get_version())

    @app.put("/api/documents/{doc_id}", response_model=DocumentResponse)
    async def update_document_by_id(doc_id: str, payload: UpdateDocumentPayload, request: Request) -> DocumentResponse:
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        require_roles(user, {"owner", "editor"}, "Your role cannot edit this document.")
        current = await get_store(request).get_document_by_id(doc_id)
        if current.versionId != payload.versionId:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "Version conflict.", "code": "VERSION_CONFLICT"},
            )
        return await get_store(request).update_document(payload.content, payload.versionId)

    @app.get("/api/documents/{doc_id}", response_model=DocumentResponse)
    async def get_document_by_id(doc_id: str, request: Request) -> DocumentResponse:
        await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        try:
            return await get_store(request).get_document_by_id(doc_id)
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc

    async def stream_feature(feature: str, payload: dict[str, Any], request: Request) -> EventSourceResponse:
        user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
        require_roles(user, {"owner", "editor"}, "Your role cannot use AI features.")

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
        doc_id = str(payload.get("doc_id") or state_runtime.preview_doc_id)
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
        state_ai_service = get_ai_service(request)
        body = await request.json()

        if "selectedText" in body:
            payload = CompatibilityRewriteRequest.model_validate(body)
            user = await resolve_user(request, allow_fallback=not settings.ai_require_auth)
            require_roles(user, {"owner", "editor"}, "Your role cannot use AI features.")
            selected_text = _extract_compat_text(payload)
            state_runtime = get_runtime(request)
            try:
                await state_runtime.enforce_quota(user.id, estimate_tokens(selected_text))
                interaction_id = await state_runtime.begin_interaction(
                    user_id=user.id,
                    doc_id=state_runtime.preview_doc_id,
                    feature=payload.feature,
                    input_text=selected_text,
                )
                result = await state_ai_service.complete_feature(
                    payload.feature,
                    selected_text,
                    style=payload.style,
                    notes=payload.notes,
                    target_lang=payload.targetLanguage,
                    instructions=payload.notes,
                    document_text=payload.documentText,
                )
                await state_runtime.complete_interaction(
                    interaction_id,
                    result,
                    estimate_tokens(selected_text, result),
                    user_id=user.id,
                )
                return JSONResponse(
                    CompatibilityRewriteResponse(
                        success=True,
                        result=result,
                        feature=payload.feature,
                        suggestionId=interaction_id,
                    ).model_dump()
                )
            except GroqClientError as exc:
                return JSONResponse(
                    CompatibilityRewriteResponse(
                        success=False,
                        error=str(exc),
                        message=str(exc),
                        feature=payload.feature,
                    ).model_dump(),
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            except AIQuotaExceededError as exc:
                return JSONResponse(
                    CompatibilityRewriteResponse(
                        success=False,
                        error=str(exc),
                        message=str(exc),
                        feature=payload.feature,
                    ).model_dump(),
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                )

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
        require_roles(user, {"owner", "editor"}, "Your role cannot use AI features.")
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
        require_roles(user, {"owner", "editor"}, "Your role cannot use AI features.")
        updated = await get_runtime(request).record_feedback(payload.suggestion_id, payload.action, user_id=user.id)
        return {"ok": True, "received": payload.model_dump(), "persisted": updated}

    return app


app = create_app()
