# Requirements: Frontend Reliability Milestone

**Defined:** 2026-03-20  
**Scope:** Make the existing React proof of concept correct, testable, and ready for backend integration.

## Active Requirements

- [x] **FE-01**: The app loads a document into the editor from the API layer exposed by `client/src/api/documentAPI.ts`
- [x] **FE-02**: Text selection captures exact `start`, `end`, and `text` metadata instead of relying on substring lookup
- [x] **FE-03**: AI rewrite requests submit the selected text together with the current `versionId`
- [x] **FE-04**: Applying a rewrite replaces the selected range only, even when the same text appears elsewhere in the document
- [x] **FE-05**: After a successful save, the client syncs the entire returned document payload so `versionId` stays correct
- [x] **FE-06**: Version conflicts block apply and surface a visible warning banner
- [x] **FE-07**: Error banners are dismissible for both AI failures and document-load failures
- [x] **FE-08**: Mock API routing is controlled by an explicit environment variable rather than a guessed localhost rule
- [x] **TEST-01**: Automated tests cover the happy path, conflict blocking, and dismissible load-error behavior
- [x] **TOOL-01**: Lint, test, and build commands run successfully from `client/package.json`

## Deferred Requirements

- [ ] **BE-01**: Implement a real backend for the existing API contract
- [ ] **AI-STREAM-01**: Replace request/response AI calls with streaming output and cancellation
- [ ] **RTE-01**: Replace `<textarea>` with a rich-text editor and tracked-change suggestion UX
- [ ] **COLLAB-01**: Add real-time collaboration and persistence

## Traceability

| Requirement | Primary Files | Status |
|-------------|---------------|--------|
| FE-01 | `client/src/hooks/useDocument.ts`, `client/src/api/documentAPI.ts` | Complete |
| FE-02 | `client/src/components/TextAreaEditor.tsx`, `client/src/types/document.ts` | Complete |
| FE-03 | `client/src/hooks/useAI.ts`, `client/src/App.tsx` | Complete |
| FE-04 | `client/src/App.tsx` | Complete |
| FE-05 | `client/src/hooks/useDocument.ts`, `client/src/App.tsx` | Complete |
| FE-06 | `client/src/hooks/useVersionConflict.ts`, `client/src/components/ConflictWarningBanner.tsx` | Complete |
| FE-07 | `client/src/components/ErrorBanner.tsx`, `client/src/App.tsx` | Complete |
| FE-08 | `client/.env.example`, `client/src/api/documentAPI.ts` | Complete |
| TEST-01 | `client/src/App.test.tsx`, `client/src/test/setup.ts`, `client/vite.config.ts` | Complete |
| TOOL-01 | `client/package.json` | Complete |

---
*Last updated: 2026-03-20 after milestone verification*
