import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #784 — warning 색 토큰 AA sweep — arologis-desktop 실서버 GUI QA.
 *
 * 실 arologis-service(:8097) 연결. 렌더러(:5291)는 vite proxy 로 `/api/arologis/**`→`/admin/arologis/**`
 * rewrite(프로덕션 리버스프록시 재현) → 실 dispatch 상세 데이터 수신(합성 아님).
 *
 * 대상: DispatchDetailPage(warning-700→800: NotifyStatusChip DELAYED L220·"응답 대기 중" L354·SandboxBanner L388)
 *       + InsungLbsPanel(GPS stale L239 -500→800·L265 -700→800).
 * QA_PHASE=after/before 로 2회.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8097'
const DISPATCH_ID = process.env['DISPATCH_ID'] ?? '49b3749d-a4c1-4a4f-890d-30af30330975'
const PHASE = process.env['QA_PHASE'] ?? 'after'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/warning-token-aa-e784'))
fs.mkdirSync(SHOTS, { recursive: true })

function b64urlDecode(seg: string): string {
  const pad = seg.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(pad, 'base64').toString('utf-8')
}

test('arologis warning AA — DispatchDetail 실 GUI 캡처', async ({ page }) => {
  // 실 로그인 (arologis admin)
  const res = await page.request.post(`${API_BASE}/auth/admin/login`, {
    data: { loginId: 'admin', password: resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD') },
  })
  expect(res.ok(), `arologis 로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = await res.json()
  const sub = JSON.parse(b64urlDecode(String(d.accessToken).split('.')[1] ?? '')).sub ?? ''
  const snapshot = {
    accessToken: d.accessToken,
    refreshToken: d.refreshToken ?? '',
    userId: sub,
    role: d.role ?? 'AROLOGIS_MASTER',
    loginId: d.loginId ?? 'admin',
    fullName: '아로로지스 관리자',
    expiresAt: d.expiresAt ?? '',
  }

  await page.addInitScript((snap) => {
    Object.defineProperty(window, 'arologisAuth', {
      configurable: true,
      value: {
        getToken: async () => snap,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, snapshot)

  await page.goto(`${BASE_URL}/#/dispatches/detail/${DISPATCH_ID}`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3500)
  await page.screenshot({ path: path.join(SHOTS, `${PHASE}-D-arologis-dispatch-detail.png`), fullPage: true })

  // InsungLbsPanel 영역이 있으면 스크롤해 별도 캡처
  const insung = page.getByText('인성', { exact: false }).first()
  if (await insung.count()) {
    await insung.scrollIntoViewIfNeeded().catch(() => undefined)
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(SHOTS, `${PHASE}-E-arologis-insung-lbs.png`), fullPage: false })
  }
})
