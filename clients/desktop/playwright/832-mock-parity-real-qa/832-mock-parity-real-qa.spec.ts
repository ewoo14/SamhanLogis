/**
 * #832 — 감사이력 정밀도(D-832-03) OPUS R1 라이브 QA.
 *
 * 실 게이트웨이(:8080·mock OFF)·실 accounting_db. 렌더러 :5216. dev_master 로그인.
 * 다세대 매핑 `QA-R1-매핑검증`(#810 잔여 QA 아티팩트·3세대·읽기전용) 이력 검증:
 *  - history API 응답에 operationOrdinal·generation 존재·operationOrdinal 유일/연속·UUID 미노출.
 *  - UI 이력 모달이 "작업 N"/세대 표기(구 revisionNo #1 중복 해소).
 *
 * 단계별 캡처: docs/qa/832-audit-precision/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5216'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/832-audit-precision')
fs.mkdirSync(SHOTS, { recursive: true })

const NORMALIZED = 'QA-R1-매핑검증'

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

test('#832 D-03 감사이력 작업 ordinal/세대 — 실서버', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  const H = { Authorization: `Bearer ${login.token}` }

  // ── API: history 응답 operationOrdinal/generation·UUID 부재 ──
  const histRes = await page.request.get(
    `${API_BASE}/accounting/deposit-mappings/history?normalizedName=${encodeURIComponent(NORMALIZED)}`,
    { headers: H },
  )
  expect(histRes.ok(), `history 조회 실패: ${histRes.status()}`).toBeTruthy()
  const rows: Array<Record<string, unknown>> = (await histRes.json()).data ?? []
  expect(rows.length, '이력 행 없음').toBeGreaterThan(0)
  const flat = JSON.stringify(rows)
  console.log('[#832] history rows=', rows.length, ' 발췌=', flat.slice(0, 800))

  // operationOrdinal·generation 필드 존재
  expect(rows.every((r) => typeof r['operationOrdinal'] === 'number'), 'operationOrdinal 필드 부재').toBeTruthy()
  expect(rows.every((r) => typeof r['generation'] === 'number'), 'generation 필드 부재').toBeTruthy()
  // operationOrdinal 집합 = 1..N 연속·유일(작업 단위)
  const ordinals = Array.from(new Set(rows.map((r) => r['operationOrdinal'] as number))).sort((a, b) => a - b)
  expect(ordinals[0], 'operationOrdinal 1부터 아님').toBe(1)
  expect(ordinals[ordinals.length - 1], 'operationOrdinal 연속 아님').toBe(ordinals.length)
  // 다세대(generation ≥ 2) 확증
  const gens = Array.from(new Set(rows.map((r) => r['generation'] as number)))
  expect(Math.max(...gens), 'generation 다세대(≥2) 아님').toBeGreaterThanOrEqual(2)
  // UUID 미노출(응답 표시값에 partner/entity UUID 문자열 없음 — operationOrdinal/generation 는 정수)
  expect(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(flat), 'history 응답에 UUID 노출').toBeFalsy()
  console.log('[#832] ordinals=', ordinals, ' generations=', gens.sort())

  // ── UI: 이력 모달 "작업 N"/세대 표기 ──
  await page.goto(`${BASE_URL}/#/accounting/deposit-mappings`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '입금자명 매핑', exact: true }), '매핑 화면 미렌더').toBeVisible({ timeout: 30_000 })
  const row = page.getByTestId(`depositor-mapping-row-${NORMALIZED}`)
  await expect(row, 'QA 매핑 행 미노출').toBeVisible({ timeout: 15_000 })
  await row.getByRole('button', { name: '이력' }).click()
  await expect(page.getByRole('heading', { name: '입금자명 매핑 이력' }), '이력 모달 미개봉').toBeVisible({ timeout: 15_000 })
  // "작업" 표기 노출(구 revisionNo #1 중복 대신 작업 ordinal)
  await expect(page.getByText(/작업\s*\d+/).first(), '"작업 N" 표기 미노출').toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOTS, '01-history-operation-ordinal.png'), fullPage: false })
})
