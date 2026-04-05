   
AI1220 Software Engineering — Assignment 1

**Collaborative Document Editor with AI Writing Assistant**

*Context Dump & Technical Decisions — DRAFT*

Teya (Infra) · Tanisha (Frontend) · Temiko (AI) · Atharv (Backend)

MBZUAI — March 2026

 

# **REQUIREMENTS ENGINEERING**

## **Stakeholder Analysis**

| Stakeholder | Goals | Concerns | Influence on Requirements |
| :---- | :---- | :---- | :---- |
| S1: Product Owners / Founders | Differentiated product (AI-native editing). Fast MVP. Controlled infra costs. | Scope creep. Unpredictable LLM costs. Reliability affecting early reputation. | AI-assisted editing as first-class feature. Per-user token quotas. Lean MVP scope. |
| S2: Enterprise IT Admins | Centralized user provisioning. Audit logging. Compliance with security policies. | Data exfiltration via LLM APIs. No SSO/RBAC. No data residency controls. | Org-admin role for AI feature config. Audit trail on doc access \+ AI history. Data-handling transparency. |
| S3: LLM API Provider (Groq) | Reliable high-throughput inference. Fair usage. | API abuse. Rate-limit violations. Excessive token consumption. | Backend-proxied AI calls (not frontend-direct). Rate limiting. Graceful degradation on API outage. Token budgets per request. |
| S4: Privacy / Compliance Officers | GDPR compliance. Institutional data policy adherence. | Doc content sent to third-party LLM \= cross-border data transfer. Indefinite AI logs \= liability. No consent mechanism. | Explicit user consent before AI processes content. 90-day AI log retention \+ user-deletable. Encryption at rest/transit. Privacy disclosure re: Groq. |
| S5: QA / Testing Engineers | Validate correctness of real-time sync, AI rendering, permission enforcement. | Non-deterministic sync \= flaky tests. Variable AI responses. Hard-to-reproduce edge cases. | Mockable AI service interfaces. Deterministic Yjs conflict resolution (unit-testable). Structured error codes \+ API schemas for contract testing. |
| S6: DevOps / Platform Engineers | Deploy/monitor/scale with minimal manual intervention. Uptime during deploys. | Stateful y-websocket singleton (no horizontal scaling). Live DB migrations. Multi-service secrets management. | Monorepo \= single deployment pipeline. Health-check endpoints per service. Known limitation acknowledgment for single-instance collab server. |

 

## **Functional Requirements**

**FR-RT: Real-time Collaboration**

| ID | Requirement | Acceptance Criteria |
| :---- | :---- | :---- |
| FR-RT-01 | Keystroke propagation: user types → Yjs encodes delta → WebSocket → broadcast → remote Tiptap renders | Character visible to collaborators ≤ 300 ms same-region |
| FR-RT-02 | Presence awareness: connected users’ avatars, cursor positions, and text selections shown in distinct colors | Cursor updates ≤ 500 ms; user list updates on connect/disconnect |
| FR-RT-03 | Concurrent region conflict: two users edit same paragraph within 1 s window → Yjs CRDT merges deterministically, no content lost | Automated test: two clients insert at same offset; both present in final doc |
| FR-RT-04 | Offline resilience: network drops → local edits preserved in Yjs state → reconnect syncs bidirectionally | Simulated disconnect/reconnect: zero edits lost on either side |
| FR-RT-05 | Session join: new user opens existing doc → loads latest snapshot \+ pending Yjs updates → current state rendered | New client sees all content including in-flight edits |

 

**FR-AI: AI Writing Assistant**

| ID | Requirement | Acceptance Criteria |
| :---- | :---- | :---- |
| FR-AI-01 | Rewrite: user selects text → clicks Rewrite → backend proxies to Groq → SSE streams back → displayed as tracked-change proposal inline | Suggestion appears ≤ 3 s; shown as deletion/insertion diff |
| FR-AI-02 | Summarize: selection → condensed summary replaces selection as tracked-change proposal | Summary shorter than original; reviewable diff |
| FR-AI-03 | Translate: selection \+ target language → translated text as tracked-change proposal | Correct language; original preserved until accept |
| FR-AI-04 | Accept / reject / partial: full accept, full reject, or sub-range accept. Undo available after acceptance. | Accept applies change; reject restores original; Ctrl+Z undoes |
| FR-AI-05 | Streaming UX: word-by-word via SSE; “AI is writing…” indicator with cancel button | First token ≤ 1 s; cancel discards partial result |
| FR-AI-06 | Interaction logging: every AI invocation logged (feature, input, suggestion, user action) to ai\_interactions table | Log entry with correct FKs to document and user |
| FR-AI-07 | Soft lock: during AI processing, target paragraph shows “AI is processing” to other users; their edits to that region queued until suggestion displayed | Lock auto-releases after 5 s timeout if AI fails |

 

**FR-DM: Document Management**

