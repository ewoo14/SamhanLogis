/**
 * 전표 V20 입력 → 판매조회 매칭 Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173 (별도 터미널)
 *   npx playwright test playwright/slip-form-v20/slip-form-v20-matching.spec.ts --reporter=line
 *
 * dev server 미가용 시 모든 UI 테스트 자동 SKIP (isServerAvailable — 레포 27개 스펙 공용
 * 컨벤션, 로컬 편의용. CI desktop-playwright 잡은 Playwright webServer 오케스트레이션이
 * 서버 기동을 보장하므로 실질적으로 발동하지 않으며, 혹시 발동해도 2차 방어
 * scripts/assert-playwright-ran.mjs 의 skipped=0 hard gate 가 CI 를 즉시 fail 시킨다 —
 * 27개 파일 전체를 건드리는 범위 확장은 이번 배치(단일 스펙 셀렉터 교정) 밖이라 유지한다).
 * 스크린샷 저장: 기본은 docs/qa/slip-form-v20-and-menu-relocate/_local/*.png (gitignore 대상 —
 * 이 스펙은 CI mock 회귀 hard gate 에 포함돼 매 실행마다 찍히므로, 커밋된 확정 증거
 * docs/qa/slip-form-v20-and-menu-relocate/tc-v*.png 와 경로를 분리해야 재실행이 그
 * 확정 증거를 덮어쓰지 않는다. 의도적으로 새 확정 증거를 남기려면 QA_SHOTS_DIR
 * 환경변수로 원하는 경로를 지정한다(신규 파일명 권장). 상세: playwright/support/qa-screenshot-dir.ts.
 *
 * PR #156 회귀 가드: page.on('pageerror') 훅 의무 적용.
 *
 * ---------------------------------------------------------------------------
 * 2026-07-26 하네스 배치 R2 — 셀렉터 전면 교정 (개발책임자 정정 반영)
 * ---------------------------------------------------------------------------
 * H-1(해시 goto) 교정 후 TC-V1~V5 가 전부 "화면 도착조차 못한 채" 통과해 온 사실이
 * 드러났다. 직전 라운드는 이를 "V20 필드가 UI 에 없다"고 결론지었으나 틀렸다 — 필드는
 * 있다. 실제 원인은 **셀렉터가 실제 DOM 과 다름**이었다(`data-testid="v20-*"` /
 * `input[name="..."]` 류를 찾았지만 실제 마크업은 `aria-label` 기반이거나 다른
 * data-testid 규약을 쓴다).
 *
 * 전수 실사(SlipFormPage.tsx + SlipDetailPage.tsx + mock.ts 코드 추적)로 확정한 사실:
 *
 *   1. `/sales/new`(SlipFormPage, 전표 "작성" 화면)에는 V20 6필드 중 **2개만** 존재한다
 *      — 배송주소(`data-testid="slip-form-delivery-address"`) · 감리주소
 *      (`data-testid="slip-form-supervision-address"`). SlipFormPage.tsx 1366행 주석
 *      원문: "출고전표 폼 정비: eCount 12필드 카드 제거 + 프로젝트명/인수자번호/
 *      입금예정일 제거. businessNumber 는 partnerId 로 BE 자동 resolve." — 즉 나머지
 *      4필드(프로젝트명/인수자번호/입금예정일/사업자번호)는 **의도적으로 작성 화면에서
 *      제거된 설계**이지 버그가 아니다. createSlip payload 도 이 4필드를 보내지 않는다.
 *   2. 나머지 4필드는 `/sales/:id`(SlipDetailPage) 의 **수정 인라인 폼**에만 존재하며
 *      전부 `aria-label` 기반이다: "사업자번호"(readOnly) · "배송주소" · "감리주소" ·
 *      "프로젝트명" · "인수자 번호"(공백 포함) · "입금예정일". 상세 읽기 전용 그리드는
 *      `data-testid="slip-detail-{delivery-address|supervision-address|project-name|
 *      recipient-phone|payment-due-date|business-number}"` (DetailGridItem, 값 표시 전용
 *      div — input 아님).
 *   3. 거래처 선택 → 사업자번호 자동 채움(TC-V2 계약)은 **수정 인라인 폼**에서만
 *      일어난다(`handleSlipPartnerSelect` → `setSalesBusinessNumber(option.bizNo ??
 *      option.partnerCode)`). 작성 화면(`/sales/new`)의 거래처 자동완성은 businessNumber
 *      state 자체가 없다(위 1.) — TC-V2 원안처럼 작성 화면에서 검증 불가.
 *   4. mock.ts 구조적 한계 2건(실측, 선택이 아니라 사실):
 *      a) `POST /slips`(작성 저장) mock 핸들러는 고정 응답(`slipNo: '2026/05/04-99'` 등)을
 *         돌려줄 뿐 `MOCK_SLIPS`/`OUTBOUND_QUERY_ROWS` 어디에도 쓰지 않는다 — 생성한
 *         전표가 판매조회 목록에서 재조회되지 않는다(persist 없음). 대신 요청 본문을
 *         `globalThis.__SAMHAN_LAST_SLIP_CREATE` 로 노출한다(PR-3b 기존 컨벤션,
 *         `[[inprocess-mock-principles]]` — in-process mock 은 page.route 로 못 가로채므로
 *         이 debug hook 이 유일한 payload 검증 경로다).
 *      b) `PUT /slips/{id}/sales`(수정 저장) 는 mock.ts 에 핸들러가 **아예 없다** —
 *         `getMockResponse()` 가 null 을 반환해 axios 가 실 네트워크로 폴백한다(실측:
 *         `http://localhost:8080` 로 실제 요청이 나가 401 INVALID_TOKEN 응답을 받았다).
 *         CI(ubuntu-latest, 백엔드 컨테이너 없음)에서는 연결 자체가 실패할 것이다.
 *      결과: "작성 저장 → 판매조회 매칭"(원 TC-V3) 과 "수정 저장 → 후속 query 반영"
 *      (원 TC-V5)은 mock 만으로 그 문구 그대로 증명할 지속성 저장소가 없다. 이 배치는
 *      셀렉터 교정 범위이므로 mock.ts 에 신규 영속 핸들러를 추가하지 않는다 — 대신
 *      "타이핑한 값이 실제 저장 요청 payload 에 정확히 실린다"(client→request 계약)를
 *      실측 가능한 가장 깊은 지점까지 하드 검증한다(soft-pass 아님 — 요청을 못 잡으면
 *      RED). PM 판단 필요 사항으로 보고서에 명시한다.
 *
 * TC-V1~V5 는 위 사실에 맞춰 재설계됐다 — 항상 aria-label/data-testid 로 실제 DOM 을
 * 찾고, 못 찾으면 RED(soft-pass 금지, console.warn 폴백 전부 제거).
 */

