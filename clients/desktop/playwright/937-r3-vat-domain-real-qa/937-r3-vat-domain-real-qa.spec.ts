/**
 * #937 R-3 확증 — 전표 상세(수정) 거래처 변경 재조회의 VAT 도메인이 필드 실제 계산과
 * 일치하는가 (mock OFF, 실 게이트웨이 :8080 → 실 Postgres).
 *
 * 의심되는 결함: `repriceEditLinesForPartner`(SlipDetailPage.tsx)가 가격기억/카탈로그
 * (VAT 포함 도메인)을 `vatExclusiveOf`로 ÷1.1 절사해 필드에 넣는다. 그런데 1041bad17 +
 * 071e6c7ac 이후 그 필드는 `recalculateLineVat`(PRICE 권위)에 의해 **VAT 포함**으로
 * 해석된다 — vatPrice.ts 자신의 문서가 전제한 "수정 화면 필드 = VAT 제외"가 더 이상
 * 사실이 아니다. 재조회가 여전히 ÷1.1 하면 필드에 들어간 값이 실제로는 (기억÷1.1)이
 * VAT 포함 단가로 오인되어 ~9.09% 과소 청구가 된다.
 *
 * throwaway 전용 — 실 파트너 2곳(강릉HVAC솔루션/거제공조산업)은 재사용하되(#809 R8 확립
 * fixture), 품목은 QA797-GEN-01(어느 파트너와도 가격기억 0건인 클린 픽스처)만 쓰고
 * 종료 시 두 파트너×이 품목의 기억행을 전량 삭제해 원상 복구한다. 생성 전표는 메모
 * "#937-R3-live-confirm" 로 표식하고 종료 시 취소(CANCELED) 처리한다.
 *
 * 실행:
 *   cd clients/desktop
 *   VITE_API_BASE_URL=http://localhost:8080 VITE_APP_VERSION=2026/07/26-1 \
 *     node_modules/.bin/vite --config playwright/809-price-memory-real-qa/vite.809-realqa.config.ts \
 *     --port 5611 --strictPort
 *   QA_BASE_URL=http://localhost:5611 QA_SHOTS_DIR=<scratchpad>/937-r3 \
 *     node_modules/.bin/playwright test --config=playwright.real-qa.config.ts \
 *     playwright/937-r3-vat-domain-real-qa/937-r3-vat-domain-real-qa.spec.ts
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:5611'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const ACCOUNT = 'dev_manager'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/937-r3-vat-domain'))
fs.mkdirSync(SHOTS, { recursive: true })

const PARTNER_A = { id: 'e5c62496-47df-3a07-a3d7-c28fa7123675', name: '강릉HVAC솔루션' }
const PARTNER_B = { id: 'f618755f-9439-33f2-8983-b9d950bcf8e3', name: '거제공조산업' }
const WAREHOUSE_ID = '11111111-1111-1111-1111-000000000001'
// 어느 파트너와도 가격기억 0건(2026-07-27 psql 실측) — throwaway 조합 격리용.
const PRODUCT = { id: '57dc63e2-43da-43e6-b73e-3c81822cf9a7', model: 'QA797-GEN-01' }
const MEMO_TAG = '#937-R3-live-confirm'

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

function memoryOf(partnerId: string): string {
  return psql(
    `SELECT coalesce((SELECT unit_price || '/' || source FROM partner_product_price_memory
       WHERE partner_id='${partnerId}' AND product_id='${PRODUCT.id}' AND is_deleted=false), 'NONE')`,
  )
}

function resetMemory(): void {
  psql(
    `DELETE FROM partner_product_price_memory WHERE product_id='${PRODUCT.id}'
       AND partner_id IN ('${PARTNER_A.id}','${PARTNER_B.id}')`,
  )
}

function seedMemory(partnerId: string, unitPrice: number, actor: string): void {
  psql(
    `INSERT INTO partner_product_price_memory (id, partner_id, product_id, unit_price, source,
       remembered_at, created_at, created_by, is_deleted)
     VALUES (gen_random_uuid(), '${partnerId}', '${PRODUCT.id}', ${unitPrice}, 'LINE_SAVE',
       TIMESTAMP '2026-01-02 03:04:05', CURRENT_TIMESTAMP, '${actor}', FALSE)`,
  )
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
  await page.waitForTimeout(1500)
}

test.describe('#937 R-3 확증 — 거래처 변경 재조회 VAT 도메인', () => {
  test('R-3 [확증] 실 UI 왕복 — 거래처 변경 시 필드 값·저장 후 기억 드리프트 실측', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)

    resetMemory()
    expect(memoryOf(PARTNER_A.id), '전제: A 기억 0').toBe('NONE')
    expect(memoryOf(PARTNER_B.id), '전제: B 기억 0').toBe('NONE')

    // B 에 기억단가 500,000(VAT 포함 도메인) 시드 — #809 R8 관례와 동일 값으로 직접 비교 가능.
    const B_MEMORY = 500000
    seedMemory(PARTNER_B.id, B_MEMORY, 'qa-937-r3')
    expect(memoryOf(PARTNER_B.id), '전제: B 기억 시드').toBe(`${B_MEMORY}.00/LINE_SAVE`)

    // 1) throwaway 전표를 실 UI 창구(생성 폼)로 만든다 — A 거래처, 단가 300,000 직접 타이핑.
    const A_TYPED_PRICE = 300000
    await page.goto(`${BASE_URL}/sales/new`)
    await expect(page.getByRole('combobox', { name: '거래처' })).toBeVisible({ timeout: 30000 })
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.name)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', PRODUCT.model)
    await page.waitForTimeout(800)
    const createPriceField = page.getByLabel('라인 1 단가')
    await createPriceField.fill(String(A_TYPED_PRICE))
    await page.getByLabel('메모').fill(MEMO_TAG)
    await capture(page, '01-create-form-filled')

    const createRes = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/slips'),
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: '저장', exact: true }).first().click()
    const createResponse = await createRes
    expect(createResponse.status(), 'throwaway 전표 생성').toBe(201)
    const slipId = (await createResponse.json()).data.id as string
    console.log(`[937-R3] throwaway slipId=${slipId}`)
    await page.waitForTimeout(1000)

    const aMemAfterCreate = memoryOf(PARTNER_A.id)
    console.log(`[937-R3] 생성 직후 A 기억=${aMemAfterCreate} (타이핑 ${A_TYPED_PRICE})`)
    console.log(`[937-R3] 생성 직후 라인(unit_price|unit_price_with_vat|supply|vat|qty)=${lineRow(slipId)}`)

    // 2) 편집 진입 — 진입 직후(무편집) 필드값을 기록한다(알려진 R-1 V1 하이드레이션 갭 참고용,
    //    이 라운드의 판정 기준이 아니다 — 판정은 "거래처 변경 후 값"이다).
    await openSalesEdit(page, slipId)
    const priceField = page.getByLabel('단가(VAT포함) 1')
    const beforeSwitch = (await priceField.inputValue()).replace(/[^0-9.]/g, '')
    console.log(`[937-R3] 편집 진입 직후(거래처 A, 무변경) 필드=${beforeSwitch}`)
    await capture(page, '02-edit-open-before-switch')

    const calls: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/slips/price-memory')) calls.push(`${r.method()} ${r.url()}`)
    })

    // 3) 거래처 A→B 전환 — repriceEditLinesForPartner 발동.
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_B.name)
    await page.waitForTimeout(2500)
    await capture(page, '03-after-switch-to-B')

    const bulk = calls.filter((c) => c.includes('/slips/price-memory/bulk'))
    expect(bulk.length, 'bulk 재조회 미발동').toBeGreaterThan(0)

    const afterSwitchB = (await priceField.inputValue()).replace(/[^0-9.]/g, '')
    const supplyAfterSwitchB = (await page.getByLabel('공급가액 1').inputValue()).replace(/[^0-9.]/g, '')
    const vatAfterSwitchB = (await page.getByLabel('부가세 1').inputValue()).replace(/[^0-9.]/g, '')
    const totalAfterSwitchB = (await page.getByLabel('합계(VAT포함) 1').inputValue()).replace(/[^0-9.]/g, '')
    console.log(
      `[937-R3] 거래처 B 전환 후 — 필드=${afterSwitchB} 공급가액=${supplyAfterSwitchB} `
      + `부가세=${vatAfterSwitchB} 합계=${totalAfterSwitchB} (B 기억=${B_MEMORY})`,
    )
    console.log(`[937-R3] 판정: 필드==기억(${B_MEMORY}) → 정합 / 필드==round(기억/1.1)=454545 → 재현(ⓐ)`)

    // 4) 저장 — DB 각인값 확인.
    const putRes = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await page.getByTestId('sales-slip-edit-save').click()
    expect((await putRes).status(), '저장 PUT').toBe(200)
    await page.waitForTimeout(1500)
    await capture(page, '04-after-save-partner-B')

    const bMemAfterSave1 = memoryOf(PARTNER_B.id)
    console.log(`[937-R3] 저장 후 B 기억(1회차)=${bMemAfterSave1}`)
    console.log(`[937-R3] 저장 후 라인=${lineRow(slipId)}`)

    // 5) 재열기 — 단순 재열기만으로 추가 drift 가 없는지(별개 이슈 V1과 혼동 방지 위해 기록만).
    await openSalesEdit(page, slipId)
    const afterReload = (await page.getByLabel('단가(VAT포함) 1').inputValue()).replace(/[^0-9.]/g, '')
    console.log(`[937-R3] 저장 후 재열기 필드=${afterReload}`)
    await capture(page, '05-reopen-after-save')

    // 6) 왕복 1 — B→A.
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_A.name)
    await page.waitForTimeout(2500)
    const afterSwitchBackA = (await page.getByLabel('단가(VAT포함) 1').inputValue()).replace(/[^0-9.]/g, '')
    console.log(`[937-R3] B→A 왕복 후 필드=${afterSwitchBackA} (A 기억=${aMemAfterCreate})`)
    await capture(page, '06-after-switch-back-to-A')

    const putRes2 = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await page.getByTestId('sales-slip-edit-save').click()
    expect((await putRes2).status(), '저장 PUT(2회차)').toBe(200)
    await page.waitForTimeout(1500)
    const aMemAfterSave = memoryOf(PARTNER_A.id)
    console.log(`[937-R3] A 재저장 후 A 기억=${aMemAfterSave}`)

    // 7) 왕복 2 — A→B 재진입(2번째 B 터치) — 복리 여부 판정.
    await openSalesEdit(page, slipId)
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER_B.name)
    await page.waitForTimeout(2500)
    const afterSecondSwitchB = (await page.getByLabel('단가(VAT포함) 1').inputValue()).replace(/[^0-9.]/g, '')
    console.log(
      `[937-R3] 2차 B 전환 후 필드=${afterSecondSwitchB} (1차 저장 기억=${bMemAfterSave1} 기준 — `
      + `같으면 안정, 더 작으면 복리 드리프트)`,
    )
    await capture(page, '07-second-switch-to-B')

    const putRes3 = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await page.getByTestId('sales-slip-edit-save').click()
    expect((await putRes3).status(), '저장 PUT(3회차)').toBe(200)
    await page.waitForTimeout(1500)
    const bMemAfterSave2 = memoryOf(PARTNER_B.id)
    console.log(`[937-R3] 2차 B 저장 후 기억=${bMemAfterSave2} (1차=${bMemAfterSave1})`)

    console.log('[937-R3] ===== 요약 =====')
    console.log(`beforeSwitch(A,무변경)=${beforeSwitch}`)
    console.log(`afterSwitchB(1차)=${afterSwitchB} / 기억B=${B_MEMORY}`)
    console.log(`bMemAfterSave1=${bMemAfterSave1}`)
    console.log(`afterReload=${afterReload}`)
    console.log(`afterSwitchBackA=${afterSwitchBackA} / 기억A(생성직후)=${aMemAfterCreate}`)
    console.log(`aMemAfterSave=${aMemAfterSave}`)
    console.log(`afterSecondSwitchB(2차)=${afterSecondSwitchB}`)
    console.log(`bMemAfterSave2=${bMemAfterSave2}`)

    // 8) 정리 — 전표 취소 + 기억행 삭제(원상 복구: 시작 시점엔 A/B 모두 기억 0 이었다).
    const cancelRes = await page.request.post(`${API_BASE}/slips/${slipId}/cancel`, {
      headers: authHeaders(auth),
      data: {},
    })
    console.log(`[937-R3] cleanup: 취소 POST status=${cancelRes.status()}`)
    resetMemory()
    expect(memoryOf(PARTNER_A.id), 'cleanup 확인: A 기억 원복').toBe('NONE')
    expect(memoryOf(PARTNER_B.id), 'cleanup 확인: B 기억 원복').toBe('NONE')

    await ctx.close()
  })
})
