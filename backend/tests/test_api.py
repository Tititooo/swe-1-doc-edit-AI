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

    async def rewrite(self, selected_text: str, *, style: str | None = None) -> str:
        return f"{selected_text} [rewritten]"

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


def test_health_endpoint():
    app = create_app()
    client = TestClient(app)

    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_compatibility_document_routes():
    app = create_app()
    app.state.ai_service = FakeAIService()
    client = TestClient(app)

    get_response = client.get("/api/document")
    assert get_response.status_code == 200
    body = get_response.json()
    assert body["id"] == "doc-001"
    assert body["versionId"] == 1

    update_response = client.put(
        "/api/document",
        json={"content": "Updated content", "versionId": 1},
    )
    assert update_response.status_code == 200
    assert update_response.json()["versionId"] == 2

    version_response = client.get("/api/document/version")
    assert version_response.status_code == 200
    assert version_response.json() == {"versionId": 2}


def test_compatibility_rewrite_and_streaming_rewrite():
    app = create_app()
    app.state.ai_service = FakeAIService()
    client = TestClient(app)

    compat = client.post("/api/ai/rewrite", json={"selectedText": "Hello", "versionId": 1})
    assert compat.status_code == 200
    assert compat.json()["success"] is True
    assert compat.json()["result"] == "rewrite:Hello"

    continue_response = client.post(
        "/api/ai/rewrite",
        json={"selectedText": "", "versionId": 2, "feature": "continue", "documentText": "Continue this paragraph"},
    )
    assert continue_response.status_code == 200
    assert continue_response.json()["result"] == "continue:Continue this paragraph"

    with client.stream(
        "POST",
        "/api/ai/rewrite",
        json={"doc_id": "doc-001", "selection": {"text": "Hello world"}, "style": "formal"},
    ) as response:
        assert response.status_code == 200
        body = "".join(line.decode() if isinstance(line, bytes) else line for line in response.iter_lines())

    assert "event: token" in body
    assert '"suggestion_id":"suggestion-123"' in body
    assert "event: done" in body


def test_cancel_endpoint():
    app = create_app()
    app.state.ai_service = FakeAIService()
    client = TestClient(app)

    found = client.post("/api/ai/cancel/suggestion-123")
    assert found.status_code == 200
    assert found.json()["ok"] is True

    missing = client.post("/api/ai/cancel/does-not-exist")
    assert missing.status_code == 404
