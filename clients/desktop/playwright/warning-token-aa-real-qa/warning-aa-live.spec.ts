import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #784 — warning 색 토큰 AA 회귀 sweep — 실서버 GUI QA (mock OFF).
 *
 * 텍스트로 쓰인 --color-warning-700/-600/-500(저대비 CR 3.66/1.94)을 --color-warning-800(#8C5C13, CR 5.35~5.74)로
 * 교체한 결과를 실 게이트웨이(:8080) 연결 렌더러(:5191)에서 실 GUI 캡처한다. 합성/fixture 없음.
 *
 * QA_PHASE=after(브랜치, 진한 -800) / before(main, 밝은 저대비) 로 2회 실행해 대조.
 * 대표 3화면(QA 도달성 표): A=Aligo 배너(무조건 렌더)·B=권한매트릭스 헤더(MASTER)·C=입고검수 다이얼로그(인터랙티브).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5191'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const PHASE = process.env['QA_PHASE'] ?? 'after'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/warning-token-aa-e784'))
fs.mkdirSync(SHOTS, { recursive: true })

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${PHASE}-${name}.png`), fullPage: false })
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

test('warning AA — 대표 화면 실 GUI 캡처', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // A) Aligo 주소록 — "mock dryRun 모드" 안내 배너 (무조건 렌더·warning-700→800 텍스트)
  await page.goto(`${BASE_URL}/#/admin/aligo-address-book`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2500)
  await capture(page, 'A-aligo-addressbook')

  // B) 권한 매트릭스 — "생성"/"수정" 열헤더 버튼 텍스트 (headerColor warning-700→800)
  await page.goto(`${BASE_URL}/#/admin/permission-matrix`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2800)
  await capture(page, 'B-permission-matrix')

  // C) 입고검수 다이얼로그 — DiffBadge(inspected>expected → ▲ 126 warning-800)
  //    + 정상수량(normalQty=inspected-defect < expected → 433, 구 -600 미정의 no-op 결함 복구)
  await page.goto(`${BASE_URL}/#/warehouse/inbound-inspections`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2500)
  await capture(page, 'C1-inbound-inspection-list')
  // PENDING 검수 진입 → 다이얼로그 ("검수" 버튼 또는 행 클릭)
  const inspectBtn = page.getByRole('button', { name: '검수', exact: true }).first()
  if (await inspectBtn.count()) {
    await inspectBtn.click({ timeout: 8000 })
  } else {
    await page.locator('[data-testid="inbound-inspection-list-table"]').getByText('거래처-P-2026-0040').first().click({ timeout: 8000 })
  }
  await page.waitForSelector('[data-testid$="-inspected-qty"]', { timeout: 12000 })
  await page.waitForTimeout(500)
  // 라인1 검수수량=99(예정 초과 → DiffBadge ▲ 126 warning-800). 나머지 라인은 검수 미입력 →
  // 정상수량 0 < 예정 → 433 warning-800(구 -600 no-op 결함 복구) 동시 시연.
  const inspected = page.locator('[data-testid$="-inspected-qty"]').first()
  await inspected.fill('99')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(700)
  await capture(page, 'C2-inbound-inspection-dialog-warnings')
})
