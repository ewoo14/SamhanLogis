import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #803(#785) — arologis-desktop DispatchDetailPage 렌더 크래시 fix 라이브 QA.
 *
 * 실 arologis-service(:8097) 연결. 렌더러(:5291)는 vite proxy 로 `/api/arologis/**`→`/admin/arologis/**`
 * rewrite(프로덕션 리버스프록시 재현) → 실 dispatch 상세 데이터 수신(합성 아님).
 *
 * ⚠️ FE-BE DTO 불일치(#804·별건): 실서버 응답 vehicle 필드 =
 * sequence,tonnage,label,assignedDriverCode,matchSource,externalRefId,status,stops.
 * FE 가 기대하는 matchStatus/notifyResults/gpsSources 는 응답에 없음(undefined).
 * fix 전이라면 undefined 필드 접근에서 크래시 — fix 후에는 크래시 없이 degrade 렌더
 * (배지 "상태 확인 필요", 알림/GPS 섹션 생략) 되어야 한다. 이 스펙은 그 degrade 렌더를 캡처한다.
 */
import { expect, test } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8097'
const DISPATCH_ID = process.env['DISPATCH_ID'] ?? '6fca3392-f1c3-42ad-9d52-6597e6b87e01'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/pr-803'))
fs.mkdirSync(SHOTS, { recursive: true })

function b64urlDecode(seg: string): string {
  const pad = seg.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(pad, 'base64').toString('utf-8')
}

test('PR #803 — DispatchDetailPage 크래시 없이 degrade 렌더 실 GUI 캡처', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))

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

  // 에러바운더리 "Unexpected Application Error" 부재 확인
  const errorBoundaryText = page.getByText('Unexpected Application Error', { exact: false })
  await expect(errorBoundaryText).toHaveCount(0)

  // 배차 상세 페이지 정상 렌더 확인
  await expect(page.getByTestId('dispatch-detail-page')).toBeVisible()
  await expect(page.getByTestId('vehicle-row-1')).toBeVisible()
  await expect(page.getByTestId('vehicle-row-2')).toBeVisible()

  await page.screenshot({
    path: path.join(SHOTS, 'dispatch-detail-no-crash.png'),
    fullPage: true,
  })

  console.log('[QA] pageerror count:', errors.length, errors)
})
