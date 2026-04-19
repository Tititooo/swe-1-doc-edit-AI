# Architecture Deviations from Assignment 1 Design

This file documents every deliberate difference between the Assignment 1 design and the final implementation. For each deviation, we state what changed, why, and whether the change is an improvement or a compromise.

---

## 1. Authentication: JWT-only (no Google OAuth)

**A1 design:** The report described OAuth 2.0 via a Google provider integrated into FastAPI middleware, with the JWT issued downstream of the OAuth exchange.

**Implementation:** Pure HS256 JWT issuance/validation using `PyJWT`, with bcrypt-hashed password storage. No OAuth dependency.

**Why:** Implementing a production Google OAuth flow requires redirect URIs, OAuth app credentials, and a running frontend on a stable domain — none of which are available in the Render free tier during development. JWT-only auth covers every rubric requirement (registration, login, 15-min access tokens, 7-day refresh tokens, session persistence, expiry handling) without that operational complexity.

**Classification:** Improvement within scope — the rubric says "JWT-based authentication" explicitly. OAuth would be an additional layer on top, not a replacement.

---

## 2. WebSocket Auth: Doc-Scoped Short-Lived Tokens (not generic bearer replay)

**A1 design:** The A1 architecture described a single bearer access token used for both REST API and the WebSocket upgrade handshake. The token was passed as `?token=<access_token>` in the WebSocket URL.

**Implementation:** `POST /api/realtime/session` now mints a *separate*, doc-scoped HS256 token (`type: "doc_access"`) bound to a specific `doc_id` and short-lived (10 min, configurable via `REALTIME_TOKEN_TTL_SECONDS`). The collab server (`auth.js::verifyRequest`) requires `payload.type === "doc_access"` AND `payload.doc_id === docName` parsed from the upgrade path, plus a valid signature. A generic bearer token is rejected.

**Why:** The professor's A1 review explicitly flagged that the collab server validated JWTs but never re-checked document authorization — any holder of any valid JWT could connect to any document UUID. This closes that replay vulnerability. Factoring verification into `auth.js` (separate from `server.js`) also makes it unit-testable without spinning up the WebSocket server.

**Classification:** Security improvement. Closes the A1 review deduction.

---

## 3. In-Memory Dual-Mode Runtime (no mandatory PostgreSQL)

**A1 design:** The architecture assumed PostgreSQL was always available as the persistence layer.

**Implementation:** `AppRuntime` (`backend/api/runtime.py`) keeps parallel in-memory stores that mirror the PostgreSQL schema. When `DATABASE_URL` is unset, every route works against in-memory data — users, documents, permissions, AI interactions, version history — with zero external dependencies. The collab server runs in "ephemeral mode" (live sync works; snapshot persistence is disabled). The system logs which mode it starts in.

**Why:** This enables fully-local development and testing without Docker, makes CI/Playwright fast (no DB spin-up), and lets the test suite run in any environment. The Render deployment uses real PostgreSQL when `DATABASE_URL` is set.

**Classification:** Improvement — significantly better DX and CI reliability.

---

## 4. AI Provider: Groq (not generic "LLM provider")

**A1 design:** The report described an abstract AI provider interface with Groq listed as the concrete implementation.

**Implementation:** Groq is the production AI provider (`ai/groq_client.py`), with `FakeAIService` for tests/CI. The `AIService` interface (`ai/service.py`) is the abstraction layer — swapping providers requires only a new `stream_feature` / `complete_feature` implementor and a change to `get_ai_service()` in `main.py`. Prompts are in `ai/prompts.py` (configurable, not hardcoded per-request).

**Classification:** Matches A1 design. Documented here for completeness.

---

## 5. CRDT via Yjs (not custom OT)

**A1 design:** The report mentioned both OT and CRDTs as possible conflict-resolution strategies, with Yjs as the chosen library.

**Implementation:** Yjs CRDT through `y-websocket` on the Node collab server, with `@tiptap/extension-collaboration` on the frontend. Single-instance server (no Redis pub/sub). Snapshot persistence to PostgreSQL via `backend/collab/persistence.js`.

**Known limitation noted in A1:** Single-instance, no horizontal scaling. Upgrade path: Hocuspocus + Redis.

**Classification:** Matches A1 intent. The single-instance limitation was known and documented.

---

## 6. Document Dashboard (not single-document editor)

**A1 design:** The original design focused on the collaborative editor as the primary surface, with document management as a secondary concern.

**Implementation:** A full `DocumentDashboard` component is the entry point after authentication. Users create and open documents from the dashboard. The workspace header shows save status, role, and document-level actions (Share, Version History, Export). This matches the A1 requirements for "dashboard listing documents the user has access to" (§1.2).

**Classification:** Improvement — matches rubric requirements more completely than the earlier prototype.

---

## 7. Version History: REST Revert (not real-time Yjs state restore)

**A1 design:** Version history was planned as snapshots with revert capability.

**Implementation:** The backend stores Yjs binary snapshots in `document_versions` via the collab server's persistence layer. Revert (`POST /api/documents/:id/revert/:version_id`) fetches the snapshot, re-inserts it as the latest content, and the editor syncs from the restored state. The frontend triggers a Yjs re-seed via `externalSyncToken` after revert.

**Known limitation:** Revert is not a Yjs-native snapshot restore — it replaces document content via the REST `PUT` path, which may produce a brief CRDT divergence window before all peers sync. For the demo scale (≤5 concurrent users), this is acceptable.

**Classification:** Partial implementation. Full Yjs snapshot restore would require a dedicated y-websocket admin API.

---

## 8. AI Prompt Configuration: Module-Based (not config-file-based)

**A1 design:** The report mentioned that "prompt templates must be configurable (config files or a prompt module)".

**Implementation:** Prompts are in `backend/ai/prompts.py` as a Python module. Adding or modifying prompts requires a code change and redeploy, not a runtime config edit. Admin users can toggle per-role AI feature access via `PATCH /api/admin/ai-settings`.

**Classification:** Compromise on the "config file" interpretation — but the prompts are centralized, not scattered across route handlers, and the module boundary enables clean provider swapping.

---

## 9. PR Workflow as Evidence

Per the professor's A1 feedback: "processes defined for version control should be followed and evidenced in the Git commit history." Every feature was delivered via a feature branch + PR with CI checks, not direct commits to `main`. Commit messages follow the Conventional Commits format. The PR history on GitHub shows the review process.

---

*Last updated: April 2026 — Assignment 2 submission*
