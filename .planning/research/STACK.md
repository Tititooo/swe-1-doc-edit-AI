# Stack Research

**Domain:** Collaborative document editor with AI writing assistant
**Researched:** 2026-03-20
**Confidence:** HIGH (core stack validated against official docs and npm registry)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 18.3.1 | Frontend UI framework | Team familiarity, Tiptap has first-class React wrapper (`@tiptap/react`), TanStack Query v5 requires React 18+. Stable. React 19 exists but Tiptap v3 ecosystem targets 18. |
| Tiptap | **3.x** (currently 3.20.4) | Rich text editor | **CONTRACT SPECIFIES v2, BUT v3 IS CURRENT.** All active development is on v3. The npm releases page shows only v3 releases — no v2 maintenance visible. Collaboration extensions renamed in v3 (see version compatibility below). Team should use v3. |
| Yjs | 13.x | CRDT for real-time sync | Most mature JS CRDT. Native awareness (cursors/presence), offline buffering, sub-doc editing. y-prosemirror bindings are Tiptap's native integration path. |
| y-websocket | 3.0.0 (client) | Yjs WebSocket provider (client-side) | Reference Yjs client provider. NOTE: v3 dropped server — server is now a separate package `@y/websocket-server`. |
| @y/websocket-server | latest | Yjs WebSocket server (Node.js) | Separated from y-websocket at v3.0.0. This is the Node.js server component for Yjs CRDT sync. Use this for the collab server container. |
| FastAPI | 0.135.1 | Python async backend | Native async, auto OpenAPI docs, Pydantic v2 integration, built-in SSE support (added explicitly in 0.135.0). Team knows Python. |
| PostgreSQL | 16 | Persistent storage | ACID, Render managed, handles users/docs/versions/permissions/AI logs. Yjs snapshots stored as `bytea`. |
| Groq SDK (Python) | 1.1.1 | LLM API client | Official Python library. Provides both sync and async clients, streaming support. `llama-3.3-70b-versatile` is the validated model. |

### Supporting Libraries

#### Frontend

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tiptap/react | 3.20.4 | Tiptap React bindings | Always — the React integration layer |
| @tiptap/starter-kit | 3.x | Bundled common extensions (bold, italic, headings, etc.) | Base editor setup; reduces boilerplate |
| @tiptap/extension-collaboration | 3.x | Yjs CRDT integration for Tiptap | Required for collaborative editing via Yjs |
| @tiptap/extension-collaboration-caret | 3.x | Remote cursor/caret display | **Renamed from `extension-collaboration-cursor` in v3.** Shows collaborator cursor positions |
| y-prosemirror | latest | ProseMirror ↔ Yjs binding | Used internally by Tiptap collaboration; may need direct import for AI tracked-change implementation |
| @tanstack/react-query | 5.91.2 | Server state management | All REST API calls (docs CRUD, auth). Handles caching, refetch, optimistic updates. |
| zustand | 5.0.12 | Client state management | Auth state, editor metadata, AI operation state (streaming status, active suggestion). Lightweight. |
| Vite | 5.x | Build tool + dev server | Fast HMR, simple config. `npm create vite@latest -- --template react-ts` |
| @vitejs/plugin-react | 4.3.4 | Vite React support | Required for JSX transform in Vite |
| TypeScript | 5.x | Type safety | Shared types with backend via `datamodel-code-generator` |
| @floating-ui/dom | ^1.6.0 | Floating UI for Tiptap menus | **Required in Tiptap v3** — replaces Tippy.js. Must install explicitly if using Tiptap bubble/floating menus. |

