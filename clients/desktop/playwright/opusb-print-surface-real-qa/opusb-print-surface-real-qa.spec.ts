/**
 * OPUS 4.8 적대검증 — PR #921 표면 B (모달 소비처 x 인쇄 경로 전수)
 *
 * 가설 H1: 전역 마운트 게이트(AppVersionGate)의 업데이트 모달이 열린 채
 *          "전체 페이지 인쇄 라우트"에서 인쇄하면
 *          - #909 규칙이 backdrop 을 display:none 으로 지우고
 *          - #921 규칙이 body:has(backdrop) 로 .app-main 까지 지워
 *          => 인쇄물이 완전 백지가 된다 (PR 이전에는 문서가 정상 인쇄됨).
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5430
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/opusb-print-surface-real-qa/opusb-print-surface-real-qa.spec.ts --reporter=line --timeout=120000
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5430'
// PR #921 chore-B SONNET5 R-3 — AUDIT_SHOT_DIR 미지원이 커밋된 docs/qa/choreb-opus-b/ 를
// 덮어쓰는 함정이었다(다른 라운드에서 44개 산출물 덮어쓴 전례). 형제 스펙(choreb-sonnet-r1
// 등)과 동일한 fallback 패턴으로 통일했었으나, AUDIT_SHOT_DIR 를 안 준 "기본 실행" 자체가
// 여전히 docs/qa/choreb-opus-b/ 를 직접 덮어썼다(실 오염 재현, 2026-07-26 하네스 재수렴
// 라운드 G2). resolveQaShotsDir 로 한 번 더 감싸 기본값을 _local/ 로 격리한다.
const SHOTS = resolveQaShotsDir(
  process.env['AUDIT_SHOT_DIR']
    ? path.resolve(process.env['AUDIT_SHOT_DIR'])
    : path.resolve('../../docs/qa/choreb-opus-b'),
)
const BACKDROP = "[data-testid='ds-modal-backdrop']"

function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

async function measurePrint(page: Page, tag: string) {
  const m = await page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        display: cs.display,
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: (el as HTMLElement).innerText.trim().length,
      }
    }
    return {
      appMain: box('.app-main'),
      printPage: box('.print-page'),
      dispatchPage: box('.dispatch-page'),
      backdrop: box("[data-testid='ds-modal-backdrop']"),
      bodyText: document.body.innerText.trim().length,
    }
  })
  console.log(`[${tag}] ${JSON.stringify(m)}`)
  return m
}

/** PR #921 규칙만 런타임에서 되돌린다(= PR 이전 상태 재현). */
async function revert921(page: Page) {
  await page.addStyleTag({
    content:
      '@media print { body:has([data-testid=\'ds-modal-backdrop\']) .app-main { display: block !important; } }',
  })
}

async function pdfInfo(page: Page, name: string) {
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  fs.writeFileSync(path.join(SHOTS, name), pdf)
  return { bytes: pdf.length, pages: pdfPageCount(pdf) }
}

const PRINT_ROUTES = [
  { slug: 'statement', hash: '/sales/slip-001/print/statement', anchor: '.stm-page' },
  { slug: 'dispatch', hash: '/sales/slip-001/print/dispatch', anchor: '.dispatch-page' },
  { slug: 'purchase', hash: '/purchases/slip-001/print/purchase', anchor: '.paper' },
] as const

for (const route of PRINT_ROUTES) {
  test(`H1-${route.slug}: 업데이트(MAJOR) 모달이 열린 채 전체 페이지 인쇄 라우트를 인쇄하면 백지가 되는가`, async ({ page }) => {
    // --- 대조군: 모달 없음 ---
    await page.goto(`${BASE_URL}/#${route.hash}?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator(route.anchor)).toBeVisible({ timeout: 20_000 })
    await page.emulateMedia({ media: 'print' })
    const control = await measurePrint(page, `CONTROL-${route.slug}`)
    const controlPdf = await pdfInfo(page, `control-${route.slug}.pdf`)
    await page.screenshot({ path: path.join(SHOTS, `control-${route.slug}-print.png`) })
    await page.emulateMedia({ media: 'screen' })

    // --- 실험군: MAJOR 업데이트 모달(recommend)이 열린 상태 ---
    await page.goto(
      `${BASE_URL}/#${route.hash}?mockRole=MASTER&mockAppForce=MAJOR&mockAppLatestVersion=9.9.9`,
      { waitUntil: 'domcontentloaded' },
    )
    // hash-only 이동은 문서를 다시 부팅하지 않는다 → 버전 체크 재실행을 위해 강제 reload.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('app-version-recommend-modal')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator(route.anchor)).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: path.join(SHOTS, `h1-${route.slug}-screen.png`) })

    await page.emulateMedia({ media: 'print' })
    const withModal = await measurePrint(page, `WITH-MODAL-${route.slug}`)
    const withModalPdf = await pdfInfo(page, `h1-${route.slug}-with-update-modal.pdf`)
    await page.screenshot({ path: path.join(SHOTS, `h1-${route.slug}-print.png`) })

    // --- 인과: #921 규칙만 되돌리면 문서가 다시 인쇄되는가 ---
    await revert921(page)
    const reverted = await measurePrint(page, `REVERT921-${route.slug}`)
    const revertedPdf = await pdfInfo(page, `h1-${route.slug}-revert921.pdf`)
    await page.screenshot({ path: path.join(SHOTS, `h1-${route.slug}-revert921-print.png`) })

    console.log(
      `[SUMMARY-${route.slug}] control=${controlPdf.bytes}B/${controlPdf.pages}p ` +
        `withModal=${withModalPdf.bytes}B/${withModalPdf.pages}p ` +
        `revert921=${revertedPdf.bytes}B/${revertedPdf.pages}p`,
    )

    // 기대(결함 없음): 업데이트 모달이 있어도 문서는 계속 인쇄된다.
    expect(control.appMain?.display, '대조군 .app-main 이 이미 숨겨져 있다').not.toBe('none')
    expect(
      withModal.appMain?.display,
      `H1: 업데이트 모달이 열려 있으면 .app-main 이 인쇄에서 사라진다 (control=${control.appMain?.display})`,
    ).not.toBe('none')
    expect(reverted.appMain?.display, '되돌리기 후에도 숨김 — 원인이 #921 규칙이 아니다').not.toBe('none')
  })
}

