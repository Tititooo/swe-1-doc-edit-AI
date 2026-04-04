from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import jwt
from starlette.exceptions import HTTPException as StarletteHTTPException
from sse_starlette.sse import EventSourceResponse

from ai.groq_client import GroqChatClient, GroqClientError
from ai.quota import AIQuotaExceededError, estimate_tokens
from ai.service import AIService

from .config import Settings
from .runtime import AppRuntime
from .schemas import (
    CompatibilityRewriteRequest,
    CompatibilityRewriteResponse,
    ContinueRequest,
    DocumentResponse,
    FeedbackRequest,
    AIHistoryItem,
    HealthResponse,
    RestructureRequest,
    StreamingRewriteRequest,
    SuggestionEvent,
    SummarizeRequest,
    TranslateRequest,
    UpdateDocumentPayload,
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


def _resolve_ai_role(request: Request, settings: Settings) -> str:
    authorization = request.headers.get("Authorization")
    if not authorization:
        if settings.ai_require_auth:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"message": "Authentication is required for AI actions.", "code": "TOKEN_EXPIRED"},
            )
        return "owner"

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "Invalid authorization header.", "code": "TOKEN_EXPIRED"},
        )

    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "Invalid or expired token.", "code": "TOKEN_EXPIRED"},
        ) from exc

    role = str(payload.get("role", "editor"))
    if role not in {"owner", "editor"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "Your role cannot use AI features.", "code": "INSUFFICIENT_PERMISSION"},
        )
    return role


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

    app = FastAPI(title="Collab Editor API", version="0.1.0", lifespan=lifespan)
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
            timestamp=datetime.now(timezone.utc),
        )

    @app.get("/api/ai/history", response_model=list[AIHistoryItem])
    async def ai_history(request: Request, limit: int = 10):
        _resolve_ai_role(request, settings)
        history = await get_runtime(request).list_history(limit=limit)
        return [AIHistoryItem.model_validate(item) for item in history]

    @app.get("/api/document", response_model=DocumentResponse)
    async def get_document(request: Request) -> DocumentResponse:
        return await get_store(request).get_document()

    @app.put("/api/document", response_model=DocumentResponse)
    async def put_document(payload: UpdateDocumentPayload, request: Request) -> DocumentResponse:
        try:
            return await get_store(request).update_document(payload.content, payload.versionId)
        except VersionConflictError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": str(exc), "code": "VERSION_CONFLICT"},
            ) from exc

    @app.get("/api/document/version", response_model=VersionResponse)
    async def get_document_version(request: Request) -> VersionResponse:
        return VersionResponse(versionId=await get_store(request).get_version())

    @app.put("/api/documents/{doc_id}", response_model=DocumentResponse)
    async def update_document_by_id(doc_id: str, payload: UpdateDocumentPayload, request: Request) -> DocumentResponse:
        current = await get_store(request).get_document_by_id(doc_id)
        if current.versionId != payload.versionId:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "Version conflict.", "code": "VERSION_CONFLICT"},
            )
        return await get_store(request).update_document(payload.content, payload.versionId)

    @app.get("/api/documents/{doc_id}", response_model=DocumentResponse)
    async def get_document_by_id(doc_id: str, request: Request) -> DocumentResponse:
        try:
            return await get_store(request).get_document_by_id(doc_id)
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Document not found.", "code": "DOCUMENT_NOT_FOUND"},
            ) from exc

    async def stream_feature(feature: str, payload: dict[str, Any], request: Request) -> EventSourceResponse:
        state_ai_service = get_ai_service(request)
        selected_text = _extract_selection_text(payload)
        kwargs: dict[str, Any] = {}
        if feature == "rewrite":
            kwargs["style"] = payload.get("style")
        elif feature == "translate":
            kwargs["target_lang"] = payload.get("target_lang")
        elif feature == "restructure":
            kwargs["instructions"] = payload.get("instructions")

        interaction_id = None
        accumulated_text = ""
        state_runtime = get_runtime(request)
        estimated_input_tokens = estimate_tokens(selected_text)
        try:
            _resolve_ai_role(request, settings)
            await state_runtime.enforce_quota(estimated_input_tokens)
            interaction_id = await state_runtime.begin_interaction(feature, selected_text)
            handle, iterator = await state_ai_service.stream_feature(feature, selected_text, **kwargs)
            if interaction_id is not None:
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
            try:
                async for token in iterator:
                    accumulated_text_nonlocal = token
                    nonlocal accumulated_text
                    accumulated_text += accumulated_text_nonlocal
                    event = SuggestionEvent(
                        token=token,
                        done=False,
                        suggestion_id=handle.suggestion_id,
                        feature=feature,
                    )
                    yield {"event": "token", "data": event.model_dump_json()}
                done_event = SuggestionEvent(
                    token="",
                    done=True,
                    suggestion_id=handle.suggestion_id,
                    feature=feature,
                )
                await state_runtime.complete_interaction(
                    interaction_id,
                    accumulated_text,
                    estimate_tokens(selected_text, accumulated_text),
                )
                yield {"event": "done", "data": done_event.model_dump_json()}
            except GroqClientError as exc:
                if interaction_id is not None:
                    await state_runtime.record_feedback(interaction_id, "cancelled")
                error_event = {
                    "event": "error",
                    "data": json.dumps(
                        {"message": str(exc), "code": "AI_SERVICE_UNAVAILABLE", "suggestion_id": handle.suggestion_id}
                    ),
                }
                yield error_event

        return EventSourceResponse(event_generator())

    @app.post("/api/ai/rewrite")
    async def rewrite(request: Request):
        state_ai_service = get_ai_service(request)
        body = await request.json()

        if "selectedText" in body:
            payload = CompatibilityRewriteRequest.model_validate(body)
            try:
                _resolve_ai_role(request, settings)
                selected_text = _extract_compat_text(payload)
                state_runtime = get_runtime(request)
                await state_runtime.enforce_quota(estimate_tokens(selected_text))
                interaction_id = await state_runtime.begin_interaction(payload.feature, selected_text)
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
                )
                response = CompatibilityRewriteResponse(
                    success=True,
                    result=result,
                    feature=payload.feature,
                    suggestionId=interaction_id,
                )
                return JSONResponse(response.model_dump())
            except GroqClientError as exc:
                response = CompatibilityRewriteResponse(
                    success=False,
                    error=str(exc),
                    message=str(exc),
                    feature=payload.feature,
                )
                return JSONResponse(response.model_dump(), status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
            except AIQuotaExceededError as exc:
                response = CompatibilityRewriteResponse(
                    success=False,
                    error=str(exc),
                    message=str(exc),
                    feature=payload.feature,
                )
                return JSONResponse(response.model_dump(), status_code=status.HTTP_429_TOO_MANY_REQUESTS)

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
            "instructions": request_body.notes,
        }
        return await stream_feature("continue", payload, request)

    @app.post("/api/ai/cancel/{suggestion_id}")
    async def cancel_suggestion(suggestion_id: str, request: Request):
        cancelled = await get_ai_service(request).cancel(suggestion_id)
        await get_runtime(request).record_feedback(suggestion_id, "cancelled")
        if not cancelled:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Suggestion not found.", "code": "DOCUMENT_NOT_FOUND"},
            )
        return {"ok": True, "suggestion_id": suggestion_id}

    @app.post("/api/ai/feedback")
    async def feedback(payload: FeedbackRequest, request: Request):
        updated = await get_runtime(request).record_feedback(payload.suggestion_id, payload.action)
        if not updated:
            return {"ok": True, "received": payload.model_dump(), "persisted": False}
        return {"ok": True, "received": payload.model_dump(), "persisted": True}

    return app


app = create_app()
