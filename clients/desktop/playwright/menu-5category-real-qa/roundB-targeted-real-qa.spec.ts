import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * Round B 타깃 QA spec (PR #462) — Round B fix(378291b7) 가시 변경 실서버 재캡처.
 *
 * 검증 대상(Round B 변경):
 *  1) 배차 그룹 헤더 라벨 'arologis'(코드명) → '배차'(업무 라벨). 6번째 그룹 == '배차'.
 *  2) 단톡방 매핑 그룹웨어 단일화 — MASTER 도 그룹웨어 그룹 내 '단톡방 매핑' 노출
 *     (구: show={... && !showAdmin} 로 MASTER 배제 + AdminLayout 중복). AdminLayout 중복 제거.
 *  3) 7그룹 + 홈 + 알림 내역 정합 + pageerror 0.
 *
 * 실서버(mock OFF):
 *  - api-gateway: http://localhost:8080 (실 권한 API)
 *  - FE renderer dev: http://localhost:5177 (VITE_API_BASE_URL=http://localhost:8080)
 *
 * 인증(실 dev 계정, QA_DEV_DEFAULT_PASSWORD 환경변수): dev_master(MASTER), dev_dispatch(DISPATCH).
 *
 * 산출: docs/qa/menu-5category/roundB-MASTER-menu.png, roundB-DISPATCH-menu.png
 *
 * no-fake-data: 토큰/권한 모두 실 게이트웨이 취득. mock 없음. 실패 시 정직 fail.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5177'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')

const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/menu-5category'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const GROUP_LABELS = ['판매', '구매', '회계', '그룹웨어', '인사', '배차', '창고 운영'] as const

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()} — Docker 스택 미기동?`).toBeTruthy()
  const body = await res.json()
  return {
    token: body.data?.token ?? '',
    role: body.data?.role ?? '',
    userId: body.data?.userId ?? '',
    displayName: body.data?.displayName ?? loginId,
  }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({
            token: tok,
            userId: uid,
            role: r,
            fullName: name,
            partnerCode: null,
          }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

async function loadSidebar(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/`)
  await page.waitForSelector('aside.app-sidebar', { timeout: 30000 })
  await page.waitForSelector('aside.app-sidebar a:has-text("홈")', { timeout: 15000 })
  await page
    .waitForSelector('aside.app-sidebar .app-sidebar-group', { timeout: 15000 })
    .catch(() => undefined)
  await page.waitForTimeout(1500)
}

async function openSidebarCategory(page: Page, label: string): Promise<void> {
  const toggle = page.getByTestId(`sidebar-category-toggle-${label.replace(/\s+/g, '')}`)
  await expect(toggle, `${label} 그룹 토글 버튼`).toBeVisible({ timeout: 10_000 })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  await expect(toggle, `${label} 그룹 펼침 상태`).toHaveAttribute('aria-expanded', 'true')
}

test('Round B — MASTER 좌측메뉴: 배차 라벨 + 단톡방 매핑 그룹웨어 노출 + 7그룹/홈/알림', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_master')
  expect(login.role, 'dev_master 역할이 MASTER 가 아님').toBe('MASTER')
  await installAuthStub(page, login)
  await loadSidebar(page)

  const sidebar = page.locator('aside.app-sidebar')

  // 캡처 먼저(단언 전 증거 확보) — Round B 명명
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'roundB-MASTER-menu.png'),
    fullPage: true,
  })

  // (a) 7그룹 헤더 순서/존재 + 6번째 == '배차' (arologis/AROLOGIS 아님)
  const groupHeaders = sidebar.locator('.app-sidebar-group')
  const renderedGroupTexts = (await groupHeaders.allTextContents()).map((t) => t.trim())
  console.log(`[Round B MASTER] 렌더 그룹 헤더: ${JSON.stringify(renderedGroupTexts)}`)

  for (const label of GROUP_LABELS) {
    expect(renderedGroupTexts, `MASTER 는 '${label}' 그룹 헤더가 보여야 함`).toContain(label)
  }
  // 6번째(index 5) 그룹 라벨 == '배차'
  expect(renderedGroupTexts[5], `6번째 그룹 헤더가 '배차' 가 아님(arologis 잔존?)`).toBe('배차')
  // arologis/AROLOGIS 코드명이 어떤 그룹 헤더에도 없어야 함
  for (const t of renderedGroupTexts) {
    expect(t.toLowerCase()).not.toContain('arologis')
  }

  // (b) 홈 최상단 + 알림 내역
  // [Round C P3 #9] hasText('홈') 은 '홈택스 일괄 양식' 오매칭 → 정확 이름(exact) 로케이터로 한정.
  await expect(sidebar.getByRole('link', { name: '홈', exact: true }).first(), '홈 메뉴').toBeVisible()
  await expect(
    sidebar.locator('[data-testid="sidebar-notifications"]'),
    '알림 내역 메뉴',
  ).toBeVisible()

  // (c) 단톡방 매핑 — MASTER 도 그룹웨어 그룹 내 노출(Round B 단일화)
  await openSidebarCategory(page, '그룹웨어')
  const chatRoom = sidebar.locator('[data-testid="sidebar-admin-chat-rooms"]')
  await expect(chatRoom, 'MASTER 도 단톡방 매핑 항목이 보여야 함(Round B 그룹웨어 단일화)').toBeVisible()
  await expect(chatRoom, '단톡방 매핑 라벨').toHaveText(/단톡방 매핑/)
  // 단톡방 매핑이 그룹웨어 그룹(role=group, aria-labelledby == 그룹웨어 헤더) 안에 위치하는지 확인
  const groupwareHeadingId = await sidebar
    .locator('[data-testid="sidebar-category-toggle-그룹웨어"]')
    .getAttribute('id')
  expect(groupwareHeadingId, '그룹웨어 헤더 id(접근성 aria-labelledby 연결)').toBeTruthy()
  const chatInGroupware = sidebar.locator(
    `[role="group"][aria-labelledby="${groupwareHeadingId}"] [data-testid="sidebar-admin-chat-rooms"]`,
  )
  await expect(
    chatInGroupware,
    '단톡방 매핑이 그룹웨어 그룹(role=group) 내부에 위치해야 함',
  ).toHaveCount(1)

  // (d) pageerror 0
  expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
})

test('Round B — DISPATCH 좌측메뉴: 배차 그룹 라벨 재캡처', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_dispatch')
  expect(login.role, 'dev_dispatch 역할이 DISPATCH 가 아님').toBe('DISPATCH')
  await installAuthStub(page, login)
  await loadSidebar(page)

  const sidebar = page.locator('aside.app-sidebar')

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'roundB-DISPATCH-menu.png'),
    fullPage: true,
  })

  const renderedGroupTexts = (await sidebar.locator('.app-sidebar-group').allTextContents()).map(
    (t) => t.trim(),
  )
  console.log(`[Round B DISPATCH] 렌더 그룹 헤더: ${JSON.stringify(renderedGroupTexts)}`)
  expect(renderedGroupTexts, "DISPATCH 는 '배차' 그룹 헤더가 보여야 함").toContain('배차')
  for (const t of renderedGroupTexts) {
    expect(t.toLowerCase()).not.toContain('arologis')
  }

  expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
})
