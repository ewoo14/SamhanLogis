const { createRequire } = require('node:module')
const { join, resolve } = require('node:path')
const { mkdirSync } = require('node:fs')
const { resolveQaShotsDir } = require('./lib/qa-shots-dir.cjs')

const [port, mode = 'pending'] = process.argv.slice(2)
if (!port) throw new Error('usage: node capture-certificate-state.cjs <debug-port> [pending|fixture]')
const repoRoot = resolve(__dirname, '..')
const { chromium } = createRequire(join(repoRoot, 'clients', 'desktop', 'package.json'))('@playwright/test')
const shots = resolveQaShotsDir(join(repoRoot, 'docs', 'qa', '910-935-electron-banner-captures'))
mkdirSync(shots, { recursive: true })

async function main() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page = browser.contexts().flatMap((context) => context.pages())[0]
  if (!page) throw new Error('Electron renderer page not found')
  await page.waitForTimeout(5000)
  if (mode === 'pending') {
    const alerts = await page.locator('[data-testid^="certificate-expiry"]').count()
    if (alerts !== 0) throw new Error(`pending registry rendered ${alerts} certificate alert(s)`)
  }
  const path = join(shots, `${mode === 'pending' ? 'pending-issuance-조용한화면' : 'certificate-expiring-soon-fixture'} .png`.replace(' .png', '.png'))
  await page.screenshot({ path, fullPage: true })
  console.log(JSON.stringify({ mode, path, certificateAlerts: await page.locator('[data-testid^="certificate-expiry"]').count(), url: page.url() }))
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
