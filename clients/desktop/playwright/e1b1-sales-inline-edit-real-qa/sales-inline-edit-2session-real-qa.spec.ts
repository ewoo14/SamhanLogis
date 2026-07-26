import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * E1-b-1 매출 전표 상세 품목행 인라인 편집 — 실서버 2세션 coedit GUI QA.
 *
 * 검증: (1) '수정' 클릭 시 인라인 편집 폼이 auto-scroll 로 뷰에 들어오고 accent 신호 표시(구 모달 대체),
 *      (2) 라이브 coedit 보존 — 세션A 가 인라인 편집 필드 입력 → 세션B 가 SSE 로 동일 값 수신.
 * 실 게이트웨이 :8080 · mock OFF · dev_master · DRAFT/SAVED 매출(OUTBOUND) 실 슬립. 합성 없음.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? ''
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e1b1-sales-inline-edit'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string, fullPage = false): Promise<void> {
  shotNo++
  await page.screenshot({ path: path.join(SHOTS, `gui-${String(shotNo).padStart(2, '0')}-${name}.png`), fullPage })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  expect(PASSWORD, 'DEV_PASSWORD 환경변수 필수').toBeTruthy()
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

async function openSalesInlineEdit(page: Page, slipId: string): Promise<void> {
  await page.goto(`${BASE_URL}/#/sales/${slipId}`)
  await page.waitForSelector('[data-testid="slip-detail-revision-count"]', { timeout: 30000 })
  await page.getByTestId('sales-slip-edit-button').click()
  await page.waitForSelector('[data-testid="sales-slip-edit-modal"]', { timeout: 15000 })
  await page.waitForTimeout(1200) // auto-scroll effect + coedit provider seed
}

function memoField(page: Page) {
  return page.getByTestId('slip-coedit-field-header-memo').locator('textarea, input').first()
}

test('E1-b-1 매출 인라인 편집 — auto-scroll + 2세션 coedit(A입력→B SSE 수신)', async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pageA = await ctxA.newPage()
  const loginA = await realLogin(pageA, 'dev_master')
  await installAuthStub(pageA, loginA)

  // DRAFT/SAVED 매출(OUTBOUND) 슬립 1건(linesEditable).
  const listRes = await pageA.request.get(`${API_BASE}/api/v1/slips?page=0&size=100`, {
    headers: { Authorization: `Bearer ${loginA.token}` },
  })
  expect(listRes.ok(), `슬립 리스트 HTTP ${listRes.status()}`).toBeTruthy()
  const content = (await listRes.json()).data?.content ?? []
  const editable = content.find(
    (s: { status?: string; slipType?: string }) =>
      (s.status === 'DRAFT' || s.status === 'SAVED') && (!s.slipType || s.slipType === 'OUTBOUND'),
  )
  expect(editable, 'DRAFT/SAVED 매출 전표 최소 1건 필요').toBeTruthy()
  const slipId: string = editable.id

  // 세션A: 매출 상세 → '수정' → 인라인 편집(auto-scroll + accent).
  await openSalesInlineEdit(pageA, slipId)
  await expect(pageA.getByTestId('sales-slip-edit-modal')).toBeVisible()
  // auto-scroll 로 인라인 폼이 뷰포트 안에 들어왔는지(상단 근처).
  const boxA = await pageA.getByTestId('sales-slip-edit-modal').boundingBox()
  expect(boxA, '인라인 폼 boundingBox').not.toBeNull()
  if (boxA) expect(boxA.y, 'auto-scroll 후 폼 상단이 뷰포트 상단 근처').toBeLessThan(400)
  await capture(pageA, 'sessionA-inline-edit-autoscroll-accent')

  // 세션A: 협업 메모(coedit) 입력.
  const marker = `E1B1-COEDIT-${loginA.userId.slice(0, 6)}`
  const memoA = memoField(pageA)
  await memoA.click()
  await memoA.fill(marker)
  await pageA.waitForTimeout(900) // coedit local→provider→SSE 전파
  await capture(pageA, 'sessionA-memo-coedit-input')

  // 세션B: 동일 슬립 인라인 편집 진입 → A 의 coedit 값 SSE 수신 확인.
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pageB = await ctxB.newPage()
  await installAuthStub(pageB, await realLogin(pageB, 'dev_master'))
  await openSalesInlineEdit(pageB, slipId)
  const memoB = memoField(pageB)
  await expect
    .poll(async () => (await memoB.inputValue()).includes(marker), { timeout: 15000, intervals: [500, 1000, 2000] })
    .toBe(true)
  await capture(pageB, 'sessionB-coedit-sse-received')

  await ctxA.close()
  await ctxB.close()
})