| ID | Requirement | Acceptance Criteria |
| :---- | :---- | :---- |
| FR-DM-01 | Create: new empty doc, creator \= owner, opens in editor | Doc in user’s list; owner permission set |
| FR-DM-02 | Version history: chronological snapshot list with timestamps \+ author; preview any version; revert (creates new snapshot, non-destructive) | Last 50 snapshots shown; revert \= new version row |
| FR-DM-03 | Sharing: owner enters email \+ role → permission record created → shared user sees doc in their list | Editor/commenter/viewer roles; enforced immediately |
| FR-DM-04 | Export: current state → PDF, DOCX, or Markdown download | Exported file has all content with basic formatting |
| FR-DM-05 | Soft delete: owner deletes → doc hidden, recoverable within 30 days | Deleted docs not shown in list; restorable via API |

 

**FR-UM: User Management & Auth**

| ID | Requirement | Acceptance Criteria |
| :---- | :---- | :---- |
| FR-UM-01 | Registration \+ login: email/password → bcrypt hash → JWT access token (15 min) \+ refresh token (7 days); refresh rotates | Passwords never plaintext; token refresh is transparent to user |
| FR-UM-02 | Role-based authz: per-document permission check on every action (view/edit/comment/AI/share/delete) | Viewers can’t edit; commenters can’t AI or edit; editors can’t share; only owners share/delete |
| FR-UM-03 | Session handling: expired JWT → auto-refresh via refresh token → if refresh expired, redirect to login | No data loss on refresh; no visible interruption |
| FR-UM-04 | Org admin config: toggle AI features per role; set org-level AI usage quotas | Changes effective on next AI invocation; quota → 429 |

 

## **Non-Functional Requirements**

| ID | Category | Target | Justification |
| :---- | :---- | :---- | :---- |
| NFR-LAT-01 | Latency | Keystroke propagation ≤ 300 ms (p95) | Threshold for “live” feel per CRDT research. Yjs over WS achieves sub-100 ms, giving headroom. |
| NFR-LAT-02 | Latency | AI first token ≤ 1.5 s (p95) | Groq LPU returns first tokens in 200–500 ms. Budget covers network \+ prompt construction \+ API overhead. SSE makes it feel instant. |
| NFR-LAT-03 | Latency | Document load ≤ 2 s for docs up to 100 KB | Google Web Vitals: 2 s \= abandonment threshold. 100 KB ≈ 50k words covers vast majority. |
| NFR-SC-01 | Scalability | 20 concurrent editors per document | Yjs awareness broadcasts O(n); at 20 still lightweight. Covers typical team scenarios. |
| NFR-SC-02 | Scalability | 200 concurrent active documents system-wide | Single y-websocket instance ceiling. Beyond this \= horizontal scaling needed (known limitation). |
| NFR-SC-03 | Scalability | 50 users at demo, 500 within 1 year | Postgres handles comfortably. y-websocket is binding constraint. Upgrade path: Hocuspocus \+ Redis pub/sub. |
| NFR-AV-01 | Availability | 99.5% monthly uptime (≈3.6 h downtime/month) | Realistic for Render-hosted student project without multi-region. |
| NFR-AV-02 | Availability | Partial failure tolerance | WS server down → local editing continues (Yjs offline). API down → no AI/CRUD but editing works. Groq down → AI disabled, rest works. |
| NFR-SP-01 | Security | TLS 1.2+ on all connections (HTTPS, WSS) | Render provides TLS termination by default. |
| NFR-SP-02 | Security | Encryption at rest (AES-256) | Render managed Postgres encryption. Backups inherit same. |
| NFR-SP-03 | Security | Minimal data sent to Groq: selection \+ 500 tokens context. Never full doc unless user explicitly opts in. | Cost control \+ privacy. Groq enterprise terms: input not used for training, not stored beyond request. |
| NFR-SP-04 | Security | AI interaction logs auto-purged after 90 days; user-deletable on demand | Liability reduction. Compliance with data minimization principles. |
| NFR-US-01 | Usability | \>10 collaborators → “+N others” badge. 20-color perceptually distinct palette for cursors. Edge markers for off-screen cursors. | Prevents UI clutter at scale. |
| NFR-US-02 | Usability | AI via: (a) floating toolbar on selection, (b) right-click, (c) keyboard shortcuts (Ctrl+Shift+R rewrite, Ctrl+Shift+S summarize) | Multiple access points for discoverability. |
| NFR-US-03 | Usability | WCAG 2.1 AA. Keyboard-navigable. Screen reader announces AI suggestions. Color never sole state indicator. | Accessibility baseline. |

 

## **Requirements Prioritization (MoSCoW)**

| Priority | Requirements |
| :---- | :---- |
| Must Have (MVP) | FR-RT-01 to 03 (core real-time editing \+ presence \+ conflict merge), FR-AI-01 (rewrite), FR-AI-04 (accept/reject), FR-AI-05 (streaming), FR-AI-06 (logging), FR-DM-01 (create), FR-DM-03 (sharing), FR-UM-01 (auth), FR-UM-02 (RBAC), NFR-LAT-01, NFR-SP-01 |
| Should Have | FR-RT-04 (offline resilience), FR-RT-05 (session join), FR-AI-02 (summarize), FR-AI-03 (translate), FR-AI-07 (soft lock), FR-DM-02 (version history), FR-DM-04 (export), FR-UM-03 (session handling), NFR-LAT-02, NFR-SP-02 |
| Could Have | FR-DM-05 (soft delete), FR-UM-04 (org admin config), FR-AI partial accept (advanced sub-range), NFR-US-03 (full WCAG AA), NFR-SP-04 (auto-purge) |
| Won’t Have (this semester) | SSO/OAuth. Link-based sharing. Team-based permissions. Horizontal collab server scaling. Real-time comments (separate from doc edits). Mobile-optimized UI. |

 

