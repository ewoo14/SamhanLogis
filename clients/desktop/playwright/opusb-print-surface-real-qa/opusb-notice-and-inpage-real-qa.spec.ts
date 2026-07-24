/**
 * OPUS 4.8 적대검증 — PR #921 표면 B 보조 측정.
 * 1) 팝업공지(AppNoticeGate) 모달이 열린 채 전체 페이지 인쇄 라우트를 인쇄하면?
 * 2) 페이지 내 인쇄(판매조회 일괄 인쇄 / 총계정원장 출력) 경로에서 모달이 열려 있으면?
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5430'
const SHOTS = path.resolve('../../docs/qa/choreb-opus-b')
fs.mkdirSync(SHOTS, { recursive: true })

function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

async function snap(page: Page, tag: string, file: string) {
  const m = await page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { display: getComputedStyle(el).display, w: Math.round(r.width), h: Math.round(r.height) }
    }
    return {
      appMain: box('.app-main'),
      backdrop: box("[data-testid='ds-modal-backdrop']"),
      bodyText: document.body.innerText.trim().length,
    }
  })
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  fs.writeFileSync(path.join(SHOTS, `${file}.pdf`), pdf)
  await page.screenshot({ path: path.join(SHOTS, `${file}.png`) })
  console.log(`[${tag}] ${JSON.stringify(m)} pdf=${pdf.length}B/${pdfPageCount(pdf)}p`)
  return m
}

test('N1: 팝업공지 모달이 열린 채 배차지시서 인쇄 라우트 인쇄', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/sales/slip-001/print/dispatch?mockRole=MASTER&mockActiveNotice=1`, {
    waitUntil: 'domcontentloaded',
  })
  await page.evaluate(() => window.localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.dispatch-page')).toBeVisible({ timeout: 20_000 })
  const backdropCount = await page.locator("[data-testid='ds-modal-backdrop']").count()
  console.log(`[N1] backdropCount=${backdropCount}`)
  await page.screenshot({ path: path.join(SHOTS, 'n1-notice-screen.png') })
  await page.emulateMedia({ media: 'print' })
  const m = await snap(page, 'N1-NOTICE-PRINT', 'n1-notice-print')
  expect(m.appMain?.display, 'N1: 공지 모달이 열리면 배차지시서가 인쇄에서 사라진다').not.toBe('none')
})

test('N2 회귀 울타리: 판매조회 검색 모달이 열린 채 일괄 인쇄 경로 — 목록이 계속 인쇄된다 (fence #6)', async ({ page }) => {
  // fence #6(SONNET5 R1 지침): "판매조회/구매조회 검색 모달 + 일괄 인쇄 — 목록이 인쇄될 것".
  // /sales/query 는 20개 print 라우트에 없지만 window.print() 로 .app-main(그리드) 자신을
  // 인쇄하는 화면이라 AppLayout.tsx isPrintSurfacePath() 가 별도로 이 경로를 표적한다.
  await page.goto(`${BASE_URL}/#/sales/query?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.emulateMedia({ media: 'print' })
  const before = await snap(page, 'N2-NO-MODAL', 'n2-noModal-print')
  await page.emulateMedia({ media: 'screen' })

  const searchBtn = page.getByTestId('sales-query-search-btn')
  expect(await searchBtn.count(), 'N2: 검색 버튼을 찾지 못했다 — 라우트/선택자 확인 필요').toBeGreaterThan(0)

  await searchBtn.click()
  await expect(page.locator("[data-testid='ds-modal-backdrop']")).toBeVisible({ timeout: 10_000 })
  await page.emulateMedia({ media: 'print' })
  const after = await snap(page, 'N2-SEARCH-MODAL', 'n2-searchModal-print')
  console.log(`[N2] before=${before.appMain?.display} after=${after.appMain?.display} backdrop=${after.backdrop?.display}`)

  expect(before.appMain?.display, 'N2 대조군: 모달 없는 판매조회 목록이 이미 숨겨져 있다').not.toBe('none')
  expect(after.appMain?.display, 'fence #6: 검색 모달이 열리면 판매조회 목록이 인쇄에서 사라진다').not.toBe('none')
  expect(after.appMain?.w, 'fence #6: .app-main 이 인쇄 기하에서 폭 0 이 됐다').toBeGreaterThan(0)
})
