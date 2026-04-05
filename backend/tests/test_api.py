from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.main import create_app
from ai.service import SuggestionHandle


class FakeAIService:
    configured = True

    async def complete_feature(
        self,
        feature: str,
        selected_text: str,
        *,
        style: str | None = None,
        notes: str | None = None,
        target_lang: str | None = None,
        instructions: str | None = None,
        document_text: str | None = None,
    ) -> str:
        return f"{feature}:{selected_text}"

    async def stream_feature(self, feature: str, selected_text: str, **kwargs):
        async def iterator():
            yield "hello"
            yield " world"

        return SuggestionHandle("suggestion-123", feature, asyncio.Event()), iterator()

    async def cancel(self, suggestion_id: str) -> bool:
        return suggestion_id == "suggestion-123"


def create_test_client(monkeypatch, *, auth_required: bool = False) -> TestClient:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("AI_REQUIRE_AUTH", "true" if auth_required else "false")
    monkeypatch.setenv("DEV_BOOTSTRAP_EMAIL", "atharv.dev@local")
    monkeypatch.setenv("DEV_BOOTSTRAP_PASSWORD", "atharv-preview-pass")
    monkeypatch.setenv("COLLAB_WS_URL", "ws://localhost:1234")
    app = create_app()
    app.state.ai_service = FakeAIService()
    client = TestClient(app)
    client.__enter__()
    return client


def auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def test_health_endpoint_reports_auth_requirement(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["auth_required"] is True


def test_document_routes_still_work_in_preview_mode(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=False)

    get_response = client.get("/api/document")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == "doc-001"

    update_response = client.put("/api/document", json={"content": "Updated content", "versionId": 1})
    assert update_response.status_code == 200
    assert update_response.json()["versionId"] == 2

    version_response = client.get("/api/document/version")
    assert version_response.status_code == 200
    assert version_response.json() == {"versionId": 2}


def test_register_login_refresh_and_me(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    register = client.post(
        "/api/auth/register",
        json={"email": "writer@example.com", "password": "PreviewPass123!", "name": "Writer"},
    )
    assert register.status_code == 201
    register_body = register.json()
    assert register_body["user"]["email"] == "writer@example.com"
    assert register_body["tokenType"] == "bearer"
    assert register_body["expiresIn"] == 15 * 60

    unauthenticated_doc = client.get("/api/document")
    assert unauthenticated_doc.status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"email": "writer@example.com", "password": "PreviewPass123!"},
    )
    assert login.status_code == 200
    access_token = login.json()["accessToken"]

    me = client.get("/api/users/me", headers=auth_headers(access_token))
    assert me.status_code == 200
    assert me.json()["role"] == "editor"

    refresh = client.post("/api/auth/refresh", json={"refreshToken": login.json()["refreshToken"]})
    assert refresh.status_code == 200
    assert refresh.json()["accessToken"]


