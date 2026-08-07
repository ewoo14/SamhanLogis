import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #832 — 감사이력 정밀도(D-832-03) + R1 이력표 UX 라이브 QA.
 *
 * 실 게이트웨이(:8080·mock OFF)·실 accounting_db. 렌더러 localhost:5219. dev_master 로그인.
 * 다세대 매핑 `QA-R1-매핑검증`(QA 세션에서 create→update→delete 2회 + 재생성으로 3세대 시드) 검증:
 *  - history API 응답 operationOrdinal 유일/연속(1..N)·generation ≥2·UUID 미노출.
 *  - UI 이력 모달(#832 R1 UX): xl 폭·"작업 N / N세대" 병합 컬럼·연속 필드행 그룹핑(작업 라벨 수 = 작업 수)·
 *    상단 범례. 구 revisionNo #1 중복 해소.
 *
 * 단계별 캡처: docs/qa/832-audit-precision/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5219'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/832-audit-precision', process.env['SHOTS_SUB'] ?? ''))
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

test('#832 D-03 감사이력 작업 ordinal/세대 + 이력표 UX — 실서버', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  const H = { Authorization: `Bearer ${login.token}` }

  // 이 QA 스택(auth 시드)의 권한 매트릭스는 page-code 'accounting.deposit-match'(구명)만 보유하고
  // FE 가드가 쓰는 'accounting.deposit-mapping'(#810 신명)이 없어 매핑 화면 접근이 막힌다(#832 무관·
  // 환경/네이밍 관찰). D-03 이력표 '표시' QA 를 위해 GET /auth/admin/permissions/my 응답에 해당
  // page-code 를 주입한다(권한 enforcement 검증이 아님 — 실 데이터·실 렌더는 그대로 검증).
  await page.route('**/auth/admin/permissions/my', async (route) => {
    const resp = await route.fetch()
    const json = await resp.json()
    const acts = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'DOWNLOAD', 'PRINT']
    if (json && json.data && typeof json.data === 'object') {
      json.data['accounting.deposit-mapping'] = acts
      if (!json.data['accounting.bank-matching']) json.data['accounting.bank-matching'] = acts
    }
    await route.fulfill({ response: resp, json })
  })

  // ── API: history 응답 operationOrdinal/generation·UUID 부재 ──
  const histRes = await page.request.get(
    `${API_BASE}/accounting/deposit-mappings/history?normalizedName=${encodeURIComponent(NORMALIZED)}`,
    { headers: H },
  )
  expect(histRes.ok(), `history 조회 실패: ${histRes.status()}`).toBeTruthy()
  const rows: Array<Record<string, unknown>> = (await histRes.json()).data ?? []
  expect(rows.length, '이력 행 없음').toBeGreaterThan(0)
  const flat = JSON.stringify(rows)
  console.log('[#832] history rows=', rows.length, ' 발췌=', flat.slice(0, 600))

  expect(rows.every((r) => typeof r['operationOrdinal'] === 'number'), 'operationOrdinal 필드 부재').toBeTruthy()
  expect(rows.every((r) => typeof r['generation'] === 'number'), 'generation 필드 부재').toBeTruthy()
  const ordinals = Array.from(new Set(rows.map((r) => r['operationOrdinal'] as number))).sort((a, b) => a - b)
  expect(ordinals[0], 'operationOrdinal 1부터 아님').toBe(1)
  expect(ordinals[ordinals.length - 1], 'operationOrdinal 연속 아님').toBe(ordinals.length)
  const gens = Array.from(new Set(rows.map((r) => r['generation'] as number)))
  expect(Math.max(...gens), 'generation 다세대(≥2) 아님').toBeGreaterThanOrEqual(2)
  // 같은 작업(operationOrdinal)의 전 필드행은 같은 generation 공유(행단위 유일 금지)
  const genByOrd = new Map<number, number>()
  for (const r of rows) {
    const o = r['operationOrdinal'] as number, g = r['generation'] as number
    if (genByOrd.has(o)) expect(genByOrd.get(o), `작업 ${o} 세대 불일치`).toBe(g)
    else genByOrd.set(o, g)
  }
  expect(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(flat), 'history 응답에 UUID 노출').toBeFalsy()
  console.log('[#832] ordinals=', ordinals, ' generations=', gens.sort(), ' 작업수=', ordinals.length)

  // ── UI 01: 매핑 목록 ──
  // 웹 렌더러는 createBrowserRouter — cold 딥링크는 권한 로드 전 PermissionGuard 가 '/'로
  // 리다이렉트한다. root 로드(권한 로드)→사이드바 '회계' 펼침→링크 클릭(client-side)으로 이동.
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Samhan Public').first(), '앱 미로드').toBeVisible({ timeout: 30_000 })
  const depositLink = page.getByTestId('sidebar-accounting-deposit-mapping')
  if (!(await depositLink.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /회계/ }).first().click()
  }
  await expect(depositLink, '입금자명 매핑 메뉴 미노출(권한/로드)').toBeVisible({ timeout: 15_000 })
  await depositLink.click()
  await expect(page.getByRole('heading', { name: '입금자명 매핑', exact: true }), '매핑 화면 미렌더').toBeVisible({ timeout: 20_000 })
  const row = page.getByTestId(`depositor-mapping-row-${NORMALIZED}`)
  await expect(row, 'QA 매핑 행 미노출').toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS, '01-mapping-list.png'), fullPage: false })

  // ── UI 02: 이력 모달 "작업 N / N세대" + 범례 + 그룹핑 ──
  await row.getByRole('button', { name: '이력' }).click()
  await expect(page.getByRole('heading', { name: '입금자명 매핑 이력' }), '이력 모달 미개봉').toBeVisible({ timeout: 15_000 })
  // UX3 범례
  await expect(page.getByText(/삭제 후 재생성/), '범례 미노출').toBeVisible({ timeout: 10_000 })
  // 최신 작업(3세대 재생성 = 작업 7) 표기
  await expect(page.getByText('작업 7', { exact: true }).first(), '"작업 7" 미노출').toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('3세대', { exact: true }).first(), '"3세대" 미노출').toBeVisible()
  // UX2 그룹핑: 작업 라벨(operationOrdinal span) 수 == 작업 수(7). 그룹핑 없으면 전체 행수(22).
  const opLabelCount = await page.locator('.depositor-history-op-ordinal').count()
  expect(opLabelCount, `작업 라벨 수(그룹핑) — 전체 행 아님`).toBe(ordinals.length)
  // 3세대 전부(1·2·3세대) 표기
  for (const g of [1, 2, 3]) {
    await expect(page.getByText(`${g}세대`, { exact: true }).first(), `${g}세대 미노출`).toBeVisible()
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(SHOTS, '02-history-operation-ordinal.png'), fullPage: false })

  // ── UI 03: 모달 전체(최초 작업 1까지 스크롤) ──
  const op1 = page.getByText('작업 1', { exact: true }).first()
  await op1.scrollIntoViewIfNeeded()
  await expect(op1, '"작업 1"(최초 작업) 미노출').toBeVisible({ timeout: 8_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS, '03-history-full-generations.png'), fullPage: true })
})
