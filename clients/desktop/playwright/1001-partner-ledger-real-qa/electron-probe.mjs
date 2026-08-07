import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(here, '../..')
const shots = resolveQaShotsDir(path.resolve(here, '..', '..', '..', '..', 'docs', 'qa', '1001-partner-ledger-real-qa'))
const electronPath = path.join(desktopRoot, 'node_modules/electron/dist/electron.exe')
const qaPassword = resolveQaCredential('QA_MASTER_PASSWORD')
if (!qaPassword) throw new Error('QA_MASTER_PASSWORD 환경변수가 필요합니다.')
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'samhan-1001-electron-'))

const app = await electron.launch({
  executablePath: electronPath,
  args: [desktopRoot, `--user-data-dir=${userDataDir}`, '--disable-gpu'],
  env: { ...process.env, VITE_API_BASE_URL: 'http://127.0.0.1:8080' },
})
const page = await app.firstWindow()
page.on('console', (message) => console.log(`[console:${message.type()}] ${message.text()}`))
page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`))
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(1500)
console.log('URL', page.url())
console.log('SAMHAN_AUTH', await page.evaluate(() => typeof window.samhanAuth === 'object'))
console.log('BODY', (await page.locator('body').innerText()).slice(0, 6000))
await page.screenshot({ path: path.join(shots, '00-electron-login.png'), fullPage: true })
await page.locator('[data-testid="login-id-input"]').fill('dev_master')
await page.locator('[data-testid="login-password-input"]').fill(qaPassword)
await page.locator('[data-testid="login-submit-button"]').click()
await page.waitForTimeout(2500)
console.log('AFTER_LOGIN_URL', page.url())
console.log('AFTER_LOGIN_BODY', (await page.locator('body').innerText()).slice(0, 8000))
await page.screenshot({ path: path.join(shots, '00-electron-after-login.png'), fullPage: true })
await app.close()
