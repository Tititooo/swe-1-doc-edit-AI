# Pitfalls Research

**Domain:** Collaborative document editor with AI writing assistant (React + Tiptap + Yjs + FastAPI + Groq)
**Researched:** 2026-03-20
**Confidence:** HIGH (Yjs/Tiptap pitfalls), HIGH (SSE/FastAPI streaming), MEDIUM (Groq-specific), HIGH (deployment)

---

## Critical Pitfalls

### Pitfall 1: Tiptap Standard UndoRedo Conflicts with Yjs UndoManager

**What goes wrong:**
Tiptap's standard `History` / `UndoRedo` extension and the Collaboration extension's built-in Yjs `UndoManager` are mutually exclusive. Installing both silently causes `registerPlugin()` to throw a "Adding different instances of a keyed plugin" error, and if the error is swallowed, Ctrl+Z produces catastrophically wrong behavior — including wiping the entire document on a single undo. Tracked-change accept/reject cycles are especially vulnerable because they generate synthetic transactions that the standard undo stack cannot reason about correctly.

**Why it happens:**
ProseMirror's plugin system is keyed by identity. StarterKit includes `History` by default. Teams add the `Collaboration` extension without reading the incompatibility note, or they assume both can co-exist with separate scopes.

**How to avoid:**
When using Tiptap with Yjs collaboration, disable `History`/`UndoRedo` from `StarterKit` explicitly:
```ts
StarterKit.configure({ history: false })
```
Use only the `UndoManager` provided by `y-prosemirror` / the Collaboration extension, which is peer-scoped (users undo only their own changes). For AI suggestion accept/reject, use Yjs transactions rather than ProseMirror history steps so they are undoable in the correct scope.

**Warning signs:**
- Ctrl+Z deletes more than expected
- Console error: "Adding different instances of a keyed plugin"
- Undo behavior differs between solo and collaborative sessions
- AI suggestion rejection restores to wrong state

**Phase to address:** S2 (Core Editing) — before any AI suggestion UI is wired up. Getting undo right during skeleton build prevents a full rewrite later.

---

### Pitfall 2: FastAPI SSE Stream Continues Running After Client Disconnects

**What goes wrong:**
When a user cancels an AI request (clicks Cancel, closes tab, navigates away), FastAPI's `StreamingResponse` / `EventSourceResponse` does not automatically stop the async generator. The Groq API call continues, tokens are consumed against the quota, and the database log entry may never receive a `cancelled` status. Under load, zombie Groq calls accumulate, burning token budget and potentially exhausting the free-tier 100K tokens/day cap (llama-3.3-70b-versatile: 12K TPM, 100K TPD, 30 RPM on free plan).

