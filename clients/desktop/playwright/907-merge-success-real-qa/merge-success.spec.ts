import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #907 게이트③ — 주문 병합 "성공" 경로 라이브 GUI QA (OPUS).
 *
 * 실 게이트웨이(:8080) + 실 렌더러(:5300, mock OFF) 대상.
 * 사전에 SQL 로 생성된 마커(OPUS907MERGE) throwaway 주문 2건(같은 거래처 P-2026-0009,
 * partner_id 보유, DRAFT)을 화면 병합 UI 로 실제 병합 발행하여 성공 경로를 실증한다.
 * 이 spec 은 fixture 를 생성/삭제하지 않는다(외부 SQL 스냅샷/원복이 담당).
 */
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5300'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '907-merge-success-2026-07-24'))

const PARTNER_CODE = 'P-2026-0009'
const PARTNER_NAME = '대전공조테크'
const ORDER_A = '2026/07/24-901'
const ORDER_B = '2026/07/24-902'
const WAREHOUSE = 'HQ-001'

test.use({ viewport: { width: 1600, height: 1000 } })

test('#907 게이트③ — 같은 거래처 적격 주문 2건을 병합 발행(성공)한다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (name: string) => {
    await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true })
  }

  // 1) 실서버 로그인 + 인증 스텁
  const login = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const loginData = (await login.json()).data ?? {}
  await page.addInitScript(
    (v: { token: string; userId: string; role: string; fullName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ ...v, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    {
      token: loginData.token ?? '',
      userId: loginData.userId ?? '',
      role: loginData.role ?? 'MASTER',
      fullName: loginData.displayName ?? '개발마스터',
    },
  )

  // 병합 발행 API 응답 캡처
  let mergeResponse = ''
  page.on('response', async (res) => {
    if (res.url().includes('/convert-to-slip-merge') && res.request().method() === 'POST') {
      try {
        mergeResponse = `HTTP ${res.status()} :: ${await res.text()}`
        console.log('[MERGE RESPONSE]', mergeResponse)
      } catch { /* ignore */ }
    }
  })

  const dialog = page.getByRole('dialog')
  const summary = page.getByTestId('merge-convert-order-candidate-summary')

  // 2) 판매 주문 목록 → 병합 다이얼로그 오픈
  await page.goto(`${BASE_URL}/#/sales/partner-orders`)
  await expect(page.getByTestId('merge-convert-open'), '병합 진입 버튼 없음').toBeVisible({ timeout: 30_000 })
  await shot('01-주문목록')
  await page.getByTestId('merge-convert-open').click()
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('merge-convert-partner-required')).toBeVisible()
  await shot('02-병합다이얼로그-거래처선택전')

  // 3) 거래처 우선 선택 (P-2026-0009)
  const partnerSearch = page.getByTestId('merge-convert-partner-search')
  await partnerSearch.fill(PARTNER_CODE)
  const listbox = page.getByRole('listbox', { name: '거래처 목록' })
  await expect(listbox, '거래처 검색 결과 없음').toBeVisible({ timeout: 15_000 })
  await listbox.locator('[role="option"]').filter({ hasText: PARTNER_CODE }).first().click()
  await expect(page.getByTestId('merge-convert-selected-partner')).toContainText(PARTNER_CODE)

  // 3-1) 양성(적격 2건) + 음성(legacy 제외) 대조
  await expect(summary, '적격 후보가 없음').toContainText(/[1-9]\d*건 후보/, { timeout: 15_000 })
  await expect(summary, 'legacy 제외 표기 없음').toContainText(/건은 병합에서 제외됨/)
  await expect(page.getByTestId('merge-convert-order-ineligible-reason'))
    .toContainText('기존 주문은 거래처 정체성을 확인할 수 없어 병합할 수 없습니다')
  console.log('[CANDIDATE SUMMARY]', (await summary.textContent()) ?? '')
  await shot('03-거래처선택-적격2건+legacy제외사유')

  // 3-2) legacy 주문은 후보 option 으로 노출되지 않음(fail-closed 음성 대조)
  const orderSearch = page.getByTestId('merge-convert-order-search')
  await orderSearch.fill('2026/06/08')
  await page.waitForTimeout(500)
  await expect(page.getByTestId('merge-convert-order-option-2026/06/08-1968'),
    'legacy 주문이 병합 후보로 노출됨').toHaveCount(0)
  await shot('04-legacy주문-후보미노출')

  // 4) 적격 주문 2건 선택 (901, 902)
  for (const orderNo of [ORDER_A, ORDER_B]) {
    await orderSearch.fill(orderNo)
    const option = page.getByTestId(`merge-convert-order-option-${orderNo}`)
    await expect(option, `${orderNo} 후보 option 없음`).toBeVisible({ timeout: 10_000 })
    await option.click()
    await expect(page.getByTestId(`merge-convert-order-chip-${orderNo}`)).toBeVisible({ timeout: 10_000 })
  }
  await expect(page.getByTestId('merge-convert-selected-order-count')).toContainText('2건')
  // 라인 그룹(주문수량 표) 렌더 대기
  await expect(page.getByTestId(`merge-convert-order-group-${ORDER_A}`)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(`merge-convert-order-group-${ORDER_B}`)).toBeVisible({ timeout: 15_000 })
  await shot('05-적격2건-선택+수량표')

  // 4-1) 헤더 충돌 필드가 있으면 첫 주문 값으로 해소(방어)
  const conflict = page.getByTestId('merge-convert-conflict-section')
  if (await conflict.isVisible().catch(() => false)) {
    const groups = conflict.locator('[role="radiogroup"]')
    const n = await groups.count()
    for (let i = 0; i < n; i++) {
      await groups.nth(i).locator('input[type="radio"]').first().check().catch(() => undefined)
    }
    await shot('05b-헤더충돌-해소')
  }

  // 5) 출고 창고 선택 (HQ-001 본사창고)
  const warehouseInput = page.getByTestId('merge-convert-warehouse').locator('input')
  await warehouseInput.fill(WAREHOUSE)
  await page.getByText('본사창고', { exact: false }).first().click()
  const submitBtn = page.getByTestId('merge-convert-submit')
  await expect(submitBtn, '병합 발행 버튼이 활성화되지 않음').toBeEnabled({ timeout: 15_000 })
  await shot('06-창고선택-발행직전')

  // 6) 병합 발행 실행
  await submitBtn.click()

  // 성공 = 목록 페이지 토스트(slipNo). 실패 = 모달 내 에러 배너.
  const toast = page.getByTestId('merge-convert-success-toast')
  const modalError = page.getByTestId('merge-convert-error')
  await Promise.race([
    toast.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined),
    modalError.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined),
  ])
  await page.waitForTimeout(800)

  if (await modalError.isVisible().catch(() => false)) {
    const msg = (await modalError.textContent()) ?? ''
    await shot('07-병합발행-실패')
    throw new Error(`병합 발행 실패: ${msg} | mergeResponse=${mergeResponse}`)
  }

  await expect(toast, '성공 토스트 미표시').toBeVisible({ timeout: 10_000 })
  const toastText = (await toast.textContent()) ?? ''
  console.log('[SUCCESS TOAST]', toastText)
  console.log('[MERGE RESPONSE FINAL]', mergeResponse)
  expect(toastText, '토스트에 판매전표 번호가 없음').toMatch(/판매전표\s+\S+\s+발행 완료/)
  await shot('07-병합발행-성공-토스트')

  // 발행 후 목록 상태(전환완료 반영) 캡처
  await page.waitForTimeout(1200)
  await shot('08-발행후-목록')
})
