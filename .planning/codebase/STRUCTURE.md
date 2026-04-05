# Structure

## Top Level

- `client/` — only runnable application code
- `docs/` — assignment brief and broader architecture/contract material
- `.planning/` — repaired GSD workspace for the actual repo

## Frontend Layout

- `client/index.html` — Vite entry HTML
- `client/src/main.tsx` — React bootstrap
- `client/src/App.tsx` — main container and workflow orchestration
- `client/src/components/` — presentational components with matching CSS files
- `client/src/hooks/` — stateful workflow hooks
- `client/src/api/` — real contract wrapper + mock implementation
- `client/src/types/` — shared frontend types
- `client/src/test/` — Vitest setup
- `client/src/__tests__/testingChecklist.ts` — manual checklist artifact

## Naming Patterns

- Components use `PascalCase.tsx`
- Hooks use `useX.ts`
- CSS files mirror component names
- Shared data contracts live in `client/src/types/document.ts`

## Missing Expected Directories

The docs reference several locations that are not present:

- `server/`
- `shared/`
- deployment/infrastructure directories

## Documentation Hotspots

- `client/README.md`
- `client/frontend_testing.md`
- `README.md`
- `.planning/codebase/*.md`
