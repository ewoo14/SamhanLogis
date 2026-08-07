import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #474 §7 전표 수정(협업) "수정완료 1-인" 모델 — 실 서버 QA 스크린샷 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 * - VITE_MOCK_MODE 완전 OFF — 실 게이트웨이 http://127.0.0.1:8080 직접 연결.
 * - window.samhanAuth stub 으로 Electron IPC 없이 실 JWT 주입.
 * - 실 확정 전표 1c72f28a-4aae-4f1c-8522-b7e9a921aa0d (slipNo 2026/04/08-001, INBOUND/CONFIRMED).
 *
 * 캡처 대상:
 *   01-slip-list.png          — 전표 목록 (CONFIRMED 전표 존재 확인)
 *   02-slip-detail.png        — 전표 상세 (CONFIRMED 상태, 협업 패널 포함)
 *   03-edit-button.png        — "수정" 버튼 클로즈업 (확정전표 협업 편집 트리거)
 *   04-edit-mode.png          — 편집 오버레이 폼 (메모 필드 수정 전)
 *   05-edit-filled.png        — 수정값 + 사유 입력 후 상태
 *   06-edit-commit.png        — "수정완료" 클릭 직후 (적용 중 또는 완료)
 *   07-diff-history.png       — 수정 이력 diff 뷰 (이전값→새값·수정자·시각)
 *   08-comment-input.png      — 협업 코멘트 입력 폼
 *   09-comment-posted.png     — 코멘트 등록 완료 후 목록
 *
 * 실행:
 *   cd C:\dev\Samhan-Public\clients\desktop
 *   $env:PLAYWRIGHT_SKIP_WEB_SERVER="1"
 *   $env:AUDIT_BASE_URL="http://127.0.0.1:5175"
 *   # 별도 터미널: npx vite src/renderer --host 127.0.0.1 --port 5175 (VITE_MOCK_MODE 미설정)
 *   node_modules/.bin/playwright test playwright/slip-edit-collab-real-qa --reporter=line --headed=false
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, type Page } from '@playwright/test'

// ============================================================
// 상수
// ============================================================

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

/** 실 MASTER 계정 — V5 seed */
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

/** 실 확정 전표 UUID */
const SLIP_ID = '1c72f28a-4aae-4f1c-8522-b7e9a921aa0d'

