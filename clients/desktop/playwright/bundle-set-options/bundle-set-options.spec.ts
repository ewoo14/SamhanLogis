/**
 * PR-3b — 세트(BUNDLE) 전개 옵션 picker Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>새 출고전표 작성(`/sales/new`) 진입 — 라인 품목 자동완성 표시</li>
 *   <li>SINGLE 품목(AJ040) 선택 → 세트 옵션 행 미노출</li>
 *   <li>BUNDLE 품목(SET-HM2WAY) 선택 → 세트 옵션 행 노출 (실외기 제외/교체, 판넬, 자재)</li>
 *   <li>"실외기 제외" 체크 → 실외기 교체 입력 비활성화 (상호배타)</li>
 *   <li>판넬 360 형상 / 자재 포함 체크박스 토글 동작</li>
 *   <li>UUID 비공개 가드 — 옵션 행 텍스트에 UUID 미노출</li>
 * </ol>
 *
 * <h2>Mock 전략</h2>
 * - `VITE_MOCK_MODE=1` + mock.ts `GET /api/products?q=` 핸들러.
 * - SET-HM2WAY = `productType: "BUNDLE"` (세트 옵션 노출 트리거).
 * - 실제 6:4 전개는 BE BundleExpander 책임 — 본 spec 은 picker UI 회귀 전용.
 *
 * <h2>no-fake-data 원칙 ([[feedback_no_fake_data_ever]])</h2>
 * - 본 spec 은 VITE_MOCK_MODE=1 Playwright 컴포넌트 회귀 전용.
 * - 실 QA 캡처(실 전개 결과)는 Docker 실서버 환경에서 별도 수행.
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/bundle-set-options --reporter=line
 * </pre>
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** UUID 정규식 — 화면 노출 가드. */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

/** window.samhanAuth stub — AuthGuard 통과 (MANAGER role). */
async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MANAGER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

/** 새 출고전표 작성 페이지로 이동. */
async function gotoSlipNewPage(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/sales/new?mockRole=MANAGER`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(
    page.getByRole('button', { name: '+ 라인 추가' }),
  ).toBeVisible({ timeout: 15_000 })
}

/** 라인 N 품목 combobox. */
function productInput(page: Page, lineNo: number) {
  return page.getByRole('combobox', { name: new RegExp(`라인 ${lineNo} 품목`) })
}

/** 모델 검색 후 첫 옵션 클릭 선택. */
async function selectProduct(page: Page, lineNo: number, query: string, optionName: RegExp) {
  const input = productInput(page, lineNo)
  await input.click()
  await input.fill(query)
  const listbox = page.getByRole('listbox', { name: '품목 목록' })
  await expect(listbox).toBeVisible({ timeout: 5_000 })
  await listbox.getByRole('option', { name: optionName }).first().click()
}

test.describe('PR-3b 세트(BUNDLE) 전개 옵션 picker', () => {
  test('시나리오 1: SINGLE 품목 선택 — 세트 옵션 행 미노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    await selectProduct(page, 1, 'AJ040', /AJ040RXH4BC1/)
    await expect(productInput(page, 1)).toHaveValue('AJ040RXH4BC1')

    // 세트 옵션 행은 첫 라인(index 0) 에 노출되지 않아야 함
    await expect(page.getByTestId('bundle-options-0')).toHaveCount(0)
  })

  test('시나리오 2: BUNDLE 품목 선택 — 세트 옵션 행 노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    await selectProduct(page, 1, 'SET', /SET-HM2WAY/)
    await expect(productInput(page, 1)).toHaveValue('SET-HM2WAY')

    const optionsRow = page.getByTestId('bundle-options-0')
    await expect(optionsRow).toBeVisible()
    await expect(optionsRow).toContainText('세트 구성 옵션')

    // 5개 컨트롤 노출
    await expect(page.getByTestId('bundle-options-0-remote-excluded')).toBeVisible()
    await expect(page.getByTestId('bundle-options-0-remote-option')).toBeVisible()
    await expect(page.getByTestId('bundle-options-0-panel-option')).toBeVisible()
    await expect(page.getByTestId('bundle-options-0-panel-360')).toBeVisible()
    await expect(page.getByTestId('bundle-options-0-material-included')).toBeVisible()
  })

  test('시나리오 3: "실외기 제외" 체크 → 실외기 교체 입력 비활성화', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    await selectProduct(page, 1, 'SET', /SET-HM2WAY/)
    await expect(page.getByTestId('bundle-options-0')).toBeVisible()

    const remoteOption = page.getByTestId('bundle-options-0-remote-option')
    await expect(remoteOption).toBeEnabled()

    await page.getByTestId('bundle-options-0-remote-excluded').check()
    await expect(remoteOption).toBeDisabled()

    await page.getByTestId('bundle-options-0-remote-excluded').uncheck()
    await expect(remoteOption).toBeEnabled()
  })

  test('시나리오 4: 판넬 360 / 자재 포함 체크박스 토글', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    await selectProduct(page, 1, 'SET', /SET-HM2WAY/)
    await expect(page.getByTestId('bundle-options-0')).toBeVisible()

    const panel360 = page.getByTestId('bundle-options-0-panel-360')
    const material = page.getByTestId('bundle-options-0-material-included')

    await panel360.check()
    await expect(panel360).toBeChecked()
    await material.check()
    await expect(material).toBeChecked()
  })

  test('시나리오 5: UUID 비공개 가드 — 옵션 행 UUID 미노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    await selectProduct(page, 1, 'SET', /SET-HM2WAY/)
    const optionsRow = page.getByTestId('bundle-options-0')
    await expect(optionsRow).toBeVisible()

    const text = await optionsRow.textContent()
    expect(text).not.toMatch(UUID_PATTERN)
  })
})
