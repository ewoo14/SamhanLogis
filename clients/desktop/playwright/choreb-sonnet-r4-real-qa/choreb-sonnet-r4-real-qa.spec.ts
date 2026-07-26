/**
 * PR #921 chore-B SONNET5 R4 fix — CODEX SOL 2차 적대검증 도달가능 2건 RED-first 게이트.
 *
 * ## A-1 (R-3 신규 회귀) — 공용 Modal 크롬 숨김이 일반 확인 모달까지 지운다
 * `Modal.module.css` 의 `.header,.description,.footer{display:none}` 이 모든 모달에
 * 무차별 적용됐다. `SlipDetailModal`(body 에 인쇄 대상 문서)엔 맞지만, `AddVehicleModal`
 * (차량 추가 — 크롬이 곧 내용)에선 제목·설명·조작부가 인쇄물에서 사라진다.
 *
 * fix: `Modal` 에 `printableBody` opt-in prop 신설 → `[role=dialog]` 에
 * `data-print-document` 속성 부여 → CSS 크롬 숨김 규칙을 그 속성 스코프로 좁힘.
 * `SlipDetailModal` 만 opt-in.
 *
 * ## B-1 (R1 결함) — 실제 메뉴 경로 `/sales`·`/purchases` 가 인쇄 표면 판정에서 누락
 * `AppLayout.tsx` `isPrintSurfacePath()` 가 별칭 `/sales/query`·`/purchases/query` 만
 * 검사해, 사이드바 진입점 `/sales`·`/purchases` 에서 검색 모달을 열고 인쇄하면
 * `.app-main:not(.is-print-surface)` 규칙이 목록 전체를 차폐한다.
 *
 * fix: `isPrintSurfacePath()` 에 `/sales`·`/purchases` exact 매칭 추가(prefix 아님 —
 * `/sales/closing`·`/sales/link-dispatch` 같은 타 그룹 자식 과매칭 방지).
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5520
 *   set AUDIT_SHOT_DIR=<repo>\docs\qa\choreb-sonnet-r4
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts ^
 *     playwright/choreb-sonnet-r4-real-qa/choreb-sonnet-r4-real-qa.spec.ts --reporter=line --timeout=180000
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5520'
// resolveQaShotsDir 로 감싸 기본 실행이 커밋된 docs/qa/choreb-sonnet-r4/ 를 직접 덮어쓰지
// 않게 한다(기본 _local/ 격리, 2026-07-26 하네스 재수렴 라운드 G2).
const SHOTS = resolveQaShotsDir(
  process.env['AUDIT_SHOT_DIR']
    ? path.resolve(process.env['AUDIT_SHOT_DIR'])
    : path.resolve('../../docs/qa/choreb-sonnet-r4'),
)

const BACKDROP = "[data-testid='ds-modal-backdrop']"

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

/** Modal 크롬(header/description/footer) 의 인쇄 display 계산값 + 텍스트 — CSS Modules
 *  해시를 피해 DOM 구조(role=dialog 직속 header/p/footer)로 특정한다. 모든 Modal 소비처가
 *  공유하는 구조이므로 SlipDetailModal·AddVehicleModal 양쪽에 재사용 가능. */
async function dialogChromeDisplay(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const header = dialog?.querySelector(':scope > header') as HTMLElement | null
    const desc = dialog?.querySelector(':scope > p') as HTMLElement | null
    const footer = dialog?.querySelector(':scope > footer') as HTMLElement | null
    return {
      header: header ? getComputedStyle(header).display : 'absent',
      headerText: header ? (header.textContent ?? '').trim() : '',
      desc: desc ? getComputedStyle(desc).display : 'absent',
      descText: desc ? (desc.textContent ?? '').trim() : '',
      footer: footer ? getComputedStyle(footer).display : 'absent',
      footerText: footer ? (footer.textContent ?? '').trim() : '',
    }
  })
}

async function appMainState(page: Page) {
  if (!(await page.locator('.app-main').count())) return null
  return page.locator('.app-main').evaluate((node) => ({
    display: getComputedStyle(node).display,
    isPrintSurfaceClass: node.classList.contains('is-print-surface'),
    textLength: (node as HTMLElement).innerText.trim().length,
  }))
}

