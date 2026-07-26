import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * §7 슬라이스1 회계전표(Journal) 협업 "수정완료 1-인" 모델 — 실 서버 QA 스크린샷 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 * - VITE_MOCK_MODE 완전 OFF — 실 게이트웨이 http://127.0.0.1:8080 직접 연결.
 * - window.samhanAuth stub 으로 Electron IPC 없이 실 JWT 주입.
 * - 실 시드 POSTED 분개 2026/02/10-1 (제품매출 분개) 대상.
 *
 * 실행:
 *   cd C:\dev\Samhan-Public\clients\desktop
 *   별도 터미널: npx vite src/renderer --host 127.0.0.1 --port 5176 (VITE_MOCK_MODE 미설정)
 *   node_modules/.bin/playwright test --config playwright/journal-edit-collab-real-qa/playwright.config.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5176'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

/** 실 시드 POSTED 분개 (2026/01/31-1 급여 판관비) — 미편집 초기 상태 캡처용 */
const JOURNAL_ID = '4e60aa22-c45a-3a4e-9f0c-f7a3c5b9d6e1'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/journal-edit-collab'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let screenshotCounter = 0
async function capture(page: Page, name: string): Promise<void> {
  screenshotCounter++
  const num = String(screenshotCounter).padStart(2, '0')
  const filePath = path.join(SCREENSHOT_DIR, `${num}-${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`[CAPTURE] ${filePath}`)
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' })
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
            resolve(JSON.parse(data).data.token as string)
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

async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const urlObj = new URL(route.request().url())
    const realUrl = `${GW_URL}${urlObj.pathname}${urlObj.search}`
    const filteredHeaders: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) {
      if (name.toLowerCase() !== 'host') filteredHeaders[name] = value
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

const IDLE_TIMEOUT = 8_000
const SETTLE_WAIT = 1_500
async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
  await page.waitForTimeout(SETTLE_WAIT)
}

test.describe('§7 슬라이스1 회계전표 협업 실 QA — 수정완료 1-인 모델', () => {
  let realToken = ''

  test.beforeAll(async () => {
    realToken = await fetchRealToken()
    console.log(`[AUTH] 실 JWT 획득 (${realToken.slice(0, 24)}...)`)
  })

  test('목록 → 상세 → 수정완료 → diff → 코멘트', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    // ① 분개 목록
    await gotoAndSettle(page, `${BASE_URL}/#/accounting/journals?mockRole=MASTER`)
    await capture(page, 'journal-list')

    // ② 분개 상세 (협업 패널 포함)
    await gotoAndSettle(page, `${BASE_URL}/#/accounting/journals/${JOURNAL_ID}?mockRole=MASTER`)
    await page.getByTestId('journal-collaboration-panel').scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(800)
    await capture(page, 'journal-detail')

    // ③ 수정 버튼
    const editBtn = page.getByTestId('journal-collab-edit-open')
    await editBtn.scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'edit-button')

    // ④ 편집 모드
    await editBtn.click()
    await page.waitForTimeout(800)
    await page.getByTestId('journal-collab-edit-form').scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'edit-mode')

    // ⑤ 적요 + 라인메모 + 사유 입력
    await page.getByLabel('적요 수정값').fill('실서버 QA — 제품매출 적요 정정(수정완료 1-인)')
    await page.getByLabel('1번 라인 메모 수정값').fill('실서버 QA 라인메모 정정')
    await page.getByLabel('수정 사유').fill('실서버 QA 검증 — 수정완료 즉시 커밋')
    await page.waitForTimeout(400)
    await capture(page, 'edit-filled')

    // ⑥ 수정완료
    await page.getByRole('button', { name: '수정완료' }).click()
    await page.waitForTimeout(1500)
    await capture(page, 'edit-commit')

    // ⑦ 수정 이력 — 개발책임자 결정1(2026-07-06, #31 재확인)로 changeSet diff(before→after)
    //    목록이 복구됐다(버전이력 아님 — 회계 분개는 revision/restore API 미보유).
    await page.getByTestId('journal-collab-edit-history-panel').scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(400)
    await capture(page, 'edit-history')

    // ⑧ 코멘트 연결 필드(anchor) 선택 — 결정2 anchor 생성 UX.
    const anchorSelect = page.getByTestId('journal-collab-comment-anchor-select')
    await anchorSelect.scrollIntoViewIfNeeded().catch(() => {})
    await anchorSelect.selectOption('description')
    await page.waitForTimeout(300)
    await capture(page, 'comment-anchor-select')

    // ⑨ 코멘트 입력
    const commentInput = page.getByTestId('journal-collab-comment-input')
    await commentInput.scrollIntoViewIfNeeded().catch(() => {})
    await commentInput.fill('실서버 QA 협업 코멘트 — 적요 정정 확인 부탁드립니다')
    await page.waitForTimeout(400)
    await capture(page, 'comment-input')

    // ⑩ 코멘트 등록 → anchor(적요) 클릭 시 수정 이력 diff 와 하이라이트 공유(결정2 양방향).
    await page.getByRole('button', { name: '등록' }).click()
    await page.waitForTimeout(1200)
    await capture(page, 'comment-posted')

    await page.getByTestId('journal-collab-comment-item').first().click()
    await page.waitForTimeout(300)
    await capture(page, 'comment-anchor-highlight')
  })
})
