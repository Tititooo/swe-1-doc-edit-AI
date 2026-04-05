# Architecture

## Current Shape

The app is a single React frontend with `client/src/App.tsx` as the orchestration layer.

## Data Flow

1. `client/src/App.tsx` coordinates state and renders the page shell.
2. `client/src/hooks/useDocument.ts` loads and stores the current document.
3. `client/src/components/TextAreaEditor.tsx` emits a `TextSelection` (`start`, `end`, `text`) when the user selects text.
4. `client/src/hooks/useAI.ts` sends the selected text to `requestAIRewrite`.
5. `client/src/components/AISidebar.tsx` displays the suggestion and triggers apply.
6. `client/src/hooks/useVersionConflict.ts` checks the latest version before apply.
7. `client/src/api/documentAPI.ts` sends the update and the returned `Document` is synced back into app state.

## State Ownership

- `useDocument`: document payload, content, version, load error
- `useAI`: AI response, AI loading state, AI error
- `useVersionConflict`: conflict flag + message
- `App.tsx`: current selection, local update error, update loading state

## UI Boundaries

- `client/src/components/LoadDocumentButton.tsx`
- `client/src/components/TextAreaEditor.tsx`
- `client/src/components/AISidebar.tsx`
- `client/src/components/ConflictWarningBanner.tsx`
- `client/src/components/ErrorBanner.tsx`

## Verification Boundary

- `client/src/App.test.tsx` is the current top-level integration test for the slice.

## Divergence From Earlier Plans

- No backend, no auth, no persistence, no SSE streaming, no collaboration server
- The code on disk is a frontend vertical slice, not a monorepo service architecture
