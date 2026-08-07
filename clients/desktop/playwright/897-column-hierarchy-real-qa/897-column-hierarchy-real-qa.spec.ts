import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const qaShotsDir = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '897-column-hierarchy'))

type LoginResult = {
  token: string
  userId: string
  role: string
  displayName: string
}

async function realLogin(page: Page, loginId = 'dev_master', password = (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password },
  })
  expect(response.ok(), `실 로그인 HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as { data?: Partial<LoginResult> }
  const data = body.data ?? {}
  return {
    token: data.token ?? '',
    userId: data.userId ?? '',
    role: data.role ?? '',
    displayName: data.displayName ?? 'dev_master',
  }
}

async function installAuth(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript((auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: auth.token,
          userId: auth.userId,
          role: auth.role,
          fullName: auth.displayName,
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, login)
}

async function dismissUpdateModal(page: Page): Promise<void> {
  for (const label of ['닫기', '확인']) {
    const button = page.getByRole('button', { name: label, exact: true })
    if (await button.count()) await button.first().click().catch(() => undefined)
  }
}

/**
 * [머지 전 재수렴 S8] page.goto(url) 을 "이미 그 URL 에 있을 때" 다시 호출하면 해시
 * 라우터 특성상 same-document navigation 으로 처리돼 실제로 reload 되지 않는다 —
 * 직전 조건의 SPA 상태(펼친 상세 패널·필터)가 그대로 남는다. R1 테스트가 조건1→조건2
 * →조건3 세 번 모두 동일 URL 로 재진입을 가정하는데, 조건2 의 goto 가 이 무동작에
 * 해당돼 조건1 에서 이미 펼쳐둔 패널이 잔존한 채 조건2 의 "첫 클릭"이 열기 대신
 * 접기로 동작해 "[기본필터] 상세 패널 미표시"로 실패했다(제품 결함 아님 — 스펙
 * 자체가 실제 사용자 재진입을 흉내내지 못한 결함). about:blank 경유로 매번 완전한
 * 재진입을 강제해 각 조건이 "새로 열었다"는 전제를 실제로 충족시킨다.
 */
async function gotoFresh(page: Page, url: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(url, { waitUntil: 'domcontentloaded' })
}

async function readGeometry(table: import('@playwright/test').Locator) {
  return table.evaluate((node) => {
    const scroll = node.parentElement
    const wrapper = scroll?.parentElement
    return {
      tableW: Math.round(node.getBoundingClientRect().width),
      wrapperW: Math.round(wrapper?.getBoundingClientRect().width ?? 0),
      docW: document.documentElement.clientWidth,
      scrollW: scroll?.scrollWidth ?? 0,
      headers: Array.from(node.querySelectorAll('thead th')).map((header) => header.textContent?.trim() ?? ''),
    }
  })
}

test.describe.serial('897 실 서버 U-gate', () => {
  test('입출금 내역: 폭·상세·실 캡처', async ({ page }) => {
    const login = await realLogin(page)
    await installAuth(page, login)
    await page.goto('/#/accounting/bank-transactions', { waitUntil: 'domcontentloaded' })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역', { timeout: 30_000 })

    const table = page.locator('.bank-transaction-table table').first()
    await expect(table).toBeVisible({ timeout: 30_000 })
    const geometry = await readGeometry(table)
    console.log('[897 라이브 폭 실측] bank', JSON.stringify(geometry))
    expect(geometry.tableW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.scrollW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)

    // #897 적대검증 fix(721340f03)로 상세는 <details>/<summary> 대신 버튼 토글 +
    // 표 아래 전폭 <section> 패널로 재설계됐다(고정폭 셀 안 disclosure의 0px 붕괴 결함).
    const detailToggle = page.locator('button[data-testid^="bank-transaction-detail-toggle-"]').first()
    if (await detailToggle.count()) {
      await detailToggle.click()
      const detail = page.locator('section[data-testid^="bank-transaction-detail-"]').first()
      const detailValue = await detail.locator('dd').first().textContent()
      console.log('[897 라이브 C2] bank 상세 첫 값', JSON.stringify(detailValue?.trim() ?? ''))
      expect(detailValue?.trim()).toBeTruthy()
    }

    await page.screenshot({ path: join(qaShotsDir, 'bank-live-1600.png'), fullPage: true })
  })

  test('일일 마감: 폭·기존 상세 경로·실 캡처', async ({ page }) => {
    const login = await realLogin(page)
    await installAuth(page, login)
    await page.goto('/#/accounting/daily-closing', { waitUntil: 'domcontentloaded' })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('daily-closing-page')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('daily-closing-filter-date').fill('2020-01-02')

    const table = page.getByTestId('daily-closing-list-table').locator('table')
    await expect(table).toBeVisible({ timeout: 30_000 })
    await expect(table).toContainText('2020-01-02', { timeout: 30_000 })
    const geometry = await readGeometry(table)
    console.log('[897 라이브 폭 실측] daily', JSON.stringify(geometry))
    expect(geometry.tableW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.scrollW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)

    const detailButton = page.locator('[data-testid^="daily-closing-detail-button-"]').first()
    if (await detailButton.count()) {
      await detailButton.click()
      const detail = page.locator('#daily-closing-detail')
      await expect(detail).toContainText(/\S+/, { timeout: 30_000 })
      console.log('[897 라이브 C2] daily 상세 값', JSON.stringify((await detail.innerText()).slice(0, 240)))
    }

    await page.screenshot({ path: join(qaShotsDir, 'daily-live-1600.png'), fullPage: true })
  })

  test('좁은 폭: #880 조작 버튼 도달성', async ({ page }) => {
    const login = await realLogin(page)
    await installAuth(page, login)
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/#/accounting/bank-transactions', { waitUntil: 'domcontentloaded' })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역', { timeout: 30_000 })

    const bankAction = page.locator('td[data-mobile-priority="secondary"] button').first()
    if (await bankAction.count()) {
      await expect(bankAction).toBeVisible()
      await expect(bankAction).toBeEnabled()
    }

    await page.goto('/#/accounting/daily-closing', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('daily-closing-page')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('daily-closing-filter-date').fill('2020-01-02')
    await expect(page.getByTestId('daily-closing-list-table')).toContainText('2020-01-02', { timeout: 30_000 })
    const dailyAction = page.locator('[data-testid^="daily-closing-reverse-button-"]').first()
    if (await dailyAction.count()) {
      await expect(dailyAction).toBeVisible()
      await expect(dailyAction).toBeEnabled()
    }
    expect(await page.locator('td[data-mobile-priority="secondary"] button').count()).toBeGreaterThan(0)
  })

  /**
   * 🔴 머지 전 재수렴 R1 — 상세 보기를 눌러도 화면에서 아무 일도 일어나지 않는다.
   * 리뷰 재현(#929)과 동일한 3조건(전체기간 316행·기본 필터·모바일 375px)을 실 서버
   * 데이터로 그대로 검증한다. panelW>0 가 아니라 클릭 시점의 뷰포트 내 실제 위치 +
   * 포커스 이동을 단정한다 — mock 스펙(897-column-hierarchy.spec.ts)의 동일 보강과 쌍.
   */
  async function revealFirstBankDetailAndAssert(page: Page, label: string) {
    const toggle = page.locator('button[data-testid^="bank-transaction-detail-toggle-"]').first()
    await expect(toggle, `[${label}] 상세 토글 버튼 없음`).toBeVisible({ timeout: 30_000 })
    const rowCount = await page.locator('.bank-transaction-table table tbody tr').count()
    const beforeScrollY = await page.evaluate(() => window.scrollY)
    await toggle.click()
    const toggleTestId = await toggle.getAttribute('data-testid')
    const externalRef = toggleTestId?.replace('bank-transaction-detail-toggle-', '') ?? ''
    const detail = page.locator(`section[data-testid="bank-transaction-detail-${externalRef}"]`)
    await expect(detail, `[${label}] 상세 패널 미표시`).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(
        () => detail.evaluate((node) => {
          const rect = (node as HTMLElement).getBoundingClientRect()
          return rect.top < window.innerHeight && rect.bottom > 0
        }),
        { timeout: 5_000, message: `[${label}] 상세 패널이 클릭 후에도 뷰포트 밖에 머문다` },
      )
      .toBe(true)
    const afterScrollY = await page.evaluate(() => window.scrollY)
    const focusInsidePanel = await detail.evaluate((node) => {
      const active = document.activeElement
      return Boolean(active) && (node === active || node.contains(active) || Boolean(active?.contains(node)))
    })
    console.log(`[897 R1 라이브 실측] ${label}`, JSON.stringify({ rowCount, beforeScrollY, afterScrollY, focusInsidePanel }))
    expect(focusInsidePanel, `[${label}] 포커스가 패널로 이동하지 않음`).toBe(true)
    return rowCount
  }

  test('R1 — 상세 보기는 전체기간·기본 필터·모바일 375px 세 조건 모두에서 뷰포트로 스크롤·포커스된다', async ({ page }) => {
    const login = await realLogin(page, 'dev_manager')
    await installAuth(page, login)

    // 조건1 — 전체기간(리뷰 재현과 동일: 2020-01-01~2030-12-31)
    await gotoFresh(page, '/#/accounting/bank-transactions')
    await dismissUpdateModal(page)
    await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역', { timeout: 30_000 })
    await page.getByRole('textbox', { name: '시작일' }).nth(1).fill('2020-01-01')
    await page.getByRole('textbox', { name: '종료일' }).nth(1).fill('2030-12-31')
    await page.getByRole('button', { name: '조회', exact: true }).click()
    const wideRowCount = await revealFirstBankDetailAndAssert(page, '전체기간')
    expect(wideRowCount, '전체기간 행수가 0 — 조건 자체가 성립하지 않음').toBeGreaterThan(0)

    // 조건2 — 기본 필터(당월, 조회 버튼을 다시 누르지 않은 최초 로드)
    // [머지 전 재수렴 S8] 조건1 과 동일 URL 이라 일반 goto 는 무동작(same-document)이라
    // 조건1 이 펼쳐둔 패널이 잔존한다 — gotoFresh 로 실제 재진입을 강제한다.
    await gotoFresh(page, '/#/accounting/bank-transactions')
    await dismissUpdateModal(page)
    await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역', { timeout: 30_000 })
    const defaultToggleCount = await page.locator('button[data-testid^="bank-transaction-detail-toggle-"]').count()
    if (defaultToggleCount > 0) {
      await revealFirstBankDetailAndAssert(page, '기본필터')
    } else {
      console.log('[897 R1 라이브 실측] 기본필터 — 당월 범위에 행이 없어 이 조건은 생략(전체기간·모바일로 커버)')
    }

    // 조건3 — 모바일 375px (전체기간 데이터 유지한 채 리사이즈 — 리뷰가 측정한 "23,514px 화면 밖"과 동일 데이터량)
    await gotoFresh(page, '/#/accounting/bank-transactions')
    await dismissUpdateModal(page)
    await page.getByRole('textbox', { name: '시작일' }).nth(1).fill('2020-01-01')
    await page.getByRole('textbox', { name: '종료일' }).nth(1).fill('2030-12-31')
    await page.getByRole('button', { name: '조회', exact: true }).click()
    await page.setViewportSize({ width: 375, height: 900 })
    await revealFirstBankDetailAndAssert(page, '모바일375')
  })

  /**
   * 🔴 머지 전 재수렴 R2 — 목록 열만으로 행 대다수가 구별되지 않는다(리뷰 실측: 316행 중
   * 288행/91%, 6월 범위 133행 중 118행). 리뷰와 동일한 방식(선택·상세 셀 제외 렌더 텍스트
   * 그룹핑)으로 실 서버 데이터를 그대로 재검증한다.
   */
  test('R2 — 목록 행 시그니처 중복이 계좌 표시로 해소된다(실 서버 전체기간)', async ({ page }) => {
    const login = await realLogin(page, 'dev_manager')
    await installAuth(page, login)
    await page.goto('/#/accounting/bank-transactions', { waitUntil: 'domcontentloaded' })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역', { timeout: 30_000 })
    await page.getByRole('textbox', { name: '시작일' }).nth(1).fill('2020-01-01')
    await page.getByRole('textbox', { name: '종료일' }).nth(1).fill('2030-12-31')
    await page.getByRole('button', { name: '조회', exact: true }).click()
    await expect(page.locator('.bank-transaction-table table tbody tr').first()).toBeVisible({ timeout: 30_000 })

    const rowSignatures = await page.locator('.bank-transaction-table table tbody tr').evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll('td'))
          .filter((td) => !['선택', '상세'].includes(td.getAttribute('data-label') ?? ''))
          .map((td) => td.textContent?.trim() ?? '')
          .join('|'),
      ),
    )
    const counts = new Map<string, number>()
    for (const sig of rowSignatures) counts.set(sig, (counts.get(sig) ?? 0) + 1)
    const duplicateGroups = Array.from(counts.entries()).filter(([, count]) => count > 1)
    const duplicateRowTotal = duplicateGroups.reduce((sum, [, count]) => sum + count, 0)
    console.log(
      '[897 R2 라이브 실측] 전체기간',
      JSON.stringify({
        총행수: rowSignatures.length,
        중복그룹수: duplicateGroups.length,
        중복행수: duplicateRowTotal,
        샘플: duplicateGroups.slice(0, 3),
      }),
    )
    expect(duplicateGroups, `중복 시그니처 그룹 ${duplicateGroups.length}개 잔존: ${JSON.stringify(duplicateGroups.slice(0, 5))}`).toEqual([])
  })
})
