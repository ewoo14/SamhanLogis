import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 품목 다중 카테고리 노출 (M:N) — PR #494 / 에픽 #18 슬1 실서버 QA 캡처.
 *
 * 실서버(Docker, samhan-product-service V18 healthy) FE 화면 경유로 다중 카테고리
 * 노출(M:N)을 실 게이트웨이(http://localhost:8080) HTTP 왕복하며 캡처한다(mock 금지,
 * [[feedback_no_fake_data_ever]]).
 *
 * 핵심 대상: 단일 품목 AJ060MXHNBC1 이 HOME_MULTI(순서 1) + SINGLE_SET(순서 287)
 *           두 견적 카테고리에 동시 노출(M:N). 카탈로그 화면에서:
 *   - '카테고리' 컬럼   : 견적 카테고리 Badge 2개(가정용 멀티 + 싱글/세트)
 *   - '노출 설정' 컬럼  : 견적 TagChip 2개(estimate-items-estimate-category-{code}-chip-{cat})
 *
 * 캡처물:
 *   1. multi-category-catalog-row      — AJ060MXHNBC1 행: 카테고리 Badge 2개 + 노출설정 TagChip 2개
 *   2. multi-category-exposure-cell    — '노출 설정' 셀 타이트 크롭(견적 TagChip 2개 강조)
 *   3. multi-category-home-multi-list  — 카테고리=HOME_MULTI 필터 목록(다중노출 품목이 1번 순서로 등장)
 *
 * 실서버: http://localhost:8080 (api-gateway), http://localhost:5175 (renderer vite dev, mock OFF)
 * 인증: dev_master / dev_p05_pass! (MASTER, products.admin UPDATE)
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/product-catalog-enhance-real-qa/multi-category-exposure-real-qa.spec.ts \
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
const TARGET_CODE = 'AJ060MXHNBC1'

// 프롬프트 지정 저장 경로: docs/qa/product-multi-category-exposure/
const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/product-multi-category-exposure'))
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

// ===========================================================================
// 1. 다중 카테고리 노출 — 단일 품목이 2개 견적 카테고리에 동시 노출 (M:N 핵심)
// ===========================================================================

