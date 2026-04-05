# Project Research Summary

**Project:** doc-editor-AI — Collaborative Document Editor with AI Writing Assistant
**Domain:** Real-time collaborative rich-text editor with integrated LLM-powered writing assistance
**Researched:** 2026-03-20
**Confidence:** HIGH

## Executive Summary

This is a real-time collaborative document editor with an LLM-powered writing assistant, built as a PoC by a four-person team. Experts building this class of product use a CRDT-based sync layer (Yjs) rather than operational transforms, because CRDTs offer deterministic offline merging and simpler conflict resolution. The recommended approach is: React + Tiptap v3 on the frontend for rich-text editing, Yjs + y-websocket for real-time sync, FastAPI (Python) as the async backend, and the Groq SDK for streaming LLM calls proxied through the backend. The system decomposes cleanly into three independently deployable services on Render: the FastAPI API, the Node.js collab server, and the React SPA.

The primary product thesis — that AI suggestions should surface as tracked-change proposals requiring explicit accept/reject rather than direct text replacement — differentiates this product from Notion AI and Google Gemini, and gives users safe, reversible AI output. All AI calls must be proxied through the backend (ADR-002) to protect the API key, enforce per-user token quotas, and log interactions. The SSE streaming pipeline (Groq → FastAPI → EventSourceResponse → browser) is the critical path for the demo-day experience; first-token latency under 1 second is the target.

The key risks are: (1) the Groq free tier is easily exhausted by four concurrent developers testing simultaneously — mock-first development is mandatory; (2) Tiptap's standard History extension silently corrupts undo when the Collaboration extension is also active — this must be disabled before any collaborative editing is wired; (3) Render's free tier spins down services after 15 minutes of inactivity, breaking WebSocket connections and causing 60-second cold starts on the first AI call after idle. All three risks have known, low-cost mitigations that must be applied in Sprint 1 before deeper feature work begins.

---

## Key Findings

### Recommended Stack

The stack is anchored on React 18 + Tiptap v3 (currently 3.20.4) on the frontend and FastAPI 0.135.x + Python 3.12 on the backend. The contract specifies Tiptap 2.x, but v2 is unmaintained — only v3 releases appear on npm and GitHub. The migration is mechanical (cursor extension renamed, Floating UI replaces Tippy.js) and must be flagged in team handoff. Yjs 13.x is the CRDT layer; y-websocket 3.x split the server into a separate `@y/websocket-server` package — both packages must be installed and kept on compatible versions.

Two critical library decisions diverge from common tutorials: use PyJWT (not python-jose, which is abandoned with unpatched CVEs) for JWT handling, and use asyncpg (not psycopg2) as the async PostgreSQL driver to avoid event-loop blocking. The Groq Python SDK v1.1.1 provides a native async client with streaming support; the model `llama-3.3-70b-versatile` is the default with `llama-3.1-8b-instant` as the cost/latency fallback.

**Core technologies:**
- React 18.3.1: Frontend framework — Tiptap has first-class React 18 support; required by TanStack Query v5
- Tiptap 3.20.4: Rich-text editor — best Yjs integration of any editor framework; v2 is unmaintained
- Yjs 13.x: CRDT sync — deterministic offline merge, native awareness API for cursor presence
- y-websocket (client) + @y/websocket-server (Node.js): WebSocket collab transport — reference Yjs provider; server separated at v3.0.0
- FastAPI 0.135.1: Python async backend — native SSE support, auto OpenAPI docs, Pydantic v2, fast async
- PostgreSQL 16: Persistent storage — ACID, Render managed; Yjs snapshots stored as `bytea`
- Groq SDK 1.1.1: LLM client — official async Python SDK; llama-3.3-70b-versatile validated
- TanStack Query 5.91.2: REST cache layer — optimistic updates, background refetch, React 18 required
- Zustand 5.0.12: Client state — auth store, AI stream state, editor metadata; lightweight vs Redux
- PyJWT: JWT encode/decode — replaces abandoned python-jose; FastAPI docs officially moved to PyJWT in May 2024
- asyncpg: Async PostgreSQL driver — non-blocking; psycopg2 blocks the event loop and will deadlock under async SQLAlchemy

### Expected Features

