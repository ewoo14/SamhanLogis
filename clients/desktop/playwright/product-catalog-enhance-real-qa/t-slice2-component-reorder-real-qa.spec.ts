import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 에픽 #18 슬2 — 세트 구성품 종류 그룹/기본 고정/같은 종류 안 순서 변경 실서버 QA.
 *
 * 대상 BUNDLE: AC100CS6PHH1SY (PANEL 비기본 다수, product_db 실데이터)
 * 실서버: http://localhost:8080 (api-gateway), AUDIT_BASE_URL=http://127.0.0.1:5175 (renderer vite dev, mock OFF)
 * 인증: dev_master / QA_DEV_DEFAULT_PASSWORD 환경변수 (MASTER, products.admin UPDATE)
 *
 * 절차:
 *   1. dev_master 로그인 -> /products/estimate-items -> AC100CS6PHH1SY 검색
 *   2. '구성품' 버튼 -> components-modal 렌더 -> 종류 그룹 헤더 + 기본 고정 초기 상태 캡처
 *   3. PANEL 그룹의 첫 비기본 구성품을 같은 그룹 내 아래로 이동(마우스 드래그)
 *   4. 저장(PUT 실서버 200/204) -> 모달 재오픈 -> 순서 유지 단언 + 캡처
 *   5. 기본 행 드래그 핸들 disabled 확인 + 캡처
 *
 * 실행:
 *   # 터미널 1: renderer vite dev를 5175 포트/mock OFF로 실행
 *   # 터미널 2:
 *   cd clients/desktop
 *   $env:AUDIT_BASE_URL='http://127.0.0.1:5175'
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/product-catalog-enhance-real-qa/t-slice2-component-reorder-real-qa.spec.ts \
 *     --reporter=line --timeout=90000
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = 'http://localhost:8080'
const BUNDLE_CODE = 'AC100CS6PHH1SY'
const SET_CATEGORY = 'SINGLE_SET'

const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/product-set-component-reorder'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false })
}

async function loginAndInstallStub(page: Page, loginId: string, password: string): Promise<void> {
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
}

async function searchBundle(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })
  const categoryTab = page.locator(`[data-testid="estimate-items-category-tab-${SET_CATEGORY}"]`)
  await categoryTab.click()
  await expect(categoryTab).toHaveAttribute('aria-selected', 'true')
  const searchInput = page.locator(
    '[data-testid="estimate-items-search-input"] input, input[data-testid="estimate-items-search-input"]',
  ).first()
  await searchInput.fill(BUNDLE_CODE)
  await page.locator('[data-testid="estimate-items-query-button"]').click()
  await page.waitForSelector(`[data-testid="estimate-items-components-button-${BUNDLE_CODE}"]`, {
    timeout: 20000,
  })
}

async function openComponentsModal(page: Page): Promise<void> {
  await page.locator(`[data-testid="estimate-items-components-button-${BUNDLE_CODE}"]`).click()
  await page.waitForSelector('[data-testid="components-modal"]', { timeout: 15000 })
  await expect
    .poll(
      async () => page.locator('[data-testid^="components-modal-component-row-"]').count(),
      { timeout: 20000, message: '구성품 행이 렌더되지 않음(FE GET 실패 의심)' },
    )
    .toBeGreaterThan(0)
}

async function componentCode(row: Locator): Promise<string> {
  const code = await row.evaluate((element) => {
    const contentSpan = Array.from(element.children).find(
      (child) => child.tagName.toLowerCase() === 'span',
    )
    return contentSpan?.querySelector('span')?.textContent?.trim() ?? ''
  })
  if (code && code !== '⠿') return code

  const text = ((await row.textContent()) ?? '').replace(/⠿/g, ' ').trim()
  const fallbackCode = text.split(/\s+/).find((token) => token.length > 0)
  if (fallbackCode) return fallbackCode

  throw new Error('구성품 행에서 모델코드를 추출하지 못함')
}

async function panelRows(page: Page): Promise<Locator[]> {
  const group = page.getByTestId('components-modal-kind-group-PANEL')
  await expect(group, 'PANEL 종류 그룹이 보이지 않음').toBeVisible({ timeout: 10000 })
  const rows = await group.locator('[data-testid^="components-modal-component-row-"]').all()
  expect(rows.length, 'PANEL 그룹 구성품이 3건 미만이면 2칸 reorder 검증 불가').toBeGreaterThanOrEqual(3)
  return rows
}