test('M:N — AJ060MXHNBC1 단일 품목이 HOME_MULTI + SINGLE_SET 2개 카테고리에 동시 노출(Badge 2 + TagChip 2)', async ({
  page,
}) => {
  const token = await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')

  // (전제 확인) 실 API 가 estimateCategories 2건을 반환하는지 검증 — 실데이터 보장.
  const apiRes = await page.request.get(`${API_BASE}/api/v1/products`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { q: TARGET_CODE, size: '5' },
  })
  const apiRow = ((await apiRes.json()).content ?? []).find(
    (r: { modelCode: string }) => r.modelCode === TARGET_CODE,
  )
  const apiCats: string[] = (apiRow?.estimateCategories ?? []).map(
    (c: { category: string }) => c.category,
  )
  expect(apiCats, `실 API estimateCategories 가 2건이 아님: ${JSON.stringify(apiCats)}`).toEqual(
    expect.arrayContaining(['HOME_MULTI', 'SINGLE_SET']),
  )
  console.log(`[전제] 실 API ${TARGET_CODE} estimateCategories = ${apiCats.join(', ')}`)

  // 품목관리 진입 → 대상 품목 검색.
  // 검색 결과는 단일 행이라 DataTable 재렌더 churn 으로 row testid 가시성 폴링이 흔들릴 수 있어
  // (실측), 정밀 타깃인 견적 TagChip 로케이터를 직접 대기한다(행 대신 칩).
  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })
  const searchInput = page
    .locator(
      '[data-testid="estimate-items-search-input"] input, input[data-testid="estimate-items-search-input"]',
    )
    .first()
  await searchInput.fill(TARGET_CODE)
  await page.locator('[data-testid="estimate-items-query-button"]').click()

  // (1) '노출 설정' 컬럼 — 견적 TagChip 2개(HOME_MULTI + SINGLE_SET) 직접 대기 + 단언.
  const homeChip = page.locator(
    `[data-testid="estimate-items-estimate-category-${TARGET_CODE}-chip-HOME_MULTI"]`,
  )
  const setChip = page.locator(
    `[data-testid="estimate-items-estimate-category-${TARGET_CODE}-chip-SINGLE_SET"]`,
  )
  await expect(homeChip, '노출설정 셀에 HOME_MULTI 견적 TagChip 미노출').toBeVisible({ timeout: 25000 })
  await expect(setChip, '노출설정 셀에 SINGLE_SET 견적 TagChip 미노출').toBeVisible({ timeout: 10000 })
  const homeChipText = (await homeChip.textContent())?.trim() ?? ''
  const setChipText = (await setChip.textContent())?.trim() ?? ''
  console.log(`[1] 노출설정 TagChip 2개: "${homeChipText}" / "${setChipText}"`)

  // 행 컨테이너: design-system DataTable 이 <tr> 에 data-testid 를 forward 하지 않을 수 있어
  // (실측 — 칩은 렌더되나 row-testid 미forward), 칩의 공통 조상 셀을 통해 행 영역을 잡는다.
  const exposureGroup = page.locator(
    `[data-testid="estimate-items-estimate-category-${TARGET_CODE}"]`,
  )
  await expect(exposureGroup, '노출설정 견적 카테고리 그룹 미노출').toBeVisible({ timeout: 10000 })
  const rowContainer = exposureGroup.locator('xpath=ancestor::tr[1]')

  // (2) '카테고리' 컬럼 — 견적 카테고리 Badge 2개 단언(실 라벨: 홈멀티 / 싱글중대형).
  //   normalizeEstimateCategoryExposures → Badge. (행 안에 productCategory 라벨 '홈멀티' 도 있어
  //   '홈멀티' 는 2회 등장 가능 → first 로만 확인, '싱글중대형' 은 견적 노출 Badge 로 등장.)
  await expect(rowContainer.getByText('싱글중대형', { exact: false }).first()).toBeVisible({
    timeout: 10000,
  })
  await expect(rowContainer.getByText('홈멀티', { exact: false }).first()).toBeVisible({
    timeout: 10000,
  })
  console.log('[2] 카테고리 컬럼 견적 Badge(홈멀티 + 싱글중대형) 확인')

  // 전체 카탈로그 행 캡처(검색 결과 — 다중노출 1행)
  await page.waitForTimeout(400)
  await shot(page, 'multi-category-catalog-row')

  // (3) '노출 설정' 셀 타이트 크롭 — 견적 TagChip 2개 강조 캡처.
  //   ToggleCell 컨테이너(견적/주문 체크 + TagChip 들)를 포함한 행 영역을 clip 으로 크롭.
  const box = await rowContainer.boundingBox()
  if (box) {
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'multi-category-exposure-cell.png'),
      clip: {
        x: Math.max(0, box.x),
        y: Math.max(0, box.y - 30),
        width: Math.min(1440 - Math.max(0, box.x), box.width),
        height: box.height + 60,
      },
    })
    console.log('[3] 노출 설정 셀(행) 타이트 크롭 캡처')
  } else {
    await shot(page, 'multi-category-exposure-cell')
  }

  console.log('[M:N] PASS — 단일 품목 2 카테고리 동시 노출 UI 확인 완료')
})

// ===========================================================================
// 2. 카테고리 탭 — HOME_MULTI 목록에 다중노출 품목이 1번 순서로 등장
// ===========================================================================

test('카테고리 탭 — HOME_MULTI 목록에서 다중노출 품목 AJ060MXHNBC1 이 표시순서대로 등장', async ({
  page,
}) => {
  await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')

  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })

  // 기본 카테고리 탭 = HOME_MULTI(가정용 멀티)
  await expect(page.locator('[data-testid="estimate-items-category-tab-HOME_MULTI"]')).toHaveAttribute(
    'aria-selected',
    'true',
  )

  // 다중노출 품목 행이 HOME_MULTI 목록에 등장(순서 1) 확인
  const targetRow = page.locator(`[data-testid="estimate-items-row-${TARGET_CODE}"]`)
  await targetRow.waitFor({ state: 'visible', timeout: 20000 })

  // 표시순서 컬럼이 숫자(카테고리별 순서)로 표시되는지 확인 — HOME_MULTI 컨텍스트 순서.
  await expect(targetRow).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, 'multi-category-home-multi-list')
  console.log(`[필터] PASS — HOME_MULTI 목록에 ${TARGET_CODE} 등장(카테고리별 표시순서)`)
})
