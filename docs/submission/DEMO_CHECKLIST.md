# Pre-Demo Validation Checklist

Run through every item below **before the live demo clock starts**. Two browser windows (one regular, one incognito) and a terminal are all you need.

URLs:
- Frontend: https://collab-editor-frontend-oxfx.onrender.com
- Backend health: https://collab-editor-backend-ghfl.onrender.com/health
- Collab health: https://collab-editor-collab.onrender.com/health

Preview credentials (if you don't want to register live):
- Email: `atharv.dev@local` / Password: `atharv-preview-pass`

---

## 0. Warm-up (do this 2+ minutes before demo)

- [ ] Hit the backend health URL → should return `{"status":"ok","uptime":...}`
- [ ] Hit the collab health URL → should return `{"status":"ok","uptime":...}`
- [ ] Open the frontend → should load the login/register page within 5 seconds
- [ ] If any service shows Render's splash page ("Service suspended"), click Deploy in Render dashboard

---

## 1. Authentication & Session Persistence (§1.1)

- [ ] **Register** a new user (fresh email, e.g. `demo-alice@test.com`)
- [ ] Editor loads and shows the dashboard
- [ ] **Refresh** the page → should stay logged in (no redirect to login)
- [ ] Open DevTools → Network → any `/api/` call → inspect header shows `Authorization: Bearer ...`
- [ ] Click **Sign Out** → returns to login screen
- [ ] Log back in with the same credentials → lands on dashboard (session works)

---

## 2. Document Dashboard (§1.2 — T1)

- [ ] Dashboard loads showing existing documents (or empty state for new user)
- [ ] Click **New Document** → editor opens, title shows "Untitled Document", status shows "Saved", role shows "Owner"
- [ ] Verify the **Back to Dashboard** button → returns to dashboard, new doc appears in list

---

## 3. Rich Text Editor + Auto-Save (§1.2 — T2, T6)

- [ ] Open any document
- [ ] Type a **heading** (use `# ` prefix or toolbar)
- [ ] Type **bold** text (`Ctrl+B` or toolbar)
- [ ] Add a **bullet list**
- [ ] Add a **code block**
- [ ] Watch status pill: `Unsaved changes` → `Saving…` → `Saved` within ~3 seconds
- [ ] Refresh the page → content is still there (auto-save worked)

---

## 4. Sharing + Role Enforcement (§1.3 — T3, T4)

Open a second browser window (incognito) and register a second user `demo-bob@test.com`.

- [ ] In Window A: open Share panel → invite `demo-bob@test.com` as **Viewer**
- [ ] In Window B: press **↻ Refresh** on dashboard (or navigate back) → shared doc appears
- [ ] In Window B: open the doc → **"View Only"** banner is visible
- [ ] In Window B: try typing → keystrokes are blocked
- [ ] **Server-side check**: `curl -X PUT https://collab-editor-backend-ghfl.onrender.com/api/documents/{id} -H "Authorization: Bearer {bob_token}" -H "Content-Type: application/json" -d '{"content":"hack","versionId":1}'` → should return `403 INSUFFICIENT_PERMISSION`
- [ ] In Window A: Share panel → change Bob from Viewer to **Editor** → confirm
- [ ] In Window B: refresh → view-only banner disappears, can now type

---

## 5. Real-Time Collaboration + Remote Cursors (§2.1, §2.2 — Bonus)

Both windows on the same document as Editor/Owner:

- [ ] Type in Window A → text appears in Window B within ~500ms
- [ ] Type in Window B → text appears in Window A
- [ ] Move cursor in Window A → Window B shows a **coloured cursor caret** with Alice's name label
- [ ] Move cursor in Window B → Window A shows Bob's cursor
- [ ] Disconnect Window A (close the tab) → cursor disappears in Window B within seconds
- [ ] Re-open Window A → reconnects, content is in sync

---

## 6. Version History + Restore (§1.2 — T4)

- [ ] Open the **Version History** panel (button in workspace header)
- [ ] List shows at least one version
- [ ] Click **Restore** on an older version → content rolls back in both windows simultaneously
- [ ] Both editors are now showing the restored content (Yjs re-synced)

---

## 7. AI Streaming — Rewrite (§3.1, §3.2, §3.3, §3.4)

- [ ] Select some text in the editor
- [ ] AI sidebar shows "Selected Text" preview
- [ ] Select **Rewrite**, choose style, click **Rewrite** button
- [ ] Tokens appear one-by-one in the **AI Suggestion** column (streaming, not a block)
- [ ] Click **Cancel** mid-stream → streaming stops, original text preserved
- [ ] Run Rewrite again, let it finish
- [ ] **Compare card** shows Original (left) | AI Suggestion (right)
- [ ] Click **Apply All** → content updates in the editor
- [ ] Press **Ctrl+Z (Cmd+Z)** → AI accept is undone (Yjs undo manager)
- [ ] "Recent AI Activity" section appears in sidebar showing the interaction

---

## 8. AI Streaming — Second Feature (§3.1)

- [ ] Select different text
- [ ] Choose **Translate** (or Summarize/Restructure)
- [ ] Streaming works for the second feature
- [ ] Accept → content updated

---

## 9. Partial AI Acceptance (§3.3 — Bonus)

- [ ] Run a Rewrite on a paragraph
- [ ] In the "AI Suggestion" column, **select part of the suggestion** with mouse
- [ ] **Apply Selection** button appears
- [ ] Click it → only the selected portion is applied to the editor

---

## 10. AI Error Handling (§3.2)

- [ ] If possible: disable network or kill backend briefly → run a Rewrite
- [ ] **ErrorBanner** shows "AI service is temporarily unavailable" (not a raw stack trace)
- [ ] Any partial streamed text is preserved with `[stream interrupted]` indicator

---

## 11. AI Interaction History (§3.5)

- [ ] After several AI interactions, the **"Recent AI Activity"** section shows last 8 entries
- [ ] Each entry shows: feature, status (accepted/rejected), snippet of text, token count

---

## 12. Export (§1.2)

- [ ] Click **Export ▾** button in the workspace header
- [ ] **Markdown (.md)** → file downloads, content is readable markdown
- [ ] **PDF** → file downloads, opens in PDF viewer, content visible
- [ ] **Word (.docx)** → file downloads, opens in Word/LibreOffice

> **API note:** the export query parameter accepts `format=md` (not `format=markdown`). The UI button already sends the correct value.

---

## 13. Share by Link (Bonus)

- [ ] Open Share panel → "Share by link" section visible
- [ ] Select role **Viewer**, click **Generate Link**
- [ ] A URL appears (e.g. `https://collab-editor-frontend.onrender.com/?share=eyJ...`)
- [ ] Click **Copy**
- [ ] Open the URL in a new incognito window where a registered user is logged in → they join the document as Viewer

---

## 14. API Documentation

- [ ] Open `https://collab-editor-backend-ghfl.onrender.com/docs`
- [ ] All routes visible with descriptions, request/response schemas
- [ ] Expand any route → shows example request body and response

---

## 15. Local Setup (for Q&A)

Know how to answer: *"Can I run this locally?"*

```bash
git clone https://github.com/Tititooo/swe-1-doc-edit-AI
cp .env.example .env        # fill in JWT_SECRET + GROQ_API_KEY
./run.sh --install          # installs all deps
./run.sh                    # starts all 3 services
# Tests: cd backend && pytest -q
# E2E:   cd frontend && npm run test:e2e
```

---

## Known Limitations to Acknowledge if Asked

| Limitation | Reason | Documented in |
|------------|--------|---------------|
| Google OAuth not implemented | Rubric says "JWT-based auth"; OAuth adds operational complexity | DEVIATIONS.md §1 |
| Single-instance WebSocket (no Redis) | Sufficient for demo scale; upgrade path is Hocuspocus + Redis | DEVIATIONS.md §5 |
| Version restore has brief CRDT window | REST-based revert; full Yjs snapshot restore would need y-websocket admin API | DEVIATIONS.md §7 |
| Cold-start latency ~30s (Render free tier) | Infrastructure constraint; warm services are instant | README §Live Deployment |

---

## Final Checklist Before Going Live

- [ ] Both browser windows are logged in as different users
- [ ] Both windows have the same document open
- [ ] Services are warm (health checks return OK)
- [ ] DevTools Network tab is open (to show Bearer header in step 1)
- [ ] Terminal ready with the `curl` command for step 4
- [ ] Know the preview credentials: `atharv.dev@local` / `atharv-preview-pass`
