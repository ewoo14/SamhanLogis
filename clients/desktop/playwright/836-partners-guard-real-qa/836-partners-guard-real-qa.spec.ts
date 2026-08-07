import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #836 — PartnersPage ACCOUNTANT 4탭 가드 OPUS R1 라이브 QA.
 *
 * 실 게이트웨이(:8080, VITE_MOCK_MODE OFF) → 실 auth_db 권한. 렌더러 :5216 선기동.
 * dev_accountant(ACCOUNTANT·partners.4tab 부재)·dev_sales(SALES·partners.4tab 보유) 실 로그인.
 *
 * 검증:
 *  - ACCOUNTANT: /admin/partners 목록 열람 O·[신규 등록] 버튼 부재·행클릭 상세 다이얼로그 미개봉.
 *  - SALES: 버튼 노출·행클릭 다이얼로그 개봉(기존 동작 유지).
 *
 * 단계별 캡처: docs/qa/836-partners-guard/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5216'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/836-partners-guard'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

interface NetworkObservation {
  method: string
  status: number
  url: string
}

function observeNetwork(page: Page): NetworkObservation[] {
  const observations: NetworkObservation[] = []
  page.on('response', (response) => {
    const request = response.request()
    observations.push({
      method: request.method(),
      status: response.status(),
      url: response.url(),
    })
  })
  return observations
}

function isPartnerListRequest(observation: NetworkObservation): boolean {
  return observation.method === 'GET' && observation.url.includes('/admin/partners/search')
}

function isPartnerFullRequest(observation: NetworkObservation): boolean {
  return observation.method === 'GET' && /\/partners\/[^/]+\/full(?:\?|$)/.test(observation.url)
}

function isPartnerRevisionRequest(observation: NetworkObservation): boolean {
  return observation.method === 'GET' && /\/partners\/[^/]+\/revisions(?:\?|$)/.test(observation.url)
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

async function gotoPartners(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/admin/partners`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('admin-partners-table'), '거래처 목록 테이블 미렌더').toBeVisible({ timeout: 30_000 })
}

test('#836 ACCOUNTANT 신규등록/행클릭 가드 — 실서버', async ({ page }) => {
  const network = observeNetwork(page)
  const login = await realLogin(page, 'dev_accountant')
  expect(login.role, 'dev_accountant 역할').toBe('ACCOUNTANT')
  await installAuthStub(page, login)

  await gotoPartners(page)
  const listResponse = network.find(isPartnerListRequest)
  expect(listResponse, 'ACCOUNTANT 목록 API 미관측').toBeDefined()
  expect(listResponse?.status, 'ACCOUNTANT 목록 API 상태').toBe(200)
  // 목록 자체는 열람 가능(partners.list view)
  const firstRow = page.getByTestId('admin-partners-table').locator('tbody tr').first()
  await expect(firstRow, '거래처 행 미렌더(목록 열람 실패)').toBeVisible({ timeout: 15_000 })
  await capture(page, 'accountant-partners-list')

  // [신규 등록] 버튼 부재
  await expect(page.getByRole('button', { name: '신규 등록' }), 'ACCOUNTANT에 신규 등록 버튼 노출됨').toHaveCount(0)

  // 행클릭 → 상세 다이얼로그 미개봉
  await firstRow.click()
  await page.waitForTimeout(600)
  expect(network.filter(isPartnerFullRequest), 'ACCOUNTANT 행클릭에서 full API가 호출됨').toHaveLength(0)
  await expect(page.getByRole('dialog', { name: /거래처 상세/ }), 'ACCOUNTANT 행클릭에 상세 다이얼로그 개봉됨').toHaveCount(0)
  await capture(page, 'accountant-rowclick-no-dialog')
})

test('#836 SALES 신규등록/행클릭 정상 — 실서버(무회귀)', async ({ page }) => {
  const network = observeNetwork(page)
  const login = await realLogin(page, 'dev_sales')
  expect(login.role, 'dev_sales 역할').toBe('SALES')
  await installAuthStub(page, login)

  await gotoPartners(page)
  const listResponse = network.find(isPartnerListRequest)
  expect(listResponse, 'SALES 목록 API 미관측').toBeDefined()
  expect(listResponse?.status, 'SALES 목록 API 상태').toBe(200)
  const firstRow = page.getByTestId('admin-partners-table').locator('tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 15_000 })

  // [신규 등록] 버튼 노출
  await expect(page.getByRole('button', { name: '신규 등록' }), 'SALES에 신규 등록 버튼 미노출').toBeVisible()
  await capture(page, 'sales-partners-list-with-create-btn')

  // 행클릭 → 상세 다이얼로그 개봉
  await firstRow.click()
  await expect(page.getByRole('dialog', { name: /거래처 상세/ }), 'SALES 행클릭에 상세 다이얼로그 미개봉').toBeVisible({ timeout: 15_000 })
  await expect.poll(() => network.filter(isPartnerFullRequest).length, 'SALES full API 미관측').toBe(1)
  const fullResponse = network.find(isPartnerFullRequest)
  expect(fullResponse?.status, 'SALES full API 상태').toBe(200)
  await page.waitForTimeout(500)
  expect(network.filter(isPartnerRevisionRequest), 'SALES 상세 진입에서 버전이력 API가 호출됨').toHaveLength(0)
  await capture(page, 'sales-rowclick-dialog-open')
})
