import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #463 완료배차 내역 뷰 — 실서버(mock OFF) QA 캡처.
 *
 * 실 게이트웨이(:8080) + 실 DISPATCHED 데이터(dispatch flow + arologis confirm 시뮬로 생성)로
 * 완료배차 목록/상세가 실 화면에 렌더됨을 실증. mock 없음(no-fake-data). FE real-mode dev :5178.
 *
 * 산출: docs/qa/dispatch-completed-history/history-list.png, history-detail.png
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5178'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dispatch-completed-history'))
const TASK_CODE_PATTERN = /\b\d{4}\/\d{2}\/\d{2}-\d+\b/
const SLIP_NO_PATTERN = /\b\d{4}\/\d{2}\/\d{2}-\d+\b/g
const DRIVER_PATTERN = /기사\s+[^\s(]+(?:\s+[^\s(]+)*\s+\([A-Za-z0-9_-]+\)/
const PLATE_PATTERN = /차량번호\s+(?:-|[0-9]{2,3}[가-힣]\s?\d{4}|[A-Za-z0-9가-힣 -]{4,})/
fs.mkdirSync(SHOTS, { recursive: true })

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
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

test('완료배차 내역 목록 + 상세 실 게이트웨이 캡처 (dev_master)', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/dispatch-board/history`)
  await page.waitForSelector('[data-testid="dispatch-history-table"]', { timeout: 30000 })
  // 실 서버 데이터 포함을 위해 날짜 범위를 명시한다(브라우저 today 기준 기본 30일 범위 무관).
  await page.getByTestId('dispatch-history-from').fill('2025-01-01')
  await page.getByTestId('dispatch-history-to').fill('2026-12-31')
  await page.getByTestId('dispatch-history-filter-submit').click()
  // 실 DISPATCHED 행 출현 대기.
  await page.waitForSelector('[data-testid^="dispatch-history-row-"]', { timeout: 15000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: path.join(SHOTS, 'history-list.png'), fullPage: true })

  // 행 클릭 → 상세(차량그룹·전표·기사). arologisDispatchId drill-in.
  const selectedRow = page.locator('[data-testid^="dispatch-history-row-"]').first()
  const selectedRowText = await selectedRow.textContent()
  const selectedTaskCode = selectedRowText?.match(TASK_CODE_PATTERN)?.[0]
  expect(selectedTaskCode, `선택 행 taskCode 패턴: ${selectedRowText ?? ''}`).toBeTruthy()
  await selectedRow.click()
  await page.waitForTimeout(2000)
  await expect(page.getByTestId('dispatch-task-detail-body')).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: path.join(SHOTS, 'history-detail.png'), fullPage: true })

  // 조회 전용 — 변경(수정/취소 요청) 버튼 부재 단언(read-only 실증).
  const mutationBtns = await page.getByRole('button', { name: /수정 요청|취소 요청|배차 완료|재배차/ }).count()
  expect(mutationBtns, '완료배차 상세는 조회 전용(변경 버튼 0)').toBe(0)
  const detailText = await page.getByTestId('dispatch-task-detail-body').textContent()
  expect(detailText ?? '', '상세가 선택 taskCode 를 포함해야 함').toContain(selectedTaskCode)
  const slipMatches = detailText?.match(SLIP_NO_PATTERN) ?? []
  expect(slipMatches.length, `상세 전표번호(slipNo) 패턴 필요: ${detailText ?? ''}`).toBeGreaterThanOrEqual(2)
  expect(detailText ?? '', '상세 기사명/기사코드 패턴 필요').toMatch(DRIVER_PATTERN)
  expect(detailText ?? '', '상세 차량번호는 없으면 "-", 있으면 plate 형태').toMatch(PLATE_PATTERN)
  expect(detailText ?? '', '상세 본문 raw UUID 노출 금지').not.toMatch(
    /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i,
  )
  expect(pageErrors, `pageerror: ${pageErrors.join('; ')}`).toHaveLength(0)
})