test.describe('A-1: Modal 크롬 인쇄 스코프 — 문서 모달만 크롬을 뺀다', () => {
  test('신규: 비문서 모달(차량 추가)은 인쇄물에도 제목·설명·조작부가 유지된다', async ({ page }) => {
    await openBoard(page)
    await page.getByTestId('dispatch-board-add-vehicle-button').click()
    const dialog = page.getByRole('dialog', { name: '차량 추가' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: path.join(SHOTS, '01-add-vehicle-screen.png'), fullPage: false })

    const chromeScreen = await dialogChromeDisplay(page)
    console.log(`[R4-A1-SCREEN] ${JSON.stringify(chromeScreen)}`)

    await page.emulateMedia({ media: 'print' })
    const chrome = await dialogChromeDisplay(page)
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    fs.writeFileSync(path.join(SHOTS, '02-add-vehicle-print.pdf'), pdf)
    await page.screenshot({ path: path.join(SHOTS, '02-add-vehicle-print-media.png'), fullPage: false })
    await page.emulateMedia({ media: 'screen' })

    console.log(`[R4-A1-PRINT] ${JSON.stringify(chrome)}`)

    expect(chrome.header, 'A-1: 일반 모달 제목이 인쇄에서 사라졌다(R-3 회귀 재현)').not.toBe('none')
    expect(chrome.headerText, 'A-1: 일반 모달 제목 텍스트가 없다').toContain('차량 추가')
    expect(chrome.desc, 'A-1: 일반 모달 설명이 인쇄에서 사라졌다(R-3 회귀 재현)').not.toBe('none')
    expect(chrome.descText, 'A-1: 일반 모달 설명 텍스트가 없다').toContain('배차에 사용할 차종과 톤수')
    expect(chrome.footer, 'A-1: 일반 모달 조작부(취소/추가)가 인쇄에서 사라졌다(R-3 회귀 재현)').not.toBe('none')
    expect(chrome.footerText, 'A-1: 일반 모달 조작부 텍스트가 없다').toContain('추가')
  })

  test('대조: 문서 모달(SlipDetailModal)은 인쇄에서 크롬이 계속 제외되고 문서는 유지된다', async ({ page }) => {
    await openBoard(page)
    await openSlipDetail(page)
    await page.screenshot({ path: path.join(SHOTS, '03-slip-detail-screen.png'), fullPage: false })

    await page.emulateMedia({ media: 'print' })
    const chrome = await dialogChromeDisplay(page)
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    fs.writeFileSync(path.join(SHOTS, '04-slip-detail-print.pdf'), pdf)
    await page.screenshot({ path: path.join(SHOTS, '04-slip-detail-print-media.png'), fullPage: false })
    const docVisible = await page.locator('.dispatch-page').isVisible()
    await page.emulateMedia({ media: 'screen' })

    console.log(`[R4-A1-CONTRAST] ${JSON.stringify(chrome)} docVisible=${docVisible} pdfBytes=${pdf.length}`)

    expect(chrome.header, 'A-1 대조: 문서 모달 제목이 인쇄에 유입됐다(무회귀 위반)').toBe('none')
    expect(chrome.desc, 'A-1 대조: 문서 모달 설명이 인쇄에 유입됐다(무회귀 위반)').toBe('none')
    expect(chrome.footer, 'A-1 대조: 문서 모달 조작부가 인쇄에 유입됐다(무회귀 위반)').toBe('none')
    expect(docVisible, 'A-1 대조: 문서 본체가 인쇄에서 사라졌다').toBe(true)
  })
})

