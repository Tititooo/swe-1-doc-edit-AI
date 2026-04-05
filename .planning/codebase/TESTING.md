# Testing

## Automated Tests

- `client/src/App.test.tsx`
  - verifies rewrite apply uses the selected range
  - verifies returned `versionId` is adopted for later writes
  - verifies conflict detection blocks stale applies
  - verifies load errors can be dismissed

- `client/src/test/setup.ts`
  - installs `@testing-library/jest-dom` matchers

## Manual Test Artifacts

- `client/src/__tests__/testingChecklist.ts`
- `client/frontend_testing.md`

These remain useful as QA references, but they are not substitutes for automated tests.

## Verification Commands

- `cd client && npm test`
- `cd client && npm run build`
- `cd client && npm run lint`

## Current Gaps

- No backend contract tests against a real server
- No end-to-end browser automation
- No visual regression tests
- No coverage reporting threshold
- No tests around environment-variable permutations or mock-mode switching

## Practical Recommendation

If a real backend is added, the next test layer should validate `client/src/api/documentAPI.ts` against actual HTTP responses before expanding the UI surface further.
