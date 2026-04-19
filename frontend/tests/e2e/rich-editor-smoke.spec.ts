import { expect, test } from '@playwright/test'

test('auth, rich sync, and AI rewrite work end to end', async ({ browser, page }) => {
  const email = `smoke-${Date.now()}@example.com`
  const password = 'PreviewPass123!'
  const syncMarker = `live-sync-${Date.now()}`

  // Register and land on dashboard
  await page.goto('/')
  await page.getByTestId('auth-mode-register').click()
  await page.getByTestId('auth-name').fill('Smoke User')
  await page.getByTestId('auth-email').fill(email)
  await page.getByTestId('auth-password').fill(password)
  await page.getByTestId('auth-submit').click()

  await expect(page.getByTestId('document-dashboard')).toBeVisible()
  await page.getByTestId('dashboard-create').click()

  const editor = page.locator('.ProseMirror').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type(` ${syncMarker}`)

  // Second page — same auth context, same user, same document list
  const context = page.context()
  const secondPage = await context.newPage()
  await secondPage.goto('/')
  await expect(secondPage.getByTestId('document-dashboard')).toBeVisible()

  // The document created above should appear; open the first one
  const firstCard = secondPage.locator('[data-testid^="dashboard-doc-"]').first()
  await expect(firstCard).toBeVisible({ timeout: 15_000 })
  await firstCard.click()

  const secondEditor = secondPage.locator('.ProseMirror').first()
  await expect(secondEditor).toBeVisible()
  await expect(secondEditor).toContainText(syncMarker)

  // AI rewrite
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.getByTestId('ai-action-select').selectOption('rewrite')
  await page.getByTestId('ai-run').click()

  await expect(page.getByTestId('rich-preview')).toContainText('[rewrite:polished]')
  await page.getByTestId('rich-preview-accept').click()
  await expect(page.getByTestId('rich-preview')).toBeHidden()
  const updatedEditor = page.locator('.ProseMirror').first()
  await expect(updatedEditor).toBeVisible()
  await expect(updatedEditor).toContainText('[rewrite:polished]')
  // History panel shows after refreshHistory() resolves post-accept.
  // Wait for the AI sidebar to settle, then check history section.
  await expect(page.locator('.ai-sidebar')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('text=Recent AI Activity')).toBeVisible({ timeout: 15_000 })
})
