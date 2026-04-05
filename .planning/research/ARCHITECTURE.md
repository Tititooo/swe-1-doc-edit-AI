# Architecture Research

**Domain:** Collaborative document editor with AI writing assistant
**Researched:** 2026-03-20
**Confidence:** HIGH — Architecture fully specified in contract.md (C4 model, ADRs, data model). This file validates the design and documents component boundaries, data flows, and build order implications.

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         Browser (React SPA)                         │
│                                                                      │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────┐  ┌─────────┐  │
│  │  Tiptap +    │  │  React Query  │  │  Zustand   │  │  Yjs    │  │
│  │  Extensions  │  │  (REST cache) │  │  (app state│  │  CRDT   │  │
│  │  (AI suggest │  │               │  │  + AI state│  │  client │  │
│  │   soft-lock) │  │               │  │  + auth)   │  │         │  │
│  └──────┬───────┘  └──────┬────────┘  └────────────┘  └────┬────┘  │
│         │                 │                                 │        │
└─────────┼─────────────────┼─────────────────────────────────┼───────┘
          │ SSE (AI stream) │ REST (CRUD/Auth)                 │ WSS (Yjs)
          ▼                 ▼                                  ▼
┌──────────────────────────────┐              ┌──────────────────────┐
│      FastAPI Backend          │              │   y-websocket Server  │
│                               │              │   (Node.js 20)        │
│  ┌──────────────────────────┐ │              │                       │
│  │  Auth Middleware (JWT)   │ │              │  - CRDT sync/broadcast│
│  └──────────────────────────┘ │              │  - Awareness (cursors)│
│  ┌───────────┐ ┌────────────┐ │              │  - Snapshot persist   │
│  │  Document │ │    AI      │ │              │    (debounced 30s)    │
│  │ Controller│ │ Controller │ │              └──────────┬────────────┘
│  └───────────┘ └─────┬──────┘ │                         │
│  ┌───────────┐       │        │                         │ SQL
│  │   User    │  ┌────▼──────┐ │                         │
│  │ Controller│  │ AI Service │ │                         ▼
│  └───────────┘  │ (module)  │ │              ┌──────────────────────┐
│  ┌───────────┐  │ - prompts │ │              │    PostgreSQL 16       │
│  │Permission │  │ - quota   │ │──── SQL ────►│                       │
│  │Controller │  │ - client  │ │              │  users                │
│  └───────────┘  └─────┬─────┘ │              │  documents            │
│  ┌──────────────────┐ │       │              │  document_versions    │
│  │  Repository Layer │ │       │              │  permissions          │
│  │  (SQLAlchemy)     │ │       │              │  ai_interactions      │
│  └──────────────────┘ │       │              └──────────────────────┘
└───────────────────────┼───────┘
                        │ HTTPS
                        ▼
               ┌────────────────┐
               │   Groq API      │
               │ (llama-3.3-70b) │
               │  SSE → backend  │
               └────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| React SPA (Tiptap + extensions) | Rich text editing, AI suggestion display, soft-lock UI, accept/reject UI | Tiptap 2 + custom Extension nodes for AI decorations |
| Yjs CRDT client | Document state, offline buffering, conflict-free merging | `@tiptap/extension-collaboration` + `y-prosemirror` bindings |
| Zustand stores | Auth state, editor metadata, AI invocation state, suggestion tracking | `authStore`, `editorStore`, `aiStore` — 3 lightweight stores |
| React Query layer | REST call caching, optimistic updates, background refetch | TanStack Query v5 wrapping all `/api/*` endpoints |
| Auth Middleware (FastAPI) | JWT validation on every request, role extraction, per-endpoint RBAC | FastAPI `Depends()` injection — applied globally |
| Document Controller | CRUD, version history, revert, export, snapshot storage | FastAPI router at `/api/documents/*` |
| AI Controller | SSE stream setup, cancellation, feedback logging | FastAPI router at `/api/ai/*`, yields SSE tokens |
| AI Service (module) | Prompt construction, Groq call, quota enforcement, response parsing | `backend/ai/` — `prompts.py`, `groq_client.py`, `quota.py` |
| Permission Controller | Share/revoke access, role updates | FastAPI router at `/api/documents/:id/permissions/*` |
| Repository Layer | All SQL access via SQLAlchemy 2.x async | One repo class per table — no SQL in controllers |
| y-websocket Server | Yjs sync protocol, awareness broadcast, periodic DB snapshot | Node.js 20 + `y-websocket` + custom `persistence.js` Postgres adapter |
| PostgreSQL | Durable storage: users, doc metadata, Yjs snapshots, permissions, AI logs | 5 core tables; document content lives in `document_versions.snapshot` (bytea) |