test('H1-minor: MINOR 상세 모달이 열린 채 인쇄 라우트를 인쇄하면', async ({ page }) => {
  await page.goto(
    `${BASE_URL}/#/sales/slip-001/print/dispatch?mockRole=MASTER&mockAppForce=MINOR&mockAppLatestVersion=9.9.9`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.evaluate(() => window.localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('app-version-minor-banner')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.dispatch-page')).toBeVisible({ timeout: 20_000 })

  // 배너만 뜬 상태(모달 없음) — 인쇄 정상이어야 함
  await page.emulateMedia({ media: 'print' })
  const bannerOnly = await measurePrint(page, 'MINOR-BANNER-ONLY')
  const bannerPdf = await pdfInfo(page, 'h1-minor-control-banner-only.pdf')
  await page.screenshot({ path: path.join(SHOTS, 'h1-minor-control-print.png') })
  console.log(`[MINOR-CONTROL-PDF] ${bannerPdf.bytes}B/${bannerPdf.pages}p`)
  await page.emulateMedia({ media: 'screen' })

  // "지금 보기" → 상세 모달 열림
  await page.getByTestId('app-version-minor-view').click()
  await expect(page.getByTestId('app-version-minor-detail-modal')).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: path.join(SHOTS, 'h1-minor-screen.png') })
  await page.emulateMedia({ media: 'print' })
  const withDetail = await measurePrint(page, 'MINOR-DETAIL-OPEN')
  const pdf = await pdfInfo(page, 'h1-minor-with-detail-modal.pdf')
  await page.screenshot({ path: path.join(SHOTS, 'h1-minor-print.png') })
  console.log(`[SUMMARY-minor] bannerOnly.appMain=${bannerOnly.appMain?.display} withDetail.appMain=${withDetail.appMain?.display} pdf=${pdf.bytes}B/${pdf.pages}p`)

  expect(bannerOnly.appMain?.display, '배너만 있을 때 이미 숨겨짐').not.toBe('none')
  expect(withDetail.appMain?.display, 'H1-minor: 상세 모달을 열면 문서가 인쇄에서 사라진다').not.toBe('none')
})

test('H3: SlipDetailModal 문서가 인쇄에서 잘리지 않는가(모달 max-height/overflow)', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/dispatch-board?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dispatch-board-page')).toBeVisible({ timeout: 20_000 })
  for (const label of ['닫기', '확인']) {
    const b = page.getByRole('button', { name: label })
    if (await b.count()) await b.first().click().catch(() => undefined)
  }
  await page.locator('[data-testid^="dispatch-board-slip-row-"]').first().click()
  await expect(page.locator(BACKDROP)).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.dispatch-page')).toBeVisible({ timeout: 15_000 })
  await page.emulateMedia({ media: 'print' })

  const geom = await page.evaluate(() => {
    const doc = document.querySelector('.dispatch-page') as HTMLElement | null
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null
    const body = dialog?.querySelector('*') as HTMLElement | null
    const scroller = dialog
      ? (Array.from(dialog.querySelectorAll('*')) as HTMLElement[]).find(
          (el) => el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY === 'auto',
        )
      : null
    return {
      docRect: doc ? { w: Math.round(doc.getBoundingClientRect().width), h: Math.round(doc.getBoundingClientRect().height), scrollH: doc.scrollHeight } : null,
      dialogRect: dialog ? { w: Math.round(dialog.getBoundingClientRect().width), h: Math.round(dialog.getBoundingClientRect().height), scrollH: dialog.scrollHeight, maxH: getComputedStyle(dialog).maxHeight } : null,
      firstBodyTag: body?.className ?? null,
      clippedScroller: scroller
        ? { cls: scroller.className, clientH: scroller.clientHeight, scrollH: scroller.scrollHeight }
        : null,
    }
  })
  const pdf = await pdfInfo(page, 'h3-slip-detail-modal.pdf')
  await page.screenshot({ path: path.join(SHOTS, 'h3-slip-detail-modal-print.png') })
  console.log(`[H3] ${JSON.stringify(geom)} pdf=${pdf.bytes}B/${pdf.pages}p`)

  expect(geom.clippedScroller, `H3: 모달 내부 스크롤러가 인쇄에서 문서를 자른다 — ${JSON.stringify(geom.clippedScroller)}`).toBeNull()
})