## **User Stories**

*Format: As a \[role\], I want \[goal\] so that \[reason\]. Acceptance \= expected behavior.*

| ID | Story | Acceptance Behavior |
| :---- | :---- | :---- |
| US-01 | As an editor, I want to see collaborators’ cursors \+ selections in real time so I avoid editing the same region. | Distinct color \+ name label per remote cursor. Selections highlighted. Updates ≤ 500 ms. |
| US-02 | As a user who loses connectivity, I want local edits preserved and synced on reconnect so I never lose work. | Yjs buffers locally. Reconnect → bidirectional sync. Toast: “Reconnected — changes synced.” |
| US-03 | As a collaborator, when two of us edit the same paragraph, I expect both edits preserved. | Yjs CRDT convergence. Both insertions present. Ordered by client ID tiebreaker. |
| US-04 | As a team lead, I want to revert to a previous version while others are editing. | Revert \= new snapshot. Applied as Yjs update. Others see update \+ their in-flight edits merged on top. Notification sent. |
| US-05 | As a writer, I want to select text and ask AI to rewrite it more formally. | Streams as tracked-change proposal (strikethrough original, green insertion). Accept/reject/partial. Original preserved until accept. |
| US-06 | As a researcher, I want to select a long section and get an AI summary. | Summary replaces selection as tracked-change. Shorter than original. Side-by-side comparison before deciding. |
| US-07 | As an international collaborator, I want to translate selected text without leaving the editor. | Language picker → translated text as tracked-change proposal. Original preserved until accept. |
| US-08 | As a user, I want to accept only part of an AI suggestion and discard the rest. | Select sub-range within suggestion → accept only that. Rest discarded. Implemented as Yjs transaction. |
| US-09 | As a user, when AI is generating and I realize I picked the wrong action, I want to cancel mid-stream. | Cancel aborts SSE stream, discards partial, restores pre-invocation state. No log entry for cancelled. |
| US-10 | As an owner, I want to share with specific users at different permission levels. | Share dialog: email \+ role. Validates against registered users. Shared user sees doc immediately. Enforced at API level. |
| US-11 | As a user, I want to export as PDF with or without tracked AI changes. | Two PDF options: clean (changes applied) and marked-up (insertions/deletions visible). Generated server-side. |
| US-12 | As a commenter, when I try to invoke AI, the system should clearly tell me I need editor permissions. | AI buttons visible but grayed out \+ tooltip. Backend returns 403 with descriptive message. |
| US-13 | As an org admin, I want to toggle which AI features are available per role. | Admin panel with toggles per feature per role. Changes effective immediately. Backend enforces. |
| US-14 | As a viewer, editing attempts should be prevented gracefully. | Tiptap read-only mode. Keyboard input ignored. Banner: “View-only access.” |

 

## **Traceability Matrix**

| User Story | Functional Reqs | NFRs Touched | Architecture Component(s) |
| :---- | :---- | :---- | :---- |
| US-01 | FR-RT-02 | NFR-LAT-01, NFR-US-01 | Frontend (Tiptap \+ Yjs Awareness), Collab Server |
| US-02 | FR-RT-04 | NFR-AV-02 | Frontend (Yjs offline), Collab Server (sync protocol) |
| US-03 | FR-RT-03 | NFR-LAT-01 | Frontend (Yjs CRDT), Collab Server (broadcast) |
| US-04 | FR-DM-02 | — | Backend API (version endpoints), DB (document\_versions), Frontend |
| US-05 | FR-AI-01, 04, 06 | NFR-LAT-02, NFR-SP-03 | AI Service, Backend API (SSE), Frontend (tracked-change UI) |
| US-06 | FR-AI-02, 04, 06 | NFR-LAT-02 | AI Service, Backend API, Frontend |
| US-07 | FR-AI-03, 04, 06 | NFR-LAT-02 | AI Service, Backend API, Frontend |
| US-08 | FR-AI-04 | — | Frontend (Tiptap selection \+ Yjs transaction) |
| US-09 | FR-AI-05 | — | Frontend (SSE abort), Backend API (stream cancel) |
| US-10 | FR-DM-03, FR-UM-02 | NFR-SP-01 | Backend API (permissions), DB, Frontend (share dialog) |
| US-11 | FR-DM-04 | — | Backend API (export endpoint), Frontend |
| US-12 | FR-UM-02, FR-AI-01 | — | Backend API (auth middleware), Frontend (disabled UI) |
| US-13 | FR-UM-04 | — | Backend API (admin endpoints), DB (org settings), Frontend |
| US-14 | FR-UM-02 | NFR-US-03 | Frontend (Tiptap read-only), Backend API (auth middleware) |

 

