from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal
from uuid import uuid4

from .groq_client import GroqChatClient
from .prompts import (
    build_continue_messages,
    build_restructure_messages,
    build_rewrite_messages,
    build_summarize_messages,
    build_translate_messages,
)

FeatureName = Literal["rewrite", "summarize", "translate", "restructure", "continue"]


@dataclass(slots=True)
class SuggestionHandle:
    suggestion_id: str
    feature: FeatureName
    cancel_event: asyncio.Event


class SuggestionRegistry:
    def __init__(self) -> None:
        self._handles: dict[str, SuggestionHandle] = {}
        self._lock = asyncio.Lock()

    async def create(self, feature: FeatureName) -> SuggestionHandle:
        async with self._lock:
            handle = SuggestionHandle(
                suggestion_id=str(uuid4()),
                feature=feature,
                cancel_event=asyncio.Event(),
            )
            self._handles[handle.suggestion_id] = handle
            return handle

    async def cancel(self, suggestion_id: str) -> bool:
        async with self._lock:
            handle = self._handles.get(suggestion_id)
            if handle is None:
                return False
            handle.cancel_event.set()
            return True

    async def clear(self, suggestion_id: str) -> None:
        async with self._lock:
            self._handles.pop(suggestion_id, None)


class AIService:
    def __init__(self, client: GroqChatClient, registry: SuggestionRegistry | None = None) -> None:
        self._client = client
        self._registry = registry or SuggestionRegistry()

    @property
    def configured(self) -> bool:
        return self._client.configured

    async def rewrite(self, selected_text: str, *, style: str | None = None) -> str:
        return await self._client.complete(build_rewrite_messages(selected_text, style=style))

    async def complete_feature(
        self,
        feature: FeatureName,
        selected_text: str,
        *,
        style: str | None = None,
        notes: str | None = None,
        target_lang: str | None = None,
        instructions: str | None = None,
        document_text: str | None = None,
    ) -> str:
        if feature == "rewrite":
            messages = build_rewrite_messages(selected_text, style=style or notes)
        elif feature == "summarize":
            messages = build_summarize_messages(selected_text)
        elif feature == "translate":
            messages = build_translate_messages(selected_text, target_lang or "English")
        elif feature == "restructure":
            messages = build_restructure_messages(selected_text, instructions or notes or "Improve structure.")
        else:
            messages = build_continue_messages((document_text or selected_text).strip(), notes=notes)

        return await self._client.complete(messages)

    async def stream_feature(
        self,
        feature: FeatureName,
        selected_text: str,
        *,
        style: str | None = None,
        target_lang: str | None = None,
        instructions: str | None = None,
    ) -> tuple[SuggestionHandle, AsyncIterator[str]]:
        handle = await self._registry.create(feature)

        if feature == "rewrite":
            messages = build_rewrite_messages(selected_text, style=style)
        elif feature == "summarize":
            messages = build_summarize_messages(selected_text)
        elif feature == "translate":
            messages = build_translate_messages(selected_text, target_lang or "English")
        elif feature == "continue":
            messages = build_continue_messages(selected_text, notes=instructions)
        else:
            messages = build_restructure_messages(selected_text, instructions or "Improve structure.")

        async def iterator() -> AsyncIterator[str]:
            try:
                async for delta in self._client.stream(messages):
                    if handle.cancel_event.is_set():
                        break
                    yield delta
            finally:
                await self._registry.clear(handle.suggestion_id)

        return handle, iterator()

    async def cancel(self, suggestion_id: str) -> bool:
        return await self._registry.cancel(suggestion_id)
