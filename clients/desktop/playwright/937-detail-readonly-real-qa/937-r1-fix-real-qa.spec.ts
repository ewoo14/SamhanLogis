import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * #937 fix 라운드 라이브QA — 1차 적대검증(OPUS) 발견 1·2·3 근본수정 검증.
 *
 * 적대검증 원문 4단계 조작을 실 게이트웨이(:8080)·실 Postgres·격리 렌더러(:5207, mock OFF)로
 * 재현한다. throwaway 매출 전표 1건을 raw API 로 생성해(공유 마스터는 조회만 — 거래처/품목은
 * 기존 활성 행을 참조) 사용하고, 마지막에 soft-delete 로 정리한다.
 *
 * 1) 매출 전표 상세 → [수정]. 라인: 단가 100,000 / 공급 200,000 / 부가세 20,000 / 합계 220,000
 * 2) 단가만 60,000 으로 변경 → [저장] → payload 관찰 → DB 값 확인(120,000/12,000 기대)
 * 3) 같은 전표 재열기 → 화면이 DB 값(120,000/12,000)과 일치하는지 확인(발견 1 핵심)
 * 4) 아무것도 고치지 않고 [저장] → payload·DB 불변 확인(E1)
 * 추가: 수량 2→3 변경 시 화면 금액이 즉시 바뀌는지(E3, 발견 2) · 금액 입력 거부(E4, 발견 3)
 *       · BE 가 음수 공급가액을 거부하는지(raw PUT).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:5207'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const ACCOUNT = 'dev_manager'

// 재수렴 4차(#937): 다른 두 #937 real-qa 스펙과 같이 QA_SHOTS_DIR 를 존중한다 —
// 재실행이 커밋된 R1 라운드 증거를 덮어쓰지 않게 한다.
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/937-detail-readonly-fix/r1-fix'))
fs.mkdirSync(SHOTS, { recursive: true })

// 기존 활성 거래처/품목/창고(조회만 — 신규 생성 없음). partner_db/product_db/inventory_db 직접 SELECT 로 확인.
const PARTNER_ID = 'a1b2c3d4-0001-0001-0001-000000000001' // (주)한국냉동물류
const PRODUCT_ID = 'd7f488a5-6259-379c-8035-ed551e75a102' // 삼성 윈드프리 9평형
const WAREHOUSE_ID = '11111111-1111-1111-1111-000000000001' // 본사창고 (출고전표 sourceWarehouseId 필수)

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: ACCOUNT, password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? ACCOUNT }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
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
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

