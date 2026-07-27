import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #747(#31 이력 일원화) Opus 라운드 fix — 실서버 라이브 QA.
 *
 * 검증 대상 (커밋 3ebb79520 + f248ce7ec):
 *  1. 데스크톱 "복원..." select(slip-detail-revert-select) 완전 제거 — 통합 협업 패널
 *     (SlipCollaborationPanel → SlipVersionHistoryPanel) restore 로만 일원화.
 *  2. 모바일 "코멘트" MobileCollapsible 카드화(mobile-section-card) — 그 안에 코멘트 +
 *     버전이력이 통합. 별도 "버전 이력"/"수정 이력" MobileCollapsible 없음(중복 제거 확인).
 *  3. 모바일 터치타겟 44px — 통합 패널 내부 버튼(이 시점으로 복원 / 코멘트 해결·삭제·등록).
 *
 * 실 게이트웨이 :8080 · mock OFF · dev_master · 실 슬립(371fbae7-2beb-4068-9923-cefeb9fc119e,
 * slipNo 2026/06/24-7, OUTBOUND/DRAFT, revision 3건 EDIT/EDIT/CREATE — 복원 후보 2건 보유).
 * 합성/fixture 없음 — 전부 실 DOM 캡처.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5183'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/31-history-unify-opus-round'))
fs.mkdirSync(SHOTS, { recursive: true })

/** 실 슬립 — revisionCount=3(EDIT/EDIT/CREATE), 복원 후보(비-latest) 2건: rev #2, #1. */
const SLIP_ID = '371fbae7-2beb-4068-9923-cefeb9fc119e'

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

let shotNo = 0
async function capturePage(page: Page, name: string, fullPage = false): Promise<string> {
  shotNo++
  const filePath = path.join(SHOTS, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage })
  console.log(`[CAPTURE] ${filePath}`)
  return filePath
}

