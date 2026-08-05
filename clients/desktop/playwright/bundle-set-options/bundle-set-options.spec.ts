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
    page.getByRole('heading', { name: '새 판매전표' }),
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

  test('시나리오 4: 판넬 360 형상 선택(문자열) + 자재 포함 토글 + 텍스트 옵션 입력', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    await selectProduct(page, 1, 'SET', /SET-HM2WAY/)
    await expect(page.getByTestId('bundle-options-0')).toBeVisible()

    // 판넬 360 형상 = 문자열 셀렉트(미지정/원형/사각) — boolean 아님(BE variant 정확 매칭)
    const panel360 = page.getByTestId('bundle-options-0-panel-360')
    await panel360.selectOption('원형')
    await expect(panel360).toHaveValue('원형')

    // 자재 포함 체크박스
    const material = page.getByTestId('bundle-options-0-material-included')
    await material.check()
    await expect(material).toBeChecked()

    // 텍스트 옵션(판넬 모델코드) 입력 round-trip 검증 (controlled value 바인딩)
    const panelOption = page.getByTestId('bundle-options-0-panel-option')
    await panelOption.fill('블랙판넬')
    await expect(panelOption).toHaveValue('블랙판넬')
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

  // ──────────────────────────────────────────────────────────
  // 시나리오 6: 제출 페이로드 단언 — setOptions 가 요청 본문에 정확히 도달
  //   (in-process mock 은 page.route 가로채기 불가 → mock 이 globalThis 에 노출한
  //    마지막 생성 요청 본문을 page.evaluate 로 읽어 단언. [[inprocess-mock-principles]])
  // ──────────────────────────────────────────────────────────
  test('시나리오 6: BUNDLE 라인 setOptions + SINGLE 라인 undefined 가 POST 본문에 반영', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    // 출고 창고 선택 (저장 가능 조건) — 폼 정비로 '출발 창고' → '출고 창고' 단일화
    const wh = page.getByRole('combobox', { name: /출고 창고/ })
    await wh.click()
    await wh.fill('HQ')
    const whListbox = page.getByRole('listbox', { name: '창고 목록' })
    await expect(whListbox).toBeVisible({ timeout: 5_000 })
    await whListbox.getByRole('option').first().click()

    // 라인 1: BUNDLE 세트 + 옵션 (실외기 제외 + 판넬 360=사각 + 자재 포함)
    await selectProduct(page, 1, 'SET', /SET-HM2WAY/)
    await expect(page.getByTestId('bundle-options-0')).toBeVisible()
    await page.getByTestId('bundle-options-0-remote-excluded').check()
    await page.getByTestId('bundle-options-0-panel-360').selectOption('사각')
    await page.getByTestId('bundle-options-0-material-included').check()

    // 라인 2: SINGLE 품목
    await selectProduct(page, 2, 'AJ040', /AJ040RXH4BC1/)

    // 저장
    await page.getByRole('button', { name: '저장' }).click()

    // mock 이 노출한 마지막 생성 요청 본문 단언
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () =>
              (globalThis as Record<string, unknown>)['__SAMHAN_LAST_SLIP_CREATE'] ??
              null,
          ),
        { timeout: 5_000 },
      )
      .not.toBeNull()

    const body = (await page.evaluate(
      () => (globalThis as Record<string, unknown>)['__SAMHAN_LAST_SLIP_CREATE'],
    )) as { lines: Array<{ modelName?: string; setOptions?: Record<string, unknown> }> }

    const bundleLine = body.lines.find((l) => l.modelName === 'SET-HM2WAY')
    const singleLine = body.lines.find((l) => l.modelName === 'AJ040RXH4BC1')

    // BUNDLE 라인 — setOptions 정규화 결과 정확 전송
    expect(bundleLine?.setOptions).toBeTruthy()
    expect(bundleLine?.setOptions?.['remoteExcluded']).toBe(true)
    expect(bundleLine?.setOptions?.['panelShape360']).toBe('사각') // boolean 아님(String 계약)
    expect(bundleLine?.setOptions?.['materialIncluded']).toBe(true)
    // 미입력 modelCode 는 null 정규화
    expect(bundleLine?.setOptions?.['remoteOption']).toBeNull()
    expect(bundleLine?.setOptions?.['panelOption']).toBeNull()

    // SINGLE 라인 — setOptions 미전송(undefined → JSON 직렬화 시 키 제거)
    expect(singleLine).toBeTruthy()
    expect(singleLine?.setOptions).toBeUndefined()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 7: 견적서 작성 경로(별도 lookup 핸들러) — BUNDLE 옵션 행 노출
  //   EstimateFormPage 는 /slips/lookup-product(onBlur) 경로로 productType 획득
  //   (SlipFormPage 의 /api/products 자동완성과 다른 핸들러 → 별도 검증).
  // ──────────────────────────────────────────────────────────
  test('시나리오 7: 견적서 작성 — BUNDLE 모델 onBlur lookup → 옵션 행 노출', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(`${BASE_URL}/#/sales/estimates/new?mockRole=MANAGER`, {
      waitUntil: 'domcontentloaded',
    })
    const modelInput = page.getByTestId('estimate-form-line-0-model')
    await expect(modelInput).toBeVisible({ timeout: 15_000 })

    await modelInput.fill('SET-HM2WAY')
    await modelInput.blur()

    // onBlur lookup → productType BUNDLE → 옵션 행 노출
    await expect(page.getByTestId('bundle-options-0')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('bundle-options-0-panel-360')).toBeVisible()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 8: 세트 재고 가드 — BUNDLE 라인만 선택 후 재고조회 시 안내 표시
  //   (§2-2 세트 재고 가드 — [F] 신규 회귀 가드. SlipFormPage openStockModal 흐름)
  // ──────────────────────────────────────────────────────────
  test('시나리오 8: BUNDLE 라인만 선택 → 재고조회 → 세트 전용 안내 표시', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    // 라인 1: BUNDLE 세트 선택
    await selectProduct(page, 1, 'SET', /SET-HM2WAY/)
    await expect(productInput(page, 1)).toHaveValue('SET-HM2WAY')

    // 라인 1 행 선택 체크박스 ON (selectedIds 에 추가 → selectedProductLines=1 BUNDLE)
    await page.getByRole('checkbox', { name: '라인 1 선택' }).check()

    // 재고조회 버튼 활성 + 클릭
    const lookupBtn = page.getByTestId('slip-form-inventory-lookup-btn')
    await expect(lookupBtn).toBeEnabled()
    await lookupBtn.click()

    // 모달 열림 + 세트 전용 안내(bundle-only-notice) 표시 단언
    await expect(page.getByTestId('inventory-lookup-modal')).toBeVisible({ timeout: 5_000 })
    const bundleNotice = page.getByTestId('inventory-lookup-bundle-only-notice')
    await expect(bundleNotice).toBeVisible()
    await expect(bundleNotice).toContainText('세트 품목은 재고를 표시하지 않습니다')

    // 전부 BUNDLE 이므로 혼합 캡션은 미표시
    await expect(page.getByTestId('inventory-lookup-mixed-bundle-notice')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 9: 혼합 선택 — BUNDLE+SINGLE 동시 선택 시 제외 세트 캡션 표시
  //   excludedBundleCount 배선 검증 ([I] fix 연동 — [F] 신규 회귀 가드)
  // ──────────────────────────────────────────────────────────
  test('시나리오 9: BUNDLE+SINGLE 혼합 선택 → 재고조회 → 제외 세트 캡션 + 단품 매트릭스', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    // 라인 1: BUNDLE 세트
    await selectProduct(page, 1, 'SET', /SET-HM2WAY/)
    await expect(productInput(page, 1)).toHaveValue('SET-HM2WAY')

    // 라인 2: SINGLE 품목
    await selectProduct(page, 2, 'AJ040', /AJ040RXH4BC1/)
    await expect(productInput(page, 2)).toHaveValue('AJ040RXH4BC1')

    // 두 라인 모두 행 선택 (혼합 선택 → excludedBundleCount=1)
    await page.getByRole('checkbox', { name: '라인 1 선택' }).check()
    await page.getByRole('checkbox', { name: '라인 2 선택' }).check()

    // 재고조회 클릭
    const lookupBtn = page.getByTestId('slip-form-inventory-lookup-btn')
    await expect(lookupBtn).toBeEnabled()
    await lookupBtn.click()

    // 모달 열림 + 혼합 제외 캡션 표시 단언 ([I] excludedBundleCount 배선)
    await expect(page.getByTestId('inventory-lookup-modal')).toBeVisible({ timeout: 5_000 })
    const mixedNotice = page.getByTestId('inventory-lookup-mixed-bundle-notice')
    await expect(mixedNotice).toBeVisible()
    await expect(mixedNotice).toContainText('세트 1건은 제외됨')

    // 혼합이므로 세트 전용 안내(bundle-only)는 미표시 — 단품(AJ040) 은 매트릭스로 조회됨
    await expect(page.getByTestId('inventory-lookup-bundle-only-notice')).toHaveCount(0)
  })
})
