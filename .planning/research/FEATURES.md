# Feature Research

**Domain:** Collaborative Document Editor with AI Writing Assistant
**Researched:** 2026-03-20
**Confidence:** HIGH (grounded in contract.md FR requirements + competitive landscape verification)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Rich text editing | Any document tool needs formatting (bold, italic, headings, lists) | LOW | Tiptap 2 covers this; ProseMirror schema handles standard marks/nodes |
| Document create / list / open | Users need a document library to land on; a bare editor with no home screen feels like a prototype | LOW | Minimal CRUD — FR-DM-01. POST /api/documents, GET /api/documents, GET /api/documents/:id |
| Auth (register + login) | Without identity there is no ownership, sharing, or per-user AI quotas | LOW | FR-UM-01. JWT access (15 min) + refresh (7 days) via python-jose + bcrypt |
| JWT session refresh | Silent re-auth; visible logout on routine page load destroys trust | LOW | FR-UM-03. Refresh token rotates; transparent to user |
| Real-time keystroke propagation | Collaborative editor that isn't real-time is just shared storage | HIGH | FR-RT-01. Yjs delta → y-websocket → broadcast. Target ≤300 ms p95 |
| Presence / cursor awareness | Seeing co-editors' cursors is the visual proof of "live collaboration" | MEDIUM | FR-RT-02. Yjs Awareness API gives color-coded cursors + selections for free |
| CRDT conflict resolution | Two users editing same paragraph must not corrupt or lose content | HIGH | FR-RT-03. Yjs CRDT merges deterministically. Automated test required per acceptance criteria |
| AI rewrite | Core value proposition; the primary reason this product exists | HIGH | FR-AI-01. Select text → Groq stream → tracked-change proposal shown inline |
| AI summarize | Expected in any "AI writing assistant" product by 2026 | MEDIUM | FR-AI-02. Same stream pipeline as rewrite; different prompt template |
| AI translate | Multi-language collaboration is a common enterprise need | MEDIUM | FR-AI-03. Requires target_lang param; same stream pipeline |
| Streaming AI output (word-by-word) | Non-streaming AI feels 40–60% slower perceptually; users abandon or distrust | MEDIUM | FR-AI-05. SSE from FastAPI → SPA. First token ≤1 s. "AI is writing…" indicator + cancel |
| Accept / reject AI suggestion | Without this, AI output is irreversible; users fear using it | MEDIUM | FR-AI-04. Full accept, full reject, undo after acceptance. Yjs transaction wraps accept |
| AI suggestion as tracked change | Industry standard UX (Word, Notion AI, Google Gemini all do this) | HIGH | Inline diff: strikethrough original + green insertion. Requires custom Tiptap extension or decoration |
| Per-user token quota + 429 | Prevents runaway LLM costs; required by stakeholder S1 | LOW | daily_ai_tokens_used column + reset_at. Middleware returns 429 when over limit |
| AI interaction logging | Required for audit, quota enforcement, and feedback loops | LOW | FR-AI-06. ai_interactions table. Every invocation logged with feature/input/suggestion/status/tokens_used |
| Role-based access (RBAC) | Sharing without permissions is a security hole; viewers editing = data corruption | MEDIUM | FR-UM-02. Four roles: owner/editor/commenter/viewer. Enforced at API middleware level |
| Document sharing (by email + role) | Required for "collaborative" to mean anything beyond solo use | MEDIUM | FR-DM-03. Share dialog → permission record. Roles enforced immediately on next API call |
| Backend-proxied AI calls | Never expose Groq API key to frontend; required by ADR-002 and stakeholder S3 | LOW | All /api/ai/* endpoints proxy to Groq. Key lives only in backend env. Architecture decision, not user-visible |

---

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI restructure / freeform instruction | Beyond rewrite/summarize/translate — user gives custom instruction ("make this more concise", "add section headers") | MEDIUM | FR-AI contract already defines POST /api/ai/restructure endpoint. Groq prompt template parameterized by instructions string |
| AI soft-lock during processing | Prevents collaborator edits from racing with AI suggestion on the same paragraph; avoids merge conflicts mid-suggestion | HIGH | FR-AI-07. Yjs broadcast "AI is processing" state to other users; queues their edits to that region. Auto-releases after 5 s timeout. Depends on full Yjs integration — deferred to Sprint 3+ |
| Partial accept of AI suggestion | Accept a sub-range within the AI's suggestion, discard the rest | HIGH | US-08. Implemented as Yjs transaction on selected sub-range within tracked change. Complex Tiptap selection logic |
| Cancel mid-stream | Abort an in-flight AI generation without corrupting doc state | MEDIUM | FR-AI-05 / US-09. SSE abort signal + POST /api/ai/cancel/:suggestion_id. Discards partial; no log entry for cancelled |
| Version history with revert | Non-destructive revert to any of last 50 snapshots while live editing continues | HIGH | FR-DM-02. Append-only document_versions table (full Yjs state, not diffs). Revert = load snapshot + apply as new Yjs update + create new version row |
| Export as PDF / DOCX / Markdown | Users expect to produce deliverables; export is the "exit ramp" from the editor | MEDIUM | FR-DM-04. Server-side generation (pandoc or equivalent). Two PDF modes: clean + marked-up with tracked changes |
| Offline resilience | Local edits preserved through network drops; zero data loss on reconnect | MEDIUM | FR-RT-04. Yjs buffers locally. Reconnect → bidirectional sync. Toast notification. Requires Yjs IndexedDB persistence on client |
| Mockable AI service interface | Enables QA to write deterministic tests against AI features; required by stakeholder S5 | LOW | Interface/protocol class for AIService. Swappable mock returns fixed responses. Already in Temiko's scope |
| Groq model flexibility | Can downgrade from 70B to 8B if latency or cost becomes a problem mid-project | LOW | Model name in env var, not hardcoded. llama-3.3-70b-versatile default; llama-3.1-8b-instant fallback |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full document sent to Groq by default | Users want "AI knows the whole doc" | Privacy violation risk (cross-border data transfer); token cost explosion; exceeds Groq rate limits on large docs | Send selection + 500 tokens surrounding context + doc title only (NFR-SP-03). Let user opt-in to full-doc mode explicitly |
| OAuth / SSO login | Familiar "Login with Google/GitHub" UX | Out of scope per contract Won't-Have; adds OAuth flow complexity that delays AI feature work | Email/password + JWT is sufficient for PoC. Explicitly deferred |
| Link-based sharing ("anyone with link") | Common in Google Docs | Requires public auth bypass, complicates permission model, creates audit gaps | Email-based sharing with explicit roles (FR-DM-03). Clear UX around who has access |
| Real-time comments (sidebar) | Users expect comment threads like Google Docs | Separate feature from document edits; requires independent CRDT thread, presence, notification system | Defer to post-MVP. Commenter role exists but comments = separate module. Won't-Have this semester per contract |
| Mobile-optimized UI | Broad device support | Touch interactions on Tiptap/Yjs are unproven; mobile collab adds complexity with little PoC value | Desktop-first. Explicitly Won't-Have per contract |
| AI chat sidebar | Conversational AI assistant alongside the doc | Scope creep; diverges from the "AI as tracked change" model which is the core UX thesis | Keep AI features as inline tracked changes; no chat UI |
| Horizontal scaling of collab server | High availability for y-websocket | y-websocket is a singleton by design; horizontal scaling requires Redis pub/sub + Hocuspocus migration | Known limitation per NFR-SC-02. Document the ceiling (200 concurrent docs). Upgrade path = Hocuspocus + Redis, deferred to post-PoC |
| Auto-save to database on every keystroke | "Never lose work" feeling | Postgres write amplification; Yjs state is large; debounce is the correct approach | Collab server snapshots to DB every 30 s if doc changed (contract's snapshot persistence design) |
| Org admin AI config panel | Fine-grained control over AI per role | FR-UM-04 is Could-Have; building it now delays AI core work and requires admin UI module | Defer. Token quota + RBAC enforcement handles the critical controls. Admin panel = Atharv's scope post-MVP |

---

## Feature Dependencies

```
[Auth (register + login)]
    └──required-by──> [Document CRUD]
    └──required-by──> [AI features]
    └──required-by──> [RBAC / sharing]

[Document create / list / open]
    └──required-by──> [Real-time editing]
    └──required-by──> [AI rewrite / summarize / translate]
    └──required-by──> [Version history]
    └──required-by──> [Document sharing]

[Real-time keystroke propagation (Yjs + y-websocket)]
    └──required-by──> [Presence / cursor awareness]
    └──required-by──> [CRDT conflict resolution]
    └──required-by──> [Offline resilience]
    └──required-by──> [AI soft-lock during processing]
    └──required-by──> [Partial accept of AI suggestion]

[AI rewrite (streaming)]
    └──requires──> [Backend-proxied AI calls]
    └──requires──> [SSE streaming pipeline]
    └──requires──> [AI interaction logging]
    └──requires──> [Per-user token quota]
    └──enhances──> [Accept / reject AI suggestion]
    └──enhances──> [AI suggestion as tracked change]

[Accept / reject AI suggestion]
    └──requires──> [AI suggestion as tracked change]
    └──requires──> [AI rewrite / summarize / translate]

[AI suggestion as tracked change]
    └──requires──> [Rich text editing (Tiptap)]
    └──requires──> [AI rewrite / summarize / translate]

[Version history with revert]
    └──requires──> [Document CRUD]
    └──enhances──> [Real-time editing (revert delivered as Yjs update)]

[Cancel mid-stream]
    └──requires──> [SSE streaming pipeline]
    └──enhances──> [Streaming AI output]

[AI soft-lock]
    └──requires──> [Real-time keystroke propagation (Yjs)]
    └──enhances──> [AI rewrite / summarize / translate]

[RBAC / sharing]
    └──requires──> [Auth]
    └──required-by──> [Document sharing]
    └──required-by──> [AI invoke permission check]
```

### Dependency Notes

- **Auth required-by everything:** Auth must be the first feature stub in place. Temiko's minimal auth stub (register + login + JWT) unblocks all other modules.
- **Document CRUD required-by AI:** The AI endpoints take doc_id as a foreign key; documents table must exist before AI logging works.
- **SSE streaming required-by cancel:** Cancel mid-stream uses POST /api/ai/cancel/:suggestion_id which only makes sense if the SSE stream is in flight.
- **Yjs integration required-by soft-lock:** FR-AI-07 depends on broadcasting lock state to other connected Yjs clients — this requires full Yjs setup (Teya's Sprint 2 scope), not just Tiptap rendering.
- **AI suggestion as tracked change is a hard frontend dependency:** Streaming tokens must be rendered as a staged diff (strikethrough + insertion), not as committed text. This requires a custom Tiptap extension or Mark before accept/reject can work.
- **Partial accept conflicts with simple accept/reject:** Partial accept requires Tiptap selection within a tracked-change range — significantly more complex than full accept/reject. Must not be in same phase.

---

## MVP Definition

### Launch With (v1 — Temiko's PoC skeleton)

Minimum viable product to make AI features testable end-to-end.

- [ ] Auth stub (register + login + JWT) — unblocks all other endpoints
- [ ] Document CRUD stub (create, list, get) — provides doc_id for AI logging FK
- [ ] AI rewrite with SSE streaming — primary demo value; must work flawlessly
- [ ] AI summarize — same pipeline as rewrite; one prompt template change
- [ ] AI translate — same pipeline; requires target_lang parameter
- [ ] Accept / reject AI suggestion — without this, AI output is permanent and unusable
- [ ] AI suggestion as tracked-change inline diff — visual proof the feature works correctly
- [ ] Streaming UX with cancel button — "AI is writing..." indicator + abort
- [ ] AI interaction logging (ai_interactions table) — required for quota and audit
- [ ] Per-user daily token quota + 429 — cost control before sharing with team
- [ ] Mockable AI service interface — QA requirement; enables unit tests without real Groq calls
- [ ] Minimal Tiptap editor rendering in browser — editor must load before anything is testable
- [ ] Render deployment (render.yaml) — catch infra issues early per Temiko's approach

### Add After Validation (v1.x — Team integration sprints)

Features to add once the PoC skeleton is validated and teammates deliver their modules.

- [ ] Real-time keystroke propagation (Yjs) — Teya's Sprint 2 scope; replaces Tiptap stub with full collab
- [ ] Presence / cursor awareness — depends on Yjs; delivered alongside Yjs integration
- [ ] CRDT conflict resolution — inherent in Yjs; tested once collab server is live
- [ ] RBAC middleware — Atharv's backend scope; replace stub allow-all with real role checks
- [ ] Document sharing (email + role) — depends on RBAC being enforced
- [ ] AI restructure (freeform instruction) — POST /api/ai/restructure already in API contract; add prompt template
- [ ] Version history with revert — FR-DM-02; append-only snapshots, non-destructive revert
- [ ] Offline resilience — FR-RT-04; Yjs IndexedDB persistence + reconnect sync
- [ ] Export as PDF / DOCX / Markdown — FR-DM-04; server-side generation

### Future Consideration (v2+ / post-semester)

Features to defer until post-PoC.

- [ ] AI soft-lock during processing (FR-AI-07) — depends on full Yjs collab; complex broadcast state; deferred explicitly in PROJECT.md
- [ ] Partial accept of AI suggestion — complex Tiptap selection within tracked change; high complexity for marginal MVP value
- [ ] Org admin AI config panel (FR-UM-04) — Could-Have per MoSCoW; Atharv's scope
- [ ] Real-time comments (sidebar threads) — Won't-Have this semester per contract
- [ ] Horizontal collab server scaling — post-PoC; known y-websocket ceiling; upgrade path = Hocuspocus + Redis

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Auth stub (register + login) | HIGH | LOW | P1 |
| Document CRUD stub | HIGH | LOW | P1 |
| AI rewrite with SSE streaming | HIGH | HIGH | P1 |
| Accept / reject AI suggestion | HIGH | MEDIUM | P1 |
| AI suggestion as tracked change (inline diff) | HIGH | HIGH | P1 |
| Streaming UX + cancel | HIGH | MEDIUM | P1 |
| AI interaction logging | MEDIUM | LOW | P1 |
| Per-user token quota + 429 | MEDIUM | LOW | P1 |
| Mockable AI service interface | MEDIUM | LOW | P1 |
| Minimal Tiptap editor | HIGH | LOW | P1 |
| AI summarize | HIGH | LOW | P1 (same pipeline as rewrite) |
| AI translate | HIGH | LOW | P1 (same pipeline as rewrite) |
| Real-time keystroke propagation (Yjs) | HIGH | HIGH | P1 (Sprint 2, Teya) |
| Presence / cursor awareness | HIGH | MEDIUM | P2 (depends on Yjs) |
| RBAC enforcement | HIGH | MEDIUM | P2 (Atharv's scope) |
| Document sharing | HIGH | MEDIUM | P2 (depends on RBAC) |
| AI restructure (freeform) | MEDIUM | MEDIUM | P2 |
| Version history + revert | MEDIUM | HIGH | P2 |
| Offline resilience | MEDIUM | MEDIUM | P2 |
| Export (PDF/DOCX/MD) | MEDIUM | MEDIUM | P2 |
| AI soft-lock | LOW | HIGH | P3 |
| Partial accept | LOW | HIGH | P3 |
| Org admin AI config | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for PoC skeleton to be testable (Temiko's scope)
- P2: Should have, added by teammates in integration sprints
- P3: Nice to have, post-semester or deferred

---

## Competitor Feature Analysis

| Feature | Notion AI | Google Docs (Gemini) | Our Approach |
|---------|-----------|----------------------|--------------|
| AI rewrite | Yes — "Improve writing", tone change | Yes — "Help me write", refine | Inline tracked change via SSE stream; user sees word-by-word |
| AI summarize | Yes — summarize page or selection | Yes — summarize document | Selection-scoped, streamed as tracked change |
| AI translate | Via AI prompt; no dedicated UI | Google Translate integration | Dedicated /api/ai/translate endpoint + language picker |
| AI suggestions as tracked changes | Notion replaces text directly; no tracked-change model | Gemini inserts inline; no formal diff | Our approach: suggestion always appears as tracked change first; user must accept — gives more control |
| Streaming word-by-word | Yes | Yes | Yes — SSE from Groq LPU; first token ≤1 s target |
| Cancel mid-stream | Yes (Notion) | Partially | Yes — POST /api/ai/cancel/:suggestion_id + SSE abort |
| Real-time cursors | Yes (limited) | Yes (mature) | Yes — Yjs Awareness; color-coded per user |
| CRDT conflict resolution | Notion uses operational transform variant | Google uses OT internally | Yjs CRDT — deterministic, testable, offline-capable |
| Per-user AI quota | Yes (paid plan limits) | Yes (workspace quotas) | Per-user daily_ai_tokens_used in DB; 429 on exceed |
| Version history | Yes (page history) | Yes (revision history) | Append-only Yjs snapshots; revert = new version (non-destructive) |
| RBAC | Workspace permissions | Share with view/comment/edit | Four explicit roles: owner/editor/commenter/viewer; enforced at API layer |
| Offline editing | Partial | Partial | Yjs buffers locally; full sync on reconnect |

**Key differentiator vs. competitors:** AI output always surfaces as a tracked-change proposal requiring explicit accept/reject — users never lose original text accidentally. Combined with SSE streaming, this creates a "co-writing" feel where the AI's contribution is visible and reversible. Competitors either replace text directly (Notion) or insert without a formal diff model (Gemini).

---

## Sources

- Contract FR requirements: `docs/contract.md` (FR-AI-01 through FR-AI-07, FR-RT-*, FR-DM-*, FR-UM-*)
- Project scope: `.planning/PROJECT.md` (Active requirements, Out of Scope, Key Decisions)
- [Notion AI Overview: Complete Guide to AI Writer 2026](https://pradeepsingh.com/notion-ai/) — MEDIUM confidence (WebSearch)
- [Notion AI vs Coda AI vs Google Docs AI – 2026](https://genesysgrowth.com/blog/notion-ai-vs-coda-ai-vs-google-docs-ai) — MEDIUM confidence (WebSearch)
- [The Streaming Backbone of LLMs: Why SSE Still Wins in 2026](https://procedure.tech/blogs/the-streaming-backbone-of-llms-why-server-sent-events-(sse)-still-wins-in-2025) — MEDIUM confidence (WebSearch)
- [Stop Making Users Wait: The Ultimate Guide to Streaming AI Responses](https://dev.to/programmingcentral/stop-making-users-wait-the-ultimate-guide-to-streaming-ai-responses-22m3) — MEDIUM confidence (WebSearch; 40-60% faster perception stat)
- [AI UX patterns for design systems (part 1)](https://thedesignsystem.guide/blog/ai-ux-patterns-for-design-systems-(part-1)) — MEDIUM confidence (WebSearch; accept/reject control patterns)
- [24 Best Document Collaboration Tools Review 2026](https://thedigitalprojectmanager.com/tools/document-collaboration-tools/) — LOW confidence (WebSearch; general market landscape)

---

*Feature research for: Collaborative Document Editor with AI Writing Assistant (PoC)*
*Researched: 2026-03-20*
