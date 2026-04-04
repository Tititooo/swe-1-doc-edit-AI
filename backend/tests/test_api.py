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
    monkeypatch.setenv("DEV_BOOTSTRAP_PASSWORD", "temiko-preview-pass")
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
    viewer = runtime._memory_users_by_email["viewer@example.com"]
    viewer.role = "viewer"

    login = client.post(
        "/api/auth/login",
        json={"email": "viewer@example.com", "password": "PreviewPass123!"},
    )
    headers = auth_headers(login.json()["accessToken"])

    blocked = client.post("/api/ai/rewrite", json={"selectedText": "Hello", "versionId": 1}, headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "INSUFFICIENT_PERMISSION"
