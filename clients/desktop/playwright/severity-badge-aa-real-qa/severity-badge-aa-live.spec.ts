import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #795 — NotificationHistoryPage SeverityBadge(INFO/WARNING/CRITICAL) AA 대비 개선
 * 실서버 GUI QA (mock OFF). 실 게이트웨이(:8080) 로그인 + 실 notification-service(:8093) 데이터.
 *
 * 🪤 pre-existing 게이트웨이 계약 갭(이 PR 범위 밖, #795와 무관):
 * Phase C5-4 에서 게이트웨이가 X-User-Role 헤더 주입을 제거했으나(project role→group 전환),
 * notification-service NotificationCenterController(`GET /notifications/history`)는 여전히
 * `@RequestHeader("X-User-Role") String role` 필수 파라미터를 요구 — 실 게이트웨이 경유 시
 * MissingRequestHeaderException 500. FE apiClient 는 Authorization Bearer 만 전송(X-User-Role
 * 클라 미생성, project_local_stack_qa_gotchas §2 헤더 계약과 일치) → 이 화면은 현재 메인에서도
 * 게이트웨이 경유 시 500 이 나는 상태(이 PR 이 만든 회귀 아님, 색상 diff 2곳 외 변경 없음).
 * QA 목적(SeverityBadge 색상 렌더 실증)을 달성하기 위해
 * project_local_stack_qa_gotchas §3 "헤드리스 브라우저 실 QA 브리지" 기법으로 우회: 로그인/부팅은
 * 실 게이트웨이 그대로, `/api/notifications/**` 만 notification-service 직접 포트(:8093)로
 * 프록시하며 게이트웨이가 하던 X-User-Id/X-User-Role 헤더 주입을 대행한다. 데이터는 실 DB
 * (notification_db, 실 API POST /internal/notifications 로 seed), 화면은 실 React 렌더 — 합성 없음.
 *
 * QA_PHASE=after(브랜치, neutral-600/warning-800/danger-700) /
 *          before(구 색상 neutral-400/warning-500/danger-500, 파일 임시 원복 후 실행) 로 2회 실행.
 */
import { expect, test, type Page, type BrowserContext } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5193'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const NOTIFICATION_DIRECT_BASE = process.env['NOTIFICATION_DIRECT_BASE'] ?? 'http://localhost:8093'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const PHASE = process.env['QA_PHASE'] ?? 'after'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/severity-badge-aa'))
fs.mkdirSync(SHOTS, { recursive: true })

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${PHASE}-${name}.png`), fullPage: false })
}

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
  isSystemMaster: boolean
}

/** JWT payload 를 디코드해 게이트웨이가 파싱하는 claim(isSystemMaster 등)을 그대로 읽는다. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? ''
  const json = Buffer.from(part, 'base64').toString('utf-8')
  return JSON.parse(json) as Record<string, unknown>
}

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  const token = d.token ?? ''
  const claims = token ? decodeJwtPayload(token) : {}
  return {
    token,
    role: d.role ?? '',
    userId: d.userId ?? '',
    displayName: d.displayName ?? loginId,
    isSystemMaster: claims['isSystemMaster'] === true,
  }
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

/**
 * 🪤 게이트웨이 X-User-Role 계약 갭 우회 — /api/notifications/** 만 notification-service
 * 직접 포트로 프록시하며 게이트웨이가 하던 identity 헤더 주입(X-User-Id/X-User-Role)을 대행.
 * StripPrefix=1 을 그대로 재현: /api/notifications/history → /notifications/history.
 */
async function installNotificationDirectProxy(context: BrowserContext, login: LoginResult): Promise<void> {
  await context.route('**/api/notifications/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const targetPath = url.pathname.replace(/^\/api\/notifications/, '/notifications') + url.search
    const targetUrl = `${NOTIFICATION_DIRECT_BASE}${targetPath}`
    try {
      const resp = await fetch(targetUrl, {
        method: req.method(),
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': login.userId,
          'X-User-Role': login.role,
          'X-Is-System-Master': String(login.isSystemMaster),
        },
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : (req.postData() ?? undefined),
      })
      const body = await resp.text()
      await route.fulfill({
        status: resp.status,
        contentType: resp.headers.get('content-type') ?? 'application/json',
        body,
      })
    } catch {
      await route.abort()
    }
  })
}

test('SeverityBadge AA — 알림 내역 INFO/WARNING/CRITICAL 3종 실 GUI 캡처', async ({ page, context }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await installNotificationDirectProxy(context, login)

  await page.goto(`${BASE_URL}/#/notifications`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-testid="notification-history-table"] tbody tr', { timeout: 15000 })
  await page.waitForTimeout(800)

  // 전체 화면 — 상단 최신순 행에 INFO/CRITICAL/WARNING 3종이 섞여 보여야 함
  // (INFO/CRITICAL 은 이 QA 세션이 방금 실 API 로 seed, WARNING 은 inventory-service 실 스케줄러가 지속 발행).
  await capture(page, 'notification-history')

  const severityCells = page.locator('[data-testid="notification-history-table"] td[data-label="심각도"]')
  const cellCount = await severityCells.count()
  expect(cellCount, '심각도 컬럼 셀이 렌더되어야 함').toBeGreaterThan(0)

  // 상위 N개 뱃지 중 3종(INFO/WARNING/CRITICAL) 각 최초 등장 위치를 모아 union clip 캡처.
  const seenLabels = new Set<string>()
  const boxes: { x: number; y: number; width: number; height: number }[] = []
  const scanLimit = Math.min(cellCount, 30)
  for (let i = 0; i < scanLimit && seenLabels.size < 3; i++) {
    const cell = severityCells.nth(i)
    const label = (await cell.innerText()).trim()
    if (seenLabels.has(label)) continue
    const box = await cell.boundingBox()
    if (!box) continue
    seenLabels.add(label)
    boxes.push(box)
  }
  expect([...seenLabels].sort(), '정보/경고/긴급 3종 라벨이 화면에 모두 보여야 함').toEqual(['경고', '긴급', '정보'])

  const minX = Math.min(...boxes.map((b) => b.x)) - 12
  const minY = Math.min(...boxes.map((b) => b.y)) - 12
  const maxX = Math.max(...boxes.map((b) => b.x + b.width)) + 12
  const maxY = Math.max(...boxes.map((b) => b.y + b.height)) + 12
  await page.screenshot({
    path: path.join(SHOTS, `${PHASE}-badges-closeup.png`),
    clip: { x: Math.max(0, minX), y: Math.max(0, minY), width: maxX - minX, height: maxY - minY },
  })
})
