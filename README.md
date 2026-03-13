# Collaborative Document Editor with AI Writing Assistant

> **AI1220 – Assignment 1 | Proof of Concept**

A real-time collaborative document editing platform with an integrated AI writing assistant. Think of it as a simplified Google Docs competitor with embedded LLM-powered features — built for simultaneous multi-user editing, presence awareness, and AI-assisted text operations (rewrite, summarize, translate, restructure).

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture Summary](#architecture-summary)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [PoC: Setup & Running](#poc-setup--running)
- [What the PoC Demonstrates](#what-the-poc-demonstrates)
- [What Is Not Yet Implemented](#what-is-not-yet-implemented)
- [Team](#team)

---

## Project Overview

This system allows multiple users to edit the same document simultaneously, see each other's changes in real time, and invoke an AI assistant that can rewrite, summarize, translate, or restructure selected portions of text.

Core capability areas:

| Area | Description |
|---|---|
| **Real-time collaboration** | Simultaneous editing, cursor presence, conflict handling |
| **AI writing assistant** | Text enhancement, summarization, translation, reformatting |
| **Document management** | Creation, versioning, sharing, access control, export |
| **User management** | Authentication, authorization, roles (owner, editor, commenter, viewer) |

---

## Architecture Summary

The system is organized around six major modules:

1. **Rich-text editor** – Frontend editor with local state management; handles user input and renders remote changes.
2. **Real-time sync layer** – Propagates edits between collaborators using an operational-transform or CRDT-based approach over a persistent connection (WebSocket/SSE).
3. **AI assistant service** – Receives text selections and user intent; constructs prompts; forwards to an LLM API; streams suggestions back to the client.
4. **Document storage & versioning** – Persists document snapshots and operation history; supports version browsing and revert.
5. **Auth & authorization** – Issues and validates session tokens; enforces role-based access control (RBAC) on every operation.
6. **API layer** – RESTful endpoints for CRUD and auth; WebSocket/event-stream endpoints for real-time and AI operations.

C4 diagrams (context, container, and component levels) are documented in the full architecture report.

---

## Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + TypeScript | Component model suits rich editor UX; strong typing catches data-contract mismatches early |
| Editor component | TipTap / ProseMirror | Extensible, headless rich-text engine with good collaboration plugin support |
| Real-time transport | WebSocket (planned: `ws` or Socket.IO) | Low-latency bidirectional channel required for keystroke-level propagation |
| Backend API | Node.js + Express (TypeScript) | Shared language with frontend eases type-sharing; large ecosystem |
| AI integration | OpenAI API (GPT-4o) via server-side proxy | Keeps API keys off the client; allows prompt management and cost control |
| Database | PostgreSQL | Relational model suits document metadata, permissions, and version history |
| Auth | JWT + refresh tokens | Stateless verification; easy to propagate through WebSocket handshake |

---

## Repository Structure

```
colab-doc-editor-with-ai/
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/      # UI components (Editor, Toolbar, AISidebar, etc.)
│   │   ├── hooks/           # Custom React hooks (useCollaboration, useAI, etc.)
│   │   ├── api/             # API client wrappers
│   │   └── types/           # Shared TypeScript types (mirrored from /shared)
│   └── package.json
├── server/                  # Node.js / Express backend
│   ├── src/
│   │   ├── routes/          # REST route handlers
│   │   ├── ws/              # WebSocket event handlers
│   │   ├── services/        # Business logic (documents, AI, auth)
│   │   ├── db/              # Database models and migrations
│   │   └── prompts/         # AI prompt templates (rewrite, summarize, translate, restructure)
│   └── package.json
├── shared/                  # Types and constants shared between client and server
│   └── types/
├── .env.example             # Environment variable template (no secrets committed)
├── docker-compose.yml       # Local development environment
└── README.md
```

> **Secrets policy:** API keys, database credentials, and LLM provider tokens are loaded exclusively from environment variables. No secrets are committed to the repository. Copy `.env.example` to `.env` and fill in values locally.

---

## PoC: Setup & Running

### Prerequisites

- Node.js ≥ 20
- Docker & Docker Compose (for the database)
- An OpenAI API key (for AI features)

### 1. Clone the repository

```bash
git clone https://github.com/Tanisha-Maahira-cell/colab-doc-editor-with-ai.git
cd colab-doc-editor-with-ai
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env and set:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/colabeditor
#   OPENAI_API_KEY=<your key>
#   JWT_SECRET=<a long random string>
```

### 3. Start the database

```bash
docker-compose up -d
```

### 4. Install dependencies and run migrations

```bash
# Backend
cd server && npm install && npm run migrate && cd ..

# Frontend
cd client && npm install && cd ..
```

### 5. Start the servers

```bash
# In one terminal — backend (runs on http://localhost:4000)
cd server && npm run dev

# In another terminal — frontend (runs on http://localhost:3000)
cd client && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## What the PoC Demonstrates

The proof of concept is a **technical skeleton**, not a feature-complete product. It exists to validate that the pieces connect and that the API contracts work in practice.

Specifically, the PoC shows:

1. **Frontend loads and renders** – A basic document editing interface (text area / minimal editor component) is served by the React app.
2. **Frontend ↔ backend communication** – The client makes authenticated HTTP requests to the backend API (create document, fetch document) and receives structured JSON responses matching the data model defined in the architecture document.
3. **Data contracts are enforced** – Shared TypeScript types ensure the shapes exchanged between client and server match the architecture specification.
4. **Real-time channel is established** – A WebSocket connection opens when a document is loaded; the server acknowledges the connection and can broadcast a placeholder "presence" event back to the client.
5. **AI endpoint is wired up** – Sending a text selection to `POST /api/ai/assist` reaches the backend, is forwarded to the OpenAI API, and a response is returned to the client (rendered in a side panel).
6. **Authentication flow works** – A user can register, log in, and receive a JWT that is attached to subsequent API requests.

The Git history reflects how the team divided and integrated the work (see commit log).

---

## What Is Not Yet Implemented

The following are intentionally out of scope for this PoC and will be addressed in later iterations:

- **Full rich-text editor** – The editor is a plain `<textarea>` or minimal ProseMirror instance, not a fully featured document editor with formatting, tables, images, or comments.
- **Operational transform / CRDT** – Simultaneous edits from multiple clients are not yet reconciled. Concurrent edits will overwrite each other. Conflict-free merge is a later milestone.
- **Cursor presence** – Seeing where other users' cursors are in the document is not implemented.
- **Document versioning** – Saving and browsing version history, and reverting to a previous version, are not implemented.
- **Role-based access control enforcement** – User roles (owner / editor / commenter / viewer) are modelled in the database but not yet enforced at the API layer.
- **AI suggestion UX** – AI responses are displayed as raw text; tracked-change-style proposal UI (accept / reject / partial accept) is not implemented.
- **AI prompt templates** – All AI requests currently use a single generic prompt. Per-feature prompt logic (rewrite vs. summarize vs. translate vs. restructure) is scaffolded but not complete.
- **Offline resilience** – No reconnection logic or local buffering when the WebSocket drops.
- **Export** – Exporting documents to PDF, DOCX, or Markdown is not implemented.
- **Production hardening** – No rate limiting, quota enforcement, audit logging, or infrastructure-as-code. The system is development-only at this stage.

---

## Team

| Name | Ownership area |
|---|---|
| *(team member)* | Frontend / Editor |
| *(team member)* | Backend API / Auth |
| *(team member)* | Real-time sync layer |
| *(team member)* | AI integration service |



