import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #773 S4 라이브 QA — 일마감 "모델별 재검증" FE 렌더 실증.
 *
 * S2b/S2c 가 BE(DailyProductLine 6필드) + mock parity 완료했으나 DailyClosingPage 는
 * taxInvoices 만 렌더하고 productSummaries(재검증 라인)를 0 렌더 → S4 가 2nd DataTable
 * "모델별 재검증"(품명·모델·수량·공급가·출고가·납품가·기대율·할인율·확인·사유)을 추가.
 *
 * 실 게이트웨이(:8080, mock OFF) → 실 accounting-service(:8087) → 실 Postgres.
 * dev accounting_db 는 tax_invoices 0행이나 sales_accounting_slips 는 2026-05 POSTED 다수 →
 * SALES_SLIP · 2026-05-19 실 데이터로 재검증 테이블 렌더 캡처(합성 fixture 아님).
 * dev_accountant(accounting.reports VIEW 보유)로 로그인 — 상세 조회 403 회피.
 *
 * 단계별 캡처(docs/qa/773-s4-daily-closing-render/):
 *  01 일마감 조회 화면 진입
 *  02 필터 설정(2026-05-19 · 매출 · 매출전표)
 *  03 모델별 재검증 테이블 렌더(실 데이터·확인 배지·출고가·할인율)
 *  04 재검증 테이블 클로즈업
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/773-s4-daily-closing-render'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
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

test('일마감 모델별 재검증 렌더 — SALES_SLIP 2026-05-19 실 데이터 (S4 FE)', async ({ page }) => {
  const login = await realLogin(page, 'dev_accountant')
  await installAuthStub(page, login)

  // 재검증 상세 실 응답 캡처 (게이트웨이 :8080 → accounting-service)
  const detailResponses: string[] = []
  page.on('response', async (response) => {
    if (
      response.url().includes('/accounting/closings/daily') &&
      response.request().method() === 'GET'
    ) {
      try {
        const body = await response.text()
        detailResponses.push(`Status ${response.status()}: ${body.slice(0, 600)}`)
        console.log('[DETAIL]', response.status(), body.slice(0, 400))
      } catch {
        // ignore
      }
    }
  })

  // 1) 일마감 조회 화면 진입
  // 웹 배포(VITE_PLATFORM='web')는 createBrowserRouter → 해시 없는 실 경로.
  await page.goto(`${BASE_URL}/accounting/daily-closings`)
  await expect(page.getByRole('heading', { name: '일마감 조회' })).toBeVisible({ timeout: 30_000 })
  await capture(page, 'page-entry')

  // 2) 필터: 날짜 2026-05-19 + 마감종류 매출(기본) + 원천 매출전표(SALES_SLIP)
  await page.getByTestId('daily-closing-filter-date').fill('2026-05-19')
  await page.getByRole('button', { name: '매출전표', exact: true }).click()
  await capture(page, 'filter-set-sales-slip-0519')

  // 3) 모델별 재검증 테이블 렌더 대기 (closingKind==='SALES' 게이트)
  const revalHeading = page.getByRole('heading', { name: '모델별 재검증' })
  await expect(revalHeading).toBeVisible({ timeout: 30_000 })

  // 4) 재검증 테이블 상단으로 스크롤 후 뷰포트 캡처 — 판독 가능한 실 데이터 행
  //    (품명·수량·공급가·출고가·납품가·기대율·할인율·확인 배지·사유)
  await revalHeading.scrollIntoViewIfNeeded()
  await capture(page, 'revalidation-table-top')

  console.log('[DETAIL RESPONSES]', detailResponses.join('\n---\n'))
})
