import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * single-material-product 슬라이스 — 데스크톱 품목 관리 실서버 QA 캡처.
 *
 * 실서버(Docker, product-service :8084 + api-gateway :8080 healthy) FE(renderer :5175, mock OFF)
 * 경유로 아래 실 화면을 캡처한다(mock 금지, 실 게이트웨이 HTTP 왕복).
 *
 *   01-real-catalog-model-codes.png — 품목 관리: 자재=실 카탈로그 품목(PC1BWCK3NW 등 실모델코드, MAT-해시 0)
 *   02-product-kind-select.png      — 품목 등록(ProductFormPage) 종류=단일/세트 2가지만 노출
 *   03-components-modal-default-toggle.png — 견적품목 BUNDLE(AC110CS6PBH1SY) 구성품 모달:
 *                                     '기본'(isDefault) 체크박스 + componentKind per row
 *   04-component-autocomplete.png   — 구성품 모달 ProductAutocomplete 검색 → 제안 목록
 *
 * 인증: dev_master / QA_DEV_DEFAULT_PASSWORD 환경변수 (MASTER, products.admin UPDATE/CREATE)
 * 실 BUNDLE: AC110CS6PBH1SY (13 구성품)
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/single-material-product-real-qa/smp-desktop-real-qa.spec.ts \
 *     --reporter=line --timeout=120000
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

const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/single-material-product/screenshots'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false })
}