## Recommended Project Structure

```
collab-editor/
├── frontend/                      # Tanisha's ownership
│   └── src/
│       ├── components/            # UI components (editor, toolbar, dialogs)
│       ├── extensions/            # Custom Tiptap extensions
│       │   ├── ai-suggestion.ts   # Decoration nodes for AI tracked changes
│       │   └── soft-lock.ts       # Paragraph lock indicator
│       ├── hooks/                 # useDocument, useAI, useAuth, usePresence
│       ├── stores/                # Zustand: authStore, editorStore, aiStore
│       ├── api/                   # React Query hooks wrapping REST
│       └── vite.config.ts
│
├── backend/
│   ├── api/                       # Atharv's ownership
│   │   ├── routes/                # documents.py, auth.py, ai.py, permissions.py
│   │   ├── middleware/            # Auth, CORS, rate limiting
│   │   ├── services/              # Business logic (thin, delegates to AI module + repos)
│   │   ├── models/                # SQLAlchemy ORM models
│   │   ├── schemas/               # Pydantic request/response schemas
│   │   └── main.py                # FastAPI app factory, router registration
│   │
│   ├── ai/                        # Temiko's ownership
│   │   ├── prompts.py             # f-string templates per feature
│   │   ├── groq_client.py         # Async Groq wrapper + streaming + retry
│   │   ├── router.py              # /ai/* routes (mounted into main.py)
│   │   └── quota.py               # Per-user daily token quota enforcement
│   │
│   └── collab/                    # Teya's ownership
│       ├── server.js              # y-websocket entry point
│       └── persistence.js         # Postgres snapshot adapter (debounced 30s)
│
├── shared/
│   ├── types/                     # Pydantic → TypeScript via datamodel-code-generator
│   └── constants/                 # Roles, AI features, error codes
│
├── infra/                         # Teya's ownership
│   ├── render.yaml                # Render Blueprint (3 services: API, collab, static)
│   ├── .env.example
│   └── init.sql                   # DB schema init script
│
└── tests/
    ├── unit/                      # Per-module, mocked LLM responses
    ├── integration/               # Real Groq API, real DB
    └── e2e/                       # Playwright
```

### Structure Rationale

- **backend/ai/ separate from backend/api/:** Clean module boundary for Temiko's ownership. `ai/router.py` is mounted into `api/main.py` — AI is a FastAPI sub-application, not a separate service. Avoids microservice overhead while maintaining code isolation.
- **extensions/ in frontend/:** Custom Tiptap extensions (AI suggestion decoration, soft-lock) are the frontend's most domain-specific code. Isolating them lets teammates extend without touching core editor setup.
- **shared/types/:** Pydantic schemas compile to TypeScript via `datamodel-code-generator`. Single source of truth for API contracts prevents frontend/backend drift.
- **collab/ as Node.js island:** y-websocket runs in Node.js 20; keeping it separate from Python backend reflects the real process boundary. Persistence adapter is internal to this module.

## Architectural Patterns

### Pattern 1: Backend-Proxied AI Streaming (SSE)

**What:** Frontend POSTs to `/api/ai/rewrite`. FastAPI receives, constructs prompt, opens async Groq HTTPS stream, and re-emits each token as an SSE event to the frontend.
**When to use:** Any time an API key must be hidden from the browser, or quota enforcement must be server-side. This is the case here (ADR-002).
**Trade-offs:** One extra network hop (~10-50ms). Requires `X-Accel-Buffering: no` header if Nginx/Render proxy is in path — without it, SSE tokens are batched and streaming UX is lost.

**Example:**
```python
# backend/ai/router.py
@router.post("/rewrite")
async def rewrite(req: RewriteRequest, user=Depends(get_current_user)):
    await quota.check_and_reserve(user.id, estimated_tokens=500)
    async def generate():
        async for token in groq_client.stream(prompts.rewrite(req)):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})
```

### Pattern 2: Yjs CRDT + y-prosemirror Binding

**What:** Tiptap's `Collaboration` extension wraps `y-prosemirror`, which translates between ProseMirror transactions and Yjs updates. Every keystroke becomes a Yjs update. The `y-websocket` provider syncs updates bidirectionally with the collab server, which broadcasts to all connected clients.
**When to use:** Whenever >1 user edits the same document. Also handles offline buffering for free — Yjs queues updates locally and flushes on reconnect.
**Trade-offs:** Yjs binary encoding is opaque — debugging merge conflicts requires `Y.encodeStateAsUpdate` inspection tools. The y-prosemirror position mapping has subtle edge cases around marks and embedded nodes.

