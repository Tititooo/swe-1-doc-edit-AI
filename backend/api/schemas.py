from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class DocumentResponse(BaseModel):
    id: str
    content: str
    versionId: int
    lastModified: str
    title: str | None = None


class UpdateDocumentPayload(BaseModel):
    content: str = Field(min_length=1)
    versionId: int = Field(ge=1)


class VersionResponse(BaseModel):
    versionId: int


CompatibilityFeature = Literal["rewrite", "summarize", "translate", "restructure", "continue"]


class CompatibilityRewriteRequest(BaseModel):
    selectedText: str = ""
    versionId: int = Field(ge=1)
    feature: CompatibilityFeature = "rewrite"
    style: str | None = None
    notes: str | None = None
    targetLanguage: str | None = None
    documentText: str | None = None


class CompatibilityRewriteResponse(BaseModel):
    success: bool
    result: str | None = None
    error: str | None = None
    message: str | None = None
    feature: CompatibilityFeature | None = None
    suggestionId: str | None = None


class SelectionPayload(BaseModel):
    start: int | None = None
    end: int | None = None
    text: str | None = None


class StreamingRewriteRequest(BaseModel):
    doc_id: str
    selection: SelectionPayload
    context: str | None = None
    style: str | None = None


class SummarizeRequest(BaseModel):
    doc_id: str
    selection: SelectionPayload
    context: str | None = None


class TranslateRequest(BaseModel):
    doc_id: str
    selection: SelectionPayload
    context: str | None = None
    target_lang: str = Field(min_length=2)


class RestructureRequest(BaseModel):
    doc_id: str
    selection: SelectionPayload
    context: str | None = None
    instructions: str = Field(min_length=1)


class SuggestionEvent(BaseModel):
    token: str = ""
    done: bool = False
    suggestion_id: str
    feature: str
    metadata: dict[str, Any] | None = None


class HealthResponse(BaseModel):
    status: str
    service: str
    groq_configured: bool
    database_configured: bool
    timestamp: datetime


class FeedbackRequest(BaseModel):
    suggestion_id: str
    action: Literal["accepted", "rejected", "partial", "cancelled"]


class ContinueRequest(BaseModel):
    doc_id: str
    selection: SelectionPayload
    notes: str | None = None


class AIHistoryItem(BaseModel):
    id: str
    feature: str
    input_text: str
    suggestion_text: str | None = None
    status: str
    tokens_used: int
    created_at: str