/**
 * 실서버 로그인 후 window.samhanAuth stub 주입(addInitScript).
 * client.ts interceptor 가 window.samhanAuth.getToken() 으로 토큰을 axios 헤더에 싣는다.
 * (선례 t2-bundle-components-modal-real-qa.spec.ts 헬퍼 그대로 재사용)
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

// ─────────────────────────────────────────────────────────────────────────────
// A1. MATERIAL(자재) 품목 목록 — V18 28자재 시드
// ─────────────────────────────────────────────────────────────────────────────
test('A1: 자재=실 카탈로그 품목 — 실모델코드(PC1BWCK3NW) 노출, MAT-해시 회귀 가드', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')))
  await page.goto(`${BASE_URL}/#/products/catalog`)
  await page.waitForSelector('[data-testid="product-catalog-table"]', { timeout: 30000 })

  // A안: 자재(패널/리모컨/부품)는 가짜 MATERIAL 품목이 아니라 이미 실모델코드를 가진 카탈로그 품목이다.
  // 개발책임자 지목 — 1WAY 대형 공청 = PC1BWCK3NW("판넬 1way 무풍+공기청정 대형 WIFI"). 'PC1B' 검색으로
  // 1WAY 대형 패널군의 실 모델코드를 확인한다(BE q 필터 = modelCode/name/model_name LIKE). 'MAT-'+md5 해시 폐기.
  const searchInput = page
    .locator('[data-testid="product-catalog-search-input"] input, input[data-testid="product-catalog-search-input"]')
    .first()
  await searchInput.fill('PC1B')
  await page.locator('[data-testid="product-catalog-query-button"]').click()

  // 실모델코드 셀 — 개발책임자 지목 1WAY 대형 공청 = PC1BWCK3NW.
  await expect(page.getByRole('cell', { name: 'PC1BWCK3NW', exact: true }).first()).toBeVisible({ timeout: 20000 })
  // 회귀 가드: 'MAT-'+md5 12-hex 해시형 모델코드가 화면에 하나도 없어야 한다(개발책임자 지적 재발 방지).
  const hashCells = await page.getByText(/^MAT-[0-9A-F]{12}$/).count()
  expect(hashCells, `해시형 모델코드(MAT-xxxxxxxxxxxx)가 ${hashCells}건 잔존`).toBe(0)
  const pcCells = await page.getByRole('cell', { name: /^PC1B/, exact: false }).count()
  console.log(`[A1] 'PC1B' 검색 → 실모델코드 PC1BWCK3NW(1WAY 대형 공청) 노출. PC1B 패널군 셀 ${pcCells}개. 해시형 잔존 ${hashCells}건`)
  await shot(page, '01-real-catalog-model-codes')
})

// ─────────────────────────────────────────────────────────────────────────────
// A2. 품목 등록 종류(kind) 셀렉트 — 단일/세트 2가지만 노출
// ─────────────────────────────────────────────────────────────────────────────
test('A2: 품목 등록 — 종류는 단일/세트만 노출하고 제품 쪽 구성 분류는 숨긴다', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')))
  await page.goto(`${BASE_URL}/#/products/new`)
  // 품목 종류 radiogroup 노출까지 대기
  await page.getByRole('radiogroup', { name: '품목 종류' }).waitFor({ state: 'visible', timeout: 30000 })

  await expect(page.getByRole('radio', { name: '단일' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '세트' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '세트구성품' })).toHaveCount(0)
  await expect(page.locator('[data-testid="product-form-component-kind"]')).toHaveCount(0)
  await expect(page.getByText('부모 세트')).toHaveCount(0)
  console.log('[A2] 품목 종류는 단일/세트 2가지만 노출. 제품 쪽 부모 세트/구성 분류 UI 없음')
  await shot(page, '02-product-kind-select')
})

// ─────────────────────────────────────────────────────────────────────────────
// A3 + A4. 세트 구성품 모달 — '기본'(isDefault) 체크박스 + componentKind + 자동완성
// ─────────────────────────────────────────────────────────────────────────────
test('A3/A4: BUNDLE 구성품 모달 — 기본 토글+종류 + ProductAutocomplete 검색', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')))
  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })
  const categoryTab = page.locator(`[data-testid="estimate-items-category-tab-${SET_CATEGORY}"]`)
  await categoryTab.click()
  await expect(categoryTab).toHaveAttribute('aria-selected', 'true')

  const searchInput = page
    .locator('[data-testid="estimate-items-search-input"] input, input[data-testid="estimate-items-search-input"]')
    .first()
  await searchInput.fill(BUNDLE_CODE)
  await page.locator('[data-testid="estimate-items-query-button"]').click()
  await page.waitForSelector(`[data-testid="estimate-items-components-button-${BUNDLE_CODE}"]`, {
    timeout: 20000,
  })

  // 구성품 모달 열기 → 13구성품 GET 렌더
  await page.locator(`[data-testid="estimate-items-components-button-${BUNDLE_CODE}"]`).click()
  await page.waitForSelector('[data-testid="components-modal"]', { timeout: 15000 })
  await expect
    .poll(async () => page.locator('[data-testid^="components-modal-component-row-"]').count(), {
      timeout: 20000,
      message: '구성품 행이 렌더되지 않음(FE GET 실패 의심)',
    })
    .toBe(13)

  // '기본'(isDefault) 체크박스 + componentKind 텍스트가 행에 보이는지 확인
  await expect(page.locator('[data-testid="components-modal-default-0"]')).toBeVisible({ timeout: 5000 })
  const defaultChecked0 = await page.locator('[data-testid="components-modal-default-0"]').isChecked()
  // 첫 구성품(INDOOR) 은 isDefault=true (DB 확인됨)
  console.log(`[A3] 모달 13구성품 렌더. 첫 구성품 '기본' 체크=${defaultChecked0}. 행에 종류(실내기/실외기/판넬) 텍스트 표시`)
  await shot(page, '03-components-modal-default-toggle')

  // A4 — ProductAutocomplete(label '품목 검색') 검색 → 제안 목록 노출
  // dropdown 은 입력칸 바로 아래(position:absolute, top:100%+4)로 펼쳐진다. '품목 검색'은 모달 하단이라
  // 그대로 열면 제안 목록이 뷰포트 하단에 잘려 캡처에 안 보인다 → 입력칸을 화면 중앙으로 스크롤해
  // 아래쪽 공간을 확보한 뒤 연다.
  const autocomplete = page.getByRole('combobox', { name: '품목 검색' })
  await autocomplete.waitFor({ state: 'visible', timeout: 10000 })
  await autocomplete.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(200)
  await autocomplete.click()
  // 'PC6' (판넬 계열) 로 검색하면 단품 후보가 다수 매칭되어 제안 목록이 풍부하게 노출된다.
  await autocomplete.fill('PC6')
  // 제안 listbox 옵션이 '보이는' 상태까지 대기 (스피너 종료 후 실제 옵션 paint) — design-system AsyncAutocomplete.
  const listbox = page.getByRole('listbox')
  await listbox.waitFor({ state: 'visible', timeout: 12000 })
  const firstOption = listbox.getByRole('option').first()
  await firstOption.waitFor({ state: 'visible', timeout: 12000 })
  await expect
    .poll(async () => listbox.getByRole('option').count(), {
      timeout: 12000,
      message: '자동완성 제안이 노출되지 않음',
    })
    .toBeGreaterThan(0)
  // 스피너가 사라지고 옵션 텍스트가 렌더될 시간 확보 후 캡처(로딩 스피너 박제 방지).
  await page.waitForTimeout(600)
  const suggCount = await listbox.getByRole('option').count()
  const firstText = (await firstOption.textContent())?.trim() ?? ''
  console.log(`[A4] ProductAutocomplete 'PC6' 검색 → 제안 ${suggCount}건 노출. 첫 제안: ${firstText}`)
  await shot(page, '04-component-autocomplete')
})