# **ARCHITECTURE & TECHNICAL DECISIONS**

## **Decided Tech Stack**

| Layer | Technology | Version / Spec | Why This Over Alternatives |
| :---- | :---- | :---- | :---- |
| Frontend Framework | React | 18.x | Team familiarity. Largest ecosystem. Tiptap has first-class React wrapper. |
| Rich Text Editor | Tiptap 2 (ProseMirror) | 2.x | Native Yjs support via y-prosemirror. Extensible (custom nodes for AI suggestions). Better DX than raw ProseMirror. |
| CRDT Library | Yjs | 13.x | Most mature JS CRDT. Built-in awareness (cursors/presence), offline support, sub-doc editing. Rejected Automerge (weaker rich-text), ShareDB (OT, harder offline). |
| CRDT Sync Server | y-websocket | Latest | Reference implementation for Yjs sync. Simple, works. Known limitation: no horizontal scaling (single-instance). |
| Build Tool | Vite | 5.x | Fast HMR for React dev. Simpler config than Webpack. |
| Client State | Zustand | 4.x | Lightweight global state (auth, editor metadata, AI state). Rejected Redux (overkill for 4 stores). |
| Server State | React Query (TanStack) | 5.x | Handles caching, refetching, optimistic updates for REST calls. Standard for React \+ REST. |
| Backend Framework | FastAPI | 0.110+ | Async Python, auto OpenAPI docs, Pydantic validation, native SSE support. Team knows Python. |
| ORM | SQLAlchemy | 2.x | Mature, async support, good FastAPI integration. |
| Validation | Pydantic v2 | 2.x | FastAPI’s native validation. Generates TypeScript types via datamodel-code-generator for shared contracts. |
| Database | PostgreSQL | 16 | ACID, mature, Render managed. Stores users, docs metadata, versions, permissions, AI logs. |
| LLM API | Groq | llama-3.3-70b-versatile | Ultra-low latency (LPU hardware). Cheap. Fast time-to-first-token for streaming UX. Not training on input data. |
| Auth | JWT (python-jose \+ bcrypt) | — | Stateless auth. Access token 15 min, refresh 7 days. Standard for SPAs. |
| Deployment | Render | — | Managed hosting with built-in TLS, managed Postgres, multi-service Blueprint deploy. Free tier for student project. |
| Monorepo | Single Git repo | — | 4-person team. Atomic cross-boundary commits. Single CI pipeline. Shared types in one place. |

 

## **Architectural Drivers (Ranked)**

| Rank | Driver | Why It Shapes Architecture |
| :---- | :---- | :---- |
| 1 | Real-time collaboration correctness | Forced Yjs \+ Tiptap selection. Forced dedicated WebSocket collab process. Forced CRDT over OT. Forced persistent WS connections over polling. |
| 2 | AI as first-class editing feature | AI suggestions \= tracked changes inside CRDT (not sidebar chat). Forces soft-lock policy. Forces Yjs transactions for accept/reject. |
| 3 | Latency sensitivity | WS over polling for sync. SSE for AI streaming. Groq (LPU) over slower LLM providers. All services same Render region. |
| 4 | Security / data privacy | All AI calls proxied through backend (never frontend-direct). Minimal context sent to Groq. JWT short-lived tokens. 90-day AI log retention. |
| 5 | Developer velocity (4-person team, 1 semester) | Monorepo. AI service \= module inside FastAPI (not separate microservice). Tech team already knows. Clear ownership dirs. |

 

## **C4 Level 1: System Context**

External actors and their connections to the system:

| Actor | Interaction | Protocol |
| :---- | :---- | :---- |
| Document User | Creates/edits docs, invokes AI, collaborates | HTTPS (REST) \+ WSS (Yjs sync) |
| Organization Admin | Configures roles, AI feature toggles, quotas | HTTPS (REST) |
| Groq LLM API | Receives prompt, returns streamed completion | HTTPS (outbound from backend) |
| Email Service (future) | Sends sharing notifications | SMTP (outbound from backend) |

 

## **C4 Level 2: Containers**

| Container | Tech | Responsibility | Communicates With |
| :---- | :---- | :---- | :---- |
| React SPA | React 18, Tiptap, Yjs, React Query, Zustand | Editor UI, Yjs client CRDT, AI suggestion display, doc management | REST → API; WS → Collab Server |
| FastAPI Backend | Python 3.12, FastAPI, SQLAlchemy, Pydantic | Auth, doc CRUD, versions, AI proxy, permissions, admin | REST from SPA; HTTPS → Groq; SQL → DB |
| y-websocket Server | Node.js 20, y-websocket | CRDT sync, presence broadcast, periodic snapshot persistence | WS from SPA; SQL → DB |
| PostgreSQL | PostgreSQL 16 (Render managed) | Persistent storage: users, docs, versions, permissions, AI logs | SQL from API \+ Collab |

 

## **C4 Level 3: Backend Components**

