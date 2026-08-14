import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * #937 재수렴 4차 라이브QA — 두 단가 컬럼의 세금 도메인 (mock OFF, 실 게이트웨이 :8080 → 실 Postgres).
 *
 * 검증 불변식:
 *  1) 무수정 재저장이 어떤 표시 값도 바꾸지 않는다
 *  2) 인쇄에서 단가 x 수량 == 공급가액 이 성립한다(세금계산서·입고전표), 거래명세서는 단가 x 수량 == 공급가액+부가세
 *  3) 감사 이력이 사용자가 하지 않은 변경을 기록하지 않는다
 *  + ⑤ 두 단가 컬럼이 같은 값(둘 다 VAT 제외)이 된 기존 행에서도 수량 재계산이 옳다
 *
 * throwaway 전용 — 전표는 QA_SALES_SLIP/QA_PURCHASE_SLIP 으로 주입받으며(사전 API 생성),
 * DB 는 그 두 전표의 행만 읽는다. 공유 마스터/가격기억은 건드리지 않는다.
 *
 * 실행:
 *   cd clients/desktop
 *   VITE_API_BASE_URL=http://localhost:8080 VITE_APP_VERSION=2026/07/27-1 \
 *     node_modules/.bin/vite --config playwright/809-price-memory-real-qa/vite.809-realqa.config.ts \
 *     --port 5901 --strictPort
 *   QA_BASE_URL=http://localhost:5901 QA_SALES_SLIP=<uuid> QA_PURCHASE_SLIP=<uuid> \
 *     node_modules/.bin/playwright test --config=playwright.real-qa.config.ts \
 *     playwright/937-r4-unit-price-domain-real-qa/937-r4-unit-price-domain-real-qa.spec.ts
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:5901'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const ACCOUNT = 'dev_manager'
const SALES_SLIP = process.env['QA_SALES_SLIP'] ?? ''
const PURCHASE_SLIP = process.env['QA_PURCHASE_SLIP'] ?? ''
/** 무수정 재저장 전용 전표 — 다른 테스트가 남긴 coedit 문서 상태와 섞이지 않도록 분리한다. */
const NOOP_SLIP = process.env['QA_NOOP_SLIP'] ?? ''
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/937-detail-readonly-fix/r4-fix'))
fs.mkdirSync(SHOTS, { recursive: true })

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

/** 숫자 텍스트만 뽑는다("110,000" → 110000). */
function num(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9.-]/g, ''))
}

