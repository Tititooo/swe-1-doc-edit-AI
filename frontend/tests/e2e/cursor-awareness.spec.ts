import { expect, test } from '@playwright/test'

/**
 * Assignment 2 §2.2 — "Active user indicators showing who is online.
 * [Bonus] Cursor and selection tracking: Rendering remote cursors and
 * selections in real time is bonus-tier."
 *
 * Two browser contexts open the same document. When one user places a
 * caret in the shared doc, the OTHER user's editor should render a
 * `.collaboration-cursor__caret` (and a `.collaboration-cursor__label`
 * tagged with that user's display name) — these come from Tiptap's
 * `@tiptap/extension-collaboration-cursor` extension bound to the y-websocket
 * awareness channel, driven by the color/name returned from
 * POST /api/realtime/session.
 */
test('remote cursor renders with label for the other collaborator', async ({ browser }) => {
  const nameA = `Alice-${Date.now()}`
  const nameB = `Bob-${Date.now()}`
  const emailA = `alice-${Date.now()}@example.com`
  const emailB = `bob-${Date.now()}@example.com`

  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  for (const [page, name, email] of [
    [pageA, nameA, emailA],
    [pageB, nameB, emailB],
  ] as const) {
    await page.goto('/')
    await page.getByTestId('auth-mode-register').click()
    await page.getByTestId('auth-name').fill(name)
    await page.getByTestId('auth-email').fill(email)
    await page.getByTestId('auth-password').fill('PreviewPass123!')
    await page.getByTestId('auth-submit').click()
  }

  await pageA.getByTestId('dashboard-create').click()
  await expect(pageA.locator('.ProseMirror').first()).toBeVisible()

  await pageA.getByTestId('workspace-open-share').click()
  await pageA.getByTestId('share-email-input').fill(emailB)
  await pageA.getByTestId('share-role-select').selectOption('editor')
  await pageA.getByTestId('share-submit').click()
  await expect(pageA.locator(`text=${emailB}`)).toBeVisible()

  await pageB.reload()
  await pageB.locator('[data-testid^="dashboard-doc-"]').first().click()
  await expect(pageB.locator('.ProseMirror').first()).toBeVisible()

  // Alice moves her caret so Bob sees a remote cursor. We click into
  // the middle of the first paragraph so the caret has a stable position.
  const editorA = pageA.locator('.ProseMirror').first()
  await editorA.click()
  await pageA.keyboard.press('Home')
  await pageA.keyboard.press('ArrowRight')
  await pageA.keyboard.press('ArrowRight')

  const remoteCaretOnBob = pageB.locator('.collaboration-cursor__caret').first()
  await expect(remoteCaretOnBob).toBeVisible({ timeout: 10_000 })

  const remoteLabelOnBob = pageB.locator('.collaboration-cursor__label').first()
  await expect(remoteLabelOnBob).toHaveText(nameA)

  await contextA.close()
  await contextB.close()
})
