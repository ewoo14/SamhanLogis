import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #461 #16 T2 — 구성품 편집 모달 FE 경유 Docker 실서버 QA.
 *
 * 목적(사이클1 P1-A FE측 검증, 머지 차단 게이트):
 *   FE 가 과거 구 필드명(componentModelCode/quantity)을 보내 모달이 실서버에서 불능이었음.
 *   필드명 1:1 fix(componentProductCode/defaultQty) 후, FE 모달이 실제로 실 BE 와
 *   GET/PUT 왕복 동작함을 FE UI 경유로 실증한다(BE 직호출/mock 금지).
 *
 * 대상 BUNDLE: AC110CS6PBH1SY (13 구성품, product_db 실데이터)
 * 실서버: http://localhost:8080 (api-gateway), http://localhost:5175 (renderer vite dev, mock OFF)
 * 인증: dev_master / dev_p05_pass! (MASTER, products.admin UPDATE)
 *
 * 절차:
 *   1. (별도 백업 스크립트가 .claude/tmp/t2-orig.json 에 원본 13구성품 저장)
 *   2. dev_master 로그인 → /products/estimate-items → AC110CS6PBH1SY 검색
 *   3. '구성품' 버튼 → 모달 13구성품 렌더(FE GET 정상)
 *   4. 첫 구성품 수량 1→2 변경 → 저장(FE PUT 실서버)
 *   5. 모달 재오픈 GET 으로 변경 영속 확인(FE PUT 정상)
 *   6. (전표 전개 반영은 별도 절차에서 검증)
 *   ※ 원복은 별도 스크립트가 .claude/tmp/t2-orig.json 으로 PUT.
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/product-catalog-enhance-real-qa/t2-bundle-components-modal-real-qa.spec.ts \
 *     --reporter=line --timeout=90000
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const API_BASE = 'http://localhost:8080'
const BUNDLE_CODE = 'AC110CS6PBH1SY'
const SET_CATEGORY = 'SINGLE_SET'

const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/product-catalog-enhance'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false })
}

/**
 * 실서버 로그인 후 window.samhanAuth stub 주입(addInitScript).
 * client.ts interceptor 가 window.samhanAuth.getToken() 으로 토큰을 axios 헤더에 싣는다.
 */
async function loginAndInstallStub(page: Page, loginId: string, password: string): Promise<string> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password } })
  if (!res.ok()) throw new Error(`로그인 실패: HTTP ${res.status()}`)
  const body = await res.json()
  const token: string = body.data?.token ?? ''
  const role: string = body.data?.role ?? 'MASTER'
  const userId: string = body.data?.userId ?? ''
  const displayName: string = body.data?.displayName ?? loginId

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
    { tok: token, r: role, uid: userId, name: displayName },
  )
  return token
}

/** 견적품목 카탈로그 검색 → AC110CS6PBH1SY 행 노출까지. */
async function searchBundle(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })
  const categoryTab = page.locator(`[data-testid="estimate-items-category-tab-${SET_CATEGORY}"]`)
  await categoryTab.click()
  await expect(categoryTab).toHaveAttribute('aria-selected', 'true')
  const searchInput = page.locator('[data-testid="estimate-items-search-input"] input, input[data-testid="estimate-items-search-input"]').first()
  await searchInput.fill(BUNDLE_CODE)
  await page.locator('[data-testid="estimate-items-query-button"]').click()
  await page.waitForSelector(`[data-testid="estimate-items-components-button-${BUNDLE_CODE}"]`, {
    timeout: 20000,
  })
}

