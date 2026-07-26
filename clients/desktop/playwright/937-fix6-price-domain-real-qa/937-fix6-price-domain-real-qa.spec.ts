/**
 * #937 재수렴 6차 라이브QA — 저장 시점 단가 도메인 기록(A안) (mock OFF, 실 게이트웨이 :8080 → 실 Postgres).
 *
 * 개발책임자 결정 A안: {@code slip_lines.unit_price_domain} 에 "이 단가가 어느 도메인의 사용자
 * 입력인가"를 저장해, 이후 생성되는 행은 휴리스틱 판정 없이 해석한다. legacy 행(도메인 NULL)만
 * 현행 휴리스틱을 유지한다.
 *
 * 검증 불변식(재수렴 6차 PM fix 지시):
 *  1) 사용자가 입력한 단가는 어느 편집 경로에서도 소멸하지 않는다
 *  2) 무수정 재저장이 어떤 표시 값도 바꾸지 않는다
 *  3) 같은 전표가 두 화면에서 다른 단가를 보이지 않는다
 *  4) 이후 저장되는 행은 휴리스틱 판정 없이 정확하다
 *
 * throwaway 전용 — 전표는 QA_* 환경변수로 주입받으며(사전 API 생성) 거래처를 붙이지 않는다
 * (partnerId=null → collectPriceMemory 早期 return → 공유 가격기억 테이블 write 0건).
 *
 * 실행:
 *   cd clients/desktop
 *   VITE_API_BASE_URL=http://localhost:8080 VITE_APP_VERSION=2026/07/27-1 \
 *     node_modules/.bin/vite --config playwright/809-price-memory-real-qa/vite.809-realqa.config.ts \
 *     --port 6140 --strictPort
 *   QA_BASE_URL=http://localhost:6140 QA_D1R6_SLIP=<uuid> QA_D1R6B_SLIP=<uuid> QA_LEGACY_SLIP=<uuid> \
 *     node_modules/.bin/playwright test --config=playwright.real-qa.config.ts \
 *     playwright/937-fix6-price-domain-real-qa/937-fix6-price-domain-real-qa.spec.ts
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:6140'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const ACCOUNT = process.env['QA_ACCOUNT'] ?? 'dev_manager'
/** D-1R6 — 단가 100,000(VAT포함) 입력 후 공급가액·부가세를 "부가세 별도"로 정정한 전표. */
const D1R6_SLIP = process.env['QA_D1R6_SLIP'] ?? ''
/** D-1R6B — 같은 좌표를 API PUT 으로만 만들어 coedit Y.Doc 이 존재한 적 없는 전표. */
const D1R6B_SLIP = process.env['QA_D1R6B_SLIP'] ?? ''
/** legacy — 도메인 기록이 없는(NULL) 구 저장 행. 현행 휴리스틱 유지 확인용. */
const LEGACY_SLIP = process.env['QA_LEGACY_SLIP'] ?? ''
const SHOTS = process.env['QA_SHOTS_DIR'] ?? path.resolve(_dirname, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const MODEL = 'AR09TXEAAWKNEU-04'

function psql(sql: string): string {
  const flat = sql.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"')
  return execSync(`docker exec samhan-postgres psql -U samhan -d slip_db -tAc "${flat}"`, {
    encoding: 'utf-8',
  }).trim()
}

/**
 * unit_price|unit_price_with_vat|supply|vat|quantity|unit_price_domain
 *
 * 🚨 도메인 컬럼은 {@code to_jsonb(sl)->>'unit_price_domain'} 으로 읽는다 — 컬럼이 아직 없는
 * 스키마(마이그레이션 적용 전 RED 실행)에서도 SQL 오류 대신 {@code NULL} 을 돌려주어, RED 가
 * "SQL 에러"가 아니라 <b>결함 값 그 자체</b>를 보이게 한다.
 */
function lineRow(slipId: string): string {
  return psql(
    `SELECT unit_price || '|' || unit_price_with_vat || '|' || supply_amount || '|' || vat_amount
       || '|' || quantity || '|' || coalesce(to_jsonb(sl)->>'unit_price_domain', 'NULL')
       FROM slip_lines sl WHERE slip_id='${slipId}' AND is_deleted=false`,
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

test.describe('#937 재수렴 6차 — 저장 시점 단가 도메인 기록 라이브QA', () => {
  test.beforeAll(() => {
    expect(D1R6_SLIP, 'QA_D1R6_SLIP 미주입').not.toBe('')
    expect(D1R6B_SLIP, 'QA_D1R6B_SLIP 미주입').not.toBe('')
    expect(LEGACY_SLIP, 'QA_LEGACY_SLIP 미주입').not.toBe('')
  })

  test('D-1R6 — "부가세 별도" 정정 후에도 사용자 입력 단가 100,000 이 두 화면에서 그대로다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    // 1단계 — 단가(VAT포함) 100,000 · 수량 2 → BE 분해 S=181,818 / V=18,182
    const step1 = lineRow(D1R6_SLIP)
    console.log(`[FIX6-D1R6] 1단계 DB=${step1}`)
    expect(step1.startsWith('90909.00|100000.00|181818.00|18182.00|2')).toBeTruthy()

    await openDetail(page, D1R6_SLIP)
    await capture(page, 'd1r6-01-detail-before-edit')

    // 2~3단계 — 공급가액 200,000 · 부가세 20,000 ("부가세 별도" 정정, 단가 무편집)
    await openEditModal(page)
    const priceBefore = await page.getByLabel('단가(VAT포함) 1').inputValue()
    console.log(`[FIX6-D1R6] 2단계 진입 단가 필드=${priceBefore}`)
    expect(num(priceBefore)).toBe(100000)

    const supplyField = page.getByLabel('공급가액 1')
    await supplyField.fill('200000')
    await supplyField.blur()
    await page.waitForTimeout(600)
    const vatField = page.getByLabel('부가세 1')
    await vatField.fill('20000')
    await vatField.blur()
    await page.waitForTimeout(800)
    const priceAfterEdit = await page.getByLabel('단가(VAT포함) 1').inputValue()
    console.log(`[FIX6-D1R6] 3단계 편집 후 단가 필드=${priceAfterEdit}`)
    await capture(page, 'd1r6-02-edit-supply-vat-price-kept')
    expect(num(priceAfterEdit), 'P4 — 공급가액·부가세 편집이 단가를 역산하지 않는다').toBe(100000)

    // 4단계 — 저장 후 DB
    expect(await saveModal(page, D1R6_SLIP)).toBe(200)
    const step4 = lineRow(D1R6_SLIP)
    console.log(`[FIX6-D1R6] 4단계 저장 후 DB=${step4}`)
    expect(step4, '저장 시점에 도메인이 기록된다(A안)')
      .toBe('100000.00|100000.00|200000.00|20000.00|2|VAT_INCLUSIVE')

    // 5단계 — 재열기 읽기전용 표
    await openDetail(page, D1R6_SLIP)
    const cells = readonlyCells(page)
    const roUnit = num(await cells.nth(6).textContent())
    const roSupply = num(await cells.nth(7).textContent())
    const roVat = num(await cells.nth(8).textContent())
    console.log(`[FIX6-D1R6] 5단계 읽기전용 표: 단가=${roUnit} 공급=${roSupply} 부가세=${roVat}`)
    await capture(page, 'd1r6-03-readonly-after-reopen')
    // RED(수정 전): 110000 — 휴리스틱이 "저장단가 x 수량 = 공급가액"을 오염 신호로 읽었다.
    expect(roUnit, '불변식 1 — 사용자가 입력한 단가').toBe(100000)
    expect(roSupply).toBe(200000)
    expect(roVat).toBe(20000)

    // 6단계 — 수정 모달 하이드레이션(같은 세션·Y.Doc 있음)
    await openEditModal(page)
    const hydrated = num(await page.getByLabel('단가(VAT포함) 1').inputValue())
    console.log(`[FIX6-D1R6] 6단계 수정 모달 하이드레이션 단가=${hydrated}`)
    await capture(page, 'd1r6-04-edit-modal-hydration')
    expect(hydrated, '불변식 3 — 두 화면 단가 일치').toBe(roUnit)
    expect(hydrated).toBe(100000)

    // 7단계 — 무편집 재저장
    expect(await saveModal(page, D1R6_SLIP)).toBe(200)
    const step7 = lineRow(D1R6_SLIP)
    console.log(`[FIX6-D1R6] 7단계 무편집 재저장 후 DB=${step7}`)
    expect(step7, '불변식 2 — 무수정 재저장이 저장값을 바꾸지 않는다').toBe(step4)

    await openDetail(page, D1R6_SLIP)
    const roUnitAfter = num(await readonlyCells(page).nth(6).textContent())
    console.log(`[FIX6-D1R6] 7단계 재저장 후 읽기전용 단가=${roUnitAfter}`)
    await capture(page, 'd1r6-05-readonly-after-noop-resave')
    expect(roUnitAfter).toBe(roUnit)
  })

  test('D-1R6B — Y.Doc 없는 진입(다른 담당자·다른 PC)도 사용자 단가를 지우지 않는다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)

    const before = lineRow(D1R6B_SLIP)
    console.log(`[FIX6-D1R6B] 진입 전 DB=${before}`)
    expect(before).toBe('100000.00|100000.00|200000.00|20000.00|2|VAT_INCLUSIVE')

    await openDetail(page, D1R6B_SLIP)
    const roUnit = num(await readonlyCells(page).nth(6).textContent())
    console.log(`[FIX6-D1R6B] 읽기전용 표 단가=${roUnit}`)
    await capture(page, 'd1r6b-01-readonly')
    expect(roUnit).toBe(100000)

    await openEditModal(page)
    const hydrated = num(await page.getByLabel('단가(VAT포함) 1').inputValue())
    console.log(`[FIX6-D1R6B] Y.Doc 미생성 첫 하이드레이션 단가=${hydrated}`)
    await capture(page, 'd1r6b-02-first-hydration')
    expect(hydrated, 'Y.Doc 없이도 사용자 입력 단가를 싣는다').toBe(100000)

    expect(await saveModal(page, D1R6B_SLIP)).toBe(200)
    const after = lineRow(D1R6B_SLIP)
    console.log(`[FIX6-D1R6B] 무편집 재저장 후 DB=${after}`)
    expect(after, '사용자 입력이 영구 소멸하지 않는다').toBe(before)

    // 감사 이력(레드라인) — 사용자가 하지 않은 단가 변경이 없다
    const res = await page.request.get(`${API_BASE}/api/slips/${D1R6B_SLIP}/redline`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    expect(res.ok(), `레드라인 조회 실패: HTTP ${res.status()}`).toBeTruthy()
    const redline = (await res.json()).data as {
      fields: Array<{ fieldPath: string; label: string; layers: Array<{ value: string }> }>
    }
    const unitPriceFields = redline.fields.filter((f) => f.fieldPath.endsWith('.unitPrice'))
    console.log(`[FIX6-D1R6B] 레드라인 단가 필드=${JSON.stringify(unitPriceFields)}`)
    expect(unitPriceFields, '사용자가 하지 않은 단가 변경이 감사 이력에 없다').toHaveLength(0)
    await capture(page, 'd1r6b-03-detail-redline')
  })

  test('⑦ 버전이력 — 단가 이력이 화면(VAT 포함)과 같은 도메인으로 기록된다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)

    const res = await page.request.get(`${API_BASE}/api/v1/slips/${D1R6_SLIP}/revisions`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    expect(res.ok(), `버전이력 조회 실패: HTTP ${res.status()}`).toBeTruthy()
    // fieldChanges 는 changeSummary 안이 아니라 응답 최상위 필드다(SlipRevisionResponse).
    const revisions = (await res.json()).data as Array<{
      revisionNo: number
      revisionType: string
      fieldChanges?: Array<{ fieldPath: string; label: string; beforeValue: string | null; afterValue: string | null }>
    }>
    const unitPriceChanges = revisions
      .slice()
      .sort((a, b) => a.revisionNo - b.revisionNo)
      .flatMap((r) =>
        (r.fieldChanges ?? [])
          .filter((f) => f.fieldPath.endsWith('.unitPrice'))
          .map((f) => `rev${r.revisionNo}:${f.beforeValue}→${f.afterValue}`),
      )
    console.log(`[FIX6-⑦] 버전이력 단가 변경=${JSON.stringify(unitPriceChanges)}`)
    // RED(수정 전): rev1 null→100000(=S÷Q 90909 가 아닌 구 의미) · rev2 100000→110000(하지 않은 변경).
    // 사용자는 단가를 100,000 으로 한 번 입력하고 이후 건드리지 않았다.
    expect(unitPriceChanges).toEqual(['rev1:null→100000'])

    const redlineRes = await page.request.get(`${API_BASE}/api/slips/${D1R6_SLIP}/redline`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const redline = (await redlineRes.json()).data as {
      fields: Array<{ fieldPath: string; layers: Array<{ value: string }> }>
    }
    const redlineUnit = redline.fields.filter((f) => f.fieldPath.endsWith('.unitPrice'))
    console.log(`[FIX6-⑦] 레드라인 단가=${JSON.stringify(redlineUnit)}`)
    expect(redlineUnit, '레드라인과 버전이력이 같은 도메인').toHaveLength(0)

    await openDetail(page, D1R6_SLIP)
    await capture(page, 'r7-01-detail-version-history')
  })

  test('legacy 회귀 — 도메인 기록이 없는 구 행은 현행 휴리스틱을 그대로 유지한다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    const before = lineRow(LEGACY_SLIP)
    console.log(`[FIX6-LEGACY] 진입 전 DB=${before}`)
    expect(before, '전제: 도메인 NULL 인 구 오염 행')
      .toBe('100000.00|100000.00|200000.00|20000.00|2|NULL')

    await openDetail(page, LEGACY_SLIP)
    const cells = readonlyCells(page)
    const roUnit = num(await cells.nth(6).textContent())
    const roSupply = num(await cells.nth(7).textContent())
    const roVat = num(await cells.nth(8).textContent())
    console.log(`[FIX6-LEGACY] 읽기전용 단가=${roUnit} 공급=${roSupply} 부가세=${roVat}`)
    await capture(page, 'legacy-01-readonly-derived')
    expect(roUnit, 'legacy 행은 현행 휴리스틱(권위 합계에서 유도)').toBe(110000)
    expect(roUnit * 2).toBe(roSupply + roVat)

    await openEditModal(page)
    const hydrated = num(await page.getByLabel('단가(VAT포함) 1').inputValue())
    console.log(`[FIX6-LEGACY] 하이드레이션 단가=${hydrated}`)
    await capture(page, 'legacy-02-modal-derived')
    expect(hydrated, '불변식 3 — 두 화면 일치').toBe(roUnit)
  })
})
