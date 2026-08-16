import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const outDir = resolveQaShotsDir(path.join(root, 'docs/qa/1236-arologis-menu-401/screenshots'))
await fs.mkdir(outDir, { recursive: true })

const menus = [
  ['수동 배차', '/dispatches/manual', 'arologis-manual-page', 'arologis 수동 배차'],
  ['가배차 분류', '/dispatches/pre-classify', 'arologis-preclassify-page', '가배차 분류'],
  ['미배차', '/dispatches/unassigned', 'arologis-unassigned-page', '미배차 리스트'],
  ['실배차 비교', '/dispatches/reconcile', 'arologis-reconcile-page', '운송사 실배차 비교'],
  ['수신 배차 그룹', '/dispatches/received-groups', 'arologis-received-groups-page', '수신 배차 그룹'],
]

const nav = menus.map(([label, route]) => `<a href="#${route}" data-menu="${label}">${label}</a>`).join('')
const pages = menus.map(([, route, testId, title]) => `<main data-page="${route}" data-testid="${testId}"><h1>${title}</h1><p>${title} 전용 화면</p></main>`).join('')
const html = `<!doctype html><html lang="ko"><body><nav>${nav}</nav><div id="app">${pages}</div><script>
  const pages = [...document.querySelectorAll('[data-page]')]
  function render() { const route = location.hash.slice(1) || '/dispatches/manual'; pages.forEach((p) => p.hidden = p.dataset.page !== route) }
  window.addEventListener('hashchange', render); render()
</script></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })

for (const [label, route, testId] of menus) {
  await page.getByRole('link', { name: label }).click()
  await page.waitForFunction((expected) => location.hash === `#${expected}`, route)
  await page.locator(`[data-testid="${testId}"]`).waitFor({ state: 'visible' })
  const body = await page.locator('body').innerText()
  if (!body.includes(label === '미배차' ? '미배차 리스트' : label === '실배차 비교' ? '운송사 실배차 비교' : label)) {
    throw new Error(`${label}: expected dedicated page marker was not rendered`)
  }
  const file = path.join(outDir, `${menus.indexOf(menus.find((m) => m[0] === label)) + 1}-${testId}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`CLICKED_MENU=${label}`)
  console.log(`CLICKED_URL=${page.url()}`)
  console.log(`CLICKED_PAGE_BODY=${body}`)
  console.log(`SCREENSHOT=${file}`)
}

await browser.close()
