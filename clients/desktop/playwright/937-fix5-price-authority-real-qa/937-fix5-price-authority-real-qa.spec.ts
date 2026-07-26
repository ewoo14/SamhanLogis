/**
 * #937 재수렴 5차 라이브QA — 사용자 권위 단가 보존 (mock OFF, 실 게이트웨이 :8080 → 실 Postgres).
 *
 * 검증 불변식(재수렴 5차 PM fix 지시):
 *  1) 사용자가 입력한 단가는 어떤 편집 경로에서도 소멸하지 않는다 — P4(2026-07-25 개발책임자
 *     결정)를 표시·하이드레이션 계층까지 일관 적용한다.
 *  2) 무수정 재저장이 어떤 표시 값도 바꾸지 않는다.
 *  3) 같은 전표가 두 화면(읽기전용 표 / 수정 모달)에서 다른 단가를 보이지 않는다.
 *
 * 추가로 재수렴 4차가 확보한 회귀 8항목 중 라이브로 재측정 가능한 것을 함께 잰다 —
 * 끝수 단가 왕복, 수량 2→3→5→2, ⑤ 오염행 왕복, 사본 인쇄, 인쇄 3종.
 *
 * throwaway 전용 — 전표는 QA_* 환경변수로 주입받으며(사전 API 생성) 거래처를 붙이지 않는다
 * (partnerId=null → collectPriceMemory 早期 return → 공유 가격기억 테이블 write 0건).
 *
 * 실행:
 *   cd clients/desktop
 *   VITE_API_BASE_URL=http://localhost:8080 VITE_APP_VERSION=2026/07/27-1 \
 *     node_modules/.bin/vite --config playwright/809-price-memory-real-qa/vite.809-realqa.config.ts \
 *     --port 6001 --strictPort
 *   QA_BASE_URL=http://localhost:6001 QA_D1_SLIP=<uuid> QA_E2_SLIP=<uuid> QA_POLLUTED_SLIP=<uuid> \
 *     QA_COPY_SLIP=<uuid> QA_FRACTION_SLIP=<uuid> QA_PURCHASE_SLIP=<uuid> \
 *     node_modules/.bin/playwright test --config=playwright.real-qa.config.ts \
 *     playwright/937-fix5-price-authority-real-qa/937-fix5-price-authority-real-qa.spec.ts
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:6001'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const ACCOUNT = process.env['QA_ACCOUNT'] ?? 'dev_manager'
/** D-1 — 부가세만 편집해 단가 항등식이 깨진 정당 상태(두 단가 컬럼이 다르다). */
const D1_SLIP = process.env['QA_D1_SLIP'] ?? ''
/**
 * D-1B — 부가세 편집을 API PUT 으로만 적용해 coedit Y.Doc 이 생성된 적 없는 전표.
 * 수정 모달이 Y.Doc 복원이 아니라 서버 하이드레이션({@code toPurchaseEditLines})을 타는 경로
 * (PM 진단 원문 [E1] "Y.Doc 미생성 전표 수정모달 첫 하이드레이션")를 그대로 잰다.
 */
const D1B_SLIP = process.env['QA_D1B_SLIP'] ?? ''
/** E2 — 끝수 단가(33,333.33) + 부가세 직접 편집. 두 화면 단가 일치 확인용. */
const E2_SLIP = process.env['QA_E2_SLIP'] ?? ''
/** ⑤ — BE 구 저장이 두 컬럼에 같은 VAT 제외 값을 각인한 오염 행. */
const POLLUTED_SLIP = process.env['QA_POLLUTED_SLIP'] ?? ''
/** ⑤ 오염행의 복사본(copyOf) — 인쇄 항등식 회귀. */
const COPY_SLIP = process.env['QA_COPY_SLIP'] ?? ''
/** 끝수 단가 499,999.5 왕복. */
const FRACTION_SLIP = process.env['QA_FRACTION_SLIP'] ?? ''
/** 매입전표 인쇄 회귀. */
const PURCHASE_SLIP = process.env['QA_PURCHASE_SLIP'] ?? ''
const SHOTS = process.env['QA_SHOTS_DIR'] ?? path.resolve(_dirname, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const MODEL = 'AR09TXEAAWKNEU-04'

function psql(sql: string): string {
  const flat = sql.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"')
  return execSync(`docker exec samhan-postgres psql -U samhan -d slip_db -tAc "${flat}"`, {
    encoding: 'utf-8',
  }).trim()
}

function lineRow(slipId: string): string {
  return psql(
    `SELECT unit_price || '|' || unit_price_with_vat || '|' || supply_amount || '|' || vat_amount
       || '|' || quantity FROM slip_lines WHERE slip_id='${slipId}' AND is_deleted=false`,
  )
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function login(page: Page): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: ACCOUNT, password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  const l: LoginResult = {
    token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? ACCOUNT,
  }
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

/** 숫자 텍스트만 뽑는다("110,000" → 110000, "33,333.33" → 33333.33). */
function num(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9.-]/g, ''))
}

