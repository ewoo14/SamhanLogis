/**
 * #937 재수렴 7차 라이브QA — 버전이력 합계의 세금 도메인 (mock OFF, 실 게이트웨이 :8080 → 실 Postgres).
 *
 * 개발책임자 결정(2026-07-27) <b>A안 — "이력 합계도 VAT 포함으로"</b>.
 *
 * 검증 불변식(재수렴 7차 PM fix 지시):
 *  1) 버전이력 한 행에서 {@code 단가 × 수량 = 합계} 가 성립한다
 *  2) 이력의 "합계" 와 전표 라인 표의 "합계(VAT포함)" 가 같은 값을 말한다
 *  3) FE/BE 미러가 같은 판정을 한다 (R7-2)
 *
 * R7-1 은 throwaway 전표(note '#937-FIX7')로, R7-2 는 <b>실전표 2026/06/24-7 을 읽기 전용으로만</b>
 * 재현한다(그 전표는 금액 3값이 없는 구 스냅샷이라 재현에 반드시 필요하고, 화면 열람은 write 가
 * 없다 — redline anchor 는 send/inspect 상태전이에서만 기록된다).
 *
 * 실행:
 *   cd clients/desktop
 *   VITE_API_BASE_URL=http://localhost:8080 VITE_APP_VERSION=2026/07/27-1 \
 *     node_modules/.bin/vite --config playwright/809-price-memory-real-qa/vite.809-realqa.config.ts \
 *     --port 6240 --strictPort
 *   QA_BASE_URL=http://localhost:6240 QA_FIX7_SLIP=<uuid> \
 *     node_modules/.bin/playwright test --config=playwright.real-qa.config.ts \
 *     playwright/937-fix7-history-total-domain-real-qa/937-fix7-history-total-domain-real-qa.spec.ts
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:6240'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const ACCOUNT = process.env['QA_ACCOUNT'] ?? 'dev_manager'
/** R7-1 — 단가(VAT포함) 100,000 × 2 로 생성한 throwaway 전표. */
const FIX7_SLIP = process.env['QA_FIX7_SLIP'] ?? ''
/** R7-2 — 금액 3값이 없는 구 스냅샷을 가진 실전표 2026/06/24-7 (읽기 전용). */
const LEGACY_REAL_SLIP = process.env['QA_LEGACY_REAL_SLIP'] ?? '371fbae7-2beb-4068-9923-cefeb9fc119e'
const SHOTS = process.env['QA_SHOTS_DIR'] ?? path.resolve(_dirname, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const MODEL = 'AR09TXEAAWKNEU-04'

function psql(sql: string): string {
  const flat = sql.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"')
  return execSync(`docker exec samhan-postgres psql -U samhan -d slip_db -tAc "${flat}"`, {
    encoding: 'utf-8',
  }).trim()
}

/** unit_price|unit_price_with_vat|supply|vat|quantity|unit_price_domain */
function lineRow(slipId: string): string {
  return psql(
    `SELECT unit_price || '|' || unit_price_with_vat || '|' || supply_amount || '|' || vat_amount
       || '|' || quantity || '|' || coalesce(to_jsonb(sl)->>'unit_price_domain', 'NULL')
       FROM slip_lines sl WHERE slip_id='${slipId}' AND is_deleted=false`,
  )
}

async function capture(page: Page, name: string, fullPage = false): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage })
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

/** 숫자 텍스트만 뽑는다("240,000" → 240000). */
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
  await page.getByTestId('slip-version-history-list').first().waitFor({ state: 'visible', timeout: 40000 })
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

/**
 * 버전이력 변경 1줄에서 before/after 를 <b>DOM 구조로</b> 뽑는다.
 *
 * <p>텍스트 전체를 정규식으로 긁으면 라벨("품목 1행")·작성자명의 숫자가 섞인다(실측: "100000"
 * 이 "-1100000" 으로 읽혔다). 렌더 구조는
 * {@code <div><span dot/><span>[<strong actor>] <strong label> <span before/> <span →/> <span after/></span></div>}
 * 이므로 안쪽 wrapper 의 자식 span 3개를 그대로 읽는다.
 */
