/**
 * PR #921 chore-B SONNET5 R1 라운드 fix — 회귀 울타리 ③ 전용 스펙.
 *
 * OPUS 4.8 1차 적대검증이 확증한 두 회귀:
 *   R-1: 전체 페이지 인쇄 라우트(statement/dispatch/purchase) + 업데이트 모달(MAJOR/MINOR) 인쇄 → 백지(1,053B)
 *   R-2: 배차지시서 인쇄 라우트 + 팝업공지 모달 → 공지 모달만 인쇄, 문서 소실
 *
 * 이 파일은 회귀 울타리 ③ "전체 페이지 인쇄 라우트 3종 × 4 모달상태(없음/업데이트/공지/일반) =
 * 12조합"을 전수 측정한다. 앞의 3상태(없음/업데이트/공지)는 opusb-print-surface-real-qa 의
 * H1/N1 이 이미 개별 라우트별로 커버하므로, 이 파일의 고유 기여는 ④ "일반(비게이트) 모달" 상태다
 * — statement/dispatch/purchase 는 읽기 전용 인쇄 미리보기라 실 트리거 UI가 없어, design-system
 * Modal 이 렌더하는 backdrop 구조(`data-testid='ds-modal-backdrop'` + 내부 `role="dialog"`)를
 * DOM 에 직접 합성 주입해 "열거되지 않은 임의의 실제 콘텐츠 모달이 열려 있어도 인쇄 대상 라우트의
 * 문서는 살아있다"(I-3)를 CSS 선택자 구조 자체로 검증한다.
 *
 * ⚠️ PDF 바이트 크기만으로 결론 내지 않는다 — 합성 모달에 고유 마커 텍스트를 심어 pypdf 로 추출
 * 가능한지(양성 대조군), 그리고 문서 자신의 고유 텍스트(anchor innerText 앞부분)가 인쇄 PDF 에도
 * 그대로 있는지 별도 파이썬 스텝(choreb-sonnet-r1-pdf-text-check.py)에서 교차검증한다.
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5430
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/choreb-sonnet-r1-real-qa/choreb-sonnet-r1-real-qa.spec.ts --reporter=line --timeout=180000
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5430'
// resolveQaShotsDir 로 감싸 기본 실행이 커밋된 docs/qa/choreb-sonnet-r1/ 을 직접 덮어쓰지
// 않게 한다(기본 _local/ 격리, 2026-07-26 하네스 재수렴 라운드 G2).
const SHOTS = resolveQaShotsDir(
  process.env['AUDIT_SHOT_DIR']
    ? path.resolve(process.env['AUDIT_SHOT_DIR'])
    : path.resolve('../../docs/qa/choreb-sonnet-r1'),
)

const BACKDROP = "[data-testid='ds-modal-backdrop']"
const SYNTHETIC_MARKER_TEXT = 'SONNET-R1-SYNTHETIC-GENERIC-MODAL-MARKER-9f3c1a'

function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        display: cs.display,
        w: Math.round(r.width),
        h: Math.round(r.height),
        textLength: (el as HTMLElement).innerText.trim().length,
      }
    }
    return {
      appMain: box('.app-main'),
      backdropCount: document.querySelectorAll("[data-testid='ds-modal-backdrop']").length,
    }
  })
}

async function pdfInfo(page: Page, name: string) {
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  fs.writeFileSync(path.join(SHOTS, name), pdf)
  return { bytes: pdf.length, pages: pdfPageCount(pdf) }
}

/**
 * design-system Modal.tsx(clients/web/design-system/src/components/Modal/Modal.tsx) 이
 * 실제로 렌더하는 backdrop DOM 구조(data-testid='ds-modal-backdrop' > [role=dialog])를
 * document.body 에 직접 합성 주입한다 — 4 게이트 testid 중 어느 것도 포함하지 않으므로
 * global.css 의 gate-exclusion selector 와 매치되지 않는 "일반 모달"을 흉내낸다.
 * design-system 패키지는 이 파일에서도 전혀 수정하지 않는다(런타임 DOM 조작만).
 */
async function injectGenericModal(page: Page): Promise<void> {
  await page.evaluate((markerText) => {
    const backdrop = document.createElement('div')
    backdrop.setAttribute('data-testid', 'ds-modal-backdrop')
    backdrop.setAttribute('data-qa-synthetic', 'true')
    backdrop.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.35);z-index:9999;'
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.style.cssText = 'background:#fff;padding:24px;min-width:320px;min-height:160px;'
    dialog.textContent = markerText
    backdrop.appendChild(dialog)
    document.body.appendChild(backdrop)
  }, SYNTHETIC_MARKER_TEXT)
  await expect(page.locator(BACKDROP)).toBeVisible({ timeout: 5_000 })
}

async function removeGenericModal(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelector('[data-qa-synthetic="true"]')?.remove()
  })
}

const PRINT_ROUTES = [
  { slug: 'statement', hash: '/sales/slip-001/print/statement', anchor: '.stm-page' },
  { slug: 'dispatch', hash: '/sales/slip-001/print/dispatch', anchor: '.dispatch-page' },
  { slug: 'purchase', hash: '/purchases/slip-001/print/purchase', anchor: '.paper' },
] as const

type ComboResult = { state: string; appMainDisplay: string | undefined; textLength: number; bytes: number; pages: number }
const MATRIX: ComboResult[] = []

