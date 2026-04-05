

{0}------------------------------------------------

# Collaborative Document Editor with AI Writing Assistant

## Assignment 1: Requirements Engineering, Architecture & Proof of Concept

### **Prepared by:**

Teya, Temiko, Atharv, Tanisha

**Course:** AI1220 - Software Engineering  
Spring 2026

## Introduction ---

This report documents the requirements engineering, system architecture, and proof-of-concept for a real-time collaborative document editor with an integrated AI writing assistant. It is submitted as part of the first group assignment of the Software Engineering course (AI1220) in the Spring 2026 semester at MBZUAI.

The report covers stakeholder analysis, functional and non-functional requirements, a full C4 architecture model, data modelling, project management, and a working proof-of-concept. The technical decisions documented here will form the foundation for implementation in subsequent assignment stages.

March 2026

{1}------------------------------------------------

## 1 Requirements Engineering

### 1.1 Stakeholder Analysis

| Stakeholder                      | Goals                                                                                                           | Concerns                                                                                                                                                                              | Influence on Requirements                                                                                                                                                                                  |
|----------------------------------|-----------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| S1: Product Owners / Founders    | Deliver AI-native competitive differentiation; prioritize rapid MVP launch and cost-efficiency.                 | Scope expansion; LLM cost volatility; reputation risks from system instability.                                                                                                       | AI-assisted editing as a first-class feature; implement per-user token quotas and a lean MVP scope.                                                                                                        |
| S2: Enterprise IT Admins         | Centralized user management; comprehensive audit logging; adherence to their corporate security policies.       | Unauthorized data exfiltration via LLM APIs; lack of SSO/RBAC integration; absence of data residency controls.                                                                        | Implement administrative controls for AI configuration; maintain comprehensive audit trails for document access and AI history; ensure data-handling transparency.                                         |
| S3: LLM API Provider (Groq)      | Maintain reliable high-throughput inference; ensure equitable resource distribution, which leads to fair usage. | API key exposure; rate-limit exhaustion; excessive token consumption; multi-tenant stability                                                                                          | Implement backend-proxied AI calls; Slowing intentionally a service to prevent a system breakdown;design graceful degradation for temporary service interruptions; setting token budgets for each request. |
| S4: Privacy/ Compliance Officers | Achieve GDPR/SOC2 compliance; validate institutional data policy adherence.                                     | Violate data regulations through sharing documents' content to third-party LLM, causing cross-border data transfers; accumulate legal liability from indefinite AI logging.           | Require explicit user consent; automate 90-day AI log retention and user-deletable; Encrypt data at rest and in transit.                                                                                   |
| S5: QA / Testing Engineers       | Validate correctness of real-time synchronization, AI-generated rendering, role-based permission enforcement.   | Incur unreliable test results from non-deterministic synchronization; encounter hard-to-reproduce edge cases due to variable AI response outputs.                                     | Develop mockable AI service interfaces for isolated testing; implement deterministic Yjs conflict resolution; define structured error codes.                                                               |
| S6: DevOps / Platform Engineers  | Automate deployment, monitoring and scaling operations; maintain uptime during production deployments.          | Risk data loss during live DB migrations; expose sensitive information because of the multi-service secrets management; Face scaling limitations from stateful y-websocket singleton. | Standardize a single monorepo deployment pipeline; integrate health-check endpoints; formulate secrets management protocols for API credentials.                                                           |

{2}------------------------------------------------

### 1.2 Functional Requirements

#### FR-RT: Real-time collaboration

| ID       | Requirement                                                                                                                                                                                                         | Acceptance Criteria                                                                                                       |
|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| FR-RT-01 | Keystroke propagation: upon a user keystroke, Yjs encodes the document delta, transmits it via WebSocket to the collaboration server, which broadcasts the update to all connected clients for rendering in Tiptap. | Character changes are visible to all collaborators within 300 ms under same-region network conditions.                    |
| FR-RT-02 | Presence awareness: all connected users' avatars, cursor positions, and active text selections are rendered in perceptually distinct colours, updated in real time across all sessions.                             | Cursor position updates propagate within 500 ms; the active user list reflects connect and disconnect events immediately. |
| FR-RT-03 | Concurrent region conflict resolution: when two users edit the same paragraph within a one-second window, the Yjs CRDT algorithm merges both contributions deterministically without data loss.                     | Automated tests confirm that two clients inserting content at the same offset both appear in the final document state.    |
| FR-RT-04 | Offline resilience: upon network disconnection, local edits are preserved within the Yjs state buffer; upon reconnection, the system performs bidirectional synchronisation to reconcile diverged states.           | Simulated disconnect and reconnect sequences result in zero edit loss on either the local or remote client.               |
| FR-RT-05 | Session join: when a new user opens an existing document, the system loads the latest persisted snapshot alongside any pending Yjs updates and renders the complete current document state.                         | A newly connected client displays all document content, including edits that were in-flight at the time of joining.       |

#### FR-AI: AI Writing Assistant

| ID       | Requirement                                                                                                                                                                                                                                                                                                 | Acceptance Criteria                                                                                                                                                                                            |
|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-AI-01 | AI-assisted rewrite: the user selects a text passage and invokes the rewrite feature, upon which the backend constructs a prompt, proxies the request to the Groq LLM API, and streams the generated response back to the client via Server-Sent Events, rendering it as an inline tracked-change proposal. | The AI suggestion appears within 3 seconds of invocation and is presented as a reviewable deletion and insertion diff inline within the document.                                                              |
| FR-AI-02 | AI-assisted summarisation: the user selects a passage and invokes the summarise feature, upon which the system generates a condensed version of the selected content and presents it as a tracked-change proposal replacing the original selection.                                                         | The generated summary is measurably shorter than the original selection and is rendered as a reviewable diff that the user can accept or reject.                                                               |
| FR-AI-03 | AI-assisted translation: the user selects a passage and specifies a target language, upon which the system generates a translated version of the selected content and presents it as a tracked-change proposal, preserving the original text until an explicit acceptance action is performed.              | The translated output is produced in the correct target language and the original text remains intact and recoverable until the user accepts the proposal.                                                     |
| FR-AI-04 | Suggestion acceptance controls: the user may fully accept, fully reject, or partially accept a sub-range of an AI-generated suggestion. An undo operation must remain available following any acceptance action, allowing the user to revert the applied change.                                            | Full acceptance applies the suggestion to the document; full rejection restores the original content; partial acceptance applies only the selected sub-range; Ctrl+Z successfully reverts any accepted change. |
| FR-AI-05 | Streaming user experience: AI-generated suggestions are delivered to the client word-by-word via Server-Sent Events, accompanied by a visible generation indicator and a cancel button that allows the user to abort the operation mid-stream.                                                              | The first generated token is rendered within 1 second of invocation; cancellation immediately discards the partial result and restores the document to its pre-invocation state.                               |
| FR-AI-06 | Interaction logging: every AI feature invocation is persisted to the <code>ai_interactions</code> table, recording the invoked feature, input text, generated suggestion, and the user's subsequent action.                                                                                                 | Each log entry is created with valid foreign key references to both the associated document and the invoking user.                                                                                             |
| FR-AI-07 | Soft-lock mechanism: upon AI processing of a target paragraph, the system displays an <i>AI is processing</i> indicator to all other active collaborators and queues their edits to that region until the suggestion has been rendered or the operation has timed out.                                      | The soft lock is automatically released within 5 seconds in the event of an AI processing failure, restoring full edit access to the affected region for all collaborators.                                    |

{3}------------------------------------------------

#### FR-DM: Document Management

| ID       | Requirement                                                                                                                                                                                                                                                                                      | Acceptance Criteria                                                                                                                                                   |
|----------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-DM-01 | Document creation: upon user request, the system instantiates a new empty document, assigns the creator as the document owner, and immediately opens it in the editor interface.                                                                                                                 | The newly created document appears in the user's document list and the owner permission record is correctly set upon creation.                                        |
| FR-DM-02 | Version history: the system maintains a chronological list of document snapshots, each recording a timestamp and authoring user. Users may preview any historical version and revert to it via a non-destructive operation that creates a new snapshot rather than overwriting existing history. | The version history displays the last 50 snapshots; performing a revert operation produces a new version row in the history rather than modifying any existing entry. |
| FR-DM-03 | Document sharing: the document owner may share access with other registered users by specifying their email address and assigning a permission role, upon which a permission record is created and the shared user gains immediate access to the document.                                       | The system correctly enforces editor, commenter, and viewer roles; permission changes take effect immediately upon creation without requiring a session refresh.      |
| FR-DM-04 | Document export: the system generates a downloadable export of the current document state in the user's choice of PDF, DOCX, or Markdown format.                                                                                                                                                 | The exported file accurately reproduces all document content with basic formatting preserved across all three supported formats.                                      |
| FR-DM-05 | Soft deletion: upon owner-initiated deletion, the document is hidden from all document listings but retained in storage and remains recoverable for a period of 30 days before permanent removal.                                                                                                | Deleted documents are absent from all document list views; the document remains restorable via the API within the 30-day retention window.                            |

