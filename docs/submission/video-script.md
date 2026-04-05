# 10-Minute Video Script

This script follows the required order:

1. Team responsibilities and contributions: about 1-2 minutes
2. Most important design decisions using the documentation schemes: about 5-6 minutes
3. Proof of concept with the system in action: about 2-4 minutes

The emphasis should stay on architecture, design rationale, and why the team made the choices it made. The demo should support the design, not dominate the video.

## Timing Overview

| Time | Speaker | Topic | On Screen |
|---|---|---|---|
| 0:00-1:30 | Teya | Team structure and ownership | title slide + team ownership table |
| 1:30-3:00 | Tanisha | System context and container design | C4 Level 1 and Level 2 diagrams |
| 3:00-4:30 | Atharv | Backend/API/component design and auth/RBAC | C4 Level 3 + API tables |
| 4:30-6:00 | Temiko | AI integration decisions and tradeoffs | AI integration table + latency/privacy/quotas |
| 6:00-7:00 | Teya | Data model, deployment, and key risks | ERD + repo tree + risk table |
| 7:00-8:00 | Tanisha | PoC start: auth, load document, rich editor | deployed frontend |
| 8:00-9:00 | Teya + Tanisha | PoC sync demo | two browser windows side by side |
| 9:00-10:00 | Temiko + Atharv | PoC AI rewrite/history + closing summary | AI rewrite flow + backend/health/admin/API summary |

## Script

### 0:00-1:30
Speaker: Teya

Goal:
- explain who owned what
- make it clear this was an intentionally divided system, not ad hoc work

On screen:
- report title
- team ownership table from the report

Talking points:
- "We designed and implemented a collaborative document editor with an integrated AI writing assistant."
- "We divided the system by ownership so the codebase would remain coherent across frontend, backend, AI, and infrastructure."
- "Tanisha owned the frontend editor experience and live collaboration UI."
- "Atharv owned the FastAPI backend, authentication, permissions, and document APIs."
- "Temiko owned the Groq integration, prompt flow, streaming AI, and quota/history behavior."
- "I, Teya, owned the collaboration server, persistence/deployment layer, database setup, and integration packaging."
- "This ownership model shaped our repository structure, pull request flow, and the architecture decisions we are about to show."

### 1:30-3:00
Speaker: Tanisha

Goal:
- explain the system as a product and why the container split exists

On screen:
- C4 Level 1 context diagram
- then C4 Level 2 container diagram

Talking points:
- "At the highest level, the platform serves document users and organization admins."
- "The system depends on Groq for AI inference and reserves email notifications as future work."
- "At container level, we deliberately separated the browser SPA, the FastAPI backend, the y-websocket collaboration server, and PostgreSQL."
- "This split reflects two different workloads: request-response business logic on the backend, and low-latency CRDT synchronization on the collaboration server."
- "The SPA talks to FastAPI for auth, document, permission, export, and AI endpoints, while it talks directly to the collaboration server over WSS for live editing and awareness."
- "That decision keeps collaboration responsive without forcing every keystroke through the REST API."

### 3:00-4:30
Speaker: Atharv

Goal:
- explain the backend as it really exists
- emphasize security and boundary enforcement

On screen:
- C4 Level 3 backend component diagram
- API contract tables for documents/auth/permissions

Talking points:
- "For the component-level design, we documented the backend as it is actually implemented."
- "The FastAPI app owns route registration, validation, error mapping, and lifecycle."
- "The auth module handles password hashing and JWT access and refresh tokens."
- "The runtime module centralizes document metadata, roles, permissions, AI history, and admin AI settings."
- "The document content store maintains the strict REST document-content projection used for reload, export, version checks, and AI apply flows."
- "Roles are enforced server-side for owner, editor, commenter, and viewer, and admin-only AI policy settings are exposed separately."
- "We intentionally kept all AI calls backend-proxied so the API key never reaches the browser and so quotas and logs can be enforced centrally."