function authHeaders(auth: LoginResult): Record<string, string> {
  return { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

/** slip_db 를 직접 SELECT 한다(docker exec — 읽기전용 확인용). */
function queryDb(sql: string): string {
  return execSync(
    `docker exec samhan-postgres psql -U samhan -d slip_db -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' },
  ).trim()
}

/**
 * 활성(is_deleted=false) 라인 1건을 slip_id 로 조회한다.
 *
 * <p>🔑 실측(#937 R1 라이브QA) — BE 매출 PUT 은 lineId 계약이 있어도 라인 row 를 <b>제자리
 * 수정하지 않는다</b>. 요청마다 기존 라인을 soft-delete 하고 <b>새 UUID 행을 삽입</b>한다
 * (SlipUpdateRequest.LineRequest 자바독 "기존 라인은 soft-delete 되고 본 요청 라인으로 전체
 * 교체된다" 그대로). 그래서 최초 생성 시점의 lineId 로 재조회하면 그 행은 이미
 * is_deleted=true 인 "예전" 값(수정 전 원본)을 계속 들고 있어, "무수정 재저장이 DB 를
 * 되돌렸다"는 거짓 신호를 낸다 — slip_id + is_deleted=false 로 <b>현재 활성 행</b>을 찾아야
 * 한다.
 */
function queryActiveLine(slipId: string): { supply: string; vat: string; unitPrice: string } {
  const row = queryDb(
    `SELECT supply_amount, vat_amount, unit_price FROM slip_lines WHERE slip_id = '${slipId}' AND is_deleted = false;`,
  )
  const [supply, vat, unitPrice] = row.split('|')
  return { supply: (supply ?? '').trim(), vat: (vat ?? '').trim(), unitPrice: (unitPrice ?? '').trim() }
}

test.describe.serial('#937 fix 라운드 — 발견 1·2·3 라이브 재검증', () => {
  let auth: LoginResult
  let slipId = ''
  let updatedAt = ''

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    auth = await realLogin(page)

    // throwaway 매출 전표 생성 — 단가 100,000(VAT 제외 공급단가 계약, priceVatInclusive 미지정)
    // × 수량 2 → 공급 200,000 / 부가세 20,000 / 합계 220,000 (적대검증 원문 1단계 전제와 동일).
    const createRes = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'OUTBOUND',
        partnerId: PARTNER_ID,
        sourceWarehouseId: WAREHOUSE_ID,
        memo: '#937-R1-fix-live-qa-throwaway',
        lines: [{ productId: PRODUCT_ID, productName: '삼성 윈드프리 9평형', quantity: 2, unitPrice: '100000' }],
      },
    })
    expect(createRes.ok(), `throwaway 전표 생성 실패: ${createRes.status()} ${await createRes.text()}`).toBeTruthy()
    const created = (await createRes.json()).data
    slipId = created.id
    updatedAt = created.updatedAt
    // BE 응답의 lineTotal 은 legacy 계약상 VAT 미포함 공급가액이다(=supplyAmount) — 별도 grand-total 필드 아님.
    expect(String(created.lines[0].supplyAmount)).toBe('200000')
    expect(String(created.lines[0].vatAmount)).toBe('20000')
    expect(String(created.lines[0].lineTotal)).toBe('200000')
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    if (!slipId) return
    const page = await browser.newPage()
    const delRes = await page.request.delete(`${API_BASE}/slips/${slipId}/sales`, {
      headers: authHeaders(auth),
      data: { updatedAt },
    })
    // 이미 4단계에서 updatedAt 이 바뀌었을 수 있으니 최신값으로 재조회 후 재시도한다.
    if (!delRes.ok()) {
      const fresh = await page.request.get(`${API_BASE}/slips/${slipId}`, { headers: authHeaders(auth) })
      const freshData = (await fresh.json()).data
      const retry = await page.request.delete(`${API_BASE}/slips/${slipId}/sales`, {
        headers: authHeaders(auth),
        data: { updatedAt: freshData.updatedAt },
      })
      expect(retry.ok(), `cleanup soft-delete 실패: ${retry.status()} ${await retry.text()}`).toBeTruthy()
    }
    await page.close()
  })

  test('01: 1~4단계 — 단가만 변경 후 재열기·무수정 재저장이 서버 값을 되돌리지 않는다(E1·E2)', async ({ page }) => {
    await installAuthStub(page, auth)
    await page.goto(`${BASE_URL}/#/sales/${slipId}`)
    await expect(page.getByTestId('sales-slip-edit-button')).toBeVisible({ timeout: 15000 })

    // 1단계 — 수정 진입, 초기 라인 확인.
    await page.getByTestId('sales-slip-edit-button').click()
    const unitPriceInput = page.getByLabel(/^단가\(VAT/).first()
    const supplyInput = page.getByLabel('공급가액 1')
    const vatInput = page.getByLabel('부가세 1')
    // 재수렴 3차(#937 U1) 이후 이 필드는 VAT 포함 단가다 — 공급 200,000 + 부가세 20,000 = 220,000,
    // 수량 2 → 110,000. (이 스펙이 작성된 22ffc509d 시점의 '100,000'(VAT 제외)은 U1 이 폐기한 계약이다.)
    await expect(unitPriceInput).toHaveValue('110000', { timeout: 15000 })
    await expect(supplyInput).toHaveValue('200000')
    await expect(vatInput).toHaveValue('20000')
    await capture(page, '01-step1-initial-110000-200000-20000')

    // 2단계 — 단가만 60,000(VAT 포함) 으로 변경 → 저장. payload 를 가로챈다.
    // 합계 = 60,000 x 2 = 120,000 → 공급 = 120,000 ÷ 1.1 절사 = 109,090, 부가세 = 10,910
    // (생성 화면 SlipFormPage 의 PRICE 권위 분리와 같은 공식).
    await unitPriceInput.fill('')
    await unitPriceInput.fill('60000')
    await expect(supplyInput).toHaveValue('109090') // E2 — 화면이 즉시 정책대로 재계산(생성 화면과 동일 정책)
    await expect(vatInput).toHaveValue('10910')
    await capture(page, '02-step2-unitprice-60000-screen-recalculated')

    const [putReq1, putRes1] = await Promise.all([
      page.waitForRequest((req) => req.url().includes(`/slips/${slipId}/sales`) && req.method() === 'PUT'),
      page.waitForResponse((res) => res.url().includes(`/slips/${slipId}/sales`) && res.request().method() === 'PUT'),
      page.getByTestId('sales-slip-edit-save').click(),
    ])
    const payload2 = putReq1.postDataJSON()
    fs.writeFileSync(path.join(SHOTS, '02-step2-payload.json'), JSON.stringify(payload2, null, 2))
    const responseBody2 = await putRes1.text().catch(() => '')
    fs.writeFileSync(path.join(SHOTS, '02-step2-response.json'), JSON.stringify({ status: putRes1.status(), body: responseBody2 }, null, 2))
    expect(putRes1.ok(), `저장 PUT 실패: ${putRes1.status()} ${responseBody2}`).toBeTruthy()

    await page.waitForTimeout(1500) // 저장 완료 대기
    const dbAfterStep2 = queryActiveLine(slipId)
    fs.writeFileSync(path.join(SHOTS, '02-step2-db.txt'), JSON.stringify(dbAfterStep2, null, 2))
    expect(dbAfterStep2.supply).toBe('109090.00')
    expect(dbAfterStep2.vat).toBe('10910.00')
    // 재수렴 4차(#937): VAT 제외 단가 컬럼은 공급가액에서 유도된다 — 109,090 / 2 = 54,545.
    expect(dbAfterStep2.unitPrice).toBe('54545.00')

    // 3단계 — 같은 전표를 재열기(새 페이지 reload = 새 컴포넌트 마운트).
    await page.reload()
    await expect(page.getByTestId('sales-slip-edit-button')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('sales-slip-edit-button').click()
    const supplyInputReopen = page.getByLabel('공급가액 1')
    const vatInputReopen = page.getByLabel('부가세 1')
    await capture(page, '03-step3-reopened-should-match-db-109090-10910')
    // ★ 근본수정 검증 — 재열기 화면이 DB 값과 일치해야 한다(fix 이전엔 stale 200000/20000 이었다).
    await expect(supplyInputReopen).toHaveValue('109090', { timeout: 15000 })
    await expect(vatInputReopen).toHaveValue('10910')
    // 재수렴 4차(#937): 재열기 단가 필드는 입력값 60,000 을 끝수 없이 되돌려준다((109,090+10,910)/2).
    await expect(page.getByLabel(/^단가\(VAT/).first()).toHaveValue('60000')

    // 4단계 — 아무것도 고치지 않고 저장.
    const [putReq2, putRes2] = await Promise.all([
      page.waitForRequest((req) => req.url().includes(`/slips/${slipId}/sales`) && req.method() === 'PUT'),
      page.waitForResponse((res) => res.url().includes(`/slips/${slipId}/sales`) && res.request().method() === 'PUT'),
      page.getByTestId('sales-slip-edit-save').click(),
    ])
    const payload4 = putReq2.postDataJSON()
    fs.writeFileSync(path.join(SHOTS, '04-step4-noop-resave-payload.json'), JSON.stringify(payload4, null, 2))
    expect(putRes2.ok(), `4단계 저장 PUT 실패: ${putRes2.status()}`).toBeTruthy()

    await page.waitForTimeout(1500)
    const dbAfterStep4 = queryActiveLine(slipId)
    fs.writeFileSync(path.join(SHOTS, '04-step4-db.txt'), JSON.stringify(dbAfterStep4, null, 2))
    // ★ E1 핵심 — 무수정 재저장이 DB 를 200000/20000 으로 되돌리지 않는다.
    expect(dbAfterStep4.supply).toBe('109090.00')
    expect(dbAfterStep4.vat).toBe('10910.00')
    // 재수렴 4차(#937): 무수정 재저장이 단가 컬럼도 바꾸지 않는다.
    expect(dbAfterStep4.unitPrice).toBe('54545.00')
    await capture(page, '04-step4-after-noop-resave')
  })

  test('02: 수량 2→3 변경 시 화면 금액이 즉시 바뀐다(E3, 발견 2)', async ({ page }) => {
    await installAuthStub(page, auth)
    await page.goto(`${BASE_URL}/#/sales/${slipId}`)
    await expect(page.getByTestId('sales-slip-edit-button')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('sales-slip-edit-button').click()

    const qtyInput = page.getByLabel('수량 1')
    const supplyInput = page.getByLabel('공급가액 1')
    await expect(supplyInput).toHaveValue('109090', { timeout: 15000 }) // 이전 테스트가 남긴 DB 상태(단가 60,000)

    await qtyInput.fill('')
    await qtyInput.fill('3')
    await capture(page, '05-quantity-2-to-3-screen')
    // 단가 60,000(VAT 포함, 고정) × 수량 3 = 180,000 → 공급 163,636 / 부가세 16,364.
    // 기하급수 폭증(BLOCKING-1 계열) 아니고, 불변(발견2 이전 버그) 아니다.
    await expect(supplyInput).toHaveValue('163636')
    await expect(page.getByLabel('부가세 1')).toHaveValue('16364')
  })

  test('03: 금액 입력 거부 — -3·2.7·1e3 (E4, 발견 3)', async ({ page }) => {
    await installAuthStub(page, auth)
    await page.goto(`${BASE_URL}/#/sales/${slipId}`)
    await expect(page.getByTestId('sales-slip-edit-button')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('sales-slip-edit-button').click()

    const supplyInput = page.getByLabel('공급가액 1')
    await expect(supplyInput).toBeVisible({ timeout: 15000 })
    const before = await supplyInput.inputValue()

    // .fill(raw) 는 입력칸 전체를 대체하므로 선행 .fill('') 이 불필요 — 오히려 그 자체가
    // 빈 문자열(합법적인 "칸 비우기")로 처리돼 0 으로 바뀐 뒤 다음 라운드에서 그 0 과
    // 비교하는 오판이 난다(실측). 매 반복이 항상 "루프 시작 전 값"과 비교해야 한다.
    for (const raw of ['-3', '2.7', '1e3']) {
      await supplyInput.fill(raw)
      await expect(supplyInput).toHaveValue(before) // 거부 — 값 불변(루프 시작 전 값 그대로)
    }
    await capture(page, '06-negative-decimal-exponent-rejected')
  })

  test('04: BE 도 음수 공급가액을 거부한다(raw PUT, FE 우회) — 발견 3 BE 확인', async ({ page }) => {
    const detailRes = await page.request.get(`${API_BASE}/slips/${slipId}`, { headers: authHeaders(auth) })
    const detail = (await detailRes.json()).data
    const badRes = await page.request.put(`${API_BASE}/slips/${slipId}/sales`, {
      headers: authHeaders(auth),
      data: {
        updatedAt: detail.updatedAt,
        lineIdContract: true,
        lines: [{
          lineId: detail.lines[0].id,
          productId: detail.lines[0].productId,
          productName: detail.lines[0].productName,
          quantity: detail.lines[0].quantity,
          unitPrice: detail.lines[0].unitPrice,
          supplyAmount: '-3',
          vatAmount: '7000',
          lineTotalWithVat: '6997',
        }],
      },
    })
    fs.writeFileSync(
      path.join(SHOTS, '07-be-negative-supply-rejection.json'),
      JSON.stringify({ status: badRes.status(), body: await badRes.text() }, null, 2),
    )
    expect(badRes.status(), 'BE 가 음수 공급가액을 2xx 로 수용하면 안 된다').toBe(400)
    const body = await badRes.json().catch(() => null)
    expect(JSON.stringify(body)).toContain('0 이상')
  })
})
