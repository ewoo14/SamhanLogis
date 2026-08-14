const { createRequire } = require('node:module')
const { join, resolve } = require('node:path')
const { mkdirSync } = require('node:fs')
const { resolveQaShotsDir } = require('./lib/qa-shots-dir.cjs')

const [appDirArg, debugPortArg, label] = process.argv.slice(2)
if (!appDirArg || !debugPortArg || !label) throw new Error('usage: node capture-electron-banner.cjs <app-dir> <debug-port> <label>')

const appDir = resolve(appDirArg)
// QA runner 의 Playwright는 모든 데스크톱 패키지에 중복 설치하지 않고
// 공용 clients/desktop 의 node_modules에서 로드한다.
const requireFromQa = createRequire(join(process.cwd(), 'clients', 'desktop', 'package.json'))
const { chromium } = requireFromQa('@playwright/test')
const shotsDir = resolveQaShotsDir(join(process.cwd(), 'docs', 'qa', '910-935-electron-banner-captures'))
mkdirSync(shotsDir, { recursive: true })
const statusTestId = appDirArg.includes('internal-chat') ? 'internal-chat-auto-update-status' : 'app-auto-update-status'

async function main() {
  let browser
  let page
  const deadline = Date.now() + 30000
  while (Date.now() < deadline && !page) {
    try {
      browser ??= await chromium.connectOverCDP(`http://127.0.0.1:${debugPortArg}`)
      const pages = browser.contexts().flatMap((context) => context.pages())
      page = pages.find((candidate) => candidate.url() !== 'about:blank') ?? pages[0]
      if (page) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!page) throw new Error('Electron renderer page not found before app exit')
  console.log(JSON.stringify({ connected: true, url: page.url(), statusTestId }))
  await page.getByTestId(statusTestId).waitFor({ state: 'visible', timeout: 30000 })
  const text = (await page.getByTestId(statusTestId).innerText()).replace(/\s+/g, ' ').trim()
  const path = join(shotsDir, `${label}-업데이트배너.png`)
  await page.screenshot({ path, fullPage: true })
  console.log(JSON.stringify({ label, path, text, url: page.url() }))
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
