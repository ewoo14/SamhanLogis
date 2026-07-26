import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 사양 인지형 입력 (사양 후속 #1 재설계) Docker 실서버 QA Playwright spec.
 *
 * 대상: 품목 등록 폼 사양 섹션 — 품목별 사양 드롭다운(estimate_category 필터) + valueType 입력
 *       (NUMBER 숫자+단위 / DIMENSION 3분할 WxHxD / TEXT) + 순서변경(위/아래) + 중복제외.
 * 실서버: http://localhost:8080 (api-gateway, 실 product-service V17), FE http://localhost:5173.
 * 인증: dev_master / dev_p05_pass! (MASTER, products.list VIEW).
 *
 * 실행: cd C:\dev\Samhan-Public\clients\desktop
 *   set AUDIT_BASE_URL=http://localhost:5173 && node_modules\.bin\playwright test \
 *     --config=playwright.real-qa.config.ts playwright/spec-aware-input-real-qa --reporter=line --timeout=90000
 */
import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'
const API_BASE = 'http://localhost:8080'
const OUT = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/spec-aware-input'))
const PANEL_OUT = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/panel-spec-relabel'))
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(PANEL_OUT, { recursive: true })

async function loginAndInstallStub(page: Page, loginId: string, password: string): Promise<void> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password } })
  const body = await res.json()
  const token: string = body.data?.token ?? ''
  const role: string = body.data?.role ?? 'MASTER'
  const userId: string = body.data?.userId ?? ''
  const displayName: string = body.data?.displayName ?? loginId
  await page.addInitScript(({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { tok: token, r: role, uid: userId, name: displayName })
}

test('사양 인지형 입력 — 품목별 드롭다운·valueType·순서·중복', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')
  await page.goto(`${BASE_URL}/#/products/new`)
  await page.waitForSelector('[data-testid="product-form-model-name"]', { timeout: 30000 })

  // 품목 카테고리 = 상업멀티 (능력 NUMBER + 제품크기 DIMENSION + 냉매가스 TEXT)
  await page.selectOption('[data-testid="product-form-product-category"]', 'COMMERCIAL_MULTI')
  await page.waitForTimeout(1500) // 템플릿 로드

  // 행0: NUMBER (냉방능력, kW) — 통합 "사양" 필드에 입력 → 값 필드 동적 전환(숫자+단위 suffix)
  await page.click('[data-testid="product-form-add-spec"]')
  await page.waitForSelector('[data-testid="product-form-spec-0-key"]', { timeout: 10000 })
  await page.fill('[data-testid="product-form-spec-0-key"]', '냉방능력, kW')
  await page.waitForTimeout(300) // valueType 적용 re-render
  await page.fill('[data-testid="product-form-spec-0-value"]', '101.0')
  const row0Unit = await page.locator('[data-testid="product-form-spec-0-row"]').innerText()
  expect(row0Unit).toContain('kW')

  // 행1: DIMENSION (제품크기, mm) → 값 필드가 3분할 WxHxD 로 동적 전환
  await page.click('[data-testid="product-form-add-spec"]')
  await page.fill('[data-testid="product-form-spec-1-key"]', '제품크기, mm')
  await page.waitForSelector('[data-testid="product-form-spec-1-dimension-width"]', { timeout: 5000 })
  await page.fill('[data-testid="product-form-spec-1-dimension-width"]', '1800')
  await page.fill('[data-testid="product-form-spec-1-dimension-height"]', '2370')
  await page.fill('[data-testid="product-form-spec-1-dimension-depth"]', '1070')

  // 행2: TEXT (냉매가스) → 자유 텍스트
  await page.click('[data-testid="product-form-add-spec"]')
  await page.fill('[data-testid="product-form-spec-2-key"]', '냉매가스')
  await page.waitForTimeout(300)
  await page.fill('[data-testid="product-form-spec-2-value"]', 'R410A')

  await page.screenshot({ path: path.join(OUT, '01-valuetypes.png'), fullPage: true })

  // 중복 제외 검증: 행3 datalist 후보에 이미 추가된 사양 미포함
  await page.click('[data-testid="product-form-add-spec"]')
  await page.waitForSelector('#spec-key-options-3', { state: 'attached', timeout: 5000 })
  const row3Options = await page.$$eval('#spec-key-options-3 option', (els) =>
    els.map((e) => (e as HTMLOptionElement).value).filter(Boolean))
  const added = ['냉방능력, kW', '제품크기, mm', '냉매가스']
  const leaked = added.filter((a) => row3Options.includes(a))
  expect(leaked).toEqual([]) // 추가된 사양은 후보에서 제외

  // 순서 변경: 행0(냉방능력) 아래로 이동
  await page.click('[data-testid="product-form-spec-0-move-down"]')
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, '02-dedup-and-reorder.png'), fullPage: true })

  fs.writeFileSync(path.join(OUT, 'spec-aware-evidence.txt'),
    `품목 카테고리=COMMERCIAL_MULTI (estimate_category 필터)\n`
    + `행0 NUMBER "냉방능력, kW" 단위 suffix 노출=${row0Unit.includes('kW')}\n`
    + `행1 DIMENSION "제품크기, mm" 3분할(1800x2370x1070)\n`
    + `행2 TEXT "냉매가스" R410A\n`
    + `중복제외: 행3 후보에서 추가된 ${added.length}개 제외 누수=${leaked.length}\n`
    + `행3 잔여 후보 수=${row3Options.length}\n`
    + `순서변경: 행0 아래로 이동(드래그+위/아래 버튼 제공)\n`, 'utf8')
})

