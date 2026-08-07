import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * §7 슬라이스6 그룹웨어 결재(ApprovalLine) 협업 "수정완료 1-인" — 실 서버 QA 스크린샷 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080 (page.route 프록시 + 실 JWT).
 * - 결재 목록 `/groupware/approvals` → 상세 `/groupware/approvals/{approvalId}`(UUID).
 * - 대상: 실 시드 결재 문서. PENDING(편집 허용) + APPROVED(최종 결재 완료 = COLLAB_LOCKED 409).
 * - 검증: approvalNo 슬래시 표기(YYYY/MM/DD-N) + 수정완료(제목/내용) diff + KST 타임스탬프 + 코멘트 + 잠금.
 *
 * 실행: 별도 터미널 vite :5175(mock off);
 *   node_modules/.bin/playwright test --config playwright/groupware-approval-collab-real-qa/playwright.config.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

/** 실 시드 결재 문서 UUID — PENDING(편집 허용) / APPROVED(최종 결재 완료, 잠금). */
const PENDING_APPROVAL_ID = process.env['GW_PENDING_APPROVAL_ID'] ?? 'faaadfc6-58a8-4132-b522-d97c39b36a3f'
const APPROVED_APPROVAL_ID = process.env['GW_APPROVED_APPROVAL_ID'] ?? '4d7a6c77-0b5f-4f4b-a1fe-5a01d8f732af'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/groupware-approval-collab'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let n = 0
async function capture(page: Page, name: string): Promise<void> {
  n++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false })
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: (process.env.DEV_PASSWORD ?? '') })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => {
        try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token: ' + d)) } }) },
    )
    req.on('error', reject); req.write(body); req.end()
  })
}

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(({ t, userId, role, displayName }: { t: string; userId: string; role: string; displayName: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role, displayName, fullName: displayName }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME })
}

/** :8080 게이트웨이로 향하는 모든 호출(/admin/**, /api/v1/** 등)을 서버사이드 재요청(CORS 우회) + JWT 주입. */
async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
    // SSE collab/stream 은 응답이 끝나지 않아 route.fetch 가 teardown 까지 hang → QA 캡처에 불필요하므로 abort.
    if (u.pathname.endsWith('/collab/stream')) { await route.abort(); return }
    const realUrl = `${GW_URL}${u.pathname}${u.search}`
    const headers: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) {
      if (name.toLowerCase() !== 'host') headers[name] = value
    }
    headers['Authorization'] = `Bearer ${token}`
    const postData = route.request().postData()
    try {
      const response = await route.fetch({ url: realUrl, method: route.request().method(), headers, body: postData ?? undefined })
      await route.fulfill({ response })
    } catch (err) { console.error('[PROXY]', realUrl, err); await route.abort() }
  })
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.waitForTimeout(1_500)
}

test.describe('§7 슬라이스6 그룹웨어 결재 협업 실 QA — 수정완료 1-인 모델', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('목록 → 상세(슬래시 번호) → 수정완료(제목/내용) → diff(KST) → 코멘트 → 잠금', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    // 1) 결재 목록 — approvalNo 슬래시 표기 + 상태 배지
    await gotoAndSettle(page, `${BASE_URL}/#/groupware/approvals?mockRole=MASTER`)
    await page.getByTestId('groupware-approval-list-table').scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'approval-list')

    // 2) 상세(PENDING) — approvalNo 슬래시 / 내용 / 결재선 / collab 패널
    await gotoAndSettle(page, `${BASE_URL}/#/groupware/approvals/${PENDING_APPROVAL_ID}?mockRole=MASTER`)
    const detailNo = page.getByTestId('groupware-approval-detail-no')
    await expect(detailNo).toBeVisible({ timeout: 10_000 })
    await expect(detailNo).toContainText('/') // YYYY/MM/DD-N 슬래시 표준
    await page.getByTestId('groupware-approval-collaboration-panel').scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'detail-pending')

    // 3) 수정 진입
    await page.getByTestId('groupware-approval-collab-edit-start').click({ timeout: 8_000 })
    await page.waitForTimeout(600)
    await page.getByTestId('groupware-approval-collab-edit-form').scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'edit-form')

    // 4) 제목/내용/사유 입력 (수정완료 1-인 즉시 커밋)
    //    재실행(예: Codex 라운드) 시 이미 변경된 값과 동일하면 "변경된 필드가 없습니다" no-op 가 되므로
    //    매 실행 고유 suffix 를 붙여 항상 실제 변경(diff) 이 발생하도록 한다.
    const runTag = String(Date.now()).slice(-6)
    await page.getByLabel('제목 수정값').fill(`실서버 QA — 그룹웨어 결재 제목 정정(KST) #${runTag}`)
    await page.getByLabel('내용 수정값').fill(`실서버 QA — 결재 본문 수정완료 검증 #${runTag}. title/content 만 overlay, 핵심필드 불변.`)
    await page.getByLabel('수정 사유').fill('실서버 QA 검증 — 그룹웨어 결재 collab 수정완료')
    await page.waitForTimeout(400)
    await capture(page, 'edit-filled')

    // 5) 수정완료 = 즉시 커밋
    await page.getByTestId('groupware-approval-collab-edit-submit').click()
    await page.waitForTimeout(1_800)
    await capture(page, 'edit-committed')

    // 6) 수정 이력 — 개발책임자 결정1(2026-07-06, #31 재확인)로 changeSet diff(before→after)
    //    목록이 복구됐다(버전이력 아님 — 그룹웨어 결재는 revision/restore API 미보유).
    const editHistory = page.getByTestId('groupware-approval-collab-edit-history-panel')
    await editHistory.scrollIntoViewIfNeeded().catch(() => {})
    await expect(editHistory).toBeVisible({ timeout: 8_000 })
    await page.waitForTimeout(400)
    await capture(page, 'edit-history')

    // 7) 코멘트 연결 필드(anchor) 선택 → 등록 — 결정2 anchor 생성 UX.
    const anchorSelect = page.getByTestId('groupware-approval-collab-comment-anchor-select')
    await anchorSelect.scrollIntoViewIfNeeded().catch(() => {})
    await anchorSelect.selectOption('title')
    await page.waitForTimeout(300)
    await capture(page, 'comment-anchor-select')
    await page.getByTestId('groupware-approval-collab-comment-input').fill('실서버 QA — 그룹웨어 결재 협업 코멘트 검증')
    await page.getByRole('button', { name: '등록' }).click()
    await page.waitForTimeout(1_500)
    const commentItem = page.getByTestId('groupware-approval-collab-comment-item').first()
    await commentItem.scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'comment-added')

    // 7-1) anchor(제목) 클릭 → 수정 이력 diff 와 하이라이트 공유(결정2 양방향).
    await commentItem.click()
    await page.waitForTimeout(300)
    await capture(page, 'comment-anchor-highlight')

    // 8) APPROVED(최종 결재 완료) 상세 — 잠금 안내(수정 버튼 없음)
    await gotoAndSettle(page, `${BASE_URL}/#/groupware/approvals/${APPROVED_APPROVAL_ID}?mockRole=MASTER`)
    await page.getByTestId('groupware-approval-collaboration-panel').scrollIntoViewIfNeeded().catch(() => {})
    const locked = page.getByTestId('groupware-approval-collab-locked')
    await expect(locked).toBeVisible({ timeout: 8_000 })
    await capture(page, 'approved-locked')
  })
})