#### FR-UM: User Management & Authentication

| ID       | Requirement                                                                                                                                                                                                                                                           | Acceptance Criteria                                                                                                                                                                  |
|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-UM-01 | User registration and authentication: upon registration, the system stores a bcrypt-hashed password and issues a JWT access token valid for 15 minutes alongside a refresh token valid for 7 days; each refresh operation rotates the refresh token to prevent reuse. | Passwords are never stored or transmitted in plaintext; token refresh operations are transparent to the user with no visible interruption to their session.                          |
| FR-UM-02 | Role-based authorisation: the system enforces per-document permission checks on every action, including viewing, editing, commenting, AI invocation, sharing, and deletion, according to the role assigned to the requesting user.                                    | Viewers are prevented from editing; commenters are prevented from invoking AI or editing; editors are prevented from sharing; only document owners may share or delete the document. |
| FR-UM-03 | Session handling: upon JWT expiry, the system automatically attempts to obtain a new access token using the stored refresh token; if the refresh token has also expired, the user is redirected to the login screen.                                                  | No data loss occurs during a token refresh operation; the session renewal process produces no visible interruption to the user's workflow.                                           |
| FR-UM-04 | Organisation administrator configuration: organisation administrators may toggle the availability of individual AI features on a per-role basis and configure organisation-level AI usage quotas through the administration interface.                                | Configuration changes take effect on the next AI invocation; requests that exceed the configured quota receive a 429 response code.                                                  |

{4}------------------------------------------------

### 1.3 Non-Functional Requirements

#### Non-Functional Requirements

| ID         | Category     | Target                                                                                                                                                                                                       | Justification                                                                                                                                                                                                                                       |
|------------|--------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| NFR-LAT-01 | Latency      | Keystroke propagation latency must not exceed 300 ms at the 95th percentile.                                                                                                                                 | This threshold corresponds to the boundary of perceived liveness in collaborative editing. Yjs over WebSocket typically achieves sub-100 ms, providing sufficient headroom.                                                                         |
| NFR-LAT-02 | Latency      | The first AI-generated token must be delivered to the client within 1.5 seconds at the 95th percentile.                                                                                                      | Groq LPU hardware returns first tokens within 200–500 ms. The remaining budget accommodates network overhead, prompt construction, and API latency. SSE streaming makes delivery feel immediate.                                                    |
| NFR-LAT-03 | Latency      | Document load time must not exceed 2 seconds for documents up to 100 KB in size.                                                                                                                             | Google Web Vitals research identifies 2 seconds as the abandonment threshold. A 100 KB document corresponds to approximately 50,000 words, covering the vast majority of practical use cases.                                                       |
| NFR-SC-01  | Scalability  | The system must support a minimum of 20 concurrent editors per document.                                                                                                                                     | Yjs awareness protocol broadcasts with $O(n)$ complexity; at 20 concurrent users the overhead remains lightweight and covers typical collaborative team scenarios.                                                                                  |
| NFR-SC-02  | Scalability  | The system must support a minimum of 200 concurrently active documents system-wide.                                                                                                                          | This figure represents the ceiling of a single y-websocket instance. Exceeding this threshold requires horizontal scaling, which is acknowledged as a known architectural limitation.                                                               |
| NFR-SC-03  | Scalability  | The system must accommodate 50 concurrent users at demonstration and scale to 500 registered users within one year.                                                                                          | PostgreSQL handles this load comfortably. The y-websocket server represents the binding constraint; the defined upgrade path involves Hocuspocus with Redis pub/sub for horizontal scaling.                                                         |
| NFR-AV-01  | Availability | The system must maintain 99.5% monthly uptime, corresponding to a maximum of approximately 3.6 hours of downtime per month.                                                                                  | This target is realistic for a Render-hosted deployment without multi-region redundancy and represents an appropriate baseline for the project's context.                                                                                           |
| NFR-AV-02  | Availability | The system must tolerate partial service failures without complete loss of functionality.                                                                                                                    | WebSocket server failure permits continued local editing via Yjs offline mode. API failure disables AI and CRUD operations while editing remains functional. Groq unavailability disables AI features only, leaving all other functionality intact. |
| NFR-SP-01  | Security     | TLS 1.2 or higher must be enforced on all connections, including HTTPS and WSS.                                                                                                                              | Render provides TLS termination by default, satisfying this requirement without additional configuration.                                                                                                                                           |
| NFR-SP-02  | Security     | All data at rest must be encrypted using AES-256.                                                                                                                                                            | Render-managed PostgreSQL applies AES-256 encryption by default; all automated backups inherit the same encryption policy.                                                                                                                          |
| NFR-SP-03  | Security     | Data transmitted to the Groq API must be limited to the user's selection and a maximum of 500 tokens of surrounding context. The full document must never be transmitted unless the user explicitly opts in. | This constraint serves dual purposes of cost control and privacy protection. Groq enterprise terms specify that input data is not used for model training and is not retained beyond the duration of the request.                                   |
| NFR-SP-04  | Security     | AI interaction logs must be automatically purged after 90 days and must be deletable by the user on demand.                                                                                                  | Automated retention limits reduce legal liability and ensure compliance with data minimisation principles under applicable privacy regulations.                                                                                                     |

{5}------------------------------------------------

| ID        | Category  | Target                                                                                                                                                                                                                                                            | Justification                                                                                                                                                         |
|-----------|-----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| NFR-US-01 | Usability | When more than 10 collaborators are active, the interface must display a condensed badge indicating the number of additional users. Cursor colours must be drawn from a 20-colour perceptually distinct palette, with edge markers indicating off-screen cursors. | These constraints prevent interface clutter and maintain usability at scale, ensuring the collaborative presence layer does not obstruct the editing experience.      |
| NFR-US-02 | Usability | AI features must be accessible via three interaction methods: a floating toolbar appearing on text selection, a right-click context menu, and keyboard shortcuts (Ctrl+Shift+R for rewrite; Ctrl+Shift+S for summarise).                                          | Providing multiple access points improves feature discoverability and accommodates different user interaction preferences and workflows.                              |
| NFR-US-03 | Usability | The interface must conform to WCAG 2.1 Level AA. All functionality must be keyboard-navigable, AI suggestions must be announced by screen readers, and colour must never serve as the sole indicator of system state.                                             | WCAG 2.1 AA represents the accepted accessibility baseline for professional software products, ensuring the platform is usable by users with a range of disabilities. |

#### Requirements Prioritisation

| Priority                  | Requirements                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|---------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Must Have (MVP)           | FR-RT-01 (keystroke propagation), FR-RT-02 (presence awareness), FR-RT-03 (conflict resolution), FR-AI-01 (rewrite), FR-AI-04 (accept/reject), FR-AI-05 (streaming), FR-AI-06 (interaction logging), FR-DM-01 (document creation), FR-DM-03 (sharing), FR-UM-01 (authentication), FR-UM-02 (RBAC), NFR-LAT-01 (keystroke latency), NFR-SP-01 (TLS).                                                                                                                                                         |
| Should Have               | FR-RT-04 (offline resilience), FR-RT-05 (session join), FR-AI-02 (summarisation), FR-AI-03 (translation), FR-AI-07 (soft lock), FR-DM-02 (version history), FR-DM-04 (export), FR-UM-03 (session handling), NFR-LAT-02 (AI first token), NFR-LAT-03 (document load), NFR-SC-01 (concurrent editors), NFR-SC-02 (concurrent documents), NFR-SC-03 (user growth), NFR-AV-01 (uptime), NFR-AV-02 (partial failure), NFR-SP-02 (encryption at rest), NFR-US-01 (collaborator UI), NFR-US-02 (AI access points). |
| Could Have                | FR-DM-05 (soft deletion), FR-UM-04 (organisation admin configuration), FR-AI-04 partial acceptance (advanced sub-range), NFR-US-03 (full WCAG 2.1 AA), NFR-SP-03 (minimal Groq context), NFR-SP-04 (automated log purge).                                                                                                                                                                                                                                                                                   |
| Won't Have (this project) | SSO/OAuth integration; link-based document sharing; team-based permission groups; horizontal collaboration server scaling; real-time commenting system; mobile-optimised user interface.                                                                                                                                                                                                                                                                                                                    |

### 1.4 User Stories and Scenarios

| ID    | Story                                                                                                                        | Expected Behaviour                                                                                                                                                  |
|-------|------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| US-01 | As an editor, I want to see collaborators' cursors and selections in real time so that I can avoid editing the same region.  | Each remote cursor is rendered with a distinct colour and name label; selections are highlighted; cursor updates propagate within 500 ms.                           |
| US-02 | As a user who loses connectivity, I want local edits preserved and synchronised upon reconnection so that I never lose work. | Yjs buffers edits locally during disconnection; reconnection triggers bidirectional synchronisation; a toast notification confirms successful sync.                 |
| US-03 | As a collaborator, when two users edit the same paragraph simultaneously, I expect both edits to be preserved.               | Yjs CRDT convergence ensures both insertions are present in the final document state, ordered by client ID tiebreaker.                                              |
| US-04 | As a team lead, I want to revert to a previous document version while others are actively editing.                           | Revert creates a new snapshot applied as a Yjs update; collaborators see the reverted state with their in-flight edits merged on top; a notification is dispatched. |

