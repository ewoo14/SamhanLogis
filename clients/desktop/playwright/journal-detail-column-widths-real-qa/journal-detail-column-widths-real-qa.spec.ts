/**
 * #711 분개 상세 라인 테이블 열 재배분 — 실서버 GUI 실증 (mock OFF).
 *
 * 캡처(docs/qa/journal-detail-column-widths/):
 *  01 분개 상세 전폭 — 차변 좌측 당김·거래처 확대·합계 행 정렬(HIGH fix 검증)
 *  02 라인 테이블+합계 클로즈업 — 차/대 합계가 각 열 아래 정렬
 *  03 분개장 목록(역분개 필터) — 구 J- 형식 시드 정리 후 중복 부재 실증
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/journal-detail-column-widths')
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

async function captureElement(
  page: Page,
  locator: ReturnType<Page['locator']>,
  name: string,
): Promise<void> {
  shotNo++
  await locator.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`) })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
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

test('열 재배분 실증 — 차변 좌측·거래처 확대·합계 정렬·J- 시드 정리', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 분개 UUID resolve(화면 비노출·라우팅 전용) — 라인 2건 보유 실분개(2026/07/03-3 재게시분).
  const res = await page.request.get(`${API_BASE}/accounting/journals?status=REVERSED&page=0&size=50`, {
    headers: { Authorization: `Bearer ${login.token}` },
  })
  const rows = ((await res.json()).data?.content ?? []) as Array<{ id: string; journalNo: string }>
  const target = rows.find((r) => r.journalNo === '2026/07/03-3')
  expect(target, '실분개 2026/07/03-3 필요(라이브 QA 선행 데이터)').toBeTruthy()

  // 1) 분개 상세 전폭 — 열 재배분+합계 행 정렬
  await page.goto(`${BASE_URL}/#/accounting/journals/${target!.id}`)
  await expect(page.getByText('2026/07/03-3').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/180,000/).first()).toBeVisible()
  await capture(page, 'journal-detail-fullwidth-columns')

  // 2) 라인 테이블+합계 클로즈업 — 합계 grid 미러(fix) 검증 컷
  const table = page.locator('table').first()
  const totals = page.locator('.journal-totals').first()
  await expect(totals).toBeVisible()
  const tableBox = await table.boundingBox()
  const totalsBox = await totals.boundingBox()
  expect(tableBox).toBeTruthy()
  expect(totalsBox).toBeTruthy()
  await page.screenshot({
    path: path.join(SHOTS, `${String(++shotNo).padStart(2, '0')}-table-and-totals-closeup.png`),
    clip: {
      x: tableBox!.x,
      y: tableBox!.y,
      width: Math.min(tableBox!.width, 1200),
      height: totalsBox!.y + totalsBox!.height - tableBox!.y + 8,
    },
  })

  // 3) 분개장 목록(역분개 필터) — 구 J- 형식 부재(시드 정리 실증) + 슬래시 형식만 표시
  await page.goto(`${BASE_URL}/#/accounting/journals`)
  await expect(page.locator('h3', { hasText: '분개장' })).toBeVisible({ timeout: 30_000 })
  await page.locator('select').first().selectOption('REVERSED')
  await expect(page.getByText('2026/07/03-1', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/^J-2026-/)).toHaveCount(0)
  await captureElement(page, page.locator('table').first(), 'journal-list-no-duplicate-seeds')
})