**Why it happens:**
Async generators in Python do not receive a cancellation signal by default when the HTTP connection closes. The ASGI layer closes the socket but the `async for` loop in the generator keeps running. This is a known FastAPI issue (GitHub #1342, #7572) that has no automatic fix — it requires explicit disconnect detection.

**How to avoid:**
Use `sse-starlette`'s `EventSourceResponse` which has built-in disconnect polling, OR implement manual disconnect checking:
```python
async def stream_ai(request: Request):
    async def generator():
        async for chunk in groq_client.stream(...):
            if await request.is_disconnected():
                await mark_interaction_cancelled(interaction_id)
                return
            yield f"data: {chunk}\n\n"
    return StreamingResponse(generator(), media_type="text/event-stream")
```
Shield any database writes from `CancelledError` to avoid corrupt log entries:
```python
await asyncio.shield(db.commit())
```
Note: `request.is_disconnected()` behavior changed in Uvicorn 0.28+ — pin uvicorn version or test explicitly.

**Warning signs:**
- Daily token quota exhausted faster than expected
- `ai_interactions` rows stuck in `pending` status after client navigates away
- Groq response latency spikes under repeated cancel-and-retry usage patterns
- Server memory grows over long test sessions

**Phase to address:** S3 (AI Integration) — implement disconnect handling before any demo testing. Failing to do this will silently drain the free-tier budget during development.

---

### Pitfall 3: Groq Free-Tier Rate Limits Kill Demo Under Realistic Load

**What goes wrong:**
The Groq free plan for `llama-3.3-70b-versatile` allows only 30 RPM, 12K TPM, and 100K tokens per day. A single AI rewrite on a 200-word paragraph uses roughly 400–600 tokens (input + output). Four teammates testing simultaneously can exhaust the per-minute limit in seconds and the daily limit within hours of integration testing. The 429 response from Groq surfaces to users as an error with no graceful fallback.

**Why it happens:**
Teams plan for demo traffic (50 users) but test at demo scale during development, burning the same API key's quota. The free tier is designed for single-developer exploration, not concurrent testing.

**How to avoid:**
1. Maintain two Groq API keys: one for development (shared free tier) and one for demo day (switch to `llama-3.1-8b-instant` as a fallback model — far higher free limits).
2. Implement the 503 graceful degradation path early: when Groq returns 429, the frontend should show "AI temporarily unavailable, try again shortly" rather than a raw error.
3. Build the retry logic in `groq_client.py` with exponential backoff for 429s: wait 5s, 10s, 20s.
4. Mock the Groq client in unit and most integration tests; only call real API in final smoke tests.
5. Monitor `X-RateLimit-Remaining-Tokens` response headers and surface a warning before quota exhaustion.

**Warning signs:**
- Groq returning 429 during development sessions
- Daily quota consumed by midday during testing
- Team members complaining AI features "don't work" — often rate limited, not broken

**Phase to address:** S1 (Foundation) — set up key management and mock infrastructure before anyone touches AI code. S3 (AI Integration) — implement graceful 429 handling.

---

### Pitfall 4: Yjs Document Not Destroyed When All Clients Disconnect (Memory Leak)

**What goes wrong:**
By default, `y-websocket` stores each `WSSharedDoc` in an in-memory map. Without a persistence layer, the doc is never removed from memory when the last client disconnects — it is only garbage-collected if the process restarts. On Render's free tier, processes restart unpredictably, so this creates an inconsistent state where: long-running sessions accumulate memory, restart clears all in-memory Yjs state, and reconnecting clients lose collaborative state that was never persisted to PostgreSQL.

**Why it happens:**
`y-websocket`'s reference server implementation is intentionally minimal. Persistence is the application's responsibility. Student projects skip this because "it works in dev" — the process never runs long enough to reveal the leak.

**How to avoid:**
Implement persistence callback in `backend/collab/server.js`:
```js
const persistence = {
  bindState: async (docName, ydoc) => {
    const snapshot = await db.getLatestSnapshot(docName)
    if (snapshot) Y.applyUpdate(ydoc, snapshot)
  },
  writeState: async (docName, ydoc) => {
    const snapshot = Y.encodeStateAsUpdate(ydoc)
    await db.saveSnapshot(docName, snapshot)
  }
}
```
Debounce writes to every 30 seconds (already in the contract spec). Test explicitly: kill the collab server while a doc is open, restart it, verify the client reconnects and sees all content.

**Warning signs:**
- Collab server memory grows over hours
- After Render service restart (frequent on free tier), collaborative state is lost
- Clients see "empty document" after server restart

**Phase to address:** S2 (Core Editing) / Teya's scope — persistence must be wired before integration testing. Temiko's skeleton should stub this so it doesn't block AI testing.

---

### Pitfall 5: Render Free Tier Spins Down Services, Breaking WebSocket Connections

**What goes wrong:**
Render's free tier spins down web services after 15 minutes of inactivity, including active WebSocket connections. The y-websocket server goes down mid-session. When the service restarts (can take 60–120 seconds), all Yjs awareness state (cursors, presence) is lost. HTTP services on free tier also spin down, causing the FastAPI backend to have ~60 second cold starts, making the first AI invocation after inactivity time out from the client's perspective (SSE connection drops before first token).

**Why it happens:**
Render free tier is designed for low-traffic apps, not persistent WebSocket servers. The spin-down affects all services in the workspace unless each is configured to receive regular traffic.

**How to avoid:**
1. Use an external keep-alive ping (e.g., UptimeRobot free tier, pinging `/health` every 5 minutes) to prevent spin-down during development and demo.
2. Expose a `/health` endpoint on both FastAPI and the collab server from day one.
3. On the client side, implement WebSocket reconnection logic in the Yjs provider — y-websocket has automatic reconnect built in, but the reconnect delay defaults can be too long for a live demo.
4. Document this limitation in the README so teammates understand the behavior.
5. For demo day: trigger a warm-up request 5 minutes before the presentation.

**Warning signs:**
- SSE AI streaming fails silently after a period of no use
- Collaborative editing shows "disconnected" indicator on first open
- First API call after idle period times out

**Phase to address:** S1 (Foundation) — deploy early to Render and observe spin-down behavior. Set up keep-alive before S3 so AI streaming is testable without cold-start interference.

---

### Pitfall 6: AI Suggestion Stored as ProseMirror Decoration Gets Lost on Yjs Sync

**What goes wrong:**
Using ProseMirror decorations (visual-only overlays) to display AI suggestions seems correct because "it doesn't touch the document." But decorations are local state — they do not survive Yjs sync, browser refresh, or navigation away and back. The AI suggestion disappears from the suggesting user's view the moment any remote peer makes an edit, because Yjs forces a re-render that discards local decoration state.

**Why it happens:**
The tracked-change approach requires storing the AI suggestion as actual document content (custom Tiptap marks/nodes) in the Yjs document, not as a decoration. This is the correct approach per the contract spec (tracked-change proposal inline), but developers often default to decorations because they appear simpler to implement.

**How to avoid:**
Implement the AI suggestion as a custom Tiptap mark or node that is inserted into the Yjs document state using a Yjs transaction:
```ts
editor.chain()
  .setMeta('addToHistory', false)   // don't pollute undo stack
  .insertContent({ type: 'aiSuggestion', content: streamedText, id: suggestionId })
  .run()
```
The suggestion must live in the Yjs document so all peers can see it and the accept/reject operation is a proper Yjs transaction visible to everyone. Keep `addToHistory: false` so the suggestion insertion does not appear as an undoable step.

**Warning signs:**
- AI suggestion disappears when collaborator makes an edit
- Refreshing the page loses the suggestion
- The suggestion is invisible to other connected users

**Phase to address:** S3 (AI Integration) — this is the core architectural decision for the AI suggestion feature. Must be decided and scaffolded before Tanisha builds the tracked-change UI in S2.

---

### Pitfall 7: Solo Skeleton Builder Locks In Interface Contracts Other Modules Can't Fulfill

**What goes wrong:**
Temiko is building the full skeleton including stubs for auth, documents, and frontend. If the stub API shapes (request/response schemas) diverge from what Atharv and Tanisha expect to build, integration week becomes a rewrite. Common failure: stubs return hardcoded shapes that "work for AI testing" but omit fields the full feature needs (e.g., stub `GET /api/documents/:id` returns no `permissions` field because AI testing doesn't need it, but Tanisha's permission UI does).

**Why it happens:**
One person building stubs optimizes for their own module's needs. Without explicit contract enforcement, stubs drift from the agreed contract.md spec.

**How to avoid:**
1. Generate Pydantic schemas directly from the contract.md API table before writing any stub. Every stub endpoint must return a response that validates against the contracted schema.
2. Use `datamodel-code-generator` to create TypeScript types from the Pydantic models, and commit them to `shared/` so Tanisha's frontend is typed against the same contract.
3. Mark every stub with a `# STUB: [owner] replaces in S[sprint]` comment so teammates know what to replace.
4. Write the API contract as an OpenAPI spec, not just markdown — this allows contract tests (`schemathesis` or `tavern`) that catch stub drift before integration week.

**Warning signs:**
- Teammates ask "what does the response look like?" during their sprint
- Stub endpoints return 200 with empty objects to make tests pass
- Frontend TypeScript types are defined locally (not from `shared/`) because the generated types don't match

**Phase to address:** S1 (Foundation) — schema generation and `shared/` types must exist before any cross-boundary code is written.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing AI suggestion as ProseMirror decoration (not Yjs node) | Easier initial implementation, no schema design needed | Suggestion lost on remote edit, invisible to collaborators, requires full rewrite | Never — this is a correctness issue, not a tradeoff |
| Skipping disconnect detection in SSE handler | Less code in early sprint | Silent quota drain, zombie Groq calls, corrupt `ai_interactions` rows | Never — implement in S3 before any real testing |
| Single Groq API key for dev + demo | Simpler secret management | Demo fails because dev testing consumed daily quota | Acceptable in S1 only; rotate to separate keys before S3 |
| No persistence in y-websocket (in-memory only) | Faster collab server setup | Lost doc state on Render restart; unusable for actual testing | Acceptable in S1 skeleton only; must be fixed before S2 merge |
| Hardcoded JWT secret from FastAPI tutorial | Works immediately | Entire user database compromised if secret leaks | Never — generate a real secret before first deploy |
| Using default Tiptap StarterKit without disabling History | Works in solo mode | Silent undo corruption when Collaboration extension is added | Never — disable History before adding Collaboration |
| Inline prompt strings instead of prompts.py templates | Faster initial AI endpoint | Prompt changes require code deploys; prompts scatter across files | Acceptable for first PoC only; consolidate to prompts.py in S3 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Groq streaming via SSE | Using `httpx` in sync mode and wrapping with `asyncio.run_in_executor` | Use `groq` Python SDK with `stream=True` and `async for chunk in response` — it is natively async |
| Groq + FastAPI SSE | Forgetting `Cache-Control: no-cache` and `X-Accel-Buffering: no` response headers | Set both headers explicitly; Render's proxy may buffer SSE without them, breaking word-by-word streaming |
| Tiptap + Yjs initial load | Loading the Yjs document before the WebSocket provider connects — editor renders blank or stale content | Subscribe to provider `synced` event and render editor only after sync, or show loading state |
| React useEffect + WebSocket provider | Creating `WebsocketProvider` inside a `useEffect` without returning a cleanup function | Always return `() => provider.destroy()` to prevent connection leaks on React strict mode double-invocation |
| JWT refresh in SPA | Storing refresh token in `localStorage` (XSS-accessible) | Store refresh token in `httpOnly` cookie; store access token in memory (Zustand store) |
| Pydantic v2 + SQLAlchemy async | Using `session.query()` (sync ORM pattern) with async session | Use `await session.execute(select(...))` — mixing sync and async ORM patterns causes deadlocks |
| CORS + SSE | Missing `text/event-stream` in CORS `allow_headers` or wrong `allow_origins` for dev vs prod URL | Explicitly configure `CORSMiddleware` with `expose_headers=["Content-Type"]` and include the Render domain in `allow_origins` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Yjs Awareness broadcast on every keystroke | Cursor position lag; server CPU spikes; WebSocket message flood | Throttle Awareness updates to 100–200ms using a debounce on the local awareness state change | At ~5+ simultaneous active typers |
| Full document snapshot on every Yjs update | Collab server writes to DB on every character typed | Debounce snapshot persistence to 30s using a per-doc timer, reset on each update | Immediately on any network latency |
| Sending full document as Groq context | 429 rate limit errors; slow first-token latency; high token cost | Enforce the 500-token context window rule (selection + 500 surrounding tokens + doc title) at the prompt construction layer, not as a "reminder" | First time a user selects a long section in a long document |
| Uncontrolled AI suggestion streaming to DOM | React re-renders on every token chunk; editor feels choppy during AI generation | Batch token accumulation (50ms window) before applying to editor, or stream to a separate pre-element until complete then apply as single Yjs transaction | Visible on any device during summarize of long text |
| Token quota counter uncached (DB read on every AI call) | Added latency on every AI endpoint; DB connection pool exhaustion under load | Cache quota counters in Zustand or a server-side dict; write-through to DB; refresh on page load | At >5 simultaneous AI invocations |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using example JWT secret from FastAPI docs (`"secret"` or `"your-secret-key"`) | All tokens forgeable if secret is known; entire user database compromised | Generate a 256-bit random secret: `openssl rand -hex 32`; store in environment variable, never in code |
| Sending more than selection + 500 context tokens to Groq by default | User's entire document content sent to third-party API; violates NFR-SP-03; potential GDPR concern | Enforce token truncation in `prompts.py` before constructing the Groq request; add a test that verifies prompt length |
| No RBAC check on `/api/ai/*` endpoints | Viewers and commenters can invoke AI by calling API directly | Auth middleware must check `role IN ('owner', 'editor')` before allowing AI endpoints, not just JWT validity |
| Logging full input/output text for all AI interactions | AI logs become a high-value data dump; violates 90-day retention plan if not purged | Implement the 90-day purge job in S1 (not deferred); set up a scheduled task in FastAPI lifespan or a cron on Render |
| Refresh token stored in `localStorage` | XSS attack can steal refresh token and maintain permanent session | Use `httpOnly` cookie for refresh token; Zustand memory store for access token only |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No "AI is writing..." indicator during SSE stream | User clicks Rewrite, nothing appears to happen; they click again, starting duplicate requests | Show spinner/skeleton immediately on click; disable the AI toolbar until first token arrives OR stream is cancelled |
| Cancel button aborts client-side but not server-side | Groq call continues; quota consumed; if user re-invokes immediately, two concurrent Groq calls run on same paragraph | Cancel must call `POST /api/ai/cancel/:suggestion_id` to abort the server-side stream, not just `EventSource.close()` |
| Soft-lock (FR-AI-07) shown as error vs. informational | Other collaborators see an error state when AI is running; they think the editor is broken | Style soft-lock as a subtle "AI is processing this paragraph" banner in the collaborator's cursor color, not a red error |
| AI suggestion appears but no obvious accept/reject affordance | Users don't know they need to take action; suggestions accumulate | Make accept/reject buttons appear immediately when suggestion is fully rendered; add keyboard shortcut tooltip |
| Streaming tokens insert into Yjs document one-by-one | Each token generates a Yjs update broadcast to all peers; peers see the AI "typing" character by character (correct) but if they edit during this, CRDT merges partial AI text with human edits | Buffer streaming tokens (100–200ms window) before applying to Yjs; keep soft-lock active for the paragraph during stream |

---

## "Looks Done But Isn't" Checklist

- [ ] **AI streaming SSE:** Shows tokens in browser — verify the stream also terminates cleanly when cancelled (check server logs for zombie async generators)
- [ ] **Undo after AI accept:** Ctrl+Z restores pre-suggestion state — verify in a multi-user session where a remote peer has made edits since the suggestion appeared
- [ ] **Quota enforcement:** 429 is returned at limit — verify the counter resets correctly at midnight UTC (not on a rolling 24h window)
- [ ] **Yjs persistence:** Collab server restart does not lose document — verify by killing the Render service and reconnecting
- [ ] **JWT refresh:** Access token expiry is transparent — verify by waiting 15 minutes during an active session and confirming no re-login prompt
- [ ] **CORS in production:** SSE works on Render URL, not just localhost — verify with the actual Render deploy URL before demo
- [ ] **AI suggestion visible to collaborators:** AI-generated tracked change appears in real-time to other connected users — verify in two-browser test
- [ ] **Soft-lock releases on AI failure:** If Groq returns 503, paragraph becomes editable within 5 seconds — verify by mocking a Groq timeout

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong undo approach (both History and Collaboration extensions active) | HIGH | Remove `History` from `StarterKit`, re-test all undo/redo flows, re-test AI accept/reject; typically 4–8 hours |
| SSE zombie calls discovered late (quota drained) | MEDIUM | Implement disconnect detection; switch to mock for remainder of sprint; pay for on-demand Groq to unblock demo |
| AI suggestion stored as decoration (not Yjs node) discovered after UI is built | HIGH | Redesign the suggestion data model as a Yjs-aware mark; rebuild the accept/reject UI to use Yjs transactions; 1–2 days |
| Render spin-down breaks demo | LOW | Enable UptimeRobot ping 30 minutes before demo; warm up by navigating to app once manually |
| Stub contract drift found during integration week | MEDIUM | Run schema validation against contract.md manually; identify and fix divergent stubs; partial re-test of all cross-boundary flows |
| Yjs state lost on server restart (no persistence) | MEDIUM | Implement persistence callbacks; restore from last PostgreSQL snapshot; test reconnect flow |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Tiptap History / Yjs UndoManager conflict | S1 Foundation (skeleton setup) | Two-user undo test: confirm Ctrl+Z only undoes the local user's changes |
| SSE disconnect handling / zombie Groq calls | S3 AI Integration | Cancel button test: confirm server logs show stream termination; confirm `ai_interactions` row status = `cancelled` |
| Groq free-tier rate limit exhaustion | S1 Foundation (key management + mocks) | All unit/integration tests use mock; real Groq called only in smoke tests |
| y-websocket memory leak / no persistence | S2 Core Editing (Teya's scope) | Restart collab server mid-session; verify document content survives |
| Render cold start / spin-down | S1 Foundation (first deploy) | Set up keep-alive after first Render deploy; verify SSE works on cold instance |
| AI suggestion as decoration (not Yjs node) | S3 AI Integration (skeleton architecture) | Two-browser test: remote peer makes edit while AI suggestion is visible; suggestion must survive |
| Solo skeleton / stub contract drift | S1 Foundation (schema generation) | All stub responses validate against Pydantic schemas generated from contract.md |
| Groq 429 graceful degradation | S3 AI Integration | Mock a 429 from Groq; verify frontend shows user-friendly message, not raw error |
| JWT secret hardcoded | S1 Foundation | `.env.example` has placeholder; CI fails if `SECRET_KEY` equals known test values |
| RBAC on AI endpoints | S3 AI Integration | Integration test: commenter JWT calling `/api/ai/rewrite` receives 403 |

---

## Sources

- [Lies I was Told About Collaborative Editing, Part 2: Why we don't use Yjs](https://www.moment.dev/blog/lies-i-was-told-pt-2) — Schema validation, tombstone memory, debugging opacity
- [y-websocket Memory Leak Issue #47](https://github.com/yjs/y-websocket/issues/47) — WSSharedDoc never destroyed without persistence
- [Tiptap: Undo/Redo Not Working Consistently with Collaboration](https://github.com/ueberdosis/tiptap/discussions/4978) — UndoManager conflict confirmed
- [Tiptap Issue #1786: Collaboration Extension Removes Entire Document On Undo](https://github.com/ueberdosis/tiptap/issues/1786) — History + Collaboration conflict
- [FastAPI Discussion #7572: Stop streaming response when client disconnects](https://github.com/fastapi/fastapi/discussions/7572) — Disconnect detection
- [Stop Burning CPU on Dead FastAPI Streams](https://jasoncameron.dev/posts/fastapi-cancel-on-disconnect) — Zombie task pattern and asyncio.shield
- [Groq Rate Limits Documentation](https://console.groq.com/docs/rate-limits) — 30 RPM / 12K TPM / 100K TPD for llama-3.3-70b-versatile free tier
- [Render Free Tier Documentation](https://render.com/docs/free) — 15-minute spin-down, 90-day PostgreSQL expiry
- [How to Keep Your FastAPI Server Active on Render's Free Tier](https://medium.com/@saveriomazza/how-to-keep-your-fastapi-server-active-on-renders-free-tier-93767b70365c) — Keep-alive patterns
- [Tiptap Undo/Redo Documentation](https://tiptap.dev/docs/editor/extensions/functionality/undo-redo) — "Do not integrate this if you plan to make your editor collaborative"
- [Yjs Discuss: Tiptap/ProseMirror + Yjs state binding issues](https://discuss.yjs.dev/t/tiptap-prosemirror-y-js-state-binding-issues/1406) — Position tracking and decoration behavior

---
*Pitfalls research for: Collaborative document editor with AI writing assistant (React + Tiptap + Yjs + FastAPI + Groq)*
*Researched: 2026-03-20*
