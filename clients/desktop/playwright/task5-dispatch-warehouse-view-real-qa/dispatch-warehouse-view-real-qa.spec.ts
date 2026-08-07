import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #706 — DISPATCH 역할 inventory.warehouse VIEW 부여(V79) 실서버 GUI QA.
 *
 * task5(#702) BE 권한갭: DISPATCH 계정이 배차보드 판매전표 미리보기(SlipDetailModal→DispatchDocument)에서
 * "출고창고" 값을 조회하지 못해 '-' 로 표시되던 문제를 auth V79(DISPATCH role_page_permission_templates +
 * group_page_permissions(그룹 106) + account_page_permissions 캐시)로 해소했는지 **DISPATCH 계정 자체**로 검증.
 *
 * 실 게이트웨이 :8080 · mock OFF · dev_dispatch(그룹 106=배차담당자) · 실 슬립(2026/03/09-1, 출고창고=본사창고).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/task5-dispatch-warehouse-view'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string, fullPage = false): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `gui-${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage,
  })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  expect(
    PASSWORD,
    'QA_DEV_DEFAULT_PASSWORD 환경변수를 설정해야 실서버 QA 로그인을 수행할 수 있습니다.',
  ).toBeTruthy()
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  expect(d.role, `${loginId} 역할이 DISPATCH 여야 함`).toBe('DISPATCH')
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
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

test('PR #706 — DISPATCH 계정 배차보드 판매전표 미리보기 출고창고 VIEW(V79)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  // 실 네트워크 호출 로그 — mock 개입 여부 육안 확인용(터미널 stdout).
  page.on('request', (req) => {
    if (req.url().includes('/inventory/warehouses')) {
      console.log(`[NET] ${req.method()} ${req.url()}`)
    }
  })

  await installAuthStub(page, await realLogin(page, 'dev_dispatch'))

  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.waitForSelector('[data-testid="dispatch-board-undispatched-list"]', { timeout: 30000 })

  // 보드 적격 미배차 전표는 2026-01~03월 시드 → 날짜 필터를 넓게.
  await page.getByTestId('dispatch-board-filter-from').fill('2026-01-01')
  await page.getByTestId('dispatch-board-filter-to').fill('2026-12-31')
  await page.waitForTimeout(1500)

  const openBtns = page.locator('[data-testid^="dispatch-board-slip-open-"]')
  const count = await openBtns.count()
  expect(count, 'DISPATCH 계정도 미배차 전표(전표확인 진입점) 최소 1건 조회 가능').toBeGreaterThan(0)
  await capture(page, 'dispatch-board-undispatched-list')

  // 전표확인 클릭 → 판매전표 미리보기 모달 (DispatchDocument).
  await openBtns.first().click()
  await page.waitForSelector('[data-testid="dispatch-board-slip-detail-body"]', { timeout: 15000 })
  await page.waitForTimeout(1500) // 창고/결재라인 병렬 쿼리 렌더 대기

  const body = page.getByTestId('dispatch-board-slip-detail-body')
  await expect(body).toBeVisible()
  await expect(page.locator('.dispatch-page').first()).toBeVisible()
  await capture(page, 'slip-preview-modal-full')

  // 핵심 단언 — V79 이전엔 403 → '-'. V79 이후엔 실제 창고명.
  const warehouseBox = page.locator('.dispatch-warehouse-emphasis').first()
  await expect(warehouseBox).toBeVisible()
  const warehouseText = (await warehouseBox.textContent())?.trim() ?? ''
  console.log(`[ASSERT] 출고창고 값 = "${warehouseText}"`)
  expect(warehouseText, 'DISPATCH 계정도 출고창고명을 확인해야 함(V79 이전 "-" 회귀 방지)').not.toBe('-')
  expect(warehouseText.length, '출고창고명이 비어있지 않아야 함').toBeGreaterThan(0)

  await warehouseBox.scrollIntoViewIfNeeded()
  await capture(page, 'warehouse-emphasis-closeup')

  await ctx.close()
})