async function changeValues(row: import('@playwright/test').Locator): Promise<{ before: string; after: string }> {
  const spans = await row.evaluate((el) => {
    const wrap = el.querySelectorAll(':scope > span')[1] as HTMLElement
    return Array.from(wrap.querySelectorAll(':scope > span')).map((s) => s.textContent ?? '')
  })
  return { before: spans[0] ?? '', after: spans[2] ?? '' }
}

/** revisionNo 카드 안의 특정 라인 필드 변경 줄. */
function changeRow(page: Page, revisionNo: number, field: string) {
  return page.getByTestId(`slip-version-history-changes-${revisionNo}`)
    .getByTestId(`slip-version-history-change-lines-0-${field}`)
}

test.describe('#937 재수렴 7차 — 버전이력 합계 세금 도메인 라이브QA', () => {
  test.beforeAll(() => {
    expect(FIX7_SLIP, 'QA_FIX7_SLIP 미주입').not.toBe('')
  })

  test('R7-1 — 단가만 수정하면 이력 합계가 표의 합계(VAT포함)와 같은 값이 되고 단가×수량=합계 가 성립한다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1560, height: 1100 } })
    const page = await ctx.newPage()
    await login(page)

    // 1단계 — 생성 직후: 단가(VAT포함) 100,000 × 2 → S=181,818 / V=18,182
    const step1 = lineRow(FIX7_SLIP)
    console.log(`[FIX7-R7-1] 1단계 DB=${step1}`)
    expect(step1).toBe('90909.00|100000.00|181818.00|18182.00|2|VAT_INCLUSIVE')

    await openDetail(page, FIX7_SLIP)
    await capture(page, 'r71-01-detail-before-edit', true)

    // 2단계 — 단가만 120,000 으로 수정
    await openEditModal(page)
    const priceField = page.getByLabel('단가(VAT포함) 1')
    expect(num(await priceField.inputValue())).toBe(100000)
    await priceField.fill('120000')
    await priceField.blur()
    await page.waitForTimeout(800)
    await capture(page, 'r71-02-edit-price-120000')
    expect(await saveModal(page, FIX7_SLIP)).toBe(200)

    const step2 = lineRow(FIX7_SLIP)
    console.log(`[FIX7-R7-1] 2단계 저장 후 DB=${step2}`)
    expect(step2).toBe('109090.50|120000.00|218181.00|21819.00|2|VAT_INCLUSIVE')

    // 3단계 — 재열기: 전표 라인 표
    await openDetail(page, FIX7_SLIP)
    const cells = readonlyCells(page)
    const tableQty = num(await cells.nth(5).textContent())
    const tableUnit = num(await cells.nth(6).textContent())
    const tableSupply = num(await cells.nth(7).textContent())
    const tableVat = num(await cells.nth(8).textContent())
    const tableTotal = num(await cells.nth(9).textContent())
    console.log(`[FIX7-R7-1] 3단계 표: 수량=${tableQty} 단가=${tableUnit} 공급=${tableSupply} 부가세=${tableVat} 합계=${tableTotal}`)
    expect(tableQty).toBe(2)
    expect(tableUnit).toBe(120000)
    expect(tableSupply).toBe(218181)
    expect(tableVat).toBe(21819)
    expect(tableTotal).toBe(240000)

    // 4단계 — 같은 화면의 버전 이력 (revision 2 = 단가 수정)
    const historyUnit = changeRow(page, 2, 'unitPrice')
    const historyTotal = changeRow(page, 2, 'lineTotal')
    await expect(historyUnit).toBeVisible({ timeout: 20000 })
    await expect(historyTotal).toBeVisible({ timeout: 20000 })
    const u = await changeValues(historyUnit)
    const t = await changeValues(historyTotal)
    console.log(`[FIX7-R7-1] 4단계 이력 rev2 단가 = ${u.before} → ${u.after}`)
    console.log(`[FIX7-R7-1] 4단계 이력 rev2 합계 = ${t.before} → ${t.after}`)

    // 표와 이력이 한 화면에 함께 보이는 캡처
    await capture(page, 'r71-03-table-and-history-one-screen', true)

    expect(num(u.before)).toBe(100000)
    expect(num(u.after)).toBe(120000)
    // RED(수정 전): 181818 → 218181 — 표 헤더 "합계(VAT포함) 240,000" 과 같은 단어로 다른 값.
    expect(num(t.before), '불변식 2 — 이력 합계 = 표의 합계(VAT포함)').toBe(200000)
    expect(num(t.after), '불변식 2 — 이력 합계 = 표의 합계(VAT포함)').toBe(240000)
    expect(num(t.after)).toBe(tableTotal)
    // 불변식 1 — 단가 × 수량 = 합계
    expect(num(u.after) * tableQty).toBe(num(t.after))
    expect(num(u.before) * tableQty).toBe(num(t.before))

    // 최초 revision(CREATE)도 같은 도메인으로 기록된다 — 비움 → 100,000 / 비움 → 200,000
    const c1 = await changeValues(changeRow(page, 1, 'unitPrice'))
    const c2 = await changeValues(changeRow(page, 1, 'lineTotal'))
    console.log(`[FIX7-R7-1] 5단계 이력 rev1 단가 = ${c1.before} → ${c1.after} · 합계 = ${c2.before} → ${c2.after}`)
    expect(num(c1.after)).toBe(100000)
    expect(num(c2.after), 'RED(수정 전): 181818').toBe(200000)

    await ctx.close()
  })

  test('R7-2 — 금액 3값이 없는 실전표(2026/06/24-7)의 이력에 하지 않은 단가 변경이 없다', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1560, height: 1100 } })
    const page = await ctx.newPage()
    await login(page)

    // 이 전표는 읽기 전용으로만 다룬다 — 편집/저장을 하지 않는다.
    const snapshots = psql(
      `SELECT string_agg(revision_no || ':' || coalesce(l->>'supplyAmount','NULL') || '/' ||
                         coalesce(l->>'vatAmount','NULL') || '/' || coalesce(l->>'unitPriceWithVat','NULL'), ' ')
         FROM (SELECT revision_no, jsonb_array_elements(snapshot->'lines') AS l
                 FROM slip_revisions WHERE slip_id='${LEGACY_REAL_SLIP}' ORDER BY revision_no) t`,
    )
    console.log(`[FIX7-R7-2] 리비전별 (supply/vat/upwv) = ${snapshots}`)

    await page.goto(`${BASE_URL}/sales/${LEGACY_REAL_SLIP}`)
    await page.getByTestId('slip-version-history-list').first().waitFor({ state: 'visible', timeout: 40000 })
    await page.waitForTimeout(1500)
    await capture(page, 'r72-01-legacy-real-slip-history', true)

    // RED(수정 전): rev 4 에 "품목 1행 단가 100000 → 110000" 이 새로 생겼다(main 에는 없음).
    for (const rev of [2, 3, 4, 5]) {
      const card = page.getByTestId(`slip-version-history-changes-${rev}`)
      const rows = card.locator('[data-testid^="slip-version-history-change-lines-"]')
      const n = await card.count() === 0 ? 0 : await rows.count()
      for (let i = 0; i < n; i += 1) {
        console.log(`[FIX7-R7-2] rev${rev} 잔존 라인 변경 = "${((await rows.nth(i).textContent()) ?? '').trim()}"`)
      }
      expect(n, `불변식 3 — rev${rev} 에 사용자가 하지 않은 라인 변경이 없다`).toBe(0)
    }

    // 표가 보이는 값과 이력이 같은 도메인인지 대조 — 단가/합계 모두 110,000.
    const cells = page.locator('table tbody tr').first().locator('td')
    console.log(`[FIX7-R7-2] 표 단가=${num(await cells.nth(6).textContent())} 합계=${num(await cells.nth(9).textContent())}`)
    expect(num(await cells.nth(6).textContent())).toBe(110000)
    expect(num(await cells.nth(9).textContent())).toBe(110000)

    // 최초 revision(CREATE)은 전 필드를 "비움 → 값"으로 남긴다 — 화면과 같은 VAT 포함 값이어야 한다.
    const create = await changeValues(changeRow(page, 1, 'unitPrice'))
    const createTotal = await changeValues(changeRow(page, 1, 'lineTotal'))
    console.log(`[FIX7-R7-2] rev1 단가 = ${create.before} → ${create.after} · 합계 = ${createTotal.before} → ${createTotal.after}`)
    expect(num(create.after), '표가 보이는 단가와 같은 값').toBe(110000)
    expect(num(createTotal.after), '표가 보이는 합계(VAT포함)와 같은 값').toBe(110000)

    await ctx.close()
  })
})
