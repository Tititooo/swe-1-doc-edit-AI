# Conventions

## Component / Hook Separation

- UI components are mostly dumb and receive state/handlers via props:
  - `client/src/components/LoadDocumentButton.tsx`
  - `client/src/components/TextAreaEditor.tsx`
  - `client/src/components/AISidebar.tsx`
- Stateful logic is kept in hooks:
  - `client/src/hooks/useDocument.ts`
  - `client/src/hooks/useAI.ts`
  - `client/src/hooks/useVersionConflict.ts`

## TypeScript Patterns

- Shared frontend contracts are centralized in `client/src/types/document.ts`
- Hooks expose explicit return interfaces instead of relying on inference alone
- `useCallback` is used for async handlers that cross component boundaries

## Styling

- Each component imports a sibling CSS file
- App-level and global styles live in `client/src/App.css` and `client/src/styles/index.css`
- Styling is plain CSS rather than CSS modules, Tailwind, or CSS-in-JS

## Error Handling

- API wrappers normalize failures into `APIError` objects in `client/src/api/documentAPI.ts`
- UI error presentation is centralized through `client/src/components/ErrorBanner.tsx`
- Conflict-specific failures are handled separately via `client/src/hooks/useVersionConflict.ts`

## API Boundary

- `client/src/api/documentAPI.ts` is the only place that knows about HTTP routes
- `client/src/api/mockAPI.ts` mirrors the same contract for development mode

## Inconsistencies

- Root docs still describe a larger system than the codebase implements
- `client/src/__tests__/testingChecklist.ts` is a checklist artifact, not a runnable test suite
- Mock-mode switching now uses an explicit `VITE_ENABLE_MOCK_API` flag, which should stay documented anywhere setup instructions are updated