def test_rewrite_feedback_and_filtered_history(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    auth = client.post(
        "/api/auth/register",
        json={"email": "history@example.com", "password": "PreviewPass123!", "name": "History"},
    ).json()
    headers = auth_headers(auth["accessToken"])

    compat = client.post("/api/ai/rewrite", json={"selectedText": "Hello", "versionId": 1}, headers=headers)
    assert compat.status_code == 200
    suggestion_id = compat.json()["suggestionId"]
    assert compat.json()["result"] == "rewrite:Hello"

    feedback = client.post(
        "/api/ai/feedback",
        json={"suggestion_id": suggestion_id, "action": "accepted"},
        headers=headers,
    )
    assert feedback.status_code == 200
    assert feedback.json()["persisted"] is True

    history = client.get("/api/ai/history?feature=rewrite&status=accepted", headers=headers)
    assert history.status_code == 200
    body = history.json()
    assert len(body) == 1
    assert body[0]["status"] == "accepted"
    assert body[0]["feature"] == "rewrite"

    deleted = client.delete(f"/api/ai/history/{suggestion_id}", headers=headers)
    assert deleted.status_code == 204

    history_after_delete = client.get("/api/ai/history", headers=headers)
    assert history_after_delete.status_code == 200
    assert history_after_delete.json() == []


def test_streaming_rewrite_and_cancel(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    auth = client.post(
        "/api/auth/register",
        json={"email": "stream@example.com", "password": "PreviewPass123!", "name": "Stream"},
    ).json()
    headers = auth_headers(auth["accessToken"])

    with client.stream(
        "POST",
        "/api/ai/rewrite",
        json={"doc_id": "doc-001", "selection": {"text": "Hello world"}, "style": "formal"},
        headers=headers,
    ) as response:
        assert response.status_code == 200
        body = "".join(line.decode() if isinstance(line, bytes) else line for line in response.iter_lines())

    assert "event: token" in body
    assert '"suggestion_id":"' in body
    assert "event: done" in body

    found = client.post("/api/ai/cancel/suggestion-123", headers=headers)
    assert found.status_code == 200
    assert found.json()["ok"] is True

    missing = client.post("/api/ai/cancel/does-not-exist", headers=headers)
    assert missing.status_code == 404


def test_viewer_cannot_use_ai(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    app = client.app
    register = client.post(
        "/api/auth/register",
        json={"email": "viewer@example.com", "password": "PreviewPass123!", "name": "Viewer"},
    )
    assert register.status_code == 201

    runtime = app.state.runtime
    preview_permissions = runtime._memory_permissions[runtime.preview_doc_id]
    permission = next(
        item for item in preview_permissions.values() if item.user_id == runtime._memory_users_by_email["viewer@example.com"].id
    )
    permission.role = "viewer"

    login = client.post(
        "/api/auth/login",
        json={"email": "viewer@example.com", "password": "PreviewPass123!"},
    )
    headers = auth_headers(login.json()["accessToken"])

    blocked = client.post("/api/ai/rewrite", json={"selectedText": "Hello", "versionId": 1}, headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "INSUFFICIENT_PERMISSION"


def test_realtime_session_and_restore_document(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    auth = client.post(
        "/api/auth/register",
        json={"email": "owner@example.com", "password": "PreviewPass123!", "name": "Owner"},
    ).json()
    headers = auth_headers(auth["accessToken"])

    created = client.post("/api/documents", json={"title": "Spec Draft"}, headers=headers)
    assert created.status_code == 201
    doc_id = created.json()["id"]

    realtime = client.post("/api/realtime/session", json={"doc_id": doc_id}, headers=headers)
    assert realtime.status_code == 200
    realtime_body = realtime.json()
    assert realtime_body["doc_id"] == doc_id
    assert realtime_body["role"] == "owner"
    assert realtime_body["ws_url"].endswith(f"/doc/{doc_id}?token={auth['accessToken']}")
    assert realtime_body["awareness_user"]["name"] == "Owner"

    deleted = client.delete(f"/api/documents/{doc_id}", headers=headers)
    assert deleted.status_code == 204

    missing = client.get(f"/api/documents/{doc_id}", headers=headers)
    assert missing.status_code == 404

    restored = client.post(f"/api/documents/{doc_id}/restore", headers=headers)
    assert restored.status_code == 200
    assert restored.json()["restored"] is True

    loaded = client.get(f"/api/documents/{doc_id}", headers=headers)
    assert loaded.status_code == 200
    assert loaded.json()["title"] == "Spec Draft"


def test_admin_ai_settings_and_history_delete(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    user_auth = client.post(
        "/api/auth/register",
        json={"email": "editor@example.com", "password": "PreviewPass123!", "name": "Editor"},
    ).json()
    user_headers = auth_headers(user_auth["accessToken"])

    compat = client.post("/api/ai/rewrite", json={"selectedText": "Hello", "versionId": 1}, headers=user_headers)
    assert compat.status_code == 200
    suggestion_id = compat.json()["suggestionId"]

    history = client.get("/api/ai/history", headers=user_headers)
    assert history.status_code == 200
    history_items = history.json()
    assert any(item["id"] == suggestion_id for item in history_items)

    deleted = client.delete(f"/api/ai/history/{suggestion_id}", headers=user_headers)
    assert deleted.status_code == 204

    history_after_delete = client.get("/api/ai/history", headers=user_headers)
    assert history_after_delete.status_code == 200
    assert all(item["id"] != suggestion_id for item in history_after_delete.json())

    admin_login = client.post(
        "/api/auth/login",
        json={"email": "atharv.dev@local", "password": "atharv-preview-pass"},
    )
    assert admin_login.status_code == 200
    admin_headers = auth_headers(admin_login.json()["accessToken"])

    settings_response = client.get("/api/admin/ai-settings", headers=admin_headers)
    assert settings_response.status_code == 200
    settings_body = settings_response.json()
    assert "editor" in settings_body["feature_access"]

    patched = client.patch(
        "/api/admin/ai-settings",
        json={
            "feature_access": {
                "owner": ["rewrite", "summarize", "translate", "restructure", "continue"],
                "editor": ["summarize", "translate", "restructure", "continue"],
                "commenter": [],
                "viewer": [],
            }
        },
        headers=admin_headers,
    )
    assert patched.status_code == 200

    blocked = client.post("/api/ai/rewrite", json={"selectedText": "Blocked", "versionId": 1}, headers=user_headers)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "INSUFFICIENT_PERMISSION"


def test_restore_document_and_realtime_session(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    owner_login = client.post(
        "/api/auth/login",
        json={"email": "atharv.dev@local", "password": "atharv-preview-pass"},
    )
    headers = auth_headers(owner_login.json()["accessToken"])

    created = client.post("/api/documents", json={"title": "Spec Draft"}, headers=headers)
    assert created.status_code == 201
    doc_id = created.json()["id"]

    deleted = client.delete(f"/api/documents/{doc_id}", headers=headers)
    assert deleted.status_code == 204

    listed_after_delete = client.get("/api/documents", headers=headers)
    assert all(item["id"] != doc_id for item in listed_after_delete.json())

    restored = client.post(f"/api/documents/{doc_id}/restore", headers=headers)
    assert restored.status_code == 200
    assert restored.json()["restored"] is True

    session = client.post("/api/realtime/session", json={"doc_id": doc_id}, headers=headers)
    assert session.status_code == 200
    session_body = session.json()
    assert session_body["doc_id"] == doc_id
    assert session_body["role"] == "owner"
    assert session_body["token_query_param"] == "token"
    assert session_body["ws_url"].startswith(f"ws://localhost:1234/doc/{doc_id}?token=")


def test_admin_can_update_ai_settings(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    owner_login = client.post(
        "/api/auth/login",
        json={"email": "atharv.dev@local", "password": "atharv-preview-pass"},
    )
    headers = auth_headers(owner_login.json()["accessToken"])

    fetched = client.get("/api/admin/ai-settings", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["feature_access"]["editor"] == [
        "rewrite",
        "summarize",
        "translate",
        "restructure",
        "continue",
    ]

    updated = client.patch(
        "/api/admin/ai-settings",
        json={"feature_access": {"owner": ["rewrite"], "editor": ["rewrite"], "commenter": [], "viewer": []}},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["feature_access"]["editor"] == ["rewrite"]

    writer = client.post(
        "/api/auth/register",
        json={"email": "policy@example.com", "password": "PreviewPass123!", "name": "Policy"},
    )
    writer_headers = auth_headers(writer.json()["accessToken"])
    blocked = client.post("/api/ai/summarize", json={"doc_id": "doc-001", "selection": {"text": "Hello"}}, headers=writer_headers)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "INSUFFICIENT_PERMISSION"