| Component | Responsibility | Interface |
| :---- | :---- | :---- |
| API Router Layer | Maps HTTP routes to controllers | FastAPI route decorators |
| Auth Middleware | JWT validation, user identity extraction, role-based access per endpoint | Depends() injection |
| Document Controller | Doc CRUD, version history, revert, export | /documents/\* |
| AI Controller | AI invocation, SSE streaming, interaction logging | /ai/\* |
| User Controller | Registration, login, token refresh, profile | /auth/\*, /users/\* |
| Permission Controller | Permission CRUD, role validation | /documents/{id}/permissions/\* |
| AI Service (module) | Prompt construction, Groq calls, response parsing, quota enforcement | Internal Python module |
| Prompt Engine | Template-based prompts for rewrite/summarize/translate/restructure | Python functions (context \+ params → prompt string) |
| Groq API Client | HTTP client for Groq chat completions w/ streaming, retry, timeout | Async Python class |
| Repository Layer | SQLAlchemy models \+ query methods. Single DB access point. | Python classes w/ CRUD methods |

 

## **Communication Model**

| Interaction | Protocol | Direction | Why |
| :---- | :---- | :---- | :---- |
| Document CRUD | REST (HTTPS) | SPA → API | Simple, cacheable, stateless |
| Auth | REST \+ JWT | SPA → API | Standard SPA auth pattern |
| AI invocation | REST \+ SSE streaming | SPA → API → Groq | User sees AI typing word-by-word. SSE \= simple unidirectional stream. |
| Real-time edits | WebSocket (Yjs binary protocol) | SPA ↔ Collab Server | Low latency, bidirectional. Yjs’s native sync protocol. |
| Presence (cursors) | WebSocket (Yjs Awareness) | SPA ↔ Collab Server | Built into Yjs for free. No extra implementation. |
| Snapshot persistence | SQL (internal) | Collab Server → DB | Debounced every 30 s if doc changed |

 

## **Data Model**

**Five core tables. Document content lives in Yjs CRDT state, not as a column.**

| Table | Key Columns | Design Notes |
| :---- | :---- | :---- |
| users | id (UUID PK), email (unique), hashed\_password, name, created\_at, daily\_ai\_tokens\_used, ai\_tokens\_reset\_at | Token counter resets when now \> reset\_at |
| documents | id (UUID PK), title, owner\_id (FK), created\_at, updated\_at, is\_deleted | Content NOT stored here — canonical content \= Yjs state in document\_versions. Soft delete. |
| document\_versions | id (UUID PK), doc\_id (FK), snapshot (bytea), created\_at, created\_by (FK) | Full Yjs state (not diff). Revert \= load target snapshot \+ apply as new Yjs state \+ create new row. Append-only. |
| permissions | id (UUID PK), doc\_id (FK), user\_id (FK), role (enum: owner/editor/commenter/viewer), created\_at | Unique(doc\_id, user\_id). Owner also stored in documents.owner\_id for fast lookup. |
| ai\_interactions | id (UUID PK), doc\_id (FK), user\_id (FK), feature (enum), input\_text, suggestion\_text, status (enum: accepted/rejected/partial/cancelled), tokens\_used, created\_at | 90-day auto-purge. tokens\_used for cost attribution \+ quota enforcement. |

 

## **Role-Permission Matrix**

| Action | Owner | Editor | Commenter | Viewer |
| :---- | :---- | :---- | :---- | :---- |
| View document | ✓ | ✓ | ✓ | ✓ |
| Edit content | ✓ | ✓ | ✗ | ✗ |
| Add comments | ✓ | ✓ | ✓ | ✗ |
| Invoke AI | ✓ | ✓ | ✗ | ✗ |
| Accept/reject AI | ✓ | ✓ | ✗ | ✗ |
| View version history | ✓ | ✓ | ✓ | ✗ |
| Revert to version | ✓ | ✓ | ✗ | ✗ |
| Share / manage permissions | ✓ | ✗ | ✗ | ✗ |
| Delete document | ✓ | ✗ | ✗ | ✗ |
| Export | ✓ | ✓ | ✓ | ✓ |
| Configure AI (org admin) | Org Admin | ✗ | ✗ | ✗ |

 

## **API Contract**

*Decided endpoints. All return JSON. Auth via Bearer JWT. Error format: { error, code, detail? }*

**Documents**

| Method | Endpoint | Body / Params | Response |
| :---- | :---- | :---- | :---- |
| POST | /api/documents | { title } | { id, title, owner\_id, created\_at } |
| GET | /api/documents | — | \[{ id, title, role, updated\_at }\] |
| GET | /api/documents/:id | — | { id, title, content, owner, permissions, updated\_at } |
| PATCH | /api/documents/:id | { title } | { id, title, updated\_at } |
| DELETE | /api/documents/:id | — | 204 |
| POST | /api/documents/:id/snapshot | { snapshot: base64 } | { version\_id, created\_at } |
| GET | /api/documents/:id/versions | — | \[{ version\_id, created\_at, created\_by }\] |
| POST | /api/documents/:id/revert/:vid | — | { version\_id, created\_at } |
| GET | /api/documents/:id/export?format=pdf|docx|md | — | Binary download |

 

**AI**

