import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #809 R8 — OPUS 4.8 1차 적대검증 QA(라이브) 재현 스펙 (mock OFF, 실 게이트웨이 :8080 → 실 Postgres).
 *
 * 왜 신규 파일인가 — 기존 `price-memory-r2-live-real-qa.spec.ts` 는 합성 시드 품목
 * (AC200CNCDEH-77 / AC300CNCDEH-78 / QA797-SET-01)에 의존하는데 그 품목들이 현 스택의
 * product_db 에서 전량 소멸했다(R8 실측: `/api/products?q=AC200CNCDEH-77` → totalElements=0,
 * `q=QA797` → 0, `products.product_code` 는 1116행 전부 NULL). 그래서 그 파일은 현재
 * 0 passed / 10 failed / 9 did not run 이다(describe.serial 연쇄 skip). 본 스펙은 **실 카탈로그에
 * 실재하는 품목만** 사용해 R8 적대검증을 재현·박제한다. 기존 파일의 단언은 일절 건드리지 않는다.
 *
 * [R8-postfix2] R8 fix 2차 라운드 — 결함 재현 테스트를 교정 거동 fix-guard 로 전환한다(약화 금지,
 * "결함 단언 → 교정 단언"). 공유 dev 스택 재시드로 픽스처를 현 실재 대상으로 재-핀했다(아래 상수).
 *
 * 사용 실품목(2026-07-16 실 DB·실 API 실측 검증):
 *  - 세트 QA797-SET-01 (1ea24f99-…-be1901284769) BUNDLE / usage_scope PARTNER_ORDER
 *      → 전개 구성품 2종: QA797-PART-01(7de11ab7, head, qty2 @88,000) · QA797-PART-02(ed278526, @55,000)
 *  - 단품 AC1000CNCDEH-85 (d35ab633-…-b19262eb5fae) SINGLE / 판매가 4,800,000
 *  - GUI 검색 실품목: AC200CNCDEH-77(a6992eb0, UI_HIT) · AC300CNCDEH-78(841e6a99, UI_MISS) — usage_scope BOTH
 *  - 거래처 강릉HVAC솔루션 (e5c62496-…-c28fa7123675, A) · 거제공조산업 (f618755f-…-b9d950bcf8e3, B) — 둘 다 ACTIVE
 *  - 창고 본사창고 11111111-…-000000000001
 *
 * 실행:
 *   cd clients/desktop
 *   VITE_API_BASE_URL=http://localhost:8080 node_modules/.bin/vite \
 *     --config playwright/809-price-memory-real-qa/vite.809-realqa.config.ts --port 5218 --strictPort
 *   QA_BASE_URL=http://localhost:5218 node_modules/.bin/playwright test \
 *     --config=playwright.real-qa.config.ts \
 *     playwright/809-price-memory-real-qa/price-memory-r8-adversarial-real-qa.spec.ts
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:5218'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const ACCOUNT = 'dev_manager'
// r2/·r4/·r4-postfix/·r5/·r5-postfix/·r6/·r6-postfix/·r8/·r8-postfix/·r8-postfix2/ 는
// 이력 보존 — 불가침. R9 fix 재검증 캡처는 신규 r9-postfix/ 에만 기록한다.
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/809-partner-product-price-memory/r9-postfix'))
fs.mkdirSync(SHOTS, { recursive: true })

// ⚠️ [R8-postfix2] 공유 dev 스택의 product_db·partner_db 가 재시드돼 R8/R8-postfix 시점의 합성
// 픽스처(AF17B6474GZS / AC032CN1DBC1 / 한울냉열시스템 …)가 전량 소멸했다(실측: 그 UUID·모델명
// 0행). 아래는 현 스택에 실재하는 품목·거래처·창고로 재-핀한 것이다(2026-07-16 실측 검증:
// 세트 전개 계보·구성품가·단품 기억까지 라이브 create 로 확인). 단언을 약화한 게 아니라 카탈로그
// 변동에 맞춰 실재 대상으로 다시 고정한 것이다(스펙 자체가 "실 카탈로그 고정" 원칙).
const PARTNER = { id: 'e5c62496-47df-3a07-a3d7-c28fa7123675', name: '강릉HVAC솔루션' }
/** [R8-postfix2] D-R8-7/R8-QA-11 거래처 변경 검증용 두 번째 실 거래처 — 실 DB 실측(partner_db.partners, ACTIVE). */
const OTHER_PARTNER = { id: 'f618755f-9439-33f2-8983-b9d950bcf8e3', name: '거제공조산업' }
const WAREHOUSE = '11111111-1111-1111-1111-000000000001'
const BUNDLE = { id: '1ea24f99-631f-4e19-937f-be1901284769', model: 'QA797-SET-01' }
/** 세트 전개 구성품 — head(PART-01, display_order 1) + 구성품(PART-02, display_order 2). */
const COMP_HEAD = { id: '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9', model: 'QA797-PART-01' }
const COMP_TAIL = { id: 'ed278526-0e16-427d-8a92-2ca06164254a', model: 'QA797-PART-02' }
/** 세트와 무관한 순수 단품 — 계보 오귀속의 피해자. API 라인으로만 쓰여 usage_scope 무관. */
const SINGLE = { id: 'd35ab633-c3db-3187-acb0-b19262eb5fae', model: 'AC1000CNCDEH-85' }
// 전표 폼 품목 자동완성은 usageScope=PARTNER_ORDER 로 좁혀 검색한다(SlipFormPage:1310).
// 아래 2종은 usage_scope=BOTH 실품목이라 그 필터에 걸려 GUI 검색에 뜬다(실측: q 검색 각 1건).
const UI_HIT = { id: 'a6992eb0-81fc-3b3d-957b-7accfe06288c', model: 'AC200CNCDEH-77' }
const UI_MISS = { id: '841e6a99-06fe-3252-8a4f-5227de864a62', model: 'AC300CNCDEH-78' }