for (const route of PRINT_ROUTES) {
  test(`fence-3 매트릭스 [${route.slug}]: 4 모달상태(없음/업데이트/공지/일반) × 인쇄 산출물 대조군 비교`, async ({ page }) => {
    const results: ComboResult[] = []

    // --- 상태 1: 모달 없음 (대조군) ---
    await page.goto(`${BASE_URL}/#${route.hash}?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator(route.anchor)).toBeVisible({ timeout: 20_000 })
    const anchorText = (await page.locator(route.anchor).innerText()).trim().slice(0, 40)
    await page.emulateMedia({ media: 'print' })
    const m1 = await measure(page)
    const p1 = await pdfInfo(page, `matrix-${route.slug}-1-no-modal.pdf`)
    await page.screenshot({ path: path.join(SHOTS, `matrix-${route.slug}-1-no-modal.png`) })
    await page.emulateMedia({ media: 'screen' })
    results.push({ state: 'no-modal(control)', appMainDisplay: m1.appMain?.display, textLength: m1.appMain?.textLength ?? 0, bytes: p1.bytes, pages: p1.pages })

    // --- 상태 2: 일반(비게이트) 모달 — 합성 주입 ---
    await injectGenericModal(page)
    await page.emulateMedia({ media: 'print' })
    const m2 = await measure(page)
    const p2 = await pdfInfo(page, `matrix-${route.slug}-2-generic-modal.pdf`)
    await page.screenshot({ path: path.join(SHOTS, `matrix-${route.slug}-2-generic-modal.png`) })
    await page.emulateMedia({ media: 'screen' })
    await removeGenericModal(page)
    results.push({ state: 'generic-modal', appMainDisplay: m2.appMain?.display, textLength: m2.appMain?.textLength ?? 0, bytes: p2.bytes, pages: p2.pages })

    // --- 상태 3: 업데이트 모달(MAJOR recommend) ---
    await page.goto(`${BASE_URL}/#${route.hash}?mockRole=MASTER&mockAppForce=MAJOR&mockAppLatestVersion=9.9.9`, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('app-version-recommend-modal')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator(route.anchor)).toBeVisible({ timeout: 20_000 })
    await page.emulateMedia({ media: 'print' })
    const m3 = await measure(page)
    const p3 = await pdfInfo(page, `matrix-${route.slug}-3-update-modal.pdf`)
    await page.screenshot({ path: path.join(SHOTS, `matrix-${route.slug}-3-update-modal.png`) })
    await page.emulateMedia({ media: 'screen' })
    results.push({ state: 'update-modal(MAJOR)', appMainDisplay: m3.appMain?.display, textLength: m3.appMain?.textLength ?? 0, bytes: p3.bytes, pages: p3.pages })

    // --- 상태 4: 팝업공지 모달 ---
    await page.goto(`${BASE_URL}/#${route.hash}?mockRole=MASTER&mockActiveNotice=1`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => window.localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator(route.anchor)).toBeVisible({ timeout: 20_000 })
    const noticeBackdropCount = await page.locator(BACKDROP).count()
    await page.emulateMedia({ media: 'print' })
    const m4 = await measure(page)
    const p4 = await pdfInfo(page, `matrix-${route.slug}-4-notice-modal.pdf`)
    await page.screenshot({ path: path.join(SHOTS, `matrix-${route.slug}-4-notice-modal.png`) })
    await page.emulateMedia({ media: 'screen' })
    results.push({ state: 'notice-modal', appMainDisplay: m4.appMain?.display, textLength: m4.appMain?.textLength ?? 0, bytes: p4.bytes, pages: p4.pages })

    console.log(`[MATRIX-${route.slug}] anchorTextSample="${anchorText}" noticeBackdropCount=${noticeBackdropCount}`)
    for (const r of results) {
      console.log(`[MATRIX-${route.slug}][${r.state}] app-main=${r.appMainDisplay} textLength=${r.textLength} pdf=${r.bytes}B/${r.pages}p`)
      MATRIX.push({ ...r, state: `${route.slug}:${r.state}` })
    }

    const control = results[0]!
    for (const r of results) {
      expect(r.appMainDisplay, `[${route.slug}/${r.state}] .app-main 이 인쇄에서 사라졌다(I-3 위반)`).not.toBe('none')
      expect(r.textLength, `[${route.slug}/${r.state}] .app-main 텍스트가 비어 있다`).toBeGreaterThan(0)
    }
    // 일반 모달·업데이트 모달·공지 모달 3상태 모두 대조군과 "동일한" 문서가 인쇄돼야 한다.
    // 업데이트/공지는 backdrop 자체가 인쇄에서 완전히 빠지므로 바이트가 대조군과 정확히 같아야
    // 하고, 일반 모달은 그 모달 자신도 함께 인쇄되는 게 허용 edge 라 바이트는 대조군 "이상"이면
    // 된다(문서가 줄어들지 않았다는 뜻).
    expect(results[2]!.bytes, `[${route.slug}] 업데이트 모달 상태 PDF 가 대조군과 다르다`).toBe(control.bytes)
    expect(results[3]!.bytes, `[${route.slug}] 공지 모달 상태 PDF 가 대조군과 다르다`).toBe(control.bytes)
    expect(results[1]!.bytes, `[${route.slug}] 일반 모달 상태 PDF 가 대조군보다 작다(문서 소실 의심)`).toBeGreaterThanOrEqual(control.bytes)
  })
}

test.afterAll(() => {
  fs.writeFileSync(path.join(SHOTS, 'matrix-summary.json'), JSON.stringify(MATRIX, null, 2))
})
