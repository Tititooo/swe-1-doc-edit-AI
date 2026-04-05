# Integrations

## Active Integration Surface

The frontend integrates with a document/AI HTTP contract defined in `client/src/api/documentAPI.ts`:

- `GET /document`
- `PUT /document`
- `POST /ai/rewrite`
- `GET /document/version`

## Development Mock

`client/src/api/mockAPI.ts` simulates:

- document fetch
- document update with version increments
- rewrite generation
- version checks

Mock mode is selected explicitly through `VITE_ENABLE_MOCK_API` in `client/src/api/documentAPI.ts`.

## Expected Backend Inputs

The client expects a `Document` payload shaped like `client/src/types/document.ts`:

- `id`
- `content`
- `versionId`
- `lastModified`
- optional `title`

Rewrite requests use:

- `selectedText`
- `versionId`

## Environment Variables

- `client/.env.example`
  - `VITE_API_BASE_URL=http://localhost:4000/api`
  - `VITE_ENABLE_MOCK_API=true`

## Missing External Systems

These are referenced by docs but absent from the repo:

- Authentication provider or JWT flow
- Database or persistence layer
- LLM provider integration (Groq/OpenAI/etc.)
- SSE streaming transport
- Render deployment assets

## Risk Notes

- The API contract is frontend-owned right now; no server implementation in this repo validates it.
- Mock mode can hide integration drift until a real backend is introduced.
