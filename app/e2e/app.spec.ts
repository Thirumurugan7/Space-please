import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const appDir = resolve(__dirname, '..')

test('scan a folder, search it and move a file to the Trash', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'sa-e2e-fixture-'))
  const userData = mkdtempSync(join(tmpdir(), 'sa-e2e-data-'))
  mkdirSync(join(fixture, 'docs'))
  mkdirSync(join(fixture, 'junk'))
  writeFileSync(join(fixture, 'big.bin'), Buffer.alloc(3_000_000, 1))
  writeFileSync(join(fixture, 'docs', 'report.pdf'), Buffer.alloc(10_000, 2))
  writeFileSync(join(fixture, 'junk', 'trash-me.log'), Buffer.alloc(200_000, 3))

  const env: Record<string, string> = { ...(process.env as Record<string, string>), SA_USER_DATA: userData, SA_E2E_CHOOSE_FOLDER: fixture }
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({ args: [appDir], cwd: appDir, env })

  try {
    const page = await app.firstWindow()

    await page.getByRole('button', { name: 'Choose folder…' }).click()
    await expect(page.getByTestId('scan-status')).toContainText('6 items', { timeout: 30_000 })
    await expect(page.getByRole('row', { name: /big\.bin/ })).toBeVisible()

    await page.getByRole('tab', { name: 'Search' }).click()
    await page.getByPlaceholder('Search all files').fill('trash-me')
    const row = page.getByRole('row', { name: /trash-me\.log/ })
    await expect(row).toBeVisible()
    await expect(page.getByText('1 result')).toBeVisible()

    await row.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Move to Trash' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click()

    await expect(page.getByText(/Moved 1 item/)).toBeVisible()
    await expect(row).toHaveCount(0)
    await expect(page.getByText('0 results')).toBeVisible()
    expect(existsSync(join(fixture, 'junk', 'trash-me.log'))).toBe(false)
    await expect(page.getByTestId('scan-status')).toContainText('5 items')
  } finally {
    await app.close()
    rmSync(fixture, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
})