**Example:**
```typescript
// frontend/src/extensions — wiring Tiptap with Yjs
const ydoc = new Y.Doc()
const provider = new WebsocketProvider(WS_URL, docId, ydoc)

const editor = useEditor({
  extensions: [
    StarterKit.configure({ history: false }), // Yjs owns history
    Collaboration.configure({ document: ydoc }),
    CollaborationCursor.configure({ provider }),
    AISuggestionExtension, // custom extension wrapping tracked-change marks
  ]
})
```

### Pattern 3: AI Suggestions as Tracked-Change Decoration Nodes

**What:** When AI streams tokens back, the frontend accumulates them into a custom Tiptap extension. The extension applies the suggestion as ProseMirror decoration marks (strikethrough red for original, green insertion). These are NOT Yjs-synced until the user accepts — they live in the editor's local decoration layer.
**When to use:** Any inline AI proposal that users review before committing. Keeps the CRDT state clean until user confirms intent.
**Trade-offs:** Decorations are ephemeral — they disappear on reload. Accepted changes become permanent Yjs transactions. Partial accept (sub-range) requires careful position mapping.

### Pattern 4: Repository Layer Isolation

**What:** All database access goes through repository classes (one per table). Controllers call `doc_repo.get_by_id()`, not raw SQLAlchemy queries. No SQL appears in route handlers.
**When to use:** Always — this pattern is what allows unit tests to mock the DB layer cleanly, satisfying FR-stakeholder S5's requirement for mockable interfaces.
**Trade-offs:** Adds one indirection layer. Worth it for testability and the ability to swap the ORM without touching business logic.

## Data Flow

### AI Rewrite Flow (primary value path)

```
User selects text → clicks "Rewrite" in floating toolbar
    ↓
AISuggestionExtension.invoke("rewrite", selection, context)
    ↓
aiStore.startStream(suggestionId) → React Query POST /api/ai/rewrite
    ↓
AI Controller → Auth middleware validates JWT + RBAC (editor role required)
    ↓
AI Service: quota.check() → prompts.rewrite(selection, ctx) → groq_client.stream()
    ↓
Groq API → SSE token stream → FastAPI yields tokens → SSE to browser
    ↓
Browser EventSource receives tokens → AISuggestionExtension accumulates
    ↓
Tiptap editor: decoration marks applied (strikethrough + green insertion)
    ↓ (user accepts)
Yjs transaction: decorations → permanent document update → synced to all peers
    ↓
AI Controller: POST /api/ai/feedback { action: "accepted" } → ai_interactions table
```

### Real-Time Collaboration Flow

```
User A types keystroke
    ↓
Tiptap ProseMirror transaction
    ↓
y-prosemirror: transaction → Yjs update (binary delta)
    ↓
WebsocketProvider: sends update over WSS
    ↓
y-websocket Server: receives → broadcasts to all connected clients for docId
    ↓
User B's WebsocketProvider receives → y-prosemirror: Yjs update → ProseMirror transaction
    ↓
User B's Tiptap editor re-renders (≤300ms p95 same-region)
    ↓ (async, debounced 30s)
collab/persistence.js: Y.encodeStateAsUpdate(ydoc) → PostgreSQL document_versions (bytea)
```

### Auth + Document Load Flow

```
User navigates to /documents/:id
    ↓
React Query: GET /api/documents/:id (JWT in Authorization header)
    ↓
FastAPI: Auth middleware validates JWT → extracts user_id
    ↓
Permission Controller: permissions table lookup → role for (doc_id, user_id)
    ↓
Document Controller: returns doc metadata
    ↓
Tiptap initializes → WebsocketProvider connects to y-websocket at ws://collab/:docId
    ↓
y-websocket: loads latest snapshot from document_versions → sends to new client
    ↓
Editor renders current collaborative state
```

### State Management

```
Zustand authStore
    ├── user, accessToken, refreshToken
    └── → used by React Query request interceptor (attaches JWT)

Zustand aiStore
    ├── activeStreams: Map<suggestionId, StreamState>
    ├── pendingSuggestions: Map<suggestionId, SuggestionContent>
    └── → drives AISuggestionExtension decoration rendering

React Query cache
    ├── documents list (invalidated on create/delete)
    ├── document detail (invalidated on title patch)
    └── permissions (invalidated on share/revoke)

Yjs ydoc (NOT Zustand — Yjs owns document content)
    └── → y-prosemirror binding → Tiptap ProseMirror state
```

### Key Data Flows Summary

