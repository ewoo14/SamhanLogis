import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * task5 배차 전표확인 = 출고전표 미리보기 — 실서버 GUI QA.
 *
 * 배차보드 미배차 전표 "전표확인" → SlipDetailModal 이 DispatchDocument(출고전표 문서)를
 * Modal size xl·1:1(zoom 없음)·세로스크롤로 렌더. 우측 잘림 없이 결재란/수량까지 보이는지 실증.
 * 실 게이트웨이 :8080 · mock OFF · dev_master · 실 슬립.
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
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/task5-dispatch-slip-preview'))
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

test('task5 배차 전표확인 → 출고전표 미리보기 모달(xl·무잘림)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await installAuthStub(page, await realLogin(page, 'dev_master'))

  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.waitForSelector('[data-testid="dispatch-board-undispatched-list"]', { timeout: 30000 })

  // 보드 적격 미배차 전표는 2026-01~03월 → 날짜 필터를 넓게.
  await page.getByTestId('dispatch-board-filter-from').fill('2026-01-01')
  await page.getByTestId('dispatch-board-filter-to').fill('2026-12-31')
  await page.waitForTimeout(1500)

  const openBtns = page.locator('[data-testid^="dispatch-board-slip-open-"]')
  const count = await openBtns.count()
  expect(count, '미배차 전표(전표확인 진입점) 최소 1건').toBeGreaterThan(0)
  await capture(page, 'board-undispatched-list')

  // 전표확인 클릭 → 출고전표 미리보기 모달.
  await openBtns.first().click()
  await page.waitForSelector('[data-testid="dispatch-board-slip-detail-body"]', { timeout: 15000 })
  await page.waitForTimeout(1200) // DispatchDocument(창고/결재라인 병렬 쿼리) 렌더

  const body = page.getByTestId('dispatch-board-slip-detail-body')
  await expect(body).toBeVisible()
  // 출고전표 문서 본문(DispatchDocument .dispatch-page) 렌더 확인.
  await expect(page.locator('.dispatch-page').first()).toBeVisible()
  await capture(page, 'slip-preview-modal-sales-document')

  // 모달 우측(결재란/수량 컬럼)까지 뷰 안에 들어오는지 — 문서 우측 경계 가시성.
  const docBox = await page.locator('.dispatch-page').first().boundingBox()
  const vw = page.viewportSize()!.width
  expect(docBox, '출고전표 문서 bounding box').not.toBeNull()
  if (docBox) {
    // 문서 우측 끝이 뷰포트 안(스크롤 없이 보임). xl 모달 + 1:1 이므로 여유 있게 들어와야 함.
    expect(docBox.x + docBox.width, '문서 우측 끝이 뷰포트 내').toBeLessThanOrEqual(vw)
  }
  await capture(page, 'slip-preview-modal-fullpage', true)

  await ctx.close()
})
