# Stack

## Current Runtime

- **Frontend app:** React 18 + TypeScript 5 + Vite 5 in `client/`
- **HTTP client:** Axios in `client/src/api/documentAPI.ts`
- **Styling:** plain CSS by convention (`*.css` next to components plus `client/src/styles/index.css`)
- **Testing:** Vitest 4 + Testing Library + jsdom in `client/src/App.test.tsx`
- **Lint/format:** ESLint + Prettier from `client/.eslintrc.cjs` and `client/.prettierrc`

## Package Layout

- `client/package.json` defines the runnable app
- `client/package-lock.json` locks the dependency tree
- There is no root `package.json` driving a monorepo

## Tooling

- **Dev server:** `npm run dev`
- **Build:** `npm run build`
- **Tests:** `npm test`, `npm run test:watch`
- **Lint:** `npm run lint`

## Environment

- `client/.env.example`
  - `VITE_API_BASE_URL`
  - `VITE_ENABLE_MOCK_API`
- Vite env typing is declared in `client/src/vite-env.d.ts`

## Notable Mismatches

- `README.md`, `docs/contract.md`, and earlier `.planning/` drafts describe a broader FastAPI/Postgres/Render stack.
- The repository does **not** contain `server/`, `shared/`, `docker-compose.yml`, or `render.yaml`.
- The current runnable implementation is only the frontend slice under `client/`.

## Verification Snapshot

- `npm test` passes
- `npm run build` passes
- `npm run lint` passes