test.describe('B-1: 사이드바 판매/구매 기본 진입점 인쇄 표면 판정', () => {
  for (const menu of [
    { path: '/sales', label: '판매관리', searchBtn: 'sales-query-search-btn', modalName: '판매 검색' },
    { path: '/purchases', label: '구매관리', searchBtn: 'purchase-query-search-btn', modalName: '구매 검색' },
  ] as const) {
    test(`신규: 사이드바 ${menu.label} 기본 진입 ${menu.path} + 검색 모달 인쇄 시 목록이 유지된다`, async ({ page }) => {
      await page.goto(`${BASE_URL}/#${menu.path}?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
      const searchBtn = page.getByTestId(menu.searchBtn)
      await expect(searchBtn).toBeVisible({ timeout: 20_000 })
      await searchBtn.click()
      await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 10_000 })
      await page.screenshot({ path: path.join(SHOTS, `10-${menu.path.slice(1)}-primary-modal-screen.png`), fullPage: false })

      await page.emulateMedia({ media: 'print' })
      const state = await appMainState(page)
      await page.screenshot({ path: path.join(SHOTS, `11-${menu.path.slice(1)}-primary-modal-print.png`), fullPage: false })
      await page.emulateMedia({ media: 'screen' })

      console.log(`[R4-B1-${menu.path}] ${JSON.stringify(state)}`)

      expect(state?.display, `B-1: ${menu.path} 기본 진입점에서 목록(.app-main)이 인쇄에서 사라졌다(R1 회귀 재현)`).not.toBe('none')
      expect(state?.isPrintSurfaceClass, `B-1: ${menu.path} 가 is-print-surface 클래스를 받지 못했다`).toBe(true)
      expect(state?.textLength ?? 0, 'B-1: 목록 텍스트가 비어 있다').toBeGreaterThan(0)
    })
  }

  test('대조: 별칭 /sales/query + 검색 모달 인쇄는 여전히 목록이 유지된다(기존 동작 무회귀)', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales/query?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    const searchBtn = page.getByTestId('sales-query-search-btn')
    await expect(searchBtn).toBeVisible({ timeout: 20_000 })
    await searchBtn.click()
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 10_000 })

    await page.emulateMedia({ media: 'print' })
    const state = await appMainState(page)
    await page.screenshot({ path: path.join(SHOTS, '12-sales-alias-modal-print.png'), fullPage: false })
    await page.emulateMedia({ media: 'screen' })

    console.log(`[R4-B1-ALIAS] ${JSON.stringify(state)}`)
    expect(state?.display, '대조: /sales/query 별칭이 회귀했다').not.toBe('none')
    expect(state?.isPrintSurfaceClass).toBe(true)
  })

  test('과잉 방지: /sales/closing(회계, 타 그룹 자식)은 인쇄 표면이 아니다(exact 매칭)', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales/closing?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.app-main')).toBeVisible({ timeout: 20_000 })
    const hasClass = await page.locator('.app-main').evaluate((node) => node.classList.contains('is-print-surface'))
    console.log(`[R4-B1-OVERMATCH] sales/closing is-print-surface=${hasClass}`)
    expect(hasClass, '/sales/closing 이 prefix 과매칭으로 인쇄 표면이 됐다(exact 매칭 위반)').toBe(false)
  })
})

/**
 * C 무회귀 라이트 스모크 — 회귀 울타리 #7("전체 페이지 인쇄 라우트 무영향"). 이 두 fix 는
 * 논리적으로 이 표면에 닿지 않는다: A-1 은 `[role=dialog]` 존재 + print 매체 + opt-in
 * 속성이 함께 있을 때만 발동(결재 인쇄 라우트는 Modal 을 렌더하지 않음 — OPUS 1차 적대검증
 * 독립 확인: `print/*.tsx` 전 파일에 Modal 참조 0건). B-1 은 boolean-OR 함수에 참 분기를
 * "추가"만 했을 뿐 기존 정규식 분기(`/print` 세그먼트 매칭 — 결재/견적 라우트는 이미 이걸로
 * true)를 건드리지 않았다. 그럼에도 실측 재확인한다(결재 1건 — 알려진 mock 시드 재사용).
 */
test('C 무회귀: 결재 문서 전체 페이지 인쇄 라우트는 두 fix 의 영향을 받지 않는다', async ({ page }) => {
  // ac-845-ds3a-reprint-pin 스펙과 동일한 mock 시드·인증 스텁 재사용 — 지어낸 id 금지 원칙.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: 'r4-c-fence-token',
          userId: '00000000-0000-0000-0000-000000010001',
          role: 'MASTER',
          fullName: '오병승',
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
  const approvalId = '77777777-aaaa-4aaa-8aaa-000000000004'
  await page.goto(`${BASE_URL}/#/groupware/approvals/${approvalId}/print?mockRole=MASTER`, {
    waitUntil: 'domcontentloaded',
  })
  const doc = page.locator('.print-approval-doc')
  await expect(doc).toBeVisible({ timeout: 15_000 })

  await page.emulateMedia({ media: 'print' })
  const state = await appMainState(page)
  const dialogCount = await page.locator('[role="dialog"]').count()
  const docVisible = await doc.isVisible()
  const docText = ((await doc.textContent()) ?? '').trim().length
  await page.screenshot({ path: path.join(SHOTS, '20-approval-print-route.png'), fullPage: false })
  await page.emulateMedia({ media: 'screen' })

  console.log(`[R4-C-APPROVAL] app-main=${JSON.stringify(state)} dialogCount=${dialogCount} docVisible=${docVisible} docTextLen=${docText}`)

  expect(dialogCount, 'C 무회귀: 결재 인쇄 라우트에 예상치 못한 Modal dialog 가 있다(A-1 스코프 전제 위반)').toBe(0)
  expect(docVisible, 'C 무회귀: 결재 문서가 인쇄에서 사라졌다').toBe(true)
  expect(docText, 'C 무회귀: 결재 문서 텍스트가 비어 있다').toBeGreaterThan(0)
})
