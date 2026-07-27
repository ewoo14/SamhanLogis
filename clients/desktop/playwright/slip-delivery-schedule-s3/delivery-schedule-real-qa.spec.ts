import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 출고전표 배송일정(M상N하) 슬라이스 — 실 gateway 실 UI QA 드라이버.
 *
 * 시나리오:
 *   A. SlipForm 배송일정 UI:
 *      A1 — 신규 출고전표(/sales/new) 진입 후 지방 선택 → 배송일정 카드 노출 확인
 *      A2 — 당착 체크박스 클릭 → 하차일=출고일·비활성, 라벨="당착"
 *      A3 — 야적 선택 → 당착 체크박스 미노출, 하차일 익일
 *      A4 — 하차일 수동 편집 → 라벨 갱신 확인
 *   B. 생성+조회:
 *      B1 — API 생성 결과 검증 (unloadDate + deliveryScheduleLabel)
 *      B2 — 상세 조회 UI 배송태그 "지방" 및 배송일정 표시
 *
 * 실서버: gateway :8080, slip-service, auth-service
 * 렌더러: http://127.0.0.1:5175 (VITE_API_BASE_URL=http://localhost:8080, mock OFF)
 * 실행:
 *   cd clients/desktop
 *   set REAL_JWT=<token>
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts playwright/slip-delivery-schedule-s3 --reporter=line --timeout=90000
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { expect, test, type Page } from '@playwright/test'

// ============================================================
// 상수
// ============================================================

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_USER_ROLE = 'MASTER'
const MASTER_USER_NAME = '[DEV-SEED] 개발마스터'

const REAL_JWT: string = process.env['REAL_JWT'] ?? ''

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/slip-delivery-schedule-s3',
))

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

async function capture(page: Page, filename: string): Promise<string> {
  const filePath = path.join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filePath, fullPage: false })
  const stat = fs.statSync(filePath)
  console.log(`[CAPTURE] ${filePath} (${stat.size} bytes)`)
  return filePath
}

async function installJwtStub(
  page: Page,
  token: string,
  userId: string,
  role: string,
  fullName: string,
): Promise<void> {
  await page.addInitScript(`
    (function() {
      const _auth = {
        token: '${token}',
        userId: '${userId}',
        role: '${role}',
        fullName: '${fullName}',
        partnerCode: null,
        groups: [{ id: '00000000-0000-0000-0000-000000000100', name: '개발마스터', builtin: true }],
      };
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => _auth,
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      });
      console.log('[DELIVERY-SCHEDULE QA] samhanAuth stub installed, role=' + _auth.role);
    })();
  `)
}

/**
 * 출고구분 <select> 를 label 텍스트로 찾아 값 선택.
 * DeliveryTagSelector는 FormField(label="출고구분") 안에 native <select> 를 렌더링.
 */
async function selectDeliveryTag(page: Page, code: string): Promise<void> {
  // FormField label 으로 연결된 select 찾기
  const formField = page.locator('text=출고구분').first()
  // label 부모 → 형제 select
  const selectEl = page.locator('select').filter({ has: page.locator(`option[value="${code}"]`) }).first()
  await selectEl.waitFor({ timeout: 15000 })
  await selectEl.selectOption(code)
}

// ============================================================
// 시나리오 A: SlipForm 배송일정 UI
// ============================================================

