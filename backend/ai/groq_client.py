from __future__ import annotations

from collections.abc import AsyncIterator

import groq
from groq import AsyncGroq

from api.config import Settings


class GroqClientError(Exception):
    """Normalized Groq client failure."""


class GroqChatClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = AsyncGroq(api_key=settings.groq_api_key) if settings.groq_api_key else None

    @property
    def configured(self) -> bool:
        return self._client is not None

    async def complete(self, messages: list[dict[str, str]], *, model: str | None = None) -> str:
        if self._client is None:
            raise GroqClientError("GROQ_API_KEY is not configured")

        chosen_model = model or self._settings.groq_model
        try:
            response = await self._client.with_options(
                max_retries=2,
                timeout=self._settings.groq_request_timeout_seconds,
            ).chat.completions.create(
                model=chosen_model,
                messages=messages,
                temperature=0.2,
            )
            content = response.choices[0].message.content or ""
            if content.strip():
                return content.strip()
        except groq.RateLimitError as exc:
            raise GroqClientError("Groq rate limit exceeded, please retry shortly.") from exc
        except groq.APITimeoutError as exc:
            raise GroqClientError("Groq timed out before returning a response.") from exc
        except groq.APIConnectionError as exc:
            raise GroqClientError("Unable to reach Groq from the backend.") from exc
        except groq.APIStatusError as exc:
            if chosen_model != self._settings.groq_fallback_model:
                return await self.complete(messages, model=self._settings.groq_fallback_model)
            raise GroqClientError(f"Groq rejected the request with status {exc.status_code}.") from exc

        raise GroqClientError("Groq returned an empty completion.")

    async def stream(self, messages: list[dict[str, str]], *, model: str | None = None) -> AsyncIterator[str]:
        if self._client is None:
            raise GroqClientError("GROQ_API_KEY is not configured")

        chosen_model = model or self._settings.groq_model
        try:
            stream = await self._client.with_options(
                max_retries=2,
                timeout=self._settings.groq_request_timeout_seconds,
            ).chat.completions.create(
                model=chosen_model,
                messages=messages,
                temperature=0.2,
                stream=True,
            )

            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except groq.RateLimitError as exc:
            raise GroqClientError("Groq rate limit exceeded, please retry shortly.") from exc
        except groq.APITimeoutError as exc:
            raise GroqClientError("Groq timed out before returning a response.") from exc
        except groq.APIConnectionError as exc:
            raise GroqClientError("Unable to reach Groq from the backend.") from exc
        except groq.APIStatusError as exc:
            if chosen_model != self._settings.groq_fallback_model:
                async for delta in self.stream(messages, model=self._settings.groq_fallback_model):
                    yield delta
                return
            raise GroqClientError(f"Groq rejected the request with status {exc.status_code}.") from exc