#### Backend

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uvicorn[standard] | latest | ASGI server | FastAPI runtime; `[standard]` includes websocket support and uvloop |
| sqlalchemy[asyncio] | 2.x | Async ORM | All DB queries. Use `create_async_engine` + `asyncpg` driver. |
| asyncpg | >=0.29.0 | Async PostgreSQL driver | Required by SQLAlchemy for async PostgreSQL. Faster than psycopg2 for async. |
| alembic | latest | Database migrations | Schema version control. Run with sync engine even if app is async (Alembic limitation). |
| pydantic | 2.x | Request/response validation | Bundled with FastAPI; v2 is the current major. |
| PyJWT | latest | JWT encode/decode | **Use PyJWT, NOT python-jose.** `python-jose` has not released since 2021, has CVEs, is incompatible with Python >= 3.10 in some configurations. FastAPI docs updated to PyJWT in May 2024. |
| bcrypt | latest | Password hashing | Standard bcrypt for `hashed_password` column. |
| sse-starlette | 2.x (stable) or 3.x | SSE streaming responses | Wrap async generators as `EventSourceResponse`. Needed for `/api/ai/*` streaming endpoints. FastAPI 0.135.0 has native SSE docs, but `sse-starlette` provides cleaner abstractions and disconnect detection. |
| httpx | latest | Async HTTP client | For outbound Groq API calls inside the Groq client wrapper. Groq SDK uses httpx internally. |
| python-dotenv | latest | Environment variable loading | Load `.env` files in dev; Render provides env vars in production. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Node.js | 20.x or 22.x | Frontend build + y-websocket-server runtime | Vite requires Node.js >=20.19. The collab server (y-websocket-server) runs Node.js, not Python. |
| Python | 3.12 | Backend runtime | Contract specifies 3.12. asyncpg and all FastAPI deps support it. |
| pytest + pytest-asyncio | Testing | FastAPI async endpoint tests | Use `pytest-asyncio` for async test functions. |
| httpx (test client) | Testing | FastAPI test client | Use `httpx.AsyncClient` with `ASGITransport` for integration tests. |
| datamodel-code-generator | Type generation | Generate TypeScript types from Pydantic schemas | Keeps frontend/backend types in sync. Run as part of build pipeline. |
| Vitest | Frontend testing | Unit tests for React components | Pairs naturally with Vite. |

---

## Installation