test('PR #747(#31) Opus 라운드 fix — 복원 일원화 + 모바일 카드화 + 44px 실QA', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 재실행 idempotency — 이전 실행이 남긴 코멘트가 있으면 선삭제(DEV-SEED 오염 방지).
  const preExisting = await page.request.get(
    `${API_BASE}/api/v1/slips/${SLIP_ID}/collab/comments`,
    { headers: { Authorization: `Bearer ${login.token}` } },
  )
  const preExistingComments: Array<{ id: string }> = (await preExisting.json()).data ?? []
  for (const c of preExistingComments) {
    await page.request.delete(
      `${API_BASE}/api/v1/slips/${SLIP_ID}/collab/comments/${c.id}`,
      { headers: { Authorization: `Bearer ${login.token}` } },
    )
  }
  if (preExistingComments.length > 0) {
    console.log(`[CLEANUP] 이전 실행 잔여 코멘트 ${preExistingComments.length}건 선삭제`)
  }

  // ============================================================
  // 데스크톱(1440x900) — 검증 1: 복원 select 제거
  // ============================================================
  await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}`)
  await page.waitForSelector('[data-testid="slip-detail-revision-count"]', { timeout: 30000 })
  await page.waitForTimeout(1200)

  const revisionBadge = page.getByTestId('slip-detail-revision-count')
  await expect(revisionBadge).toBeVisible()
  const revisionText = await revisionBadge.textContent()
  console.log(`[INFO] 헤더 수정 배지: "${revisionText}"`)

  const revertSelect = page.getByTestId('slip-detail-revert-select')
  const revertSelectCount = await revertSelect.count()
  console.log(`[CHECK 1] slip-detail-revert-select count = ${revertSelectCount} (기대값 0)`)
  expect(revertSelectCount, '데스크톱 복원 select 는 완전히 제거되어야 함').toBe(0)

  const actionBar = page.locator('.detail-action-bar')
  await expect(actionBar).toBeVisible()
  await actionBar.screenshot({ path: path.join(SHOTS, 'desktop-01-action-bar-no-revert-select.png') })
  console.log(`[CAPTURE] ${path.join(SHOTS, 'desktop-01-action-bar-no-revert-select.png')}`)

  // ============================================================
  // 데스크톱 — 검증 통합 패널 복원 노출
  // ============================================================
  const collabPanel = page.getByTestId('slip-collaboration-panel')
  await collabPanel.scrollIntoViewIfNeeded()
  await expect(collabPanel).toBeVisible()

  const versionHistoryPanel = page.getByTestId('slip-version-history-panel')
  await expect(versionHistoryPanel).toBeVisible()
  await expect(versionHistoryPanel.locator('h4')).toHaveText('버전 이력')

  const restoreBtn2 = page.getByTestId('slip-version-history-restore-button-2')
  const restoreBtn1 = page.getByTestId('slip-version-history-restore-button-1')
  await expect(restoreBtn2, '비-latest revision #2 는 복원 버튼 노출').toBeVisible()
  await expect(restoreBtn1, '비-latest revision #1 는 복원 버튼 노출').toBeVisible()
  await expect(restoreBtn2).toHaveText('이 시점으로 복원')

  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="slip-version-history-panel"]')
    el?.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(300)
  await capturePage(page, 'desktop-02-unified-panel-restore')

  // ============================================================
  // 코멘트 1건 등록(데스크톱) — 이후 모바일 전환 시 동일 DOM 이 mobile-section-body 로
  // 재배치되므로, 해결/삭제 버튼의 모바일 44px 측정 대상으로 재사용한다.
  // ============================================================
  const commentInput = page.getByTestId('slip-collab-comment-input')
  await commentInput.fill('QA #747 Opus 라운드 — 복원 일원화 실QA 코멘트')
  const registerBtn = page.getByRole('button', { name: '등록' })
  await registerBtn.click()
  await page.waitForTimeout(1200)
  const commentItems = page.getByTestId('slip-collab-comment-item')
  await expect(commentItems, '코멘트 등록 후 목록에 1건 이상 노출').toHaveCount(1)
  console.log('[INFO] 코멘트 1건 등록 완료 — 모바일 전환 후 해결/삭제 버튼 44px 측정용')

  // ============================================================
  // 모바일(390x844) — 검증 2: "코멘트" 카드 패널(통합) + 중복 accordion 부재
  // ============================================================
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)

  // isMobile 리스너가 resize 이벤트로 갱신되지 않을 경우를 대비한 폴백 — 코멘트 accordion
  // summary 버튼이 안 보이면 reload 로 강제 재마운트(isMobile 초기값이 바로 mobile).
  const commentSummaryBtn = page.getByRole('button', { name: '코멘트' })
  if (!(await commentSummaryBtn.isVisible().catch(() => false))) {
    console.log('[FALLBACK] resize 리스너 미반영 — reload 로 모바일 재마운트')
    await page.reload()
    await page.waitForSelector('[data-testid="slip-detail-revision-count"]', { timeout: 30000 })
    await page.waitForTimeout(1000)
  }

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)

  const commentAccordion = page.locator('.mobile-section-accordion').filter({
    has: page.getByRole('button', { name: '코멘트' }),
  })
  await expect(commentAccordion, '"코멘트" MobileCollapsible accordion 이 정확히 1개 존재').toHaveCount(1)

  const commentAccordionClass = await commentAccordion.getAttribute('class')
  console.log(`[CHECK 2] "코멘트" accordion class = "${commentAccordionClass}"`)
  expect(commentAccordionClass ?? '', 'mobile-section-card 클래스 포함').toContain('mobile-section-card')

  const summaryBtn = commentAccordion.getByRole('button', { name: '코멘트' })
  const expanded = await summaryBtn.getAttribute('aria-expanded')
  console.log(`[INFO] "코멘트" accordion aria-expanded = ${expanded}`)
  if (expanded !== 'true') {
    await summaryBtn.click()
    await page.waitForTimeout(400)
  }

  await commentAccordion.scrollIntoViewIfNeeded()
  await commentAccordion.screenshot({ path: path.join(SHOTS, 'mobile-01-comment-card-panel.png') })
  console.log(`[CAPTURE] ${path.join(SHOTS, 'mobile-01-comment-card-panel.png')}`)

  // 통합 패널 내부에 버전이력이 실제로 포함되는지 — mobile-section-body 스코프 내부 확인.
  const mobileVersionHistoryPanel = commentAccordion.locator('[data-testid="slip-version-history-panel"]')
  await expect(mobileVersionHistoryPanel, '모바일 "코멘트" 카드 내부에 버전이력 패널 통합').toBeVisible()
  const mobileRestoreBtn2 = commentAccordion.getByTestId('slip-version-history-restore-button-2')
  await expect(mobileRestoreBtn2).toBeVisible()
  await mobileVersionHistoryPanel.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await mobileVersionHistoryPanel.screenshot({ path: path.join(SHOTS, 'mobile-02-version-history-in-panel.png') })
  console.log(`[CAPTURE] ${path.join(SHOTS, 'mobile-02-version-history-in-panel.png')}`)

  // ============================================================
  // 검증 3: 모바일 터치타겟 44px — 복원 버튼 + 코멘트 해결/삭제/등록 버튼
  // (각 요소를 개별 scrollIntoView 후 측정 — 페이지 스크롤 위치에 영향받지 않는 순수 렌더 높이)
  // ============================================================
  await mobileRestoreBtn2.scrollIntoViewIfNeeded()
  const restoreBox2 = await mobileRestoreBtn2.boundingBox()
  console.log(`[MEASURE] "이 시점으로 복원"(rev#2) boundingBox = ${JSON.stringify(restoreBox2)}`)
  expect(restoreBox2?.height ?? 0, '이 시점으로 복원 버튼 높이 ≥ 44px').toBeGreaterThanOrEqual(44)

  const mobileRestoreBtn1 = commentAccordion.getByTestId('slip-version-history-restore-button-1')
  await mobileRestoreBtn1.scrollIntoViewIfNeeded()
  const restoreBox1 = await mobileRestoreBtn1.boundingBox()
  console.log(`[MEASURE] "이 시점으로 복원"(rev#1) boundingBox = ${JSON.stringify(restoreBox1)}`)
  expect(restoreBox1?.height ?? 0, '이 시점으로 복원 버튼(rev#1) 높이 ≥ 44px').toBeGreaterThanOrEqual(44)

  const commentListArea = commentAccordion.getByTestId('slip-collab-comment-list')
  await commentListArea.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await commentListArea.screenshot({ path: path.join(SHOTS, 'mobile-04-comment-action-buttons.png') })
  console.log(`[CAPTURE] ${path.join(SHOTS, 'mobile-04-comment-action-buttons.png')}`)

  const mobileResolveBtn = commentAccordion.getByRole('button', { name: '해결' })
  await mobileResolveBtn.scrollIntoViewIfNeeded()
  const resolveBox = await mobileResolveBtn.boundingBox()
  console.log(`[MEASURE] 코멘트 "해결" 버튼 boundingBox = ${JSON.stringify(resolveBox)}`)
  expect(resolveBox?.height ?? 0, '코멘트 해결 버튼 높이 ≥ 44px').toBeGreaterThanOrEqual(44)

  const mobileDeleteBtn = commentAccordion.getByRole('button', { name: '삭제' })
  await mobileDeleteBtn.scrollIntoViewIfNeeded()
  const deleteBox = await mobileDeleteBtn.boundingBox()
  console.log(`[MEASURE] 코멘트 "삭제" 버튼 boundingBox = ${JSON.stringify(deleteBox)}`)
  expect(deleteBox?.height ?? 0, '코멘트 삭제 버튼 높이 ≥ 44px').toBeGreaterThanOrEqual(44)

  const mobileRegisterBtn = commentAccordion.getByRole('button', { name: '등록' })
  await mobileRegisterBtn.scrollIntoViewIfNeeded()
  const registerBox = await mobileRegisterBtn.boundingBox()
  console.log(`[MEASURE] 코멘트 "등록" 버튼 boundingBox = ${JSON.stringify(registerBox)}`)
  expect(registerBox?.height ?? 0, '코멘트 등록 버튼 높이 ≥ 44px').toBeGreaterThanOrEqual(44)

  // ============================================================
  // 검증 2b: 별도 "버전 이력"/"수정 이력" accordion 부재(중복 제거 확인)
  // ============================================================
  const legacyVersionHistoryAccordion = page.locator('.mobile-section-summary', { hasText: '버전 이력' })
  const legacyAuditHistoryAccordion = page.locator('.mobile-section-summary', { hasText: '수정 이력' })
  const legacyVersionCount = await legacyVersionHistoryAccordion.count()
  const legacyAuditCount = await legacyAuditHistoryAccordion.count()
  console.log(`[CHECK 2b] 별도 "버전 이력" accordion count = ${legacyVersionCount} (기대값 0)`)
  console.log(`[CHECK 2b] 별도 "수정 이력" accordion count = ${legacyAuditCount} (기대값 0)`)
  expect(legacyVersionCount, '별도 "버전 이력" accordion 은 제거되어 있어야 함').toBe(0)
  expect(legacyAuditCount, '별도 "수정 이력" accordion 은 제거되어 있어야 함').toBe(0)

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(300)
  await capturePage(page, 'mobile-03-no-duplicate-accordions', true)

  // ============================================================
  // 정리 — 테스트가 등록한 코멘트를 UI "삭제" 로 제거(삭제 버튼 기능 검증 겸 idempotent 복원).
  // ============================================================
  await mobileDeleteBtn.click()
  await page.waitForTimeout(1000)
  await expect(page.getByTestId('slip-collab-comment-item'), 'QA 코멘트 삭제 후 목록 0건 복원').toHaveCount(0)
  console.log('[CLEANUP] QA 코멘트 UI 삭제 완료 — DEV-SEED 상태 복원')

  await ctx.close()
})