test.describe('#937 재수렴 4차 — 단가 세금 도메인 라이브QA', () => {
  test.beforeAll(() => {
    expect(SALES_SLIP, 'QA_SALES_SLIP 미주입').not.toBe('')
    expect(PURCHASE_SLIP, 'QA_PURCHASE_SLIP 미주입').not.toBe('')
    expect(NOOP_SLIP, 'QA_NOOP_SLIP 미주입').not.toBe('')
  })

  test('⑤ 상세 읽기전용 표시 + 수정 진입 + 수량 2→3 재계산', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    const before = lineRow(SALES_SLIP)
    console.log(`[937-R4] 진입 전 DB(unit_price|with_vat|supply|vat|qty)=${before}`)
    expect(before, '전제: ⑤ 상태(두 컬럼 동일 VAT 제외)').toBe('100000.00|100000.00|200000.00|20000.00|2')

    await page.goto(`${BASE_URL}/sales/${SALES_SLIP}`)
    await page.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(1200)
    // 읽기전용 라인 표의 단가 셀 — 단가 x 수량 == 공급가액 + 부가세.
    const roRow = page.locator('table tbody tr').filter({ hasText: 'AR09TXEAAWKNEU-04' }).first()
    const roCells = roRow.locator('td')
    const roUnit = num(await roCells.nth(6).textContent())
    const roSupply = num(await roCells.nth(7).textContent())
    const roVat = num(await roCells.nth(8).textContent())
    const roTotal = num(await roCells.nth(9).textContent())
    console.log(`[937-R4] 읽기전용 표: 단가=${roUnit} 공급=${roSupply} 부가세=${roVat} 합계=${roTotal}`)
    await capture(page, '01-detail-readonly-vat-inclusive-unit-price')
    expect(roUnit, '읽기전용 단가(VAT 포함)').toBe(110000)
    expect(roUnit * 2, '단가 x 수량 == 공급가액 + 부가세').toBe(roSupply + roVat)
    expect(roTotal).toBe(220000)

    // 수정 진입 — 무편집 시점 단가 필드
    await page.getByTestId('sales-slip-edit-button').click()
    const priceField = page.getByLabel('단가(VAT포함) 1')
    await expect(priceField).toBeEnabled({ timeout: 40000 })
    await page.waitForTimeout(1200)
    const hydrated = await priceField.inputValue()
    console.log(`[937-R4] 수정 진입 직후 단가 필드=${hydrated}`)
    await capture(page, '02-edit-modal-hydrated-unit-price')
    expect(num(hydrated), '하이드레이션 단가(VAT 포함)').toBe(110000)

    // 수량 2 → 3
    const qtyField = page.getByLabel('수량 1')
    await qtyField.fill('3')
    await qtyField.blur()
    await page.waitForTimeout(800)
    const supplyField = page.getByLabel('공급가액 1')
    const vatField = page.getByLabel('부가세 1')
    const supplyAfter = num(await supplyField.inputValue())
    const vatAfter = num(await vatField.inputValue())
    console.log(`[937-R4] 수량 2→3 후: 공급=${supplyAfter} 부가세=${vatAfter}`)
    await capture(page, '03-edit-quantity-2-to-3-recalculated')
    expect(supplyAfter, '⑤ 과세표준 9.09% 하락 없음').toBe(300000)
    expect(vatAfter).toBe(30000)
  })

  test('①②③ 무수정 재저장 — 표시·DB·감사 이력 불변', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)

    const before = lineRow(NOOP_SLIP)
    console.log(`[937-R4] 재저장 전 DB=${before}`)
    expect(before, '전제: ⑤ 상태').toBe('100000.00|100000.00|200000.00|20000.00|2')

    await page.goto(`${BASE_URL}/sales/${NOOP_SLIP}`)
    await page.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(1200)
    const beforeUnit = num(await page.locator('table tbody tr').filter({ hasText: 'AR09TXEAAWKNEU-04' }).first().locator('td').nth(6).textContent())
    console.log(`[937-R4] 재저장 전 읽기전용 단가=${beforeUnit}`)
    expect(beforeUnit).toBe(110000)
    await page.getByTestId('sales-slip-edit-button').click()
    await expect(page.getByLabel('단가(VAT포함) 1')).toBeEnabled({ timeout: 40000 })
    await page.waitForTimeout(1500)
    await capture(page, '04-noop-resave-before-save')

    const putPromise = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${NOOP_SLIP}`),
      { timeout: 40000 },
    )
    await page.getByRole('button', { name: '저장', exact: true }).first().click()
    const put = await putPromise
    console.log(`[937-R4] 무수정 재저장 PUT status=${put.status()}`)
    expect(put.status()).toBe(200)
    await page.waitForTimeout(1500)

    const after = lineRow(NOOP_SLIP)
    console.log(`[937-R4] 재저장 후 DB=${after}`)
    // unit_price 는 그대로(100,000), unit_price_with_vat 만 자기 도메인으로 정상화(110,000).
    expect(after).toBe('100000.00|110000.00|200000.00|20000.00|2')

    // 표시 값 불변 — 재저장 후 읽기전용 표
    await page.goto(`${BASE_URL}/sales/${NOOP_SLIP}`)
    await page.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(1200)
    const roRow = page.locator('table tbody tr').filter({ hasText: 'AR09TXEAAWKNEU-04' }).first()
    const roUnit = num(await roRow.locator('td').nth(6).textContent())
    console.log(`[937-R4] 재저장 후 읽기전용 단가=${roUnit}`)
    await capture(page, '05-noop-resave-after-display-unchanged')
    expect(roUnit, '무수정 재저장이 표시 단가를 바꾸지 않는다').toBe(110000)

    // ③ 감사 이력 — 라인 단가 변경이 기록되지 않아야 한다
    const rev = await page.request.get(`${API_BASE}/api/slips/${NOOP_SLIP}/revisions`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const revisions = (await rev.json()).data as Array<{
      revisionNo: number
      revisionType: string
      fieldChanges: Array<{ fieldPath: string; label: string; beforeValue: string | null; afterValue: string | null }>
    }>
    const editUnitPriceChanges = revisions
      .filter((r) => r.revisionType === 'EDIT')
      .flatMap((r) => r.fieldChanges)
      .filter((f) => f.fieldPath.endsWith('.unitPrice'))
    console.log(`[937-R4] EDIT revision 단가 변경 기록=${JSON.stringify(editUnitPriceChanges)}`)
    expect(editUnitPriceChanges, '사용자가 하지 않은 단가 변경이 감사 이력에 없다').toHaveLength(0)
  })

  test('② 세금계산서·입고전표 인쇄 — 단가 x 수량 == 공급가액', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } })
    const page = await ctx.newPage()
    await login(page)

    // 세금계산서 (매출) — 날짜|품목명|규격|수량|단가|공급가액|세액
    await page.goto(`${BASE_URL}/sales/${SALES_SLIP}/print/invoice`)
    const invRow = page.locator('tbody tr').filter({ hasText: 'AR09TXEAAWKNEU-04' }).first()
    await invRow.waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(800)
    const invQty = num(await invRow.locator('td.col-qty').textContent())
    const invPrice = num(await invRow.locator('td.col-price').textContent())
    const invSupply = num(await invRow.locator('td.col-supply').textContent())
    console.log(`[937-R4] 세금계산서: 수량=${invQty} 단가=${invPrice} 공급가액=${invSupply}`)
    await capture(page, '06-print-tax-invoice-unit-price')
    expect(invPrice * invQty, '세금계산서 단가 x 수량 == 공급가액').toBe(invSupply)
    expect(invPrice).toBe(100000)

    // 거래명세서 (매출) — 단가는 VAT 포함 도메인
    await page.goto(`${BASE_URL}/sales/${SALES_SLIP}/print/statement`)
    const stmRow = page.locator('tbody tr').filter({ hasText: 'AR09TXEAAWKNEU-04' }).first()
    await stmRow.waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(800)
    const stmQty = num(await stmRow.locator('td.col-qty').textContent())
    const stmUnit = num(await stmRow.locator('td.col-unit').textContent())
    const stmSupply = num(await stmRow.locator('td.col-supply').textContent())
    const stmVat = num(await stmRow.locator('td.col-vat').textContent())
    console.log(`[937-R4] 거래명세서: 수량=${stmQty} 단가=${stmUnit} 공급=${stmSupply} 부가세=${stmVat}`)
    await capture(page, '07-print-statement-unit-price')
    expect(stmUnit * stmQty, '거래명세서 단가 x 수량 == 공급가액 + 부가세').toBe(stmSupply + stmVat)
    expect(stmUnit).toBe(110000)

    // 입고전표 — ⑤ 상태 그대로(재저장하지 않은 행)
    console.log(`[937-R4] 입고 전표 DB=${lineRow(PURCHASE_SLIP)}`)
    await page.goto(`${BASE_URL}/purchases/${PURCHASE_SLIP}/print/purchase`)
    const purRow = page.locator('tbody tr').filter({ hasText: 'AR09TXEAAWKNEU-04' }).first()
    await purRow.waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(800)
    const purQty = num(await purRow.locator('td.col-qty').textContent())
    const purPrice = num(await purRow.locator('td.col-price').textContent())
    const purSupply = num(await purRow.locator('td.col-supply').textContent())
    console.log(`[937-R4] 입고전표: 수량=${purQty} 단가=${purPrice} 공급가액=${purSupply}`)
    await capture(page, '08-print-purchase-slip-unit-price')
    expect(purPrice * purQty, '입고전표 단가 x 수량 == 공급가액').toBe(purSupply)
    expect(purPrice).toBe(100000)
  })
})
