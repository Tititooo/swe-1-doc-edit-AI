# Requirements Traceability Matrix

This traceability package has two goals:

1. Show that every user story is backed by one or more functional requirements and supported by concrete architecture components.
2. Show that every functional requirement maps to at least one implementation component, even when the current user-story set treats it as a platform prerequisite rather than a standalone story.

## Architecture Component Legend

| Short Name | Component |
| --- | --- |
| Frontend SPA | React 18 client with Tiptap, Yjs client bindings, React Query, and Zustand |
| FastAPI Backend | API router, auth, document, user, permission, and export endpoints |
| AI Service | Prompt engine, quota logic, Groq client, and SSE streaming orchestration |
| Collaboration Server | `y-websocket` process for CRDT synchronization and awareness |
| PostgreSQL | Persistent store for users, documents, permissions, versions, AI logs, and org policy state |
| Groq API | External LLM provider used through the backend proxy |

## User Story to Requirement to Architecture Mapping

| User Story | Functional Requirements | NFRs Touched | Primary Architecture Components |
| --- | --- | --- | --- |
| US-01 Real-time cursors and selections | FR-RT-02 | NFR-LAT-01, NFR-US-01 | Frontend SPA, Collaboration Server |
| US-02 Offline edits survive reconnect | FR-RT-04 | NFR-AV-02 | Frontend SPA, Collaboration Server |
| US-03 Concurrent edits converge | FR-RT-03 | NFR-LAT-01 | Frontend SPA, Collaboration Server |
| US-04 Revert to a prior version while others edit | FR-DM-02 | NFR-AV-02 | FastAPI Backend, PostgreSQL, Frontend SPA, Collaboration Server |
| US-05 Rewrite selected text with AI | FR-AI-01, FR-AI-04, FR-AI-06 | NFR-LAT-02, NFR-SP-03, NFR-US-02 | Frontend SPA, FastAPI Backend, AI Service, PostgreSQL, Groq API |
| US-06 Summarize a long section | FR-AI-02, FR-AI-04, FR-AI-06 | NFR-LAT-02, NFR-SP-03, NFR-US-02 | Frontend SPA, FastAPI Backend, AI Service, PostgreSQL, Groq API |
| US-07 Translate selected text | FR-AI-03, FR-AI-04, FR-AI-06 | NFR-LAT-02, NFR-SP-03, NFR-US-02 | Frontend SPA, FastAPI Backend, AI Service, PostgreSQL, Groq API |
| US-08 Partially accept an AI suggestion | FR-AI-04 | NFR-US-03 | Frontend SPA, Collaboration Server |
| US-09 Cancel AI generation mid-stream | FR-AI-05 | NFR-LAT-02 | Frontend SPA, FastAPI Backend, AI Service |
| US-10 Share with specific users and roles | FR-DM-03, FR-UM-02 | NFR-SP-01 | Frontend SPA, FastAPI Backend, PostgreSQL |
| US-11 Export with or without AI changes | FR-DM-04 | NFR-LAT-03 | Frontend SPA, FastAPI Backend |
| US-12 Commenter is blocked from invoking AI | FR-UM-02, FR-AI-01 | NFR-US-03 | Frontend SPA, FastAPI Backend |
| US-13 Org admin configures AI features per role | FR-UM-04 | NFR-SP-03 | Frontend SPA, FastAPI Backend, PostgreSQL |
| US-14 Viewer is prevented from editing gracefully | FR-UM-02 | NFR-US-03 | Frontend SPA, FastAPI Backend |

## Functional Requirement Coverage Matrix