async function firstPanelDefaultRow(page: Page): Promise<Locator> {
  for (const row of await panelRows(page)) {
    const checkbox = row.locator('input[type="checkbox"][data-testid^="components-modal-default-"]').first()
    if (await checkbox.isChecked()) return row
  }
  throw new Error('PANEL 기본 구성품 행을 찾지 못함')
}

async function firstPanelNonDefaultRow(page: Page): Promise<Locator> {
  for (const row of await panelRows(page)) {
    const checkbox = row.locator('input[type="checkbox"][data-testid^="components-modal-default-"]').first()
    if (!(await checkbox.isChecked())) return row
  }
  throw new Error('PANEL 비기본 구성품 행을 찾지 못함')
}

async function panelCodes(page: Page): Promise<string[]> {
  const codes: string[] = []
  for (const row of await panelRows(page)) {
    codes.push(await componentCode(row))
  }
  return codes
}

async function mouseDragHandleToRow(page: Page, handle: Locator, targetRow: Locator): Promise<void> {
  const handleBox = await handle.boundingBox()
  if (!handleBox) throw new Error('드래그 핸들 위치를 계산하지 못함')
  const targetBox = await targetRow.boundingBox()
  if (!targetBox) throw new Error('드롭 대상 행 위치를 계산하지 못함')

  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  }
  const target = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x, start.y + 10, { steps: 4 })
  await page.waitForTimeout(200)
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await page.waitForTimeout(200)
  await page.mouse.up()
}

test('슬2 구성품 reorder: 종류 그룹/기본 고정 + 같은 PANEL 그룹 내 순서 저장 영속', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')))

  await searchBundle(page)
  await openComponentsModal(page)

  await expect(page.getByTestId('components-modal-kind-group-PANEL')).toBeVisible()
  const defaultRow = await firstPanelDefaultRow(page)
  const defaultHandle = defaultRow.locator('[data-testid^="components-modal-drag-handle-"]').first()
  await expect(defaultHandle, '기본 구성품 드래그 핸들은 disabled 여야 함').toBeDisabled()
  await shot(page, 'reorder-initial')

  const beforeCodes = await panelCodes(page)
  const activeRow = await firstPanelNonDefaultRow(page)
  const activeCode = await componentCode(activeRow)
  const activeBeforeIndex = beforeCodes.indexOf(activeCode)
  expect(activeBeforeIndex, '이동 대상 PANEL 비기본 행의 초기 인덱스를 찾지 못함').toBeGreaterThanOrEqual(0)
  const targetIndex = Math.min(activeBeforeIndex + 2, beforeCodes.length - 1)
  expect(targetIndex, '이동 대상은 초기 인덱스보다 아래 행이어야 함').toBeGreaterThan(activeBeforeIndex)
  const targetRow = (await panelRows(page))[targetIndex]
  const activeHandle = activeRow.locator('[data-testid^="components-modal-drag-handle-"]').first()

  await mouseDragHandleToRow(page, activeHandle, targetRow)

  await expect
    .poll(
      async () => (await panelCodes(page)).indexOf(activeCode) > activeBeforeIndex,
      { timeout: 5000, message: 'PANEL 비기본 행 인덱스가 증가하지 않음' },
    )
    .toBe(true)
  const movedCodes = await panelCodes(page)
  expect(movedCodes, 'PANEL 비기본 행이 같은 그룹 안에서 순서 변경되어야 함').not.toEqual(beforeCodes)

  const putRespPromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/products/${BUNDLE_CODE}/components`) &&
      r.request().method() === 'PUT',
    { timeout: 20000 },
  )
  await page.locator('[data-testid="components-modal-save-button"]').click()
  const putResp = await putRespPromise
  expect([200, 204], `구성품 저장 PUT 응답 ${putResp.status()}`).toContain(putResp.status())
  await expect(page.locator('[data-testid="components-modal"]')).toBeHidden({ timeout: 10000 })

  await openComponentsModal(page)
  const reopenedCodes = await panelCodes(page)
  expect(reopenedCodes, '저장 후 재오픈한 PANEL 그룹 순서가 저장 직후 순서와 다름').toEqual(movedCodes)
  await shot(page, 'reorder-after-save')

  const reopenedDefaultRow = await firstPanelDefaultRow(page)
  const reopenedDefaultHandle = reopenedDefaultRow.locator('[data-testid^="components-modal-drag-handle-"]').first()
  await expect(reopenedDefaultHandle, '재오픈 후에도 기본 구성품 드래그 핸들은 disabled 여야 함').toBeDisabled()
  await shot(page, 'default-pinned')
})
