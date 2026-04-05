# Architecture Decision Records

## ADR-001: Yjs plus Tiptap for Real-Time Collaboration

**Status**  
Accepted

**Context**  
The editor must support simultaneous rich-text editing, collaborator presence, conflict-free merges, offline buffering, and reconnect synchronization. The team also needs a stack that is realistic for a one-semester implementation rather than a research project. A plain textarea would undershoot the product goal, while a custom OT engine would absorb too much engineering time.

**Decision**  
Use Tiptap 2 as the rich-text editor, Yjs as the CRDT layer, `y-prosemirror` bindings for document synchronization, and `y-websocket` as the semester-scale collaboration server.

**Consequences**  
Positive: the stack is mature, has strong ecosystem support, and directly supports collaborative editing, awareness, and offline synchronization. It also keeps the frontend implementation aligned with the real-time correctness driver.  
Negative: binary Yjs state is harder to inspect manually, and `y-websocket` is a deliberate short-term scaling limitation because it is not horizontally scalable without extra infrastructure.

**Alternatives Considered**  
Automerge was rejected because the rich-text ecosystem is weaker and the path to polished editor behavior is less direct. ShareDB and other OT-oriented approaches were rejected because they increase server complexity and provide a less convenient offline story for this assignment.

## ADR-002: Backend-Proxied AI Calls

**Status**  
Accepted

**Context**  
The AI assistant is a core feature rather than an isolated demo button. The system needs quota enforcement, prompt evolution, audit logging, permission checks, and provider key protection. A frontend-direct call to Groq would reduce one network hop, but it would also expose credentials and remove central control over cost and privacy behavior.

**Decision**  
Route every AI operation through the FastAPI backend. The frontend calls `/api/ai/*`; the backend constructs prompts, enforces quotas and policy, forwards requests to Groq, and streams results back to the client with SSE.

**Consequences**  
Positive: API keys stay server-side, quota and retention policies are enforceable, prompts can change without redeploying the frontend, and logging is guaranteed at a single control point.  
Negative: backend throughput becomes part of the AI critical path, SSE orchestration must be implemented and tested, and the proxy adds a small latency overhead.

**Alternatives Considered**  
Frontend-direct provider calls were rejected because they are incompatible with secure key handling, consistent logging, and organization-level AI governance. A dedicated standalone AI microservice was also rejected for the first semester because it adds deployment and ownership overhead without enough benefit at this scale.

## ADR-003: Soft-Lock the Target Region During AI Processing

**Status**  
Accepted

**Context**  
The hardest AI-collaboration edge case occurs when one user invokes a rewrite on a paragraph while another user is actively editing the same text. Leaving the region fully open risks a technically valid CRDT merge that is semantically confusing or destructive to the user's intent. A full-document lock would solve the conflict but would make collaboration feel brittle.

**Decision**  
Apply a short-lived soft lock to the paragraph being processed by AI. Other collaborators see that the region is in an AI-pending state and their edits to that region are queued until the suggestion is displayed or the lock times out.

**Consequences**  
Positive: the design preserves semantic clarity for AI suggestions while keeping the rest of the document collaborative. It also gives other users explicit feedback instead of silently producing surprising merges.  
Negative: one paragraph becomes temporarily unavailable, the queue/release behavior adds implementation complexity, and timeout handling must be precise to avoid a stuck region.

**Alternatives Considered**  
No locking was rejected because it risks incoherent merged text and a confusing review experience. A full-document lock was rejected because it over-corrects the problem and would make a collaborative editor feel serial rather than collaborative.

## ADR-004: Monorepo with Explicit Directory Ownership

**Status**  
Accepted

**Context**  
The team is small, features cross frontend, backend, AI, and infrastructure boundaries, and the proof of concept requires tight alignment between code, contracts, and docs. Multiple repositories would create more coordination overhead for shared types, API changes, and synchronized demos.

**Decision**  
Keep the project in a single repository with explicit ownership by top-level area: frontend, backend/api, backend/ai, backend/collab plus infra, and shared contracts. Cross-cutting work is submitted through pull requests that require review from affected owners.

**Consequences**  
Positive: atomic cross-boundary changes become straightforward, documentation and code evolve together, and shared types can be generated and consumed from one place.  
Negative: merge conflicts are more likely than in a multi-repo split, CI scope must be managed carefully, and ownership boundaries need discipline to remain useful.

**Alternatives Considered**  
Separate frontend and backend repositories were rejected because they would slow down API iteration and make shared contract changes harder to synchronize. A service-per-repo split was rejected for the same reason and because it would not match the team's semester-scale delivery capacity.
