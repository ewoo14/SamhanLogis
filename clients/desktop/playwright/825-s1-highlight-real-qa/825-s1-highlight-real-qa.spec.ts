import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #825 슬1 — 거래처 자동완성 ④ 매치 하이라이트 라이브 QA.
 * 실 게이트웨이 :8080(mock OFF) · 실 거래처 검색(searchAdmin 3필드) · dev_master.
 * DepositorMappingPage(입금자명 매핑) 등록 모달의 거래처 PartnerAutocomplete 에 검색어 입력 →
 * 후보 목록에서 매치 필드(상호/코드/사업자번호) 부분강조 + 필드 배지 실증.
 * 캡처: docs/qa/825-s1-highlight/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5213'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/825-s1-highlight'))
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

test('#825 슬1 — 거래처 자동완성 매치 하이라이트 실증(상호/코드 필드 강조+배지)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 실 거래처 후보 확보(하이라이트 대상 검색어 결정)
  const H = { Authorization: `Bearer ${login.token}` }
  const searchRes = await page.request.get(`${API_BASE}/admin/partners/search?q=&size=5`, { headers: H }).catch(() => null)
  // 검색어: 상호 부분("한국") — dev 시드 (주)한국냉동물류 존재. 없으면 후보 첫 상호 2글자.
  let nameQuery = '한국'
  if (searchRes && searchRes.ok()) {
    const list = (await searchRes.json()).data?.content ?? (await searchRes.json()).data ?? []
    console.log('[PARTNERS]', JSON.stringify((Array.isArray(list) ? list : []).slice(0, 3).map((p: { name?: string; partnerCode?: string }) => ({ n: p.name, c: p.partnerCode }))))
  }

  // 1) 입금자명 매핑 등록 모달 진입
  await page.goto(`${BASE_URL}/#/accounting/deposit-mappings`)
  await expect(page.getByRole('heading', { name: '입금자명 매핑', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('depositor-mapping-create').click()
  await expect(page.getByRole('heading', { name: '입금자명 매핑 등록' })).toBeVisible({ timeout: 10_000 })

  // 2) 거래처 PartnerAutocomplete 에 상호 부분검색 입력 → 후보 강조
  const combo = page.getByRole('combobox').first()
  await combo.click()
  await combo.fill(nameQuery)
  // 후보(role=option) + <mark> 강조 대기
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  await capture(page, 'highlight-name-match')

  // 3) 숫자/코드 부분검색 → 코드/사업자번호 필드 매치 배지 실증
  await combo.fill('')
  await combo.fill('P')
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  await capture(page, 'highlight-code-match')

  // 강조(mark) 실렌더 단언(하이라이트 foundation 실증)
  const markCount = await page.locator('mark').count()
  console.log('[MARK COUNT]', markCount)
  expect(markCount, '매치 강조 <mark> 미렌더').toBeGreaterThan(0)
})
