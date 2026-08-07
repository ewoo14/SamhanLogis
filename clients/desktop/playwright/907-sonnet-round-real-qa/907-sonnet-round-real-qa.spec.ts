import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #907 OPUS 재수렴 라운드 fix — Excel export 화면 필터 파리티 라이브 QA.
 *
 * 발견 1: 화면 검색/필터가 export 파라미터에서 전량 누락 → 화면과 파일의 건수가 달랐다.
 *   - 판매관리(SalesQueryPage) 검색모달 → export 미반영
 *   - 분개장(JournalListPage) 당월 하드코딩 → 화면(전체)과 불일치
 *   - 판매전표목록(SlipListPage) 당월 하드코딩 + deliveryTag 미반영
 * 발견 2: 재고현황(TransferListPage) export 에 품목 식별자 없음(창고코드/명만).
 *
 * 실 게이트웨이(:8080, mock OFF) → 재빌드 slip-service/accounting-service/inventory-service.
 * 다운로드된 xlsx 는 이 스펙이 저장만 하고, 행수/컬럼 검증은 스펙 밖에서
 * (scratchpad count_xlsx_rows.py) 별도 확인한다 — 스크린샷은 화면 총건수를 증거로 남긴다.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5190'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/907-sonnet-round-2026-07-24'))
const DOWNLOADS = path.join(SHOTS, 'downloads')
fs.mkdirSync(SHOTS, { recursive: true })
fs.mkdirSync(DOWNLOADS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`), fullPage: false })
}

interface AuthGroupItem { id: string; name: string; builtin: boolean }
interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
  groups: AuthGroupItem[]
}

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  // canQuerySales 등 V43 role-group UUID 기반 가드는 role 문자열이 아니라 groups 배열을 본다
  // (session.ts BUILTIN_ROLE_GROUP_IDS) — 이 필드를 빠뜨리면 SalesQueryPage 진입 시
  // "매출 전표 조회 권한이 없습니다" 로 막힌다.
  return {
    token: d.token ?? '',
    role: d.role ?? '',
    userId: d.userId ?? '',
    displayName: d.displayName ?? loginId,
    groups: d.groups ?? [],
  }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name, groups }: { tok: string; r: string; uid: string; name: string; groups: AuthGroupItem[] }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null, groups }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName, groups: login.groups },
  )
}

test('발견1 — 판매관리 검색모달(전표번호) 적용 후 화면 1건, Excel 다운로드도 동일 필터', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/sales`)
  await expect(page.getByTestId('sales-query-search-btn')).toBeVisible({ timeout: 30_000 })
  await capture(page, 'sales-before-search')

  await page.getByTestId('sales-query-search-btn').click()
  await page.getByTestId('sales-query-search-slipno').fill('2026/07/18-4')
  await page.getByTestId('sales-query-search-apply').click()
  await expect(page.getByText('총 1건')).toBeVisible({ timeout: 15_000 })
  await capture(page, 'sales-after-search-1건')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('sales-query-excel-download').click()
  const download = await downloadPromise
  await download.saveAs(path.join(DOWNLOADS, 'sales-searchSlipNo.xlsx'))
  await capture(page, 'sales-after-download')
})

test('계열 sweep — 구매관리 검색모달(전표번호) 적용 후 화면 1건 (SalesQueryPage 와 동일 패턴 fix)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/purchases`)
  await expect(page.getByTestId('purchase-query-search-btn')).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('purchase-query-search-btn').click()
  await page.getByTestId('purchase-query-search-slipno').fill('2026/07/17-8')
  await page.getByTestId('purchase-query-search-apply').click()
  await expect(page.getByText('총 1건')).toBeVisible({ timeout: 15_000 })
  await capture(page, 'purchase-after-search-1건')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('purchase-query-excel-download').click()
  const download = await downloadPromise
  await download.saveAs(path.join(DOWNLOADS, 'purchase-searchSlipNo.xlsx'))
})

test('발견1 — 분개장은 기간 UI 가 없어 화면 전체가 곧 export 범위, deliveryTag/당월 하드코딩 제거', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/accounting/journals`)
  await expect(page.getByTestId('journal-list-excel-export')).toBeVisible({ timeout: 30_000 })
  await capture(page, 'journal-list-screen')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('journal-list-excel-export').click()
  const download = await downloadPromise
  await download.saveAs(path.join(DOWNLOADS, 'journal-no-date-filter.xlsx'))
  await capture(page, 'journal-after-download')
})

test('발견1 — 판매전표목록 배송태그(당일) 필터 적용 후 Excel 다운로드', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/sales/slips`)
  await expect(page.getByTestId('slip-list-excel-export')).toBeVisible({ timeout: 30_000 })

  await page.getByLabel('배송태그 필터').selectOption('DAY')
  await capture(page, 'sliplist-daytag-filtered')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('slip-list-excel-export').click()
  const download = await downloadPromise
  await download.saveAs(path.join(DOWNLOADS, 'sliplist-deliveryTag-DAY.xlsx'))
})

test('발견2 — 재고현황 Excel 에 품목코드/품목명 컬럼이 포함된다', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/transfers`)
  await expect(page.getByTestId('transfer-list-stocks-excel-export')).toBeVisible({ timeout: 30_000 })
  await capture(page, 'transfer-list-screen')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('transfer-list-stocks-excel-export').click()
  const download = await downloadPromise
  await download.saveAs(path.join(DOWNLOADS, 'stocks-with-product-code.xlsx'))
  await capture(page, 'transfer-after-download')
})