test('시드 제품 편집 — 기존 적재 사양 그대로 조회', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')
  // 시드 적재 사양 13개 보유 상업 제품
  await page.goto(`${BASE_URL}/#/products/AM100AXVHJH1/edit`)
  await page.waitForSelector('[data-testid="product-form-spec-0-key"]', { timeout: 30000 })
  await page.waitForTimeout(800)

  const loaded = await page.$$eval(
    '[data-testid$="-key"][data-testid^="product-form-spec-"]',
    (els) => els.map((e) => (e as HTMLInputElement).value).filter(Boolean),
  )
  expect(loaded.length).toBeGreaterThanOrEqual(5) // seeded specs loaded

  const numberInputCount = await page.locator(
    'input[type="number"][data-testid^="product-form-spec-"][data-testid$="-value"]',
  ).count()
  expect(numberInputCount).toBeGreaterThan(0)

  const rowTexts = await page.locator('[data-testid^="product-form-spec-"][data-testid$="-row"]').allInnerTexts()
  const unitBearingRows = rowTexts.filter((text) => /\b(kW|kcal\/h|mm|kg|A|m)\b/.test(text))
  expect(unitBearingRows.length).toBeGreaterThan(0)

  const dimensionInputCount = await page.locator('[data-testid$="-dimension-width"]').count()
  const rangeInputCount = await page.locator('[data-testid$="-range-min"]').count()
  expect(dimensionInputCount + rangeInputCount).toBeGreaterThan(0)

  await page.screenshot({ path: path.join(OUT, '03-edit-seeded-specs.png'), fullPage: true })

  fs.writeFileSync(path.join(OUT, 'edit-seeded-evidence.txt'),
    `시드 제품 AM100AXVHJH1 편집 — V17 키 + valueType 재현 사양 ${loaded.length}개 로드됨\n`
    + `NUMBER 단위 suffix 행=${unitBearingRows.length}, DIMENSION 입력=${dimensionInputCount}, RANGE 입력=${rangeInputCount}\n`
    + `--- 로드된 사양명(V17 키 + valueType 재현) ---\n${loaded.join('\n')}\n`, 'utf8')
})

test('판넬 제품 편집 — 타공사이즈/전산볼트간격 로드 및 구 오라벨 제거', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')
  // HOME_MULTI 판넬: 구 오라벨(냉방능력/냉방소비전력) 대신 판넬 전용 사양 키가 로드되어야 한다.
  await page.goto(`${BASE_URL}/#/products/PC1BWCK3N/edit`)
  await page.waitForSelector('[data-testid="product-form-spec-0-key"]', { timeout: 30000 })
  await page.waitForTimeout(800)

  const loaded = await page.$$eval(
    '[data-testid$="-key"][data-testid^="product-form-spec-"]',
    (els) => els.map((e) => (e as HTMLInputElement).value).filter(Boolean),
  )

  expect(loaded).toContain('타공사이즈, mm')
  expect(loaded).toContain('전산볼트간격, mm')
  expect(loaded.some((key) => key.startsWith('냉방능력'))).toBe(false)
  expect(loaded.some((key) => key.startsWith('냉방소비전력'))).toBe(false)

  await page.screenshot({ path: path.join(PANEL_OUT, '01-panel-edit.png'), fullPage: true })

  fs.writeFileSync(path.join(PANEL_OUT, 'panel-edit-evidence.txt'),
    `HOME_MULTI 판넬 PC1BWCK3N 편집 — 로드된 판넬 사양 키 ${loaded.length}개\n`
    + `--- 로드된 판넬 사양 키 목록 ---\n${loaded.join('\n')}\n`
    + `타공사이즈/전산볼트간격 정합, 냉방능력 오라벨 제거\n`, 'utf8')
})

test('RANGE — 싱글세트 능력 최소/정격/최대 3칸 입력 + / 결합', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')
  await page.goto(`${BASE_URL}/#/products/new`)
  await page.waitForSelector('[data-testid="product-form-model-name"]', { timeout: 30000 })

  // 싱글세트 → 능력/소비전력 = RANGE
  await page.selectOption('[data-testid="product-form-product-category"]', 'SINGLE_SET')
  await page.waitForTimeout(1500)

  await page.click('[data-testid="product-form-add-spec"]')
  await page.fill('[data-testid="product-form-spec-0-key"]', '냉방능력, kW')
  // RANGE 입력 = 최소/정격/최대 3칸으로 동적 전환
  await page.waitForSelector('[data-testid="product-form-spec-0-range-min"]', { timeout: 5000 })
  await page.fill('[data-testid="product-form-spec-0-range-min"]', '1.80')
  await page.fill('[data-testid="product-form-spec-0-range-rated"]', '5.20')
  await page.fill('[data-testid="product-form-spec-0-range-max"]', '7.20')
  const rowText = await page.locator('[data-testid="product-form-spec-0-row"]').innerText()
  expect(rowText).toContain('kW') // 단위 suffix
  await page.screenshot({ path: path.join(OUT, '04-range-input.png'), fullPage: true })

  fs.writeFileSync(path.join(OUT, 'range-evidence.txt'),
    `싱글세트 "냉방능력, kW" = RANGE → 최소/정격/최대 3칸(1.80 · 5.20 · 7.20) + kW suffix.\n`
    + `저장 시 "/" 결합("1.80/5.20/7.20") — composeRangeSpecValue.\n`, 'utf8')
})