| Method | Endpoint | Body | Response |
| :---- | :---- | :---- | :---- |
| POST | /api/ai/rewrite | { doc\_id, selection, context?, style? } | SSE stream: { token, done, suggestion\_id } |
| POST | /api/ai/summarize | { doc\_id, selection, context? } | SSE stream |
| POST | /api/ai/translate | { doc\_id, selection, context?, target\_lang } | SSE stream |
| POST | /api/ai/restructure | { doc\_id, selection, context?, instructions } | SSE stream |
| POST | /api/ai/cancel/:suggestion\_id | — | 200 |
| POST | /api/ai/feedback | { suggestion\_id, action } | 200 |

 

**Auth & Users**

| Method | Endpoint | Body | Response |
| :---- | :---- | :---- | :---- |
| POST | /api/auth/register | { email, password, name } | { user\_id, email, access\_token, refresh\_token } |
| POST | /api/auth/login | { email, password } | { access\_token, refresh\_token } |
| POST | /api/auth/refresh | { refresh\_token } | { access\_token, refresh\_token } |
| GET | /api/users/me | — | { id, email, name, created\_at } |

 

**Permissions**

| Method | Endpoint | Body | Response |
| :---- | :---- | :---- | :---- |
| POST | /api/documents/:id/permissions | { user\_email, role } | { permission\_id, user\_id, role } |
| GET | /api/documents/:id/permissions | — | \[{ user\_id, email, name, role }\] |
| PATCH | /api/documents/:id/permissions/:pid | { role } | { permission\_id, role } |
| DELETE | /api/documents/:id/permissions/:pid | — | 204 |

 

**Error Codes**

| Status | Code | When |
| :---- | :---- | :---- |
| 400 | INVALID\_REQUEST | Malformed body / missing fields |
| 401 | TOKEN\_EXPIRED | JWT expired; client should refresh |
| 403 | INSUFFICIENT\_PERMISSION | Role doesn’t permit action |
| 404 | DOCUMENT\_NOT\_FOUND | Doc doesn’t exist or no access |
| 429 | AI\_QUOTA\_EXCEEDED | Daily AI token limit hit |
| 503 | AI\_SERVICE\_UNAVAILABLE | Groq unreachable |
| 504 | AI\_TIMEOUT | Groq didn’t respond within 30 s |

 

## **AI Integration Design Decisions**

| Decision Area | Decision | Rationale |
| :---- | :---- | :---- |
| Context sent to Groq | Selection \+ 500 tokens surrounding context \+ document title. Never full doc by default. | Cost control \+ privacy. Smaller prompt \= faster inference. Title \+ headers provide enough global context for most operations. |
| Full-doc summarize | User explicitly opts in. System chunks doc into segments fitting 8192-token context window, processes sequentially, combines results. | Prevents accidental cost spikes. Chunking handles long docs without hitting context limits. |
| Suggestion UX | Tracked-change style inline: strikethrough (red) for original, green for AI insertion. Custom Tiptap extension wraps AI suggestions in decoration nodes. | Mirrors familiar Track Changes paradigm. Inline \= no context switching to a sidebar. |
| AI during concurrent editing | Soft-lock target paragraph. Show “AI is processing” to others. Queue their edits to that region. Lock released when suggestion displayed. Auto-release after 5 s on failure. | Prevents semantically broken CRDT merges. Lock is short (1–3 s with Groq). Edits elsewhere unaffected. |
| Prompt storage | Python f-string templates in backend/ai/prompts.py. One template per feature. Params: selected\_text, surrounding\_context, document\_title, target\_language, style\_instructions. | Update prompts without touching logic. Hot-reload in dev. Can externalize to config file later. |
| Model | llama-3.3-70b-versatile on Groq | Good quality at low cost. Groq LPU \= fast first-token. Can downgrade to llama-3.1-8b for budget-constrained features. |
| Cost control | 3 levels: (1) per-user daily quota (50k tokens, tracked in DB), (2) org monthly budget (admin-configurable), (3) per-request input cap (4k tokens, truncate if exceeded) | Layered defense against cost overrun. 429 response with clear message when exceeded. |
| Backend proxy (not frontend-direct) | All AI calls go frontend → backend → Groq. Never frontend-direct to Groq. | Hides API key. Enables server-side logging, quota enforcement, content moderation. One extra hop (\~10–50 ms) is acceptable. |

 

## **Architecture Decision Records**

**ADR-001: Yjs \+ Tiptap for Real-time Collaboration**

|   |   |
| :---- | :---- |
| Status | Accepted |
| Context | Need CRDT for conflict-free real-time editing. Editor must support rich text. 4-person team, one semester. |
| Decision | Yjs (CRDT) \+ Tiptap (ProseMirror-based editor) \+ y-prosemirror bindings \+ y-websocket server. |
| \+ Consequences | First-class Yjs support in Tiptap. Battle-tested combo. Offline, presence, sub-doc editing free. |
| – Consequences | Yjs binary encoding \= opaque debugging. y-websocket \= single-instance, no horizontal scaling (known limitation). |
| Rejected | Automerge: weaker rich-text. ShareDB (OT): harder offline, requires central transformation server. |

 

**ADR-002: Backend-Proxied AI Calls**

