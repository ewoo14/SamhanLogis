import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #825 슬2 — 거래처 입력 표준화 라이브 QA.
 * 실 게이트웨이 :8080(mock OFF)·실 거래처 검색·**dev_accountant(ACCOUNTANT)로 partners.search 실증**(V88 403→200).
 * (ii)통일 3화면 + (iii)DailyClosing autocomplete+④하이라이트, BlockedPartners(dev_master).
 * 캡처: docs/qa/825-s2-partner-standardize/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5223'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/825-s2-partner-standardize'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`), fullPage: false })
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

/** 자동완성 combobox 에 검색어 입력 → 후보(option) + <mark> 강조 대기 후 캡처. */
async function fillAndCapture(page: Page, testId: string, query: string, shotName: string): Promise<number> {
  const combo = page.getByTestId(testId).first()
  await expect(combo, `${testId} combobox 미표시`).toBeVisible({ timeout: 20_000 })
  await combo.click()
  await combo.fill(query)
  // 자동완성 전용 li[role=option] (네이티브 <select><option> 충돌 회피)
  await expect(page.locator('li[role="option"]').first(), `${testId} 후보 미표시(ACCOUNTANT partners.search 실패?)`).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(600)
  const markCount = await page.locator('mark').count()
  await capture(page, shotName)
  return markCount
}

test('#825 슬2 — ACCOUNTANT 회계 4화면 거래처 자동완성+하이라이트 실증(V88 partners.search 200)', async ({ page }) => {
  const login = await realLogin(page, 'dev_accountant')
  expect(login.role, 'dev_accountant 역할').toBe('ACCOUNTANT')
  await installAuthStub(page, login)

  const screens: { route: string; heading: string; testId: string; name: string }[] = [
    { route: '/accounting/reports/collection-plans', heading: '수금', testId: 'collection-plan-partner', name: 'collection-plan-highlight' },
    { route: '/accounting/reports/notes-receivable', heading: '어음', testId: 'notes-receivable-partner', name: 'notes-receivable-highlight' },
    { route: '/accounting/reports/journal-status', heading: '분개', testId: 'journal-status-partner-filter', name: 'journal-status-highlight' },
    { route: '/accounting/daily-closings', heading: '마감', testId: 'daily-closing-exec-partner', name: 'daily-closing-highlight' },
  ]

  let totalMarks = 0
  for (const s of screens) {
    await page.goto(`${BASE_URL}/#${s.route}`)
    await page.waitForTimeout(1500)
    const marks = await fillAndCapture(page, s.testId, '한', s.name)
    console.log(`[${s.name}] mark=${marks}`)
    totalMarks += marks
  }
  expect(totalMarks, '4화면 통틀어 매치 강조 <mark> 미렌더').toBeGreaterThan(0)
})

test('#825 슬2 — BlockedPartners(발송금지) 거래처 자동완성 전환(dev_master)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/admin/blocked-partners`)
  await page.waitForTimeout(1500)
  await capture(page, 'blocked-partners-page')
  // 단건 등록 다이얼로그 열기(버튼 텍스트 유연 매칭)
  const addBtn = page.getByRole('button', { name: /단건|등록|추가/ }).first()
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click()
    await page.waitForTimeout(800)
    const combo = page.getByTestId('admin-blocked-add-partner-code-input').first()
    if (await combo.isVisible().catch(() => false)) {
      await combo.click()
      await combo.fill('한')
      await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(600)
      await capture(page, 'blocked-partners-autocomplete-highlight')
    } else {
      await capture(page, 'blocked-partners-dialog-open')
    }
  }
})
