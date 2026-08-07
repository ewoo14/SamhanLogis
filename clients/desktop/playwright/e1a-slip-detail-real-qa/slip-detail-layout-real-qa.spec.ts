import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * E1-a 전표 상세 레이아웃 정비 — 실서버 GUI QA.
 *
 * 검증: (C) presence(보는 사람)가 문서 상단·확대(size lg)로 표시 / (A) 협업패널+수정이력이 폼 최하단.
 * 실 게이트웨이 :8080 · mock OFF · dev_master · 실 슬립. 합성/fixture 없음.
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
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e1a-slip-detail-layout'))
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

test('E1-a 전표 상세 — presence 상단 확대 + 협업/수정이력 최하단 (desktop+mobile)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 실 슬립 1건 조회(Page<SlipSummary>).
  const listRes = await page.request.get(`${API_BASE}/api/v1/slips?page=0&size=10`, {
    headers: { Authorization: `Bearer ${login.token}` },
  })
  expect(listRes.ok(), `슬립 리스트 조회 실패: HTTP ${listRes.status()}`).toBeTruthy()
  const content = (await listRes.json()).data?.content ?? []
  expect(content.length, '실 슬립이 최소 1건 있어야 QA 가능').toBeGreaterThan(0)
  const slip = content[0]
  const st = String(slip.slipType ?? '')
  const base = st.includes('INBOUND') || st.includes('PURCHASE') ? 'purchases' : 'sales'

  // 상세 진입.
  await page.goto(`${BASE_URL}/#/${base}/${slip.id}`)
  await page.waitForSelector('[data-testid="slip-detail-revision-count"]', { timeout: 30000 })
  await page.waitForTimeout(1800) // presence join(detailQuery.data 후 게이팅) 반영 대기

  // (C) 문서 상단 presence(size lg) — 전표번호 옆.
  const presence = page.getByTestId('presence-indicator')
  await expect(presence, 'presence 가 문서 상단에 렌더되어야 함(본인 세션 포함)').toBeVisible()
  await capture(page, 'desktop-top-presence-lg')

  // (A) 최하단 협업패널 + 수정이력.
  const collab = page.getByTestId('slip-collaboration-panel')
  await collab.scrollIntoViewIfNeeded()
  await expect(collab).toBeVisible()
  await capture(page, 'desktop-bottom-collab-history')

  // 전체 페이지 흐름(상단 presence → 본문 → 최하단 협업/이력 → 액션바).
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await capture(page, 'desktop-fullpage', true)

  // 모바일 뷰포트 — presence 상단 + collapsible 순서(협업/이력이 하단).
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture(page, 'mobile-top')
  await capture(page, 'mobile-fullpage', true)

  await ctx.close()
})
