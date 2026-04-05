import { expect, test } from '@playwright/test'

test('auth, rich sync, and AI rewrite work end to end', async ({ browser, page }) => {
  const email = `smoke-${Date.now()}@example.com`
  const password = 'PreviewPass123!'
  const syncMarker = `live-sync-${Date.now()}`

  await page.goto('/')
  await page.getByTestId('auth-mode-register').click()
  await page.getByTestId('auth-name').fill('Smoke User')
  await page.getByTestId('auth-email').fill(email)
  await page.getByTestId('auth-password').fill(password)
  await page.getByTestId('auth-submit').click()

  await page.getByTestId('load-document').click()

  const editor = page.locator('.ProseMirror').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type(` ${syncMarker}`)

  const context = page.context()
  const secondPage = await context.newPage()
  await secondPage.goto('/')
  await secondPage.getByTestId('load-document').click()
  const secondEditor = secondPage.locator('.ProseMirror').first()
  await expect(secondEditor).toBeVisible()
  await expect(secondEditor).toContainText(syncMarker)

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
  await expect(page.locator('text=Recent AI Activity')).toBeVisible()
})