{6}------------------------------------------------

| ID    | Story                                                                                                                        | Expected Behaviour                                                                                                                                                                                              |
|-------|------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| US-05 | As a writer, I want to select text and request an AI rewrite in a more formal register.                                      | The suggestion streams as a tracked-change proposal with strikethrough on the original and highlighted insertion; accept, reject, and partial accept are available; the original is preserved until acceptance. |
| US-06 | As a researcher, I want to select a long section and receive an AI-generated summary.                                        | The summary replaces the selection as a tracked-change proposal; it is measurably shorter than the original; a side-by-side comparison is presented before the user decides.                                    |
| US-07 | As an international collaborator, I want to translate selected text into another language without leaving the editor.        | A language picker triggers a translated tracked-change proposal; the original text is preserved until the user explicitly accepts.                                                                              |
| US-08 | As a user, I want to accept only a portion of an AI suggestion and discard the remainder.                                    | The user selects a sub-range within the suggestion and accepts only that portion; the remainder is discarded; the operation is implemented as a Yjs transaction.                                                |
| US-09 | As a user, when AI is generating a suggestion and I wish to abort, I want to cancel the operation mid-stream.                | Cancellation aborts the SSE stream, discards the partial result, and restores the document to its pre-invocation state; no log entry is created for cancelled operations.                                       |
| US-10 | As a document owner, I want to share the document with specific users at different permission levels.                        | The share dialog accepts an email address and role; input is validated against registered users; the shared user gains access immediately; permissions are enforced at the API level.                           |
| US-11 | As a user, I want to export the document as a PDF with or without tracked AI changes visible.                                | Two export options are provided: a clean version with all changes applied, and a marked-up version with insertions and deletions visible; both are generated server-side.                                       |
| US-12 | As a commenter, when I attempt to invoke the AI assistant, the system should inform me that editor permissions are required. | AI action buttons are visible but disabled, with an explanatory tooltip; the backend returns HTTP 403 with a descriptive error message.                                                                         |
| US-13 | As an organisation administrator, I want to control which AI features are available to each role.                            | The admin panel provides per-feature toggles per role; changes take effect immediately and are enforced by the backend on subsequent requests.                                                                  |
| US-14 | As a viewer, any attempt to edit the document should be gracefully prevented by the system.                                  | Tiptap renders in read-only mode; keyboard input is suppressed; a prominent banner communicates the user's view-only access status.                                                                             |

{7}------------------------------------------------

### 1.5 Requirements Traceability

| User Story | FRs                          | NFRs                  | Architecture Component(s)                                         |
|------------|------------------------------|-----------------------|-------------------------------------------------------------------|
| US-01      | FR-RT-02                     | NFR-LAT-01, NFR-US-01 | Frontend (Tiptap + Yjs Awareness), Collab Server                  |
| US-02      | FR-RT-04                     | NFR-AV-02             | Frontend (Yjs offline), Collab Server (sync protocol)             |
| US-03      | FR-RT-03                     | NFR-LAT-01            | Frontend (Yjs CRDT), Collab Server (broadcast)                    |
| US-04      | FR-DM-02                     | —                     | Backend API (version endpoints), DB (document_versions), Frontend |
| US-05      | FR-AI-01, FR-AI-04, FR-AI-06 | NFR-LAT-02, NFR-SP-03 | AI Service, Backend API (SSE), Frontend (tracked-change UI)       |
| US-06      | FR-AI-02, FR-AI-04, FR-AI-06 | NFR-LAT-02            | AI Service, Backend API, Frontend                                 |
| US-07      | FR-AI-03, FR-AI-04, FR-AI-06 | NFR-LAT-02            | AI Service, Backend API, Frontend                                 |
| US-08      | FR-AI-04                     | —                     | Frontend (Tiptap selection + Yjs transaction)                     |
| US-09      | FR-AI-05                     | —                     | Frontend (SSE abort), Backend API (stream cancel)                 |
| US-10      | FR-DM-03, FR-UM-02           | NFR-SP-01             | Backend API (permissions), DB, Frontend (share dialog)            |
| US-11      | FR-DM-04                     | —                     | Backend API (export endpoint), Frontend                           |
| US-12      | FR-UM-02, FR-AI-01           | —                     | Backend API (auth middleware), Frontend (disabled UI)             |
| US-13      | FR-UM-04                     | —                     | Backend API (admin endpoints), DB (org settings), Frontend        |
| US-14      | FR-UM-02                     | NFR-US-03             | Frontend (Tiptap read-only), Backend API (auth middleware)        |

## 2 System Architecture

### 2.1 Architectural Drivers

| Rank | Driver                                      | Architectural Impact                                                                                                                                                                                   |
|------|---------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1    | Real-time collaboration correctness         | Mandated the selection of Yjs and Tiptap; required a dedicated WebSocket collaboration process; favoured CRDT over OT; necessitated persistent WebSocket connections over polling.                     |
| 2    | AI as a first-class editing feature         | AI suggestions are embedded as tracked changes within the CRDT rather than rendered in a sidebar; enforces the soft-lock policy and Yjs transactions for accept and reject operations.                 |
| 3    | Latency sensitivity                         | WebSocket preferred over polling for synchronisation; SSE adopted for AI response streaming; Groq selected over lower-throughput LLM providers; all services co-located within the same Render region. |
| 4    | Security and data privacy                   | All AI requests are proxied through the backend; minimal document context is transmitted to Groq; short-lived JWT tokens are used; AI interaction logs are retained for a maximum of 90 days.          |
| 5    | Developer velocity (4-person team, 1 month) | Monorepo adopted for simplified coordination; AI service implemented as a module within FastAPI rather than a separate microservice; clear directory ownership assigned per team member.               |

### 2.2 System Design using the C4 Model

#### Level 1 - System Context Diagram

```

---
title: C4 Level 1 - system context
---

graph TB
  user["<lt><person>><gt><br/> <b>Document User</b> <br/> <small> Creates/edits docs,<br/> invokes AI, collaborates </small>"]

```

{8}------------------------------------------------

