/**
 * #937 재수렴 3차 fix3 확증 — U1(하이드레이션 unitPrice 세금 도메인)·U2(실질 VAT 불일치
 * 경고·2-peer)·U3(origin/main 대비 과세표준 회귀 0) 라이브 실증 (mock OFF, 실 게이트웨이
 * :8080 → 실 Postgres).
 *
 * throwaway 전용 — 파트너는 강릉HVAC솔루션(#809/#937-R3 확립 fixture) 재사용, 품목은
 * QA797-GEN-01(어느 파트너와도 가격기억 0건인 클린 픽스처)만 쓴다. 생성 전표는 메모
 * "#937-FIX3-U1U2U3" 로 표식하고 종료 시 취소(CANCELED) 처리한다. DRAFT/SAVED 단계에서만
 * 조작해 세금계산서 발행·회계 분개를 만들지 않는다(분개 생성 경로에 닿지 않음).
 *
 * 실행:
 *   cd clients/desktop
 *   VITE_API_BASE_URL=http://localhost:8080 VITE_APP_VERSION=2026/07/27-1 \
 *     node_modules/.bin/vite --config playwright/809-price-memory-real-qa/vite.809-realqa.config.ts \
 *     --port 5765 --strictPort
 *   QA_BASE_URL=http://localhost:5765 QA_SHOTS_DIR=<scratchpad>/937-fix3 \
 *     node_modules/.bin/playwright test --config=playwright.real-qa.config.ts \
 *     playwright/937-fix3-real-qa/937-fix3-real-qa.spec.ts
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:5765'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const ACCOUNT = 'dev_manager'
const SHOTS = process.env['QA_SHOTS_DIR'] ?? path.resolve(_dirname, '../../../../docs/qa/937-fix3')
fs.mkdirSync(SHOTS, { recursive: true })

const PARTNER_A = { id: 'e5c62496-47df-3a07-a3d7-c28fa7123675', name: '강릉HVAC솔루션' }
const PRODUCT = { id: '57dc63e2-43da-43e6-b73e-3c81822cf9a7', model: 'QA797-GEN-01' }
const MEMO_TAG = '#937-FIX3-U1U2U3'

function psql(sql: string): string {
  const flat = sql.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"')
  return execSync(`docker exec samhan-postgres psql -U samhan -d slip_db -tAc "${flat}"`, {
    encoding: 'utf-8',
  }).trim()
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
}

async function login(page: Page): Promise<LoginResult> {
  const l = await realLogin(page, ACCOUNT)
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: l.token, r: l.role, uid: l.userId, name: l.displayName },
  )
  return l
}

function authHeaders(auth: LoginResult): Record<string, string> {
  return { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
}

function lineRow(slipId: string): string {
  return psql(
    `SELECT unit_price || '|' || unit_price_with_vat || '|' || supply_amount || '|' || vat_amount || '|' || quantity
       FROM slip_lines WHERE slip_id='${slipId}' AND is_deleted=false AND product_id='${PRODUCT.id}'`,
  )
}

const realOptions = (page: Page, listboxLabel: string, idPrefix = 'ds-aac-list-') =>
  page.getByRole('listbox', { name: listboxLabel }).first().locator(`li[id^="${idPrefix}"]`)

async function pickAutocomplete(page: Page, name: string, listboxLabel: string, query: string): Promise<void> {
  const input = page.getByRole('combobox', { name })
  await input.scrollIntoViewIfNeeded()
  await input.click()
  await input.fill(query)
  const options = realOptions(page, listboxLabel)
  await expect(options.first(), `자동완성 후보 미표시: ${name} / ${query}`).toBeVisible({ timeout: 20000 })
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(options.first(), `자동완성 확정 실패(드롭다운 잔류): ${name} / ${query}`).toBeHidden({ timeout: 10000 })
  await page.waitForTimeout(300)
}

async function pickWarehouse(page: Page): Promise<void> {
  const input = page.getByRole('combobox', { name: '출고 창고' })
  await input.scrollIntoViewIfNeeded()
  await input.click()
  const options = realOptions(page, '창고 목록', 'ds-wh-list-')
  await expect(options.first(), '창고 후보 미표시').toBeVisible({ timeout: 20000 })
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(options.first(), '창고 확정 실패').toBeHidden({ timeout: 10000 })
  await page.waitForTimeout(200)
}

async function openSalesEdit(page: Page, slipId: string): Promise<void> {
  await page.goto(`${BASE_URL}/sales/${slipId}`)
  await page.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByTestId('sales-slip-edit-button').click()
  await expect(page.getByLabel('단가(VAT포함) 1')).toBeEnabled({ timeout: 30000 })
  await page.waitForTimeout(1000)
}

async function fieldValue(page: Page, label: string): Promise<string> {
  return (await page.getByLabel(label).inputValue()).replace(/[^0-9.]/g, '')
}

test.describe('#937 재수렴 3차 fix3 확증 — U1·U2·U3', () => {
  test('U1/U3 [확증] 무편집 진입 필드=VAT포함, 수량 2→3 시 과세표준 300,000 보존 / U2 실질 불일치 경고 + 2-peer', async ({ browser }) => {
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const pageA = await ctxA.newPage()
    const authA = await login(pageA)

    // 1) throwaway 전표 — 생성 폼(단가 VAT포함 입력)으로 실 UI 창구를 통해 만든다.
    //    타이핑 110,000(VAT포함) → BE 가 ÷1.1 로 분리해 supply=200,000/vat=20,000 저장 —
    //    PM 진단 원문 worked example 과 동일한 DB 형태(unit_price=100,000·
    //    unit_price_with_vat=110,000·supply=200,000·vat=20,000·qty=2).
    const TYPED_PRICE_INCL = 110000
    await pageA.goto(`${BASE_URL}/sales/new`)
    await expect(pageA.getByRole('combobox', { name: '거래처' })).toBeVisible({ timeout: 30000 })
    await pickAutocomplete(pageA, '거래처', '거래처 목록', PARTNER_A.name)
    await pickWarehouse(pageA)
    await pickAutocomplete(pageA, '라인 1 품목', '품목 목록', PRODUCT.model)
    await pageA.waitForTimeout(800)
    await pageA.getByLabel('라인 1 수량').fill('2')
    await pageA.getByLabel('라인 1 단가').fill(String(TYPED_PRICE_INCL))
    await pageA.getByLabel('메모').fill(MEMO_TAG)
    await capture(pageA, '01-create-form-filled')

    const createRes = pageA.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/slips'),
      { timeout: 30000 },
    )
    await pageA.getByRole('button', { name: '저장', exact: true }).first().click()
    const createResponse = await createRes
    expect(createResponse.status(), 'throwaway 전표 생성').toBe(201)
    const slipId = (await createResponse.json()).data.id as string
    console.log(`[937-FIX3] throwaway slipId=${slipId}`)
    await pageA.waitForTimeout(800)

    const createdRow = lineRow(slipId)
    console.log(`[937-FIX3] 생성 직후 라인(unit_price|unit_price_with_vat|supply|vat|qty)=${createdRow}`)
    expect(createdRow, 'PM 진단 worked example 과 동일한 DB 형태 확립').toBe('100000.00|110000.00|200000.00|20000.00|2')

    // 2) 편집 진입 — U1 확증: 무편집 진입 필드가 unit_price(100,000, VAT 제외)가 아니라
    //    unit_price_with_vat(110,000, VAT 포함)를 실었는가.
    await openSalesEdit(pageA, slipId)
    const priceOnOpen = await fieldValue(pageA, '단가(VAT포함) 1')
    const supplyOnOpen = await fieldValue(pageA, '공급가액 1')
    const vatOnOpen = await fieldValue(pageA, '부가세 1')
    console.log(`[937-FIX3] U1 — 무편집 진입: 단가=${priceOnOpen} 공급=${supplyOnOpen} 부가세=${vatOnOpen}`)
    await capture(pageA, '02-edit-open-before-any-edit')
    expect(priceOnOpen, 'U1 — 필드가 VAT포함 단가(110,000)를 싣는다').toBe('110000')
    expect(Number(priceOnOpen) * 2, 'U1 — 무편집 진입 시점부터 unitPrice×quantity=supply+vat').toBe(Number(supplyOnOpen) + Number(vatOnOpen))

    // 3) 수량 2→3 — U1+U3 확증: 과세표준(공급가액) 300,000 보존(origin/main 과 동일, 272,727 아님).
    await pageA.getByLabel('수량 1').fill('3')
    await pageA.waitForTimeout(600)
    const supplyAfterQty = await fieldValue(pageA, '공급가액 1')
    const vatAfterQty = await fieldValue(pageA, '부가세 1')
    const totalAfterQty = await fieldValue(pageA, '합계(VAT포함) 1')
    console.log(`[937-FIX3] U1+U3 — 수량 3 직후: 공급=${supplyAfterQty} 부가세=${vatAfterQty} 합계=${totalAfterQty} (기대 300,000/30,000/330,000, 결함 재현치는 272,727)`)
    await capture(pageA, '03-after-quantity-2-to-3')
    expect(supplyAfterQty, 'U3 — origin/main 이 보존하던 과세표준 300,000 재현(회귀 0)').toBe('300000')
    expect(vatAfterQty).toBe('30000')
    expect(totalAfterQty).toBe('330000')

    // 4) 저장 — DB 각인값 확인.
    const putRes = pageA.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await pageA.getByTestId('sales-slip-edit-save').click()
    expect((await putRes).status(), '저장 PUT').toBe(200)
    await pageA.waitForTimeout(1000)
    await capture(pageA, '04-after-save-qty-3')
    console.log(`[937-FIX3] 저장 후 라인=${lineRow(slipId)}`)

    // 5) 재열기 — 드리프트 없음 + 정확한 10%(diff=0)라 거짓 경고 없음을 확인.
    await openSalesEdit(pageA, slipId)
    const priceOnReopen = await fieldValue(pageA, '단가(VAT포함) 1')
    console.log(`[937-FIX3] 저장 후 재열기 단가=${priceOnReopen}`)
    await capture(pageA, '05-reopen-after-save-no-warning')
    expect(pageA.getByText('⚠ 10%와 다름')).toHaveCount(0)

    // 6) U2 — 부가세 셀을 직접 편집해 실질 불일치(3,000원 차)를 만든다(SUPPLY/VAT 권위 직접
    //    편집은 기존에 허용된 편집 정책 — 개발책임자 2026-07-25 결정 P6). 저장 후 재열기하면
    //    하이드레이션이 그 불일치를 다시 감지해 경고해야 한다(무조건 false 로 닫혀 있던 R-2
    //    결함의 재수렴 3차 근본수정 대상).
    await pageA.getByLabel('부가세 1').fill('27000') // 기대 30,000 대비 3,000원 과소.
    await pageA.waitForTimeout(400)
    await capture(pageA, '06-vat-cell-edited-to-mismatch')
    const putRes2 = pageA.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await pageA.getByTestId('sales-slip-edit-save').click()
    expect((await putRes2).status(), '저장 PUT(불일치 각인)').toBe(200)
    await pageA.waitForTimeout(1000)
    console.log(`[937-FIX3] 불일치 각인 후 라인=${lineRow(slipId)}`)

    await openSalesEdit(pageA, slipId)
    const vatWarningA = pageA.getByText('⚠ 10%와 다름')
    await expect(vatWarningA, 'U2 — 편집자(A) 재열기 시 실질 불일치 경고').toBeVisible({ timeout: 10000 })
    await capture(pageA, '07-peerA-reopen-shows-warning')

    // 7) 2-peer — 원격 피어(B)도 같은 전표를 열면(Y.Doc 신규 세션) 동일한 경고를 봐야 한다.
    //    (구) 하이드레이션은 무조건 false 로 닫아 B 는 경고를 못 봤다(재수렴 3차 실측 결함).
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const pageB = await ctxB.newPage()
    await login(pageB)
    await openSalesEdit(pageB, slipId)
    const vatWarningB = pageB.getByText('⚠ 10%와 다름')
    await expect(vatWarningB, 'U2 2-peer — 원격 피어(B)도 같은 실질 불일치 경고를 본다').toBeVisible({ timeout: 10000 })
    await capture(pageB, '08-peerB-remote-also-shows-warning')
    console.log('[937-FIX3] 2-peer 확증: 편집자(A)·원격(B) 모두 실질 불일치 경고 노출')

    // 8) cleanup — 불일치를 원복(부가세 30,000)하고 전표를 취소한다.
    await pageB.close()
    await ctxB.close()
    await pageA.getByLabel('부가세 1').fill('30000')
    await pageA.waitForTimeout(400)
    const putRes3 = pageA.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await pageA.getByTestId('sales-slip-edit-save').click()
    expect((await putRes3).status(), '저장 PUT(원복)').toBe(200)
    await pageA.waitForTimeout(800)
    console.log(`[937-FIX3] 원복 후 라인=${lineRow(slipId)}`)

    const cancelRes = await pageA.request.post(`${API_BASE}/slips/${slipId}/cancel`, {
      headers: authHeaders(authA),
      data: {},
    })
    console.log(`[937-FIX3] cleanup: 취소 POST status=${cancelRes.status()}`)

    await ctxA.close()
  })
})
