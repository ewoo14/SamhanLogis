import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * E3 S2 — 입금보고서 확정/수정/취소가 만든 실 원장 분개를 회계전표 GUI 로 실증 (mock OFF).
 *
 * 실 게이트웨이(:8080) → 재빌드 accounting-service(V50/V51) → 실 Postgres.
 * 선행 시나리오(라이브 API QA 로 생성된 실데이터, 합성/fixture 없음):
 *   입금보고서 2026/07/03-1 생성(102/110) → 확정(분개 2026/07/03-1 POSTED)
 *   → CONFIRMED 수정(180,000·차변 101 override → 원분개 REVERSED + 역분개 -2 + 재게시 -3)
 *   → 취소(-3 REVERSED + 역분개 -4).
 *
 * 분개 UUID 는 화면 비노출(라우팅 전용)이라 목록 API(status=REVERSED)로 스펙이 직접 resolve 한다.
 * 분개장 목록은 page=0 고정(최신 미노출 — 기존 FE 한계)이므로 역분개 필터로 오늘 분개를 노출한다.
 *
 * 단계별 캡처(docs/qa/e3-s2-cash-receipt-journal/):
 *  01 분개장 목록 '역분개' 필터 — 오늘 REVERSED 2건(원분개·재게시분) 취소선 배지 클로즈업
 *  02 재게시 분개(-3) 상세 — 차변 101 현금 180,000 / 대변 110 외상매출금 180,000
 *  03 취소 역분개(-4) 상세 — [역분개] 적요 + 차/대 swap
 *  04 원분개(-1) 상세 — REVERSED 상태·102/110 150,000 (원장 불변: 수정 없이 상태만)
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
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e3-s2-cash-receipt-journal'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

/** 변화 지점 클로즈업 — 풀페이지 반복 캡처 금지(개발책임자 2026-07-02 지적). */
async function captureElement(
  page: Page,
  locator: ReturnType<Page['locator']>,
  name: string,
): Promise<void> {
  shotNo++
  await locator.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`) })
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

interface JournalRow { id: string; journalNo: string; reversedJournalId: string | null }

/** 역분개 목록 API 로 오늘 분개 체인의 UUID(화면 비노출·라우팅 전용)를 resolve 한다. */
async function resolveTodayChain(page: Page, token: string): Promise<{ original: JournalRow; repost: JournalRow }> {
  const res = await page.request.get(`${API_BASE}/accounting/journals?status=REVERSED&page=0&size=50`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `REVERSED 분개 목록 조회 실패: HTTP ${res.status()}`).toBeTruthy()
  const rows: JournalRow[] = ((await res.json()).data?.content ?? []) as JournalRow[]
  const original = rows.find((r) => r.journalNo === '2026/07/03-1')
  const repost = rows.find((r) => r.journalNo === '2026/07/03-3')
  expect(original, '원분개 2026/07/03-1 (REVERSED) 미존재 — 선행 라이브 API 시나리오 필요').toBeTruthy()
  expect(repost, '재게시 분개 2026/07/03-3 (REVERSED) 미존재 — 선행 라이브 API 시나리오 필요').toBeTruthy()
  return { original: original!, repost: repost! }
}

test('입금보고서 분개 라이프사이클 — 확정 POSTED·수정 역분개+재게시·취소 역분개 GUI 실증', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  const chain = await resolveTodayChain(page, login.token)

  // 1) 분개장 목록 — '역분개' 필터로 오늘 REVERSED 2건(원분개 -1·재게시분 -3) 노출
  await page.goto(`${BASE_URL}/#/accounting/journals`)
  await expect(page.locator('h3', { hasText: '분개장' })).toBeVisible({ timeout: 30_000 })
  await page.locator('select').first().selectOption('REVERSED')
  await expect(page.getByText('2026/07/03-1', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('2026/07/03-3', { exact: true })).toBeVisible()
  await captureElement(page, page.locator('table').first(), 'journal-list-reversed-filter-today')

  // 2) 재게시 분개(-3) 상세 — CONFIRMED 수정 결과: 차변 101 180,000 / 대변 110 180,000
  await page.goto(`${BASE_URL}/#/accounting/journals/${chain.repost.id}`)
  await expect(page.getByText('2026/07/03-3').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('101', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/180,000/).first()).toBeVisible()
  await capture(page, 'journal-detail-repost-101-180000')

  // 3) 취소 역분개(-4) 상세 — [역분개] 적요 + 차/대 swap (UUID 는 -3 의 reversedJournalId)
  expect(chain.repost.reversedJournalId, '재게시 분개의 역분개 링크 부재').toBeTruthy()
  await page.goto(`${BASE_URL}/#/accounting/journals/${chain.repost.reversedJournalId}`)
  await expect(page.getByText('2026/07/03-4').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/\[역분개\]/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '입금보고서에서 처리' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '역분개' })).toHaveCount(0)
  await capture(page, 'journal-detail-cancel-reversal')

  // 4) 원분개(-1) 상세 — REVERSED 상태 + 102/110 150,000 (원장 불변 실증)
  await page.goto(`${BASE_URL}/#/accounting/journals/${chain.original.id}`)
  await expect(page.getByText('2026/07/03-1').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('102', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/150,000/).first()).toBeVisible()
  await capture(page, 'journal-detail-original-reversed')
})
