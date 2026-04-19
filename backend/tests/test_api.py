from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import jwt

from api.main import create_app
from ai.groq_client import GroqClientError
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


class _MidStreamFailingAIService(FakeAIService):
    """Yields one token, then raises GroqClientError. Used to prove the
    stream_feature handler catches provider failures mid-iterator and emits
    the documented SSE error envelope (`event: error`, `code:
    AI_SERVICE_UNAVAILABLE`) instead of hard-closing the connection."""

    async def stream_feature(self, feature: str, selected_text: str, **kwargs):
        async def iterator():
            yield "partial"
            raise GroqClientError("upstream groq timed out")

        return SuggestionHandle("suggestion-mid-error", feature, asyncio.Event()), iterator()


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


def extract_suggestion_id(stream_body: str) -> str:
    match = re.search(r'"suggestion_id":"([^"]+)"', stream_body)
    assert match is not None
    return match.group(1)


def test_health_endpoint_reports_auth_requirement(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["auth_required"] is True


def test_document_routes_still_work_in_preview_mode(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=False)

    list_response = client.get("/api/documents")
    assert list_response.status_code == 200
    document_id = list_response.json()[0]["id"]

    get_response = client.get(f"/api/documents/{document_id}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == document_id
    assert get_response.json()["version_id"] == 1

    update_response = client.put(
        f"/api/documents/{document_id}",
        json={"content": "Updated content", "versionId": 1},
    )
    assert update_response.status_code == 200
    assert update_response.json()["versionId"] == 2

    refreshed = client.get(f"/api/documents/{document_id}")
    assert refreshed.status_code == 200
    assert refreshed.json()["version_id"] == 2


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

    preview_doc_id = client.app.state.runtime.preview_doc_id
    unauthenticated_doc = client.get(f"/api/documents/{preview_doc_id}")
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
    preview_doc_id = client.app.state.runtime.preview_doc_id

    with client.stream(
        "POST",
        "/api/ai/rewrite",
        json={"doc_id": preview_doc_id, "selection": {"text": "Hello"}, "style": "formal"},
        headers=headers,
    ) as response:
        assert response.status_code == 200
        body = "".join(line.decode() if isinstance(line, bytes) else line for line in response.iter_lines())

    assert "event: token" in body
    suggestion_id = extract_suggestion_id(body)

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
    preview_doc_id = client.app.state.runtime.preview_doc_id

    with client.stream(
        "POST",
        "/api/ai/rewrite",
        json={"doc_id": preview_doc_id, "selection": {"text": "Hello world"}, "style": "formal"},
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
    preview_doc_id = client.app.state.runtime.preview_doc_id

    blocked = client.post(
        "/api/ai/rewrite",
        json={"doc_id": preview_doc_id, "selection": {"text": "Hello"}},
        headers=headers,
    )
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
    # WS URL carries a doc-scoped token (not the bearer access token): see
    # test_realtime_session_token_is_doc_scoped for the claim-level contract.
    assert realtime_body["ws_url"].startswith(f"ws://localhost:1234/doc/{doc_id}?token=")
    assert f"token={auth['accessToken']}" not in realtime_body["ws_url"]
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

    preview_doc_id = client.app.state.runtime.preview_doc_id
    with client.stream(
        "POST",
        "/api/ai/rewrite",
        json={"doc_id": preview_doc_id, "selection": {"text": "Hello"}},
        headers=user_headers,
    ) as compat:
        assert compat.status_code == 200
        body = "".join(line.decode() if isinstance(line, bytes) else line for line in compat.iter_lines())
    suggestion_id = extract_suggestion_id(body)

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

    blocked = client.post(
        "/api/ai/rewrite",
        json={"doc_id": preview_doc_id, "selection": {"text": "Blocked"}},
        headers=user_headers,
    )
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


def test_ai_stream_emits_error_event_on_groq_failure(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)
    client.app.state.ai_service = _MidStreamFailingAIService()

    auth = client.post(
        "/api/auth/register",
        json={"email": "midfail@example.com", "password": "PreviewPass123!", "name": "Mid"},
    ).json()
    headers = auth_headers(auth["accessToken"])
    preview_doc_id = client.app.state.runtime.preview_doc_id

    with client.stream(
        "POST",
        "/api/ai/rewrite",
        json={"doc_id": preview_doc_id, "selection": {"text": "Hello"}, "style": "formal"},
        headers=headers,
    ) as response:
        assert response.status_code == 200
        body = "".join(line.decode() if isinstance(line, bytes) else line for line in response.iter_lines())

    # Partial token must have been delivered before the failure…
    assert "event: token" in body
    assert '"token":"partial"' in body
    # …and the error event must carry the documented shape so the frontend
    # can surface a friendly message (`AI_SERVICE_UNAVAILABLE`).
    assert "event: error" in body
    assert '"code": "AI_SERVICE_UNAVAILABLE"' in body
    assert "upstream groq timed out" in body


def test_realtime_session_requires_doc_role(monkeypatch):
    client = create_test_client(monkeypatch, auth_required=True)

    # A newly registered user has no permission on a synthetic doc UUID
    # that was never shared with them — the endpoint must refuse to mint
    # a doc-scoped token for it.
    auth = client.post(
        "/api/auth/register",
        json={"email": "outsider@example.com", "password": "PreviewPass123!", "name": "Outsider"},
    ).json()
    headers = auth_headers(auth["accessToken"])

    forbidden = client.post(
        "/api/realtime/session",
        json={"doc_id": "00000000-0000-0000-0000-dead000beef0"},
        headers=headers,
    )
    # `require_document_role` returns 404 DOCUMENT_NOT_FOUND whenever the
    # caller has no role on the doc — the existence vs permission distinction
    # is intentionally hidden (don't leak doc-id enumeration). So the same
    # code covers both "doc does not exist" and "user has no access".
    assert forbidden.status_code == 404
    assert forbidden.json()["code"] == "DOCUMENT_NOT_FOUND"


def test_realtime_session_token_is_doc_scoped(monkeypatch):
    """The token minted for the WS URL must be doc-scoped (type='doc_access',
    doc_id claim matches). This is what closes the A1 review deduction: a
    leaked bearer can no longer be replayed against other document UUIDs."""

    client = create_test_client(monkeypatch, auth_required=True)

    auth = client.post(
        "/api/auth/register",
        json={"email": "scoped@example.com", "password": "PreviewPass123!", "name": "Scoped"},
    ).json()
    headers = auth_headers(auth["accessToken"])

    created = client.post("/api/documents", json={"title": "Scoped Doc"}, headers=headers)
    assert created.status_code == 201
    doc_id = created.json()["id"]

    realtime = client.post("/api/realtime/session", json={"doc_id": doc_id}, headers=headers)
    assert realtime.status_code == 200
    ws_url = realtime.json()["ws_url"]

    # Pull ?token=... out of the URL without pulling in urllib just for this.
    token = ws_url.split("?token=", 1)[1]

    settings = client.app.state.settings
    decoded = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])

    assert decoded["type"] == "doc_access"
    assert decoded["doc_id"] == doc_id
    assert decoded["role"] == "owner"
    # sub is the user id — confirm we can correlate the token back to the caller.
    user_id = client.app.state.runtime._memory_users_by_email["scoped@example.com"].id
    assert decoded["sub"] == user_id
    # Must NOT be reusable as a generic bearer.
    assert decoded["type"] != "access"
