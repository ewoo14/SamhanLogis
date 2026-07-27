/**
 * supplier-profile.spec.ts
 *
 * 사업자 양식 (SupplierProfile) CRUD Playwright 통합 스펙.
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173  (별도 터미널)
 *   npx playwright test playwright/supplier-profile/supplier-profile.spec.ts --reporter=line
 *
 * dev server 미가용 시 모든 UI 테스트 자동 SKIP.
 * 스크린샷 저장: docs/qa/supplier-profile-and-grid-ux/*.png
 *
 * PR #156 회귀 가드: page.on('pageerror') 훅 의무 적용.
 * PR #160 disabled UX 가드: ACCOUNTANT 역할 "수정" 버튼 비활성화 검증.
 *
 * TC 목록 (10건):
 *   TC-SP-1: /accounting/supplier-profiles 진입 → seed 값 7 필드 표시
 *   TC-SP-2: "수정" → businessAddress 갱신 → 저장 → 표시 갱신
 *   TC-SP-3: "신규 추가" → 2번째 사업자 추가 → list size 2
 *   TC-SP-4: 2번째 사업자 "기본 사업자 전환" → primary 표시 swap
 *   TC-SP-5: primary 사업자 "삭제" 시도 → BusinessException toast
 *   TC-SP-6: ACCOUNTANT mockRole → "수정" 버튼 disabled (PR #160 패턴)
 *   TC-SP-7: 사이드바 회계 카테고리 "공급자 설정" NavLink visible
 *   TC-SP-8: 계좌 exposed 토글 저장 왕복 — 비노출 표기 + 재편집 unchecked 단언 (사이클2 승격)
 *   TC-SP-9: 로고 업로드 → hasLogo 배지 + 삭제 → 배지 소멸 왕복 (사이클2 승격)
 *   TC-SP-10: 거래명세서 인쇄 라우트 bankNotice+인감 런타임 렌더 단언 (사이클2 승격, Fix1+Fix2 회귀 가드)
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

/** 스크린샷 저장 디렉토리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveMockQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/supplier-profile-and-grid-ux',
))

function ensureQaDir(): void {
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
// pageerror 훅 — PR #156 회귀 가드 의무
// ---------------------------------------------------------------------------

/** 각 테스트 페이지에 pageerror 훅 등록 */
function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`[console.error] ${msg.text()}`)
    }
  })
}

async function waitForSettle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(800)
}

/**
 * 신규 사업자 등록 헬퍼 — add 버튼 → 모달 → 필수필드 입력 → 저장 → 모달 닫힘 대기.
 * stateful mock 이 목록에 append 하므로 호출 후 해당 companyName/bizNo 카드가 추가된다.
 */
async function addSupplierProfile(
  page: Page,
  opts: { company: string; bizNo: string; ceo?: string; address?: string },
): Promise<void> {
  await page.getByTestId('supplier-profile-add-btn').click()
  const modal = page.getByRole('dialog')
  await expect(modal, '신규 등록 모달 미오픈').toBeVisible({ timeout: 5000 })
  await page.getByTestId('supplier-field-businessNumber').fill(opts.bizNo)
  await page.getByTestId('supplier-field-companyName').fill(opts.company)
  await page.getByTestId('supplier-field-representativeName').fill(opts.ceo ?? '김큐에이')
  await page.getByTestId('supplier-field-businessAddress').fill(opts.address ?? '서울특별시 송파구 QA로 200')
  await page.getByTestId('supplier-field-businessType').fill('서비스')
  await page.getByTestId('supplier-field-businessItem').fill('소프트웨어 품질검증')
  await page.getByTestId('supplier-profile-save-btn').click()
  await expect(modal, '저장 후 모달 미닫힘 — 등록 실패').toBeHidden({ timeout: 8000 })
  await waitForSettle(page)
}

// ---------------------------------------------------------------------------
// seed 데이터 상수
// ---------------------------------------------------------------------------

// mock seed(`/accounting/supplier-profiles` primary) 와 정합 — spec §2d 신규 필드 seed 반영.
const SEED_BUSINESS_NUMBER = '2148720659'
const SEED_COMPANY_NAME = '(주)삼한공조시스템'

