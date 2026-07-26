/**
 * PR #921 chore-B RED-first regression gate.
 *
 * The first assertion deliberately describes the desired invariant. It must
 * fail before the production CSS change, then pass after it. The same probe
 * is used for the mutation RED run by reverting only the production rule.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5430'
// AUDIT_SHOT_DIR 미지정 시 커밋된 docs/qa/choreb-luna-impl/ 을 직접 덮어쓰던 함정을
// resolveQaShotsDir 로 닫는다(기본 _local/ 격리, 2026-07-26 하네스 재수렴 라운드 G2).
const SHOTS = resolveQaShotsDir(
  process.env['AUDIT_SHOT_DIR']
    ? path.resolve(process.env['AUDIT_SHOT_DIR'])
    : path.resolve('../../docs/qa/choreb-luna-impl'),
)
const BACKDROP = "[data-testid='ds-modal-backdrop']"

function pdfPageCount(pdf: Buffer): number {
  const text = pdf.toString('latin1')
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

async function openBoard(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/dispatch-board?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dispatch-board-page')).toBeVisible({ timeout: 15_000 })
  for (const label of ['닫기', '확인']) {
    const button = page.getByRole('button', { name: label })
    if (await button.count()) await button.first().click().catch(() => undefined)
  }
  await expect(page.locator('[data-testid^="dispatch-board-slip-row-"]').first()).toBeVisible()
}

async function openSlipDetail(page: Page): Promise<void> {
  await page.locator('[data-testid^="dispatch-board-slip-row-"]').first().click()
  await expect(page.locator(BACKDROP)).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.dispatch-page')).toBeVisible({ timeout: 10_000 })
}

async function injectAppMainPdfMarker(page: Page): Promise<void> {
  await page.locator('.app-main').evaluate((node) => {
    const marker = document.createElement('div')
    marker.dataset.qaPdfMarker = 'app-main'
    marker.textContent = 'PR921-APP-MAIN-PDF-MARKER'
    marker.style.cssText = 'break-before: page; page-break-before: always; height: 1px;'
    node.append(marker)
  })
}

async function removeAppMainPdfMarker(page: Page): Promise<void> {
  await page.locator('[data-qa-pdf-marker="app-main"]').evaluate((node) => node.remove())
}

async function savePrintPdf(page: Page, name: string): Promise<number> {
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  fs.writeFileSync(path.join(SHOTS, name), pdf)
  const pages = pdfPageCount(pdf)
  expect(pages, `${name}: PDF 페이지 객체가 없다`).toBeGreaterThan(0)
  return pages
}

async function appMainPrintState(page: Page) {
  if (!(await page.locator('.app-main').count())) return null
  return page.locator('.app-main').evaluate((node) => {
    const style = getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return {
      display: style.display,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      textLength: (node as HTMLElement).innerText.trim().length,
    }
  })
}

test('PR921: 문서 모달 인쇄는 .app-main 을 인쇄에서 제외한다', async ({ page }) => {
  await openBoard(page)
  await page.screenshot({ path: path.join(SHOTS, '11-modal-after-screen.png'), fullPage: false })
  await openSlipDetail(page)
  await page.screenshot({ path: path.join(SHOTS, '12-modal-open-after-screen.png'), fullPage: false })

  await page.emulateMedia({ media: 'print' })
  const printed = await page.locator('.app-main').evaluate((node) => {
    const style = getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return {
      display: style.display,
      textLength: (node as HTMLElement).innerText.trim().length,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  })
  await page.screenshot({ path: path.join(SHOTS, '13-modal-open-after-print-media.png'), fullPage: false })

  const controlPdf = await page.pdf({ format: 'A4', printBackground: true })
  await injectAppMainPdfMarker(page)
  const markerPdf = await page.pdf({ format: 'A4', printBackground: true })
  await removeAppMainPdfMarker(page)
  fs.writeFileSync(path.join(SHOTS, '14-modal-open-after.pdf'), controlPdf)

  const controlPages = pdfPageCount(controlPdf)
  const markerPages = pdfPageCount(markerPdf)
  console.log(`[PRINT] app-main display=${printed.display} rect=${printed.width}x${printed.height} textLength=${printed.textLength}`)
  console.log(`[PDF] document=${controlPages}p marker=${markerPages}p`)

  expect(printed.display, 'IB-1: 문서 모달 인쇄에서 배경 .app-main 이 살아 있다').toBe('none')
  expect(printed.width + printed.height, 'IB-1: 숨겨진 .app-main 이 인쇄 기하에 남아 있다').toBe(0)
  expect(markerPages, 'IB-1: app-main PDF marker 가 인쇄 산출물에 참여한다').toBe(controlPages)
  await expect(page.locator('.dispatch-page'), 'IB-1: 문서 본체는 인쇄 미디어에서 남아야 한다').toBeVisible()
})

test('IB-3 회귀 울타리: 모달 없는 배차보드는 정상 인쇄된다', async ({ page }) => {
  await openBoard(page)
  await page.screenshot({ path: path.join(SHOTS, '21-board-no-modal-after-screen.png'), fullPage: false })
  await page.emulateMedia({ media: 'print' })
  const state = await appMainPrintState(page)
  const controlPages = await savePrintPdf(page, '23-board-no-modal-after.pdf')
  await injectAppMainPdfMarker(page)
  const markerPdf = await page.pdf({ format: 'A4', printBackground: true })
  await removeAppMainPdfMarker(page)
  const markerPages = pdfPageCount(markerPdf)
  await page.screenshot({ path: path.join(SHOTS, '22-board-no-modal-after-print-media.png'), fullPage: false })
  console.log(`[FENCE-2] app-main=${state.display} rect=${state.width}x${state.height} textLength=${state.textLength} PDF=${controlPages}p marker=${markerPages}p backdrop=${await page.locator(BACKDROP).count()}`)

  expect(await page.locator(BACKDROP).count(), '모달 없는 배차보드에 backdrop 이 있다').toBe(0)
  expect(state.display, 'IB-3: 모달 없는 배차보드의 .app-main 이 숨겨졌다').not.toBe('none')
  expect(state.textLength, 'IB-3: 모달 없는 배차보드 본문이 비어 있다').toBeGreaterThan(0)
  expect(markerPages, 'PDF 양성 대조군: visible app-main marker 가 산출물에 반영되지 않는다').toBeGreaterThan(controlPages)
})

test('IB-3 회귀 울타리: 전표 상세 전체 페이지 인쇄 라우트는 불변이다', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/sales/slip-001/print/dispatch?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.dispatch-page')).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: path.join(SHOTS, '31-full-page-after-screen.png'), fullPage: false })
  await page.emulateMedia({ media: 'print' })
  const state = await appMainPrintState(page)
  const pages = await savePrintPdf(page, '33-full-page-after.pdf')
  await page.screenshot({ path: path.join(SHOTS, '32-full-page-after-print-media.png'), fullPage: false })
  console.log(`[FENCE-3] dispatch-page visible=${await page.locator('.dispatch-page').isVisible()} app-main=${state.display} rect=${state.width}x${state.height} PDF=${pages}p backdrop=${await page.locator(BACKDROP).count()}`)

  expect(await page.locator(BACKDROP).count()).toBe(0)
  expect(state.display, 'IB-3: 전체 페이지 인쇄 라우트의 .app-main 이 차폐됐다').not.toBe('none')
  expect(state.textLength).toBeGreaterThan(0)
  await expect(page.locator('.dispatch-page'), 'IB-3: 전체 페이지 문서가 인쇄 미디어에서 사라졌다').toBeVisible()
})

test('IB-4 회귀 울타리: 문서 양식 편집기 미리보기 인쇄 규칙은 불변이다', async ({ page }) => {
  const templateId = '77777777-eeee-4eee-8eee-000000000002'
  await page.goto(`${BASE_URL}/#/groupware/document-templates/${templateId}/edit?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  const preview = page.getByTestId('document-template-live-preview')
  await expect(preview).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: path.join(SHOTS, '41-template-after-screen.png'), fullPage: false })
  await page.emulateMedia({ media: 'print' })
  const state = await appMainPrintState(page)
  const pages = await savePrintPdf(page, '43-template-after.pdf')
  await page.screenshot({ path: path.join(SHOTS, '42-template-after-print-media.png'), fullPage: false })
  const editorUi = await page.locator('.document-template-editor-form').count()
  const paper = preview.locator('.paper')
  console.log(`[FENCE-4] app-main=${state.display} rect=${state.width}x${state.height} editor-ui=${editorUi} editor-ui-visible=${editorUi ? await page.locator('.document-template-editor-form').isVisible() : false} paper=${await paper.isVisible()} PDF=${pages}p backdrop=${await page.locator(BACKDROP).count()}`)

  expect(await page.locator(BACKDROP).count()).toBe(0)
  expect(state.display, 'IB-4: 문서 양식 편집기 미리보기의 .app-main 이 차폐됐다').not.toBe('none')
  expect(editorUi ? await page.locator('.document-template-editor-form').isVisible() : false, 'IB-4: 편집기 UI가 print 에 유출됐다').toBe(false)
  await expect(paper, 'IB-4: 문서 양식 미리보기 paper 가 print 에서 사라졌다').toBeVisible()
})

test('IB-2 회귀 울타리: 업데이트 모달 3종은 계속 인쇄 제외된다 + 배경 문서는 살아있다', async ({ page }) => {
  // SONNET5 R1 — 직전 라운드의 이 펜스는 backdrop.display==='none' 만 단언해 지면이 통째로
  // 빈 것(R-1)을 통과시켰다(PM 지적). 대조군(모달 없는 루트 라우트 인쇄)을 먼저 찍어 MAJOR/MINOR
  // 케이스의 .app-main 상태·PDF 바이트를 그 대조군과 직접 비교한다.
  await page.goto(`${BASE_URL}/#/?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.app-main')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  await page.emulateMedia({ media: 'print' })
  const control = await appMainPrintState(page)
  const controlPages = await savePrintPdf(page, '50-update-control-no-modal.pdf')
  await page.emulateMedia({ media: 'screen' })
  console.log(`[FENCE-5-CONTROL] app-main=${control?.display} textLength=${control?.textLength} PDF=${controlPages}p`)
  expect(control?.display, '대조군(모달 없음) .app-main 이 이미 숨겨져 있다').not.toBe('none')

  const cases = [
    { force: 'CRITICAL', testId: 'app-version-blocking-modal', shot: '51-update-critical' },
    { force: 'MAJOR', testId: 'app-version-recommend-modal', shot: '52-update-major' },
    { force: 'MINOR', testId: 'app-version-minor-detail-modal', shot: '53-update-minor-detail' },
  ] as const

  for (const item of cases) {
    await page.goto(`${BASE_URL}/#/?mockRole=MASTER&mockAppForce=${item.force}&mockAppLatestVersion=9.9.9`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => window.localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    if (item.force === 'MINOR') {
      await expect(page.getByTestId('app-version-minor-banner')).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('app-version-minor-view').click()
    }
    const modal = page.getByTestId(item.testId)
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await page.emulateMedia({ media: 'print' })
    const backdropState = await page.locator(BACKDROP).evaluate((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return { display: style.display, width: Math.round(rect.width), height: Math.round(rect.height) }
    })
    const state = await appMainPrintState(page)
    const pages = await savePrintPdf(page, `${item.shot}-after.pdf`)
    await page.screenshot({ path: path.join(SHOTS, `${item.shot}-after-print-media.png`), fullPage: false })
    console.log(`[FENCE-5] ${item.force} backdrop=${backdropState.display} ${backdropState.width}x${backdropState.height} app-main=${state?.display ?? 'absent'} textLength=${state?.textLength ?? 'n/a'} PDF=${pages}p (control=${controlPages}p)`)

    expect(backdropState.display, `${item.force}: 업데이트 모달 backdrop 이 print 에 노출됐다`).toBe('none')
    // CRITICAL(blocking) 은 children 을 렌더하지 않아 .app-main 자체가 없다 — 설계상 정상(U-3).
    // MAJOR/MINOR 는 children 을 배경으로 계속 렌더하므로 .app-main 이 인쇄에서 살아있어야 한다(I-2).
    if (item.force !== 'CRITICAL') {
      expect(state?.display, `${item.force}: 배경 .app-main 이 인쇄에서 사라져 백지가 된다(R-1 재발)`).not.toBe('none')
      expect(state?.textLength ?? 0, `${item.force}: 배경 .app-main 텍스트가 비어 있다`).toBeGreaterThan(0)
      expect(pages, `${item.force}: 대조군 대비 인쇄 산출물이 사라졌다`).toBe(controlPages)
    }
    await page.emulateMedia({ media: 'screen' })
  }
})

test('허용 edge: 비문서 차량 추가 모달은 모달만 인쇄되고 배경은 차폐된다', async ({ page }) => {
  await openBoard(page)
  await page.getByTestId('dispatch-board-add-vehicle-button').click()
  const dialog = page.getByRole('dialog', { name: '차량 추가' })
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: path.join(SHOTS, '61-nondocument-modal-after-screen.png'), fullPage: false })
  await page.emulateMedia({ media: 'print' })
  const state = await appMainPrintState(page)
  const backdrop = page.locator(BACKDROP)
  const backdropState = await backdrop.evaluate((node) => {
    const style = getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return { display: style.display, width: Math.round(rect.width), height: Math.round(rect.height) }
  })
  const pages = await savePrintPdf(page, '63-nondocument-modal-after.pdf')
  await page.screenshot({ path: path.join(SHOTS, '62-nondocument-modal-after-print-media.png'), fullPage: false })
  console.log(`[FENCE-6] dialog=${await dialog.isVisible()} backdrop=${backdropState.display} ${backdropState.width}x${backdropState.height} app-main=${state.display} rect=${state.width}x${state.height} PDF=${pages}p`)

  expect(backdropState.display, '비문서 모달 자체가 print 에서 사라졌다').toBe('flex')
  expect(backdropState.width).toBeGreaterThan(0)
  expect(state.display, '비문서 모달에서 배경 .app-main 이 허용 edge 계약과 다르게 남았다').toBe('none')
})
