const { createRequire } = require('node:module')
const { join, resolve } = require('node:path')
const { mkdirSync } = require('node:fs')
const { resolveQaShotsDir } = require('./lib/qa-shots-dir.cjs')

const appDir = resolve(process.argv[2] || 'clients/arologis-desktop')
const mode = process.argv[3] || 'pending'
const requireFromQa = createRequire(join(resolve(__dirname, '..'), 'clients', 'desktop', 'package.json'))
const { _electron: electron } = requireFromQa('playwright')
const shots = resolveQaShotsDir(join(resolve(__dirname, '..'), 'docs', 'qa', '910-935-electron-banner-captures'))
mkdirSync(shots, { recursive: true })

async function main() {
  const app = await electron.launch({
    executablePath: resolve(appDir, 'node_modules/electron/dist/electron.exe'),
    args: [appDir],
  })
  try {
    const page = await app.firstWindow()
    await page.waitForTimeout(5000)
    const alerts = await page.locator('[data-testid^="certificate-expiry"]').count()
    if (mode === 'pending' && alerts !== 0) throw new Error(`pending registry rendered ${alerts} certificate alert(s)`)
    const path = join(shots, `${mode === 'pending' ? 'pending-issuance-조용한화면' : 'certificate-expiring-soon-fixture'}.png`)
    await page.screenshot({ path, fullPage: true })
    console.log(JSON.stringify({ mode, path, certificateAlerts: alerts, url: page.url() }))
  } finally {
    await app.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
