/**
 * #711 분개 상세 라인 테이블 열 재배분 — 실서버 GUI 실증 (mock OFF).
 *
 * 캡처(docs/qa/journal-detail-column-widths/screenshots/):
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
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/journal-detail-column-widths/screenshots')
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

async function findJournalByNo(page: Page, token: string, journalNo: string): Promise<{ id: string; journalNo: string } | undefined> {
  for (let pageNo = 0; pageNo < 10; pageNo++) {
    const res = await page.request.get(`${API_BASE}/accounting/journals?status=REVERSED&page=${pageNo}&size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `분개 목록 조회 실패: HTTP ${res.status()}`).toBeTruthy()
    const rows = ((await res.json()).data?.content ?? []) as Array<{ id: string; journalNo: string }>
    const found = rows.find((r) => r.journalNo === journalNo)
    if (found) return found
    if (rows.length < 50) return undefined
  }
  return undefined
}

async function expectNoLegacyJournals(page: Page, token: string): Promise<void> {
  const statuses = ['DRAFT', 'POSTED', 'REVERSED']
  const legacy: string[] = []
  for (const status of statuses) {
    for (let pageNo = 0; pageNo < 20; pageNo++) {
      const res = await page.request.get(`${API_BASE}/accounting/journals?status=${status}&page=${pageNo}&size=100`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(res.ok(), `분개 목록 조회 실패(${status}/${pageNo}): HTTP ${res.status()}`).toBeTruthy()
      const rows = ((await res.json()).data?.content ?? []) as Array<{ journalNo: string }>
      legacy.push(...rows.map((r) => r.journalNo).filter((no) => /^J-2026-/.test(no)))
      if (rows.length < 100) break
    }
  }
  expect(legacy, '구 J-2026- 형식 분개번호 잔여').toEqual([])
}

async function expectRightEdgesAligned(
  left: ReturnType<Page['locator']>,
  right: ReturnType<Page['locator']>,
  label: string,
): Promise<void> {
  const leftBox = await left.boundingBox()
  const rightBox = await right.boundingBox()
  expect(leftBox, `${label}: table cell bounding box`).toBeTruthy()
  expect(rightBox, `${label}: totals cell bounding box`).toBeTruthy()
  const delta = Math.abs((leftBox!.x + leftBox!.width) - (rightBox!.x + rightBox!.width))
  expect(delta, `${label}: table/totals right edge delta`).toBeLessThanOrEqual(2)
}

test('열 재배분 실증 — 차변 좌측·거래처 확대·합계 정렬·J- 시드 정리', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 분개 UUID resolve(화면 비노출·라우팅 전용) — 라인 2건 보유 실분개(2026/07/03-3 재게시분).
  const target = await findJournalByNo(page, login.token, '2026/07/03-3')
  expect(target, '실분개 2026/07/03-3 필요(라이브 QA 선행 데이터)').toBeTruthy()

  // 1) 분개 상세 전폭 — 열 재배분+합계 행 정렬
  await page.goto(`${BASE_URL}/#/accounting/journals/${target!.id}`)
  await expect(page.getByText('2026/07/03-3').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/180,000/).first()).toBeVisible()
  await capture(page, 'journal-detail-fullwidth-columns')

  // 2) 라인 테이블+합계 클로즈업 — 합계=테이블 내부 행(journal-total-row)이라 열 정렬을 구조가 보장.
  //    열 순서(개발책임자 지시): # | 계정과목 | 거래처 | 차변 | 대변 | 메모 — 거래처가 차변 왼쪽.
  const table = page.locator('table').first()
  const headers = table.locator('thead th')
  await expect(headers.nth(2)).toHaveText('거래처')
  await expect(headers.nth(3)).toHaveText('차변')
  await expect(headers.nth(4)).toHaveText('대변')
  const totals = table.locator('tr.journal-total-row')
  await expect(totals).toHaveCount(1)
  await expect(totals.locator('td').nth(1)).toContainText('합계')
  const firstLine = table.locator('tbody tr').first()
  await expectRightEdgesAligned(firstLine.locator('td').nth(3), totals.locator('td').nth(3), '차변')
  await expectRightEdgesAligned(firstLine.locator('td').nth(4), totals.locator('td').nth(4), '대변')
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
  await expectNoLegacyJournals(page, login.token)
  await page.goto(`${BASE_URL}/#/accounting/journals`)
  await expect(page.locator('h3', { hasText: '분개장' })).toBeVisible({ timeout: 30_000 })
  await page.locator('select').first().selectOption('REVERSED')
  await expect(page.getByText('2026/07/03-1', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/^J-2026-/)).toHaveCount(0)
  await captureElement(page, page.locator('table').first(), 'journal-list-no-duplicate-seeds')
})