```bash
# --- Frontend (inside frontend/) ---

# Core React + Vite scaffold
npm create vite@latest frontend -- --template react-ts

# Tiptap editor + collaboration
npm install @tiptap/react @tiptap/starter-kit
npm install @tiptap/extension-collaboration @tiptap/extension-collaboration-caret
npm install @floating-ui/dom  # Required by Tiptap v3 (replaces tippy.js)

# Yjs + WebSocket provider
npm install yjs y-websocket

# State management
npm install @tanstack/react-query zustand

# Dev dependencies
npm install -D typescript @types/react @types/react-dom vitest


# --- Collab Server (inside collab/ or similar) ---
npm install y-websocket @y/websocket-server


# --- Backend (inside backend/, using pip or uv) ---
pip install fastapi[standard]           # Includes uvicorn[standard]
pip install sqlalchemy[asyncio] asyncpg alembic
pip install pydantic                    # Bundled with FastAPI, but explicit pin for clarity
pip install PyJWT bcrypt python-dotenv
pip install sse-starlette
pip install groq                        # Official Groq Python SDK (v1.1.1)
pip install httpx                       # Async HTTP client (Groq SDK dependency)

# Dev/test
pip install pytest pytest-asyncio httpx
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Tiptap 3.x | Tiptap 2.x (as originally specified) | Only if a critical dependency is confirmed incompatible with v3 and team cannot migrate. v2 appears unmaintained (no releases on releases page). |
| Tiptap | Quill, Slate, Lexical, raw ProseMirror | Never for this project — Tiptap has the best Yjs integration of all editor frameworks. Raw ProseMirror would add significant boilerplate. |
| Yjs + y-websocket | Automerge, ShareDB (OT) | Automerge: weaker rich-text story. ShareDB requires central OT server. Contract explicitly rejected both. |
| @y/websocket-server | Hocuspocus | Hocuspocus is richer (auth hooks, Redis pub/sub, persistence callbacks) and is the upgrade path per contract (NFR-SC-03). For PoC, y-websocket-server is simpler. |
| FastAPI | Django, Flask, Node.js Express | FastAPI wins on native async, auto OpenAPI, Pydantic v2, SSE support. Team knows Python. |
| PyJWT | python-jose | **python-jose only** — abandoned (no releases since 2021), CVEs present, FastAPI officially moved to PyJWT. |
| asyncpg | psycopg2, psycopg3 | asyncpg is fastest for async SQLAlchemy on PostgreSQL. psycopg3 is a valid modern alternative. |
| sse-starlette | StreamingResponse + manual SSE | sse-starlette handles client disconnects, keepalive, and proper W3C SSE formatting automatically. Use it. |
| Groq SDK (groq) | LangChain, LlamaIndex | Contract specifies direct Groq API client (ADR-002). LangChain adds abstraction overhead not needed here. Direct SDK = simpler, faster. |
| Zustand 5.x | Redux, Jotai, Recoil | Redux = overkill for 4 stores. Jotai/Recoil valid alternatives but Zustand is simpler for AI stream state management. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| python-jose | Abandoned (last release 2021), unpatched CVEs, incompatible with Python 3.10+ in some setups. FastAPI officially moved away from it. | PyJWT |
| tippy.js | Removed from Tiptap v3 — all menus now use Floating UI. Installing tippy.js with Tiptap 3 will not work. | @floating-ui/dom |
| @tiptap/extension-collaboration-cursor | **Renamed in v3** to `@tiptap/extension-collaboration-caret`. Old package name will fail to install. | @tiptap/extension-collaboration-caret |
| `CollaborationHistory` / `@tiptap-pro/extension-collaboration-history` | Renamed to `Snapshot` in v3 Pro. This is a Pro (paid) extension. Not needed for PoC. | Not needed for PoC |
| Direct Groq API calls from frontend | Exposes API key, bypasses quota enforcement and logging. ADR-002 explicitly prohibits this. | Backend proxy via /api/ai/* |
| LangChain / LlamaIndex for Groq calls | Adds abstraction, hides streaming internals, harder to debug. Contract specifies thin async wrapper directly against Groq SDK. | groq Python SDK directly |
| Tiptap Cloud / Tiptap Collaboration (SaaS) | Paid product, not needed, Yjs + y-websocket covers the PoC requirements. | Self-hosted y-websocket-server |
| psycopg2 | Sync-only driver, blocking in async context. Use with SQLAlchemy async will deadlock under load. | asyncpg |
| HocusPocus (for PoC) | More complex than needed for the PoC stage. y-websocket-server is the reference implementation. | @y/websocket-server; Hocuspocus is the upgrade path once PoC is stable (per NFR-SC-03) |

---

## Stack Patterns by Variant

**If running the collab server alongside FastAPI on the same Render service:**
- Use a Procfile or separate Render service entry in render.yaml.
- The y-websocket-server runs Node.js; FastAPI runs Python. They cannot share a process.
- Render Blueprint can define both as separate web services pointing to the same repo root.

**If AI costs become a concern during development:**
- Swap `llama-3.3-70b-versatile` for `llama-3.1-8b-instant` in `backend/ai/prompts.py`.
- No code changes needed, just an env var or constant change.
- Contract anticipates this (per "Key Decisions" in PROJECT.md).

**If Tiptap v3 breaking changes block a specific feature:**
- The `@tiptap/extension-collaboration` package name is unchanged; only cursor/history extensions were renamed.
- Check `liveblocks.io/docs/guides/migrating-from-tiptap-2-to-3` for the community-maintained migration checklist.

**If PostgreSQL connection pooling becomes an issue on Render free tier:**
- Add `pool_size=5, max_overflow=10, pool_pre_ping=True` to `create_async_engine`.
- Render free Postgres has a connection limit (~25 connections). Keep pool small.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| @tiptap/react@3.x | React@18.x | Tiptap v3 targets React 18. React 19 compatibility is being worked on but not the primary target yet. |
| @tiptap/extension-collaboration@3.x | yjs@13.x, y-prosemirror@latest | Collaboration extension wraps y-prosemirror internally. Versions must align. |
| @tanstack/react-query@5.x | React@18.x | v5 requires React 18+ (uses `useSyncExternalStore`). |
| zustand@5.x | React@18.x | v5 dropped React 17 support. Works with React 18. |
| SQLAlchemy@2.x + asyncpg | Python@3.12 | Fully supported. Use `asyncpg>=0.29.0`. |
| FastAPI@0.135.x | Pydantic@2.x, Starlette@0.46+ | FastAPI 0.135 upgraded Starlette to >=0.46 for correct exception group handling. |
| groq@1.1.1 | Python@3.10+ | SDK requires Python 3.10+. Contract specifies 3.12. |
| y-websocket@3.x | yjs@13.x | v3 is client-only — server split to `@y/websocket-server`. Both must use compatible Yjs versions. |
| PyJWT | Python@3.12 | Actively maintained, no compatibility issues. |

---

## Critical Decision: Tiptap v2 vs v3

**The contract specifies Tiptap 2.x, but v3 is now current and v2 appears unmaintained.**

Evidence:
- npm `@tiptap/core` latest is 3.20.4 (published March 2026)
- GitHub releases page shows only v3.x releases — no v2 maintenance visible
- `@tiptap/extension-collaboration-cursor` is renamed to `@tiptap/extension-collaboration-caret` in v3
- tippy.js dependency removed; `@floating-ui/dom` required instead

**Recommendation: Use Tiptap v3.**

The project contract was written with "2.x" as the known version. v3 is not a drastic rewrite — the core API is stable, collaboration still works through `@tiptap/extension-collaboration`, and the breaking changes are mechanical renames. Starting a new project on v2 would mean immediately being on an unmaintained version.

The only risk is the collaboration cursor rename (`CollaborationCaret` vs `CollaborationCursor`). This affects Teya's collaboration module, not Temiko's AI skeleton. Flag this in team handoff.

---

## Sources

- [@tiptap/core npm releases](https://github.com/ueberdosis/tiptap/releases) — Confirmed v3.20.4 current, no v2 maintenance visible (HIGH confidence)
- [Tiptap v2→v3 upgrade guide](https://tiptap.dev/docs/guides/upgrade-tiptap-v2) — Breaking changes including CollaborationCaret rename (HIGH confidence)
- [Tiptap v3 announcement](https://tiptap.dev/tiptap-editor-v3) — y-tiptap collaboration packages (MEDIUM confidence)
- [Liveblocks Tiptap 2→3 migration](https://liveblocks.io/docs/guides/migrating-from-tiptap-2-to-3) — Community verified migration checklist (MEDIUM confidence)
- [@tanstack/react-query npm](https://www.npmjs.com/package/@tanstack/react-query) — v5.91.2 confirmed current (HIGH confidence)
- [zustand npm](https://www.npmjs.com/package/zustand) — v5.0.12 confirmed current (HIGH confidence)
- [FastAPI releases](https://github.com/fastapi/fastapi/releases) — v0.135.1 with native SSE support (HIGH confidence)
- [FastAPI JWT discussion → PyJWT](https://github.com/fastapi/fastapi/discussions/11345) — python-jose abandonment confirmed; PR #11589 updated FastAPI docs to PyJWT (HIGH confidence)
- [groq-python releases](https://github.com/groq/groq-python/releases) — v1.1.1 current (HIGH confidence)
- [Groq text generation docs](https://console.groq.com/docs/text-chat) — llama-3.3-70b-versatile confirmed available (HIGH confidence)
- [y-websocket npm / GitHub](https://github.com/yjs/y-websocket) — v3.0.0 server split to @y/websocket-server (HIGH confidence)
- [sse-starlette PyPI](https://pypi.org/project/sse-starlette/) — v2.x/3.x available, W3C-compliant SSE for FastAPI (HIGH confidence)
- [SQLAlchemy async FastAPI setup](https://leapcell.io/blog/building-high-performance-async-apis-with-fastapi-sqlalchemy-2-0-and-asyncpg) — asyncpg + async_sessionmaker pattern (MEDIUM confidence)

---

*Stack research for: Collaborative document editor with AI writing assistant*
*Researched: 2026-03-20*
