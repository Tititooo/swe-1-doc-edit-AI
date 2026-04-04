from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

from .schemas import DocumentResponse


@dataclass(slots=True)
class DocumentState:
    id: str
    title: str
    content: str
    version_id: int
    last_modified: datetime

    def as_response(self) -> DocumentResponse:
        return DocumentResponse(
            id=self.id,
            title=self.title,
            content=self.content,
            versionId=self.version_id,
            lastModified=self.last_modified.isoformat(),
        )


class VersionConflictError(Exception):
    pass


class InMemoryDocumentStore:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._document = DocumentState(
            id="doc-001",
            title="Sample Document",
            content=(
                "The quick brown fox jumps over the lazy dog. "
                "This is a sample document for testing the editor.\n\n"
                'Try selecting some text and clicking "Rewrite" to see the AI assistant in action.\n\n'
                "You can edit this content freely, and the version control system will track changes."
            ),
            version_id=1,
            last_modified=datetime.now(timezone.utc),
        )

    async def get_document(self) -> DocumentResponse:
        async with self._lock:
            return self._document.as_response()

    async def get_version(self) -> int:
        async with self._lock:
            return self._document.version_id

    async def update_document(self, content: str, version_id: int) -> DocumentResponse:
        async with self._lock:
            if version_id != self._document.version_id:
                raise VersionConflictError(
                    f"Version conflict: expected {self._document.version_id}, got {version_id}"
                )

            self._document.content = content
            self._document.version_id += 1
            self._document.last_modified = datetime.now(timezone.utc)
            return self._document.as_response()

    async def get_document_by_id(self, doc_id: str) -> DocumentResponse:
        async with self._lock:
            if doc_id != self._document.id:
                raise KeyError(doc_id)
            return self._document.as_response()