admin["<<person>>  
**Organization Admin**  
Configures roles,  
AI feature toggles,  
quotas"]

system["<<system>>  
**Collaborative Document Editor**  
Real-time collaborative editing  
platform with integrated  
AI writing assistant"]

groq["<<external system>>  
**Groq LLM API**  
Receives prompt,  
returns streamed completion"]

email["<<external system>>  
**Email Service (future)**  
Sends sharing notifications"]

```

user -->|"HTTPS REST + WSS"| system
admin -->|"HTTPS REST"| system
system -->|"HTTPS"| groq
system -->|"SMTP"| email

```

```

style user fill:#08427b,color:#fff,stroke:#fff
style admin fill:#08427b,color:#fff,stroke:#fff
style system fill:#1168bd,color:#fff,stroke:#fff
style groq fill:#999,color:#fff,stroke:#fff
style email fill:#999,color:#fff,stroke:#fff

```

![C4 Level 1 - system context diagram](dbe553cf16dd14073b89a8263a428664_img.jpg)

C4 Level 1 - system context

```

graph TD
    user["<<person>>  
Document User  
Creates/edits docs,  
invokes AI, collaborates"]
    admin["<<person>>  
Organization Admin  
Configures roles,  
AI feature toggles, quotas"]
    system["<<system>>  
Collaborative Document Editor  
Real-time collaborative editing  
platform with integrated  
AI writing assistant"]
    groq["<<external system>>  
Groq LLM API  
Receives prompt,  
returns streamed completion"]
    email["<<external system>>  
Email Service (future)  
Sends sharing notifications"]

    user -->|"HTTPS REST + WSS"| system
    admin -->|"HTTPS REST"| system
    system -->|"HTTPS"| groq
    system -->|"SMTP"| email

    style user fill:#08427b,color:#fff,stroke:#fff
    style admin fill:#08427b,color:#fff,stroke:#fff
    style system fill:#1168bd,color:#fff,stroke:#fff
    style groq fill:#999,color:#fff,stroke:#fff
    style email fill:#999,color:#fff,stroke:#fff

```

C4 Level 1 - system context diagram

The system interacts with two humans and two external systems. Document Users access the platform via HTTPS REST for standard operations and WSS for real-time synchronisation, while Organisation Admins interact exclusively via HTTPS REST to manage roles and quotas. The system makes outbound HTTPS calls to the Groq LLM API for AI processing, and will communicate with an Email Service via SMTP for sharing notifications in a future release.

#### Level 2 - Container Diagram

---

title: C4 Level 2 - Containers

---

graph TB

user["<<person>>  
**Document User**  
Creates/edits docs,  
invokes AI,"]

{9}------------------------------------------------

```

user["<<person>>  
User  
Writes and  
collaborates"]

admin["<<person>>  
Organization Admin  
Configures roles,  
AI feature toggles,  
quotas"]

groq["<<external system>>  
Groq LLM API  
LLM inference,  
streamed  
completions"]

subgraph system[" "]
  spa["<<container>>  
React SPA  
React 18, Tiptap, Yjs,  
React Query, Zustand  
  
Editor UI, Yjs client CRDT,  
AI suggestion display,  
doc management"]
  api["<<container>>  
FastAPI Backend  
Python 3.12, FastAPI,  
SQLAlchemy,  
Pydantic  
  
Auth, doc CRUD, versions,  
AI proxy, permissions, admin"]
  collab["<<container>>  
y-websocket Server  
Node.js 20, y-websocket  
  
CRDT sync, presence  
broadcast, snapshot persistence"]
  db[("<<database>>  
PostgreSQL  
PostgreSQL 16, Render managed  
  
Users, docs, versions,  
permissions, AI logs")]
  systemlabel["Collaborative Document Editor"]
end

user -->|"HTTPS REST"| spa
user <-->|"WebSocket - Yjs binary"| spa
admin -->|"HTTPS REST"| spa
spa -->|"HTTPS REST"| api
spa <-->|"WebSocket - Yjs binary"| collab
api -->|"HTTPS"| groq
api -->|"SQL"| db
collab -->|"SQL"| db

style user fill:#08427b,color:#fff,stroke:#fff
style admin fill:#08427b,color:#fff,stroke:#fff
style groq fill:#999,color:#fff,stroke:#fff
style spa fill:#1168bd,color:#fff,stroke:#fff
style api fill:#1168bd,color:#fff,stroke:#fff
style collab fill:#1168bd,color:#fff,stroke:#fff
style db fill:#1168bd,color:#fff,stroke:#fff
style system fill:#transparent,stroke:#1168bd,stroke-width:2px,color:#1168bd
style systemlabel fill:#transparent,stroke:none,color:#1168bd,font-weight:bold

```

{10}------------------------------------------------

![C4 Level 2 - Containers diagram showing the architecture of a collaborative document editor. It includes two external users (Document User and Organization Admin), a React SPA container, a FastAPI Backend container, a y-websocket Server container, a PostgreSQL database, and an external Groq LLM API system. The React SPA connects to the FastAPI Backend via HTTPS REST and to the y-websocket Server via WebSocket. The FastAPI Backend and y-websocket Server both connect to the PostgreSQL database via SQL. The FastAPI Backend also connects to the Groq LLM API via HTTPS.](cfef993dcc8fb513de79eb1f93cf26ae_img.jpg)

C4 Level 2 - Containers

```

graph TD
    subgraph C4_Level_2 [C4 Level 2 - Containers]
        ReactSPA["<<container>>  
React SPA  
React 18, Tiptap, Yjs,  
React Query, Zustand  
  
Editor UI, Yjs client CRDT,  
AI suggestion display,  
doc management"]
        FastAPIBackend["<<container>>  
FastAPI Backend  
Python 3.12, FastAPI,  
SQLAlchemy, Pydantic  
  
Auth, doc CRUD, versions,  
AI proxy, permissions, admin"]
        yWebsocketServer["<<container>>  
y-websocket Server  
Node.js 20, y-websocket  
  
CRDT sync, presence  
broadcast, snapshot persistence"]
        PostgreSQL["<<database>>  
PostgreSQL  
PostgreSQL 16, Render managed  
  
Users, docs, versions,  
permissions, AI logs"]
        ReactSPA -- "HTTPS REST" --> FastAPIBackend
        ReactSPA -- "WebSocket - Yjs binary" --> yWebsocketServer
        FastAPIBackend -- "HTTPS" --> GroqLLMAPI["<<external system>>  
Groq LLM API  
LLM inference,  
streamed completions"]
        FastAPIBackend -- "SQL" --> PostgreSQL
        yWebsocketServer -- "SQL" --> PostgreSQL
    end
    DocumentUser["<<person>>  
Document User  
Creates/edits docs,  
invokes AI, collaborates"]
    OrganizationAdmin["<<person>>  
Organization Admin  
Configures roles,  
AI feature toggles, quotas"]
    DocumentUser -- "HTTPS REST" --> ReactSPA
    DocumentUser -- "WebSocket - Yjs binary" --> ReactSPA
    OrganizationAdmin -- "HTTPS REST" --> ReactSPA
    CollaborativeDocumentEditor["Collaborative Document Editor"]
    ReactSPA --- CollaborativeDocumentEditor
  
```

C4 Level 2 - Containers diagram showing the architecture of a collaborative document editor. It includes two external users (Document User and Organization Admin), a React SPA container, a FastAPI Backend container, a y-websocket Server container, a PostgreSQL database, and an external Groq LLM API system. The React SPA connects to the FastAPI Backend via HTTPS REST and to the y-websocket Server via WebSocket. The FastAPI Backend and y-websocket Server both connect to the PostgreSQL database via SQL. The FastAPI Backend also connects to the Groq LLM API via HTTPS.

The platform comprises four containers. The React SPA is the client-facing interface, connecting to the FastAPI Backend over HTTPS REST for data operations and to the y-websocket Server over a WebSocket connection for CRDT-based real-time synchronisation. The FastAPI Backend handles core business logic and proxies AI requests outbound to Groq. Both the backend and the collaboration server persist data to a shared PostgreSQL database.

#### Level 3 - Component Diagram

```

---
title: C4 Level 3 - Components
---
graph TB
    spa["<lt><container>>  
<b>React SPA</b>  
<small>Sends HTTP requests,  
<br>receives SSE streams</small>"]
    groq["<lt><external system>>  
<b>Groq LLM API</b>  
<small>Streams completions</small>"]
    db["<lt><database>>  
<b>PostgreSQL</b>  
<small>Persistent storage</small>"]
    subgraph api ["FastAPI Backend"]
        router["<lt><component>>  
<b>API Router Layer</b>  
<small>FastAPI route decorators  
<br>Maps HTTP routes  
<br>to controllers</small>"]
        auth["<lt><component>>  
<b>Auth Middleware</b>  
<small>Depends() injection  
<br>JWT validation, identity  
<br>extraction, role-based access</small>"]
        docctrl["<lt><component>>  
<b>Document Controller</b>  
<small>/documents/*  
<br>Doc CRUD, version  
<br>history, revert, export</small>"]
        aictrl["<lt><component>>  
<b>AI Controller</b>  
<small>/ai/*  
<br>AI invocation, SSE  
<br>streaming, interaction logging</small>"]
        userctrl["<lt><component>>  
<b>User Controller</b>  
<small>/auth/*, /users/*  
<br>Registration, login,  
<br>token refresh, profile</small>"]
        permctrl["<lt><component>>  
<b>Permission Controller</b>  
<small>/documents/{id}/permissions/"]
    end
    spa -- "HTTPS REST" --> router
    spa -- "WebSocket - Yjs binary" --> yWebsocketServer
    spa -- "HTTPS REST" --> OrganizationAdmin
    spa --- CollaborativeDocumentEditor
    groq -- "HTTPS" --> docctrl
    spa -- "SQL" --> db
    docctrl -- "SQL" --> db
    aictrl -- "SQL" --> db
    userctrl -- "SQL" --> db
    permctrl -- "SQL" --> db
  
```

{11}------------------------------------------------

```

*  

<br/>Permission CRUD,<br/>role validation</small>"]
aisvc["<lt><lt>component>>gt;<br/><b>AI Service</b><br/><small>Internal Python module<br/>
<br/>Prompt construction,<br/>Groq calls, quota enforcement</small>"]
prompt["<lt><lt>component>>gt;<br/><b>Prompt Engine</b><br/><small>Python functions<br/>

<br/>Templates for rewrite,<br/>summarize, translate,<br/>restructure</small>"]
groqclient["<lt><lt>component>>gt;<br/><b>Groq API Client</b><br/><small>Async Python class<br/>
<br/>HTTP client, streaming,<br/>retry, timeout</small>"]
repo["<lt><lt>component>>gt;<br/><b>Repository Layer</b><br/><small>Python classes w/ CRUD<br/>

<br/>SQLAlchemy models +<br/>query methods.<br/>Single DB access point</small>"]
end

spa -->|"HTTPS REST + SSE"| router
router --> auth
auth --> docctrl
auth --> aictrl
auth --> userctrl
auth --> permctrl
aictrl --> aisvc
aisvc --> prompt
aisvc --> groqclient
groqclient -->|"HTTPS"| groq
docctrl --> repo
aictrl --> repo
userctrl --> repo
permctrl --> repo
aisvc --> repo
repo -->|"SQL"| db

style spa fill:#1168bd,color:#fff,stroke:#fff
style groq fill:#999,color:#fff,stroke:#fff
style db fill:#1168bd,color:#fff,stroke:#fff
style router fill:#2a5fa5,color:#fff,stroke:#fff
style auth fill:#2a5fa5,color:#fff,stroke:#fff
style docctrl fill:#2a5fa5,color:#fff,stroke:#fff
style aictrl fill:#2a5fa5,color:#fff,stroke:#fff
style userctrl fill:#2a5fa5,color:#fff,stroke:#fff
style permctrl fill:#2a5fa5,color:#fff,stroke:#fff
style aisvc fill:#2a5fa5,color:#fff,stroke:#fff
style prompt fill:#2a5fa5,color:#fff,stroke:#fff
style groqclient fill:#2a5fa5,color:#fff,stroke:#fff
style repo fill:#2a5fa5,color:#fff,stroke:#fff
style api fill:#transparent,stroke:#1168bd,stroke-width:2px,color:#1168bd

```

{12}------------------------------------------------

![C4 Level 3 Component Diagram for a FastAPI Backend architecture](4e4be0bd8b235167902f2c03e41da651_img.jpg)

```

graph TD
    ReactSPA["<<container>>  
React SPA  
Sends HTTP requests,  
receives SSE streams"] 
    
    subgraph FastAPI_Backend [FastAPI Backend]
        APIRouter["<<component>>  
API Router Layer  
FastAPI route decorators  
Maps HTTP routes  
to controllers"]
        
        AuthMiddleware["<<component>>  
Auth Middleware  
Depends() injection  
JWT validation, identity  
extraction, role-based access"]
        
        AIController["<<component>>  
AI Controller  
/ai/*  
AI invocation, SSE  
streaming, interaction logging"]
        
        DocumentController["<<component>>  
Document Controller  
/documents/*  
Doc CRUD, version  
history, revert, export"]
        
        AIService["<<component>>  
AI Service  
Internal Python module  
Prompt construction,  
Groq calls, quota enforcement"]
        
        UserController["<<component>>  
User Controller  
/auth/, /users/  
Registration, login,  
token refresh, profile"]
        
        PermissionController["<<component>>  
Permission Controller  
/documents/{id}/permissions/*  
Permission CRUD,  
role validation"]
        
        PromptEngine["<<component>>  
Prompt Engine  
Python functions  
Templates for rewrite,  
summarize, translate,  
restructure"]
        
        GroqAPIClient["<<component>>  
Groq API Client  
Async Python class  
HTTP client, streaming,  
retry, timeout"]
        
        RepositoryLayer["<<component>>  
Repository Layer  
Python classes w/ CRUD  
SQLAlchemy models +  
query methods.  
Single DB access point"]
    end

    GroqLLM["<<external system>>  
Groq LLM API  
Streams completions"]
    
    PostgreSQL[("<<database>>  
PostgreSQL  
Persistent storage")]

    ReactSPA -- "HTTPS REST + SSE" --> APIRouter
    APIRouter --> AuthMiddleware
    
    AuthMiddleware --> DocumentController
    AuthMiddleware --> AIController
    AuthMiddleware --> UserController
    AuthMiddleware --> PermissionController
    
    AIController --> AIService
    AIController --> RepositoryLayer
    
    DocumentController --> RepositoryLayer
    DocumentController --> PromptEngine
    
    AIService --> PromptEngine
    AIService --> GroqAPIClient
    AIService --> RepositoryLayer
    
    UserController --> RepositoryLayer
    PermissionController --> RepositoryLayer
    
    PromptEngine --> GroqAPIClient
    
    GroqAPIClient -- "HTTPS" --> GroqLLM
    RepositoryLayer -- "SQL" --> PostgreSQL
    
```

C4 Level 3 Component Diagram for a FastAPI Backend architecture

All inbound requests enter through the API Router Layer and pass through the Auth Middleware before reaching any controller. The four controllers - Document, AI, User, and Permission - each delegate persistence to the Repository Layer as the single database access point. The AI Controller further delegates to the AI Service, which constructs prompts via the Prompt Engine and executes LLM requests through the Groq API Client.

{13}------------------------------------------------

#### 2.2.1 Feature Decomposition

The system will be decomposed into six modules, each with a clearly defined responsibility, set of dependencies, and exposed interface. This structure will allow each module to be developed and tested independently.

**Rich-Text Editor.** The editor module will be built on Tiptap 2 (ProseMirror), extended with custom nodes for AI suggestion rendering and soft-lock indicators. It will be responsible for all user-facing editing interactions, including text input, selection, tracked-change display, and read-only enforcement per role. Frontend state will be managed across three Zustand stores: `authStore` (user identity and token), `editorStore` (document metadata and editor instance), and `aiStore` (AI suggestion state and streaming status). Server state, including document fetching and mutation, will be handled by React Query. This module will depend on the real-time synchronisation layer for CRDT integration and on the API layer for document CRUD operations. It will expose editor events and selection context to the AI module, and will render permission state received from the auth module.

**Real-Time Synchronisation Layer.** This module will be responsible for propagating document edits between all connected clients with conflict-free guarantees. It will be implemented using Yjs on the client side, bound to the Tiptap editor via y-prosemirror, and synchronised through a y-websocket server. The CRDT will ensure that concurrent edits to the same region are merged deterministically without data loss. Presence information - cursor positions, selections, and connected users — will be broadcast via the Yjs Awareness protocol at no additional implementation cost. The y-websocket server will persist full Yjs state snapshots to PostgreSQL every 30 seconds when the document has changed. This module will depend on the database for snapshot storage and will expose a WebSocket interface to the React SPA. It will have no dependency on the FastAPI backend at runtime.

**AI Assistant Service.** The AI module will manage the full lifecycle of AI feature invocations, from prompt construction to streaming delivery and interaction logging. It will be implemented as an internal Python module within the FastAPI backend, comprising the AI Controller, AI Service, Prompt Engine, and Groq API Client. When a user invokes an AI feature, the AI Controller will receive the request, delegate prompt construction to the Prompt Engine, and pass the result to the Groq API Client, which will stream the response back to the client via SSE. Every invocation will be logged to the `ai_interactions` table. This module will depend on the Repository Layer for quota enforcement and logging, and on the Groq LLM API as an external dependency. It will expose `/ai/*` endpoints to the frontend and will enforce per-user and per-organisation token quotas.

**Document Storage and Versioning.** This module will handle a document lifecycle, including creation, retrieval, versioning, sharing, export, and soft deletion. Document content will not be stored as a database column - the canonical content will be the Yjs binary state persisted in the `document_versions` table. Version history will be append-only; revert operations will create a new snapshot rather than overwriting existing history. The module will be implemented through the Document Controller and Repository Layer within the FastAPI backend. It will depend on the authentication module for ownership verification and on the database for persistence. It will expose `/documents/*` endpoints to the frontend.

**User Authentication and Authorisation.** This module will control identity verification and access enforcement across all system operations. Authentication will be stateless, using short-lived JWT access tokens (15 minutes) and rotating refresh tokens (7 days). Authorisation will be role-based and per-document, enforced on every API request via the Auth Middleware using FastAPI's `Depends()` injection mechanism. Four roles will be defined - owner, editor, commenter, and viewer - each with a distinct permission set covering editing, AI invocation, version management, sharing, and export. This module will be implemented through the User Controller and Auth Middleware. It will expose `/auth/*` and `/users/*` endpoints and will provide an authentication dependency consumed by all other controllers.

**Role-Permission Matrix**

| Action                     | Owner               | Editor | Commenter | Viewer |
|----------------------------|---------------------|--------|-----------|--------|
| View document              | ✓                   | ✓      | ✓         | ✓      |
| Edit content               | ✓                   | ✓      | ✗         | ✗      |
| Add comments               | ✓                   | ✓      | ✓         | ✗      |
| Invoke AI                  | ✓                   | ✓      | ✗         | ✗      |
| Accept / reject AI         | ✓                   | ✓      | ✗         | ✗      |
| View version history       | ✓                   | ✓      | ✓         | ✗      |
| Revert to version          | ✓                   | ✓      | ✗         | ✗      |
| Share / manage permissions | ✓                   | ✗      | ✗         | ✗      |
| Delete document            | ✓                   | ✗      | ✗         | ✗      |
| Export                     | ✓                   | ✓      | ✓         | ✓      |
| Configure AI               | Original Admin only |        |           |        |

**API Layer.** The API layer will connect the React SPA to all backend services through a structured set of REST endpoints implemented in FastAPI. It will be responsible for request routing, input validation via Pydantic schemas, error normalisation, and SSE stream management for AI responses. All endpoints will return JSON; errors will follow a consistent format of `{error, code, (detail)}`. The API layer will depend on all backend modules and will expose a versioned HTTP interface to the frontend. Shared Pydantic-to-TypeScript type generation will ensure contract consistency across the boundary.

{14}------------------------------------------------

##### Decided Technology Stack

| Layer              | Technology                     | Justification                                                                                                                                                                                                                               |
|--------------------|--------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Frontend Framework | React 18                       | Team familiarity; largest ecosystem; first-class Tiptap integration.                                                                                                                                                                        |
| Rich Text Editor   | Tiptap 2 (ProseMirror)         | Native Yjs support via y-prosemirror; extensible for custom AI suggestion nodes; superior developer experience over raw ProseMirror.                                                                                                        |
| CRDT Library       | Yjs 13                         | Most mature JavaScript CRDT; built-in awareness for cursors and presence, offline support, and sub-document editing. Automerge rejected for weaker rich-text support; ShareDB rejected due to OT complexity and limited offline capability. |
| CRDT Sync Server   | y-websocket                    | Reference Yjs synchronisation implementation; lightweight and well-tested. Known limitation: single-instance, no horizontal scaling.                                                                                                        |
| Build Tool         | Vite 5                         | Fast HMR for React development; simpler configuration than Webpack.                                                                                                                                                                         |
| Client State       | Zustand 4                      | Lightweight global state management for auth, editor metadata, and AI state. Redux rejected as overly complex for four stores.                                                                                                              |
| Server State       | React Query (TanStack) 5       | Handles caching, refetching, and optimistic updates for REST calls; standard for React and REST architectures.                                                                                                                              |
| Backend Framework  | FastAPI 0.110+                 | Async Python; auto-generated OpenAPI documentation; Pydantic validation; native SSE support; team proficiency in Python.                                                                                                                    |
| ORM                | SQLAlchemy 2                   | Mature async ORM with strong FastAPI integration.                                                                                                                                                                                           |
| Validation         | Pydantic v2                    | Native FastAPI validation; generates TypeScript types via datamodel-code-generator for shared contract enforcement.                                                                                                                         |
| Database           | PostgreSQL 16                  | ACID-compliant; Render-managed; stores users, document metadata, versions, permissions, and AI interaction logs.                                                                                                                            |
| LLM API            | Groq — llama-3.3-70b-versatile | Ultra-low latency via LPU hardware; cost-effective; fast time-to-first-token for streaming UX; input data not used for model training.                                                                                                      |
| Authentication     | JWT (python-jose + bcrypt)     | Stateless authentication; 15-minute access tokens; 7-day refresh tokens; standard pattern for SPAs.                                                                                                                                         |
| Deployment         | Render                         | Managed hosting with built-in TLS, managed PostgreSQL, and multi-service Blueprint deployment.                                                                                                                                              |
| Repository         | Monorepo (single Git repo)     | Enables atomic cross-boundary commits, a single CI pipeline, and shared type definitions across a four-person team.                                                                                                                         |

{15}------------------------------------------------

#### 2.2.2 AI Integration Design

| Decision Area                | Decision                                                                                                                                                                                                                                                                                 | Rationale                                                                                                                                                     |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Context transmitted to Groq  | User selection plus up to 500 tokens of surrounding context and the document title. Full document is never transmitted by default.                                                                                                                                                       | Balances cost control and privacy; smaller prompts produce faster inference; title and section headers provide sufficient global context for most operations. |
| Full-document summarisation  | User must explicitly opt in; the system chunks the document into segments fitting an 8,192-token context window, processes them sequentially, and combines the results.                                                                                                                  | Prevents accidental cost spikes; chunking accommodates long documents without exceeding context limits.                                                       |
| Suggestion UX                | Tracked-change style inline rendering: original text shown with strikethrough in red; AI insertion shown in green. Implemented as a custom Tiptap extension using decoration nodes.                                                                                                      | Mirrors the familiar Track Changes paradigm; inline presentation eliminates context switching to a sidebar.                                                   |
| AI during concurrent editing | Target paragraph is soft-locked during AI processing; other collaborators see an <i>AI is processing</i> indicator and their edits to that region are queued; lock releases on suggestion display or after a 5-second timeout on failure.                                                | Prevents semantically incoherent CRDT merges; lock duration is brief (1–3 s with Groq); edits to other regions remain unaffected.                             |
| Prompt storage               | Python f-string templates stored in <code>backend/ai/prompts.py</code> ; one template per feature; parameters include <code>selected_text</code> , <code>surrounding_context</code> , <code>document_title</code> , <code>target_language</code> , and <code>style_instructions</code> . | Prompt updates require no changes to business logic; supports hot-reload in development; can be externalised to a configuration file in future.               |
| Model selection              | <code>llama-3.3-70b-versatile</code> via Groq for all features; <code>llama-3.1-8b</code> available as a fallback for budget-constrained operations.                                                                                                                                     | Strong output quality at low cost; Groq LPU hardware delivers fast first-token latency.                                                                       |
| Cost control                 | Three-tier enforcement: (1) per-user daily quota of 50,000 tokens tracked in the database; (2) organisation-level monthly budget configurable by admins; (3) per-request input cap of 4,000 tokens with automatic truncation.                                                            | Layered defence against cost overrun; quota exhaustion returns HTTP 429 with a clear message.                                                                 |
| Backend proxy                | All AI requests are routed frontend → backend → Groq; direct frontend-to-Groq calls are not permitted.                                                                                                                                                                                   | Conceals the API key; guarantees server-side logging and quota enforcement; the additional network hop ( 10–50 ms) is acceptable.                             |

{16}------------------------------------------------

#### 2.2.3 API Design

##### Documents

| Method | Endpoint                                     | Body / Parameters  | Response                                             |
|--------|----------------------------------------------|--------------------|------------------------------------------------------|
| POST   | /api/documents                               | {title}            | {id, title, owner_id, created_at}                    |
| GET    | /api/documents                               | —                  | [{id, title, role, updated_at}]                      |
| GET    | /api/documents/:id                           | —                  | {id, title, content, owner, permissions, updated_at} |
| PATCH  | /api/documents/:id                           | {title}            | {id, title, updated_at}                              |
| DELETE | /api/documents/:id                           | —                  | 204                                                  |
| POST   | /api/documents/:id/restore                   | —                  | {id, title, updated_at, restored}                    |
| POST   | /api/documents/:id/snapshot                  | {snapshot: base64} | {version_id, created_at}                             |
| GET    | /api/documents/:id/versions                  | —                  | [{version_id, created_at, created_by}]               |
| POST   | /api/documents/:id/revert/:vid               | —                  | {version_id, created_at}                             |
| GET    | /api/documents/:id/export?format=pdf docx md | —                  | Binary download                                      |

##### Real-time Session Bootstrap

| Method | Endpoint              | Body      | Response                                                  |
|--------|-----------------------|-----------|-----------------------------------------------------------|
| POST   | /api/realtime/session | {doc_id}  | {doc_id, ws_url, role, expires_at, awareness_user}        |

##### AI

| Method | Endpoint                      | Body                                         | Response                                 |
|--------|-------------------------------|----------------------------------------------|------------------------------------------|
| POST   | /api/ai/rewrite               | {doc_id, selection, (context), style?}       | SSE stream: {token, done, suggestion_id} |
| POST   | /api/ai/summarize             | {doc_id, selection, context?}                | SSE stream                               |
| POST   | /api/ai/translate             | {doc_id, selection, (context), target_lang}  | SSE stream                               |
| POST   | /api/ai/restructure           | {doc_id, selection, (context), instructions} | SSE stream                               |
| POST   | /api/ai/cancel/:suggestion_id | —                                            | 200                                      |
| POST   | /api/ai/feedback              | {suggestion_id, action}                      | 200                                      |
| GET    | /api/ai/history               | ?doc_id=&limit=&feature=&status=             | [{id, feature, status, tokens_used}]     |
| DELETE | /api/ai/history/:id           | —                                            | 204                                      |

##### Error Codes

| Status | Code                    | When                                                          |
|--------|-------------------------|---------------------------------------------------------------|
| 400    | INVALID_REQUEST         | Malformed request body or missing required fields.            |
| 401    | TOKEN_EXPIRED           | JWT has expired; client should attempt a token refresh.       |
| 403    | INSUFFICIENT_PERMISSION | The requesting role does not permit the attempted action.     |
| 404    | DOCUMENT_NOT_FOUND      | Document does not exist or the requesting user has no access. |
| 429    | AI_QUOTA_EXCEEDED       | The user's daily AI token limit has been reached.             |
| 503    | AI_SERVICE_UNAVAILABLE  | Groq API is unreachable.                                      |
| 504    | AI_TIMEOUT              | Groq did not respond within the 30-second timeout window.     |

#### 2.2.4 Authentication & Authorization

| Method | Endpoint           | Body                    | Response                                      |
|--------|--------------------|-------------------------|-----------------------------------------------|
| POST   | /api/auth/register | {email, password, name} | {user_id, email, access_token, refresh_token} |
| POST   | /api/auth/login    | {email, password}       | {access_token, refresh_token}                 |
| POST   | /api/auth/refresh  | {refresh_token}         | {access_token, refresh_token}                 |
| GET    | /api/users/me      | —                       | {id, email, name, created_at}                 |

##### Admin

| Method | Endpoint               | Body                                      | Response                                                       |
|--------|------------------------|-------------------------------------------|----------------------------------------------------------------|
| GET    | /api/admin/ai-settings | —                                         | {feature_access, daily_token_limit, monthly_org_token_budget}  |
| PATCH  | /api/admin/ai-settings | {feature_access?, daily_token_limit?, monthly_org_token_budget?, consent_required?} | {feature_access, daily_token_limit, monthly_org_token_budget}  |

##### Permissions

{17}------------------------------------------------

| Method | Endpoint                            | Body               | Response                       |
|--------|-------------------------------------|--------------------|--------------------------------|
| POST   | /api/documents/:id/permissions      | {user_email, role} | {permission_id, user_id, role} |
| GET    | /api/documents/:id/permissions      | —                  | [{user_id, email, name, role}] |
| PATCH  | /api/documents/:id/permissions/:pid | {role}             | {permission_id, role}          |
| DELETE | /api/documents/:id/permissions/:pid | —                  | 204                            |

##### Communication model

| Interaction          | Protocol                        | Direction           | Justification                                                                                         |
|----------------------|---------------------------------|---------------------|-------------------------------------------------------------------------------------------------------|
| Document CRUD        | REST (HTTPS)                    | SPA → API           | Simple, cacheable, and stateless; appropriate for request-response document operations.               |
| Authentication       | REST + JWT                      | SPA → API           | Standard stateless authentication pattern for single-page applications.                               |
| AI invocation        | REST + SSE streaming            | SPA → API → Groq    | SSE enables word-by-word delivery of AI responses, providing immediate user feedback without polling. |
| Real-time edits      | WebSocket (Yjs binary protocol) | SPA ↔ Collab Server | Low-latency bidirectional channel; native to Yjs synchronisation protocol.                            |
| Presence (cursors)   | WebSocket (Yjs Awareness)       | SPA ↔ Collab Server | Provided natively by Yjs at no additional implementation cost.                                        |
| Snapshot persistence | SQL (internal)                  | Collab Server → DB  | Debounced writes every 30 seconds when document state has changed.                                    |

### 2.3 Code Structure & Repository Organization

```

collab-editor/
  frontend/
    src/components/          (Tanisha)
    src/hooks/               React UI components
    src/stores/              useDocument, useAI, useAuth, usePresence
    src/api/                 Zustand: authStore, editorStore, aiStore
    src/extensions/          React Query hooks wrapping REST endpoints
    vite.config.ts           Custom Tiptap extensions (AI suggestion, soft lock)
  backend/api/               (Atharv)
    routes/                  documents.py, auth.py, ai.py, permissions.py
    middleware/              Auth, CORS, rate limiting
    services/                Business logic layer
    models/                  SQLAlchemy ORM models
    schemas/                 Pydantic request/response schemas
    main.py
  backend/ai/                (Temiko)
    prompts.py               Prompt templates per feature
    groq_client.py           Groq API wrapper and streaming handler
    router.py                /ai/* route definitions
    quota.py                 Per-user token quota enforcement
  backend/collab/            (Teya)
    server.js                y-websocket server entry point
    persistence.js           PostgreSQL snapshot adapter
  shared/types/              Pydantic-generated TypeScript types
  shared/constants/          Roles, AI features, error codes
  infra/                     (Teya)
    render.yaml              Render Blueprint configuration
    .env.example             Environment variable template
    init.sql                 Database initialisation script
  tests/unit/                Per-module unit tests
  tests/integration/         API integration tests
  tests/e2e/                 Playwright end-to-end tests
  .github/workflows/         CI/CD pipeline definitions

```

{18}------------------------------------------------

### 2.4 Data Model

Entity-relationship diagram

![Entity-relationship diagram showing five tables: users, documents, document_versions, permissions, and ai_interactions with their attributes and relationships.](2b3a967f6ce4f23649be995a353e39f8_img.jpg)

The diagram illustrates the following entities and relationships:

- users** (purple table):
  - Attributes: id (PK, UUID), email (UK, string), hashed\_password (string), name (string), created\_at (timestamp), daily\_ai\_tokens\_used (int), ai\_tokens\_reset\_at (timestamp).
  - Relationships:
    - creates**: One-to-many relationship with **document\_versions**.
    - owns**: One-to-many relationship with **documents**.
    - invokes**: One-to-many relationship with **ai\_interactions**.
    - holds**: Many-to-one relationship with **documents**.
    - has**: Many-to-one relationship with **permissions**.
- documents** (teal table):
  - Attributes: id (PK, UUID), title (string), owner\_id (FK, UUID), created\_at (timestamp), updated\_at (timestamp), is\_deleted (boolean).
  - Relationships:
    - owns**: One-to-many relationship with **users**.
    - has**: One-to-many relationship with **document\_versions**.
    - has**: One-to-many relationship with **permissions**.
    - subject of**: One-to-many relationship with **ai\_interactions**.
- document\_versions** (orange table):
  - Attributes: id (PK, UUID), doc\_id (FK, UUID), snapshot (bytea), created\_at (timestamp), created\_by (FK, UUID).
  - Relationships:
    - creates**: Many-to-one relationship with **users**.
    - has**: Many-to-one relationship with **documents**.
- permissions** (blue table):
  - Attributes: id (PK, UUID), doc\_id (FK, UUID), user\_id (FK, UUID), role (enum), created\_at (timestamp).
  - Relationships:
    - has**: Many-to-one relationship with **users**.
    - has**: Many-to-one relationship with **documents**.
- ai\_interactions** (green table):
  - Attributes: id (PK, UUID), doc\_id (FK, UUID), user\_id (FK, UUID), feature (enum), input\_text (text), suggestion\_text (text), status (enum), tokens\_used (int), created\_at (timestamp).
  - Relationships:
    - invokes**: Many-to-one relationship with **users**.
    - subject of**: Many-to-one relationship with **documents**.

Entity-relationship diagram showing five tables: users, documents, document\_versions, permissions, and ai\_interactions with their attributes and relationships.

{19}------------------------------------------------

| Table                          | Key Columns                                                                                                                                                                                                                                                                                                                                     | Design Notes                                                                                                                                                                                                                                                                                                                                                                                         |
|--------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| <code>users</code>             | <code>id</code> (UUID PK), <code>email</code> (unique), <code>hashed_password</code> , <code>name</code> , <code>created_at</code> , <code>daily_ai_tokens_used</code> , <code>ai_tokens_reset_at</code>                                                                                                                                        | Manages authentication credentials and per-user AI resource consumption. The daily token counter resets automatically when the current timestamp exceeds <code>ai_tokens_reset_at</code> , allowing a lightweight quota cycle without scheduled jobs.                                                                                                                                                |
| <code>documents</code>         | <code>id</code> (UUID PK), <code>title</code> , <code>owner_id</code> (FK → <code>users</code> ), <code>created_at</code> , <code>updated_at</code> , <code>is_deleted</code>                                                                                                                                                                   | Stores document metadata only. Document content is intentionally decoupled from this table; the canonical content is the Yjs binary state persisted in <code>document_versions</code> . <code>is_deleted</code> supports soft deletion with a 30-day recovery window. <code>owner_id</code> is also stored here for fast ownership lookups, in addition to the entry in <code>permissions</code> .   |
| <code>document_versions</code> | <code>id</code> (UUID PK), <code>doc_id</code> (FK → <code>documents</code> ), <code>snapshot</code> (bytea), <code>created_at</code> , <code>created_by</code> (FK → <code>users</code> )                                                                                                                                                      | Append-only version history storing the full Yjs CRDT state as a binary blob rather than a diff. Revert operations load the target snapshot, apply it as a new Yjs update, and insert a new row — existing history is never overwritten. The y-websocket server writes a new snapshot every 30 seconds when the document has changed.                                                                |
| <code>permissions</code>       | <code>id</code> (UUID PK), <code>doc_id</code> (FK → <code>documents</code> ), <code>user_id</code> (FK → <code>users</code> ), <code>role</code> (enum: owner / editor / commenter / viewer), <code>created_at</code>                                                                                                                          | Enforces per-document, per-user access control. A unique constraint on ( <code>doc_id</code> , <code>user_id</code> ) ensures a user holds exactly one role per document. The owner role is also reflected in <code>documents.owner_id</code> for fast lookup without a join.                                                                                                                        |
| <code>ai_interactions</code>   | <code>id</code> (UUID PK), <code>doc_id</code> (FK → <code>documents</code> ), <code>user_id</code> (FK → <code>users</code> ), <code>feature</code> (enum), <code>input_text</code> , <code>suggestion_text</code> , <code>status</code> (enum: accepted / rejected / partial / cancelled), <code>tokens_used</code> , <code>created_at</code> | Audit trail linking every AI invocation to a specific document and user. <code>tokens_used</code> supports cost attribution and per-user quota enforcement. Records are subject to automated 90-day purge and are user-deletable on demand to satisfy data minimisation requirements. Cancelled operations produce a log entry with <code>status = cancelled</code> but no accepted suggestion text. |

### 2.5 Architecture Decision Records (ADRs)

#### ADR-001: Yjs + Tiptap for Real-time Collaboration

**Status:** Accepted

**Context:** The system requires conflict-free real-time collaborative editing over rich text. The team comprises four members working within a single semester, constraining the time available for low-level infrastructure development.

**Decision:** Adopt Yjs (CRDT) combined with Tiptap (ProseMirror-based editor), y-prosemirror bindings, and a y-websocket synchronisation server.

**Positive Consequences:** Tiptap provides first-class Yjs support; the combination is battle-tested in production; offline editing, presence awareness, and sub-document editing are available without additional implementation effort.

**Negative Consequences:** Yjs binary encoding makes debugging opaque; y-websocket is a single-instance server with no horizontal scaling support - acknowledged as a known limitation.

**Alternatives Rejected:** Automerge - weaker rich-text support. ShareDB (OT) — more complex offline handling and requires a central transformation server.

#### ADR-002: Backend-Proxied AI Calls

**Status:** Accepted

**Context:** The frontend could invoke the Groq API directly, as CORS is supported. However, this would expose the API key, prevent server-side logging, and make quota enforcement impossible.

**Decision:** All AI requests are proxied through the FastAPI backend via `/api/ai/*` endpoints. The backend constructs prompts, calls Groq, and streams responses to the client via SSE.

**Positive Consequences:** API key remains hidden; server-side quota enforcement and interaction logging are guaranteed; prompt updates can be deployed without a frontend release.

**Negative Consequences:** An additional network hop of approximately 10–50 ms is introduced; backend load increases; SSE must be implemented on the server side.

**Alternatives Rejected:** Frontend-direct Groq calls — one hop faster but presents unacceptable security and auditability trade-offs.

#### ADR-003: Soft-Lock During AI Processing

{20}------------------------------------------------

**Status:** Accepted

**Context:** When a user requests an AI rewrite on a paragraph while another user is actively editing the same region, an uncoordinated CRDT merge of the AI output and concurrent human edits produces semantically incoherent text.

**Decision:** The target paragraph is soft-locked during AI processing. Other collaborators receive a visual indicator and their edits to that region are queued. The lock is released upon suggestion display, or automatically after a 5-second timeout in the event of failure.

**Positive Consequences:** Prevents confusing merge outcomes; lock duration is brief (1–3 s with Groq); all other document regions remain fully editable.

**Negative Consequences:** One paragraph is temporarily blocked; users may perceive this as a restriction; the timeout edge case requires explicit handling.

**Alternatives Rejected:** No locking (CRDT merge) — produces nonsensical output. Full document lock — excessively restrictive for all collaborators.

#### ADR-004: Monorepo with Directory Ownership

**Status:** Accepted

**Context:** Four team members are working concurrently on frontend, backend, AI integration, and infrastructure. Coordination overhead must be minimised without sacrificing code organisation.

**Decision:** A single Git repository is used with clearly defined directory ownership: `frontend/` (Tanisha), `backend/api/` (Atharv), `backend/ai/` (Temiko), `backend/collab/` and `infra/` (Teya). Shared types reside in `shared/`.

**Positive Consequences:** Atomic cross-boundary commits; single CI pipeline; shared type generation in one place.

**Negative Consequences:** Higher frequency of merge conflicts; CI runs the full test suite on every commit, mitigated by path-based trigger configuration.

**Alternatives Rejected:** Multi-repo - introduces coordination overhead and requires multi-repository pull requests for shared type changes, which is impractical for a four-person team.

## 3 Project Management & Team Collaboration

### 3.1 Team Structure & Ownership

| Person  | Area                        | Owns                                                                                                       | Key Decisions                                                                     |
|---------|-----------------------------|------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|
| Teya    | Infrastructure & DB; Report | PostgreSQL schema, Render deployment, y-websocket server, CI/CD, environment configuration, DB migrations. | Data model design, deployment strategy, collaboration server configuration.       |
| Tanisha | Frontend                    | React SPA, Tiptap editor, Yjs client, React Query, Zustand, UI components, accessibility.                  | Editor UX, AI suggestion display, presence visualisation, component architecture. |
| Temiko  | AI Integration; Report      | Groq client, prompt engineering, SSE streaming, quota enforcement, AI interaction logging.                 | Context window strategy, prompt design, cost control, model selection.            |
| Atharv  | Backend / API; Report       | FastAPI routes, auth middleware, document CRUD, permission enforcement, API contract, error handling.      | API design, authentication flow, RBAC, endpoint structure.                        |

Cross-cutting features are owned by the primary domain owner, who creates the pull request and requests reviews from all affected owners. Pull requests spanning multiple modules require a minimum of two approvals. Technical disagreements are resolved by the proposer drafting a concise ADR in a GitHub issue, followed by asynchronous team discussion and a majority vote; ties are resolved by the owner of the most-affected module.

### 3.2 Development Workflow

The team adopts GitHub Flow as its branching strategy. All development occurs on short-lived feature branches created from main, following the naming convention `<owner>/<type>/<desc>` (e.g., `temiko/feat/ai-rewrite-streaming`), where type is one of feat, fix, refactor, docs, or test. Changes are never pushed directly to main; instead, every contribution is submitted via a pull request.

Code review is mandatory for all pull requests. A minimum of one approval is required from a team member who does not own the primary module; pull requests that span multiple ownership areas require a minimum of two approvals. Reviewers are expected to assess correctness, test coverage, error handling, naming consistency, and the absence of hardcoded credentials. Given that team

{21}------------------------------------------------

members operate across different time zones and concurrent academic deadlines, a 24-hour review turnaround is the agreed target. This window provides reviewers adequate time without creating blocking delays for the submitting author.

Team communication is conducted primarily over a Teams chat. Day-to-day coordination uses a project chat for async standups, where each member posts updates covering what they completed, what they are working on, any blockers and questions.

### 3.3 Development Methodology

The team follows a Scrum-lite methodology structured around two-week sprints. Sprint planning takes place on the first Monday of each sprint. Daily coordination is handled asynchronously via the Teams chat.

Work that does not produce user-visible features - infrastructure setup, data model design, type generation, and test scaffolding - is treated as first-class sprint work and is explicitly planned. The Definition of Done requires that a feature have its code merged to *main* via an approved pull request, unit tests passing for all new or changed logic, an integration test covering the happy path and at least one error case, API endpoints matching their Pydantic schemas, no hardcoded secrets, a working local development setup, and an updated README if any setup steps have changed.

The backlog for the Implementation sprint will be managed in GitHub Projects using a Kanban board with five columns: Backlog, In Progress, In Review, and Done. Issues are labelled by domain (frontend, backend, ai, infra) and priority (P0–P3).

### 3.4 Risk Assessment

| Risk                                                     | L | I    | Mitigation                                                                                         | Contingency                                                                                |
|----------------------------------------------------------|---|------|----------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| Groq API outage or rate-limiting during demonstration    | M | H    | Mock AI mode with cached responses; rate limit tested pre-demo                                     | Switch to mock mode; use pre-recorded backup demo video                                    |
| Yjs synchronisation produces inconsistent document state | L | Crit | Automated concurrent edit tests; periodic snapshot persistence provides recovery points            | Revert to last persisted snapshot; document and resolve root cause                         |
| AI usage costs exceed development budget                 | M | M    | Strict per-developer daily quotas (10,000 tokens); mock AI in tests; weekly Groq dashboard review. | Reduce context window size; downgrade to llama-3.1-8b for lower-stakes features            |
| y-websocket single instance becomes a bottleneck         | L | H    | Acknowledged limitation; health checks and auto-restart configured on Render                       | Document limitation; define upgrade path to Hocuspocus with Redis pub/sub                  |
| Team member unavailable unexpectedly                     | M | M    | Per-module setup documentation; pair programming in the beginning builds cross-module knowledge    | Remaining members cover using API contracts and documentation; non-critical work deferred  |
| Frontend–backend API contract drift.                     | M | M    | Shared Pydantic-to-TypeScript type generation; integration tests validate schemas in CI.           | Freeze feature development; run a contract alignment sprint focused on integration testing |
| Merge conflicts from monorepo                            | M | L    | Clear directory ownership; path-based CI triggers; small and frequent pull requests.               | Pair on conflict resolution; rebase from a clean <i>main</i> as a last resort              |

*L = Likelihood, I = Impact. Levels: L (Low), M (Medium), H (High), Crit (Critical).*

{22}------------------------------------------------

### 3.5 Timeline & Milestones

| Sprint                 | Duration   | Focus                                                                                                                                                                | Deliverables                                                                                                                                                          |
|------------------------|------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| S1: Research & Draft   | Weeks 1-2  | Individual overview of the assignment and research; stakeholder analysis; requirements specification; architecture decisions; draft report produced collaboratively. | Comprehensive draft covers all assignment sections; C4 diagrams rendered; ADRs written; team roles confirmed.                                                         |
| S2: Finalisation & PoC | Weeks 3-4  | Official report polished and submitted; proof-of-concept implemented and validated.                                                                                  | Report submitted as PDF with all diagrams; PoC runs from README; frontend communicates with backend; data contracts match architecture document; demo video recorded. |
| S3: Implementation     | Weeks 5-6+ | Core system implementation; exact sprint scope to be defined upon release of the Assignment 2 specification.                                                         | To be confirmed.                                                                                                                                                      |

## 4 Proof of Concept

[GitHub Repository link](#)

The report has defined the structural and functional requirements necessary to build a reliable collaborative editor. By mapping user stories directly to a layered C4 architecture, we have ensured the system is designed to handle real-time synchronization without unnecessary complexity.

The accompanying repository contains the functional proof-of-concept, validating our architectural decisions through a "clone-and-run" setup. The core integration between the frontend, backend, and database can be verified by following the README instructions in the repository or by viewing the demo video. Thank you for your time in reviewing the project!