### 4:30-6:00
Speaker: Temiko

Goal:
- explain AI as a product/system feature, not just an API call

On screen:
- AI integration design table
- latency/security requirements rows

Talking points:
- "The AI assistant is integrated into the editing workflow rather than being treated as a standalone demo."
- "We selected Groq because latency matters for writing assistance, especially the time to first token."
- "The current system supports rewrite, summarize, translate, restructure, and continue-writing."
- "We stream responses with SSE so the user sees progress immediately instead of waiting for a full blocking response."
- "We made a deliberate product tradeoff: the current UX is preview-first rather than a full Yjs-native tracked-change CRDT model."
- "That gave us a reliable and demoable assistant with accept, reject, cancel, feedback, and history while keeping the architecture honest."
- "We also enforce quota and admin policy settings on the backend, and we scope the context sent to Groq to avoid unnecessary cost and privacy exposure."

### 6:00-7:00
Speaker: Teya

Goal:
- connect persistence, deployment, and operational realism

On screen:
- ERD
- repo tree
- risk table

Talking points:
- "Our data model separates document metadata, document-content projection, permissions, Yjs snapshot history, and AI interaction history."
- "This lets the collaboration server persist CRDT snapshots while the backend still serves strict REST document reads and exports."
- "The repo is a monorepo because it allowed atomic cross-boundary changes across frontend, backend, AI, and infra."
- "We also documented risks that actually mattered here: Groq availability, collaboration consistency, quota control, single-instance websocket scaling, and contract drift."
- "The deployment target is Render with separate frontend, backend, collaboration, and PostgreSQL services."

### 7:00-8:00
Speaker: Tanisha

Goal:
- start the PoC clearly and quickly

On screen:
- deployed frontend
- login/register flow
- load document

Talking points:
- "For the proof of concept, we will show the live deployed system."
- "First, we register or sign in through the real backend auth flow."
- "After login, the client loads a document through the strict document API."
- "The main editor surface is the rich Tiptap editor, which is the only editing surface in the current product path."

### 8:00-9:00
Speakers: Teya and Tanisha

Goal:
- prove real-time collaboration

On screen:
- two browser windows side by side
- same document opened in both

Talking points:
- "Here we open the same document in two sessions."
- "Typing in one window propagates to the other through the Yjs websocket path."
- "This demonstrates the architectural split we described earlier: REST for document and AI flows, WSS for collaboration."
- "The sync indicator and peer count confirm that both sessions are connected."

### 9:00-10:00
Speakers: Temiko then Atharv

Goal:
- finish with AI plus backend credibility

On screen:
- select text
- run rewrite
- show streamed preview
- accept or reject
- show recent AI history
- optionally show backend `/health` or admin AI settings quickly

Talking points for Temiko:
- "Now we select text and invoke the AI rewrite feature."
- "The response is streamed from the backend through SSE and shown as a review preview."
- "We can then accept or reject the suggestion, and the interaction is recorded in the AI history."

Talking points for Atharv:
- "This flow is backed by authenticated APIs, server-side role enforcement, and structured AI history."
- "The backend health endpoint and admin AI settings complete the technical skeleton."
- "So the PoC is not just a UI demo; it validates the contracts and architecture described in the report."

Closing sentence:
- "That completes our overview of the team responsibilities, the key architecture decisions, and the live proof of concept."

## Recording Guidance

- Keep transitions tight. Do not spend too long zooming or switching tabs.
- Use the diagrams from the report during the design section. The architecture section should be the majority of the video.
- During the PoC, avoid wandering through every feature. Show only the flows that prove the architecture:
  - auth
  - load/open document
  - live sync
  - AI rewrite/history
- If a feature is documented but not fully polished in the UI, describe it honestly as future or partial rather than overselling it.
- Prefer one narrator per segment so the handoff feels deliberate rather than chaotic.