function psql(sql: string): string {
  // docker exec -tAc 는 한 줄 SQL 만 받는다 — 개행/연속공백을 접지 않으면 syntax error.
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

/** 세트 전개(구성품 2) + 순수 단품 1 = 3라인 전표를 실 API 로 만든다. */
async function createBundlePlusSingleSlip(page: Page, auth: LoginResult): Promise<string> {
  const res = await page.request.post(`${API_BASE}/slips`, {
    headers: authHeaders(auth),
    data: {
      slipType: 'OUTBOUND',
      partnerId: PARTNER.id,
      partnerName: PARTNER.name,
      sourceWarehouseId: WAREHOUSE,
      lines: [
        { productId: BUNDLE.id, quantity: 1, unitPrice: 1813000 },
        { productId: SINGLE.id, quantity: 1, unitPrice: 334400 },
      ],
    },
  })
  expect(res.ok(), `전표 생성 실패: HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy()
  const id = (await res.json()).data.id as string
  // 전제: 화면 표시순 = [head(GZN), 구성품(DCX), 단품(AC032CN1DBC1)]
  expect(
    psql(`SELECT string_agg(model_name || ':' || set_head || ':' || coalesce(parent_set_model,'-'), '|' ORDER BY created_at) FROM slip_lines WHERE slip_id='${id}' AND is_deleted=false`),
    '전표 생성 직후 계보 전제 붕괴',
  ).toBe(`${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}|${SINGLE.model}:false:-`)
  return id
}

/**
 * 대상 (거래처, 품목) 쌍의 기억행을 물리 삭제해 테스트 창구간을 격리한다.
 * 공유 dev 스택이라 다른 라운드/에이전트가 남긴 잔여행이 단언을 오염시킬 수 있다.
 */
function resetMemoryPairs(productIds: string[]): void {
  psql(
    `DELETE FROM partner_product_price_memory WHERE partner_id='${PARTNER.id}'
       AND product_id IN (${productIds.map((p) => `'${p}'`).join(',')})`,
  )
}

function memoryOf(productId: string): string {
  return memoryOfFor(PARTNER.id, productId)
}

/** [R8-postfix] 임의 거래처 기준 기억행 조회 — D-R8-7(거래처 변경 시 새 거래처 각인) 검증용. */
function memoryOfFor(partnerId: string, productId: string): string {
  return psql(
    `SELECT coalesce((SELECT unit_price || '/' || source FROM partner_product_price_memory
       WHERE partner_id='${partnerId}' AND product_id='${productId}' AND is_deleted=false), 'NONE')`,
  )
}

/** [R8-postfix] 임의 거래처 기준 기억행 리셋 — 거래처 변경 검증은 두 거래처 모두 비워야 결정적이다. */
function resetMemoryPairsFor(partnerId: string, productIds: string[]): void {
  psql(
    `DELETE FROM partner_product_price_memory WHERE partner_id='${partnerId}'
       AND product_id IN (${productIds.map((p) => `'${p}'`).join(',')})`,
  )
}

function lineageOf(slipId: string): string {
  return psql(
    `SELECT string_agg(model_name || ':' || set_head || ':' || coalesce(parent_set_model,'-'), '|' ORDER BY created_at)
     FROM slip_lines WHERE slip_id='${slipId}' AND is_deleted=false`,
  )
}

/** 자동완성 실 후보만 매칭 — '검색 중…' 로딩행도 role=option 이라 id 접두사로 좁힌다. */
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

/** 매출 상세 진입 + '수정' 클릭 → coedit 편집 모달. provider 로드까지 대기. */
async function openSalesEdit(page: Page, slipId: string): Promise<void> {
  await page.goto(`${BASE_URL}/sales/${slipId}`)
  await page.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByTestId('sales-slip-edit-button').click()
  // coedit provider 로드 완료 = 라인 입력이 편집 가능해질 때.
  await expect(page.getByLabel('단가(VAT포함) 1')).toBeEnabled({ timeout: 30000 })
  await page.waitForTimeout(1500)
}

/** 매입 상세 진입 + 수정 인라인 폼. 매출 미러의 고유 testid 로 분리한다. */
async function openPurchaseEdit(page: Page, slipId: string): Promise<void> {
  await page.goto(`${BASE_URL}/purchases/${slipId}`)
  await page.getByTestId('purchase-slip-edit-open').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByTestId('purchase-slip-edit-open').click()
  await expect(page.getByTestId('purchase-slip-edit-modal')).toBeVisible({ timeout: 30000 })
  await expect(page.getByLabel('단가(VAT포함) 1')).toBeEnabled({ timeout: 30000 })
  await page.waitForTimeout(1500)
}

/** 테스트 전용 기억행 시드 — 대상 쌍은 호출 전 reset 한다. */
function seedMemory(partnerId: string, productId: string, unitPrice: number, actor: string): void {
  psql(
    `INSERT INTO partner_product_price_memory (id, partner_id, product_id, unit_price, source,
       remembered_at, created_at, created_by, is_deleted)
     VALUES (gen_random_uuid(), '${partnerId}', '${productId}', ${unitPrice}, 'LINE_SAVE',
       TIMESTAMP '2026-01-02 03:04:05', CURRENT_TIMESTAMP, '${actor}', FALSE)`,
  )
}

test.describe('#809 R8 — OPUS 4.8 적대검증 라이브 재현', () => {
  /**
   * R8-QA-1 [BLOCKING] — lineId 미전송 PUT 이 세트 계보를 파괴하고 구성품 배분가를 각인한다.
   *
   * BE 계약(SlipUpdateRequest.LineRequest)은 lineId 를 "구 클라이언트 호환" 명목으로 optional 로
   * 열어두고(7-필드 호환 생성자 존재), null 이면 `BundleLineageResolver.assign` 이 즉시 return 해
   * 계보를 승계하지 않는다. 그 결과 **무수정 왕복 PUT 이 HTTP 200 으로 계보를 전량 파괴**하고,
   * 계보를 잃은 구성품이 `collectPriceMemory` 의 isBundleComponent 필터를 빠져나가
   * **구성품 배분가가 LINE_SAVE 로 각인**된다(= 이 PR 이 막으려는 오염 그 자체).
   *
   * 이 경로는 기존 스펙 자신의 헬퍼 `mirrorSlipLine`(lineId 미포함)이 그대로 밟는다.
   */
  test('R8-QA-1 [BLOCKING·fix 가드] 계약 마커 없는 lineId 미전송 무수정 PUT → 400 거부 · 세트 계보 보존 · 기억 미오염', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPairs([COMP_HEAD.id, COMP_TAIL.id, SINGLE.id])
    const slipId = await createBundlePlusSingleSlip(page, auth)

    // 생성 직후 전제: 구성품은 기억되지 않는다(parent 만 BUNDLE_SET). 이게 정상 동작.
    expect(memoryOf(COMP_HEAD.id), 'R8-QA-1 전제: 생성 시 head 구성품은 기억되지 않아야 함').toBe('NONE')
    expect(memoryOf(COMP_TAIL.id), 'R8-QA-1 전제: 생성 시 구성품은 기억되지 않아야 함').toBe('NONE')

    await page.goto(`${BASE_URL}/sales/${slipId}`)
    await expect(page.getByText(COMP_HEAD.model).first()).toBeVisible({ timeout: 30000 })
    await capture(page, '01-r8-qa-1-slip-detail-set-lineage-intact')

    expect(lineageOf(slipId), 'PUT 전 계보 전제').toBe(
      `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}|${SINGLE.model}:false:-`,
    )

    // 구 클라이언트 / 기존 스펙 mirrorSlipLine 과 동일한 lineId 미포함 무수정 왕복 PUT.
    const detail = (await (await page.request.get(`${API_BASE}/slips/${slipId}`, { headers: authHeaders(auth) })).json()).data
    const res = await page.request.put(`${API_BASE}/slips/${slipId}/sales`, {
      headers: authHeaders(auth),
      data: {
        updatedAt: detail.updatedAt,
        partnerName: detail.partnerName, partnerCode: detail.partnerCode,
        memo: detail.memo, businessNumber: detail.businessNumber,
        deliveryAddress: detail.deliveryAddress, supervisionAddress: detail.supervisionAddress,
        projectName: detail.projectName, recipientPhone: detail.recipientPhone,
        paymentDueDate: detail.paymentDueDate,
        lines: detail.lines.map((l: Record<string, unknown>) => ({
          productId: l['productId'], productName: l['productName'], modelName: l['modelName'],
          specification: l['specification'], quantity: l['quantity'],
          unitPrice: String(l['unitPrice']), note: l['note'],
        })),
      },
    })
    // D-R8-6 + D-R8-9 이후: 계약 마커(lineIdContract) 없는 요청 = 구 클라이언트 → 400 거부.
    // R8 리뷰 시점에는 이 단언이 `toBe(200)` 이었고 그게 곧 BLOCKING 의 증거였다(거부 없이 통과).
    expect(res.status(), 'R8-QA-1 가드: 계약 마커 없는 lineId 미전송 PUT 은 400 으로 거부돼야 함(구 클라이언트 차단)').toBe(400)

    await page.reload()
    await expect(page.getByText(SINGLE.model).first()).toBeVisible({ timeout: 30000 })
    // R8 리뷰 시점 캡처명은 '…-lineage-destroyed' 였다 — 그때는 실제로 파괴됐기 때문이다(r8/ 에 박제).
    // fix 후에는 400 거부로 계보가 보존되므로 이름도 사실에 맞춘다.
    await capture(page, '02-r8-qa-1-after-rejected-put-lineage-preserved')

    // 400 으로 거부됐으므로 계보는 PUT 전과 동일해야 한다(R8 리뷰 시점엔 set_head 전부 f · parent 전부 NULL 로 파괴됐다).
    expect(lineageOf(slipId), 'R8-QA-1 가드: 거부된 PUT 이 세트 계보를 건드리지 않아야 함(데이터 손실 차단)').toBe(
      `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}|${SINGLE.model}:false:-`,
    )
    // 계보가 살아 있으므로 구성품은 isBundleComponent 필터에 계속 걸려 기억되지 않아야 한다.
    // (R8 리뷰 시점엔 계보를 잃어 필터를 통과, 구성품 배분가 501600·752400 이 LINE_SAVE 로 각인됐다.)
    expect(memoryOf(COMP_HEAD.id), 'R8-QA-1 가드: 거부된 PUT 이 head 구성품 배분가를 각인하지 않아야 함').toBe('NONE')
    expect(memoryOf(COMP_TAIL.id), 'R8-QA-1 가드: 거부된 PUT 이 구성품 배분가를 각인하지 않아야 함').toBe('NONE')
    await ctx.close()
  })

  /**
   * R8-QA-2a [D-R8-11·fix 가드] — R8 fix 1차의 행삭제 **잠금이 제거**됐는지 확인한다.
   *
   * R8 fix 1차는 원격삭제 → lineId 밀림 BLOCKING 에 두 겹으로 대응했다:
   *  1. **근본 fix** — `coeditLineIds.resolveServerLineId` 로 Y.Doc lineId 직독 + 서버 소유검증
   *  2. **심층방어(과잉)** — coedit 중 행 삭제 버튼 잠금 (`slipCoeditActive`)
   *
   * 그러나 그 잠금은 (a) 수정 모달의 행삭제를 **영구 불가**로 만들고 (b) 근본 fix(직독)의 라이브
   * 검증 자체를 봉쇄했다. **D-R8-11 결정: 잠금 제거 + Y.Doc 직독만으로 방어.** 잠금이 사라졌으니
   * 이제 행 삭제 버튼은 coedit 중에도 **활성**이어야 한다(SlipDetailPage 에서 `disabled={slipCoeditActive}`
   * 와 lock title 이 제거됨). 잠금이 회귀하면 이 단언이 실패한다.
   *
   * 근본 fix(직독)의 실제 계보 방어는 R8-QA-2b(2창 서버측 삭제 → 피어 저장)가 라이브로 실증한다 —
   * D-R8-11 로 트리거가 다시 열렸으므로 이번엔 GUI 로 도달 가능하다.
   */
  test('R8-QA-2a [D-R8-11·fix 가드] coedit 중 행 삭제 버튼 활성 — 잠금 제거(직독 방어로 대체)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    const slipId = await createBundlePlusSingleSlip(page, auth)

    await openSalesEdit(page, slipId)
    await capture(page, '03-r8-qa-2a-coedit-edit-modal-3lines')

    // 🔴 fix 가드 — D-R8-11 이후 coedit 활성 중에도 행 삭제 버튼이 **활성**이어야 한다.
    //    R8 fix 1차(5d38255df)엔 `disabled={slipCoeditActive}` 로 잠겼고 그게 R8-QA-2 근본 fix 의
    //    라이브 검증을 봉쇄했다. R8 fix 2차가 그 잠금을 제거했다 — 잠금이 다시 걸리면(회귀) 실패.
    const del = page.getByRole('button', { name: '1번 행 삭제' })
    await expect(del, 'R8-QA-2a: 행 삭제 버튼 미표시').toBeVisible({ timeout: 10000 })
    await expect(
      del,
      'R8-QA-2a fix 가드: coedit 중 행 삭제가 비활성 — D-R8-11 잠금 제거가 회귀했다(직독 방어 검증 봉쇄)',
    ).toBeEnabled()
    // 잠금 title 도 제거됐어야 한다(잠금 어포던스의 흔적 0).
    expect(
      await del.getAttribute('title'),
      'R8-QA-2a fix 가드: 행 삭제 버튼에 잠금 title 이 잔존 — 잠금 제거 미완',
    ).not.toBe('협업 편집 중에는 행을 삭제할 수 없습니다')
    await capture(page, '04-r8-qa-2a-row-delete-active-during-coedit')
    await ctx.close()
  })

  /**
   * R8-QA-2b [D-R8-11·근본 fix 라이브 실증] — 잠금 제거 후, **2창 GUI 로** 계보 방어를 실증한다.
   * (핸드오프 필수 항목: R8-QA-2 근본 fix(Y.Doc lineId 직독)의 라이브 재현.)
   *
   * 시나리오: 피어 A 는 상세화면 툴바에서 세트 head 를 **서버측 삭제**(`handleRemoveLine` → BE DELETE)
   * 하고, 그 동안 피어 B 는 coedit 편집 모달에서 단품 단가를 입력한 뒤 **저장**한다. B 의 Y.Doc·
   * `knownServerLineIds` 는 삭제 이전 스냅샷이라, 삭제된 head 의 lineId 를 그대로 싣는다.
   *
   * D-R8-11 로 편집 모달의 행삭제 잠금이 사라져 이 경합이 GUI 로 도달 가능해졌다. 방어는 두 겹:
   *  1. 서버 `validateLineIds` — B 가 실은 삭제된 lineId 는 현재 활성 라인이 아니므로 **400 거부**.
   *  2. FE `resolveServerLineId` — 근본 fix. lineId 를 Y.Doc 에서 위치가 아니라 **값으로 직독**.
   *
   * **판정(둘 중 하나면 정상)**:
   *  (a) 저장이 2xx 로 성공 → 계보 무손상 + 사용자 입력 단가가 기억됨, 또는
   *  (b) 저장이 400 으로 거부 → **충돌 안내 배너**(R8-QA-12 fix: "최신 내용 불러오기…")로 사용자 인지.
   * 어느 경로든 **세트 계보 오귀속·head 탈취는 없어야** 한다(불변식). 그리고 400 인데 막다른
   * "입력값을 확인" 문구가 뜨면 **실패**(R8-QA-12 미fix — 사용자가 복구 경로를 못 찾음).
   */
  test('R8-QA-2b [D-R8-11·근본 fix] 2창 서버측 head 삭제 → 피어 저장 — 계보 방어(직독) + 400 시 충돌 안내 배너', async ({ browser }) => {
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    const auth = await login(pageA)
    await login(pageB)

    resetMemoryPairs([COMP_HEAD.id, COMP_TAIL.id, SINGLE.id])
    const slipId = await createBundlePlusSingleSlip(pageA, auth)
    const NEW_SINGLE_PRICE = '299000' // 수신창이 단품 라인에 새로 입력할 단가(VAT 제외)
    // 생성 직후 단품 기억 = 334400 × 1.1. 저장이 정상(2xx)이면 328900 으로 갱신돼야 한다.
    expect(memoryOf(SINGLE.id), 'R8-QA-2b 전제: 생성 시 단품은 라인 단가 기준으로 기억됨').toBe('367840.00/LINE_SAVE')

    // 창B: coedit 편집 모달 진입 → 단품(3행) 단가 직접 입력.
    await openSalesEdit(pageB, slipId)
    await capture(pageB, '05-r8-qa-2b-windowB-coedit-3lines')
    await pageB.getByLabel('단가(VAT포함) 3').fill(NEW_SINGLE_PRICE)
    await pageB.waitForTimeout(600)
    await capture(pageB, '06-r8-qa-2b-windowB-single-price-entered-299000')

    // 창A: 상세화면(편집 모달 아님) → 1행(세트 head) 선택 → 툴바 '행 삭제' → BE DELETE.
    await pageA.goto(`${BASE_URL}/sales/${slipId}`)
    await pageA.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 30000 })
    await pageA.getByRole('button', { name: '라인 1 선택' }).click()
    await pageA.waitForTimeout(400)
    await capture(pageA, '07-r8-qa-2b-windowA-line1-selected-toolbar')
    pageA.once('dialog', (d) => void d.accept())
    const delRes = pageA.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.url().includes(`/slips/${slipId}/lines/`),
      { timeout: 30000 },
    )
    await pageA.getByRole('button', { name: '행 삭제', exact: true }).click()
    const delStatus = (await delRes).status()
    console.log('[R8-QA-2b] 창A 서버측 행삭제 DELETE 상태:', delStatus)
    expect(delStatus, 'R9-QA #7: 창A DELETE 가 204 성공이 아니면 경합이 유발되지 않아 후속 판정이 false-green').toBe(204)
    await pageA.waitForTimeout(1500)
    await capture(pageA, '08-r8-qa-2b-windowA-after-server-side-row-delete')

    // 창B 저장 — B 의 Y.Doc/knownServerLineIds 는 삭제 이전 스냅샷이다.
    const putBody: string[] = []
    pageB.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`)) putBody.push(r.postData() ?? '')
    })
    const putRes = pageB.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await capture(pageB, '09-r8-qa-2b-windowB-before-save-after-remote-server-delete')
    await pageB.getByRole('button', { name: '저장', exact: true }).first().click()
    const resp = await putRes
    const putStatus = resp.status()
    console.log('[R8-QA-2b] 창B PUT 상태:', putStatus)
    console.log('[R8-QA-2b] 창B PUT body:', putBody.join('\n'))
    await pageB.waitForTimeout(2000)
    await capture(pageB, '10-r8-qa-2b-windowB-after-save')

    const finalLineage = lineageOf(slipId)
    console.log('[R8-QA-2b] 저장 후 계보:', finalLineage)
    expect(putStatus, 'R9-QA #7: 피어 저장은 per-line 계보 게이트의 정확한 400으로만 거부돼야 함(409 등 다른 선차단 허용 금지)').toBe(400)
    expect(
      finalLineage,
      'R9-QA #8: head DELETE 후 잔존 tail 의 parent_set_model 이 NULL 로 소실되거나 단품에 계보가 이식됨',
    ).toBe(`${COMP_TAIL.model}:false:${BUNDLE.model}|${SINGLE.model}:false:-`)

    // 🔴 불변식 1 — 세트와 무관한 단품은 어떤 경우에도 세트 구성품이 될 수 없다.
    expect(
      psql(`SELECT count(*) FROM slip_lines WHERE slip_id='${slipId}' AND is_deleted=false
              AND product_id='${SINGLE.id}' AND parent_set_model IS NOT NULL`),
      `R8-QA-2b: 단품 ${SINGLE.model} 이 세트 구성품으로 오귀속됨 (계보=${finalLineage} · PUT=${putStatus})`,
    ).toBe('0')

    // 🔴 불변식 2 — head 행이 삭제된 뒤 남은 구성품이 head 지위를 훔쳐선 안 된다.
    expect(
      psql(`SELECT count(*) FROM slip_lines WHERE slip_id='${slipId}' AND is_deleted=false
              AND product_id='${COMP_TAIL.id}' AND set_head=true`),
      `R8-QA-2b: 삭제된 head 의 setHead 가 잔존 구성품으로 이식됨 (계보=${finalLineage} · PUT=${putStatus})`,
    ).toBe('0')

    // 🔴 판정 — R9 계약은 정확히 400. 비-2xx 모두를 허용하면 409 등 다른 선차단이
    //    근본 fix 실증으로 둥갑하는 false-green 이 된다. 거부된 입력은 기억에도 반영되지 않아야 한다.
    console.log('[R8-QA-2b] R9 경로 — 저장 400 거부, 충돌 안내 배너(R8-QA-12 fix) 검증')
    expect(memoryOf(SINGLE.id), 'R9-QA #7: 400 거부된 피어 입력이 단가 기억에 각인됨').toBe('367840.00/LINE_SAVE')
      // 🔴 R8-QA-12 fix 가드 — 400 은 막다른 "입력값 확인" 이 아니라 복구 가능한 충돌 배너여야 한다.
      const banner = pageB.getByTestId('sales-slip-edit-conflict-banner')
      await expect(banner, 'R8-QA-2b(b): 400 거부인데 충돌 안내 배너가 없음(R8-QA-12 미fix — 사용자 인지 불가)')
        .toBeVisible({ timeout: 10000 })
      const bannerText = ((await banner.textContent()) ?? '').trim()
      console.log('[R8-QA-2b] 충돌 배너 문구:', JSON.stringify(bannerText))
      await capture(pageB, '10b-r8-qa-2b-windowB-conflict-banner')
      expect(
        bannerText,
        `R8-QA-2b(b): 충돌 배너가 "최신 내용 불러오기" 복구 경로를 안내하지 않음 (문구=${bannerText})`,
      ).toContain('최신 내용 불러오기')
      // 막다른 입력값-확인 문구(R8-QA-12 미fix 신호)가 뜨면 실패.
      expect(
        bannerText,
        'R8-QA-2b(b): 막다른 "입력값 확인" 문구 — 구조 불일치를 입력 오류로 오도(R8-QA-12 미fix)',
      ).not.toContain('입력값')
      // 복구 버튼(최신 내용 불러오기)도 노출돼야 한다.
      await expect(
        pageB.getByTestId('sales-slip-edit-reload'),
        'R8-QA-2b(b): "최신 내용 불러오기" 복구 버튼 미표시',
      ).toBeVisible()
    await pageB.reload()
    await pageB.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 30000 })
    await capture(pageB, '11-r8-qa-2b-final-detail-after-save')

    await ctxA.close()
    await ctxB.close()
  })

  /**
   * R8-QA-6 [HIGH] — 라인의 품목을 교체(lineId 유지)하면 옛 세트 계보가 새 품목에 이식되고
   * 그 품목의 가격기억이 조용히 증발한다.
   *
   * `BundleLineageResolver.assign` 은 lineId 로 **옛 라인의 계보만** 조회해 새 라인에 이식할 뿐,
   * "그 lineId 의 옛 productId 와 지금 productId 가 같은가" 를 확인하지 않는다. 따라서 사용자가
   * 라인의 모델명을 바꿔 전혀 다른 품목으로 교체해도 lineId 는 그대로 왕복되므로 옛 계보가
   * 새 품목에 이식된다. 이식된 품목은 isBundleComponent 필터에 걸려 사용자가 입력한 단가의
   * 기억이 아예 생성되지 않는다.
   *
   * R8 실측(전표): 세트 head 라인의 productId 만 무관한 단품 ACD-2558G 로 교체 + 단가 150000 →
   *   ACD-2558G:set_head=true:parent=AF17B6474GZS · 기억행 NONE (165000 미생성). PUT 은 200.
   * 견적 경로도 `restoreEstimateLines` → 동일 `assign` 이라 같은 계약을 공유한다.
   */
  test('R8-QA-6 [HIGH] 라인 품목 교체(lineId 유지) → 무관한 단품이 세트 head 로 오귀속 + 사용자 단가 기억 증발', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPairs([UI_HIT.id])
    const SWAP_PRICE = '150000'
    const expectedMemory = '165000.00/LINE_SAVE' // 150000 × 1.1

    // 세트만 있는 전표(구성품 2행) 생성.
    const created = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'OUTBOUND', partnerId: PARTNER.id, partnerName: PARTNER.name,
        sourceWarehouseId: WAREHOUSE,
        lines: [{ productId: BUNDLE.id, quantity: 1, unitPrice: 1813000 }],
      },
    })
    expect(created.ok(), '세트 전표 생성 실패').toBeTruthy()
    const slipId = (await created.json()).data.id as string
    expect(lineageOf(slipId), 'R8-QA-6 전제: 세트 전개 계보').toBe(
      `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}`,
    )

    await page.goto(`${BASE_URL}/sales/${slipId}`)
    await page.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 30000 })
    await capture(page, '18-r8-qa-6-set-slip-before-product-swap')

    // head 구성품 라인의 lineId 는 유지한 채 productId/modelName 만 무관한 단품으로 교체.
    const detail = (await (await page.request.get(`${API_BASE}/slips/${slipId}`, { headers: authHeaders(auth) })).json()).data
    const res = await page.request.put(`${API_BASE}/slips/${slipId}/sales`, {
      headers: authHeaders(auth),
      data: {
        updatedAt: detail.updatedAt,
        // [D-R8-9] 이 케이스는 "정상 최신 클라이언트가 구성품의 품목을 교체" 하는 시나리오다 —
        // 계약 마커를 실어야 lineId 시맨틱이 활성화되고, 그래야 D-R8-8 productId 게이트가
        // 검증 대상이 된다. 마커가 없으면 400 에 막혀 이 케이스 자체가 성립하지 않는다.
        lineIdContract: true,
        partnerName: detail.partnerName, partnerCode: detail.partnerCode, memo: detail.memo,
        businessNumber: detail.businessNumber, deliveryAddress: detail.deliveryAddress,
        supervisionAddress: detail.supervisionAddress, projectName: detail.projectName,
        recipientPhone: detail.recipientPhone, paymentDueDate: detail.paymentDueDate,
        lines: detail.lines.map((l: Record<string, unknown>) =>
          l['setHead'] === true
            ? {
                lineId: l['id'], productId: UI_HIT.id, productName: '교체된 단품',
                modelName: UI_HIT.model, specification: null, quantity: 1,
                unitPrice: SWAP_PRICE, note: null,
              }
            : {
                lineId: l['id'], productId: l['productId'], productName: l['productName'],
                modelName: l['modelName'], specification: l['specification'],
                quantity: l['quantity'], unitPrice: String(l['unitPrice']), note: l['note'],
              },
        ),
      },
    })
    expect(res.status(), 'R8-QA-6: 품목 교체 PUT 이 200 으로 통과(계약 표면)').toBe(200)

    await page.reload()
    await page.getByTestId('sales-slip-edit-button').waitFor({ state: 'visible', timeout: 30000 })
    // R8 리뷰 시점엔 '…-single-marked-as-set-head'(오귀속 발생)였다 — fix 후엔 승계되지 않는다.
    await capture(page, '19-r8-qa-6-after-swap-no-lineage-inherited')

    // 🔴 불변식 1 — 교체된 단품은 세트 계보를 물려받아선 안 된다.
    expect(
      psql(`SELECT count(*) FROM slip_lines WHERE slip_id='${slipId}' AND is_deleted=false
              AND product_id='${UI_HIT.id}' AND parent_set_model IS NOT NULL`),
      `R8-QA-6: 교체된 단품 ${UI_HIT.model} 이 옛 라인의 세트 계보를 이식받음 (계보=${lineageOf(slipId)})`,
    ).toBe('0')

    // 🔴 불변식 2 — 사용자가 입력한 단가는 기억돼야 한다.
    expect(
      memoryOf(UI_HIT.id),
      'R8-QA-6: 교체 품목이 구성품으로 오귀속돼 사용자 입력 단가(150000) 기억이 증발함',
    ).toBe(expectedMemory)
    await ctx.close()
  })

  /**
   * R8-QA-4 [4순위·매 라운드 확인] — R3 fix 신규 UI 가 실 GUI 에 살아 있는지 라이브 실증.
   *  - hit 라인 마커 = '거래처 최근단가' (구 '최근가' 아님)
   *  - miss 라인 마커 = '판매가' (D-R4-1 로 '정가'→'판매가' 확정)
   *  - 단건 lookup 은 GET /slips/price-memory (bulk 아님)
   * 기존 스펙 01/02 가 같은 계약을 덮지만 합성 시드 소멸로 실행 불가 상태라 실품목으로 재확인한다.
   */
  test('R8-QA-4 [확인] 전표 폼 — hit=거래처 최근단가 마커 · miss=판매가 마커 · 단건 GET 경로', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)
    const calls: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/slips/price-memory')) calls.push(`${r.method()} ${r.url()}`)
    })

    // 알려진 기억단가를 심어 hit 를 결정적으로 만든다(실 서버 저장 경로가 만든 값과 동일 형식).
    resetMemoryPairs([UI_HIT.id, UI_MISS.id])
    psql(
      `INSERT INTO partner_product_price_memory (id, partner_id, product_id, unit_price, source,
         remembered_at, created_at, created_by, is_deleted)
       VALUES (gen_random_uuid(), '${PARTNER.id}', '${UI_HIT.id}', 913000, 'LINE_SAVE',
         TIMESTAMP '2026-01-02 03:04:05', CURRENT_TIMESTAMP, 'qa-r8', FALSE)`,
    )

    await page.goto(`${BASE_URL}/sales/new`)
    await expect(page.getByRole('combobox', { name: '거래처' })).toBeVisible({ timeout: 30000 })
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER.name)
    await pickWarehouse(page)
    await capture(page, '13-r8-qa-4-slip-form-partner-selected')

    // hit — 기억단가 913000 자동채움 + '거래처 최근단가' 마커.
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', UI_HIT.model)
    await page.waitForTimeout(1500)
    await expect(page.getByLabel('라인 1 단가'), 'hit 기억단가 자동채움 실패').toHaveValue(/913,?000/)
    await expect(
      page.getByRole('note', { name: '이 거래처에 마지막으로 저장된 단가' }).first(),
    ).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('거래처 최근단가').first(), "hit 마커 문구가 '거래처 최근단가' 가 아님").toBeVisible()
    await capture(page, '14-r8-qa-4-hit-marker-거래처최근단가-913000')

    // 단건 GET 경로 확인 — bulk 아님.
    expect(
      calls.filter((c) => c.startsWith('GET ') && c.includes('/slips/price-memory?')).length,
      '단건 hit 시 GET /slips/price-memory 미관측',
    ).toBeGreaterThan(0)
    expect(
      calls.filter((c) => c.includes('/slips/price-memory/bulk')).length,
      '단건 hit 시나리오에서 bulk 호출 발생(경로 오배선)',
    ).toBe(0)

    // miss — 기억 없는 품목은 '판매가' 마커('정가' 아님, D-R4-1). 다음 빈 행에 입력한다.
    await page.waitForTimeout(400)
    await pickAutocomplete(page, '라인 2 품목', '품목 목록', UI_MISS.model)
    await page.waitForTimeout(1500)
    await expect(
      page.getByText('판매가', { exact: true }).first(),
      "miss 마커 문구가 '판매가' 가 아님(D-R4-1 회귀)",
    ).toBeVisible({ timeout: 10000 })
    expect(await page.getByText('정가', { exact: true }).count(), "구 문구 '정가' 잔존(D-R4-1 위반)").toBe(0)
    await capture(page, '15-r8-qa-4-miss-marker-판매가')
    console.log('[R8-QA-4] price-memory 호출:', JSON.stringify(calls))
    await ctx.close()
  })

  /**
   * R8-QA-5 [4순위·매 라운드 확인] — 거래처 변경 시 재조회 계약.
   *  - POST /slips/price-memory/bulk **정확히 1건** (품목수만큼 단건 GET 아님, D-R3-4)
   *  - 배너 고지 표시 (D-R3-2)
   *  - 값이 바뀐 행만 '단가 변경' 강조 (D-R3-2)
   */
  test('R8-QA-5 [확인] 거래처 변경 → bulk 정확히 1건 · 배너 · 변경행만 강조', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    await login(page)

    // 거래처A 에는 기억 있음 / 거래처B(변경 대상)에는 다른 기억 → 변경 시 값이 바뀌어야 강조된다.
    resetMemoryPairs([UI_HIT.id])
    psql(
      `INSERT INTO partner_product_price_memory (id, partner_id, product_id, unit_price, source,
         remembered_at, created_at, created_by, is_deleted)
       VALUES (gen_random_uuid(), '${PARTNER.id}', '${UI_HIT.id}', 913000, 'LINE_SAVE',
         TIMESTAMP '2026-01-02 03:04:05', CURRENT_TIMESTAMP, 'qa-r8', FALSE)`,
    )

    await page.goto(`${BASE_URL}/sales/new`)
    await expect(page.getByRole('combobox', { name: '거래처' })).toBeVisible({ timeout: 30000 })
    await pickAutocomplete(page, '거래처', '거래처 목록', PARTNER.name)
    await pickWarehouse(page)
    await pickAutocomplete(page, '라인 1 품목', '품목 목록', UI_HIT.model)
    await page.waitForTimeout(1200)
    await expect(page.getByLabel('라인 1 단가')).toHaveValue(/913,?000/)
    await capture(page, '16-r8-qa-5-before-partner-change-913000')

    // 거래처 변경 창구간의 price-memory 호출만 센다.
    const during: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/slips/price-memory')) during.push(`${r.method()} ${r.url()}`)
    })
    await pickAutocomplete(page, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await page.waitForTimeout(2500)
    await capture(page, '17-r8-qa-5-after-partner-change-banner-and-highlight')

    const bulk = during.filter((c) => c.includes('/slips/price-memory/bulk'))
    const singles = during.filter((c) => c.startsWith('GET ') && c.includes('/slips/price-memory?'))
    console.log('[R8-QA-5] 거래처 변경 창구간 호출:', JSON.stringify(during))
    expect(bulk.length, '거래처 변경 시 bulk 가 정확히 1건이 아님(D-R3-4)').toBe(1)
    expect(singles.length, '거래처 변경 시 품목수만큼 단건 GET 발생(D-R3-4 위반)').toBe(0)

    // 배너 고지 — 단일 live region.
    await expect(page.getByTestId('slip-price-refresh-banner'), '거래처 변경 배너 미표시(D-R3-2)')
      .toBeVisible({ timeout: 10000 })
    const bannerText = (await page.getByTestId('slip-price-refresh-banner').textContent()) ?? ''
    console.log('[R8-QA-5] 배너:', bannerText)
    expect(bannerText.trim().length, '거래처 변경 배너가 빈 텍스트').toBeGreaterThan(0)

    // 변경행 강조 — '단가 변경' 인디케이터가 값이 바뀐 1행에만.
    expect(await page.getByText('단가 변경', { exact: true }).count(), "변경행 '단가 변경' 강조가 1행이 아님(D-R3-2)").toBe(1)
    await ctx.close()
  })

  /**
   * R8-QA-3 [HIGH·fix 가드] — D-R8-7 이행 검증. 전표 수정의 거래처가 **자유입력 → PartnerAutocomplete**
   * 로 봉쇄됐고, 거래처를 바꿔 저장하면 가격기억이 **바뀐 거래처**에 각인돼야 한다.
   *
   * R8 리뷰 시점의 결함: `Slip.updateSalesHeader` 가 partnerName·partnerCode·businessNumber 만
   * 갱신하고 **partnerId 는 파라미터에 아예 없었고**, `collectPriceMemory` 가 헤더 갱신 **이전에**
   * 호출돼 갱신 전 `slip.getPartnerId()` 를 읽었다. 화면 거래처는 B 로 바뀌는데 기억은 A 에
   * 각인 — 마커가 거짓말을 했다(라이브 실증: `R8검증-다른거래처`/277000 → 304700 이 원 거래처
   * `44f0cfc1` 에 각인).
   *
   * D-R8-7 fix 3종을 **각각** 단언한다:
   *  1. 자유입력 봉쇄 — '거래처' 가 combobox(PartnerAutocomplete) 이고, 미선택 자유 타이핑은
   *     partnerName 을 바꾸지 못한다
   *  2. 계약에 partnerId 추가 — 실제 선택 시 `slips.partner_id` 가 갱신된다
   *  3. `collectPriceMemory` 를 헤더 갱신 이후로 이동 — 기억이 **새** 거래처에 각인된다
   */
  test('R8-QA-3 [HIGH·fix 가드] 전표 수정 거래처 = PartnerAutocomplete · 자유입력 봉쇄 · 거래처 변경 시 기억이 새 거래처에 각인', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPairs([COMP_HEAD.id, COMP_TAIL.id, SINGLE.id])
    resetMemoryPairsFor(OTHER_PARTNER.id, [SINGLE.id])
    const slipId = await createBundlePlusSingleSlip(page, auth)
    const FREE_TEXT = 'R8검증-존재하지않는거래처'
    const NEW_PRICE = '277000'
    const expectedMemory = '304700.00/LINE_SAVE' // 277000 × 1.1

    await openSalesEdit(page, slipId)
    await capture(page, '10-r8-qa-3-sales-edit-partner-is-autocomplete')

    // 🔴 fix 가드 1 — 거래처가 combobox(PartnerAutocomplete) 다. 종전 자유입력
    //    CollaborativeSlipInput 이라면 role=combobox 로 잡히지 않는다.
    await expect(
      page.getByRole('combobox', { name: '거래처' }),
      'R8-QA-3 fix 가드: 전표 수정 거래처가 PartnerAutocomplete(combobox) 가 아님 — D-R8-7 미이행',
    ).toBeVisible({ timeout: 10000 })

    // 🔴 fix 가드 1-b — 후보를 고르지 않은 자유 타이핑은 거래처를 바꾸지 못한다.
    //    (종전엔 이 타이핑만으로 partner_name 이 바뀌고 partner_id 는 남아 기억이 오각인됐다.)
    await page.getByRole('combobox', { name: '거래처' }).fill(FREE_TEXT)
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await capture(page, '11-r8-qa-3-free-text-typed-not-committed')

    // 실제 거래처 변경 — 자동완성 후보를 골라 확정한다.
    await pickAutocomplete(page, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await page.getByLabel('단가(VAT포함) 3').fill(NEW_PRICE)
    await page.waitForTimeout(600)
    await capture(page, '12-r8-qa-3-partner-switched-via-autocomplete-and-price')

    const putRes = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: '저장', exact: true }).first().click()
    expect((await putRes).status(), '거래처 변경 저장 PUT').toBe(200)
    await page.waitForTimeout(2500)

    await page.goto(`${BASE_URL}/sales/${slipId}`)
    await expect(page.getByText(OTHER_PARTNER.name).first()).toBeVisible({ timeout: 30000 })
    await capture(page, '13-r8-qa-3-detail-shows-new-partner')

    // 🔴 fix 가드 2 — partner_name 과 partner_id 가 **함께** 새 거래처로 이동해야 한다.
    //    R8 리뷰 시점엔 name 만 바뀌고 id 는 원 거래처로 고정이었다.
    expect(
      psql(`SELECT partner_name || '/' || coalesce(partner_id::text,'-') FROM slips WHERE id='${slipId}'`),
      'R8-QA-3 fix 가드: 거래처 변경이 partner_id 에 반영되지 않음(계약 partnerId 누락)',
    ).toBe(`${OTHER_PARTNER.name}/${OTHER_PARTNER.id}`)

    // 🔴 fix 가드 3 — 기억은 "그 전표에 표시된 거래처" = **새** 거래처에 각인돼야 한다.
    expect(
      memoryOfFor(OTHER_PARTNER.id, SINGLE.id),
      `R8-QA-3 fix 가드: 단가 ${NEW_PRICE} 을 '${OTHER_PARTNER.name}' 로 저장했는데 새 거래처에 기억이 없음`,
    ).toBe(expectedMemory)

    // 🔴 그리고 원 거래처는 그 단가를 가져가면 안 된다(R8 리뷰가 실증한 오각인의 역단언).
    expect(
      memoryOf(SINGLE.id),
      `R8-QA-3 fix 가드: 기억이 원 거래처(${PARTNER.id})에 각인됨 — 마커가 거짓말(R8-QA-3 회귀)`,
    ).not.toBe(expectedMemory)
    await ctx.close()
  })

  /**
   * R8-QA-9 [HIGH·fix 가드] — R8 fix 2차가 **거래처 빈칸 회귀를 교정**했는지 확인한다.
   * 전표 수정 모달 진입 시 거래처 상호가 정상 표시(=partnerName)되고 aria-expanded 고착이 없어야 한다.
   *
   * **fix**: `AsyncAutocomplete` 가 `disabled` 전이를 감지해 `setOpen(false)`+blur 타이머 정리를 강제한다.
   * disabled 요소는 React 가 onBlur 를 발화하지 않아 open 이 true 로 고착되던 것을, disabled effect 로
   * 직접 끊는다 → `displayValue = open ? draft : selectedLabel` 이 selectedLabel(상호)로 복원된다.
   *
   * 아래는 **원 결함의 메커니즘**(fix 대상)이다 — 이 단언들이 실패하면 그 회귀가 돌아온 것이다.
   *
   * **원 결함 메커니즘(전 단계 라이브 실측으로 확정, 지금은 fix 됨)**:
   *  1. `SlipDetailPage:511-522` 매출 인라인 편집 진입 effect 가
   *     `input:not([readonly]):not([disabled])` **첫 요소에 focus** 한다. 주석이 명시하듯
   *     readonly(판매번호)를 건너뛰므로 **첫 편집가능 필드 = 거래처 PartnerAutocomplete** 다.
   *     D-R8-7 이전엔 이 자리가 자유입력 `CollaborativeSlipInput`(`value={salesPartnerName}`)
   *     이라 포커스돼도 값이 그대로 보였다.
   *  2. focus → `AsyncAutocomplete.handleFocus` → `setDraft('')` + **`setOpen(true)`**
   *     (의도된 동작 — "열릴 때 draft 초기화 → 즉시 후보 표시").
   *  3. 곧이어 coedit effect 가 `setSlipFormCoeditPending(true)` → 거래처 input 이
   *     **`disabled={slipFormCoeditPending}`** 로 비활성 → 브라우저가 포커스를 떼지만
   *     **React 는 disabled 요소에 onBlur 를 발화하지 않는다** → `handleBlur` 미실행 →
   *     **`open` 이 true 로 고착**되고 `draft` 는 '' 로 남는다.
   *  4. `displayValue = open ? draft : selectedLabel` → **영구히 ''**.
   *     provider 로드 후 input 이 다시 활성화돼도 `open` 은 여전히 true 다.
   *
   * **실측 증거**: 모달 진입 직후 `거래처` 표시값 `""` · `aria-expanded="true"` · **포커스 없음** ·
   * 타 필드 클릭해도 `""` 유지(포커스가 없으니 blur 자체가 안 남) · 그러나 **직접 클릭 후 Escape
   * → `"한울냉열시스템"` 복원** = 값은 처음부터 state 에 있었고 **표시만** 깨졌다.
   * 저장 payload 는 정상(`partnerName`·`partnerId` 실림) → 데이터 파괴는 아니다.
   *
   * **왜 HIGH 인가**: (a) 거래처코드·사업자번호는 채워져 있는데 상호만 비어 **화면이 자기모순** —
   * 사용자는 거래처가 날아간 걸로 읽는다. (b) 그 오해의 자연스러운 대응이 **거래처 재선택**인데,
   * D-R8-7 이후 거래처 선택은 `partner_id` 갱신 + CRDT 전파 + **가격기억 재각인**을 유발하는
   * 실제 데이터 행위다 — 표시 버그가 사용자를 불필요한 쓰기로 민다. (c) `aria-expanded="true"`
   * 인데 popup 도 포커스도 없어 WAI-ARIA combobox 패턴 위반(스크린리더가 '확장됨·빈 값'으로 낭독).
   *
   * **왜 749→763 vitest 가 놓쳤나**: `SlipDetailPage` 는 **렌더 테스트 0건**이다. FE 배치가
   * 스스로 *"교체한 PartnerAutocomplete 경로는 typecheck + 순수함수 테스트로만 검증됨. 라이브 QA
   * 필수"* 라고 정직 고지했고, 이 결함이 정확히 그 구멍에서 나왔다.
   */
  test('R8-QA-9 [HIGH·fix 가드] 전표 수정 모달 진입 시 거래처 상호 정상 표시(partnerName) · aria-expanded 고착 없음', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    const slipId = await createBundlePlusSingleSlip(page, auth)

    // 전제 — 서버 상세는 거래처를 정상 보유한다.
    const detail = (await (await page.request.get(`${API_BASE}/slips/${slipId}`, { headers: authHeaders(auth) })).json()).data
    expect(detail.partnerName, 'R8-QA-9 전제: 전표에 거래처가 있어야 함').toBe(PARTNER.name)

    await openSalesEdit(page, slipId)
    const combo = page.getByRole('combobox', { name: '거래처' })
    // fix 안정화 대기 — disabled effect 가 open 고착을 끊고 selectedLabel 로 복원할 시간.
    await expect(combo).toHaveValue(PARTNER.name, { timeout: 15000 })
    await capture(page, '20-r8-qa-9-edit-modal-partner-renders-name')

    // 보조 필드도 채워져 있다(D-R8-7 파생 read-only 표시).
    expect(await page.getByLabel('거래처코드').inputValue(), 'R8-QA-9 전제: 거래처코드는 채워져 있음').not.toBe('')
    expect(await page.getByLabel('사업자번호').inputValue(), 'R8-QA-9 전제: 사업자번호는 채워져 있음').not.toBe('')

    // 🔴 fix 가드 1 — 거래처 상호가 정상 표시된다(옛 회귀=빈 칸). 실패하면 open 고착 회귀.
    expect(
      await combo.inputValue(),
      'R8-QA-9 fix 가드: 전표 수정 모달의 거래처 상호가 빈 칸 — open 고착 표시 회귀(AsyncAutocomplete disabled effect 미작동)',
    ).toBe(PARTNER.name)

    // 🔴 fix 가드 2 — 포커스도 popup 도 없는데 aria-expanded=true 로 고착되면 안 된다(WAI-ARIA combobox).
    expect(
      await combo.evaluate((el) => el === document.activeElement),
      'R8-QA-9 전제: 거래처 input 은 포커스를 갖고 있지 않음',
    ).toBe(false)
    expect(
      await combo.getAttribute('aria-expanded'),
      'R8-QA-9 fix 가드: 포커스도 popup 도 없는데 aria-expanded=true — open 고착 회귀(WAI-ARIA combobox 패턴 위반)',
    ).toBe('false')

    await ctx.close()
  })

  /**
   * R8-QA-10 [확인·fix 가드] — D-R8-7 의 **CRDT 헤더 partnerId 전파** 유지 + R8 fix 2차가 심은
   * **수정 모달 배너**가 변경 주체 창(A)에 노출되는지 실증.
   *
   * 두 계약을 함께 단언한다:
   *  1. **CRDT 전파(유지)** — 창A 가 거래처를 바꾸면 헤더 4필드가 창B 에 원자 전파된다
   *     (`handleSlipPartnerSelect` → provider.setHeaderValue ×4). 전파가 없으면 B 는 구 partnerId 로 저장.
   *  2. **배너 노출(신규 fix)** — R8-QA-11 fix 로 수정 모달도 거래처 변경 시 재조회+배너를 한다.
   *     변경 주체 창A 에 `sales-slip-edit-price-refresh-banner` 가 뜬다(size>0). R8 fix 1차엔 배너가
   *     아예 없어(R8-QA-10 원 실측 count=0) 사용자가 옛 단가 잔존을 몰랐다.
   *
   * 배너가 뜨려면 재조회로 라인 단가가 **바뀌어야** 하므로, 원격 거래처 B 에 단품의 다른 기억단가를
   * 미리 심어 hit→변경을 결정적으로 만든다.
   */
  test('R8-QA-10 [확인·fix 가드] 2창 coedit — 거래처 변경 CRDT 전파 유지 + 변경 주체 창에 재적용 배너 노출', async ({ browser }) => {
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    const auth = await login(pageA)
    await login(pageB)
    resetMemoryPairs([SINGLE.id])
    resetMemoryPairsFor(OTHER_PARTNER.id, [SINGLE.id])
    const slipId = await createBundlePlusSingleSlip(pageA, auth)
    // 원격 거래처 B 에 단품의 다른 기억단가를 심어 A 의 거래처 변경 재조회가 단품 라인을 바꾸게 한다.
    psql(
      `INSERT INTO partner_product_price_memory (id, partner_id, product_id, unit_price, source,
         remembered_at, created_at, created_by, is_deleted)
       VALUES (gen_random_uuid(), '${OTHER_PARTNER.id}', '${SINGLE.id}', 999000, 'LINE_SAVE',
         TIMESTAMP '2026-01-03 04:05:06', CURRENT_TIMESTAMP, 'qa-r8-postfix2', FALSE)`,
    )

    await openSalesEdit(pageA, slipId)
    await openSalesEdit(pageB, slipId)
    await capture(pageB, '21-r8-qa-10-windowB-before-remote-partner-change')

    // 창A 가 거래처를 변경 — CRDT 헤더 4필드 원자 전파 + 새 거래처 기준 재조회.
    await pickAutocomplete(pageA, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await pageA.waitForTimeout(2500)
    await capture(pageA, '22-r8-qa-10-windowA-partner-changed-with-banner')

    // 🔴 fix 가드 1 — 변경 주체 창A 에 재적용 배너가 노출된다(R8 fix 1차엔 count=0 이었다).
    const bannerA = pageA.getByTestId('sales-slip-edit-price-refresh-banner')
    await expect(
      bannerA,
      'R8-QA-10 fix 가드: 거래처를 바꾼 창A 에 재적용 배너가 없음 — 수정 모달 배너 미이식(R8-QA-11 fix 회귀)',
    ).toBeVisible({ timeout: 15000 })
    const bannerTextA = ((await bannerA.textContent()) ?? '').trim()
    console.log('[R8-QA-10] 창A 배너 문구:', JSON.stringify(bannerTextA))
    expect(bannerTextA.length, 'R8-QA-10: 창A 배너가 빈 텍스트').toBeGreaterThan(0)

    // 🔴 유지 단언 2 — CRDT 전파: B 의 사업자번호가 새 거래처 것으로 바뀌어야 한다.
    const bizA = await pageA.getByLabel('사업자번호').inputValue()
    await expect(
      pageB.getByLabel('사업자번호'),
      'R8-QA-10: 창A 의 거래처 변경이 창B 에 CRDT 전파되지 않음 — B 는 구 partnerId 로 저장하게 된다',
    ).toHaveValue(bizA, { timeout: 20000 })
    await capture(pageB, '23-r8-qa-10-windowB-received-remote-partner-change')

    // 📋 관측 — 배너는 로컬 state 라 원격 피어 B 에는 전파되지 않는다(고지된 갭 · fix 대상 아님).
    const bannerBcount = await pageB.getByTestId('sales-slip-edit-price-refresh-banner')
      .filter({ hasText: '거래처 변경으로' }).count()
    console.log(`[R8-QA-10] 배너 노출 — 창A(변경 주체)=1(단언) / 창B(원격 피어) 채워짐=${bannerBcount}(고지된 갭)`)

    await ctxA.close()
    await ctxB.close()
  })

  /**
   * R8-QA-11-HIT [HIGH·fix 가드] — D-R8-10/R8-QA-11 fix 의 **핵심 교정**을 실증한다.
   * 새 거래처 B 가 이 품목의 기억단가를 **보유**할 때, 수정 모달에서 거래처만 A→B 로 바꾸면:
   *  1. 새 거래처 기준 **bulk 재조회**가 발동한다(POST /slips/price-memory/bulk).
   *  2. **재적용 배너**가 뜨고 변경된 행이 **강조**된다.
   *  3. 라인 단가가 **B 기억단가의 VAT제외 환산값**(round(기억/1.1) — BE createFromVatInclusive
   *     미러)으로 갱신된다(옛 A 단가 소거 + 도메인 정합). 포함값 직기입이면 저장 ×1.1 재적용으로
   *     기억이 ~10% 복리 팽창한다(R8 잔여2 — fix 2차 재fix 로 해소, 이 테스트가 그 가드).
   *  4. 저장 후 B 기억 = **수렴 고정점**(필드 × 1.1 scale2)이고 **옛 A 단가가 각인되지 않는다**
   *     (교차 거래처 오염 차단 — 이게 본질).
   *
   * fix 전(R8 fix 1차): 수정 모달엔 재조회가 0건이라 A 의 협상단가가 B 로 그대로 넘어가 B 의
   * '거래처 최근단가' 로 둔갑했다(마커가 거짓말). fix 는 공용 훅 usePartnerPriceRefresh 를 모달에
   * 이식해 hit 케이스를 바로잡고, 재fix(잔여2)가 VAT 도메인 변환(utils/vatPrice.ts)을 더했다.
   */
  test('R8-QA-11-HIT [HIGH·fix 가드] 수정 모달 거래처 A→B(B 에 기억 보유) → 재조회+배너+강조·라인 B 기준 갱신·B 에 옛 A 단가 미각인', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPairs([UI_HIT.id])
    resetMemoryPairsFor(OTHER_PARTNER.id, [UI_HIT.id])

    // 거래처 A 와 협상한 단가 — A 에만 유효. B 에 각인되면 오염이다.
    const NEGOTIATED_FOR_A = 913000
    const pollutedOnB = '1004300.00/LINE_SAVE' // 913000 × 1.1 — B 에 나타나면 안 되는 값
    // 거래처 B 가 이 품목에 대해 이미 보유한(A 와 무관한) 다른 기억단가(VAT 포함 도메인).
    const B_MEMORY = 500000
    // [R8 잔여2 fix — VAT 드리프트 해소] 수정 필드는 VAT 제외 공급단가이므로 재조회는 기억값을
    // ÷1.1 원 단위 HALF_UP(BE SlipLine.createFromVatInclusive 미러)으로 변환 기입한다:
    //   필드 = round(500000 / 1.1) = 454545
    // 저장 시 BE collectPriceMemory 가 ×1.1 scale2 로 복원해 수렴 고정점에 도달한다:
    //   B 기억 = 454545 × 1.1 = 499999.50 (이후 재저장에도 불변 — 종전 ×1.1 복리 팽창 없음)
    // 값 2개는 BE 세만틱에서 손계산한 독립 기대값이다(FE 수식 재사용 아님 — 동어반복 방지).
    const B_FIELD_EXPECTED = '454545'
    const bRoundTrip = '499999.50/LINE_SAVE'

    const created = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'OUTBOUND', partnerId: PARTNER.id, partnerName: PARTNER.name,
        sourceWarehouseId: WAREHOUSE,
        lines: [{ productId: UI_HIT.id, quantity: 1, unitPrice: NEGOTIATED_FOR_A }],
      },
    })
    expect(created.ok(), 'R8-QA-11-HIT 전제: 전표 생성').toBeTruthy()
    const slipId = (await created.json()).data.id as string
    expect(memoryOf(UI_HIT.id), 'R8-QA-11-HIT 전제: A 의 협상단가가 A 에 기억됨').toBe(pollutedOnB)
    // B 에 다른 기억단가를 심는다 → 거래처 변경 시 hit 재조회가 라인을 바꾼다.
    psql(
      `INSERT INTO partner_product_price_memory (id, partner_id, product_id, unit_price, source,
         remembered_at, created_at, created_by, is_deleted)
       VALUES (gen_random_uuid(), '${OTHER_PARTNER.id}', '${UI_HIT.id}', ${B_MEMORY}, 'LINE_SAVE',
         TIMESTAMP '2026-01-02 03:04:05', CURRENT_TIMESTAMP, 'qa-r8-postfix2', FALSE)`,
    )
    expect(memoryOfFor(OTHER_PARTNER.id, UI_HIT.id), 'R8-QA-11-HIT 전제: B 는 자기 기억단가 보유').toBe(`${B_MEMORY}.00/LINE_SAVE`)

    const calls: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/slips/price-memory')) calls.push(`${r.method()} ${r.url()}`)
    })

    await openSalesEdit(page, slipId)
    const priceField = page.getByLabel('단가(VAT포함) 1')
    expect((await priceField.inputValue()).replace(/[^0-9]/g, ''), '전제: 진입 시 라인=A 단가').toBe(String(NEGOTIATED_FOR_A))
    await capture(page, '24-r8-qa-11-hit-edit-modal-partnerA-price-913000')

    // 거래처만 B 로 변경 — 단가는 손대지 않는다.
    await pickAutocomplete(page, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await page.waitForTimeout(2500)
    await capture(page, '25-r8-qa-11-hit-partner-switched-to-B-reprice-banner-highlight')

    // 🔴 fix 가드 1 — 새 거래처 기준 bulk 재조회 발동.
    const bulk = calls.filter((c) => c.includes('/slips/price-memory/bulk'))
    console.log('[R8-QA-11-HIT] price-memory 호출:', JSON.stringify(calls))
    expect(bulk.length, 'R8-QA-11-HIT fix 가드: 거래처 변경 시 bulk 재조회 미발동(모달 재조회 부재 회귀)').toBeGreaterThan(0)

    // 🔴 fix 가드 2 — 재적용 배너 노출 + 변경행 강조.
    await expect(
      page.getByTestId('sales-slip-edit-price-refresh-banner'),
      'R8-QA-11-HIT fix 가드: 거래처 변경 재적용 배너 미표시',
    ).toBeVisible({ timeout: 10000 })
    expect(
      await page.locator('tr.price-memory-refreshed-row').count(),
      'R8-QA-11-HIT fix 가드: 변경행 강조(price-memory-refreshed-row) 미적용',
    ).toBeGreaterThan(0)
    await expect(
      page.getByRole('note', { name: /이 거래처에 마지막으로 저장된 단가/ }),
      'R9-QA #14: HIT 수정 모달 마커 미표시',
    ).toHaveText('거래처 최근단가')

    // 🔴 fix 가드 3 — 라인 단가가 B 기억의 VAT제외 환산값으로 갱신(옛 A 단가 소거 + 도메인 정합).
    //    기억(포함 500000)을 그대로 기입하면 저장 ×1.1 재적용으로 기억이 550000 으로 팽창한다
    //    (구 드리프트 — 이 단언이 그 회귀도 잡는다: 500000 이 보이면 실패).
    const priceAfter = (await priceField.inputValue()).replace(/[^0-9]/g, '')
    console.log(`[R8-QA-11-HIT] 거래처 변경 후 라인 단가=${priceAfter} (기대=round(${B_MEMORY}/1.1)=${B_FIELD_EXPECTED})`)
    expect(
      priceAfter,
      `R8-QA-11-HIT fix 가드: 거래처 변경 후 라인 단가가 B 기억의 제외환산(${B_FIELD_EXPECTED})이 아님 — 옛 A 단가 잔존 or VAT 드리프트 회귀(포함값 ${B_MEMORY} 직기입)`,
    ).toBe(B_FIELD_EXPECTED)

    const putRes = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: '저장', exact: true }).first().click()
    expect((await putRes).status(), 'R8-QA-11-HIT: 저장 PUT').toBe(200)
    await page.waitForTimeout(2500)
    await capture(page, '26-r8-qa-11-hit-saved-partnerB')
    const bMemAfter = memoryOfFor(OTHER_PARTNER.id, UI_HIT.id)
    const aMemAfter = memoryOf(UI_HIT.id)
    console.log(`[R8-QA-11-HIT] 저장 후 기억 — A=${aMemAfter} · B=${bMemAfter}`)

    // 🔴 fix 가드 4 (본질) — B 에 옛 A 협상단가가 각인되면 안 된다(엄밀).
    expect(
      bMemAfter,
      `R8-QA-11-HIT: A(${PARTNER.name}) 협상단가 ${NEGOTIATED_FOR_A} 이 B(${OTHER_PARTNER.name}) 최근단가로 각인됨 — 교차 거래처 오염`,
    ).not.toBe(pollutedOnB)
    // B 는 자기 기준 수렴 고정점(필드 454545 저장 → ×1.1 = 499999.50)으로 각인된다.
    // 550000.00 이 나오면 VAT 드리프트 회귀(포함값 직기입 → ×1.1 복리 팽창)다.
    expect(bMemAfter, 'R8-QA-11-HIT: B 기억이 수렴 고정점(499999.50)이 아님 — VAT 드리프트 회귀 의심').toBe(bRoundTrip)
    // A 기억은 그대로 보존(변경 저장이 A 를 건드리지 않음).
    expect(aMemAfter, 'R8-QA-11-HIT: 원 거래처 A 기억이 변조됨').toBe(pollutedOnB)

    await ctx.close()
  })

  /**
   * R8-QA-11-MISS [HIGH·fix 가드] — 새 거래처 B 가 이 품목의 기억이 **없을** 때(miss). R8 잔여1 fix
   * (모달 miss fallback = 카탈로그 판매가, POST /api/products/lookup)의 라이브 실증.
   *
   * fix 전(직전 라운드 라이브 RED 실측): 모달 라인은 카탈로그 판매가를 안 들고 있어 miss fallback =
   * 현재단가(=옛 A 협상가) → `changed=false` → 무배너·무강조 → 저장 시 A 협상 777,000 이 B 에
   * 854,700.00 으로 무고지 각인됐다(잔여결함으로 RED 박제 — r8-postfix2 1차 실행분).
   *
   * fix 후 기대(전부 단언): 거래처 변경 시 라인이 **카탈로그 판매가의 VAT제외 환산값**으로 전환되고
   * 배너·강조로 고지되며, 저장 후 B 기억 = **카탈로그 라운드트립 고정점**(round(카탈로그/1.1) × 1.1
   * scale2)이고 **A 협상가는 미각인**이다.
   *
   * 🔴 판정력 전제(코인시던스 가드): 카탈로그 유래 기대값이 A 오염값과 **달라야** 오염 여부를 판정
   * 가능하다. 카탈로그 판매가를 라이브 조회해 보고하고, 우연히 일치하면 즉시 실패시켜 품목 교체를
   * 지시한다(우연 일치 green 수용 금지). 카탈로그 미확보(판매가 null) 품목이면 이 테스트 전제가
   * 깨진 것이므로 그것도 명시적으로 실패한다(그 경우 FE 정직 한계 = 현재값 유지가 스펙).
   */
  test('R8-QA-11-MISS [HIGH·fix 가드] 수정 모달 거래처 A→B(B 기억 없음) → 카탈로그 판매가로 전환·배너 고지·옛 A 단가 미각인', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPairs([UI_MISS.id])
    resetMemoryPairsFor(OTHER_PARTNER.id, [UI_MISS.id])

    const NEGOTIATED_FOR_A = 777000
    const pollutedOnB = '854700.00/LINE_SAVE' // 777000 × 1.1 — B 에 나타나면 오염(fix 회귀)

    // 카탈로그 판매가(VAT 포함 도메인) 라이브 실측 — miss fallback 의 원천이자 기대값의 근거.
    // FE 와 같은 엔드포인트지만 기대값 산식은 BE 세만틱(÷1.1 원 단위 HALF_UP → ×1.1 scale2)에서
    // 독립 유도한다. 실측 2026-07-16: AC300CNCDEH-78 = 1,440,000 → 필드 1,309,091 → 기억 1,440,000.10.
    const lookupRes = await page.request.post(`${API_BASE}/api/products/lookup`, {
      headers: authHeaders(auth), data: { ids: [UI_MISS.id] },
    })
    expect(lookupRes.ok(), 'R8-QA-11-MISS 전제: 카탈로그 lookup 실패').toBeTruthy()
    const lookupRows = ((await lookupRes.json()).data ?? []) as Array<Record<string, unknown>>
    const missCatalog = Number(lookupRows.find((r) => r['id'] === UI_MISS.id)?.['sellingPrice'])
    console.log(`[R8-QA-11-MISS] UI_MISS(${UI_MISS.model}) 실 카탈로그 판매가(VAT포함) = ${missCatalog}`)
    expect(Number.isFinite(missCatalog) && missCatalog > 0,
      `R8-QA-11-MISS 전제: 카탈로그 판매가 미확보(${missCatalog}) — miss fallback 스펙상 현재값 유지가 되어 이 테스트로 오염 차단을 실증할 수 없다(품목 교체 필요)`,
    ).toBe(true)
    const missFieldExpected = String(Math.round(missCatalog / 1.1)) // BE createFromVatInclusive 미러(원 단위)
    const missMemoryExpected = `${(Math.round(missCatalog / 1.1) * 1.1).toFixed(2)}/LINE_SAVE` // BE collectPriceMemory 미러(scale2)
    // 코인시던스 가드 — 기대값이 A 오염값과 같으면 판정 불능이므로 즉시 실패(품목 교체 지시).
    expect(missMemoryExpected,
      `R8-QA-11-MISS 판정력 전제: 카탈로그 유래 기대값(${missMemoryExpected})이 A 오염값(${pollutedOnB})과 우연 일치 — 오염/정상 판정 불가, UI_MISS 품목 교체 필요`,
    ).not.toBe(pollutedOnB)

    const created = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'OUTBOUND', partnerId: PARTNER.id, partnerName: PARTNER.name,
        sourceWarehouseId: WAREHOUSE,
        lines: [{ productId: UI_MISS.id, quantity: 1, unitPrice: NEGOTIATED_FOR_A }],
      },
    })
    expect(created.ok(), 'R8-QA-11-MISS 전제: 전표 생성').toBeTruthy()
    const slipId = (await created.json()).data.id as string
    expect(memoryOf(UI_MISS.id), 'R8-QA-11-MISS 전제: A 의 협상단가가 A 에 기억됨').toBe(pollutedOnB)
    expect(memoryOfFor(OTHER_PARTNER.id, UI_MISS.id), 'R8-QA-11-MISS 전제: B 에는 기억 없음(miss)').toBe('NONE')

    await openSalesEdit(page, slipId)
    await capture(page, '27-r8-qa-11-miss-edit-modal-partnerA-price-777000')

    await pickAutocomplete(page, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await page.waitForTimeout(2500)

    // 🔴 fix 가드 1 — miss 라인이 카탈로그 판매가(제외환산)로 전환 + 배너 고지 + 변경행 강조.
    //    fix 전엔 배너=0·라인=옛 A 단가 잔존이었다(라이브 RED 실측).
    await expect(
      page.getByTestId('sales-slip-edit-price-refresh-banner'),
      'R8-QA-11-MISS fix 가드: miss 재적용 배너 미표시(카탈로그 fallback 미작동 — 잔여결함 회귀)',
    ).toBeVisible({ timeout: 10000 })
    const priceAfter = (await page.getByLabel('단가(VAT포함) 1').inputValue()).replace(/[^0-9]/g, '')
    console.log(`[R8-QA-11-MISS] 거래처 변경 후 라인 단가=${priceAfter} (기대=round(${missCatalog}/1.1)=${missFieldExpected} · 옛 A=${NEGOTIATED_FOR_A})`)
    expect(
      priceAfter,
      `R8-QA-11-MISS fix 가드: miss 라인이 카탈로그 판매가 제외환산(${missFieldExpected})으로 전환되지 않음 — 옛 A 단가(${NEGOTIATED_FOR_A}) 잔존이면 잔여결함 회귀`,
    ).toBe(missFieldExpected)
    expect(
      await page.locator('tr.price-memory-refreshed-row').count(),
      'R8-QA-11-MISS fix 가드: 변경행 강조 미적용',
    ).toBeGreaterThan(0)
    await expect(
      page.getByRole('note', { name: '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다' }),
      'R9-QA #14: MISS 수정 모달 마커 미표시',
    ).toHaveText('판매가')
    await capture(page, '28-r8-qa-11-miss-partner-switched-to-B-catalog-fallback-banner')

    const putRes = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${slipId}/sales`),
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: '저장', exact: true }).first().click()
    expect((await putRes).status(), 'R8-QA-11-MISS: 저장 PUT').toBe(200)
    await page.waitForTimeout(2500)
    const bMemAfter = memoryOfFor(OTHER_PARTNER.id, UI_MISS.id)
    const aMemAfter = memoryOf(UI_MISS.id)
    console.log(`[R8-QA-11-MISS] 저장 후 기억 — A=${aMemAfter} · B=${bMemAfter} (기대 B=${missMemoryExpected})`)
    await capture(page, '29-r8-qa-11-miss-saved-partnerB-catalog-memory')

    // 🔴 fix 가드 2 (본질) — B 에 옛 A 협상단가가 각인되면 안 된다.
    expect(
      bMemAfter,
      `R8-QA-11-MISS: A(${PARTNER.name}) 협상단가 ${NEGOTIATED_FOR_A} 이 B(${OTHER_PARTNER.name}) 최근단가로 각인됨 — miss 카탈로그 fallback 회귀(교차 거래처 오염)`,
    ).not.toBe(pollutedOnB)
    // 🔴 fix 가드 3 — B 기억 = 카탈로그 라운드트립 고정점(엄밀 값).
    expect(
      bMemAfter,
      `R8-QA-11-MISS: B 기억이 카탈로그 라운드트립 고정점(${missMemoryExpected})이 아님 — 관측값이 BE VAT 수학과 불일치(결함)`,
    ).toBe(missMemoryExpected)
    // 🔴 fix 가드 4 — 원 거래처 A 기억은 그대로 보존.
    expect(aMemAfter, 'R8-QA-11-MISS: 원 거래처 A 기억이 변조됨').toBe(pollutedOnB)

    await ctx.close()
  })

  /**
   * R9-QA-4 [#9 fail-open 차단 + #3 저장 race + #14 마커] — 수정 모달의 카탈로그
   * batch lookup 자체가 실패한다. 가격기억 bulk 는 실 서버에서 B miss 를 반환하고,
   * lookup 요청은 Playwright가 도착을 관측한 뒤 503 장애만 주입한다(가격 값 합성 없음).
   * 대기 중에는 저장을 차단하고, 실패 확정 후에는 옛 A 단가를 유지하지 않고 공백 +
   * `단가 확인 필요` + 저장 차단으로 수렴해야 한다. B 기억행은 실 DB에서 NONE 이어야 한다.
   */
  test('R9-QA-4 [#9·#3·#14] 카탈로그 lookup 503 + B miss → in-flight 저장 disabled → UNAVAILABLE 공백·마커·저장 차단·미오염', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPairs([UI_MISS.id])
    resetMemoryPairsFor(OTHER_PARTNER.id, [UI_MISS.id])

    const OLD_A_PRICE = 777000
    const oldAMemory = '854700.00/LINE_SAVE'
    const created = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'OUTBOUND', partnerId: PARTNER.id, partnerName: PARTNER.name,
        sourceWarehouseId: WAREHOUSE,
        lines: [{ productId: UI_MISS.id, quantity: 1, unitPrice: OLD_A_PRICE }],
      },
    })
    expect(created.ok(), 'R9-QA-4 전제: 매출 전표 생성').toBeTruthy()
    const slipId = (await created.json()).data.id as string
    expect(memoryOf(UI_MISS.id), 'R9-QA-4 전제: A 옛 단가 기억').toBe(oldAMemory)
    expect(memoryOfFor(OTHER_PARTNER.id, UI_MISS.id), 'R9-QA-4 전제: B miss').toBe('NONE')

    let releaseCatalog!: () => void
    const catalogGate = new Promise<void>((resolve) => { releaseCatalog = resolve })
    await page.route('**/api/products/lookup', async (route) => {
      await catalogGate
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'R9 QA injected catalog outage' }),
      })
    })
    const putBodies: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes(`/slips/${slipId}/sales`)) {
        putBodies.push(request.postData() ?? '')
      }
    })

    await openSalesEdit(page, slipId)
    const lookupStarted = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/api/products/lookup'),
      { timeout: 15000 },
    )
    await pickAutocomplete(page, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await lookupStarted

    // #3 경합 가드: lookup hold 중 저장 불가 + busy 고지.
    const save = page.getByTestId('sales-slip-edit-save')
    await expect(save, 'R9-QA #3: 거래처 재조회 in-flight 중 저장 버튼이 활성').toBeDisabled()
    await expect(page.getByTestId('sales-slip-edit-price-refresh-banner')).toContainText('저장은 확인 완료 후 가능')
    await capture(page, '30-r9-qa-4-catalog-inflight-save-disabled')

    releaseCatalog()
    const unavailableMarker = page.getByRole('note', {
      name: '카탈로그 판매가를 확인할 수 없어 단가를 비웠습니다. 직접 입력해 주세요',
    })
    await expect(unavailableMarker, 'R9-QA #14: fail 마커 미표시').toHaveText('단가 확인 필요', { timeout: 15000 })
    await expect(page.getByLabel('단가(VAT포함) 1'), 'R9-QA #9: 카탈로그 미확보인데 옛 A 단가가 잔존').toHaveValue('')
    await expect(save, 'R9-QA #9: UNAVAILABLE 단가 미확인 상태에서 저장 활성').toBeDisabled()
    const banner = page.getByTestId('sales-slip-edit-price-refresh-banner')
    await expect(banner).toContainText('단가 확인 필요 1건')
    await expect(banner).toHaveAttribute('role', 'alert')
    expect(putBodies, 'R9-QA #9: disabled 상태에서 PUT 전송').toHaveLength(0)
    expect(memoryOfFor(OTHER_PARTNER.id, UI_MISS.id), 'R9-QA #9: 저장 차단인데 B 에 옛 A 단가 각인').toBe('NONE')
    expect(memoryOf(UI_MISS.id), 'R9-QA #9: A 기억 변조').toBe(oldAMemory)
    await capture(page, '31-r9-qa-4-catalog-unavailable-marker-save-blocked')

    await page.unroute('**/api/products/lookup')
    await ctx.close()
  })

  /**
   * R8-QA-13 + R9-QA-1 [BE per-line 라이브 API 가드] — 요청 마커만 보던 개수 게이트에서
   * 구성품별 lineId 대조로 강화된 계약을 실 DB 계보로 실증한다.
   *
   * 마커(lineIdContract=true)는 자기신고라, 계보 보유 문서에서 lineId 를 하나도 안 실으면 서버가
   * 마커만 보고 전 라인 교체를 수행해 세트 계보를 파괴할 수 있다(R8-QA-1 을 마커라는 다른 문으로
   * 재개방). D-R8-13 은 마커를 **라인 내용과 대조**해 그 우회를 차단한다:
   *  - Part 1: 계보 보유 + 마커 + lineId 0개 = **400 거부**(LINEAGE_REJECTION_MESSAGE) · 계보/구성품 기억 보존.
   *  - Part 1b: 구성품 1개 lineId 누락 + 익명 신규 라인 = **정확히 400**·계보 무손상.
   *  - Part 2: 전 구성품 lineId 유지 + 부분편집 + 익명 신규 라인 = **200**(과잉차단 없음).
   *  - Part 3: 계보 견적 `lines: []` 명시 전삭제 = **200**(익명 재생성과 구분).
   *  - Part 4: 계보 **없는** 평면 전표 + lineId 0개 전교체 = **200**(기존 오탐 가드 유지).
   */
  test('R9-QA-1 [BE per-line] 구성품 1 lineId 누락+익명 라인=400 / 전 ID 유지·명시 전삭제=200 / 계보 무손상', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)

    // ── Part 1: 계보 보유(BUNDLE_SET) 전표 — 마커 + lineId 전무 → 400 거부 ──
    resetMemoryPairs([COMP_HEAD.id, COMP_TAIL.id, SINGLE.id])
    const bundleSlipId = await createBundlePlusSingleSlip(page, auth)
    const beforeLineage = lineageOf(bundleSlipId)
    expect(beforeLineage, 'R8-QA-13 전제: 세트 계보').toBe(
      `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}|${SINGLE.model}:false:-`,
    )
    expect(memoryOf(COMP_HEAD.id), 'R8-QA-13 전제: head 구성품 미기억').toBe('NONE')
    expect(memoryOf(COMP_TAIL.id), 'R8-QA-13 전제: 구성품 미기억').toBe('NONE')
    await page.goto(`${BASE_URL}/sales/${bundleSlipId}`)
    await expect(page.getByText(COMP_HEAD.model).first()).toBeVisible({ timeout: 30000 })
    await capture(page, '30-r8-qa-13-bundle-slip-lineage-before-guard')

    const detail1 = (await (await page.request.get(`${API_BASE}/slips/${bundleSlipId}`, { headers: authHeaders(auth) })).json()).data
    const res1 = await page.request.put(`${API_BASE}/slips/${bundleSlipId}/sales`, {
      headers: authHeaders(auth),
      data: {
        updatedAt: detail1.updatedAt,
        lineIdContract: true, // 마커 O — require() 통과. 그러나 계보 보유 문서에 lineId 0개 → 계보 게이트 400.
        partnerId: detail1.partnerId, partnerName: detail1.partnerName, partnerCode: detail1.partnerCode,
        memo: detail1.memo, businessNumber: detail1.businessNumber,
        deliveryAddress: detail1.deliveryAddress, supervisionAddress: detail1.supervisionAddress,
        projectName: detail1.projectName, recipientPhone: detail1.recipientPhone, paymentDueDate: detail1.paymentDueDate,
        lines: detail1.lines.map((l: Record<string, unknown>) => ({
          productId: l['productId'], productName: l['productName'], modelName: l['modelName'],
          specification: l['specification'], quantity: l['quantity'],
          unitPrice: String(l['unitPrice']), note: l['note'], // lineId 전무(0개)
        })),
      },
    })
    expect(res1.status(), 'R8-QA-13 Part1: 계보 보유 + 마커 + lineId 0개 → 400 거부').toBe(400)
    const body1 = await res1.json().catch(() => ({}))
    console.log('[R8-QA-13] Part1 400 message:', JSON.stringify(body1.message ?? ''))
    // 마커 부재 사유(REJECTION_MESSAGE '구버전 앱…')가 아니라 계보 사유(LINEAGE_REJECTION_MESSAGE)
    // 로 거부돼야 한다. [R9 실측 확정] BE R9 가 개수 게이트를 per-line 대조로 강화하며 메시지를
    // "일부 세트 구성품의 기존 라인 정보(lineId)가 누락된 채…" 단일본으로 통합했다(구
    // "…전체 교체할 수 없습니다" 문구는 BE 소스에서 소멸 — grep 0건). 전무(0개) 케이스도
    // per-line 판정(E⊄R + 익명 라인 존재)에 포섭되므로 같은 메시지가 정답이다.
    expect(
      String(body1.message ?? ''),
      'R8-QA-13 Part1: 400 사유가 계보 거부(LINEAGE_REJECTION_MESSAGE)가 아님 — 다른 게이트가 선차단',
    ).toContain('세트 구성품의 기존 라인 정보')
    // 거부됐으므로 계보 무손상 + 구성품 기억 미각인.
    expect(lineageOf(bundleSlipId), 'R8-QA-13 Part1: 거부된 PUT 이 세트 계보를 건드림').toBe(beforeLineage)
    expect(memoryOf(COMP_HEAD.id), 'R8-QA-13 Part1: 거부됐는데 head 구성품 배분가 각인됨').toBe('NONE')
    expect(memoryOf(COMP_TAIL.id), 'R8-QA-13 Part1: 거부됐는데 구성품 배분가 각인됨').toBe('NONE')
    await page.reload()
    await expect(page.getByText(COMP_HEAD.model).first()).toBeVisible({ timeout: 30000 })
    await capture(page, '31-r8-qa-13-bundle-lineage-preserved-after-400')

    // ── Part 1b: 구성품 1개 ID 누락 + 익명 신규 라인 → 정확히 400 ──
    const mirrorSlipLine = (line: Record<string, unknown>) => ({
      lineId: line['id'],
      productId: line['productId'], productName: line['productName'], modelName: line['modelName'],
      specification: line['specification'], quantity: line['quantity'], unitPrice: String(line['unitPrice']), note: line['note'],
    })
    const head = (detail1.lines as Array<Record<string, unknown>>).find((line) => line['productId'] === COMP_HEAD.id)
    const single = (detail1.lines as Array<Record<string, unknown>>).find((line) => line['productId'] === SINGLE.id)
    expect(head && single, 'R9-QA-1 Part1b 전제: head/단품 라인 응답 미확보').toBeTruthy()
    const partialReject = await page.request.put(`${API_BASE}/slips/${bundleSlipId}/sales`, {
      headers: authHeaders(auth),
      data: {
        updatedAt: detail1.updatedAt,
        lineIdContract: true,
        partnerId: detail1.partnerId, partnerName: detail1.partnerName, partnerCode: detail1.partnerCode,
        memo: detail1.memo, businessNumber: detail1.businessNumber,
        deliveryAddress: detail1.deliveryAddress, supervisionAddress: detail1.supervisionAddress,
        projectName: detail1.projectName, recipientPhone: detail1.recipientPhone, paymentDueDate: detail1.paymentDueDate,
        lines: [
          mirrorSlipLine(head!), // head lineId 유지
          mirrorSlipLine(single!), // 평면 단품 lineId 유지
          // tail lineId 누락 + 익명 신규. [R9 실측] BE @NotBlank(productName) 신설로 불완전
          // payload 는 계보 게이트 이전에 "품목명은 필수입니다" 400 으로 선차단된다 — 계보
          // 게이트를 겨냥하도록 실 카탈로그 값으로 완전한 라인을 보낸다(AC200CNCDEH-77 실측명).
          { productId: UI_HIT.id, productName: '삼성 천장형 4톤', modelName: UI_HIT.model,
            specification: null, quantity: 1, unitPrice: '150000', note: null },
        ],
      },
    })
    expect(partialReject.status(), 'R9-QA-1 Part1b: 구성품 1 ID 누락+익명 라인은 정확히 400').toBe(400)
    const partialBody = await partialReject.json().catch(() => ({}))
    expect(String(partialBody.message ?? ''), 'R9-QA-1 Part1b: 다른 게이트가 선차단').toContain('세트 구성품의 기존 라인 정보')
    expect(lineageOf(bundleSlipId), 'R9-QA-1 Part1b: 400 후 계보 변형').toBe(beforeLineage)
    expect(memoryOf(COMP_TAIL.id), 'R9-QA-1 Part1b: 거부된 tail 배분가 각인').toBe('NONE')

    // ── Part 2: 전 구성품 ID 유지 + 부분편집 + 익명 신규 라인 → 200 ──
    const retainedCreated = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'OUTBOUND', partnerId: PARTNER.id, partnerName: PARTNER.name,
        sourceWarehouseId: WAREHOUSE,
        lines: [{ productId: BUNDLE.id, quantity: 1, unitPrice: 1000000 }],
      },
    })
    expect(retainedCreated.ok(), 'R9-QA-1 Part2 전제: 순세트 전표 생성').toBeTruthy()
    const retainedSlipId = (await retainedCreated.json()).data.id as string
    const retainedDetail = (await (await page.request.get(`${API_BASE}/slips/${retainedSlipId}`, { headers: authHeaders(auth) })).json()).data
    const retainedLines = (retainedDetail.lines as Array<Record<string, unknown>>).map((line, index) => ({
      ...mirrorSlipLine(line),
      quantity: index === 0 ? Number(line['quantity']) + 1 : line['quantity'],
    }))
    const retainedUpdate = await page.request.put(`${API_BASE}/slips/${retainedSlipId}/sales`, {
      headers: authHeaders(auth),
      data: {
        updatedAt: retainedDetail.updatedAt,
        lineIdContract: true,
        partnerId: retainedDetail.partnerId, partnerName: retainedDetail.partnerName, partnerCode: retainedDetail.partnerCode,
        memo: retainedDetail.memo, businessNumber: retainedDetail.businessNumber,
        deliveryAddress: retainedDetail.deliveryAddress, supervisionAddress: retainedDetail.supervisionAddress,
        projectName: retainedDetail.projectName, recipientPhone: retainedDetail.recipientPhone, paymentDueDate: retainedDetail.paymentDueDate,
        // [R9 실측 확정] 수정 경로 익명 신규 라인은 create 경로와 달리 카탈로그 이름 보강이 없어
        // productName 누락 시 slip_lines.product_name NOT NULL(23502) → 409 로 실패한다(계보
        // 게이트와 무관·실 데스크톱은 항상 이름을 실음). 실 카탈로그 값으로 완전한 라인을 보낸다.
        lines: [...retainedLines, {
          productId: SINGLE.id, productName: '삼성 천장형 20톤', modelName: SINGLE.model,
          specification: null, quantity: 1, unitPrice: '450000', note: null,
        }],
      },
    })
    expect(retainedUpdate.status(), 'R9-QA-1 Part2: 전 구성품 ID 유지+익명 신규는 200').toBe(200)
    expect(lineageOf(retainedSlipId), 'R9-QA-1 Part2: 정상 부분편집 후 계보 손상').toBe(
      `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}|${SINGLE.model}:false:-`,
    )

    // ── Part 3: 계보 견적 lines: [] 명시 전삭제 → 200 ──
    const estimateCreated = await page.request.post(`${API_BASE}/slips/estimates`, {
      headers: authHeaders(auth),
      data: {
        partnerId: PARTNER.id, partnerName: PARTNER.name,
        lines: [{ productId: BUNDLE.id, quantity: 1, unitPrice: '1000000', priceVatInclusive: true }],
      },
    })
    expect(estimateCreated.ok(), 'R9-QA-1 Part3 전제: 세트 견적 생성').toBeTruthy()
    const estimateId = (await estimateCreated.json()).data.id as string
    expect(psql(`SELECT count(*) FROM estimate_lines WHERE estimate_id='${estimateId}' AND is_deleted=false AND parent_set_model IS NOT NULL`), 'R9-QA-1 Part3 전제: 견적 계보').toBe('2')
    const estimateDetail = (await (await page.request.get(`${API_BASE}/slips/estimates/${estimateId}`, { headers: authHeaders(auth) })).json()).data
    const estimateDelete = await page.request.put(`${API_BASE}/slips/estimates/${estimateId}`, {
      headers: authHeaders(auth),
      data: {
        lineIdContract: true,
        partnerId: estimateDetail.partnerId, partnerName: estimateDetail.partnerName,
        partnerBusinessNo: estimateDetail.partnerBusinessNo, partnerAddress: estimateDetail.partnerAddress,
        validUntil: estimateDetail.validUntil, memo: estimateDetail.memo,
        lines: [],
      },
    })
    expect(estimateDelete.status(), 'R9-QA-1 Part3: lines:[] 명시 전삭제는 200').toBe(200)
    expect(psql(`SELECT count(*) FROM estimate_lines WHERE estimate_id='${estimateId}' AND is_deleted=false`), 'R9-QA-1 Part3: 명시 전삭제 미반영').toBe('0')

    // ── Part 4: 계보 없는 평면 전표 — 마커 + lineId 전무(전 라인 교체) → 정상 200(오탐 금지) ──
    const flatCreated = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'OUTBOUND', partnerId: PARTNER.id, partnerName: PARTNER.name,
        sourceWarehouseId: WAREHOUSE,
        lines: [{ productId: SINGLE.id, quantity: 1, unitPrice: 400000 }],
      },
    })
    expect(flatCreated.ok(), 'R8-QA-13 Part4 전제: 평면 전표 생성').toBeTruthy()
    const flatSlipId = (await flatCreated.json()).data.id as string
    expect(
      psql(`SELECT count(*) FROM slip_lines WHERE slip_id='${flatSlipId}' AND is_deleted=false AND parent_set_model IS NOT NULL`),
      'R8-QA-13 Part4 전제: 평면 전표는 계보 없음',
    ).toBe('0')

    const detail2 = (await (await page.request.get(`${API_BASE}/slips/${flatSlipId}`, { headers: authHeaders(auth) })).json()).data
    const NEW_FLAT_PRICE = '450000'
    const res2 = await page.request.put(`${API_BASE}/slips/${flatSlipId}/sales`, {
      headers: authHeaders(auth),
      data: {
        updatedAt: detail2.updatedAt,
        lineIdContract: true,
        partnerId: detail2.partnerId, partnerName: detail2.partnerName, partnerCode: detail2.partnerCode,
        memo: detail2.memo, businessNumber: detail2.businessNumber,
        deliveryAddress: detail2.deliveryAddress, supervisionAddress: detail2.supervisionAddress,
        projectName: detail2.projectName, recipientPhone: detail2.recipientPhone, paymentDueDate: detail2.paymentDueDate,
        lines: detail2.lines.map((l: Record<string, unknown>) => ({
          productId: l['productId'], productName: l['productName'], modelName: l['modelName'],
          specification: l['specification'], quantity: l['quantity'],
          unitPrice: NEW_FLAT_PRICE, note: l['note'], // lineId 전무 = 전 라인 교체(정상)
        })),
      },
    })
    expect(res2.status(), 'R8-QA-13 Part4: 평면 전표 전라인 교체(lineId 0개)는 정상 200 — 오탐 금지').toBe(200)
    // 교체가 실제로 반영됐는지(활성 라인 단가 갱신).
    expect(
      psql(`SELECT unit_price FROM slip_lines WHERE slip_id='${flatSlipId}' AND is_deleted=false`),
      'R8-QA-13 Part4: 전 라인 교체가 반영되지 않음',
    ).toBe('450000.00')
    await page.goto(`${BASE_URL}/sales/${flatSlipId}`)
    await expect(page.getByText(SINGLE.model).first()).toBeVisible({ timeout: 30000 })
    await capture(page, '32-r8-qa-13-flat-slip-full-replace-200')

    await ctx.close()
  })

  /**
   * R8-QA-14 [회귀 가드·신설] — R8 재fix 회귀 교정(모달 재가격의 세트 구성품 제외) 라이브 실증.
   *
   * 직전 라이브 관측(회귀): 모달 거래처 변경 재조회의 카탈로그 fallback 이 **세트 구성품 라인에도**
   * 적용돼 배분가가 ÷1.1 변형됐다(88,000→80,000 · 55,000→50,000 — DB 실측, 전표 2026/07/16-94).
   * fix = `bundleComponentLineIds`(parentSetModel 비공백, head 포함 — BE isBundleComponent 미러)
   * 라인을 재가격 후보에서 제외. 구성품 배분가는 세트 전개가 정한 값이라 거래처 변경으로
   * 재가격되면 안 된다.
   *
   * 🔑 **bait 설계 — "miss 라서 안 바뀜" 반증 봉쇄**: 새 거래처 B 에 구성품 품목의 기억단가
   * (999,000)를 미리 심는다. 제외가 없다면 그 hit 가 구성품 필드를 round(999000/1.1)=908,182 로
   * 바꿨을 것이다. 필드가 불변이면 "기억이 없어서" 가 아니라 **"계보 제외라서"** 임이 증명된다.
   *
   * Part 1 (순세트 전표 — 구성품 2행뿐): 재가격 대상 0 → **재조회 API 호출 자체가 0**(bulk 0 ·
   *   products/lookup 0), 배너 미표시, 강조 0, 구성품 필드 88,000/55,000 불변. 저장 후 DB 배분가
   *   보존 + 계보 보존 + B 기억 delta 0(bait 불변·tail NONE).
   * Part 2 (혼합 전표 — 구성품 2 + 단품 1): **단품만** 재가격(bulk·lookup 요청 body 에 단품
   *   productId 만 — 구성품 productId 미포함), 배너 표시, 강조 1행, 구성품 불변·단품은 B 기억
   *   기준(770,000→필드 700,000). 저장 후 DB: 구성품 88,000/55,000 + 단품 700,000, B 기억 =
   *   단품 770,000.00(고정점)·구성품 bait 불변, A 기억 불변.
   */
  test('R8-QA-14 [회귀 가드·신설] 모달 거래처 변경 재가격 — 세트 구성품 제외(배분가 불변) · 순세트=재조회 0 · 혼합=단품만', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)

    const BAIT_B_COMPONENT = 999000 // B 에 심는 구성품 기억 bait — 적용되면 필드 908182 로 변형됐을 값
    const seedBait = (productId: string) => {
      resetMemoryPairsFor(OTHER_PARTNER.id, [productId])
      psql(
        `INSERT INTO partner_product_price_memory (id, partner_id, product_id, unit_price, source,
           remembered_at, created_at, created_by, is_deleted)
         VALUES (gen_random_uuid(), '${OTHER_PARTNER.id}', '${productId}', ${BAIT_B_COMPONENT}, 'LINE_SAVE',
           TIMESTAMP '2026-01-02 03:04:05', CURRENT_TIMESTAMP, 'qa-r8-postfix2-14', FALSE)`,
      )
    }
    const priceMemoryCalls: string[] = []
    const lookupCalls: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/slips/price-memory/bulk')) priceMemoryCalls.push(r.postData() ?? '')
      if (r.method() === 'POST' && r.url().includes('/api/products/lookup')) lookupCalls.push(r.postData() ?? '')
    })

    // ── Part 1: 순세트 전표(구성품 2행뿐) — 재가격 대상 0 → 재조회 자체가 없어야 한다 ──
    seedBait(COMP_HEAD.id) // 🔑 bait: 제외가 없다면 이 hit 가 head 필드를 908182 로 바꾼다.
    resetMemoryPairsFor(OTHER_PARTNER.id, [COMP_TAIL.id])
    const pureCreated = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'OUTBOUND', partnerId: PARTNER.id, partnerName: PARTNER.name,
        sourceWarehouseId: WAREHOUSE,
        lines: [{ productId: BUNDLE.id, quantity: 1, unitPrice: 1000000 }],
      },
    })
    expect(pureCreated.ok(), 'R8-QA-14 Part1 전제: 순세트 전표 생성').toBeTruthy()
    const pureSlipId = (await pureCreated.json()).data.id as string
    expect(lineageOf(pureSlipId), 'R8-QA-14 Part1 전제: 세트 전개 계보').toBe(
      `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}`,
    )

    await openSalesEdit(page, pureSlipId)
    await expect(page.getByLabel('단가(VAT포함) 1')).toHaveValue(/88,?000/)
    await expect(page.getByLabel('단가(VAT포함) 2')).toHaveValue(/55,?000/)
    await capture(page, '33-r8-qa-14-pure-set-edit-modal-components-88000-55000')

    await pickAutocomplete(page, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await page.waitForTimeout(2500)

    // 🔴 가드 1 — 구성품 필드 불변(bait hit 908182 도, 카탈로그 80000/50000 도 아님).
    await expect(
      page.getByLabel('단가(VAT포함) 1'),
      'R8-QA-14 Part1: head 배분가가 재가격됨(88,000 이탈) — 구성품 제외 회귀',
    ).toHaveValue(/^88,?000$/)
    await expect(
      page.getByLabel('단가(VAT포함) 2'),
      'R8-QA-14 Part1: tail 배분가가 재가격됨(55,000 이탈) — 구성품 제외 회귀',
    ).toHaveValue(/^55,?000$/)
    // 🔴 가드 2 — 재가격 대상 0 이므로 재조회 API 호출 자체가 없어야 한다(bulk 0 · lookup 0).
    console.log(`[R8-QA-14] Part1 재조회 호출 — bulk=${priceMemoryCalls.length} · products/lookup=${lookupCalls.length}`)
    expect(priceMemoryCalls.length, 'R8-QA-14 Part1: 순세트 전표인데 bulk 재조회 발생(구성품이 후보에 포함됨)').toBe(0)
    expect(lookupCalls.length, 'R8-QA-14 Part1: 순세트 전표인데 카탈로그 lookup 발생(구성품이 후보에 포함됨)').toBe(0)
    // 🔴 가드 3 — 재가격 대상 0 = 배너 미표시 · 강조 0.
    expect(
      await page.getByTestId('sales-slip-edit-price-refresh-banner').filter({ hasText: '거래처 변경으로' }).count(),
      'R8-QA-14 Part1: 재가격 대상 0 인데 재적용 배너 표시',
    ).toBe(0)
    expect(await page.locator('tr.price-memory-refreshed-row').count(), 'R8-QA-14 Part1: 강조 행 존재').toBe(0)
    await capture(page, '34-r8-qa-14-pure-set-partner-changed-no-banner-components-unchanged')

    const putRes1 = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${pureSlipId}/sales`),
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: '저장', exact: true }).first().click()
    expect((await putRes1).status(), 'R8-QA-14 Part1: 거래처 변경 저장 PUT').toBe(200)
    await page.waitForTimeout(2500)

    // 🔴 가드 4 — DB 배분가·계보 보존 + B 기억 delta 0(bait 불변·tail NONE).
    expect(
      psql(`SELECT string_agg(model_name || ':' || unit_price, '|' ORDER BY created_at)
              FROM slip_lines WHERE slip_id='${pureSlipId}' AND is_deleted=false`),
      'R8-QA-14 Part1: 저장 후 구성품 배분가가 DB 에서 변형됨(88,000/55,000 이탈)',
    ).toBe(`${COMP_HEAD.model}:88000.00|${COMP_TAIL.model}:55000.00`)
    expect(lineageOf(pureSlipId), 'R8-QA-14 Part1: 저장 후 계보 변형').toBe(
      `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}`,
    )
    expect(
      memoryOfFor(OTHER_PARTNER.id, COMP_HEAD.id),
      'R8-QA-14 Part1: B 의 head bait 기억이 변조됨(구성품이 각인 경로에 노출)',
    ).toBe(`${BAIT_B_COMPONENT}.00/LINE_SAVE`)
    expect(memoryOfFor(OTHER_PARTNER.id, COMP_TAIL.id), 'R8-QA-14 Part1: B 에 tail 기억이 생김(구성품 각인)').toBe('NONE')

    // ── Part 2: 혼합 전표(구성품 2 + 단품 1) — 단품만 재가격·구성품 불변 ──
    priceMemoryCalls.length = 0
    lookupCalls.length = 0
    seedBait(COMP_HEAD.id)
    resetMemoryPairsFor(OTHER_PARTNER.id, [COMP_TAIL.id])
    resetMemoryPairs([COMP_HEAD.id, COMP_TAIL.id, SINGLE.id])
    // B 의 단품 기억 = 770,000(포함) → 필드 round(770000/1.1)=700,000 → 저장 ×1.1 = 770,000.00 고정점.
    resetMemoryPairsFor(OTHER_PARTNER.id, [SINGLE.id])
    psql(
      `INSERT INTO partner_product_price_memory (id, partner_id, product_id, unit_price, source,
         remembered_at, created_at, created_by, is_deleted)
       VALUES (gen_random_uuid(), '${OTHER_PARTNER.id}', '${SINGLE.id}', 770000, 'LINE_SAVE',
         TIMESTAMP '2026-01-02 03:04:05', CURRENT_TIMESTAMP, 'qa-r8-postfix2-14', FALSE)`,
    )
    const mixedSlipId = await createBundlePlusSingleSlip(page, auth)
    const aSingleMemory = memoryOf(SINGLE.id) // 생성 각인(367840.00) — 저장 후 불변이어야 함
    expect(aSingleMemory, 'R8-QA-14 Part2 전제: A 단품 기억').toBe('367840.00/LINE_SAVE')

    await openSalesEdit(page, mixedSlipId)
    await expect(page.getByLabel('단가(VAT포함) 3')).toHaveValue(/334,?400/)
    await capture(page, '35-r8-qa-14-mixed-edit-modal-3lines')

    await pickAutocomplete(page, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await page.waitForTimeout(2500)

    // 🔴 가드 5 — 구성품 필드 불변 · 단품만 B 기억 기준으로 재가격(700,000).
    await expect(
      page.getByLabel('단가(VAT포함) 1'),
      'R8-QA-14 Part2: 혼합 전표 head 배분가가 재가격됨 — 구성품 제외 회귀',
    ).toHaveValue(/^88,?000$/)
    await expect(
      page.getByLabel('단가(VAT포함) 2'),
      'R8-QA-14 Part2: 혼합 전표 tail 배분가가 재가격됨 — 구성품 제외 회귀',
    ).toHaveValue(/^55,?000$/)
    await expect(
      page.getByLabel('단가(VAT포함) 3'),
      'R8-QA-14 Part2: 단품이 B 기억 제외환산(700,000)으로 재가격되지 않음 — 단품 재가격까지 깨짐(과잉 제외)',
    ).toHaveValue(/^700,?000$/)
    // 🔴 가드 6 — 재조회 요청 body 에 단품 productId 만(구성품 미포함).
    console.log(`[R8-QA-14] Part2 재조회 body — bulk=${JSON.stringify(priceMemoryCalls)} · lookup=${JSON.stringify(lookupCalls)}`)
    expect(priceMemoryCalls.length, 'R8-QA-14 Part2: bulk 재조회가 정확히 1건이 아님').toBe(1)
    expect(lookupCalls.length, 'R8-QA-14 Part2: 카탈로그 lookup 이 정확히 1건이 아님').toBe(1)
    const bulkBody = priceMemoryCalls[0] ?? ''
    const lookupBody = lookupCalls[0] ?? ''
    expect(bulkBody, 'R8-QA-14 Part2: bulk 에 단품 productId 누락').toContain(SINGLE.id)
    expect(bulkBody, 'R8-QA-14 Part2: bulk 에 head 구성품 productId 포함(제외 회귀)').not.toContain(COMP_HEAD.id)
    expect(bulkBody, 'R8-QA-14 Part2: bulk 에 tail 구성품 productId 포함(제외 회귀)').not.toContain(COMP_TAIL.id)
    expect(lookupBody, 'R8-QA-14 Part2: lookup 에 단품 productId 누락').toContain(SINGLE.id)
    expect(lookupBody, 'R8-QA-14 Part2: lookup 에 head 구성품 productId 포함(제외 회귀)').not.toContain(COMP_HEAD.id)
    expect(lookupBody, 'R8-QA-14 Part2: lookup 에 tail 구성품 productId 포함(제외 회귀)').not.toContain(COMP_TAIL.id)
    // 🔴 가드 7 — 배너 표시 + 강조는 단품 1행만.
    await expect(
      page.getByTestId('sales-slip-edit-price-refresh-banner'),
      'R8-QA-14 Part2: 단품 재가격 배너 미표시',
    ).toBeVisible({ timeout: 10000 })
    expect(await page.locator('tr.price-memory-refreshed-row').count(), 'R8-QA-14 Part2: 강조가 단품 1행이 아님').toBe(1)
    await capture(page, '36-r8-qa-14-mixed-partner-changed-single-repriced-components-unchanged')

    const putRes2 = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/slips/${mixedSlipId}/sales`),
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: '저장', exact: true }).first().click()
    expect((await putRes2).status(), 'R8-QA-14 Part2: 저장 PUT').toBe(200)
    await page.waitForTimeout(2500)
    await capture(page, '37-r8-qa-14-mixed-saved-db-preserved')

    // 🔴 가드 8 — DB: 구성품 88,000/55,000 보존 + 단품 700,000 · 계보 보존.
    expect(
      psql(`SELECT string_agg(model_name || ':' || unit_price, '|' ORDER BY created_at)
              FROM slip_lines WHERE slip_id='${mixedSlipId}' AND is_deleted=false`),
      'R8-QA-14 Part2: 저장 후 라인 단가가 기대와 다름(구성품 변형 or 단품 미반영)',
    ).toBe(`${COMP_HEAD.model}:88000.00|${COMP_TAIL.model}:55000.00|${SINGLE.model}:700000.00`)
    expect(lineageOf(mixedSlipId), 'R8-QA-14 Part2: 저장 후 계보 변형').toBe(
      `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}|${SINGLE.model}:false:-`,
    )
    // 🔴 가드 9 — 기억: B 단품 = 770,000.00 고정점 · B 구성품 bait 불변·tail NONE · A 불변.
    console.log(`[R8-QA-14] Part2 저장 후 기억 — B단품=${memoryOfFor(OTHER_PARTNER.id, SINGLE.id)} · B head=${memoryOfFor(OTHER_PARTNER.id, COMP_HEAD.id)} · A단품=${memoryOf(SINGLE.id)}`)
    expect(
      memoryOfFor(OTHER_PARTNER.id, SINGLE.id),
      'R8-QA-14 Part2: B 단품 기억이 고정점(770,000.00)이 아님',
    ).toBe('770000.00/LINE_SAVE')
    expect(
      memoryOfFor(OTHER_PARTNER.id, COMP_HEAD.id),
      'R8-QA-14 Part2: B 의 head bait 기억이 변조됨(구성품 각인)',
    ).toBe(`${BAIT_B_COMPONENT}.00/LINE_SAVE`)
    expect(memoryOfFor(OTHER_PARTNER.id, COMP_TAIL.id), 'R8-QA-14 Part2: B 에 tail 기억이 생김(구성품 각인)').toBe('NONE')
    expect(memoryOf(SINGLE.id), 'R8-QA-14 Part2: A 단품 기억이 변조됨').toBe(aSingleMemory)

    await ctx.close()
  })

  /**
   * R9-QA-10 [매입 미러] — 매출 반대 INBOUND 수정 표면에서 HIT/MISS 모두를 실증한다.
   * HIT 는 세트+단품 혼합 전표로 구성품 제외까지 함께 본다. B 구성품 기억 bait 가
   * 있어도 bulk/lookup body 는 단품 1개만 실어야 하고, 배분가·계보·기억은 불변이다.
   * MISS 는 실 카탈로그 판매가 라운드트립과 `판매가` 마커, 옛 A 단가 미각인을 고정한다.
   */
  test('R9-QA-10 [매입 미러] INBOUND HIT/MISS 재조회·배너·마커·오염 차단 + 세트 구성품 제외', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)

    // ── HIT: 혼합 매입 전표, 단품만 B 최근단가로 재가격 ──
    resetMemoryPairs([COMP_HEAD.id, COMP_TAIL.id, SINGLE.id])
    resetMemoryPairsFor(OTHER_PARTNER.id, [COMP_HEAD.id, COMP_TAIL.id, SINGLE.id])
    seedMemory(OTHER_PARTNER.id, COMP_HEAD.id, 999000, 'qa-r9-purchase-hit-bait')
    seedMemory(OTHER_PARTNER.id, SINGLE.id, 770000, 'qa-r9-purchase-hit')
    const hitCreated = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'INBOUND', partnerId: PARTNER.id, partnerName: PARTNER.name,
        destinationWarehouseId: WAREHOUSE,
        lines: [
          { productId: BUNDLE.id, quantity: 1, unitPrice: 1000000 },
          { productId: SINGLE.id, quantity: 1, unitPrice: 334400 },
        ],
      },
    })
    expect(hitCreated.ok(), 'R9-QA-10 HIT 전제: INBOUND 혼합 전표 생성').toBeTruthy()
    const hitSlipId = (await hitCreated.json()).data.id as string
    const hitLineage = `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}|${SINGLE.model}:false:-`
    expect(lineageOf(hitSlipId), 'R9-QA-10 HIT 전제: 매입 세트 계보').toBe(hitLineage)
    const componentsBefore = psql(
      `SELECT string_agg(product_id::text || ':' || unit_price, '|' ORDER BY created_at)
       FROM slip_lines WHERE slip_id='${hitSlipId}' AND is_deleted=false AND parent_set_model IS NOT NULL`,
    )
    const aSingleBefore = memoryOf(SINGLE.id)

    const hitBulkBodies: string[] = []
    const hitLookupBodies: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/slips/price-memory/bulk')) hitBulkBodies.push(request.postData() ?? '')
      if (request.method() === 'POST' && request.url().includes('/api/products/lookup')) hitLookupBodies.push(request.postData() ?? '')
    })
    await openPurchaseEdit(page, hitSlipId)
    const comp1Before = await page.getByLabel('단가(VAT포함) 1').inputValue()
    const comp2Before = await page.getByLabel('단가(VAT포함) 2').inputValue()
    await pickAutocomplete(page, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await page.waitForTimeout(2500)

    await expect(page.getByLabel('단가(VAT포함) 1'), '매입 HIT: head 구성품 배분가 변형').toHaveValue(comp1Before)
    await expect(page.getByLabel('단가(VAT포함) 2'), '매입 HIT: tail 구성품 배분가 변형').toHaveValue(comp2Before)
    await expect(page.getByLabel('단가(VAT포함) 3'), '매입 HIT: B 기억 제외환산 미적용').toHaveValue(/^700,?000$/)
    expect(hitBulkBodies, '매입 HIT: bulk 정확히 1건').toHaveLength(1)
    expect(hitLookupBodies, '매입 HIT: catalog lookup 정확히 1건').toHaveLength(1)
    for (const [label, body] of [['bulk', hitBulkBodies[0] ?? ''], ['lookup', hitLookupBodies[0] ?? '']] as const) {
      expect(body, `매입 HIT: ${label} 단품 productId 누락`).toContain(SINGLE.id)
      expect(body, `매입 HIT: ${label} head 구성품 포함`).not.toContain(COMP_HEAD.id)
      expect(body, `매입 HIT: ${label} tail 구성품 포함`).not.toContain(COMP_TAIL.id)
    }
    const purchaseBanner = page.getByTestId('purchase-slip-edit-price-refresh-banner')
    await expect(purchaseBanner).toContainText('최근단가 1건')
    await expect(page.locator('tr.price-memory-refreshed-row'), '매입 HIT: 변경 단품 1행만 강조').toHaveCount(1)
    await expect(page.getByRole('note', { name: /이 거래처에 마지막으로 저장된 단가/ })).toHaveText('거래처 최근단가')
    await capture(page, '38-r9-purchase-hit-single-repriced-components-excluded')

    const hitPut = page.waitForResponse(
      (response) => response.request().method() === 'PUT' && response.url().endsWith(`/slips/${hitSlipId}`),
      { timeout: 30000 },
    )
    await page.getByTestId('purchase-slip-edit-submit').click()
    expect((await hitPut).status(), '매입 HIT 저장 PUT').toBe(200)
    await page.waitForTimeout(2500)
    expect(lineageOf(hitSlipId), '매입 HIT 저장 후 계보 변형').toBe(hitLineage)
    expect(
      psql(`SELECT string_agg(product_id::text || ':' || unit_price, '|' ORDER BY created_at)
            FROM slip_lines WHERE slip_id='${hitSlipId}' AND is_deleted=false AND parent_set_model IS NOT NULL`),
      '매입 HIT 저장 후 구성품 배분가 변형',
    ).toBe(componentsBefore)
    expect(memoryOfFor(OTHER_PARTNER.id, SINGLE.id), '매입 HIT: B 단품 기억').toBe('770000.00/LINE_SAVE')
    expect(memoryOfFor(OTHER_PARTNER.id, COMP_HEAD.id), '매입 HIT: head bait 변조').toBe('999000.00/LINE_SAVE')
    expect(memoryOfFor(OTHER_PARTNER.id, COMP_TAIL.id), '매입 HIT: tail 구성품 각인').toBe('NONE')
    expect(memoryOf(SINGLE.id), '매입 HIT: A 단품 기억 오염').toBe(aSingleBefore)

    // ── MISS: B 기억 없음 → 실 카탈로그 판매가 + 판매가 마커 ──
    resetMemoryPairs([UI_MISS.id])
    resetMemoryPairsFor(OTHER_PARTNER.id, [UI_MISS.id])
    const catalogRes = await page.request.post(`${API_BASE}/api/products/lookup`, {
      headers: authHeaders(auth), data: { ids: [UI_MISS.id] },
    })
    expect(catalogRes.ok(), '매입 MISS 전제: 카탈로그 lookup').toBeTruthy()
    const catalogRows = ((await catalogRes.json()).data ?? []) as Array<Record<string, unknown>>
    const catalogInclusive = Number(catalogRows.find((row) => row['id'] === UI_MISS.id)?.['sellingPrice'])
    expect(Number.isFinite(catalogInclusive) && catalogInclusive > 0, '매입 MISS 전제: 판매가 미확보').toBe(true)
    const missField = String(Math.round(catalogInclusive / 1.1))
    const missMemory = `${(Math.round(catalogInclusive / 1.1) * 1.1).toFixed(2)}/LINE_SAVE`
    const missCreated = await page.request.post(`${API_BASE}/slips`, {
      headers: authHeaders(auth),
      data: {
        slipType: 'INBOUND', partnerId: PARTNER.id, partnerName: PARTNER.name,
        destinationWarehouseId: WAREHOUSE,
        lines: [{ productId: UI_MISS.id, quantity: 1, unitPrice: 777000 }],
      },
    })
    expect(missCreated.ok(), '매입 MISS 전제: INBOUND 전표 생성').toBeTruthy()
    const missSlipId = (await missCreated.json()).data.id as string
    const missABefore = memoryOf(UI_MISS.id)
    expect(memoryOfFor(OTHER_PARTNER.id, UI_MISS.id), '매입 MISS 전제: B 기억 잔존').toBe('NONE')
    await openPurchaseEdit(page, missSlipId)
    await pickAutocomplete(page, '거래처', '거래처 목록', OTHER_PARTNER.name)
    await page.waitForTimeout(2500)
    await expect(page.getByLabel('단가(VAT포함) 1'), '매입 MISS: 카탈로그 제외환산 미적용').toHaveValue(new RegExp(`^${missField}$`))
    await expect(page.getByTestId('purchase-slip-edit-price-refresh-banner')).toContainText('판매가 1건')
    await expect(page.locator('tr.price-memory-refreshed-row'), '매입 MISS: 변경 1행 강조').toHaveCount(1)
    await expect(
      page.getByRole('note', { name: '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다' }),
    ).toHaveText('판매가')
    await capture(page, '39-r9-purchase-miss-catalog-marker')
    const missPut = page.waitForResponse(
      (response) => response.request().method() === 'PUT' && response.url().endsWith(`/slips/${missSlipId}`),
      { timeout: 30000 },
    )
    await page.getByTestId('purchase-slip-edit-submit').click()
    expect((await missPut).status(), '매입 MISS 저장 PUT').toBe(200)
    await page.waitForTimeout(2500)
    expect(memoryOfFor(OTHER_PARTNER.id, UI_MISS.id), '매입 MISS: B 카탈로그 고정점 불일치').toBe(missMemory)
    expect(memoryOf(UI_MISS.id), '매입 MISS: A 기억 오염').toBe(missABefore)

    await ctx.close()
  })

  /**
   * R9-QA-5 [견적 수정 대칭] — 새 견적 폼이 아닌 기존 견적 edit hydrate 상태에서 A→B 변경.
   * 세트 구성품 2행은 후보·요청·강조·각인에서 제외되고, 평면 단품 1행만 B 최근단가로
   * 재조회되어 배너·마커·강조가 나타나야 한다. 저장 후 실 estimate_lines 계보와 DB 기억으로 판정한다.
   */
  test('R9-QA-5 [견적 수정 대칭] edit A→B 재조회·배너·강조·마커 + 세트 구성품 제외·미오염', async ({ browser }) => {
    test.slow()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const auth = await login(page)
    resetMemoryPairs([BUNDLE.id, COMP_HEAD.id, COMP_TAIL.id, SINGLE.id])
    resetMemoryPairsFor(OTHER_PARTNER.id, [BUNDLE.id, COMP_HEAD.id, COMP_TAIL.id, SINGLE.id])
    seedMemory(OTHER_PARTNER.id, COMP_HEAD.id, 999000, 'qa-r9-estimate-bait')
    seedMemory(OTHER_PARTNER.id, SINGLE.id, 770000, 'qa-r9-estimate-hit')

    const created = await page.request.post(`${API_BASE}/slips/estimates`, {
      headers: authHeaders(auth),
      data: {
        partnerId: PARTNER.id, partnerName: PARTNER.name,
        lines: [
          { productId: BUNDLE.id, quantity: 1, unitPrice: '1000000', priceVatInclusive: true },
          { productId: SINGLE.id, quantity: 1, unitPrice: '334400', priceVatInclusive: true },
        ],
      },
    })
    expect(created.ok(), 'R9-QA-5 전제: 세트+단품 견적 생성').toBeTruthy()
    const estimateId = (await created.json()).data.id as string
    const lineageBefore = psql(
      `SELECT string_agg(model_name || ':' || set_head || ':' || coalesce(parent_set_model,'-'), '|' ORDER BY line_no)
       FROM estimate_lines WHERE estimate_id='${estimateId}' AND is_deleted=false`,
    )
    expect(lineageBefore, 'R9-QA-5 전제: 견적 세트 계보').toBe(
      `${COMP_HEAD.model}:true:${BUNDLE.model}|${COMP_TAIL.model}:false:${BUNDLE.model}|${SINGLE.model}:false:-`,
    )
    const componentPricesBefore = psql(
      `SELECT string_agg(product_id::text || ':' || coalesce(unit_price_with_vat, unit_price)::text, '|' ORDER BY line_no)
       FROM estimate_lines WHERE estimate_id='${estimateId}' AND is_deleted=false AND parent_set_model IS NOT NULL`,
    )
    const aSingleBefore = memoryOf(SINGLE.id)

    await page.goto(`${BASE_URL}/sales/estimates/${estimateId}/edit`)
    await expect(page.getByLabel('라인 3 단가'), '견적 edit hydrate 3행 미표시').toBeVisible({ timeout: 30000 })
    const comp1Before = await page.getByLabel('라인 1 단가').inputValue()
    const comp2Before = await page.getByLabel('라인 2 단가').inputValue()
    const bulkBodies: string[] = []
    const lookupBodies: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/slips/price-memory/bulk')) bulkBodies.push(request.postData() ?? '')
      if (request.method() === 'POST' && request.url().includes('/api/products/lookup')) lookupBodies.push(request.postData() ?? '')
    })

    await pickAutocomplete(page, '거래처 검색', '거래처 목록', OTHER_PARTNER.name)
    await page.waitForTimeout(2500)
    await expect(page.getByLabel('라인 1 단가'), '견적 edit: head 구성품 재가격').toHaveValue(comp1Before)
    await expect(page.getByLabel('라인 2 단가'), '견적 edit: tail 구성품 재가격').toHaveValue(comp2Before)
    await expect(page.getByLabel('라인 3 단가'), '견적 edit: B 단품 최근단가 미적용').toHaveValue(/^770,?000$/)
    expect(bulkBodies, '견적 edit: bulk 정확히 1건').toHaveLength(1)
    expect(lookupBodies, '견적 edit: lookup 정확히 1건').toHaveLength(1)
    for (const [label, body] of [['bulk', bulkBodies[0] ?? ''], ['lookup', lookupBodies[0] ?? '']] as const) {
      expect(body, `견적 edit ${label}: 단품 누락`).toContain(SINGLE.id)
      expect(body, `견적 edit ${label}: head 구성품 포함`).not.toContain(COMP_HEAD.id)
      expect(body, `견적 edit ${label}: tail 구성품 포함`).not.toContain(COMP_TAIL.id)
    }
    await expect(page.getByTestId('estimate-price-refresh-banner')).toContainText('최근단가 1건')
    // [R9 실측 확정] 견적 데스크톱 행 강조는 클래스가 아니라 inline style 관례다 —
    // EstimateFormPage:1629-1630 `borderLeft: var(--action-brand)` + `background: var(--surface-selected)`
    // (`price-memory-refreshed-row` 클래스는 모바일 카드 렌더러:361 전용). r2 스위트의 검증된
    // estimateHighlightedRows 관측자와 동일 셀렉터로 판정한다 — 강조 1행 요구는 그대로다.
    await expect(
      page.locator('[data-testid^="estimate-form-line-"][data-price-source][style*="surface-selected"]'),
      '견적 edit: 단품 1행 강조',
    ).toHaveCount(1)
    await expect(page.getByRole('note', { name: /이 거래처에 마지막으로 저장된 단가/ })).toHaveText('거래처 최근단가')
    await capture(page, '40-r9-estimate-edit-partner-reprice-single-only')

    const update = page.waitForResponse(
      (response) => response.request().method() === 'PUT' && response.url().includes(`/slips/estimates/${estimateId}`),
      { timeout: 30000 },
    )
    await page.getByTestId('estimate-form-save-button').click()
    expect((await update).status(), '견적 edit 저장 PUT').toBe(200)
    await page.waitForTimeout(2500)
    expect(
      psql(`SELECT string_agg(model_name || ':' || set_head || ':' || coalesce(parent_set_model,'-'), '|' ORDER BY line_no)
            FROM estimate_lines WHERE estimate_id='${estimateId}' AND is_deleted=false`),
      '견적 edit 저장 후 계보 변형',
    ).toBe(lineageBefore)
    expect(
      psql(`SELECT string_agg(product_id::text || ':' || coalesce(unit_price_with_vat, unit_price)::text, '|' ORDER BY line_no)
            FROM estimate_lines WHERE estimate_id='${estimateId}' AND is_deleted=false AND parent_set_model IS NOT NULL`),
      '견적 edit 저장 후 구성품 배분가 변형',
    ).toBe(componentPricesBefore)
    expect(memoryOfFor(OTHER_PARTNER.id, SINGLE.id), '견적 edit: B 단품 기억').toBe('770000.00/LINE_SAVE')
    expect(memoryOfFor(OTHER_PARTNER.id, COMP_HEAD.id), '견적 edit: head bait 변조').toBe('999000.00/LINE_SAVE')
    expect(memoryOfFor(OTHER_PARTNER.id, COMP_TAIL.id), '견적 edit: tail 구성품 각인').toBe('NONE')
    expect(memoryOf(SINGLE.id), '견적 edit: A 단품 기억 오염').toBe(aSingleBefore)

    await ctx.close()
  })
})
