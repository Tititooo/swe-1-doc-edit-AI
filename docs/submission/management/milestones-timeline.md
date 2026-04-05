# Milestones and Timeline

This timeline turns the draft sprint plan into dated milestones. Because the course brief does not state an exact final submission date, this plan assumes a ten-week delivery window from **April 6, 2026** through **June 12, 2026**. If the semester ends earlier, Sprint 4 and Sprint 5 should be compressed rather than reordering dependencies.

## Delivery Timeline

| Sprint | Dates | Milestone | Scope Focus | Acceptance Criteria | Primary Owners |
| --- | --- | --- | --- | --- | --- |
| S1 | Apr 6, 2026 to Apr 17, 2026 | Foundation and PoC skeleton | Repository baseline, local setup, document CRUD path, shared contracts | React editor page loads locally; `POST /api/documents` and `GET /api/documents/:id` return the contract-defined JSON shape; PostgreSQL schema applies cleanly; README gives clone-to-run steps; at least one integration test covers create plus fetch | Atharv, Tanisha, Teya |
| S2 | Apr 20, 2026 to May 1, 2026 | Core collaboration | Yjs editor integration, presence awareness, reconnect flow, auth guards on document endpoints | Two browser sessions can edit the same document with visible cursor presence; p95 keystroke propagation stays within 300 ms in local test runs; reconnect preserves local edits; JWT auth is enforced on document routes; collaboration smoke test passes | Tanisha, Teya, Atharv |
| S3 | May 4, 2026 to May 15, 2026 | AI assistant vertical slice | Rewrite and summarize flows, SSE streaming, quota enforcement, AI logging | User can select text and receive a streamed AI suggestion; accept and reject paths work; AI usage is logged in `ai_interactions`; quota exhaustion returns `429 AI_QUOTA_EXCEEDED`; mock and live AI modes both run | Temiko, Tanisha, Atharv |
| S4 | May 18, 2026 to May 29, 2026 | Document lifecycle and governance | Sharing, RBAC, version history, revert, export, org AI policy controls | Owner can share with editor/commenter/viewer roles; unauthorized actions return the correct `403` error; version history lists snapshots and revert creates a new version row; export works for Markdown and one binary format; org admin settings change AI availability on the next request | Atharv, Tanisha, Temiko |
| S5 | Jun 1, 2026 to Jun 12, 2026 | Hardening and submission | Test stabilization, documentation, demo, risk burn-down | Integration suite passes in CI; critical risks are either mitigated or have explicit contingency coverage; report PDF is assembled with rendered diagrams plus editable Mermaid sources; demo recording shows frontend to backend communication and at least one advanced flow | Entire team |

## Milestone Exit Criteria

| Milestone | Required Evidence |
| --- | --- |
| Foundation and PoC skeleton | Running local demo, contract-matching request and response payloads, setup instructions checked by a second teammate |
| Core collaboration | Two-client demo, cursor presence screenshot, reconnect test case, latency measurement notes |
| AI assistant vertical slice | SSE streaming capture, logged AI interaction record, quota-exceeded error response, tracked-change accept/reject walkthrough |
| Document lifecycle and governance | Role-permission test matrix, version revert demo, export artifact, admin policy toggle verification |
| Hardening and submission | Clean final docs, rendered diagram exports, CI evidence, 3-minute demo recording, final issue board review |

## Dependency Logic

- S1 must finish before any later milestone because the API contract and PoC schema shape the rest of the implementation.
- S2 depends on the document model and route contracts from S1; collaboration without a stable document identity model is wasted effort.
- S3 depends on S1 and S2 because AI suggestions are applied inside the editor and must respect the same document and session model.
- S4 depends on S3 for policy-aware AI access and on S2 for version-aware collaboration behavior.
- S5 is reserved for stabilization; new scope should not enter once S5 begins unless it closes a release-blocking defect.

## Weekly Coordination Rhythm

| Activity | Day | Purpose |
| --- | --- | --- |
| Sprint planning | Monday of week 1 | Lock milestone scope, owners, and risk focus |
| Async standups | Daily | Surface blockers and keep cross-owner visibility |
| Mid-sprint checkpoint | Thursday of week 1 | Check whether milestone acceptance is still realistic |
| Review and retro | Friday of week 2 | Validate acceptance criteria and carry forward unresolved risks |
