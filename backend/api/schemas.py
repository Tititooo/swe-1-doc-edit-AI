from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


RoleName = Literal["owner", "editor", "commenter", "viewer"]
OrgRoleName = Literal["admin", "member"]
FeatureName = Literal["rewrite", "summarize", "translate", "restructure", "continue"]


class DocumentContentResponse(BaseModel):
    id: str
    content: str
    versionId: int
    lastModified: str
    title: str


class UpdateDocumentPayload(BaseModel):
    content: str = Field(min_length=0)
    versionId: int = Field(ge=1)


class CreateDocumentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=140)


class PatchDocumentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=140)


class DocumentListItem(BaseModel):
    id: str
    title: str
    role: RoleName
    updated_at: str


class DocumentOwner(BaseModel):
    id: str
    email: str
    name: str


class PermissionListItem(BaseModel):
    permission_id: str
    user_id: str
    email: str
    name: str
    role: RoleName


class DocumentDetailResponse(BaseModel):
    id: str
    title: str
    content: str
    owner: DocumentOwner
    permissions: list[PermissionListItem]
    updated_at: str
    version_id: int


class DocumentCreateResponse(BaseModel):
    id: str
    title: str
    owner_id: str
    created_at: str


class DocumentMutationResponse(BaseModel):
    id: str
    title: str
    updated_at: str
    restored: bool = False


class DocumentVersionItem(BaseModel):
    version_id: int
    created_at: str
    created_by: str


class RevertResponse(BaseModel):
    version_id: int
    created_at: str


class CreateSnapshotRequest(BaseModel):
    snapshot: str | None = None


class PermissionCreateRequest(BaseModel):
    user_email: str = Field(min_length=3)
    role: RoleName


class PermissionUpdateRequest(BaseModel):
    role: RoleName


class PermissionMutationResponse(BaseModel):
    permission_id: str
    user_id: str
    role: RoleName


class DocumentExportResult(BaseModel):
    filename: str
    media_type: str
    content: bytes


class RealtimeSessionRequest(BaseModel):
    doc_id: str = Field(min_length=1)


class RealtimeAwarenessUser(BaseModel):
    id: str
    name: str
    color: str


class RealtimeSessionResponse(BaseModel):
    doc_id: str
    ws_url: str
    role: RoleName
    expires_at: str
    token_query_param: Literal["token"] = "token"
    awareness_user: RealtimeAwarenessUser


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


class ContinueRequest(BaseModel):
    doc_id: str
    selection: SelectionPayload
    notes: str | None = None


class SuggestionEvent(BaseModel):
    token: str = ""
    done: bool = False
    suggestion_id: str
    feature: str
    metadata: dict[str, Any] | None = None


class FeedbackRequest(BaseModel):
    suggestion_id: str
    action: Literal["accepted", "rejected", "partial", "cancelled"]


class AIHistoryItem(BaseModel):
    id: str
    feature: str
    input_text: str
    suggestion_text: str | None = None
    status: str
    tokens_used: int
    created_at: str


class HistoryDeletionResponse(BaseModel):
    id: str
    deleted: bool


class AISettingsResponse(BaseModel):
    feature_access: dict[RoleName, list[FeatureName]]
    daily_token_limit: int = Field(ge=1)
    monthly_org_token_budget: int = Field(ge=1)
    consent_required: bool
    updated_at: str
    updated_by: str | None = None


class AISettingsUpdateRequest(BaseModel):
    feature_access: dict[RoleName, list[FeatureName]] | None = None
    daily_token_limit: int | None = Field(default=None, ge=1)
    monthly_org_token_budget: int | None = Field(default=None, ge=1)
    consent_required: bool | None = None


AISettingsPatchRequest = AISettingsUpdateRequest


class HealthResponse(BaseModel):
    status: str
    service: str
    groq_configured: bool
    database_configured: bool
    auth_required: bool
    timestamp: datetime


class AuthRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=8)


class RegisterRequest(AuthRequest):
    name: str | None = Field(default=None, min_length=2)


class RefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=1)


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: RoleName
    org_role: OrgRoleName = "member"


class AuthResponse(BaseModel):
    accessToken: str
    refreshToken: str
    user: UserResponse
    tokenType: Literal["bearer"] = "bearer"
    expiresIn: int