import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { fileURLToPath } from 'url'
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** 커밋된 확정 증거 디렉토리 — 참조용. 실제 캡처는 아래 QA_DIR(기본 _local/ 서브폴더)에 쓴다. */
const COMMITTED_QA_DIR = path.resolve(
  _dirname,
  '../../../../docs/qa/slip-form-v20-and-menu-relocate',
)

/** 이번 실행이 실제로 스크린샷을 쓸 디렉토리(기본 COMMITTED_QA_DIR/_local, QA_SHOTS_DIR 로 승격 가능) */
const QA_DIR = resolveMockQaShotsDir(COMMITTED_QA_DIR)

function ensureQaDir(): void {
  // resolveMockQaShotsDir 이 모듈 로드 시점에 이미 mkdirSync(recursive) 했다 — 방어적 재확인만.
  if (!fs.existsSync(QA_DIR)) {
    fs.mkdirSync(QA_DIR, { recursive: true })
  }
}

/** dev server 가용 여부 확인 */
async function isServerAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const url = new URL(BASE_URL)
      const req = http.get(
        {
          hostname: url.hostname,
          port: Number(url.port) || 80,
          path: '/',
          timeout: 2000,
        },
        res => {
          resolve(true)
          res.resume()
        },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

const SKIP_UI =
  process.env['PLAYWRIGHT_SKIP_UI'] === '1' ||
  process.env['PLAYWRIGHT_SKIP_UI'] === 'true'

// ---------------------------------------------------------------------------
// pageerror 훅 — PR #156 회귀 가드
// ---------------------------------------------------------------------------

/** 각 테스트 페이지에 pageerror 훅 등록 */
function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

/**
 * window.samhanAuth stub — AuthGuard 통과용.
 *
 * 검증된 패턴(ac-2-product-autocomplete / ac-3-partner-autocomplete / bundle-set-options /
 * slip-collab-panel 스펙과 동일) — mock 모드에서도 client.ts interceptor 가 getToken() 을
 * 호출하므로 `?mockRole=` 쿼리만으로는 불충분하고 이 stub 이 필요하다.
 */
async function installAuthMock(page: Page, role: 'MANAGER' | 'MASTER'): Promise<void> {
  await page.addInitScript((r) => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: r,
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
  }, role)
}