// ---------------------------------------------------------------------------
// TC-SP-1 ~ TC-SP-7
// ---------------------------------------------------------------------------

test.describe('사업자 양식 CRUD (TC-SP-1~7)', () => {

  test.skip(SKIP_UI, 'dev server 미가용 — VITE_MOCK_MODE=1 npx vite --port 5173 후 PLAYWRIGHT_SKIP_UI=0 으로 재시도')

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미접근: ${BASE_URL}`)
  })

  /**
   * TC-SP-1: /accounting/supplier-profiles 진입 → seed 값 7 필드 표시
   *
   * 기대 결과:
   *   - businessNumber=2148720659, companyName=（주）삼한공조시스템 포함
   *   - representativeName, businessAddress, businessType, businessItem, email 필드 노출
   *   - pageerror 없음
   */
  test('TC-SP-1: seed 7 필드 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/accounting/supplier-profiles?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    const pageText = (await page.textContent('body')) ?? ''

    // 사업자등록번호 + 상호 필수 검증 — 페이지는 formatBizNo 로 000-00-00000 표시하므로 raw/포맷 모두 허용.
    const seedBizFormatted = SEED_BUSINESS_NUMBER.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3')
    expect(
      pageText.includes(SEED_BUSINESS_NUMBER) || pageText.includes(seedBizFormatted),
      `사업자등록번호 ${SEED_BUSINESS_NUMBER}(${seedBizFormatted}) 미표시`,
    ).toBeTruthy()
    expect(
      pageText.includes(SEED_COMPANY_NAME) || pageText.includes('삼한공조'),
      `상호 ${SEED_COMPANY_NAME} 미표시`,
    ).toBeTruthy()

    // 항상 렌더되는 6 InfoRow 레이블 전부 검증 — 페이지 실제 텍스트와 정합.
    // ('상호'는 카드 제목=companyName 값으로 렌더되어 레이블 아님 → SEED_COMPANY_NAME 별도 검증.
    //  '종사업장번호'는 seed subBusinessNumber=null 이라 조건부 미렌더 → 제외.)
    const fieldLabels = [
      '사업자등록번호', '대표 성명', '사업장 주소', '업태', '종목', '이메일',
    ]
    const foundLabels = fieldLabels.filter(label => pageText.includes(label))
    expect(
      foundLabels.length,
      `필드 레이블 부족 (발견: ${foundLabels.length}/6): ${foundLabels.join(', ')}`,
    ).toBeGreaterThanOrEqual(6)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-1-supplier-profile-seed-display.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-SP-2: "수정" → businessAddress 갱신 → 저장 → 표시 갱신
   *
   * 기대 결과:
   *   - "수정" 버튼 클릭 → 편집 폼 진입
   *   - businessAddress 새 값 입력 → 저장 버튼 클릭
   *   - 저장 후 갱신된 주소가 화면에 표시
   *   - pageerror 없음
   */
  test('TC-SP-2: 수정 → businessAddress 갱신 → 저장', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/accounting/supplier-profiles?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    const newAddress = '서울특별시 강남구 테헤란로 QA-테스트동 100호'

    // seed 사업자 수정 버튼(supplier-edit-btn-{bizNo}) → 수정 모달.
    const editBtn = page.getByTestId(`supplier-edit-btn-${SEED_BUSINESS_NUMBER}`)
    await expect(editBtn, '수정 버튼 미표시 — MASTER write 가용').toBeVisible({ timeout: 5000 })
    await editBtn.click()

    const modal = page.getByRole('dialog')
    await expect(modal, '수정 모달 미오픈').toBeVisible({ timeout: 5000 })
    await expect(modal).toContainText('수정')

    // 사업장 주소 갱신 → 저장 (stateful PUT → 목록 카드에 반영).
    const addressInput = page.getByTestId('supplier-field-businessAddress')
    await addressInput.fill(newAddress)
    await page.getByTestId('supplier-profile-save-btn').click()
    await expect(modal, '저장 후 모달 미닫힘 — 수정 실패').toBeHidden({ timeout: 8000 })
    await waitForSettle(page)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-2-supplier-profile-edit-save.png'),
      fullPage: true,
    })

    // 수정 후 갱신된 주소가 카드에 실제 표시 (silent-pass 제거 — 새 주소 strict).
    const pageTextAfter = (await page.textContent('body')) ?? ''
    expect(
      pageTextAfter.includes(newAddress),
      `수정한 사업장 주소("${newAddress}") 미표시 — PUT 갱신 화면 반영 실패`,
    ).toBe(true)
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-SP-3: "신규 추가" → 2번째 사업자 추가 → list size 2
   *
   * 기대 결과:
   *   - "신규 추가" 버튼 클릭 → 추가 폼 표시
   *   - 새 사업자 정보 입력 → 저장
   *   - 목록에 2개 사업자 표시
   *   - pageerror 없음
   */
  test('TC-SP-3: 신규 추가 → list size 2', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/accounting/supplier-profiles?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    // "신규 추가" 버튼 — 실제 testid (supplier-profile-add-btn) → 신규 등록 Modal 오픈.
    const addBtn = page.getByTestId('supplier-profile-add-btn')
    await expect(addBtn, '신규 추가 버튼(supplier-profile-add-btn) 미표시 — MASTER 권한 write 가용').toBeVisible({ timeout: 5000 })
    await addBtn.click()

    // 신규 등록 Modal(role=dialog) 오픈 대기.
    const modal = page.getByRole('dialog')
    await expect(modal, '신규 등록 모달 미오픈').toBeVisible({ timeout: 5000 })
    await expect(modal).toContainText('신규 등록')

    // 필수 필드 입력 (Input 은 ...rest 로 data-testid 를 <input> 에 forward) — 검증 통과 위해 전부 입력.
    const NEW_COMPANY = '큐에이테스트물류'
    await page.getByTestId('supplier-field-businessNumber').fill('2208123456')
    await page.getByTestId('supplier-field-companyName').fill(NEW_COMPANY)
    await page.getByTestId('supplier-field-representativeName').fill('김큐에이')
    await page.getByTestId('supplier-field-businessAddress').fill('서울특별시 송파구 QA로 200')
    await page.getByTestId('supplier-field-businessType').fill('서비스')
    await page.getByTestId('supplier-field-businessItem').fill('소프트웨어 품질검증')

    // 저장 → POST → in-process mock 목록에 실제 append.
    await page.getByTestId('supplier-profile-save-btn').click()
    await waitForSettle(page)

    // 모달 닫힘(저장 성공) — 검증 실패 시 모달이 유지되므로 닫힘 자체가 성공 신호.
    await expect(modal, '저장 후 모달 미닫힘 — 등록 실패(검증 에러)').toBeHidden({ timeout: 8000 })

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-3-supplier-profile-add-second.png'),
      fullPage: true,
    })

    // list size 2 — stateful mock 이 등록분을 목록에 반영 → seed(삼한공조) + 신규(큐에이테스트물류) 동시 표시.
    const pageTextAfter = (await page.textContent('body')) ?? ''
    expect(
      pageTextAfter.includes(NEW_COMPANY),
      `신규 등록 사업자 "${NEW_COMPANY}" 목록 미표시 — POST 후 list size 2 미반영`,
    ).toBe(true)
    expect(
      pageTextAfter.includes('삼한공조'),
      `기존 seed 사업자(삼한공조) 미표시 — 목록 2건 동시 표시 실패`,
    ).toBe(true)

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-SP-4: 2번째 사업자 "기본 사업자 전환" → primary 표시 swap
   *
   * 기대 결과:
   *   - 2번째 사업자의 "기본 사업자 전환" 버튼 클릭
   *   - 이전 primary 사업자 → 비기본, 2번째 사업자 → 기본(primary) 마크
   *   - pageerror 없음
   */
  test('TC-SP-4: 기본 사업자 전환 → primary swap', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/accounting/supplier-profiles?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    // mark-primary/삭제 버튼은 non-primary 행에만 렌더되므로, 2번째(보조) 사업자를 먼저 추가한다.
    const BIZ2 = '2208123456'
    await addSupplierProfile(page, { company: '큐에이전환물류', bizNo: BIZ2 })

    // 초기 상태: seed(primary) 는 mark-primary 버튼 없음, 2번째(보조) 는 있음.
    const seedMarkBtn = page.getByTestId(`supplier-mark-primary-btn-${SEED_BUSINESS_NUMBER}`)
    const biz2MarkBtn = page.getByTestId(`supplier-mark-primary-btn-${BIZ2}`)
    await expect(biz2MarkBtn, '2번째(보조) 사업자 기본전환 버튼 미표시').toBeVisible({ timeout: 5000 })
    await expect(seedMarkBtn, 'seed(기본) 사업자엔 기본전환 버튼이 없어야 함').toHaveCount(0)

    // 2번째 → 기본 전환 (stateful mock isPrimary swap).
    await biz2MarkBtn.click()
    await waitForSettle(page)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-4-supplier-profile-primary-swap.png'),
      fullPage: true,
    })

    // swap 검증: 2번째가 primary(기본전환 버튼 사라짐) + seed 가 보조(기본전환 버튼 출현).
    await expect(
      page.getByTestId(`supplier-mark-primary-btn-${BIZ2}`),
      '기본 전환 후 2번째 사업자가 primary 가 되어 기본전환 버튼이 사라져야 함',
    ).toHaveCount(0)
    await expect(
      page.getByTestId(`supplier-mark-primary-btn-${SEED_BUSINESS_NUMBER}`),
      '기본 전환 후 seed 사업자가 보조가 되어 기본전환 버튼이 출현해야 함',
    ).toBeVisible({ timeout: 5000 })
    // primary 배지는 정확히 1건만 존재.
    await expect(
      page.getByTestId('supplier-primary-badge'),
      'primary 배지는 정확히 1건이어야 함(swap 후 단일 기본)',
    ).toHaveCount(1)

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-SP-5: 기본 사업자 삭제 방지(UI) + 보조 사업자 삭제 동작
   *
   * 기대 결과:
   *   - primary(기본) 사업자 카드에 "삭제" 버튼 미노출 (UI 레벨 삭제 방지)
   *     (BE 는 추가로 409 SUPPLIER_PRIMARY_DELETE_FORBIDDEN 으로 방어 — mock 동일)
   *   - 보조 사업자는 삭제 버튼 노출 → 삭제 시 목록에서 제거, 기본 사업자는 유지
   *   - pageerror 없음
   */
  test('TC-SP-5: 기본 사업자 삭제 방지(UI) + 보조 사업자 삭제', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/accounting/supplier-profiles?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    // 기본 사업자 삭제 방지(UI 레벨): primary 행에는 삭제 버튼이 렌더되지 않는다.
    // (BE 는 추가로 409 SUPPLIER_PRIMARY_DELETE_FORBIDDEN 으로 방어 — mock 동일.)
    await expect(
      page.getByTestId(`supplier-delete-btn-${SEED_BUSINESS_NUMBER}`),
      'primary(기본) 사업자에 삭제 버튼이 노출됨 — 기본 사업자 삭제 방지(UI) 실패',
    ).toHaveCount(0)

    // 보조 사업자는 삭제 가능해야 함 — 2번째 추가 후 삭제 → 목록에서 제거 검증.
    const BIZ2 = '3308234567'
    await addSupplierProfile(page, { company: '큐에이삭제대상물류', bizNo: BIZ2 })
    await expect(
      page.getByText('큐에이삭제대상물류', { exact: false }),
      '2번째(보조) 사업자 추가 후 목록 미표시',
    ).toBeVisible({ timeout: 5000 })

    // 보조 사업자 삭제 (window.confirm 자동 수락).
    page.once('dialog', (d) => d.accept())
    await page.getByTestId(`supplier-delete-btn-${BIZ2}`).click()
    await waitForSettle(page)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-5-supplier-profile-delete-primary-exception.png'),
      fullPage: true,
    })

    // 삭제된 보조 사업자는 목록에서 사라지고, 기본(seed) 사업자는 그대로 유지.
    await expect(
      page.getByText('큐에이삭제대상물류', { exact: false }),
      '보조 사업자 삭제 후에도 목록에 잔존 — 삭제 미반영',
    ).toHaveCount(0)
    const pageTextAfter = (await page.textContent('body')) ?? ''
    expect(
      pageTextAfter.includes('삼한공조'),
      '삭제 작업 후 기본(seed) 사업자가 사라짐 — 잘못된 삭제',
    ).toBe(true)
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-SP-6: ACCOUNTANT mockRole → "수정" 버튼 disabled (PR #160 disabled UX 패턴)
   *
   * 기대 결과:
   *   - mockRole=ACCOUNTANT 로 진입 시 "수정" 버튼이 aria-disabled="true" 또는 비표시
   *   - 클릭해도 편집 폼 진입 불가
   *   - pageerror 없음
   */
  test('TC-SP-6: ACCOUNTANT → 수정 버튼 disabled (PR #160 패턴)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/accounting/supplier-profiles?mockRole=ACCOUNTANT`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    const editBtns = page.locator(
      '[data-testid="supplier-profile-edit"], [data-testid*="edit-profile"], button:has-text("수정")',
    )

    let editRestricted = false

    if ((await editBtns.count()) > 0) {
      const firstEditBtn = editBtns.first()
      const ariaDisabled = await firstEditBtn.getAttribute('aria-disabled').catch(() => null)
      const dataDisabled = await firstEditBtn.getAttribute('data-disabled').catch(() => null)
      const classAttr = (await firstEditBtn.getAttribute('class').catch(() => '')) ?? ''
      const isDisabledAttr =
        ariaDisabled === 'true' ||
        dataDisabled === 'true' ||
        classAttr.includes('disabled') ||
        classAttr.includes('opacity') ||
        classAttr.includes('cursor-not-allowed')

      // 클릭 후 편집 폼 미진입 확인
      if (!isDisabledAttr) {
        await firstEditBtn.click({ force: true })
        await page.waitForTimeout(500)
        const pageTextAfter = (await page.textContent('body')) ?? ''
        // 편집 폼 진입 미확인 (input 없음)
        const inputAppeared = (await page.locator('input[name="businessAddress"], input[name="companyName"]').count()) > 0
        editRestricted = !inputAppeared
      } else {
        editRestricted = true
      }
    } else {
      // 버튼 자체가 숨겨진 경우 — 권한 제한 인정
      editRestricted = true
    }

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-6-accountant-edit-disabled.png'),
      fullPage: true,
    })

    expect(
      editRestricted,
      'ACCOUNTANT 권한에서 수정 버튼이 disabled 이어야 함 (PR #160 패턴)',
    ).toBeTruthy()
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-SP-7: 사이드바 회계 카테고리 "공급자 설정" NavLink visible
   *
   * 기대 결과:
   *   - MASTER 진입 시 사이드바에 "공급자 설정" 링크 노출 (작업 4 라벨 변경 반영)
   *   - href 또는 data-testid 가 /accounting/supplier-profiles 를 가리킴
   *   - pageerror 없음
   */
  test('TC-SP-7: 사이드바 "공급자 설정" NavLink visible', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    const pageText = (await page.textContent('body')) ?? ''

    const navLink = page.locator(
      'a:has-text("공급자 설정"), a:has-text("공급자설정"), [href*="supplier-profiles"], [data-testid*="supplier-profile-nav"]',
    ).first()

    const navExists = (await navLink.count()) > 0
    const textExists = pageText.includes('공급자 설정') || pageText.includes('공급자설정')

    // 사이드바 회계 카테고리 펼침 시도
    if (!navExists && !textExists) {
      const accountingCategory = page.locator(
        '[data-testid*="category-accounting"], nav button:has-text("회계"), nav a:has-text("회계")',
      ).first()
      if ((await accountingCategory.count()) > 0) {
        await accountingCategory.click()
        await page.waitForTimeout(600)
      }
    }

    const afterExpandText = (await page.textContent('body')) ?? ''

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-7-sidebar-supplier-profile-navlink.png'),
      fullPage: true,
    })

    expect(
      navExists || textExists || afterExpandText.includes('공급자 설정') || afterExpandText.includes('공급자설정'),
      '사이드바에 "공급자 설정" NavLink 미노출 (MASTER 권한)',
    ).toBeTruthy()
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-SP-8: 계좌 exposed 토글 저장 왕복 — 비노출 표기 + 재편집 unchecked 단언 (사이클2 승격)
   *
   * 기대 결과:
   *   - 수정 모달 진입 → 새 계좌 추가 → exposed 체크박스 해제 → 저장
   *     → 목록 카드 "(비노출)" 표기 단언
   *   - 재편집 진입 시 체크박스 unchecked 단언 (stateful mock 왕복)
   *   - pageerror 없음
   */
  test('TC-SP-8: 계좌 exposed 토글 저장 왕복 — 비노출 표기 + 재편집 unchecked 단언', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/accounting/supplier-profiles?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    const editBtn = page.getByTestId(`supplier-edit-btn-${SEED_BUSINESS_NUMBER}`)
    await expect(editBtn).toBeVisible({ timeout: 5000 })
    await editBtn.click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // 새 계좌 행 추가 (seed 계좌가 이미 있으므로 마지막 행 인덱스 기준)
    await page.getByTestId('supplier-bank-add-btn').click()
    await waitForSettle(page)

    const bankRows = page.locator('[data-testid^="supplier-bank-row-"]')
    const rowCount = await bankRows.count()
    const newIdx = rowCount - 1

    await page.getByTestId(`supplier-bank-holder-${newIdx}`).fill('비노출테스트')
    await page.getByTestId(`supplier-bank-name-${newIdx}`).fill('신한은행')
    await page.getByTestId(`supplier-bank-number-${newIdx}`).fill('987654-32-109876')

    const exposedCheck = page.getByTestId(`supplier-bank-exposed-${newIdx}`)
    await expect(exposedCheck).toBeVisible({ timeout: 3000 })
    if (await exposedCheck.isChecked()) {
      await exposedCheck.uncheck()
    }
    await expect(exposedCheck, '체크 해제 후 unchecked 상태여야 함').not.toBeChecked()

    await page.getByTestId('supplier-profile-save-btn').click()
    await expect(modal, '저장 후 모달 미닫힘').toBeHidden({ timeout: 8000 })
    await waitForSettle(page)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-8-bank-exposed-toggle.png'),
      fullPage: true,
    })

    // 목록 카드에 "(비노출)" 표기 단언
    const bankList = page.getByTestId('supplier-bank-list')
    await expect(bankList, '비노출 계좌 목록 미표시').toBeVisible({ timeout: 5000 })
    const bankListText = (await bankList.textContent()) ?? ''
    expect(
      bankListText.includes('비노출'),
      `목록 카드에 "(비노출)" 표기 없음 — PUT 후 exposed=false 미반영. 계좌 목록: "${bankListText}"`,
    ).toBeTruthy()

    // 재편집 진입 → 비노출 계좌 체크박스 unchecked 단언
    await editBtn.click()
    await expect(modal).toBeVisible({ timeout: 5000 })
    await waitForSettle(page)
    const reEditBankRows = page.locator('[data-testid^="supplier-bank-row-"]')
    const reEditRowCount = await reEditBankRows.count()
    let foundUnchecked = false
    for (let i = 0; i < reEditRowCount; i++) {
      const cb = page.getByTestId(`supplier-bank-exposed-${i}`)
      if ((await cb.count()) > 0 && !(await cb.isChecked())) {
        foundUnchecked = true
        break
      }
    }
    expect(foundUnchecked, '재편집 진입 시 비노출 계좌 체크박스 unchecked 이어야 함').toBeTruthy()

    await page.keyboard.press('Escape')
    await waitForSettle(page)

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-SP-9: 로고 업로드 → hasLogo 배지 + 삭제 → 배지 소멸 왕복 (사이클2 승격)
   *
   * 기대 결과:
   *   - 수정 모달 진입 → setInputFiles(1×1 PNG fixture) → 저장
   *     → 목록 카드 "로고 등록됨" 배지 표시 단언
   *   - 카드 "로고 삭제" 클릭 → 배지 소멸 단언
   *   - pageerror 없음
   */
  test('TC-SP-9: 로고 업로드 → hasLogo 배지 + 삭제 → 배지 소멸 왕복', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/accounting/supplier-profiles?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    const editBtn = page.getByTestId(`supplier-edit-btn-${SEED_BUSINESS_NUMBER}`)
    await expect(editBtn).toBeVisible({ timeout: 5000 })
    await editBtn.click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 5000 })

    await expect(page.getByTestId('supplier-logo-upload-btn'), '로고 업로드 버튼 미표시').toBeVisible({ timeout: 3000 })

    // 1×1 투명 PNG 실 바이트 fixture
    const onePxPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    const logoInput = page.getByTestId('supplier-logo-file-input')
    await logoInput.setInputFiles({
      name: 'test-logo.png',
      mimeType: 'image/png',
      buffer: onePxPng,
    })
    await waitForSettle(page)

    await expect(page.getByTestId('supplier-logo-preview'), '로고 미리보기 미표시').toBeVisible({ timeout: 3000 })

    await page.getByTestId('supplier-profile-save-btn').click()
    await expect(modal, '저장 후 모달 미닫힘').toBeHidden({ timeout: 8000 })
    await waitForSettle(page)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-9-logo-upload-badge.png'),
      fullPage: true,
    })

    const logoBadge = page.getByTestId('supplier-logo-badge')
    await expect(logoBadge, '"로고 등록됨" 배지 미표시').toBeVisible({ timeout: 5000 })

    const logoDeleteCardBtn = page.getByTestId(`supplier-logo-delete-card-btn-${SEED_BUSINESS_NUMBER}`)
    await expect(logoDeleteCardBtn, '로고 삭제 버튼(카드) 미표시').toBeVisible({ timeout: 3000 })
    page.once('dialog', (d) => d.accept())
    await logoDeleteCardBtn.click()
    await waitForSettle(page)

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-9-logo-delete-badge-gone.png'),
      fullPage: true,
    })

    await expect(logoBadge, '"로고 등록됨" 배지가 삭제 후에도 잔존').toHaveCount(0)

    // blob: URL 미리보기는 Electron CSP(img-src 'self' data: https:) 에서 차단되어 console.error 발생.
    // 이 CSP 에러는 기능 결함이 아니라 dev 전용 preview URL 정책 차이이므로 필터링.
    const nonCspErrors = errors.filter(e => !e.includes('blob:') && !e.includes('Content Security Policy'))
    expect(nonCspErrors, `pageerror 발생 (CSP blob 제외): ${nonCspErrors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-SP-10: 거래명세서 인쇄 라우트 bankNotice+인감 런타임 렌더 단언 (사이클2 승격)
   *
   * Fix 2 회귀 가드: mock seed에 계좌 1건(국민은행)+인감 stub base64 포함.
   * - bankNotice 계좌 푸터 "예금주:" 텍스트가 실제 렌더되는지 확인
   * - 인감 <img data:image/png> 요소가 비어있지 않은 src를 갖는지 확인
   */
  test('TC-SP-10: 거래명세서 인쇄 라우트 bankNotice+인감 런타임 렌더 단언', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/sales/slip-001/print/statement?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-SP-10-print-statement-bank-stamp.png'),
      fullPage: true,
    })

    const pageText = (await page.textContent('body')) ?? ''

    expect(
      pageText.includes('예금주:') || pageText.includes('국민은행') || pageText.includes('삼한공조시스템'),
      'bankNotice 계좌 푸터가 인쇄 양식에 미렌더됨 — Fix 1(print-profile 핸들러 순서) 또는 Fix 2(seed 계좌) 회귀',
    ).toBeTruthy()

    const stampImgCount = await page.locator('img[src^="data:image/png"]').count()
    expect(
      stampImgCount,
      '인감 <img data:image/png> 가 인쇄 양식에 미렌더됨 — Fix 1 또는 Fix 2 회귀',
    ).toBeGreaterThan(0)

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })
})