| Functional Requirement | Supported User Stories | Mapped Architecture Components | Coverage Note |
| --- | --- | --- | --- |
| FR-RT-01 Keystroke propagation | US-01, US-03 | Frontend SPA, Collaboration Server | Foundational collaboration path used by all live editing scenarios |
| FR-RT-02 Presence awareness | US-01 | Frontend SPA, Collaboration Server | Directly supports cursor, selection, and online user awareness |
| FR-RT-03 Conflict handling in same region | US-03 | Frontend SPA, Collaboration Server | Implemented through Yjs CRDT convergence behavior |
| FR-RT-04 Offline resilience | US-02 | Frontend SPA, Collaboration Server | Requires local buffering plus reconnect sync |
| FR-RT-05 Session join and catch-up | US-01, US-10 | Frontend SPA, Collaboration Server, PostgreSQL | New clients need current snapshots plus pending updates before collaboration begins |
| FR-AI-01 Rewrite request and proposal display | US-05, US-12 | Frontend SPA, FastAPI Backend, AI Service, Groq API | Covers both the happy path and permission-denied case |
| FR-AI-02 Summarization | US-06 | Frontend SPA, FastAPI Backend, AI Service, Groq API | Reuses the same orchestration stack with a different prompt template |
| FR-AI-03 Translation | US-07 | Frontend SPA, FastAPI Backend, AI Service, Groq API | Adds target-language parameterization in the prompt engine |
| FR-AI-04 Accept, reject, partial apply, undo | US-05, US-06, US-07, US-08 | Frontend SPA, Collaboration Server | UI actions become Yjs transactions so collaborators stay consistent |
| FR-AI-05 Streaming UX and cancellation | US-09 | Frontend SPA, FastAPI Backend, AI Service | SSE status handling and abort behavior live across client and backend |
| FR-AI-06 AI interaction logging | US-05, US-06, US-07 | FastAPI Backend, AI Service, PostgreSQL | Logs support auditability, quotas, and analytics |
| FR-AI-07 Soft-lock while AI processes a region | US-05, US-09 | Frontend SPA, Collaboration Server, FastAPI Backend | Protects semantic integrity when AI and humans target the same paragraph |
| FR-DM-01 Create a document with owner permission | Platform prerequisite for US-04 to US-11 | FastAPI Backend, PostgreSQL, Frontend SPA | Required before any document-centered workflow can begin |
| FR-DM-02 Version history and revert | US-04 | FastAPI Backend, PostgreSQL, Frontend SPA, Collaboration Server | Non-destructive revert creates a fresh version and broadcasts it |
| FR-DM-03 Sharing and role assignment | US-10 | FastAPI Backend, PostgreSQL, Frontend SPA | Share flow creates permissions that immediately affect access control |
| FR-DM-04 Export to common formats | US-11 | FastAPI Backend, Frontend SPA | Export endpoint generates file output based on current document state |
| FR-DM-05 Soft delete and recovery window | Platform lifecycle requirement | FastAPI Backend, PostgreSQL | Not represented by a dedicated current user story, but still mapped and testable |
| FR-UM-01 Registration and login | Platform prerequisite for all authenticated stories | FastAPI Backend, PostgreSQL, Frontend SPA | Establishes the session context required for collaboration and sharing |
| FR-UM-02 Role-based authorization | US-10, US-12, US-14 | FastAPI Backend, PostgreSQL, Frontend SPA | Enforced at both API and UI layers |
| FR-UM-03 Token refresh and session continuity | Platform prerequisite for US-05 to US-11 | FastAPI Backend, Frontend SPA | Prevents silent session loss during long editing sessions |
| FR-UM-04 Org admin AI configuration and quotas | US-13 | FastAPI Backend, PostgreSQL, Frontend SPA | Requires persistent policy storage and admin-only endpoints |

## Coverage Observations

- The current story set gives strong coverage for collaboration, AI workflows, sharing, export, and RBAC.
- Three functional requirements are platform-oriented rather than user-story-first: FR-DM-05, FR-UM-01, and FR-UM-03. They still map cleanly to architecture components and should be verified through API and integration tests.
- FR-UM-04 requires persistent organization policy state. The ERD in `../architecture/diagrams/erd.mmd` adds that storage explicitly so the traceability chain is complete.