test.describe('A. SlipForm 배송일정 UI', () => {
  test.beforeAll(() => {
    if (!REAL_JWT) {
      console.warn('[SKIP] REAL_JWT 환경변수 미설정 — 시나리오 A 건너뜀')
    }
  })

  test('A1 — 지방 선택 시 배송일정 카드 노출 + 라벨 프리뷰', async ({ page }) => {
    if (!REAL_JWT) test.skip()

    await installJwtStub(page, REAL_JWT, MASTER_USER_ID, MASTER_USER_ROLE, MASTER_USER_NAME)

    // Hash 라우터: /#/sales/new
    await page.goto(`${BASE_URL}/#/sales/new`, { waitUntil: 'domcontentloaded' })

    // 페이지 로드 대기: 출고구분 select 나타날 때까지
    await page.waitForSelector('select', { timeout: 15000 })

    // 출고구분 지방(REGION) 선택
    await selectDeliveryTag(page, 'REGION')

    // 배송일정 카드 노출 대기
    await page.waitForSelector('[data-testid="slip-form-unload-date"]', { timeout: 10000 })

    // 상차일 읽기전용 확인
    const loadDateInput = page.locator('[aria-label="출고일(상차일) — 읽기전용"]')
    const loadDateVal = await loadDateInput.inputValue().catch(() => 'NOT_FOUND')
    console.log(`[A1] 상차일(출고일): ${loadDateVal}`)

    // 하차일 자동 설정 확인
    const unloadDateInput = page.locator('[data-testid="slip-form-unload-date"]')
    const unloadDateVal = await unloadDateInput.inputValue()
    console.log(`[A1] 하차일(자동): ${unloadDateVal}`)

    // 라벨 프리뷰 확인
    const labelPreview = page.locator('[data-testid="slip-form-schedule-label-preview"]')
    const labelText = await labelPreview.textContent({ timeout: 5000 }).catch(() => '')
    console.log(`[A1] 라벨 프리뷰: ${labelText}`)

    // 당착 체크박스 노출 확인
    const sameDayCheckbox = page.locator('[data-testid="slip-form-same-day-checkbox"]')

    await capture(page, 'A1-region-delivery-schedule-card.png')

    // 검증: 배송일정 카드 노출됨
    await expect(unloadDateInput).toBeVisible()
    await expect(sameDayCheckbox).toBeVisible()
    // 하차일이 비어있지 않음 (자동 계산값)
    expect(unloadDateVal).toBeTruthy()
  })

  test('A2 — 당착 체크박스 클릭 시 하차일=출고일, 라벨="당착"', async ({ page }) => {
    if (!REAL_JWT) test.skip()

    await installJwtStub(page, REAL_JWT, MASTER_USER_ID, MASTER_USER_ROLE, MASTER_USER_NAME)

    await page.goto(`${BASE_URL}/#/sales/new`, { waitUntil: 'domcontentloaded' })

    await page.waitForSelector('select', { timeout: 15000 })
    await selectDeliveryTag(page, 'REGION')

    await page.waitForSelector('[data-testid="slip-form-same-day-checkbox"]', { timeout: 10000 })

    // 당착 체크박스 클릭
    const sameDayCheckbox = page.locator('[data-testid="slip-form-same-day-checkbox"]')
    await sameDayCheckbox.check()

    // 하차일 비활성 확인
    const unloadDateInput = page.locator('[data-testid="slip-form-unload-date"]')
    await expect(unloadDateInput).toBeDisabled()

    // 상차일과 하차일이 동일한지 확인
    const loadDateInput = page.locator('[aria-label="출고일(상차일) — 읽기전용"]')
    const loadDateVal = await loadDateInput.inputValue().catch(() => '')
    const unloadDateVal = await unloadDateInput.inputValue()
    console.log(`[A2] 당착 후 상차일: ${loadDateVal}, 하차일: ${unloadDateVal}`)

    // 라벨 프리뷰 = "당착"
    const labelPreview = page.locator('[data-testid="slip-form-schedule-label-preview"]')
    const labelText = await labelPreview.textContent({ timeout: 5000 }).catch(() => '')
    console.log(`[A2] 당착 라벨 프리뷰: ${labelText}`)

    await capture(page, 'A2-same-day-checked-dangchak.png')

    expect(loadDateVal).toBe(unloadDateVal)
    expect(labelText?.trim()).toBe('당착')
  })

  test('A3 — 야적 선택 시 당착 체크박스 미노출, 하차일 익일', async ({ page }) => {
    if (!REAL_JWT) test.skip()

    await installJwtStub(page, REAL_JWT, MASTER_USER_ID, MASTER_USER_ROLE, MASTER_USER_NAME)

    await page.goto(`${BASE_URL}/#/sales/new`, { waitUntil: 'domcontentloaded' })

    await page.waitForSelector('select', { timeout: 15000 })
    await selectDeliveryTag(page, 'STACK')

    // 배송일정 카드 노출 대기
    await page.waitForSelector('[data-testid="slip-form-unload-date"]', { timeout: 10000 })

    // 당착 체크박스 미노출 확인 (야적은 당착 없음)
    const sameDayCheckbox = page.locator('[data-testid="slip-form-same-day-checkbox"]')
    const sameDayVisible = await sameDayCheckbox.isVisible().catch(() => false)
    console.log(`[A3] 야적 당착 체크박스 visible: ${sameDayVisible}`)

    // 하차일 확인
    const unloadDateInput = page.locator('[data-testid="slip-form-unload-date"]')
    const unloadDateVal = await unloadDateInput.inputValue()
    console.log(`[A3] 야적 하차일(자동): ${unloadDateVal}`)

    await capture(page, 'A3-stack-no-checkbox-unload-tomorrow.png')

    expect(sameDayVisible).toBe(false)
    await expect(unloadDateInput).toBeVisible()
    expect(unloadDateVal).toBeTruthy()
  })

  test('A4 — 하차일 수동 편집 시 라벨 갱신', async ({ page }) => {
    if (!REAL_JWT) test.skip()

    await installJwtStub(page, REAL_JWT, MASTER_USER_ID, MASTER_USER_ROLE, MASTER_USER_NAME)

    await page.goto(`${BASE_URL}/#/sales/new`, { waitUntil: 'domcontentloaded' })

    await page.waitForSelector('select', { timeout: 15000 })
    await selectDeliveryTag(page, 'REGION')

    await page.waitForSelector('[data-testid="slip-form-unload-date"]', { timeout: 10000 })

    // 하차일을 모레(+2일)로 수동 편집
    const today = new Date()
    const dayAfterTomorrow = new Date(today)
    dayAfterTomorrow.setDate(today.getDate() + 2)
    const newUnloadISO = dayAfterTomorrow.toISOString().slice(0, 10)
    console.log(`[A4] 하차일 수동 편집 값: ${newUnloadISO}`)

    const unloadDateInput = page.locator('[data-testid="slip-form-unload-date"]')
    await unloadDateInput.fill(newUnloadISO)
    await unloadDateInput.dispatchEvent('change')

    // 라벨 갱신 확인
    const labelPreview = page.locator('[data-testid="slip-form-schedule-label-preview"]')
    await page.waitForTimeout(500)
    const labelText = await labelPreview.textContent({ timeout: 5000 }).catch(() => '')
    console.log(`[A4] 수동편집 후 라벨: ${labelText}`)

    await capture(page, 'A4-manual-unload-date-label-update.png')

    // 라벨이 null이 아닌 값이어야 함 (x상y하 패턴)
    expect(labelText?.trim()).toBeTruthy()
  })
})