The feature set is fully specified in contract.md. The must-have PoC features are all achievable with a sequential build of the AI pipeline before real-time collaboration is wired (Yjs is Teya's Sprint 2 scope; AI stubs only need a stub doc_id to function). The core AI differentiator — suggestions as tracked-change proposals — requires a custom Tiptap extension that inserts suggestions as Yjs-aware marks, NOT as ProseMirror decorations (decorations are local-only and disappear on remote edits).

**Must have (table stakes — Temiko's PoC skeleton):**
- Auth (register + login + JWT with refresh) — blocks all other endpoints
- Document CRUD stub (create, list, get) — provides doc_id foreign key for AI logging
- AI rewrite / summarize / translate with SSE streaming — core demo value
- AI suggestion as tracked-change inline diff — visual proof; requires custom Tiptap mark in Yjs doc
- Accept / reject AI suggestion — without this, AI output is irreversible
- Streaming UX with cancel button — "AI is writing…" indicator + abort
- Per-user daily token quota + 429 response — cost control before team testing
- AI interaction logging (ai_interactions table) — required for audit and quota enforcement
- Mockable AI service interface — enables deterministic unit tests without real Groq calls
- Minimal Tiptap editor rendering — editor must load before anything is testable
- Render deployment (render.yaml) — catch infra issues in Sprint 1

**Should have (competitive — team integration sprints):**
- Real-time keystroke propagation (Yjs + y-websocket) — Teya's Sprint 2
- Presence / cursor awareness — depends on Yjs; delivered alongside Yjs integration
- RBAC middleware — Atharv's backend scope
- Document sharing (email + role) — depends on RBAC
- AI restructure (freeform instruction) — same pipeline as rewrite; prompt template change only
- Version history with revert — append-only Yjs snapshots; non-destructive revert
- Offline resilience — Yjs IndexedDB persistence + reconnect sync
- Export (PDF / DOCX / Markdown) — server-side generation

**Defer (v2+ / post-semester):**
- AI soft-lock during processing (FR-AI-07) — depends on full Yjs collab; deferred in PROJECT.md
- Partial accept of AI suggestion — complex sub-range selection logic; marginal MVP value
- Org admin AI config panel — Could-Have per MoSCoW; Atharv's post-MVP scope
- Real-time sidebar comment threads — Won't-Have this semester per contract
- Horizontal collab server scaling — upgrade path to Hocuspocus + Redis is documented but deferred

### Architecture Approach

The system uses a three-tier architecture with a clear process boundary between the Python backend (FastAPI + SQLAlchemy) and the Node.js collab server (y-websocket). They share PostgreSQL but have no direct inter-service HTTP calls — decoupled by the database. The React SPA communicates with FastAPI via REST + SSE, and with the collab server via WebSocket (Yjs binary protocol). AI suggestions live in client-side Zustand state and Tiptap decoration marks until explicitly accepted, at which point they become a single Yjs transaction synced to all peers. Document content's canonical source-of-truth is the Yjs CRDT, not a PostgreSQL text column; PostgreSQL stores serialized Yjs state snapshots (bytea) debounced every 30 seconds.

**Major components:**
1. React SPA (Tiptap + custom extensions) — rich-text editing, AI suggestion UI, streaming token accumulation, accept/reject
2. Zustand stores (authStore, editorStore, aiStore) — auth tokens, AI stream state, pending suggestions
3. TanStack Query layer — REST call caching, optimistic updates for all `/api/*` calls
4. FastAPI backend — JWT auth middleware, document controller, AI controller, permission controller, repository layer
5. AI Service module (backend/ai/) — prompt construction, async Groq streaming client, quota enforcement, interaction logging
6. y-websocket Server (Node.js) — Yjs CRDT sync, awareness broadcast, debounced PostgreSQL snapshot persistence
7. PostgreSQL 16 — users, documents, document_versions (Yjs bytea), permissions, ai_interactions tables

### Critical Pitfalls

1. **Tiptap History + Yjs UndoManager conflict** — disable `StarterKit.configure({ history: false })` before adding the Collaboration extension; both active silently corrupts undo and can wipe the document on Ctrl+Z. Must be done in Sprint 1 before any collaborative code is added.

2. **SSE stream continues after client disconnect (zombie Groq calls)** — use `sse-starlette`'s `EventSourceResponse` with disconnect polling, or manually check `await request.is_disconnected()` in the async generator; also call `POST /api/ai/cancel/:suggestion_id` from the frontend Cancel button, not just `EventSource.close()`.

3. **Groq free-tier rate limit exhaustion under team testing** — maintain two API keys (dev vs. demo), mock Groq in all unit/integration tests, implement exponential backoff on 429, and add graceful "AI temporarily unavailable" UX rather than surfacing raw errors.

4. **AI suggestion stored as ProseMirror decoration (not Yjs node)** — decorations are local-only and disappear when any remote peer makes an edit; the suggestion must be inserted as a custom Tiptap mark inside the Yjs document using `setMeta('addToHistory', false)`, so all peers see it and accept/reject is a proper Yjs transaction.

5. **Render free-tier spin-down breaks WebSocket connections and cold-starts SSE** — expose `/health` endpoints on both services from day one, set up an UptimeRobot keep-alive ping (every 5 minutes) after first deploy, and document the behavior for teammates.

---

## Implications for Roadmap

The architecture's build-order dependency graph (Layers 0–6 in ARCHITECTURE.md) and the feature dependency tree (FEATURES.md) both converge on the same sequencing logic: infrastructure and auth must precede document CRUD, which must precede AI features, which must precede full collaborative integration.

Temiko's PoC skeleton can deliver a fully testable AI pipeline with stub implementations for auth and documents — real Yjs collaboration is Teya's Sprint 2 scope and is not a blocker for AI testing. This means the roadmap should plan Phase 1 as the full infrastructure + AI skeleton, and Phase 2 as the real-time collaboration layer.

### Phase 1: Foundation + Infrastructure
**Rationale:** No other phase can proceed without auth tokens, a database schema, and a deployed environment. Pitfall prevention for Render spin-down, JWT secrets, and Groq key management must happen here — retrofitting security and infra hygiene is expensive.
**Delivers:** PostgreSQL schema, FastAPI skeleton (auth + user controller + repository layer), minimal React SPA with Tiptap rendering, Render deployment (render.yaml), shared Pydantic schemas committed to `shared/` as TypeScript types, stub endpoints that validate against contract.md schemas
**Addresses:** Auth stub, document CRUD stub, Render deploy, `/health` endpoints
**Avoids:** Hardcoded JWT secrets (generate with `openssl rand -hex 32` before first deploy), stub contract drift (generate Pydantic schemas from contract.md before writing any stub), Render cold-start (deploy early, set up keep-alive)

### Phase 2: AI Integration (Temiko's Core Scope)
**Rationale:** AI is the primary demo value and the highest-risk implementation path. Building it before Yjs collaboration is wired is intentional — the AI Service module and SSE pipeline only need a stub doc_id to function end-to-end. Discovering streaming, quota, and tracked-change issues early (not during integration week) is critical.
**Delivers:** AI Service module (prompts.py, groq_client.py, quota.py), SSE streaming endpoint, custom AISuggestionExtension (Tiptap mark in Yjs doc), accept/reject UI, cancel button with server-side abort, per-user token quota + 429, AI interaction logging, mockable AIService interface
**Addresses:** AI rewrite / summarize / translate, streaming UX, cancel mid-stream, AI suggestion as tracked change, accept/reject, token quota, logging
**Avoids:** AI suggestion as decoration (implement as Yjs mark from the start), SSE zombie calls (implement disconnect detection before any demo testing), Groq quota drain (mock-first; real Groq only in smoke tests), streaming tokens insert into Yjs one-by-one (batch 100-200ms window before applying)

### Phase 3: Real-Time Collaboration (Teya's Core Scope)
**Rationale:** Yjs integration is a significant frontend and infrastructure effort (y-websocket server + persistence adapter + WebsocketProvider wiring) that is independent of the AI pipeline. Once Layers 1–2 (stub auth, doc CRUD) are stable, Teya can build this in parallel with Phase 2.
**Delivers:** y-websocket Node.js server with PostgreSQL persistence adapter (debounced 30s), WebsocketProvider connected to Tiptap, Collaboration extension + CollaborationCaret (presence/awareness), CRDT conflict resolution testing
**Addresses:** Real-time keystroke propagation, presence/cursor awareness, CRDT conflict resolution, offline resilience
**Avoids:** Tiptap History + Yjs UndoManager conflict (disable `history: false` in StarterKit before wiring Collaboration), y-websocket memory leak (implement persistence callbacks before integration testing), Yjs awareness broadcast on every keystroke (throttle to 100-200ms)

### Phase 4: RBAC, Sharing, and Team Integration
**Rationale:** Permission enforcement (RBAC middleware + document sharing) is Atharv's scope and depends on auth being stable (Phase 1) and document CRUD being real (Phase 1). This phase integrates all three teammate modules and adds production-quality permission checks that replace the stub allow-all middleware.
**Delivers:** RBAC middleware (owner/editor/commenter/viewer enforced at API layer), document sharing by email + role, permission controller, RBAC check on `/api/ai/*` endpoints (editor role required), integration tests across all module boundaries
**Addresses:** Role-based access, document sharing, AI invoke permission check
**Avoids:** No RBAC on AI endpoints (viewer calling rewrite bypasses quota and costs money), stub contract drift surfacing during integration (contract tests catch this)

### Phase 5: Enhancement and Hardening
**Rationale:** Once the four-module integration is stable, remaining features (version history, export, offline resilience) and production hardening (error handling, edge cases, E2E tests) deliver the full contract feature set before demo day.
**Delivers:** Version history with revert (append-only Yjs snapshots + non-destructive revert), export as PDF/DOCX/Markdown, offline resilience (Yjs IndexedDB persistence), AI restructure (freeform instruction prompt template), E2E tests (Playwright), demo-day warm-up procedure
**Addresses:** Version history, export, offline resilience, AI restructure
**Avoids:** Render spin-down on demo day (UptimeRobot keep-alive + manual warm-up 5 minutes before presentation), undo after AI accept in multi-user session (verify Ctrl+Z with remote peer having made edits since suggestion appeared)

### Phase Ordering Rationale

- **Infrastructure before features:** PostgreSQL schema and auth stubs are required foreign keys for every other module. Deploying to Render in Phase 1 catches infra issues (spin-down, CORS, cold starts) before they block demo-day features.
- **AI before Yjs integration:** The AI pipeline (Phase 2) does not depend on real-time collaboration. Building AI with stub documents allows Temiko's module to be fully tested before Teya delivers Yjs integration in Phase 3. This parallelizes the critical path.
- **Tracked-change architecture decided in Phase 2, not Phase 3:** The AISuggestionExtension must use Yjs marks (not decorations) from the start. This architecture decision must be locked before Tanisha builds the accept/reject UI, which means it belongs in Phase 2 even though Yjs full integration is Phase 3.
- **RBAC after auth and document CRUD stabilize:** Permission enforcement requires knowing the stable shape of auth tokens and document IDs. Adding it in Phase 4 after Phase 1 stubs are reviewed avoids a double-rewrite.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2 (AI Integration):** The AISuggestionExtension architecture (Tiptap mark as Yjs node, streaming token batching, accept/reject as Yjs transaction) is the highest-novelty implementation area. The approach is validated in research but specific Tiptap v3 extension API patterns for Yjs-aware marks should be verified against current Tiptap docs before implementation.
- **Phase 3 (Real-Time Collaboration):** The y-websocket persistence adapter pattern for PostgreSQL has sparse official documentation — the contract's `persistence.js` design draws on community implementations. Verify the `Y.encodeStateAsUpdate` / `Y.applyUpdate` roundtrip pattern works correctly with Tiptap v3's y-prosemirror binding before building the snapshot adapter.
- **Phase 5 (Export):** Export as PDF/DOCX requires a server-side generation approach (pandoc or equivalent). This was not deeply researched; the tool choice and integration with the Yjs document state should be researched during Phase 5 planning.

Phases with standard patterns (can skip deeper research):

- **Phase 1 (Foundation):** FastAPI + SQLAlchemy async + Pydantic + PyJWT patterns are thoroughly documented in official docs and have HIGH-confidence source validation. Render Blueprint deployment is straightforward.
- **Phase 4 (RBAC):** FastAPI dependency injection for RBAC is a well-documented pattern. The permission model is fully specified in contract.md.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified against npm registry and GitHub releases on 2026-03-20. Critical divergence from contract (Tiptap v2 → v3) is well-documented with official migration guide. PyJWT recommendation backed by FastAPI official PR. |
| Features | HIGH | Feature list grounded in contract.md FR requirements. Competitor analysis (Notion AI, Google Gemini) provides MEDIUM-confidence validation of UX patterns. Priority matrix and dependency tree are internally consistent. |
| Architecture | HIGH | Architecture fully specified in contract.md (C4 model, ADRs, data model). SSE and Yjs patterns validated against official Tiptap and Yjs docs. Anti-patterns (decoration vs. Yjs node, frontend Groq calls) backed by official documentation. |
| Pitfalls | HIGH | All 7 critical pitfalls traced to specific GitHub issues, official documentation, or production post-mortems. Groq rate limits from official Groq docs. Render spin-down from official Render docs. |

**Overall confidence:** HIGH

### Gaps to Address

- **Tiptap v3 Yjs-aware mark extension API:** The AISuggestionExtension must insert suggestions as marks inside the Yjs document. Research confirms this is the correct approach, but the exact Tiptap v3 extension API for creating custom marks with `addToHistory: false` in a Yjs-collaborative context should be validated against current Tiptap v3 docs during Phase 2 planning. Tiptap v3 is recent (3.20.4 as of March 2026) and some API details may differ from v2 community examples.

- **y-websocket PostgreSQL persistence adapter implementation details:** The contract's `persistence.js` design is based on community implementations (MaxNoetzold/y-postgresql pattern). The exact `bindState` / `writeState` callback signatures for `@y/websocket-server` (the v3 server package) should be verified before Teya builds the collab server, as the package split may have changed the persistence API.

- **Groq model availability on demo day:** `llama-3.3-70b-versatile` is validated as available on the Groq free plan as of 2026-03-20. Model availability on Groq can change without notice. The fallback (`llama-3.1-8b-instant`) should be configured as an env var from day one, with a quick switch procedure documented.

- **Export tooling (Phase 5):** PDF/DOCX export was not researched in depth. The contract specifies FR-DM-04 but the server-side tool (pandoc, weasyprint, python-docx, or similar) and its integration with the Yjs document's serialized format has not been evaluated. This gap should be addressed during Phase 5 planning.

---

## Sources

### Primary (HIGH confidence)
- `docs/contract.md` — canonical project spec: C4 architecture, ADRs, data model, FR requirements
- [@tiptap/core npm / GitHub releases](https://github.com/ueberdosis/tiptap/releases) — v3.20.4 confirmed current; v2 unmaintained
- [Tiptap v2→v3 upgrade guide](https://tiptap.dev/docs/guides/upgrade-tiptap-v2) — CollaborationCaret rename, Floating UI requirement
- [FastAPI JWT discussion / PR #11589](https://github.com/fastapi/fastapi/discussions/11345) — python-jose abandonment; official PyJWT migration
- [groq-python releases](https://github.com/groq/groq-python/releases) — v1.1.1 current; async streaming confirmed
- [y-websocket npm / GitHub](https://github.com/yjs/y-websocket) — v3.0.0 server split to @y/websocket-server
- [FastAPI releases](https://github.com/fastapi/fastapi/releases) — v0.135.1; native SSE support
- [Groq Rate Limits Documentation](https://console.groq.com/docs/rate-limits) — 30 RPM / 12K TPM / 100K TPD free tier
- [Render Free Tier Documentation](https://render.com/docs/free) — 15-minute spin-down confirmed
- [Tiptap Undo/Redo Documentation](https://tiptap.dev/docs/editor/extensions/functionality/undo-redo) — "Do not integrate if making collaborative"
- [Tiptap Issue #1786](https://github.com/ueberdosis/tiptap/issues/1786) — History + Collaboration conflict confirmed
- [FastAPI Discussion #7572](https://github.com/fastapi/fastapi/discussions/7572) — SSE disconnect detection

### Secondary (MEDIUM confidence)
- [Liveblocks Tiptap 2→3 migration](https://liveblocks.io/docs/guides/migrating-from-tiptap-2-to-3) — community-verified migration checklist
- [FastAPI SSE for LLM tokens](https://medium.com/@hadiyolworld007/fastapi-sse-for-llm-tokens-smooth-streaming-without-websockets-001ead4b5e53) — validated against FastAPI StreamingResponse docs
- [y-websocket PostgreSQL persistence pattern](https://github.com/MaxNoetzold/y-postgresql) — community implementation; aligns with contract's persistence.js approach
- [Stop Burning CPU on Dead FastAPI Streams](https://jasoncameron.dev/posts/fastapi-cancel-on-disconnect) — zombie task pattern and asyncio.shield
- [Notion AI / Google Docs Gemini competitor analysis](https://genesysgrowth.com/blog/notion-ai-vs-coda-ai-vs-google-docs-ai) — UX pattern comparison

### Tertiary (LOW confidence)
- [Streaming AI Responses perception benchmark](https://dev.to/programmingcentral/stop-making-users-wait-the-ultimate-guide-to-streaming-ai-responses-22m3) — 40-60% faster perception stat; needs validation for this specific use case
- [24 Best Document Collaboration Tools 2026](https://thedigitalprojectmanager.com/tools/document-collaboration-tools/) — general market landscape only

---
*Research completed: 2026-03-20*
*Ready for roadmap: yes*
