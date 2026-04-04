# Collaborative Document Editor with AI Writing Assistant

This branch is the stacked PR3 hardening pass on top of the earlier FastAPI + Groq delivery.

## What Works

- FastAPI backend under `backend/api`
- Groq AI service under `backend/ai`
- Auth routes:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `GET /api/users/me`
- Compatibility document routes:
  - `GET /api/document`
  - `PUT /api/document`
  - `GET /api/document/version`
- AI routes:
  - `POST /api/ai/rewrite`
  - `POST /api/ai/summarize`
  - `POST /api/ai/translate`
  - `POST /api/ai/restructure`
  - `POST /api/ai/continue`
  - `POST /api/ai/cancel/:suggestion_id`
  - `POST /api/ai/feedback`
  - `GET /api/ai/history`
- Frontend auth bootstrap, token refresh, streaming AI, cancel, feedback, and history

## Preview Credentials

When auth is enabled, the backend seeds a preview account:

```text
email: temiko.dev@local
password: temiko-preview-pass
```

Override `DEV_BOOTSTRAP_EMAIL` and `DEV_BOOTSTRAP_PASSWORD` if you want different preview credentials.

## Local Setup

### 1. Backend env

```bash
cp .env.example .env
```

Fill in at least:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/collab_editor
JWT_SECRET=<strong-random-secret>
GROQ_API_KEY=<your-groq-key>
COLLAB_SYSTEM_USER_ID=00000000-0000-0000-0000-000000000001
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

Insert the fixed collab system user:

```bash
docker exec -it collab-editor-db psql -U postgres -d collab_editor -c \
"INSERT INTO users (id, email, hashed_password, name) VALUES ('00000000-0000-0000-0000-000000000001', 'system@internal', 'n/a', 'System') ON CONFLICT (email) DO NOTHING;"
```

### 3. Install dependencies

```bash
cd client && npm ci
cd ../backend/collab && npm ci
cd ../ && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cd ..
```

### 4. Run the services

Backend:

```bash
. backend/.venv/bin/activate
cd backend
uvicorn api.main:app --host 127.0.0.1 --port 4000
```

Collab:

```bash
cd backend/collab
npm run dev
```

Frontend:

```bash
cd client
VITE_API_BASE_URL=http://127.0.0.1:4000/api \
VITE_ENABLE_MOCK_API=false \
VITE_DEV_AUTOLOGIN=true \
npm run dev -- --host 127.0.0.1
```

With `VITE_DEV_AUTOLOGIN=false`, sign in with the preview credentials above.

## Verification

Backend:

```bash
cd backend
. .venv/bin/activate
pytest -q
```

Frontend:

```bash
cd client
npm run build
```

Useful live checks:

```bash
curl http://127.0.0.1:4000/health

curl -X POST http://127.0.0.1:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"temiko.dev@local","password":"temiko-preview-pass"}'
```

## Render Private Preview

`infra/render.yaml` is configured for an auth-enabled private preview on Render.

1. Create the Blueprint app from this branch.
2. Set `GROQ_API_KEY` on the backend service.
3. Keep `AI_REQUIRE_AUTH=true` for the deployed preview.
4. After Postgres is provisioned, insert the fixed collab system user UUID shown above.
5. Confirm the actual Render service URLs and update `CORS_ORIGINS`, `VITE_API_BASE_URL`, and `VITE_COLLAB_WS_URL` if Render renames any service.
6. Sign in with the seeded preview account, then verify document load, AI streaming, cancel, accept/reject, and history.

## Notes

- The backend document store is still compatibility-first and in-memory.
- The collab server is deployed in the target architecture, but the current frontend still uses the compatibility document flow rather than full Yjs editor syncing.
- This branch is suitable for a private preview, not a public beta.