1. **Document content (canonical):** Lives in Yjs CRDT, NOT PostgreSQL columns. PostgreSQL `document_versions.snapshot` stores serialized Yjs state (bytea) for persistence, not the source-of-truth during live sessions.
2. **AI suggestions (ephemeral until accepted):** Live as Tiptap decoration marks client-side only. Committed to Yjs (and thus synced) only on explicit accept.
3. **Auth tokens:** Short-lived access token (15min) in memory/Zustand. Refresh token (7 days) in httpOnly cookie or secure storage. React Query interceptor auto-refreshes transparently.
4. **Quota tracking:** `users.daily_ai_tokens_used` incremented per AI invocation in the same DB transaction as the `ai_interactions` insert, preventing race conditions on concurrent AI calls.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-50 users (demo) | Current monolith is fine. Single y-websocket instance. Groq free tier. |
| 50-500 users | Monitor Groq costs; may need to downgrade to llama-3.1-8b for non-critical features. y-websocket is binding constraint — 200 concurrent active documents ceiling. |
| 500+ users | y-websocket → Hocuspocus + Redis pub/sub for horizontal collab scaling. FastAPI → add connection pooling (PgBouncer). Consider read replica for document list queries. |

### Scaling Priorities

1. **First bottleneck:** y-websocket is single-instance. Upgrade path: Hocuspocus (Tiptap's production collab backend) with Redis pub/sub for multi-instance broadcasting. This was explicitly acknowledged in ADR-001 as a known limitation.
2. **Second bottleneck:** Groq token costs under heavy AI usage. Layered defenses already in design: per-user daily quota (50k tokens), per-request input cap (4k tokens), org-level budget. Downgrade to 8B model as cost lever.

## Anti-Patterns

### Anti-Pattern 1: Syncing AI Suggestions via Yjs Before Accept

**What people do:** Insert AI-generated content directly into the Yjs doc as it streams, so all collaborators see it appearing word-by-word.
**Why it's wrong:** Every in-flight token becomes a permanent Yjs update. If the user cancels mid-stream or rejects the suggestion, you have garbage in the CRDT that must be undone — but Yjs undo across multiple clients is notoriously hard to scope correctly. Undo entries from other users will interfere.
**Do this instead:** Buffer streaming tokens in client-side state (aiStore). Apply as Tiptap decoration marks (local only, not CRDT). On explicit accept, apply as a single Yjs transaction. On reject, discard decorations. This is what the contract specifies.

### Anti-Pattern 2: Frontend-Direct Groq Calls

**What people do:** Call `fetch("https://api.groq.com/...")` directly from React to avoid the backend hop.
**Why it's wrong:** Exposes the Groq API key in the browser bundle (inspectable via DevTools). Bypasses quota enforcement and logging. Removes the ability to update prompts without a frontend redeploy.
**Do this instead:** All AI calls go through `/api/ai/*` (ADR-002). Backend owns the API key, prompt construction, and logging.

### Anti-Pattern 3: Storing Document Content as a Text Column

**What people do:** Save `documents.content` as a text/JSON column, update it on every edit.
**Why it's wrong:** Concurrent editors would overwrite each other. No merge semantics. Every edit is a full-document write. Version history requires storing full copies or implementing your own diff.
**Do this instead:** Document content canonical state IS the Yjs CRDT. The database stores serialized Yjs state snapshots (bytea) for persistence. Collab server writes snapshots debounced every 30s — not on every keystroke.

### Anti-Pattern 4: JWT in localStorage

**What people do:** Store access and refresh tokens in `localStorage` for simplicity.
**Why it's wrong:** XSS attack reads `localStorage` and exfiltrates tokens, giving full account access. Especially risky in a rich text editor where user-inserted content could trigger XSS.
**Do this instead:** Access token in memory (Zustand, wiped on page unload). Refresh token in `httpOnly` Secure cookie. This is the standard SPA pattern for JWT.

### Anti-Pattern 5: Blocking the Event Loop with Synchronous LLM Calls

**What people do:** Use synchronous Groq/OpenAI client calls in FastAPI route handlers.
**Why it's wrong:** Python's async event loop is blocked during the synchronous call. All other requests queued behind it. 30s timeout on a Groq call = 30s of serving no other users.
**Do this instead:** Use the async Groq client (or `httpx.AsyncClient`) with `async for` token iteration. FastAPI's async routes yield between tokens, keeping the event loop free.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Groq API | Backend HTTPS POST with streaming (`stream=True`). Async generator re-yields to SSE. | Use `X-Accel-Buffering: no` header. Set 30s timeout (NFR: AI_TIMEOUT). Retry on 503 (Groq down) with exponential backoff. |
| Render (hosting) | `render.yaml` Blueprint defines 3 services: FastAPI web service, y-websocket web service, managed Postgres. | Render provides TLS termination. All services in same region to minimize inter-service latency. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| React SPA ↔ FastAPI | REST (HTTPS) + SSE | JSON bodies. JWT Bearer header. Error format: `{error, code, detail}`. |
| React SPA ↔ y-websocket | WSS (Yjs binary protocol + Awareness) | NOT REST. Binary Yjs update frames. Auth: pass JWT as query param `?token=` on WS upgrade — validate in `server.js` connection handler. |
| FastAPI ↔ y-websocket | No direct connection | Both write to the same PostgreSQL. Decoupled by DB. No inter-service HTTP calls needed. |
| backend/ai/ ↔ backend/api/ | Python import (module boundary) | `ai/router.py` mounted into `api/main.py` with `app.include_router(ai_router, prefix="/api/ai")`. Shared SQLAlchemy session via FastAPI dependency injection. |
| Tiptap Editor ↔ AISuggestionExtension | Tiptap extension API | Extension registers commands (`setAISuggestion`, `acceptAISuggestion`, `rejectAISuggestion`) and transaction hooks. Communicates via aiStore (Zustand) for streaming state. |
| collab/persistence.js ↔ PostgreSQL | `pg` Node.js driver, direct SQL | Writes full Yjs state to `document_versions` (bytea). Debounced 30s. Uses separate DB connection pool from FastAPI. |

## Build Order Implications

The component dependency graph dictates a bottom-up build order. Each layer must be stable before the layers above it can be meaningfully tested.

```
Layer 0 (Prerequisite — no dependencies)
    PostgreSQL schema (init.sql) + Render infrastructure

Layer 1 (Depends on DB schema only)
    FastAPI skeleton: main.py, auth middleware, user controller, repository layer
    y-websocket server: basic sync without persistence

Layer 2 (Depends on Layer 1)
    Document CRUD controller + repository
    React SPA skeleton: auth UI, document list, basic Tiptap (no collab yet)
    y-websocket persistence adapter (connects Layer 1 collab server to DB)

Layer 3 (Depends on Layer 2 — core editing)
    Yjs CRDT integration: y-prosemirror + Collaboration extension in Tiptap
    WebsocketProvider connecting SPA to y-websocket
    CollaborationCursor (presence/awareness)

Layer 4 (Depends on Layers 1 + 3 — AI path)
    AI Service module: prompts.py + groq_client.py + quota.py
    AI Controller: SSE streaming endpoint
    AISuggestionExtension: frontend decoration marks
    SSE consumer hook in React

Layer 5 (Depends on Layers 2 + 4)
    Accept/reject AI suggestions (Yjs transaction + feedback log)
    Soft-lock mechanism (FR-AI-07, depends on full Yjs integration)
    Permission controller + RBAC enforcement

Layer 6 (Depends on full stack)
    Version history + revert
    Export (PDF/DOCX/Markdown)
    Org admin config
    E2E tests
```

**Critical path for Temiko's skeleton PoC:**
Layers 0 → 1 (auth stub) → Layer 4 (AI Service + SSE endpoint) can be built with a minimal Layer 2 stub (hardcoded doc_id, no real Yjs). This allows AI features to be testable end-to-end before teammates deliver their modules. Layer 3 (real Yjs collab) is Teya's scope (Sprint 2) and is not a blocker for Layer 4.

## Sources

- Contract: `docs/contract.md` — C4 Level 1-3, ADRs, data model, communication model (HIGH confidence — canonical project spec)
- [Tiptap Collaboration Extension docs](https://tiptap.dev/docs/editor/extensions/functionality/collaboration) (HIGH confidence — official docs)
- [Yjs + Tiptap binding documentation](https://docs.yjs.dev/ecosystem/editor-bindings/tiptap2) (HIGH confidence — official docs)
- [FastAPI SSE streaming for LLM tokens](https://medium.com/@hadiyolworld007/fastapi-sse-for-llm-tokens-smooth-streaming-without-websockets-001ead4b5e53) (MEDIUM confidence — verified against FastAPI StreamingResponse docs)
- [y-websocket PostgreSQL persistence patterns](https://github.com/MaxNoetzold/y-postgresql) (MEDIUM confidence — community implementation, aligns with contract's persistence.js approach)
- [Tiptap AI Suggestion extension](https://tiptap.dev/docs/content-ai/capabilities/suggestion/overview) (HIGH confidence — official docs, validates decoration-based suggestion approach)

---
*Architecture research for: Collaborative Document Editor with AI Writing Assistant*
*Researched: 2026-03-20*
