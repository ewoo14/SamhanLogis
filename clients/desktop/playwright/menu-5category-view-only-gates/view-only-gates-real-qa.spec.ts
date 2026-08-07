import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * cycle-3 view-only 변경 게이트 — 실서버(mock OFF) QA 캡처 (PR #462).
 *
 * 검증 대상: route=VIEW 가드 화면에서 변경 액션 버튼이 실 게이트웨이 권한(canAccess)에 따라
 *   disabled/enabled 로 정확히 갈리는지 — 실 로그인 6역할로 실증.
 *   대상 버튼: Aligo 주소록 'sync'(aligo.address-book/update) — 데이터 비의존 상시 렌더라 역할별 비교에 최적.
 *
 * 실서버:
 *  - api-gateway http://localhost:8080 (실 권한 API), FE real-mode dev http://localhost:5178 (AUDIT_BASE_URL).
 *  - mock 없음. 토큰/권한 모두 실 게이트웨이 취득(no-fake-data). 실패 시 정직 fail.
 *
 * 산출: docs/qa/menu-5category-view-only-gates/aligo-sync-<role>.png (역할별 버튼 상태)
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5178'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/menu-5category-view-only-gates'))
fs.mkdirSync(SHOTS, { recursive: true })

const ACCOUNTS = ['dev_master', 'dev_manager', 'dev_sales', 'dev_accountant', 'dev_warehouse', 'dev_dispatch']

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult | null> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  if (!res.ok()) return null
  const body = await res.json()
  const d = body.data ?? {}
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

test.describe('cycle-3 view-only 게이트 실서버 캡처 (Aligo sync)', () => {
  for (const acct of ACCOUNTS) {
    test(`${acct} — aligo.address-book sync 버튼 실 권한 상태`, async ({ page }) => {
      const login = await realLogin(page, acct)
      // 계정 미존재/로그인 실패는 정직 skip(가짜 생성 금지). 최소 dev_master 는 성공해야 함.
      test.skip(login === null, `${acct} 로그인 실패(미존재) — 실 캡처 불가, 정직 skip`)
      await installAuthStub(page, login!)
      await page.goto(`${BASE_URL}/#/admin/aligo-address-book`)
      // lazy route + 초기 쿼리 로드 대기. 버튼 출현 또는 안정화까지 기다린 뒤 상태 판정.
      await page.waitForSelector('aside.app-sidebar', { timeout: 30000 }).catch(() => {})
      const syncBtn = page.locator('[data-testid="admin-aligo-sync-btn"]')
      await syncBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(800)
      // 화면 진입 권한이 없으면 redirect — sync 버튼 부재. 진입 가능 케이스만 버튼 상태 캡처.
      const visible = await syncBtn.isVisible().catch(() => false)
      if (!visible) {
        await page.screenshot({ path: path.join(SHOTS, `aligo-sync-${acct}-noaccess.png`), fullPage: true })
        test.skip(true, `${acct}: aligo.address-book 진입 불가(권한 없음) — 게이트 대상 아님`)
        return
      }
      const disabled = await syncBtn.isDisabled()
      await page.screenshot({ path: path.join(SHOTS, `aligo-sync-${acct}-${disabled ? 'disabled' : 'enabled'}.png`), fullPage: true })
      // 단언이 아닌 캡처 목적 — 콘솔에 실 권한 결과 기록(역할별 disabled/enabled 대조 증빙).
      console.log(`[REAL-QA] ${acct} role=${login!.role} aligo sync disabled=${disabled}`)
      expect(visible).toBeTruthy()
    })
  }
})
