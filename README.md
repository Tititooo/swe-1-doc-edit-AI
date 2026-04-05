# Collaborative Document Editor with AI Writing Assistant

A real-time collaborative document editing platform with an integrated AI writing assistant — built as part of the Software Engineering course (AI1220) at MBZUAI, Spring 2026. Think simplified Google Docs with embedded LLM-powered features: multiple users edit the same document simultaneously, see each other's cursors in real time, and invoke an AI assistant that can rewrite, summarize, translate, or restructure selected text.

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

| Service | Health Check |
|---------|-------------|
| Collab WebSocket Server | https://collab-editor-collab.onrender.com/health |
| FastAPI Backend | https://collab-editor-backend-ghfl.onrender.com/health |

> Services on the Render free/starter tier may cold-start after inactivity. Allow ~30 seconds on first request.

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
- Inline tracked-change proposals (strikethrough + highlight) — accept, reject, or partial-accept
- Per-user daily token limits, org-level monthly budgets, per-request caps
- Interaction history with 90-day auto-purge, user-deletable

### Document Management
- Full CRUD with soft deletion (30-day recovery window)
- Version history with non-destructive rollback
- Export to PDF, DOCX, and Markdown
- Granular sharing permissions

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
| POST | `/api/documents/:id/permissions` | Share with a user |
| PATCH | `/api/documents/:id/permissions/:user_id` | Update role |
| DELETE | `/api/documents/:id/permissions/:user_id` | Revoke access |

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
