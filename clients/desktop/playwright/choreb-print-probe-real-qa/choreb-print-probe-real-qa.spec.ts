import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * choreb-print-probe-real-qa.spec.ts
 *
 * chore 축 B 기획 — PM 진단 확증용 probe (읽기 전용).
 * "문서 모달이 열린 채 인쇄하면 배경 본문(.app-main)이 문서와 겹쳐 출력된다"를
 * 추정이 아니라 실행으로 확증한다.
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5430
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/choreb-print-probe-real-qa/choreb-print-probe-real-qa.spec.ts --reporter=line --timeout=120000
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5430'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/choreb-print-probe'))
fs.mkdirSync(SHOTS, { recursive: true })

async function measure(page: Page, tag: string) {
  const m = await page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        left: Math.round(r.left), top: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height),
        display: cs.display, visibility: cs.visibility, position: cs.position,
      }
    }
    const appMain = document.querySelector('.app-main')
    const backdrop = document.querySelector("[data-testid='ds-modal-backdrop']")
    const sidebar = document.querySelector('.app-sidebar')
    const header = document.querySelector('.app-header')
    return {
      appMain: box(appMain),
      backdrop: box(backdrop),
      sidebar: box(sidebar),
      header: box(header),
      backdropIsBodyChild: backdrop ? backdrop.parentElement?.tagName.toLowerCase() : null,
      backdropInsideAppMain: backdrop && appMain ? appMain.contains(backdrop) : null,
      appMainTextLen: appMain ? (appMain as HTMLElement).innerText.trim().length : null,
    }
  })
  console.log(`[${tag}] ${JSON.stringify(m)}`)
  return m
}

test('문서 모달 인쇄 시 배경(.app-main) 이 인쇄에 참여하는가', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/dispatch-board?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  for (const label of ['닫기', '확인']) {
    const b = page.getByRole('button', { name: label })
    if (await b.count().catch(() => 0)) await b.first().click().catch(() => undefined)
  }
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(SHOTS, '01-board-loaded.png'), fullPage: false })

  // 모달을 여는 후보를 탐색한다 — testid 를 모르므로 실제 DOM 에서 찾는다.
  const candidates = await page.evaluate(() => {
    const out: Array<{ tid: string | null; tag: string; text: string }> = []
    document.querySelectorAll('[data-testid]').forEach((el) => {
      const tid = el.getAttribute('data-testid')
      if (tid && /slip|card|detail/i.test(tid)) {
        out.push({ tid, tag: el.tagName.toLowerCase(), text: (el as HTMLElement).innerText?.slice(0, 40) ?? '' })
      }
    })
    return out.slice(0, 25)
  })
  console.log(`[CANDIDATES] ${JSON.stringify(candidates)}`)

  let opened = false
  for (const c of candidates) {
    if (!c.tid) continue
    const loc = page.getByTestId(c.tid).first()
    if (!(await loc.count().catch(() => 0))) continue
    await loc.click({ timeout: 3000 }).catch(() => undefined)
    await page.waitForTimeout(700)
    if (await page.locator("[data-testid='ds-modal-backdrop']").count()) {
      console.log(`[OPENED] via testid=${c.tid}`)
      opened = true
      break
    }
  }
  if (!opened) {
    const body = await page.locator('body').innerText()
    console.log(`[NOT-OPENED] body(1200):\n${body.slice(0, 1200)}`)
  }
  expect(opened, '문서 모달을 열지 못했습니다 — 후보 목록/본문 로그 참조').toBeTruthy()
  await page.screenshot({ path: path.join(SHOTS, '02-modal-open-screen.png'), fullPage: false })

  await measure(page, 'SCREEN')
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(400)
  const printed = await measure(page, 'PRINT')
  await page.screenshot({ path: path.join(SHOTS, '03-modal-open-print-media.png'), fullPage: false })

  // 실제 인쇄 산출물 — page.pdf 로 확증(emulateMedia 만으로는 용지 상자 레이아웃이 반영되지 않는다)
  await page.emulateMedia({ media: 'screen' })
  await page.pdf({ path: path.join(SHOTS, 'modal-open.pdf'), format: 'A4', printBackground: false })
  const pdfSize = fs.statSync(path.join(SHOTS, 'modal-open.pdf')).size
  console.log(`[PDF] modal-open.pdf ${pdfSize} bytes`)

  console.log(
    `[VERDICT] 인쇄 미디어에서 .app-main display=${printed.appMain?.display} ` +
      `크기=${printed.appMain?.w}x${printed.appMain?.h} 텍스트길이=${printed.appMainTextLen} / ` +
      `backdrop=${printed.backdrop?.display} body직속=${printed.backdropIsBodyChild} ` +
      `appMain안에있음=${printed.backdropInsideAppMain}`,
  )
})
