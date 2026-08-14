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
    env: {
      ...process.env,
      ...(mode === 'pending' ? { CERTIFICATE_FIXTURE: '' } : { CERTIFICATE_FIXTURE: mode }),
    },
  })
  try {
    const page = await app.firstWindow()
    await page.waitForTimeout(5000)
    const alerts = await page.locator('[data-testid^="certificate-expiry"]').count()
    if (mode === 'pending' && alerts !== 0) throw new Error(`pending registry rendered ${alerts} certificate alert(s)`)
    const expectedTestId = {
      none: null,
      soon: 'certificate-expiring-soon',
      expired: 'certificate-expired',
      'issued-unknown': 'certificate-expiry-unknown',
    }[mode]
    if (expectedTestId && await page.getByTestId(expectedTestId).count() !== 1) {
      console.error(JSON.stringify({ mode, url: page.url(), certificateTestIds: await page.locator('[data-testid*="certificate"]').evaluateAll((nodes) => nodes.map((node) => ({ testId: node.getAttribute('data-testid'), text: node.textContent }))) }))
      throw new Error(`${mode} fixture did not render ${expectedTestId}`)
    }
    if (mode === 'none' && alerts !== 0) throw new Error(`none fixture rendered ${alerts} certificate alert(s)`)
    const fileName = mode === 'pending' ? 'pending-issuance-조용한화면' : `certificate-${mode}`
    const path = join(shots, `${fileName}.png`)
    await page.screenshot({ path, fullPage: true })
    console.log(JSON.stringify({ mode, path, certificateAlerts: alerts, url: page.url() }))
  } finally {
    await app.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
