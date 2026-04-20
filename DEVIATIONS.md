# Architecture Deviations from Assignment 1 Design

This file documents every deliberate difference between the Assignment 1 design (commit `db02491`) and the final Assignment 2 implementation on `main`. Silent agreement between A1 and A2, or A2 elaboration on topics A1 left open, are not listed — only choices where A1 committed to one design and A2 ships a materially different one. Each entry cites the A1 section and the A2 file paths that back the claim.

---

## 1. In-Memory Dual-Mode Runtime (no mandatory PostgreSQL)

**A1 design:** The A1 C4 container diagram (`docs/master_contract/diagrams/c4-container.mmd`) and the report stack table (§1.1) list PostgreSQL as a mandatory container. The report's deployment narrative assumes Render's managed Postgres is always provisioned alongside the API.

**Implementation:** `AppRuntime` (`backend/api/runtime.py:60-100`) keeps parallel in-memory stores (`_memory_users_by_id`, `_memory_documents`, `_memory_permissions`, `_memory_ai_settings`) that mirror the PostgreSQL schema. The asyncpg pool is created only when `DATABASE_URL` is set; otherwise every REST route serves in-memory data. The collab server follows the same pattern: `backend/collab/persistence.js:17-38` computes `persistenceEnabled = Boolean(DATABASE_URL && SYSTEM_USER_ID)` and logs the mode at startup. Live Yjs sync still works when persistence is off; snapshotting is simply skipped.

**Why:** Playwright, `pytest`, and local smoke runs need a working backend without Docker or a managed Postgres. Dual-mode keeps the test surface identical to production while removing the external dependency from CI. The Render Blueprint (`infra/render.yaml`) still provisions real Postgres for deployment.

**Classification:** Improvement. Strictly additive — production still runs on Postgres — and materially improves CI reliability and local DX.

---

## 2. Version History: REST Text Projection Revert (not Yjs snapshot restore)

**A1 design:** A1 US-04 states revert is "applied as a Yjs update; collaborators see the reverted state with their in-flight edits merged on top." The A1 data model (`docs/master_contract/diagrams/erd.mmd`) stores binary Yjs state in `document_versions`, implying revert would replay that CRDT state.

**Implementation:** `POST /api/documents/:id/revert/:version_id` (`backend/api/main.py:418-435`) goes through `InMemoryDocumentStore.revert_document()` — the REST text projection path (`document_live_content` + `document_text_versions`), not the Yjs `document_versions` binary snapshot. The frontend re-seeds Tiptap via an `externalSyncToken` bump so connected peers resync from the new text.

**Why:** A true Yjs snapshot restore requires an admin-scoped API on the y-websocket server to rewrite `Y.Doc` state for every connected peer, plus careful handling of in-flight updates. That surface was out of budget for A2. The REST path reuses the same optimistic-concurrency machinery as `PUT /api/documents/:id` and is sufficient for the demo-scale concurrency target (≤5 peers).

**Classification:** Compromise. The restored document is correct, but collaborators briefly see a non-CRDT-merged replacement rather than a merged Yjs update.

---

## 3. AI Suggestion UX: Sidebar Compare Card (not inline tracked-change proposal)

**A1 design:** A1 FR-AI-01 / FR-AI-02 / FR-AI-03 and US-05 commit to AI output "rendered as an inline tracked-change proposal" with a "reviewable deletion and insertion diff inline" inside the Tiptap document, accepted or rejected in place.

**Implementation:** `frontend/src/components/AISidebar.tsx:149-196` renders a side-by-side "Compare" card (Original column vs. AI Suggestion column) in a right-hand panel. Acceptance is via an "Apply All" button (`AISidebar.tsx:253-262`) or an "Apply Selection" button that applies a user-highlighted sub-range of the suggestion text (`AISidebar.tsx:264-277`). There are no Tiptap decorations, no inline insertion/deletion marks, and no in-document accept/reject affordances.

**Why:** The A1 report body already hedged on this point, noting the PoC was "preview-first" and that the sidebar was the shipping surface. Building inline CRDT-aware diff marks on top of Tiptap + Yjs would require a custom Tiptap extension that produces proposal-state nodes which do not leak into the committed Y.Doc until accepted — a substantial piece of work that was cut from A2 scope. The sidebar still gives users partial-acceptance granularity via text selection.

**Classification:** Compromise. Partial acceptance is preserved, but the in-document tracked-change experience A1 committed to is not shipped.

---

## 4. Soft-Lock During AI Processing Not Enforced

**A1 design:** A1 FR-AI-07 and ADR-003 ("Soft-Lock During AI Processing") commit to locking the target paragraph for the duration of the AI call with a five-second timeout release, so a second editor cannot overwrite the region while the suggestion is streaming.

