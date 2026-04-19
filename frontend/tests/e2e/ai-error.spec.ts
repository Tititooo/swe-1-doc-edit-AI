import { expect, test } from '@playwright/test'

/**
 * Covers Assignment 2 §3.2: "Errors mid-stream show a clear message".
 *
 * We mock the backend streaming endpoint to return a 503 with the documented
 * error envelope (`{message, code: AI_SERVICE_UNAVAILABLE}`). The frontend
 * must surface the friendly "temporarily unavailable" banner — not the raw
 * backend message — because useAI maps the code/status to a user-facing
 * string (see TM3).
 */
test('AI stream failure shows friendly banner, hides raw upstream message', async ({ page }) => {
  const email = `ai-error-${Date.now()}@example.com`
  const password = 'PreviewPass123!'

  await page.route('**/api/ai/rewrite', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'upstream groq raw diagnostic',
        code: 'AI_SERVICE_UNAVAILABLE',
      }),
    })
  })

  await page.goto('/')
  await page.getByTestId('auth-mode-register').click()
  await page.getByTestId('auth-name').fill('Error Tester')
  await page.getByTestId('auth-email').fill(email)
  await page.getByTestId('auth-password').fill(password)
  await page.getByTestId('auth-submit').click()

  await expect(page.getByTestId('document-dashboard')).toBeVisible()
  await page.getByTestId('dashboard-create').click()

  const editor = page.locator('.ProseMirror').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.type('The quick brown fox jumps over the lazy dog.')
  await page.keyboard.press('ControlOrMeta+A')
  await page.getByTestId('ai-action-select').selectOption('rewrite')
  await page.getByTestId('ai-run').click()

  const banner = page.locator('.error-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('temporarily unavailable')
  await expect(banner).not.toContainText('upstream groq raw diagnostic')
})
