# Collaborative Document Editor with AI Writing Assistant

This branch adds Temiko's first working backend delivery on top of `origin/main`:

- a new `FastAPI` backend under `backend/api/`
- a `Groq`-powered AI service under `backend/ai/`
- compatibility routes for the current React frontend
- early SSE AI endpoints for the final contract
- fixes for the upstream collab-server bug and Render frontend path

## Repo Layout

```text
.
├── backend/
│   ├── api/        # FastAPI compatibility backend
│   ├── ai/         # Groq prompts and client/service layer
│   └── collab/     # y-websocket collaboration server
├── client/         # React frontend
├── infra/          # schema + Render blueprint
└── .env.example    # local backend/collab env template
```

## What Works In This Branch

- `GET /api/document`
- `PUT /api/document`
- `GET /api/document/version`
- `POST /api/ai/rewrite`
  - JSON compatibility mode for the current frontend
  - SSE streaming mode for the future contract
- `POST /api/ai/summarize`
- `POST /api/ai/translate`
- `POST /api/ai/restructure`
- `POST /api/ai/cancel/:suggestion_id`

The current frontend can now:

- rewrite text with style presets
- summarize
- translate
- restructure with notes/comments
- continue writing from the end of the document

## Local Setup

### 1. Create the backend env

```bash
cp .env.example .env
```

Fill in at least:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/collab_editor
JWT_SECRET=<strong-random-secret>
GROQ_API_KEY=<your-groq-key>
COLLAB_SYSTEM_USER_ID=<uuid-from-users-table>
```

### 2. Start PostgreSQL 16

```bash
docker run --name collab-editor-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=collab_editor \
  -p 5432:5432 \
  -d postgres:16
```

Apply the schema:

```bash
docker exec -i collab-editor-db psql -U postgres -d collab_editor < infra/init.sql
```

Insert the collab system user:

```bash
docker exec -it collab-editor-db psql -U postgres -d collab_editor -c \
"INSERT INTO users (email, hashed_password, name) VALUES ('system@internal', 'n/a', 'System') RETURNING id;"
```

Copy that UUID into `COLLAB_SYSTEM_USER_ID` in `.env`.

### 3. Install dependencies

Frontend:

```bash
cd client
npm ci
cd ..
```

Collab:

```bash
cd backend/collab
npm ci
cd ../..
```

Backend:

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 4. Run the services

FastAPI:

```bash
. backend/.venv/bin/activate
cd backend
uvicorn api.main:app --host 127.0.0.1 --port 4000
```

Collab server:

```bash
cd backend/collab
npm run dev
```

Frontend against the real API:

```bash
cd client
VITE_API_BASE_URL=http://127.0.0.1:4000/api \
VITE_ENABLE_MOCK_API=false \
npm run dev -- --host 127.0.0.1
```

## Verification

Backend tests:

```bash
. backend/.venv/bin/activate
cd backend
pytest -q
```

Frontend build:

```bash
cd client
npm run build
```

Useful live checks:

```bash
curl http://127.0.0.1:4000/health

curl -X POST http://127.0.0.1:4000/api/ai/rewrite \
  -H 'Content-Type: application/json' \
  -d '{"selectedText":"The quick brown fox jumps over the lazy dog.","versionId":1}'
```

## Notes

- This branch keeps the current frontend working first.
- The backend document store is intentionally compatibility-first and in-memory for now.
- The collab server and DB schema are already upstream, but the full auth/document/Yjs integration is still pending.
- `infra/render.yaml` now points the frontend service at `client/` instead of the nonexistent `frontend/`.
