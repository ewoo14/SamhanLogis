import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #771 REVERSAL 분개 → 원천 입금보고서 deep-link 라이브 QA.
 *
 * 근본원인(수정 전): FE `normalizeJournal` 이 `cashReceiptId` 를 무시하고 `sourceRefId` 로
 * fallback → REVERSAL 분개는 BE 가 sourceRefId 에 원분개(원본 journal) UUID 를 채워보내고
 * (이중 의미) CashReceipt 조회가 실패 → "입금보고서 보기" 버튼이 REVERSAL 분개 상세에서
 * 아예 렌더되지 않음(#771 적발).
 *
 * fix: BE 가 원분개/역분개 모두 전용 cashReceiptId + cashReceiptSlipNo 필드를 채워보내고
 * (V56 백필 후 실 DB 370건 전수 cash_receipt_id 채움 확인 완료), FE accounting.ts
 * `normalizeJournal` 이 sourceRefId fallback 을 제거하고 cashReceiptId 를 직접 사용.
 *
 * 실 게이트웨이(:8080, mock OFF) → 재빌드 accounting-service → 실 Postgres.
 *
 * 대상: journal id cf69a6f2-107f-4e5d-8bf1-df8534418c2e (journalNo 2026/07/03-2, POSTED,
 * REVERSAL, sourceType=CASH_RECEIPT). 사전 API 조회(본 세션)로 cashReceiptId=
 * 89cffe91-7420-47d4-8001-e87cb2f1e0b6, cashReceiptSlipNo=2026/07/03-1, sourceRefId=
 * ac7e258e-c733-4f40-a401-b23ad77c03e9(원분개 id, cashReceiptId 와 다름) 확인 완료
 * (합성 데이터 아님, 실 DB 조회 결과).
 *
 * 단계별 캡처(docs/qa/771-journal-cashreceipt-deeplink/):
 *  01 REVERSAL 분개 상세 — "입금보고서 2026/07/03-1 보기" 버튼 노출(fix 전에는 부재)
 *  02 버튼 클릭 후 입금보고서 상세(2026/07/03-1) 도착
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/771-journal-cashreceipt-deeplink'))
fs.mkdirSync(SHOTS, { recursive: true })

const JOURNAL_ID = 'cf69a6f2-107f-4e5d-8bf1-df8534418c2e'
const JOURNAL_NO = '2026/07/03-2'
const CASH_RECEIPT_ID = '89cffe91-7420-47d4-8001-e87cb2f1e0b6'
const CASH_RECEIPT_SLIP_NO = '2026/07/03-1'

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

test('REVERSAL 분개 상세 → "입금보고서 보기" deep-link → 원천 입금보고서 상세 도착 (#771 fix 실증)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  const journalStatuses: string[] = []
  const cashReceiptStatuses: string[] = []
  page.on('response', (response) => {
    const url = response.url()
    const method = response.request().method()
    if (url.includes('/accounting/journals/')) {
      journalStatuses.push(`${method} ${url} -> ${response.status()}`)
      console.log('[JOURNAL RESPONSE]', method, url, response.status())
    } else if (url.includes('/accounting/cash-receipts/')) {
      cashReceiptStatuses.push(`${method} ${url} -> ${response.status()}`)
      console.log('[CASH RECEIPT RESPONSE]', method, url, response.status())
    }
  })

  // 1) REVERSAL 분개 상세 진입 (networkidle 미사용 — 협업 SSE 상시연결로 hang 유발)
  //    exact:true 필수 — AppLayout header-page-title(h2)도 "분개 상세[2026/07/03-2]" 로 동일
  //    journalNo 를 substring 으로 포함해 strict-mode violation 유발(카드 h3 와 2건 매치).
  await page.goto(`${BASE_URL}/#/accounting/journals/${JOURNAL_ID}`)
  await expect(page.getByRole('heading', { name: JOURNAL_NO, exact: true })).toBeVisible({ timeout: 30_000 })

  const journalGetStatuses = journalStatuses.filter((s) => s.includes(JOURNAL_ID) && s.startsWith('GET'))
  expect(
    journalGetStatuses.some((s) => s.endsWith('-> 200')),
    `분개 상세 GET 200 미확인: ${journalGetStatuses.join(' | ') || '(no matching response captured)'}`,
  ).toBeTruthy()

  // 2) #771 fix 핵심 검증 — REVERSAL 분개인데도 "입금보고서 2026/07/03-1 보기" 버튼이 노출되어야 한다.
  //    fix 전에는 sourceRefId fallback 이 원분개 UUID 를 CashReceipt id 로 오인 → 조회 실패 → 버튼 부재.
  const deepLinkButton = page.getByRole('button', { name: `입금보고서 ${CASH_RECEIPT_SLIP_NO} 보기` })
  await expect(deepLinkButton).toBeVisible({ timeout: 15_000 })
  await capture(page, 'reversal-journal-deeplink-button')

  // 3) 버튼 클릭 → 원천 입금보고서 상세로 이동
  await deepLinkButton.click()
  await expect(page).toHaveURL(new RegExp(`#/accounting/admin/cash-receipts/${CASH_RECEIPT_ID}$`), { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: CASH_RECEIPT_SLIP_NO, exact: true })).toBeVisible({ timeout: 30_000 })

  const cashReceiptGetStatuses = cashReceiptStatuses.filter((s) => s.includes(CASH_RECEIPT_ID) && s.startsWith('GET'))
  expect(
    cashReceiptGetStatuses.some((s) => s.endsWith('-> 200')),
    `입금보고서 상세 GET 200 미확인: ${cashReceiptGetStatuses.join(' | ') || '(no matching response captured)'}`,
  ).toBeTruthy()
  await capture(page, 'landed-on-cash-receipt')

  console.log('[JOURNAL STATUSES]\n' + journalStatuses.join('\n'))
  console.log('[CASH RECEIPT STATUSES]\n' + cashReceiptStatuses.join('\n'))
})
