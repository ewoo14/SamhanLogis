import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #25 X-Is-System-Master 회귀 fix(PR #734) 라이브 QA — 거래처 주문 확정(convert-to-slip) 시
 * partner-order-service → inventory-service(reserve) + slip-service(publishFromPartnerOrder)
 * 서비스간 인가 실증. fix 後 성공 경로만 캡처(원인은 accept-reserve-real-qa.spec.ts 와 동일 —
 * X-Is-System-Master 헤더 누락 → account 모드 강등 → sentinel 계정 권한 없음 → 403).
 *
 * 대상: 2026/06/08-1574 (DRAFT, 단일 라인, 품목 7550826e 창고HQ-001 재고보유) —
 * 판매전표 전환 시 InventoryClient.reserve() + SlipServiceClient.publishFromPartnerOrder()
 * 순차 호출. 계정: dev_manager(매니저 그룹 sales.partner-order.convert CREATE 권한).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5931'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const ORDER_ID = process.env['ORDER_ID'] ?? '016d6997-d6d0-497e-9672-0223ee2493b2'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/25-x-is-system-master'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 10
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `04-post-fix-convert-${String(shotNo).padStart(2, '0')}-${name}.png`),
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

test('거래처 주문 확정(convert-to-slip) — X-Is-System-Master 서비스간 인가 실증 [post-fix]', async ({ page }) => {
  const login = await realLogin(page, 'dev_manager')
  await installAuthStub(page, login)

  const convertResponses: string[] = []
  page.on('response', async (response) => {
    if (response.url().includes('/convert-to-slip') && response.request().method() === 'POST') {
      try {
        const body = await response.text()
        convertResponses.push(`Status: ${response.status()}\nBody: ${body}`)
        console.log('[CONVERT RESPONSE]', response.status(), body)
      } catch {
        // ignore
      }
    }
  })

  // 1) 거래처 주문 상세 진입
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_ID}`)
  await expect(page.getByTestId('partner-order-convert-open')).toBeVisible({ timeout: 30_000 })
  await capture(page, 'order-detail-draft-entry')

  // 2) 판매전표 전환 모달 오픈 — DS Modal 은 data-testid 미전달([[local-stack-qa-gotchas]]) → submit 버튼으로 대기
  await page.getByTestId('partner-order-convert-open').click()
  await expect(page.getByTestId('partner-order-convert-submit')).toBeVisible({ timeout: 10_000 })

  // 3) 출고 창고 선택 (HQ-001 — inventory 단일 출처 목록)
  const warehouseInput = page.getByTestId('partner-order-convert-warehouse').locator('input')
  await warehouseInput.fill('HQ-001')
  await page.getByText('본사창고', { exact: false }).first().click()
  await capture(page, 'convert-modal-warehouse-selected')

  // 4) 전환 제출
  const submitBtn = page.getByTestId('partner-order-convert-submit')
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 })
  await submitBtn.click()

  // 5) 결과 대기 — 모달 닫힘(성공) 또는 에러 메시지
  await Promise.race([
    page.getByTestId('partner-order-convert-submit').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined),
    page.waitForTimeout(15_000),
  ])
  await page.waitForTimeout(1000)
  await capture(page, 'convert-result')

  console.log('[CONVERT RESPONSES]', convertResponses.join('\n---\n'))
})