/** QA 스크린샷 저장 디렉토리 */
const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/slip-edit-collab',
))

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let screenshotCounter = 0
async function capture(page: Page, name: string): Promise<void> {
  screenshotCounter++
  const num = String(screenshotCounter).padStart(2, '0')
  const filePath = path.join(SCREENSHOT_DIR, `${num}-${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`[CAPTURE] ${filePath}`)
}

// ============================================================
// 실 JWT 획득
// ============================================================

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')) })
    const req = http.default.request(
      {
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            resolve(parsed.data.token as string)
          } catch (e) {
            reject(new Error(`토큰 파싱 실패: ${data}`))
          }
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ============================================================
// window.samhanAuth stub + 실 JWT 주입
// ============================================================

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ({ t, userId, role, displayName }: { t: string; userId: string; role: string; displayName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: t, userId, role, displayName }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME },
  )
}

// ============================================================
// 게이트웨이 API 직접 프록시 (CORS + IPC 없이 실 호출)
// ============================================================

async function setupApiProxy(page: Page, token: string): Promise<void> {
  // /api/v1/** 모든 요청을 게이트웨이로 프록시
  await page.route('**/api/v1/**', async (route) => {
    const originalUrl = route.request().url()
    const urlObj = new URL(originalUrl)
    const realUrl = `${GW_URL}${urlObj.pathname}${urlObj.search}`

    const originalHeaders = await route.request().headersArray()
    const filteredHeaders: Record<string, string> = {}
    for (const { name, value } of originalHeaders) {
      if (name.toLowerCase() !== 'host') {
        filteredHeaders[name] = value
      }
    }
    filteredHeaders['Authorization'] = `Bearer ${token}`

    const postData = route.request().postData()
    try {
      const response = await route.fetch({
        url: realUrl,
        method: route.request().method(),
        headers: filteredHeaders,
        body: postData ?? undefined,
      })
      await route.fulfill({ response })
    } catch (err) {
      console.error(`[PROXY ERROR] ${realUrl}:`, err)
      await route.abort()
    }
  })
}

// ============================================================
// 헬퍼
// ============================================================

const IDLE_TIMEOUT = 8_000
const SETTLE_WAIT = 1_500

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
  await page.waitForTimeout(SETTLE_WAIT)
}

// ============================================================
// 테스트
// ============================================================

test.describe('PR #474 §7 전표 수정(협업) 실 QA — 수정완료 1-인 모델', () => {

  let realToken = ''

  test.beforeAll(async () => {
    realToken = await fetchRealToken()
    console.log(`[AUTH] 실 JWT 획득 완료 (${realToken.slice(0, 30)}...)`)
  })

  test('01 전표 목록 → 02 전표 상세 → 03 협업 수정 플로우 → 07 이력 → 08~09 코멘트', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    // ① 전표 목록
    const listUrl = `${BASE_URL}/#/purchases?mockRole=MASTER`
    await gotoAndSettle(page, listUrl)
    await capture(page, 'slip-list')

    // ② 전표 상세 직접 진입 (INBOUND → /purchases/:id)
    const detailUrl = `${BASE_URL}/#/purchases/${SLIP_ID}?mockRole=MASTER`
    await gotoAndSettle(page, detailUrl)
    await capture(page, 'slip-detail')

    // ③ 협업 패널 + 수정 버튼 확인
    // 패널이 로드될 때까지 대기 (여러 가능한 data-testid 시도)
    const possiblePanels = [
      page.getByTestId('slip-collaboration-panel'),
      page.locator('[data-testid*="collab"]').first(),
      page.locator('section').filter({ hasText: '협업' }).first(),
      page.locator('div').filter({ hasText: '수정 이력' }).first(),
    ]
    for (const panel of possiblePanels) {
      const visible = await panel.isVisible().catch(() => false)
      if (visible) break
    }

    // 수정 버튼 탐색 (다양한 selector 시도)
    const editBtnSelectors = [
      page.getByTestId('slip-collab-edit-open'),
      page.getByRole('button', { name: '협업 수정', exact: true }),
      page.locator('button').filter({ hasText: /^협업 수정$/ }).first(),
    ]

    let editBtn = null
    for (const sel of editBtnSelectors) {
      const visible = await sel.isVisible({ timeout: 3_000 }).catch(() => false)
      if (visible) {
        editBtn = sel
        break
      }
    }

    if (editBtn) {
      // 수정 버튼 영역 캡처
      await capture(page, 'edit-button')

      // ④ 편집 모드 진입
      await editBtn.click()
      await page.waitForTimeout(800)
      await capture(page, 'edit-mode')

      // ⑤ 메모 필드 수정
      const memoSelectors = [
        page.getByTestId('slip-collab-edit-memo'),
        page.getByLabel('메모 수정값'),
        page.locator('input[placeholder*="메모"]'),
        page.locator('textarea[placeholder*="메모"]'),
        page.getByTestId('slip-collab-edit-form').locator('input, textarea').first(),
      ]

      for (const memoSel of memoSelectors) {
        const visible = await memoSel.isVisible({ timeout: 2_000 }).catch(() => false)
        if (visible) {
          await memoSel.clear()
          await memoSel.fill('실 QA 수정 — 수정완료 1인 모델 검증')
          break
        }
      }

      // 사유 입력
      const reasonSelectors = [
        page.getByTestId('slip-collab-edit-reason'),
        page.getByLabel('수정 사유'),
        page.locator('input[placeholder*="사유"]'),
        page.locator('textarea[placeholder*="사유"]'),
      ]

      for (const reasonSel of reasonSelectors) {
        const visible = await reasonSel.isVisible({ timeout: 2_000 }).catch(() => false)
        if (visible) {
          await reasonSel.fill('PR #474 §7 실 QA 검증')
          break
        }
      }

      await page.waitForTimeout(500)
      await capture(page, 'edit-filled')

      // ⑥ 수정완료 클릭
      const commitBtnSelectors = [
        page.getByTestId('slip-collab-edit-submit'),
        page.getByRole('button', { name: '수정완료' }),
        page.locator('button').filter({ hasText: '수정완료' }).first(),
        page.locator('button[type="submit"]').first(),
      ]

      for (const commitSel of commitBtnSelectors) {
        const visible = await commitSel.isVisible({ timeout: 2_000 }).catch(() => false)
        if (visible) {
          await commitSel.click()
          break
        }
      }
      await page.waitForTimeout(1_500)
      await capture(page, 'edit-commit')

    } else {
      console.warn('[WARN] 수정 버튼 미발견 — 협업 패널 전체 캡처로 대체')
      await capture(page, 'edit-button-not-found')
    }

    // ⑦ 수정 이력 diff 뷰
    await page.waitForTimeout(1_000)
    await capture(page, 'diff-history')

    // ⑧ 코멘트 입력 폼
    const commentInputSelectors = [
      page.getByTestId('slip-collab-comment-input'),
      page.locator('textarea[placeholder*="코멘트"]'),
      page.locator('input[placeholder*="코멘트"]'),
      page.locator('[data-testid*="comment"] input, [data-testid*="comment"] textarea').first(),
    ]

    let commentInput = null
    for (const sel of commentInputSelectors) {
      const visible = await sel.isVisible({ timeout: 2_000 }).catch(() => false)
      if (visible) {
        commentInput = sel
        break
      }
    }

    if (commentInput) {
      await commentInput.fill('PR #474 §7 실 QA — 수정완료 1인 모델 검증 코멘트')
      await page.waitForTimeout(400)
      await capture(page, 'comment-input')

      // 등록 버튼
      const regBtnSelectors = [
        page.getByTestId('slip-collab-comment-submit'),
        page.getByRole('button', { name: '등록' }),
        page.locator('button').filter({ hasText: '등록' }).first(),
      ]

      for (const regSel of regBtnSelectors) {
        const visible = await regSel.isVisible({ timeout: 2_000 }).catch(() => false)
        if (visible) {
          await regSel.click()
          break
        }
      }
      await page.waitForTimeout(1_500)
      await capture(page, 'comment-posted')
    } else {
      console.warn('[WARN] 코멘트 입력 폼 미발견')
      await capture(page, 'comment-input-not-found')
    }
  })
})