test('T2: 구성품 편집 모달 — 13구성품 GET 렌더 + 수량 편집 PUT + 영속(FE 왕복)', async ({ page }) => {
  const token = await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')

  // ── 2~3. 검색 → 구성품 버튼 → 모달 13구성품 GET 렌더 ───────────────
  await searchBundle(page)
  await shot(page, 't2-1-catalog-search')

  await page.locator(`[data-testid="estimate-items-components-button-${BUNDLE_CODE}"]`).click()
  await page.waitForSelector('[data-testid="components-modal"]', { timeout: 15000 })

  // 로딩 종료 후 행이 13개 렌더되는지 — FE GET 실 BE 왕복 정상(P1-A FE GET).
  await expect
    .poll(
      async () => page.locator('[data-testid^="components-modal-component-row-"]').count(),
      { timeout: 20000, message: '구성품 행이 렌더되지 않음(FE GET 실패 의심)' },
    )
    .toBe(13)
  const rowCount = await page.locator('[data-testid^="components-modal-component-row-"]').count()
  expect(rowCount, '구성품 행 수가 13이 아님').toBe(13)
  await shot(page, 't2-2-modal-13-components')
  console.log(`[T2] PASS GET: 모달에 구성품 ${rowCount}건 렌더(FE→실BE GET 왕복 정상)`)

  // ── 4. 첫 구성품 수량 편집 1→2 후 저장(FE PUT) ─────────────────────
  const qty0 = page.locator('[data-testid="components-modal-quantity-0"] input, input[data-testid="components-modal-quantity-0"]').first()
  const before = await qty0.inputValue()
  console.log(`[T2] 첫 구성품 수량 before=${before}`)
  // 새 값 = before+1 (보통 1→2). 정수 보장.
  const newQty = String(Number(before) + 1)
  await qty0.fill(newQty)
  await expect(qty0).toHaveValue(newQty)
  await shot(page, 't2-3-edit-qty')

  // 저장 PUT 응답을 실제로 가로채 200 인지 확인(FE PUT 실 BE 왕복 = P1-A FE PUT).
  const putRespPromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/products/${BUNDLE_CODE}/components`) &&
      r.request().method() === 'PUT',
    { timeout: 20000 },
  )
  await page.locator('[data-testid="components-modal-save-button"]').click()
  const putResp = await putRespPromise
  expect(putResp.status(), `PUT 응답이 200 이 아님: ${putResp.status()}`).toBe(200)
  console.log(`[T2] PASS PUT: 저장 PUT HTTP ${putResp.status()}(FE→실BE PUT 왕복 정상)`)

  // 저장 후 모달이 닫히는지(성공 분기) 대기.
  await expect(page.locator('[data-testid="components-modal"]')).toBeHidden({ timeout: 10000 })
  await shot(page, 't2-4-after-save')

  // ── 5. 모달 재오픈 GET 으로 영속 확인 ─────────────────────────────
  await page.locator(`[data-testid="estimate-items-components-button-${BUNDLE_CODE}"]`).click()
  await page.waitForSelector('[data-testid="components-modal"]', { timeout: 15000 })
  await expect
    .poll(async () => page.locator('[data-testid^="components-modal-component-row-"]').count(), {
      timeout: 20000,
    })
    .toBe(13)
  const qty0Reopen = page.locator('[data-testid="components-modal-quantity-0"] input, input[data-testid="components-modal-quantity-0"]').first()
  await expect(qty0Reopen, '재오픈 모달 첫 구성품 수량이 저장값과 다름(영속 실패)').toHaveValue(newQty)
  await shot(page, 't2-5-reopen-persisted')
  console.log(`[T2] PASS 영속: 재오픈 GET 수량=${newQty}(실 BE 영속 확인)`)

  // 교차검증 — REST GET 으로도 첫 구성품 defaultQty 가 변경값인지 확인(displayOrder=1).
  const verify = await page.request.get(`${API_BASE}/api/v1/products/${BUNDLE_CODE}/components`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const verifyJson: Array<{ componentProductCode: string; defaultQty: number; displayOrder: number }> =
    await verify.json()
  const first = verifyJson.find((c) => c.displayOrder === 1) ?? verifyJson[0]
  expect(Number(first.defaultQty), 'REST GET 교차검증 — 첫 구성품 defaultQty 불일치').toBe(Number(newQty))
  console.log(
    `[T2] PASS 교차검증: REST GET 첫 구성품(${first.componentProductCode}) defaultQty=${first.defaultQty}`,
  )
})

// ---------------------------------------------------------------------------
// T2-전개: 편집된 구성(첫 구성품 defaultQty)이 출고전표 세트 전개 라인에 반영되는지.
//   - FE SlipFormPage(/sales/new)에서 AC110CS6PBH1SY 세트 라인 + setQty=1 로 작성·저장.
//   - slip-service 가 product-service expand(FOLLOW_SET → setQty×defaultQty)로 전개.
//   - 저장된 전표 상세에서 첫 구성품(INDOOR, AC110CN6PBH1) 라인 수량 = setQty×defaultQty(편집값).
//   스펙 §3 T2 핵심: "구성 변경 → 전개 반영".
// ---------------------------------------------------------------------------

test('T2-전개: 편집된 구성품이 출고전표 세트 전개 라인 수량에 반영', async ({ page }) => {
  const token = await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // 0) 현재 첫 구성품(INDOOR, displayOrder=1) defaultQty 확인 — 편집 결과(=2)를 기대값으로 삼는다.
  const compRes = await page.request.get(`${API_BASE}/api/v1/products/${BUNDLE_CODE}/components`, {
    headers: auth,
  })
  const comps: Array<{
    componentProductCode: string
    componentName: string
    defaultQty: number
    componentKind: string
    displayOrder: number
  }> = await compRes.json()
  const indoor =
    comps.find((c) => c.componentKind === 'INDOOR' && c.displayOrder === 1) ??
    comps.find((c) => c.componentKind === 'INDOOR') ??
    comps[0]
  const setQty = 1
  const expectedQty = setQty * Number(indoor.defaultQty)
  console.log(
    `[T2-전개] 기대 — 첫 구성품 ${indoor.componentProductCode}(${indoor.componentName}) ` +
      `defaultQty=${indoor.defaultQty} × setQty=${setQty} = ${expectedQty}`,
  )

  // 1) /sales/new (OUTBOUND) 진입 + 출고 창고(WarehouseAutocomplete) 선택.
  await page.goto(`${BASE_URL}/#/sales/new`)
  await page.getByRole('combobox', { name: '출고 창고' }).waitFor({ state: 'visible', timeout: 30000 })
  const whInput = page.getByRole('combobox', { name: '출고 창고' })
  await whInput.click()
  await whInput.fill('본사창고')
  const whOption = page.getByRole('option').filter({ hasText: '본사창고' }).first()
  await whOption.waitFor({ state: 'visible', timeout: 10000 })
  await whOption.click()

  // 2) 라인1 품목(ProductAutocomplete '품목 목록') = AC110CS6PBH1SY 세트 선택.
  const prodInput = page.getByRole('combobox', { name: '라인 1 품목' })
  await prodInput.click()
  await prodInput.fill(BUNDLE_CODE)
  const prodList = page.getByRole('listbox', { name: '품목 목록' })
  await prodList.waitFor({ state: 'visible', timeout: 10000 })
  const prodOption = prodList.getByRole('option').filter({ hasText: BUNDLE_CODE }).first()
  await prodOption.waitFor({ state: 'visible', timeout: 10000 })
  await prodOption.click()

  // BUNDLE 선택 → picker 없이 첫 구성품 행으로 자동 전개되는지 확인.
  await expect(page.getByRole('combobox', { name: '라인 1 품목' })).toHaveValue(
    indoor.componentProductCode,
    { timeout: 10000 },
  )

  // 3) 라인1 수량 = setQty(1). LineRow 수량 인풋 aria-label="라인 1 수량"(role=spinbutton).
  const qtyInput = page.getByRole('spinbutton', { name: '라인 1 수량' })
  await qtyInput.fill(String(setQty))
  await shot(page, 't2-6-slip-bundle-line')

  // 4) 저장 — createSlip(addSlipLinesExpanded) → 저장 후 /sales 로 navigate.
  const saveBtn = page.getByRole('button', { name: '저장', exact: true })
  const postRespPromise = page.waitForResponse(
    (r) => /\/slips(\?.*)?$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
    { timeout: 25000 },
  )
  await saveBtn.click()
  const postResp = await postRespPromise
  expect([200, 201], `전표 생성 POST 응답 ${postResp.status()}`).toContain(postResp.status())
  const created = await postResp.json()
  const createdSlip = created.data ?? created
  const slipId: string = createdSlip.id
  expect(slipId, '생성 전표 id 없음').toBeTruthy()
  console.log(`[T2-전개] 전표 생성 POST HTTP ${postResp.status()} slipNo=${createdSlip.slipNo ?? '-'}`)

  // 5) 저장된 전표 상세(/sales/:id) FE 렌더 → 첫 구성품 전개 라인 수량 = expectedQty 단언.
  await page.goto(`${BASE_URL}/#/sales/${slipId}`)
  // 모델코드(AC110CN6PBH1) 라인 셀이 보일 때까지 대기 — 전개되어 구성품 라인이 존재해야 함.
  await page.waitForSelector(`td.col-model:has-text("${indoor.componentProductCode}")`, {
    timeout: 20000,
  })
  const indoorRow = page.getByRole('row').filter({ hasText: indoor.componentProductCode }).first()
  const qtyText = (await indoorRow.locator('td.col-qty').first().textContent())?.trim() ?? ''
  await shot(page, 't2-7-slip-detail-expanded')
  console.log(`[T2-전개] 전표 상세 — ${indoor.componentProductCode} 라인 col-qty="${qtyText}"`)
  expect(
    Number(qtyText.replace(/[^0-9.]/g, '')),
    `전개 라인 수량이 편집된 defaultQty(${indoor.defaultQty})×setQty(${setQty})=${expectedQty} 와 불일치`,
  ).toBe(expectedQty)
  console.log(
    `[T2-전개] PASS: 편집된 구성품 수량(${indoor.defaultQty})이 전표 전개 라인 수량(${qtyText})에 반영됨`,
  )

  // 6) QA 산출 전표 정리 — 생성한 DRAFT 전표 삭제(dev DB 청결). OUTBOUND 은 DELETE /slips/{id}/sales.
  //    실패해도 QA 결과엔 영향 없음(best-effort).
  try {
    await page.request.delete(`${API_BASE}/slips/${slipId}/sales`, { headers: auth })
  } catch {
    /* best-effort cleanup */
  }
})
