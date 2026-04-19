import { expect, test } from '@playwright/test'

/**
 * Assignment 2 §2.2 — "Active user indicators showing who is online.
 * [Bonus] Cursor and selection tracking: Rendering remote cursors and
 * selections in real time is bonus-tier."
 *
 * Two browser contexts open the same document as the same registered user.
 * Yjs assigns each Y.Doc instance a unique clientID, so even though both
 * contexts share credentials, they appear as distinct collaborators in the
 * awareness channel. When Context A moves its caret, Context B should
 * render a `.collaboration-cursor__caret` and a `.collaboration-cursor__label`
 * showing the user's display name — driven by Tiptap's
 * `@tiptap/extension-collaboration-cursor` bound to y-websocket awareness,
 * using the color/name returned from POST /api/realtime/session.
 */
test('remote cursor renders with label for the other collaborator', async ({ browser }) => {
  const name = `Collab-${Date.now()}`
  const email = `collab-${Date.now()}@example.com`
  const password = 'PreviewPass123!'

  // ── Context A: register + create document ──────────────────────────────
  const contextA = await browser.newContext()
  const pageA = await contextA.newPage()
  await pageA.goto('/')
  await pageA.getByTestId('auth-mode-register').click()
  await pageA.getByTestId('auth-name').fill(name)
  await pageA.getByTestId('auth-email').fill(email)
  await pageA.getByTestId('auth-password').fill(password)
  await pageA.getByTestId('auth-submit').click()
  await expect(pageA.getByTestId('document-dashboard')).toBeVisible()
  await pageA.getByTestId('dashboard-create').click()
  await expect(pageA.locator('.ProseMirror').first()).toBeVisible()

  // ── Context B: login as same user → open the shared document ──────────
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await pageB.goto('/')
  // Auth panel shows; switch to login mode (register button is default)
  await pageB.getByTestId('auth-mode-login').click()
  await pageB.getByTestId('auth-email').fill(email)
  await pageB.getByTestId('auth-password').fill(password)
  await pageB.getByTestId('auth-submit').click()
  await expect(pageB.getByTestId('document-dashboard')).toBeVisible()

  // The document created by Context A appears in the dashboard list
  const firstCardB = pageB.locator('[data-testid^="dashboard-doc-"]').first()
  await expect(firstCardB).toBeVisible({ timeout: 15_000 })
  await firstCardB.click()
  await expect(pageB.locator('.ProseMirror').first()).toBeVisible()

  // ── Cursor tracking ───────────────────────────────────────────────────
  // Give both WS sessions a moment to connect and sync awareness state.
  // Alice types content so the caret has a visible position, then moves
  // right so the awareness update fires with a non-zero anchor.
  const editorA = pageA.locator('.ProseMirror').first()
  await editorA.click()
  await pageA.keyboard.type('Hello collaborative world')
  await pageA.keyboard.press('Home')
  await pageA.keyboard.press('ArrowRight')
  await pageA.keyboard.press('ArrowRight')

  const remoteCaretOnB = pageB.locator('.collaboration-cursor__caret').first()
  await expect(remoteCaretOnB).toBeVisible({ timeout: 15_000 })

  const remoteLabelOnB = pageB.locator('.collaboration-cursor__label').first()
  await expect(remoteLabelOnB).toHaveText(name)

  await contextA.close()
  await contextB.close()
})