// ---------------------------------------------------------------------------
// 실 DOM 식별자 — 전수 실사 확정 (2026-07-26)
// ---------------------------------------------------------------------------

/** `/sales/new`(SlipFormPage) 작성 화면에 실재하는 V20 필드 2종. */
const CREATE_FORM_FIELDS = {
  deliveryAddress: '[data-testid="slip-form-delivery-address"]',
  supervisionAddress: '[data-testid="slip-form-supervision-address"]',
}

/** `/sales/:id`(SlipDetailPage) 읽기 전용 상세 그리드 — DetailGridItem, 값 표시 전용 div. */
const DETAIL_VIEW_TESTIDS = {
  deliveryAddress: 'slip-detail-delivery-address',
  supervisionAddress: 'slip-detail-supervision-address',
  projectName: 'slip-detail-project-name',
  recipientPhone: 'slip-detail-recipient-phone',
  paymentDueDate: 'slip-detail-payment-due-date',
  businessNumber: 'slip-detail-business-number',
}

/** `/sales/:id` 수정 인라인 폼(aria-label="매출 전표 수정") 내부 필드 — 전부 aria-label 기반. */
const EDIT_FORM_LABELS = {
  businessNumber: '사업자번호',
  deliveryAddress: '배송주소',
  supervisionAddress: '감리주소',
  projectName: '프로젝트명',
  recipientPhone: '인수자 번호', // 공백 포함 — 실 DOM 그대로.
  paymentDueDate: '입금예정일',
  partner: '거래처',
}

/** V20 테스트 데이터(TC-V3 작성 화면 입력용). */
const TEST_V20 = {
  deliveryAddress: '서울시 강남구 테헤란로 123',
  supervisionAddress: '서울시 서초구 서초대로 456',
}

// ---------------------------------------------------------------------------
// TC-V1 ~ TC-V5
// ---------------------------------------------------------------------------

