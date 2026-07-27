import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * item 3-D 비파괴 실 QA — SlipFormPage 재고모달 일원화(InventoryLookupModal).
 *
 * 실 게이트웨이(:8080) + 실 JWT(dev_master) + 실 product/inventory 서비스 + 실 DB.
 * VITE_MOCK_MODE 미사용(실 모드). window.samhanAuth 에 실 JWT 주입 → apiClient 가
 * `Authorization: Bearer` 로 게이트웨이 호출(게이트웨이가 실제 검증).
 *
 * ⚠️ 로컬 구-시드 드리프트(product↔inventory productId 정합 0)로 autocomplete 선택
 * 품목은 잔량 0 → 매트릭스 값 0/0/0. 비-0 값 렌더는 동일 모달로 2.6d(#335) 실 QA 에서
 * 이미 실증됨. 본 QA 는 "SlipFormPage 가 신 InventoryLookupModal 을 실 서버로 연다"는
 * 일원화 자체를 실증한다.
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const JWT = process.env['SAMHAN_QA_JWT'] ?? ''
const SHOT_DIR = resolveQaShotsDir('../../docs/qa/slice-3-d-slipform-stock-modal-unify')
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

async function installRealAuth(page: Page): Promise<void> {
  await page.addInitScript((token: string) => {
    const auth = {
      token,
      userId: 'a0000000-0000-0000-0000-000000000001',
      role: 'MASTER',
      fullName: '개발마스터',
      partnerCode: null,
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, JWT)
}

test('item 3-D: SlipFormPage 재고조회 → 신 InventoryLookupModal 실 서버 연동 (값 0=시드 드리프트)', async ({ page }) => {
  test.setTimeout(90_000)
  expect(JWT, 'SAMHAN_QA_JWT env 필요').not.toEqual('')

  // batch 응답 status 캡처(실 라운드트립 증명)
  const batchStatuses: number[] = []
  page.on('response', (r) => {
    if (r.url().includes('/inventory/balances/batch')) batchStatuses.push(r.status())
  })

  await installRealAuth(page)
  await page.goto(`${BASE_URL}/#/sales/new?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })

  // 재고조회 버튼 = SlipFormPage 렌더 확인
  const lookupBtn = page.getByTestId('slip-form-inventory-lookup-btn')
  await expect(lookupBtn).toBeVisible({ timeout: 20_000 })
  await expect(lookupBtn).toBeDisabled() // 라인 미선택
  await page.screenshot({ path: `${SHOT_DIR}/01-slipform-empty.png`, fullPage: true })

  // 품목 선택 — 라인 ProductAutocomplete(거래처 combobox 와 구분: aria-label "라인 1 품목")
  const combo = page.getByRole('combobox', { name: '라인 1 품목' })
  await expect(combo).toBeVisible({ timeout: 10_000 })
  await combo.click()
  await combo.fill('AC')
  const listbox = page.locator('[role="listbox"]').first()
  await expect(listbox).toBeVisible({ timeout: 10_000 })
  const firstOption = listbox.locator('[role="option"]').first()
  await expect(firstOption).toBeVisible({ timeout: 10_000 })
  const pickedModel = (await firstOption.innerText()).split('\n')[0]
  await firstOption.click()
  await page.screenshot({ path: `${SHOT_DIR}/02-product-selected.png`, fullPage: true })

  // 라인 선택 체크박스
  const rowCheck = page.getByRole('checkbox', { name: /라인 1 선택/ })
  await expect(rowCheck).toBeVisible({ timeout: 10_000 })
  await rowCheck.check()
  await expect(lookupBtn).toBeEnabled({ timeout: 10_000 })
  await page.screenshot({ path: `${SHOT_DIR}/03-line-selected.png`, fullPage: true })

  // 재고조회 → 모달
  await lookupBtn.click()
  const modal = page.getByTestId('inventory-lookup-modal')
  await expect(modal).toBeVisible({ timeout: 15_000 })
  // 로딩 종료 대기(데이터/빈/창고없음 분기)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOT_DIR}/04-modal-toggle-off.png`, fullPage: true })

  // 0수량 토글 ON → 전 창고(0/0/0) 매트릭스
  const zeroToggle = page.getByTestId('inventory-lookup-zero-toggle')
  await expect(zeroToggle).toBeVisible({ timeout: 10_000 })
  await zeroToggle.check()
  await page.waitForTimeout(800)
  // 신 모달 증명 — 가용/실/예약 3줄
  await expect(modal).toContainText('가용')
  await expect(modal).toContainText('예약')
  // VIRTUAL 제외
  await expect(modal).not.toContainText('가상창고')
  // UUID 비공개 가드
  expect(UUID_PATTERN.test(await modal.innerText())).toBe(false)
  await page.screenshot({ path: `${SHOT_DIR}/05-modal-toggle-on-matrix.png`, fullPage: true })

  // 실 라운드트립 단언
  expect(batchStatuses, 'batch 호출 발생').not.toHaveLength(0)
  expect(batchStatuses.every((s) => s === 200), `batch status=${batchStatuses}`).toBe(true)

  // eslint-disable-next-line no-console
  console.log(`[3D-QA] 선택품목=${pickedModel} / batch status=${batchStatuses.join(',')}`)
})