|   |   |
| :---- | :---- |
| Status | Accepted |
| Context | Frontend could call Groq directly (CORS supported). But exposes API key, prevents logging, no quota enforcement. |
| Decision | All AI calls proxied through FastAPI backend. Frontend calls /api/ai/\*. Backend constructs prompts, calls Groq, streams via SSE. |
| \+ Consequences | API key hidden. Server-side quota \+ logging guaranteed. Prompt updates without frontend redeploy. |
| – Consequences | One extra network hop (\~10–50 ms). Increased backend load. Must implement SSE on backend. |
| Rejected | Frontend-direct: faster by one hop but unacceptable security/control tradeoffs. |

 

**ADR-003: Soft-Lock During AI Processing**

|   |   |
| :---- | :---- |
| Status | Accepted |
| Context | User A requests AI rewrite on paragraph while User B is typing in same paragraph. Uncoordinated CRDT merge of AI output \+ human edits \= semantic garbage. |
| Decision | Soft-lock target paragraph during AI processing. Visual indicator to others. Queue their edits to that region. Release when suggestion displayed. Auto-release after 5 s on failure. |
| \+ Consequences | Prevents confusing merges. Lock is brief (1–3 s). Other doc regions unaffected. |
| – Consequences | Briefly blocks one paragraph. Users may perceive restriction. Timeout edge case needs handling. |
| Rejected | No locking (let CRDT merge): produces nonsensical text. Full doc lock: too restrictive. |

 

**ADR-004: Monorepo with Directory Ownership**

|   |   |
| :---- | :---- |
| Status | Accepted |
| Context | 4 people working on frontend, backend, AI, infra concurrently. Need coordination without overhead. |
| Decision | Single Git repo. frontend/ (Tanisha), backend/api/ (Atharv), backend/ai/ (Temiko), backend/collab/ \+ infra/ (Teya). Shared types in shared/. |
| \+ Consequences | Atomic cross-boundary commits. Single CI pipeline. Shared type generation in one place. |
| – Consequences | More merge conflicts. CI runs all tests (mitigated by path-based triggers). |
| Rejected | Multi-repo: adds coordination overhead for a 4-person team. Shared type changes \= multi-repo PRs. |

 

## **Repository Structure**

*Ownership annotations in parentheses.*

collab-editor/

├─ frontend/                    (Tanisha)

│  ├─ src/components/           React components

│  ├─ src/hooks/                useDocument, useAI, useAuth, usePresence

│  ├─ src/stores/               Zustand: authStore, editorStore, aiStore

│  ├─ src/api/                  React Query hooks wrapping REST

│  ├─ src/extensions/           Custom Tiptap extensions (AI suggestion, soft lock)

│  └─ vite.config.ts

├─ backend/api/                 (Atharv)

│  ├─ routes/                   documents.py, auth.py, ai.py, permissions.py

│  ├─ middleware/                Auth, CORS, rate limiting

│  ├─ services/                 Business logic

│  ├─ models/                   SQLAlchemy ORM

│  ├─ schemas/                  Pydantic request/response

│  └─ main.py

├─ backend/ai/                  (Temiko)

│  ├─ prompts.py                Templates per feature

│  ├─ groq\_client.py            Groq wrapper \+ streaming

│  ├─ router.py                 /ai/\* routes

│  └─ quota.py                  Per-user token quota

├─ backend/collab/              (Teya)

│  ├─ server.js                 y-websocket entry

│  └─ persistence.js            Postgres snapshot adapter

├─ shared/types/                Pydantic → TypeScript via datamodel-code-generator

├─ shared/constants/            Roles, AI features, error codes

├─ infra/                       (Teya)

│  ├─ render.yaml               Render Blueprint

│  ├─ .env.example              Env var template

│  └─ init.sql                  DB init script

├─ tests/unit/                  Per-module unit tests

├─ tests/integration/           API integration tests

├─ tests/e2e/                   Playwright

└─ .github/workflows/           CI/CD

 

# **PROJECT MANAGEMENT**

## **Team Roles & Ownership**

| Person | Area | Owns | Key Decisions They Make |
| :---- | :---- | :---- | :---- |
| Teya | Infrastructure & DB | PostgreSQL schema, Render deploy, y-websocket server, CI/CD, env config, DB migrations | Data model, deploy strategy, collab server config |
| Tanisha | Frontend | React SPA, Tiptap editor, Yjs client, React Query, Zustand, UI components, a11y | Editor UX, AI suggestion display, presence viz, component architecture |
| Temiko | AI Integration | Groq client, prompt engineering, SSE streaming, quota enforcement, AI logging | Context window strategy, prompt design, cost control, model selection |
| Atharv | Backend / API | FastAPI routes, auth middleware, doc CRUD, permission enforcement, API contract, error handling | API design, auth flow, RBAC, endpoint structure |

 

**Cross-cutting features:** Primary domain owner creates PR, requests reviews from affected owners. Cross-cutting PRs need 2 approvals.

**Disagreements:** Proposer writes brief ADR in GitHub issue. Team discusses async. Majority vote. Tie \= most-affected module owner decides. All decisions recorded in decisions/ dir.

## **Development Methodology**