test.describe('전표 V20 입력 → 판매조회 매칭 (TC-V1~V5)', () => {

  test.skip(SKIP_UI, 'dev server 미가용 — VITE_MOCK_MODE=1 && npx vite --port 5173 후 PLAYWRIGHT_SKIP_UI=0 으로 재시도')

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미접근: ${BASE_URL}`)
  })

  /**
   * TC-V1: /sales/new 진입 → 작성 화면에 실재하는 V20 필드(배송주소·감리주소) 입력란 visible 검증
   *
   * 프로젝트명/인수자번호/입금예정일/사업자번호는 작성 화면에서 의도적으로 제거된
   * 필드라(SlipFormPage.tsx 1366행) 여기서 검증 대상이 아니다 — TC-V4/TC-V5 가
   * 상세/수정 화면에서 별도로 검증한다.
   *
   * 기대 결과:
   *   - 배송주소 / 감리주소 입력란 visible
   *   - pageerror 0건
   */
  test('TC-V1: 전표 작성 폼에서 실재 V20 필드(배송주소·감리주소) 입력란 표시 검증', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()
    await installAuthMock(page, 'MANAGER')

    await page.goto(`${BASE_URL}/#/sales/new?mockRole=MANAGER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await expect(
      page.getByRole('button', { name: '+ 라인 추가' }),
      '전표 작성 화면 로드 실패 — "+ 라인 추가" 버튼 미표시',
    ).toBeVisible({ timeout: 15000 })

    const deliveryField = page.locator(CREATE_FORM_FIELDS.deliveryAddress)
    const supervisionField = page.locator(CREATE_FORM_FIELDS.supervisionAddress)
    await expect(deliveryField, 'V20 배송주소 입력란이 visible 이어야 함').toBeVisible({ timeout: 5000 })
    await expect(supervisionField, 'V20 감리주소 입력란이 visible 이어야 함').toBeVisible({ timeout: 5000 })

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-v1-sales-new-v20-fields.png'),
      fullPage: true,
    })

    expect(errors, `TC-V1 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-V2: 전표 수정 화면에서 거래처 선택 → 사업자번호 readonly 자동 채움 검증
   *
   * 대상: slip-005(DRAFT — canDirectEditSales 는 status SAVED/DRAFT 에서만 "수정" 버튼을
   * 노출한다, SlipDetailPage.tsx 1511행). 이 전표의 초기 사업자번호는 빈 값이라
   * (MOCK_SLIPS 에 businessNumber 필드 자체가 없음) "엘에이시스템에어" 선택 전/후 값이
   * ''→'123-45-67890' 으로 뚜렷이 바뀐다(mock.ts MOCK_ADMIN_PARTNERS[0].businessNumber
   * '123-45-67890' → normalizeAdminPartner → searchPartners(api/sales.ts)
   * businessRegistrationNumber → searchSlipPartnerOptions.bizNo → handleSlipPartnerSelect
   * 로 traced 확인).
   *
   * 기대 결과:
   *   - 선택 전 사업자번호 = '' (readonly)
   *   - "엘에이시스템에어" 선택 후 사업자번호 = 정확히 '123-45-67890' (readonly 유지)
   *   - pageerror 0건
   */
  test('TC-V2: 전표 수정 화면 — 거래처 선택 시 사업자번호 readonly 자동 채움(값 대조)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()
    await installAuthMock(page, 'MASTER')

    await page.goto(`${BASE_URL}/#/sales/slip-005?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })

    const editBtn = page.getByTestId('sales-slip-edit-button')
    await expect(editBtn, '수정 버튼 미표시(slip-005 는 DRAFT 여야 함)').toBeVisible({ timeout: 15000 })
    await editBtn.click()

    const modal = page.getByTestId('sales-slip-edit-modal')
    await expect(modal, '매출 전표 수정 인라인 폼 미표시').toBeVisible({ timeout: 10000 })

    const bizField = page.getByLabel(EDIT_FORM_LABELS.businessNumber, { exact: true })
    await expect(bizField, '사업자번호 필드 미발견').toBeVisible()
    await expect(bizField, '선택 전 사업자번호는 빈 값이어야 함').toHaveValue('')
    await expect(bizField, '사업자번호는 readonly 여야 함').toHaveAttribute('readonly', '')

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-v2-step1-before-partner-select.png'),
      fullPage: true,
    })

    // 거래처 검색 → 키보드 선택(ArrowDown+Enter) — 인라인 폼이 상세 페이지 하단에 위치해
    // 마우스 클릭 시 listbox 옵션이 뷰포트 밖으로 판정되는 실측 문제를 피한다
    // (ac-3-partner-autocomplete.spec.ts 시나리오 4 와 동일한 검증된 대체 경로).
    const partnerInput = modal.getByLabel(EDIT_FORM_LABELS.partner, { exact: true })
    await partnerInput.click()
    await partnerInput.fill('엘에이')
    const listbox = page.getByRole('listbox', { name: '거래처 목록' })
    await expect(listbox, '거래처 후보 목록 미표시').toBeVisible({ timeout: 5000 })
    await expect(listbox, '엘에이시스템에어 후보 미포함').toContainText('엘에이시스템에어')
    await partnerInput.press('ArrowDown')
    await partnerInput.press('Enter')

    await expect(
      bizField,
      '거래처 선택 후 사업자번호가 선택 거래처 값(123-45-67890)으로 자동 채워져야 함',
    ).toHaveValue('123-45-67890')
    await expect(bizField, '거래처 선택 후에도 사업자번호는 readonly 여야 함').toHaveAttribute('readonly', '')

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-v2-step2-partner-businessnumber-autofill.png'),
      fullPage: true,
    })

    expect(errors, `TC-V2 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-V3: 전표 작성 폼에서 V20(배송주소·감리주소) 입력 → 저장 요청 payload 값 매칭 검증
   *
   * 스펙 헤더 R2 노트 4a 참고 — `POST /slips` mock 은 응답을 어떤 조회 가능 저장소에도
   * 쓰지 않으므로(persist 없음) "저장 후 판매조회에서 재조회해 매칭" 은 mock 만으로
   * 증명할 지속성이 없다. 대신 이 배치 범위에서 실측 가능한 가장 깊은 계약 —
   * "화면에 입력한 값이 실제 저장 요청 payload 에 정확히 실리는가" — 를 하드 검증한다.
   * in-process mock 은 page.route 로 가로챌 수 없으므로([[inprocess-mock-principles]])
   * mock.ts 가 노출하는 `globalThis.__SAMHAN_LAST_SLIP_CREATE` 디버그 훅을 읽는다(PR-3b
   * bundle-set-options 스펙과 동일 컨벤션).
   *
   * 기대 결과:
   *   - 창고 선택 + 품목 1건 선택 + 배송주소/감리주소 입력 후 저장 가능(canSubmit=true)
   *   - 저장 요청 payload 의 deliveryAddress/supervisionAddress 가 입력값과 정확히 일치
   *   - pageerror 0건
   */
  test('TC-V3: 전표 작성 — V20 입력값이 저장 요청 payload 에 정확히 매칭', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()
    await installAuthMock(page, 'MANAGER')

    await page.goto(`${BASE_URL}/#/sales/new?mockRole=MANAGER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await expect(
      page.getByRole('button', { name: '+ 라인 추가' }),
      '전표 작성 화면 로드 실패',
    ).toBeVisible({ timeout: 15000 })

    // 창고 선택(필수 — canSubmit 전제) — mock GET /inventory/warehouses 5건 중 본사창고.
    const warehouseInput = page.getByRole('combobox', { name: /출고 창고/ })
    await warehouseInput.click()
    await warehouseInput.fill('본사')
    await expect(page.getByRole('listbox', { name: '창고 목록' }), '창고 후보 목록 미표시').toBeVisible({ timeout: 5000 })
    await warehouseInput.press('ArrowDown')
    await warehouseInput.press('Enter')

    // V20 배송주소/감리주소 입력
    await page.locator(CREATE_FORM_FIELDS.deliveryAddress).fill(TEST_V20.deliveryAddress)
    await page.locator(CREATE_FORM_FIELDS.supervisionAddress).fill(TEST_V20.supervisionAddress)

    // 라인 1 품목 선택(필수 — canSubmit 전제) — mock GET /api/products?q=AJ040.
    const productInput = page.getByRole('combobox', { name: /라인 1 품목/ })
    await productInput.click()
    await productInput.fill('AJ040')
    await expect(page.getByRole('listbox', { name: '품목 목록' }), '품목 후보 목록 미표시').toBeVisible({ timeout: 5000 })
    await productInput.press('ArrowDown')
    await productInput.press('Enter')

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-v3-step1-form-filled.png'),
      fullPage: true,
    })

    const saveBtn = page.getByRole('button', { name: '저장' })
    await expect(saveBtn, '저장 버튼이 활성화돼야 함(창고+품목 선택 완료)').toBeEnabled({ timeout: 8000 })
    await saveBtn.click()

    // 저장 성공 시 목록(/sales)으로 navigate — 요청이 실제로 나갔음을 간접 확인.
    await expect(page, '저장 후 판매관리 목록으로 이동해야 함').toHaveURL(/\/#\/sales(\?|$)/, { timeout: 10000 })

    const captured = await page.evaluate(
      () => (globalThis as Record<string, unknown>)['__SAMHAN_LAST_SLIP_CREATE'],
    ) as { deliveryAddress?: string; supervisionAddress?: string } | undefined

    expect(captured, '저장 요청 payload 캡처 실패(__SAMHAN_LAST_SLIP_CREATE 미설정)').toBeTruthy()
    expect(
      captured?.deliveryAddress,
      `V20 배송주소 매칭 실패: 기대="${TEST_V20.deliveryAddress}", 실제="${captured?.deliveryAddress}"`,
    ).toBe(TEST_V20.deliveryAddress)
    expect(
      captured?.supervisionAddress,
      `V20 감리주소 매칭 실패: 기대="${TEST_V20.supervisionAddress}", 실제="${captured?.supervisionAddress}"`,
    ).toBe(TEST_V20.supervisionAddress)

    expect(errors, `TC-V3 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-V4: /sales/{id} 상세 진입 → V20 6필드(배송주소·감리주소·프로젝트명·인수자번호·
   * 입금예정일·사업자번호) 읽기 전용 표시 + 값 매칭 검증
   *
   * 대상: slip-002(mock.ts MOCK_SLIPS) — V20 6필드가 전부 non-null 로 채워진 유일한
   * 시드라 "전부 표시" 를 빈 값(—) 없이 증명할 수 있다. status=CONFIRMED 라 수정 버튼은
   * 없다(읽기 전용 그리드만 검증 — canDirectEditSales 는 SAVED/DRAFT 전용).
   *
   * 기대 결과:
   *   - DetailGridItem(data-testid="slip-detail-*") 6개 모두 visible + 정확한 값 포함
   *   - pageerror 0건
   */
  test('TC-V4: 전표 상세 페이지 — V20 6필드 읽기 전용 표시(값 대조)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()
    await installAuthMock(page, 'MASTER')

    await page.goto(`${BASE_URL}/#/sales/slip-002?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await expect(
      page.getByRole('heading', { name: /판매전표 상세/ }),
      '전표 상세 화면 로드 실패',
    ).toBeVisible({ timeout: 15000 })

    const expected: Record<keyof typeof DETAIL_VIEW_TESTIDS, string> = {
      deliveryAddress: '경기도 성남시 분당구 판교로 235',
      supervisionAddress: '경기도 성남시 분당구 판교로 235',
      projectName: '판교 테크노밸리 B동',
      recipientPhone: '031-987-6543',
      paymentDueDate: '2026-05-31',
      businessNumber: '234-56-78901',
    }

    for (const key of Object.keys(DETAIL_VIEW_TESTIDS) as Array<keyof typeof DETAIL_VIEW_TESTIDS>) {
      const field = page.getByTestId(DETAIL_VIEW_TESTIDS[key])
      await expect(field, `V20 ${key} 필드가 visible 이어야 함`).toBeVisible({ timeout: 5000 })
      await expect(
        field,
        `V20 ${key} 값 매칭 실패: 기대 포함="${expected[key]}"`,
      ).toContainText(expected[key])
      // 읽기 전용 그리드(DetailGridItem)는 div 이지 input 이 아니다 — 직접 수정 불가를
      // 태그명으로 구조적으로 단정(사업자번호는 이 화면에 입력 요소 자체가 없음).
      const tagName = await field.evaluate((el) => el.tagName)
      expect(tagName, `V20 ${key} 는 읽기 전용 div 여야 함(input 아님)`).not.toBe('INPUT')
    }

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-v4-sales-detail-v20.png'),
      fullPage: true,
    })

    expect(errors, `TC-V4 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-V5: 전표 수정 화면에서 프로젝트명 부분 갱신 → 저장 요청 payload 값 매칭 검증
   *
   * 스펙 헤더 R2 노트 4b 참고 — `PUT /slips/{id}/sales` 는 mock.ts 에 핸들러가 없어
   * 실 네트워크로 폴백한다(CI 에는 백엔드가 없어 연결 실패, 로컬에도 우연히 뜬 실서버가
   * 없다면 마찬가지). 따라서 "저장 후 판매조회 재조회 반영" 은 이 mock 스펙으로 증명할
   * 지속성이 없다 — 대신 실측 가능한 가장 깊은 계약인 "수정 폼에 입력한 값이 실제 저장
   * 요청 payload 에 정확히 실리는가" 를 네트워크 계층에서 하드 검증한다(요청을 못 잡으면
   * RED). 거래처는 건드리지 않는다 — 거래처를 바꾸면 재조회(단가 확인)가 트리거되어
   * "단가 확인 필요" 게이트로 저장 버튼이 막히는 별개의 실측 사실이 있다(이 TC 의
   * 관심사가 아니므로 회피).
   *
   * 기대 결과:
   *   - 프로젝트명 필드에 신규 값 입력 후 저장 클릭 시 실제 PUT 요청 발생
   *   - 요청 payload 의 projectName 이 입력값과 정확히 일치
   *   - pageerror 0건
   */
  test('TC-V5: 전표 수정 — 프로젝트명 갱신값이 저장 요청 payload 에 정확히 매칭', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()
    await installAuthMock(page, 'MASTER')

    const updatedProjectName = 'QA-V20-갱신-프로젝트'

    await page.goto(`${BASE_URL}/#/sales/slip-005?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })

    const editBtn = page.getByTestId('sales-slip-edit-button')
    await expect(editBtn, '수정 버튼 미표시(slip-005 는 DRAFT 여야 함)').toBeVisible({ timeout: 15000 })
    await editBtn.click()

    const modal = page.getByTestId('sales-slip-edit-modal')
    await expect(modal, '매출 전표 수정 인라인 폼 미표시').toBeVisible({ timeout: 10000 })

    const projectField = page.getByLabel(EDIT_FORM_LABELS.projectName, { exact: true })
    await expect(projectField, '프로젝트명 필드 미발견').toBeVisible()
    await projectField.fill(updatedProjectName)
    await expect(projectField).toHaveValue(updatedProjectName)

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-v5-step1-v20-update.png'),
      fullPage: true,
    })

    const saveBtn = page.getByTestId('sales-slip-edit-save')
    await expect(saveBtn, '저장 버튼이 활성화돼야 함(거래처 미변경 — 재조회 게이트 없음)').toBeEnabled({ timeout: 8000 })

    const [saveRequest] = await Promise.all([
      page.waitForRequest(
        (req) => req.method() === 'PUT' && req.url().includes('/slips/slip-005/sales'),
        { timeout: 10000 },
      ),
      saveBtn.click(),
    ])

    const bodyText = saveRequest.postData()
    expect(bodyText, '저장 요청 body 캡처 실패').toBeTruthy()
    const body = JSON.parse(bodyText ?? '{}') as { projectName?: string }
    expect(
      body.projectName,
      `V20 프로젝트명 갱신 매칭 실패: 기대="${updatedProjectName}", 실제="${body.projectName}"`,
    ).toBe(updatedProjectName)

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-v5-step2-save-request-captured.png'),
      fullPage: true,
    })

    expect(errors, `TC-V5 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })
})
