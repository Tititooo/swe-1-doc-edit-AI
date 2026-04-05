# Stakeholder Analysis

The collaborative editor has more stakeholder pressure than a simple "end user" framing suggests. The system spans product strategy, security, AI cost control, testing, and operations, so the requirements have to reflect concerns across the full product lifecycle.

| ID | Stakeholder Category | Lifecycle Role | Primary Goals | Main Concerns | Influence on Requirements | Engagement Approach |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Product owners and founders | Product strategy, scope, release planning | Differentiate with AI-native editing, reach MVP quickly, keep operating costs predictable | Scope creep, LLM spend volatility, reliability damage during early adoption | Drives AI as a first-class capability, MoSCoW prioritization, per-user and per-org quota controls, and explicit demo-ready milestones | Weekly milestone review; founders approve scope changes and quota policy |
| S2 | Enterprise IT and organization admins | Provisioning, governance, policy enforcement | Manage users centrally, enforce organization rules, audit collaboration and AI usage | Weak RBAC, data leakage to third-party AI, no administrative control over feature exposure | Drives owner/editor/commenter/viewer roles, admin-configurable AI feature toggles, usage quotas, and audit-friendly AI history | Admin feedback during API and policy design; review of role-permission matrix |
| S3 | Privacy and compliance officers | Policy review, legal risk management | Minimize exposure of sensitive content, maintain defensible retention and deletion policies | Cross-border transfer to LLM providers, long-lived AI logs, unclear user consent | Drives minimal-context prompting, explicit disclosure of third-party processing, 90-day AI log retention, deletion support, TLS, and encryption at rest | Review data flow diagrams and privacy notices before release |
| S4 | External AI provider (Groq) | Upstream service dependency | Receive well-formed, rate-limited requests and provide predictable streaming responses | Abuse, quota spikes, malformed prompts, burst traffic | Drives backend-proxied AI calls, request limits, timeout handling, retry strategy, and graceful degradation when AI is unavailable | Monitor provider limits and latency dashboards; keep a mock fallback for testing and demos |
| S5 | QA and test engineers | Verification and release confidence | Validate real-time sync correctness, permission enforcement, and predictable API contracts | Flaky collaboration tests, non-deterministic AI output, poor reproducibility of edge cases | Drives mockable AI interfaces, contract-tested API schemas, structured error codes, and deterministic CRDT conflict tests | Convert FR/NFR acceptance criteria into automated test cases early |
| S6 | DevOps and platform engineers | Deployment, observability, incident response | Deploy safely, monitor health, manage secrets, and recover from partial failure | Stateful collaboration server, secrets sprawl, disruptive migrations, uneven operational ownership | Drives monorepo deployment conventions, health checks, snapshot persistence, environment isolation, and a documented scaling limitation for `y-websocket` | Include platform owner in architecture reviews and release checklists |

## Why These Stakeholders Matter

- They push the design in different directions. Founders optimize for speed and differentiation, while compliance and platform owners introduce constraints that prevent risky shortcuts.
- They make hidden requirements explicit. Examples include AI retention limits, contract-testable APIs, and fallback behavior when collaboration or AI services degrade.
- They materially shape architecture. The backend proxy, quota controls, soft-lock behavior, and persistent audit data are all direct responses to stakeholder pressure rather than arbitrary implementation choices.

## Cross-Stakeholder Tensions

| Tension | Why It Exists | Design Response |
| --- | --- | --- |
| Product speed vs. privacy caution | Founders want fast AI features; compliance wants minimal disclosure and retention | Selection-scoped prompts by default, explicit opt-in for full-document summarization, 90-day AI log retention |
| Rich collaboration UX vs. operational simplicity | Users want instant real-time editing; platform engineers want manageable infrastructure | Yjs plus `y-websocket` for semester-scale simplicity, with the scaling limit documented as a known trade-off |
| Flexible AI access vs. governance | Editors want broad AI assistance; admins need policy control | Role-based AI permissions and organization policy storage for per-role toggles and quotas |
| Fast iteration vs. verification rigor | Team wants momentum; QA needs reproducible behavior | Shared contracts, mockable AI, deterministic conflict tests, and required integration coverage in the Definition of Done |