**Scrum-lite. 2-week sprints.** 

•     Sprint planning (Monday week 1), daily async standups (Slack/Discord), review \+ retro (Friday week 2\)

•     Backlog in GitHub Projects (Kanban: Backlog → Sprint → In Progress → In Review → Done)

•     GitHub Issues with labels: frontend, backend, ai, infra \+ priority P0–P3

•     Sprint 1 \= foundation sprint: 80% infra, 20% PoC. Explicitly budgets non-visible work.

•     Prioritization: (1) architectural dependencies first, (2) user-facing core value, (3) risk reduction

## **Branching & Code Review**

**GitHub Flow \+ feature branches.**

•     Branch naming: \<owner\>/\<type\>/\<desc\> (e.g. temiko/feat/ai-rewrite-streaming)

•     Types: feat, fix, refactor, docs, test

•     All merges to main via PR. Squash merge for linear history.

•     1 approval minimum (someone who doesn’t own the primary module). Cross-cutting \= 2 approvals.

•     Review criteria: correctness, test coverage, no hardcoded secrets, naming consistency, error handling

•     24-hour review turnaround target

## **Communication Plan**

•     Daily async standup (Slack/Discord): what I did, what I’m doing, blockers

•     Weekly 30-min sync: sprint review \+ planning

•     All technical decisions documented in GitHub Issues or decisions/ dir — not in ephemeral chat

•     API contract changes require cross-team PR \+ discussion

## **Definition of Done**

*A feature is “done” when all of the following are true:*

•     Code merged to main via approved PR

•     Unit tests pass for new/changed logic

•     Integration test covers the happy path \+ one error case

•     API endpoints match Pydantic schemas (contract test passes)

•     No hardcoded secrets or credentials

•     Works in local dev environment (clone → install → run)

•     README updated if setup steps changed

 

## **Risk Assessment**

| Risk | L | I | Mitigation | Contingency |
| :---- | :---- | :---- | :---- | :---- |
| Groq API outage/rate-limit during demo | M | H | Mock AI mode with cached responses. Test against rate limits pre-demo. | Switch to mock mode. Pre-record backup demo video. |
| Yjs sync produces inconsistent state | L | Crit | Automated concurrent edit tests. Periodic persistence \= recovery points. | Revert to last persisted snapshot. Document \+ fix root cause. |
| AI costs exceed budget | M | M | Strict dev quotas (10k tokens/day). Mock AI in tests. Weekly Groq dashboard check. | Reduce context window. Downgrade to llama-3.1-8b for lower-stakes features. |
| y-websocket single instance bottleneck | L | H | Acknowledged limitation. Health checks \+ auto-restart on Render. | Document. Point to Hocuspocus \+ Redis pub/sub as production path. |
| Team member unavailable mid-sprint | M | M | Documented setup per module. Pair programming in Sprint 1 builds cross-knowledge. | Others pick up using API contracts \+ docs. Defer non-critical work. |
| Frontend–backend API contract drift | M | M | Shared Pydantic → TypeScript generation. Integration tests validate schemas in CI. | Freeze features → contract alignment sprint focused on integration testing. |
| Merge conflicts from monorepo | M | L | Clear directory ownership. Path-based CI triggers. Small, frequent PRs. | Pair on conflict resolution. Worst case: rebase from clean main. |

 

## **Sprint Timeline**

| Sprint | Milestone | Done When |
| :---- | :---- | :---- |
| S1: Foundation | PoC: frontend talks to backend; data contracts validated | React loads; POST/GET /documents works w/ correct JSON; y-websocket runs; DB schema applied; README \= clone-and-run |
| S2: Core Editing | Real-time collab between two browsers | Two tabs editing same doc; keystrokes ≤ 300 ms; cursors visible; Yjs persists to DB; JWT auth on all endpoints |
| S3: AI Integration | AI rewrite \+ summarize end-to-end with streaming | Select → stream → tracked-change → accept/reject → logged; quota enforcement returns 429 |
| S4: Permissions & Polish | RBAC enforced; version history \+ revert; export | Viewer can’t edit; commenter can’t AI; version list; revert works; PDF export |
| S5: Testing & Demo | Full integration tested; demo; docs complete | All integration tests green in CI; 3-min demo video; architecture doc final; clean Git history |

 

## **Proof of Concept Scope (Sprint 1\)**

**Demonstrates:**

•     React page with basic Tiptap editor that loads and renders

•     Frontend–backend communication: POST /api/documents, GET /api/documents/:id

•     Data contract validation: request/response JSON matches Pydantic schemas

•     Repo organized per Section 2.3 structure

•     README: prerequisites, setup, run, what it demos, what it doesn’t

**Intentionally excluded (later sprints):**

•     Real-time collab (Sprint 2\)

•     AI features (Sprint 3\)

•     Auth & permissions (Sprints 2–4)

•     Version history & export (Sprint 4\)

**PoC tech:** React 18 \+ Vite 5 \+ Tiptap 2 \+ TypeScript | Python 3.12 \+ FastAPI \+ SQLAlchemy \+ Pydantic v2 | PostgreSQL 16 (Docker for local) | npm \+ pip/venv