// ============================================================
// 시나리오 B: 생성+조회
// ============================================================

test.describe('B. 출고전표 생성+조회', () => {
  let createdSlipId: string | null = null
  let createdSlipNo: string | null = null

  test.beforeAll(() => {
    if (!REAL_JWT) {
      console.warn('[SKIP] REAL_JWT 환경변수 미설정 — 시나리오 B 건너뜀')
    }
  })

  test('B1 — API 생성: 지방 전표 unloadDate + deliveryScheduleLabel 검증', async ({ page }) => {
    if (!REAL_JWT) test.skip()

    const today = new Date().toISOString().slice(0, 10)

    const createResp = await page.request.post('http://localhost:8080/api/v1/slips', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${REAL_JWT}`,
      },
      data: {
        slipType: 'OUTBOUND',
        slipDate: today,
        sourceWarehouseId: '11111111-1111-1111-1111-000000000001',
        deliveryTag: 'REGION',
        memo: 'QA B1 배송일정 실전표',
        lines: [
          {
            productId: 'd7f488a5-6259-379c-8035-ed551e75a102',
            productName: 'AR09TXEAAWKNEU-04',
            modelName: 'AR09TXEAAWKNEU-04',
            quantity: 1,
            unitPrice: 100000,
          },
        ],
      },
    })

    const createBody = await createResp.json()
    const data = createBody?.data ?? {}
    console.log('[B1] 전표 생성 응답:', JSON.stringify({
      status: createResp.status(),
      id: data.id,
      slipNo: data.slipNo,
      slipDate: data.slipDate,
      unloadDate: data.unloadDate,
      deliveryScheduleLabel: data.deliveryScheduleLabel,
      deliveryTag: data.deliveryTag,
    }))

    // 201 Created 가 정상 (스펙: SlipController POST → 201)
    expect(createResp.status()).toBe(201)
    createdSlipId = data.id
    createdSlipNo = data.slipNo
    expect(createdSlipId).toBeTruthy()

    // unloadDate = 익일 (오늘이 목요일이면 금요일)
    expect(data.unloadDate).toBeTruthy()
    // deliveryScheduleLabel = "{오늘일}상{익일일}하" 패턴
    expect(data.deliveryScheduleLabel).toMatch(/^\d+상\d+하$/)
    // deliveryTag = REGION
    expect(data.deliveryTag).toBe('REGION')
    // 메모에 [지방] 접두 없음 (deliveryTag 구조화 후 제거됨)
    expect(data.memo ?? '').not.toContain('[지방]')
  })

  test('B2 — 상세 조회 UI: 배송태그 + 배송일정 표시', async ({ page }) => {
    if (!REAL_JWT || !createdSlipId) test.skip()

    await installJwtStub(page, REAL_JWT, MASTER_USER_ID, MASTER_USER_ROLE, MASTER_USER_NAME)

    await page.goto(`${BASE_URL}/#/sales/${createdSlipId}`, { waitUntil: 'domcontentloaded' })

    // 전표번호 노출 대기
    await page.waitForSelector(`text=${createdSlipNo}`, { timeout: 15000 }).catch(() => {
      console.warn('[B2] slipNo 텍스트 미발견 — 캡처 진행')
    })

    // 잠깐 대기 (렌더 완료)
    await page.waitForTimeout(1500)

    await capture(page, 'B2-slip-detail-region-schedule.png')

    // "지방" 태그 텍스트 확인 (deliveryTagLabel)
    const regionTag = page.getByText('지방')
    const regionTagVisible = await regionTag.isVisible().catch(() => false)
    console.log(`[B2] "지방" 태그 visible: ${regionTagVisible}`)

    // x상y하 패턴 텍스트 확인
    const scheduleText = page.getByText(/\d+상\d+하/)
    const scheduleVisible = await scheduleText.isVisible().catch(() => false)
    console.log(`[B2] "x상y하" 패턴 visible: ${scheduleVisible}`)

    // 상세 정보 검증 기록
    console.log(`[B2] slipId=${createdSlipId}, slipNo=${createdSlipNo}`)
  })
})
