# Collaborative Document Editor with AI Writing Assistant

## Abstract

This project delivers a full-stack, real-time collaborative document editor with an integrated AI writing assistant, built as Assignment 2 of AI1220 (Software Engineering) at MBZUAI, Spring 2026. The system lets multiple authenticated users co-edit the same document simultaneously using Yjs CRDT over WebSocket, with live remote-cursor awareness, role-based access control (owner / editor / commenter / viewer), and an AI sidebar that streams rewrite, summarise, translate, restructure, and continue-writing suggestions token-by-token via Server-Sent Events. The backend is FastAPI (Python 3.12) with PostgreSQL persistence and a separate Node.js y-websocket collaboration server; the frontend is React 18 + Tiptap + Zustand. Authentication uses short-lived HS256 JWTs with silent refresh. All five assignment bonus items are implemented: CRDT conflict resolution (Yjs), remote cursor tracking, share-by-link with configurable roles, partial AI suggestion acceptance, and an end-to-end Playwright test suite covering the full login → AI-accept flow. The system is deployed on Render and runnable locally with a single `./run.sh` command.

---

## Table of Contents

1. [Team](#team)
2. [Live Deployment](#live-deployment-render)
3. [Demo Script (5 min)](#demo-script-5-min)
4. [Scope — Implemented vs Deferred](#scope--implemented-vs-deferred)
5. [Tech Stack](#tech-stack)
6. [Architecture](#architecture)
7. [Features](#features)
8. [API Reference](#api-reference)
9. [Local Setup](#local-setup)
10. [Testing](#testing)
11. [Deployment (Render)](#deployment-render)
12. [Project Structure](#project-structure)

---

## Team

| Member | Role | Focus Areas |
|--------|------|-------------|
| **Teya** ([@Tititooo](https://github.com/Tititooo)) | Project Lead / Infrastructure | Repo setup, collaboration server, database schema, Render deployment, PR reviews |
| **Temiko** ([@GravityCodez](https://github.com/GravityCodez)) | Backend & AI Lead | FastAPI backend, Groq AI integration, auth system, streaming, quota management, CI pipeline |
| **Atharv** ([@ScimitarX](https://github.com/ScimitarX)) | Backend & AI | AI UX flows, auth hardening, rich editor AI surface, history & feedback |
| **Tanisha** ([@Tanisha-Maahira-cell](https://github.com/Tanisha-Maahira-cell)) | Frontend | React SPA, initial editor, component scaffolding |

> **Note on `GravityCodez` commits:** Temiko and Atharv frequently worked together in a VS Code LiveShare session. Commits authored by `GravityCodez` represent the combined effort of both contributors.

---

## Live Deployment (Render)

| Service | URL |
|---------|-----|
| Static Frontend | https://collab-editor-frontend.onrender.com |
| FastAPI Backend | https://collab-editor-backend-ghfl.onrender.com (`/health`) |
| Collab WebSocket Server | https://collab-editor-collab.onrender.com (`/health`) |
| PostgreSQL 16 | Managed database (no public URL — reachable from backend + collab services) |
> Services on the Render free/starter tier may cold-start after inactivity. Allow ~30 seconds on first request.

---

## Scope — Implemented vs Deferred

### Fully Implemented
| Feature | Notes |
|---------|-------|
| Authentication (JWT, bcrypt, refresh tokens) | 15-min access / 7-day refresh, silent re-auth, session persistence |
| Document dashboard (list, create, open) | Role-filtered; creator becomes owner |
| Rich-text editor (Tiptap) | Headings, bold, italic, lists, code blocks, inline formatting |
| Auto-save with status indicator | Debounced PUT with version-conflict retry |
| Version history + restore | Snapshot-based revert; Yjs re-seeded via externalSyncToken |
| Sharing (invite by email, revoke, share-by-link) | Role-scoped invite links (72-hour JWT), role-rank downgrade guard |
| Role-based access control | Server-side enforcement on every route; viewer/commenter read-only banner |
| Export (PDF, DOCX, Markdown) | GET /api/documents/:id/export?format=... |
| Real-time CRDT collaboration | Yjs + y-websocket; character-level merge, offline resilience |
| Remote cursor awareness | Tiptap CollaborationCursor; distinct colour + name label per user |
| AI streaming (SSE) | Token-by-token; cancel mid-stream; error banner preserves partial output |
| AI features (5) | Rewrite, Summarize, Translate, Restructure, Continue |
| Suggestion UX | Original vs AI Suggestion compare card; Accept All, Partial Accept, Reject |
| Undo after AI accept | Yjs undo manager (y-prosemirror), Ctrl/Cmd-Z |
| AI interaction history | Per-document, last 8, shown in sidebar after each interaction |
| Per-user quota + admin settings | Daily token limit, org monthly budget, per-request cap, role toggles |
| Full test suite | 13 pytest, 6 Vitest component, 3 Playwright E2E (login → AI accept) |

### Intentionally Deferred / Out of Scope
| Feature | Reason |
|---------|--------|
| Google OAuth | Rubric says "JWT-based authentication"; OAuth adds operational complexity without rubric credit. Documented in DEVIATIONS.md §1. |
| Horizontal WebSocket scaling | Single-instance y-websocket sufficient for demo scale. Upgrade path: Hocuspocus + Redis. Documented in DEVIATIONS.md §5. |
| Email notification delivery | Planned in A1; deprioritised — no SMTP credentials available on Render free tier. |
| Full Yjs-native snapshot restore | Revert goes via REST PUT; brief CRDT convergence window acceptable for demo scale. Documented in DEVIATIONS.md §7. |
| Runtime prompt config file | Prompts are in `ai/prompts.py` module, not a hot-reloadable config file. Documented in DEVIATIONS.md §8. |

See [`DEVIATIONS.md`](DEVIATIONS.md) for the full deviation report (what changed from A1 design, why, and whether each is an improvement or compromise).

---

## Demo Script (5 min)

This walkthrough matches the grading rubric's required sequence (Assignment 2 §5). Every step uses the live Render deployment above. Two browser sessions are needed — open `https://collab-editor-frontend.onrender.com` in a regular window and an incognito window side by side.

**0 · Warm the services (optional, ~30s before the clock).** Hit `https://collab-editor-backend-ghfl.onrender.com/health` and `https://collab-editor-collab.onrender.com/health` in a tab to kick the free-tier instances out of cold start. The demo flow assumes warm services.

**1 · Auth & protected routes (~30s).** Open the frontend. Click *Register*, enter a fresh email + name + password. Submit. Show the editor loaded. Refresh the page — the Zustand-persisted tokens silently re-authenticate (no re-login prompt). Open DevTools → Network → inspect any `/api` call to show the `Authorization: Bearer <access>` header and the 15-minute `expiresIn`.

**2 · Document create + rich-text + auto-save (~60s).** From the dashboard, click *New Document*. Title it "AI Demo". In the Tiptap editor type a heading, bold, italic, a bullet list, and a code block. The toolbar shows "Saving…" → "Saved" as the debounced auto-save fires (`PUT /api/documents/:id`). Call out the version bump in the Network tab.

**3 · Sharing + role enforcement (~45s).** Open the *Share* panel. Invite the second session's email as `viewer`. In the incognito window log in as that second user, open the shared doc, and show the prominent "view-only" banner. Try to type — the editor refuses keystrokes. To prove this is server-side and not UI-only, `curl -X PUT` the document endpoint with the viewer's bearer → backend returns `403 INSUFFICIENT_PERMISSION`.

**4 · Real-time collab + remote cursors (~45s).** Promote the second user to `editor`. Both windows now show the same doc side-by-side. Type in window A — characters stream to window B within ~200 ms (Yjs + y-websocket CRDT). Toggle to window B and move the cursor — window A renders a coloured caret plus the name label (Yjs Awareness, `CollaborationCursor` extension). This is the +2 cursor bonus.

**5 · AI streaming, compare, accept, undo (~60s).** In window A, select a paragraph, open the AI Assistant sidebar. Choose **Rewrite** → watch tokens stream token-by-token into the "AI Suggestion" column of the new compare-card (§ TM1). Hit *Cancel* mid-stream to show abort works (backend `POST /api/ai/cancel/<id>`). Run rewrite again, let it finish, show the Original | AI Suggestion side-by-side, hit *Accept in Editor* → the change lands in the live doc. Press **Ctrl/Cmd-Z** → the Yjs undo manager (via `y-prosemirror` + Tiptap's Collaboration extension) reverts the accept cleanly (§ TM2). Then select another sentence, pick **Translate**, target language French, show the second AI feature streaming.

**6 · Version history restore (~30s).** Open the Versions panel (`GET /api/documents/:id/versions`). Pick the snapshot taken before step 5's rewrites. Click *Restore* (`POST /api/documents/:id/revert/:version_id`). The editor content rolls back in both windows simultaneously — Yjs re-syncs from the restored snapshot.

**7 · Failure mode (~15s, optional).** In window A, click *Rewrite* while the backend is deliberately offline (or trigger the mocked mid-stream error path covered by `frontend/tests/e2e/ai-error.spec.ts`). The red banner shows a friendly "AI is temporarily unavailable" message and the partial streamed output is preserved with a `[stream interrupted]` indicator (§ TM3, matches Assignment §3.2).

### Demo assets
- Backup recording: see `temiko_materials/` (local) or `docs/submission/video-script.md`.
- Preview credentials for a quick run without registration: `atharv.dev@local` / `atharv-preview-pass` (seeded at backend startup; override via `DEV_BOOTSTRAP_EMAIL` / `DEV_BOOTSTRAP_PASSWORD`).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript 5, Vite 5, Tiptap 2 (rich text), Zustand (state), TanStack Query, Yjs + y-websocket (CRDT sync) |
| **Backend API** | Python 3.12, FastAPI, SQLAlchemy 2 + asyncpg, PyJWT, bcrypt, SSE-Starlette (streaming) |
| **AI Provider** | Groq — Llama 3.3 70B (primary) with Llama 3.1 8B (fallback) |
| **Collab Server** | Node.js 20, y-websocket, Yjs, PostgreSQL persistence, JWT auth |
| **Database** | PostgreSQL 16 |
| **Infrastructure** | Render (Blueprint), GitHub Actions CI |
| **Testing** | pytest (backend), Playwright (e2e), ESLint + Prettier (frontend) |

---

## Architecture

```
┌─────────────┐       HTTPS        ┌──────────────────┐       SQL        ┌──────────────┐
│   React SPA │ ◄──────────────── ►│  FastAPI Backend  │ ◄──────────── ►│ PostgreSQL 16│
│  (Tiptap)   │                    │  (REST + SSE)     │                 │              │
└──────┬──────┘                    └────────┬──────────┘                 └──────┬───────┘
       │                                    │                                   │
       │  WebSocket (Yjs)                   │  Groq API                         │
       │                                    ▼                                   │
       │                           ┌────────────────┐                           │
       └─────────────────────── ►  │  Collab Server  │ ◄───────────────────────┘
                                   │  (y-websocket)  │
                                   └─────────────────┘
```

- **Frontend** — React SPA served via Render CDN. Tiptap editor with collaborative extensions powered by Yjs.
- **Backend API** — FastAPI handling auth, document CRUD, permissions, versioning, and AI orchestration. AI responses stream to the client via Server-Sent Events.
- **Collab Server** — Node.js y-websocket server that brokers real-time document sync between connected clients and persists Yjs snapshots to PostgreSQL.
- **Database** — PostgreSQL 16 storing users, documents, permissions, version history, AI interaction logs, and org-level AI settings.

For the full C4 model and architectural decision records see [`docs/master_contract/`](docs/master_contract/).

---

## Features

### Real-Time Collaboration
- Simultaneous multi-user editing via Yjs CRDT over WebSocket
- Live cursor positions and selections with user-distinct colors
- Deterministic conflict resolution — no data loss on concurrent edits
- Offline resilience with bidirectional sync on reconnect
- Snapshot persistence to PostgreSQL

### AI Writing Assistant
- **Actions:** Rewrite, Summarize, Translate, Restructure, Continue
- Streamed responses via SSE with cancel support
- Side-by-side Original | AI Suggestion compare card
- Accept all, **partial accept** (select text in the suggestion → "Apply Selection"), or reject
- Undo after AI accept (Yjs undo manager, Ctrl/Cmd-Z)
- Per-user daily token limits, org-level monthly budgets, per-request caps
- Interaction history with 90-day auto-purge, user-deletable

### Document Management
- Full CRUD with soft deletion (30-day recovery window)
- Version history with non-destructive rollback
- Export to PDF, DOCX, and Markdown
- **Share by link** — generate a role-specific invite URL (72-hour expiry); recipients click to join instantly
- Share by email with role assignment and revocation

### Authentication & Authorization
- JWT-based auth (15-min access tokens, 7-day refresh tokens)
- Role-based access control: **Owner**, **Editor**, **Commenter**, **Viewer**
- Automatic token refresh with session persistence
- Admin API for org-level AI feature toggles and quota configuration

---

## API Reference

<details>
<summary><strong>Auth</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Log in, receive tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/users/me` | Current user profile |

</details>

<details>
<summary><strong>Documents</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List user's documents |
| POST | `/api/documents` | Create document |
| GET | `/api/documents/:id` | Get document |
| PUT | `/api/documents/:id` | Full update |
| PATCH | `/api/documents/:id` | Partial update |
| DELETE | `/api/documents/:id` | Soft delete |
| POST | `/api/documents/:id/restore` | Restore deleted document |
| POST | `/api/documents/:id/snapshot` | Create snapshot |
| GET | `/api/documents/:id/versions` | List version history |
| POST | `/api/documents/:id/revert/:version_id` | Revert to version |
| GET | `/api/documents/:id/export` | Export (PDF/DOCX/MD) |

</details>

<details>
<summary><strong>Permissions</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents/:id/permissions` | List document permissions |
| POST | `/api/documents/:id/permissions` | Share with a user (by email) |
| PATCH | `/api/documents/:id/permissions/:user_id` | Update role |
| DELETE | `/api/documents/:id/permissions/:user_id` | Revoke access |
| POST | `/api/documents/:id/share-link` | Generate share link token (owner only) |
| POST | `/api/share/accept` | Accept a share link — adds caller to the document |

</details>

<details>
<summary><strong>AI</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/rewrite` | Rewrite selected text (SSE) |
| POST | `/api/ai/summarize` | Summarize text (SSE) |
| POST | `/api/ai/translate` | Translate text (SSE) |
| POST | `/api/ai/restructure` | Restructure content (SSE) |
| POST | `/api/ai/continue` | Generate continuation (SSE) |
| POST | `/api/ai/cancel/:suggestion_id` | Cancel in-flight request |
| POST | `/api/ai/feedback` | Submit accept/reject feedback |
| GET | `/api/ai/history` | Interaction history |
| DELETE | `/api/ai/history/:interaction_id` | Delete history entry |

</details>

<details>
<summary><strong>Admin & Realtime</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/ai-settings` | Get org AI settings |
| PATCH | `/api/admin/ai-settings` | Update feature toggles & quotas |
| POST | `/api/realtime/session` | Bootstrap WebSocket session |
| GET | `/health` | Backend health check |

</details>

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker (for PostgreSQL) or a local PostgreSQL 16 instance

### 1. Environment

```bash
cp .env.example .env
```

Fill in at minimum:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/collab_editor
JWT_SECRET=<strong-random-secret>
GROQ_API_KEY=<your-groq-key>
COLLAB_SYSTEM_USER_ID=00000000-0000-0000-0000-000000000001
COLLAB_WS_URL=ws://127.0.0.1:1234
```

### 2. Database

```bash
# Start PostgreSQL
docker run --name collab-editor-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=collab_editor \
  -p 5432:5432 \
  -d postgres:16

# Apply schema
docker exec -i collab-editor-db psql -U postgres -d collab_editor < infra/init.sql

# Insert system user
docker exec -it collab-editor-db psql -U postgres -d collab_editor -c \
"INSERT INTO users (id, email, hashed_password, name) VALUES
 ('00000000-0000-0000-0000-000000000001', 'system@internal', 'n/a', 'System')
 ON CONFLICT (email) DO NOTHING;"
```

### 3. Install dependencies

```bash
# Frontend
cd frontend && npm ci && cd ..

# Collab server
cd backend/collab && npm ci && cd ../..

# Backend
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && cd ..
```

### 4. Run

Open three terminals:

**Backend API**
```bash
cd backend && . .venv/bin/activate
uvicorn api.main:app --host 127.0.0.1 --port 4000
```

**Collab Server**
```bash
cd backend/collab
npm run dev
```

> Leaving `DATABASE_URL` unset for the collab server starts it in ephemeral mode — live sync works but snapshot persistence is disabled.

**Frontend**
```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:4000/api \
VITE_ENABLE_MOCK_API=false \
VITE_DEV_AUTOLOGIN=true \
npm run dev -- --host 127.0.0.1
```

### Preview credentials

The backend seeds a dev account on startup:

```
email:    atharv.dev@local
password: atharv-preview-pass
```

Override via `DEV_BOOTSTRAP_EMAIL` / `DEV_BOOTSTRAP_PASSWORD` in `.env`.

---

## Testing

```bash
# Backend unit tests
cd backend && . .venv/bin/activate && pytest -q

# Frontend lint + build
cd frontend && npm run lint && npm run build

# End-to-end (Playwright)
cd frontend && npx playwright install --with-deps chromium && npm run test:e2e
```

CI runs all of the above on every push and pull request via [GitHub Actions](.github/workflows/ci.yml).

---

## Deployment (Render)

The repo ships a [`infra/render.yaml`](infra/render.yaml) Blueprint that provisions all four services in a single click:

| Service | Type | Runtime |
|---------|------|---------|
| `collab-editor-frontend` | Static site | Vite build → Render CDN |
| `collab-editor-backend` | Web service | Python / Uvicorn |
| `collab-editor-collab` | Web service | Node.js |
| `collab-editor-db` | Managed DB | PostgreSQL 16 |

After creating the Blueprint:
1. Set `GROQ_API_KEY` on the backend service in the Render dashboard.
2. Insert the system user UUID into the provisioned database.
3. Verify CORS origins and WebSocket URLs match the actual Render service names.

---

## Project Structure

```
.
├── backend/
│   ├── api/              # FastAPI app (auth, documents, AI, admin)
│   ├── ai/               # Groq client, prompts, quota, service
│   ├── collab/           # y-websocket Node.js collaboration server
│   ├── tests/            # pytest backend tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios clients (auth, documents, realtime)
│   │   ├── components/   # React components (editor, AI sidebar, auth)
│   │   ├── hooks/        # Custom hooks (useAuth, useAI, useDocument)
│   │   ├── stores/       # Zustand state management
│   │   ├── extensions/   # Tiptap collaborative extensions
│   │   └── types/        # TypeScript type definitions
│   ├── tests/            # Playwright e2e tests
│   └── package.json
├── infra/
│   ├── render.yaml       # Render Blueprint (all services)
│   └── init.sql          # PostgreSQL schema DDL
├── docs/
│   ├── brief.md          # Assignment specification
│   ├── master_contract/  # Requirements report, C4 diagrams, ERD
│   └── submission/       # ADRs, risk register, milestones, traceability
├── .github/workflows/
│   └── ci.yml            # GitHub Actions CI pipeline
└── .env.example          # Environment variable template
```

---

## License

Academic project — MBZUAI Software Engineering (AI1220), Spring 2026.
