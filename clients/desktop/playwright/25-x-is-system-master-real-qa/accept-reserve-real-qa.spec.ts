import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #25 X-Is-System-Master 회귀 fix(PR #734) 라이브 QA — 전표 수락(accept) 시
 * slip-service → inventory-service 재고 예약(reserve/reserve-batch) 서비스간 인가 실증.
 *
 * 근본원인(fix 전): C5-4(#415)가 PermissionAspect MASTER bypass 를
 * X-Is-System-Master 헤더 단독 판정으로 전환했으나, slip-service/partner-order-service
 * 의 InventoryClient/SlipServiceClient 3곳이 해당 헤더를 보내지 않아 서비스간 호출이
 * account 모드로 강등 → sentinel X-User-Id(00000000-...-0000)는 어떤 계정 권한도 없어
 * inventory-service 가 403 FORBIDDEN 반환. slip-service 는 이를 4xx→CONFLICT(409) 로
 * 래핑하여 전표 수락(accept)이 항상 실패.
 *
 * fix: 3 client 에 X-Is-System-Master:true 헤더 추가 (inventory-service SlipClient 선례 미러).
 *
 * 대상: 2026/05/31-1 (OUTBOUND, SENT, 시리얼관리 품목) — accept() 는 시리얼 라인이므로
 * POST /inventory/instances/reserve-batch (page=inventory.stock-balance UPDATE) 호출.
 * 계정: dev_manager — 매니저 그룹(slip.transfer.process UPDATE 권한) + SLIP_OUTBOUND/
 * OUTBOUND_DISPATCH 결재라인 개별 승인자(사전 DB 확인, 승인 게이트 통과 목적. 결재라인
 * 자체는 본 PR 범위 밖 — 접근 가능한 계정 선택일 뿐).
 *
 * 라운드는 QA_ROUND 환경변수로 구분(pre-fix / post-fix) — 스펙은 동일, 실행 시점의
 * 컨테이너 이미지가 fix 전/후를 가른다. 캡처: docs/qa/25-x-is-system-master/.
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
const ROUND = process.env['QA_ROUND'] ?? 'unknown-round'
const SLIP_ID = process.env['SLIP_ID'] ?? '4b0124ad-c1dc-4f3b-b8f6-b71cf84357da'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/25-x-is-system-master'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${ROUND}-${String(shotNo).padStart(2, '0')}-${name}.png`),
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

test(`전표 수락(accept) — X-Is-System-Master 서비스간 인가 실증 [${ROUND}]`, async ({ page }) => {
  const login = await realLogin(page, 'dev_manager')
  await installAuthStub(page, login)

  const acceptResponses: string[] = []
  page.on('response', async (response) => {
    if (response.url().includes(`/slips/${SLIP_ID}/accept`) && response.request().method() === 'POST') {
      try {
        const body = await response.text()
        acceptResponses.push(`Status: ${response.status()}\nBody: ${body}`)
        console.log(`[ACCEPT RESPONSE][${ROUND}]`, response.status(), body)
      } catch {
        // ignore
      }
    }
  })

  // 1) 전표 상세 진입 — SENT 상태 확인
  await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}`)
  await expect(page.getByText('출고전표 상세')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('전표 진행 단계')).toBeVisible({ timeout: 30_000 })
  await capture(page, 'slip-detail-sent-entry')

  if (process.env['VIEW_ONLY'] === '1') {
    console.log(`[VIEW-ONLY][${ROUND}] mutation 생략 — 현재 상태만 캡처`)
    return
  }

  await expect(page.getByText('창고 전송')).toBeVisible({ timeout: 15_000 })

  // 2) 하단 "완료 (수락)" 버튼 클릭
  const acceptBtn = page.getByRole('button', { name: /완료.*수락/ })
  await expect(acceptBtn).toBeVisible({ timeout: 15_000 })
  await expect(acceptBtn).toBeEnabled()
  await acceptBtn.click()

  // 3) 결과 대기 — 실패(error-banner) 또는 성공(상태 ACCEPTED 뱃지) 둘 중 하나
  const errorBanner = page.locator('.error-banner')
  const acceptedBadge = page.getByText('수락', { exact: true })
  await Promise.race([
    errorBanner.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined),
    acceptedBadge.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined),
  ])
  await page.waitForTimeout(1000)

  const bannerVisible = await errorBanner.isVisible().catch(() => false)
  if (bannerVisible) {
    const text = await errorBanner.innerText()
    console.log(`[RESULT][${ROUND}] FAILURE — error-banner:`, text)
    await capture(page, 'accept-result-forbidden-conflict')
  } else {
    console.log(`[RESULT][${ROUND}] SUCCESS — no error-banner, checking status badge`)
    await capture(page, 'accept-result-success')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await capture(page, 'accept-result-success-progress-bar')
  }

  console.log(`[ACCEPT RESPONSES][${ROUND}]`, acceptResponses.join('\n---\n'))
})