/** 읽기전용 상세 표의 라인 행 셀 — 체크박스/#/모델/품목/규격/수량/단가/공급/부가세/합계. */
function readonlyCells(page: Page) {
  return page.locator('table tbody tr').filter({ hasText: MODEL }).first().locator('td')
}

async function openDetail(page: Page, slipId: string): Promise<void> {
  await page.goto(`${BASE_URL}/sales/${slipId}`)
  await page.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 40000 })
  await page.waitForTimeout(1200)
}

async function openEditModal(page: Page): Promise<void> {
  await page.getByTestId('sales-slip-edit-button').click()
  await expect(page.getByLabel('단가(VAT포함) 1')).toBeEnabled({ timeout: 40000 })
  await page.waitForTimeout(1500)
}

async function saveModal(page: Page, slipId: string): Promise<number> {
  const putPromise = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}`),
    { timeout: 40000 },
  )
  await page.getByRole('button', { name: '저장', exact: true }).first().click()
  const put = await putPromise
  await page.waitForTimeout(1500)
  return put.status()
}

test.describe('#937 재수렴 5차 — 사용자 권위 단가 보존 라이브QA', () => {
  test.beforeAll(() => {
    expect(D1_SLIP, 'QA_D1_SLIP 미주입').not.toBe('')
    expect(D1B_SLIP, 'QA_D1B_SLIP 미주입').not.toBe('')
    expect(E2_SLIP, 'QA_E2_SLIP 미주입').not.toBe('')
    expect(POLLUTED_SLIP, 'QA_POLLUTED_SLIP 미주입').not.toBe('')
    expect(COPY_SLIP, 'QA_COPY_SLIP 미주입').not.toBe('')
    expect(FRACTION_SLIP, 'QA_FRACTION_SLIP 미주입').not.toBe('')
    expect(PURCHASE_SLIP, 'QA_PURCHASE_SLIP 미주입').not.toBe('')
  })

  test('D-1 — 부가세만 편집해도 사용자 입력 단가(110,000)가 표시·재저장에서 소멸하지 않는다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    // 1단계 — 생성 직후 상태
    const step1 = lineRow(D1_SLIP)
    console.log(`[FIX5-D1] 1단계 DB(unit_price|with_vat|supply|vat|qty)=${step1}`)
    expect(step1).toBe('100000.00|110000.00|200000.00|20000.00|2')

    await openDetail(page, D1_SLIP)
    await capture(page, 'd1-01-detail-before-vat-edit')

    // 2~3단계 — 부가세만 20,000 → 25,000 (단가·수량 무편집)
    await openEditModal(page)
    const priceBefore = await page.getByLabel('단가(VAT포함) 1').inputValue()
    console.log(`[FIX5-D1] 2단계 편집 진입 단가 필드=${priceBefore}`)
    expect(num(priceBefore)).toBe(110000)
    const vatField = page.getByLabel('부가세 1')
    await vatField.fill('25000')
    await vatField.blur()
    await page.waitForTimeout(800)
    const priceAfterVatEdit = await page.getByLabel('단가(VAT포함) 1').inputValue()
    console.log(`[FIX5-D1] 3단계 부가세 편집 후 단가 필드=${priceAfterVatEdit}`)
    await capture(page, 'd1-02-edit-vat-only-price-kept')
    expect(num(priceAfterVatEdit), 'P4 — 부가세 편집이 단가를 역산하지 않는다').toBe(110000)

    // 4단계 — 저장 후 DB
    expect(await saveModal(page, D1_SLIP)).toBe(200)
    const step4 = lineRow(D1_SLIP)
    console.log(`[FIX5-D1] 4단계 저장 후 DB=${step4}`)
    expect(step4).toBe('100000.00|110000.00|200000.00|25000.00|2')

    // 5단계 — 재열기 읽기전용 표
    await openDetail(page, D1_SLIP)
    const cells = readonlyCells(page)
    const roUnit = num(await cells.nth(6).textContent())
    const roSupply = num(await cells.nth(7).textContent())
    const roVat = num(await cells.nth(8).textContent())
    const roTotal = num(await cells.nth(9).textContent())
    console.log(`[FIX5-D1] 5단계 읽기전용 표: 단가=${roUnit} 공급=${roSupply} 부가세=${roVat} 합계=${roTotal}`)
    await capture(page, 'd1-03-readonly-after-reopen')
    expect(roUnit, '읽기전용 표가 사용자 입력 단가를 보인다').toBe(110000)
    expect(roSupply).toBe(200000)
    expect(roVat).toBe(25000)
    expect(roTotal).toBe(225000)

    // 6단계 — 수정 모달 첫 하이드레이션
    await openEditModal(page)
    const hydrated = await page.getByLabel('단가(VAT포함) 1').inputValue()
    console.log(`[FIX5-D1] 6단계 수정 모달 하이드레이션 단가=${hydrated}`)
    await capture(page, 'd1-04-edit-modal-hydration')
    expect(num(hydrated), '하이드레이션이 사용자 입력 단가를 싣는다').toBe(110000)
    expect(num(hydrated), '불변식 3 — 두 화면 단가 일치').toBe(roUnit)

    // 7단계 — 아무것도 고치지 않고 저장만
    expect(await saveModal(page, D1_SLIP)).toBe(200)
    const step7 = lineRow(D1_SLIP)
    console.log(`[FIX5-D1] 7단계 무편집 재저장 후 DB=${step7}`)
    expect(step7, '불변식 2 — 무수정 재저장이 저장값을 바꾸지 않는다').toBe(step4)

    await openDetail(page, D1_SLIP)
    const roUnitAfter = num(await readonlyCells(page).nth(6).textContent())
    console.log(`[FIX5-D1] 7단계 재저장 후 읽기전용 단가=${roUnitAfter}`)
    await capture(page, 'd1-05-readonly-after-noop-resave')
    expect(roUnitAfter).toBe(roUnit)
  })

  test('D-1 감사 이력 — 부가세만 편집해도 레드라인에 단가 변경이 찍히지 않는다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)

    const res = await page.request.get(`${API_BASE}/api/slips/${D1_SLIP}/redline`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    expect(res.ok(), `레드라인 조회 실패: HTTP ${res.status()}`).toBeTruthy()
    const redline = (await res.json()).data as {
      fields: Array<{ fieldPath: string; label: string; layers: Array<{ value: string }> }>
    }
    const unitPriceFields = redline.fields.filter((f) => f.fieldPath.endsWith('.unitPrice'))
    console.log(`[FIX5-D1] 레드라인 단가 필드=${JSON.stringify(unitPriceFields)}`)
    // RED(수정 전): [{ lines[0].unitPrice, layers: [110000, 112500] }] — 사용자는 단가를 건드리지 않았다.
    expect(unitPriceFields, '사용자가 하지 않은 단가 변경이 감사 이력에 없다').toHaveLength(0)

    await openDetail(page, D1_SLIP)
    await capture(page, 'd1-06-detail-redline')
  })

  test('E1 — Y.Doc 미생성 전표의 첫 하이드레이션·무편집 재저장이 사용자 단가를 지운다(회귀)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    const before = lineRow(D1B_SLIP)
    console.log(`[FIX5-E1] 진입 전 DB=${before}`)
    expect(before, '전제: 부가세만 API 로 편집된 상태').toBe('100000.00|110000.00|200000.00|25000.00|2')

    await openDetail(page, D1B_SLIP)
    const roUnit = num(await readonlyCells(page).nth(6).textContent())
    console.log(`[FIX5-E1] 읽기전용 표 단가=${roUnit}`)
    await capture(page, 'e1-01-readonly')
    expect(roUnit).toBe(110000)

    await openEditModal(page)
    const hydrated = num(await page.getByLabel('단가(VAT포함) 1').inputValue())
    console.log(`[FIX5-E1] Y.Doc 미생성 첫 하이드레이션 단가=${hydrated}`)
    await capture(page, 'e1-02-first-hydration')
    expect(hydrated, 'Y.Doc 없이도 사용자 입력 단가를 싣는다').toBe(110000)

    expect(await saveModal(page, D1B_SLIP)).toBe(200)
    const after = lineRow(D1B_SLIP)
    console.log(`[FIX5-E1] 무편집 재저장 후 DB=${after}`)
    expect(after, '무편집 재저장이 사용자 단가를 지우지 않는다').toBe(before)
  })

  test('E2 — 끝수 단가(33,333.33) 전표가 두 화면에서 같은 단가를 보인다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    const before = lineRow(E2_SLIP)
    console.log(`[FIX5-E2] 편집 전 DB=${before}`)
    expect(before).toBe('30303.00|33333.33|90909.00|9091.00|3')

    // 부가세만 9,091 → 12,000
    await openDetail(page, E2_SLIP)
    await openEditModal(page)
    const vatField = page.getByLabel('부가세 1')
    await vatField.fill('12000')
    await vatField.blur()
    await page.waitForTimeout(800)
    expect(await saveModal(page, E2_SLIP)).toBe(200)
    const after = lineRow(E2_SLIP)
    console.log(`[FIX5-E2] 부가세 편집 후 DB=${after}`)
    expect(after).toBe('30303.00|33333.33|90909.00|12000.00|3')

    // 읽기전용 표 vs 수정 모달
    await openDetail(page, E2_SLIP)
    const roUnit = num(await readonlyCells(page).nth(6).textContent())
    await capture(page, 'e2-01-readonly-unit-price')
    await openEditModal(page)
    const modalUnit = num(await page.getByLabel('단가(VAT포함) 1').inputValue())
    await capture(page, 'e2-02-modal-unit-price')
    console.log(`[FIX5-E2] 읽기전용 표 단가=${roUnit} vs 수정모달 단가=${modalUnit}`)
    expect(modalUnit, '불변식 3 — 두 화면이 같은 단가를 보인다').toBe(roUnit)
    expect(roUnit, '사용자 입력 끝수 단가 보존').toBe(33333.33)
  })

  test('⑤ 회귀 — 두 컬럼이 같은 VAT 제외 값인 오염행은 여전히 권위 금액에서 유도한다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    const before = lineRow(POLLUTED_SLIP)
    console.log(`[FIX5-⑤] 진입 전 DB=${before}`)
    expect(before, '전제: ⑤ 오염 상태').toBe('100000.00|100000.00|200000.00|20000.00|2')

    await openDetail(page, POLLUTED_SLIP)
    const cells = readonlyCells(page)
    const roUnit = num(await cells.nth(6).textContent())
    const roSupply = num(await cells.nth(7).textContent())
    const roVat = num(await cells.nth(8).textContent())
    console.log(`[FIX5-⑤] 읽기전용 단가=${roUnit} 공급=${roSupply} 부가세=${roVat}`)
    await capture(page, 'p5-01-readonly-derived')
    expect(roUnit, '오염행은 권위 금액에서 유도(220,000/2)').toBe(110000)
    expect(roUnit * 2).toBe(roSupply + roVat)

    await openEditModal(page)
    const hydrated = num(await page.getByLabel('단가(VAT포함) 1').inputValue())
    console.log(`[FIX5-⑤] 하이드레이션 단가=${hydrated}`)
    await capture(page, 'p5-02-modal-derived')
    expect(hydrated).toBe(110000)

    // 수량 2 → 3 — 과세표준 9.09% 하락 없음
    const qtyField = page.getByLabel('수량 1')
    await qtyField.fill('3')
    await qtyField.blur()
    await page.waitForTimeout(800)
    const supplyAfter = num(await page.getByLabel('공급가액 1').inputValue())
    const vatAfter = num(await page.getByLabel('부가세 1').inputValue())
    console.log(`[FIX5-⑤] 수량 2→3 후: 공급=${supplyAfter} 부가세=${vatAfter}`)
    await capture(page, 'p5-03-quantity-2-to-3')
    expect(supplyAfter).toBe(300000)
    expect(vatAfter).toBe(30000)
  })

  test('끝수 단가 왕복 3회 + 수량 2→3→5→2 — 단가가 흔들리지 않는다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    const before = lineRow(FRACTION_SLIP)
    console.log(`[FIX5-끝수] 왕복 전 DB=${before}`)
    expect(before).toBe('454545.00|499999.50|454545.00|45455.00|1')

    for (let round = 1; round <= 3; round += 1) {
      await openDetail(page, FRACTION_SLIP)
      const roUnit = num(await readonlyCells(page).nth(6).textContent())
      await openEditModal(page)
      const hydrated = num(await page.getByLabel('단가(VAT포함) 1').inputValue())
      expect(await saveModal(page, FRACTION_SLIP)).toBe(200)
      const row = lineRow(FRACTION_SLIP)
      console.log(`[FIX5-끝수] 왕복 ${round}회차: 읽기전용=${roUnit} 모달=${hydrated} DB=${row}`)
      expect(roUnit).toBe(499999.5)
      expect(hydrated).toBe(499999.5)
      expect(row, '끝수 단가 왕복 불변').toBe(before)
      expect(row).not.toContain('454545.00|413222')
    }
    await capture(page, 'fraction-01-roundtrip-3x')

    // 수량 2→3→5→2 (D-1 전표에서 — 단가 110,000 고정)
    await openDetail(page, D1_SLIP)
    await openEditModal(page)
    const qtyField = page.getByLabel('수량 1')
    for (const q of ['3', '5', '2']) {
      await qtyField.fill(q)
      await qtyField.blur()
      await page.waitForTimeout(700)
      const unit = num(await page.getByLabel('단가(VAT포함) 1').inputValue())
      const supply = num(await page.getByLabel('공급가액 1').inputValue())
      console.log(`[FIX5-수량] 수량=${q} 단가=${unit} 공급=${supply}`)
      expect(unit, '수량 변경 내내 단가 고정').toBe(110000)
    }
    const supplyBack = num(await page.getByLabel('공급가액 1').inputValue())
    await capture(page, 'fraction-02-quantity-cycle')
    expect(supplyBack, '수량 원복 시 공급가액 정확 원복').toBe(200000)
  })

  test('2-peer coedit — 두 피어가 같은 단가를 보고 신규 전표를 만들지 않는다(POST 0)', async ({ browser }) => {
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA)
    await login(pageB)

    const posts: string[] = []
    for (const p of [pageA, pageB]) {
      p.on('request', (req) => {
        if (req.method() === 'POST' && req.url().includes('/api/slips')) posts.push(req.url())
      })
    }

    await openDetail(pageA, D1_SLIP)
    await openEditModal(pageA)
    await openDetail(pageB, D1_SLIP)
    await openEditModal(pageB)
    await pageB.waitForTimeout(1500)

    const unitA = num(await pageA.getByLabel('단가(VAT포함) 1').inputValue())
    const unitB = num(await pageB.getByLabel('단가(VAT포함) 1').inputValue())
    console.log(`[FIX5-2peer] A 단가=${unitA} B 단가=${unitB} POST=${posts.length}`)
    await capture(pageA, 'coedit-01-peer-a')
    await capture(pageB, 'coedit-02-peer-b')
    expect(unitA).toBe(110000)
    expect(unitB).toBe(unitA)
    expect(posts, `coedit 중 전표 생성 POST 발생: ${posts.join(', ')}`).toHaveLength(0)
  })

  test('인쇄 3종 + ⑤ 사본 인쇄 — 세금계산서·매입전표 단가 x 수량 == 공급가액', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } })
    const page = await ctx.newPage()
    await login(page)

    // 세금계산서 (D-1 전표 — 부가세 직접 편집으로 S/V 항등식이 깨진 정당 상태)
    await page.goto(`${BASE_URL}/sales/${D1_SLIP}/print/invoice`)
    const invRow = page.locator('tbody tr').filter({ hasText: MODEL }).first()
    await invRow.waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(800)
    const invQty = num(await invRow.locator('td.col-qty').textContent())
    const invPrice = num(await invRow.locator('td.col-price').textContent())
    const invSupply = num(await invRow.locator('td.col-supply').textContent())
    console.log(`[FIX5-인쇄] 세금계산서: 수량=${invQty} 단가=${invPrice} 공급가액=${invSupply}`)
    await capture(page, 'print-01-tax-invoice')
    expect(invPrice * invQty, '세금계산서 단가 x 수량 == 공급가액').toBe(invSupply)
    expect(invPrice).toBe(100000)

    // 거래명세서 — VAT 포함 도메인. 사용자 입력 단가를 그대로 보인다.
    await page.goto(`${BASE_URL}/sales/${D1_SLIP}/print/statement`)
    const stmRow = page.locator('tbody tr').filter({ hasText: MODEL }).first()
    await stmRow.waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(800)
    const stmUnit = num(await stmRow.locator('td.col-unit').textContent())
    const stmSupply = num(await stmRow.locator('td.col-supply').textContent())
    const stmVat = num(await stmRow.locator('td.col-vat').textContent())
    console.log(`[FIX5-인쇄] 거래명세서: 단가=${stmUnit} 공급=${stmSupply} 부가세=${stmVat}`)
    await capture(page, 'print-02-statement')
    expect(stmUnit, '거래명세서도 사용자 입력 단가를 보인다').toBe(110000)

    // 매입전표 — ⑤ 오염행
    console.log(`[FIX5-인쇄] 매입 전표 DB=${lineRow(PURCHASE_SLIP)}`)
    await page.goto(`${BASE_URL}/purchases/${PURCHASE_SLIP}/print/purchase`)
    const purRow = page.locator('tbody tr').filter({ hasText: MODEL }).first()
    await purRow.waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(800)
    const purQty = num(await purRow.locator('td.col-qty').textContent())
    const purPrice = num(await purRow.locator('td.col-price').textContent())
    const purSupply = num(await purRow.locator('td.col-supply').textContent())
    console.log(`[FIX5-인쇄] 매입전표: 수량=${purQty} 단가=${purPrice} 공급가액=${purSupply}`)
    await capture(page, 'print-03-purchase')
    expect(purPrice * purQty, '매입전표 단가 x 수량 == 공급가액').toBe(purSupply)

    // ⑤ 오염행 사본(copyOf) 세금계산서
    console.log(`[FIX5-인쇄] 사본 DB=${lineRow(COPY_SLIP)}`)
    await page.goto(`${BASE_URL}/sales/${COPY_SLIP}/print/invoice`)
    const copyRow = page.locator('tbody tr').filter({ hasText: MODEL }).first()
    await copyRow.waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(800)
    const copyQty = num(await copyRow.locator('td.col-qty').textContent())
    const copyPrice = num(await copyRow.locator('td.col-price').textContent())
    const copySupply = num(await copyRow.locator('td.col-supply').textContent())
    console.log(`[FIX5-인쇄] 사본 세금계산서: 수량=${copyQty} 단가=${copyPrice} 공급가액=${copySupply}`)
    await capture(page, 'print-04-copy-tax-invoice')
    expect(copyPrice * copyQty, '사본 세금계산서 단가 x 수량 == 공급가액').toBe(copySupply)
    expect(copyPrice).toBe(100000)
  })
})
