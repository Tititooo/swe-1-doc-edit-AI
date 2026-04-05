# Roadmap: Frontend Reliability Milestone

## Overview

The original roadmap in this repository described a future full-stack system that does not yet exist on disk. This repaired roadmap tracks the real milestone completed in the current repo: stabilizing the React proof of concept so the document-loading, selection, AI rewrite, conflict handling, and verification flows are trustworthy.

## Phases

- [x] **Phase 1: Runtime Configuration** - Make mock-vs-real API routing explicit and ensure local scripts run reliably
- [x] **Phase 2: Editor Correctness** - Preserve exact selections, apply rewrites to the intended range, and sync returned versions
- [x] **Phase 3: Error and Conflict UX** - Keep conflict prevention intact and make error dismissal behave consistently
- [x] **Phase 4: Verification** - Add automated tests and record the repaired codebase map

## Phase Details

### Phase 1: Runtime Configuration
**Goal**: Developers can switch between mock mode and a future backend without changing source code, and the package scripts work reliably in the current shell environment.
**Requirements**: FE-01, FE-08, TOOL-01
**Completed Work**:
- [x] `client/.env.example` documents `VITE_ENABLE_MOCK_API`
- [x] `client/src/api/documentAPI.ts` uses explicit mock-mode configuration
- [x] `client/package.json` runs lint, test, and build via direct local tool paths

### Phase 2: Editor Correctness
**Goal**: The app rewrites the user-selected text range precisely and keeps local state consistent with the API response.
**Requirements**: FE-02, FE-03, FE-04, FE-05
**Completed Work**:
- [x] `client/src/types/document.ts` defines `TextSelection`
- [x] `client/src/components/TextAreaEditor.tsx` emits exact selection metadata
- [x] `client/src/App.tsx` applies rewrites by range, not substring lookup
- [x] `client/src/hooks/useDocument.ts` syncs the full server document after updates

### Phase 3: Error and Conflict UX
**Goal**: Users can recover from load failures and version conflicts without getting stuck in stale UI state.
**Requirements**: FE-06, FE-07
**Completed Work**:
- [x] `client/src/components/ErrorBanner.tsx` remains auto-dismissing and manually dismissible
- [x] `client/src/App.tsx` clears document and AI errors cleanly
- [x] `client/src/components/ConflictWarningBanner.tsx` exposes a clear dismiss control

### Phase 4: Verification
**Goal**: The critical user paths are enforced by automated checks and captured in the codebase map for future backend work.
**Requirements**: TEST-01, TOOL-01
**Completed Work**:
- [x] `client/src/App.test.tsx` covers the happy path, conflict path, and load-error dismissal
- [x] `client/src/test/setup.ts` wires Testing Library matchers
- [x] `client/vite.config.ts` configures jsdom-based Vitest execution
- [x] `.planning/codebase/*.md` documents the actual frontend-only architecture

## Progress

| Phase | Status | Verification |
|-------|--------|--------------|
| 1. Runtime Configuration | Complete | `npm run lint`, `npm run build` |
| 2. Editor Correctness | Complete | `npm run test:run` |
| 3. Error and Conflict UX | Complete | `npm run test:run` |
| 4. Verification | Complete | `npm run lint`, `npm run test:run`, `npm run build` |

**Milestone Completion:** 100%

## Next Milestone Candidates

- Implement the real backend behind the existing REST contract
- Replace the textarea with a rich-text editor
- Introduce streaming AI behavior and cancellation

---
*Last updated: 2026-03-20 after milestone completion*