**Implementation:** No soft-lock is enforced in code. Neither the backend AI stream handler (`backend/api/main.py::stream_feature`) nor the Yjs collab server emits, tracks, or honours a per-paragraph lock. The Tiptap frontend has no awareness-level lock marker for in-flight AI targets. A concurrent editor can freely edit the paragraph that another user is rewriting.

**Why:** The A1 report itself acknowledges the gap ("The stricter soft-lock policy remains documented, but it is not yet enforced end to end in the current code"). Implementing it correctly requires propagating lock state through Yjs awareness and reconciling it with the AI stream lifecycle, including cancellation and timeout paths. That work was descoped for A2.

**Classification:** Compromise. A committed ADR-level decision that is not shipped. Documented rather than silently dropped.

---

## 5. Share-by-Link Added (was "Won't Have")

**A1 design:** A1 report §1.2 MoSCoW explicitly lists "link-based document sharing" under "Won't Have (this project)". A1 sharing was scoped to direct per-email permission grants only.

**Implementation:** `POST /api/documents/:id/share-link` and `POST /api/share/accept` (`backend/api/main.py:519-576`) mint and redeem stateless share-link JWTs (`backend/api/auth.py:96-127`, token `type: "share_link"`, 72-hour default TTL, `doc_id` and `role` encoded in the payload). The redemption endpoint upserts a `permissions` row for the caller at the encoded role. The frontend workspace header surfaces a "Copy share link" action.

**Why:** Link sharing is the dominant sharing idiom for document tools and was the shortest path to onboarding collaborators in demo sessions without round-tripping through an admin add-user flow. Stateless JWTs avoided adding a new persisted-invite table.

**Classification:** Improvement / scope expansion. Additive feature beyond the A1 commitment, gated by JWT signature and expiry.

---

## 6. AI Error Taxonomy: `AI_TIMEOUT` Collapsed into `AI_SERVICE_UNAVAILABLE`

**A1 design:** A1 report §2.2.3 Error Codes enumerates `AI_TIMEOUT` / HTTP 504 as a distinct row from `AI_SERVICE_UNAVAILABLE` / HTTP 503, signalling that client timeouts against the Groq upstream should surface a dedicated code.

**Implementation:** The backend emits only `AI_SERVICE_UNAVAILABLE` for both upstream failures and timeouts. `AI_TIMEOUT` is not produced anywhere in `backend/api/main.py` or `backend/ai/`. The frontend `src/api/client.ts` has no branch for `AI_TIMEOUT`.

**Why:** From the client's perspective, both conditions resolve to the same retry prompt; splitting them added error-taxonomy surface without changing user-visible behaviour. The remaining codes in A1 §2.2.3 (`TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `ACCOUNT_EXISTS`, `DOCUMENT_NOT_FOUND`, `INSUFFICIENT_PERMISSION`, `VERSION_CONFLICT`, `INVALID_REQUEST`, `AI_QUOTA_EXCEEDED`) are preserved.

**Classification:** Compromise. Minor — the contract is narrower than A1 specified, but no other error code was lost.

---

## 7. Soft-Delete Retention Gated by Restore Check (no scheduled purge)

**A1 design:** A1 FR-DM-05 commits to soft deletion where the document "is hidden from all document listings but retained in storage and remains recoverable for a period of 30 days before permanent removal." The commitment has two halves: a 30-day restore window, and permanent removal after that window.

**Implementation:** The 30-day window is enforced as a gate on the restore endpoint. `restore_document` (`backend/api/runtime.py:700-701` in-memory and `:719-720` Postgres) rejects restore when `now - deleted_at > 30 days`. There is no scheduled job, background task, or cron that actually deletes the row after 30 days — soft-deleted documents remain in the `documents` table indefinitely with `is_deleted = TRUE`.

**Why:** A scheduled purge requires a durable task runner (cron on the API node, or a separate worker), plus cascading cleanup of `document_versions`, `document_live_content`, `document_text_versions`, `permissions`, and `ai_interactions`. That infrastructure was descoped for A2; gating restore gives users the A1-visible behaviour (restore fails after 30 days) without the purge plumbing.

**Classification:** Compromise. The user-facing restore window matches A1, but the storage-lifecycle half of the commitment is not enforced.

---

## 8. PR Workflow as Evidence

Per the A1 feedback that "processes defined for version control should be followed and evidenced in the Git commit history", every A2 feature was delivered via a feature branch plus pull request with CI checks, not direct commits to `main`. Commit messages follow Conventional Commits. The PR history on GitHub is the primary audit trail.

---

*Last updated: April 2026 — Assignment 2 submission*
