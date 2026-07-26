import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 미리보기 표준화 슬라이스2 — 그룹웨어 결재문서 인쇄 미리보기 실 QA 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 *
 * 검증 시나리오:
 *   A1: 실 그룹웨어 결재 1건을 동적으로 조회한 뒤 인쇄뷰 진입, 결재문서 골격/제목/결재란 렌더 확인.
 *   A2: 같은 인쇄뷰에서 작성자 또는 결재자 이름 최소 1개와 품의 인삿말 렌더 확인.
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test \
 *     playwright/approval-doc-print-preview/approval-doc-print-preview-real-qa.spec.ts \
 *     --config playwright.real-qa.config.ts --reporter=line
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'
import * as http from 'http'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/approval-doc-print-preview'))

interface ApiEnvelope<T> {
  data: T
}

interface ApprovalStepView {
  sequence: number
  approverName: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  decidedAt: string | null
}

interface ApprovalLineAdminResponse {
  approvalId: string
  title: string
  requesterName: string | null
  steps: ApprovalStepView[]
}

let seq = 0
async function capture(page: Page, name: string): Promise<string> {
  seq++
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const file = path.join(SCREENSHOT_DIR, `${String(seq).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log('[CAPTURE]', file)
  return file
}

function hashUrl(p: string): string {
  return `${BASE_URL}/#${p}`
}

function krDateForQa(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[1]}년 ${m[2]}월 ${m[3]}일`
}

function finalDecidedAtForQa(steps: ApprovalStepView[]): string | undefined {
  const decided = steps
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .filter((step) => step.status === 'APPROVED' && Boolean(step.decidedAt))
  const last = decided.length > 0 ? decided[decided.length - 1] : undefined
  return last?.decidedAt ?? undefined
}

async function fetchRealToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' })
    const req = http.request(
      {
        hostname: '127.0.0.1', port: 8080,
        path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let d = ''
        res.on('data', (c) => { d += c })
        res.on('end', () => {
          try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token parse: ' + d)) }
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function fetchFirstApproval(token: string): Promise<ApprovalLineAdminResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1', port: 8080,
        path: '/admin/groupware/approvals',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let d = ''
        res.on('data', (c) => { d += c })
        res.on('end', () => {
          try {
            const body = JSON.parse(d) as ApiEnvelope<ApprovalLineAdminResponse[]>
            const first = body.data[0]
            if (!first?.approvalId) {
              reject(new Error('approval list empty: ' + d))
              return
            }
            resolve(first)
          } catch {
            reject(new Error('approval list parse: ' + d))
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function fetchMultiStepApprovedApproval(token: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1', port: 8080,
        path: '/admin/groupware/approvals',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let d = ''
        res.on('data', (c) => { d += c })
        res.on('end', () => {
          try {
            const body = JSON.parse(d) as ApiEnvelope<ApprovalLineAdminResponse[]>
            const approval = body.data.find((item) =>
              item.steps.length >= 2
              && item.steps.some((step) => step.status === 'APPROVED' && Boolean(step.decidedAt)),
            )
            resolve(approval?.approvalId ?? null)
          } catch {
            reject(new Error('multi-step approval list parse: ' + d))
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function fetchApprovalById(token: string, approvalId: string): Promise<ApprovalLineAdminResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1', port: 8080,
        path: `/admin/groupware/approvals/${encodeURIComponent(approvalId)}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let d = ''
        res.on('data', (c) => { d += c })
        res.on('end', () => {
          try {
            const body = JSON.parse(d) as ApiEnvelope<ApprovalLineAdminResponse>
            resolve(body.data)
          } catch {
            reject(new Error('approval detail parse: ' + d))
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ({ t, userId, role, displayName }: { t: string; userId: string; role: string; displayName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: t, userId, role, displayName, fullName: displayName }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME },
  )
}

async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname.endsWith('/collab/stream') || u.pathname.endsWith('/notifications/stream')) {
      await route.abort()
      return
    }
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
    } catch (err) {
      console.error('[PROXY]', realUrl, err)
      await route.abort()
    }
  })
}

async function suppressPrint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.print = () => { console.log('[TEST] window.print() intercepted') }
  })
}

test.describe('미리보기 표준화 슬라이스2 — 그룹웨어 결재문서 인쇄 미리보기 실 QA', () => {
  let token = ''
  let approval: ApprovalLineAdminResponse

  test.beforeAll(async () => {
    token = await fetchRealToken()
    approval = await fetchFirstApproval(token)
  })

  test.beforeEach(async ({ page }) => {
    await installRealAuth(page, token)
    await setupApiProxy(page, token)
    await suppressPrint(page)
  })

  test('A1: 실 그룹웨어 결재 1건 인쇄뷰 — 제목과 결재란 렌더', async ({ page }) => {
    const url = hashUrl(`/groupware/approvals/${approval.approvalId}/print`)
    console.log('[NAVIGATE]', url)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(2500)

    await capture(page, 'a1-approval-doc-print-full')

    const bodyText = await page.locator('body').textContent() ?? ''
    console.log('[BODY SAMPLE]', bodyText.slice(0, 400).replace(/\s+/g, ' '))

    expect(bodyText).not.toContain('불러오지 못')
    const approvalDoc = page.locator('.print-approval-doc')
    await expect(approvalDoc).toBeVisible()
    await expect(approvalDoc.getByRole('heading', { name: approval.title })).toBeVisible()
    await expect(approvalDoc.getByLabel('전자서명 결재란')).toBeVisible()
  })

  test('A2: 실 그룹웨어 결재 1건 인쇄뷰 — 작성/결재자 이름과 품의 인삿말 렌더', async ({ page }) => {
    const url = hashUrl(`/groupware/approvals/${approval.approvalId}/print`)
    console.log('[NAVIGATE]', url)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(2500)

    await capture(page, 'a2-approval-doc-print-approval-line')

    const bodyText = await page.locator('body').textContent() ?? ''
    const approvalName = [...approval.steps.map((step) => step.approverName), approval.requesterName]
      .find((name): name is string => Boolean(name?.trim()))

    expect(bodyText).not.toContain('불러오지 못')
    if (!approvalName) throw new Error('작성자/결재자 이름이 있는 실 결재 문서가 필요합니다.')
    const approvalDoc = page.locator('.print-approval-doc')
    // 결재란 이름 칸(.print-approval-name, 화면 visible) 중 해당 이름을 가진 칸으로 한정 — strict-mode 회피.
    const approvalNameCell = approvalDoc
      .locator('.print-approval-section .print-approval-name')
      .filter({ hasText: approvalName })
    await expect(approvalNameCell.first()).toBeVisible()
    // 인삿말(closingNote) 은 화면 visible.
    await expect(approvalDoc.locator('.print-approval-closing')).toContainText('재가')
  })

  test('A3: 다단계 승인 결재 인쇄뷰 — 합의/결재 라벨 + 발행일(최종 승인일) 렌더', async ({ page }) => {
    const multiStepApprovalId = await fetchMultiStepApprovedApproval(token)
    if (!multiStepApprovalId) {
      test.skip(true, '다단계 승인 결재 실 시드가 없습니다.')
      return
    }
    const multiStepApproval = await fetchApprovalById(token, multiStepApprovalId)
    const finalDecidedAt = finalDecidedAtForQa(multiStepApproval.steps)
    if (!finalDecidedAt) {
      test.skip(true, '승인일이 있는 다단계 결재 실 시드가 없습니다.')
      return
    }

    const url = hashUrl(`/groupware/approvals/${multiStepApprovalId}/print`)
    console.log('[NAVIGATE]', url)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(2500)

    await capture(page, 'a3-approval-doc-multi-step-approved')

    const bodyText = await page.locator('body').textContent() ?? ''
    expect(bodyText).not.toContain('불러오지 못')
    const approvalDoc = page.locator('.print-approval-doc')
    await expect(approvalDoc).toBeVisible()

    await expect(approvalDoc.locator('.print-approval-label', { hasText: '작성' }).first()).toBeVisible()
    await expect(approvalDoc.locator('.print-approval-label', { hasText: '합의' }).first()).toBeVisible()
    await expect(approvalDoc.locator('.print-approval-label', { hasText: '결재' }).first()).toBeVisible()

    const docMeta = approvalDoc.locator('.print-approval-doc-meta')
    await expect(docMeta).toContainText('발행일')
    await expect(docMeta).toContainText(krDateForQa(finalDecidedAt))

    const finalDecisionDateText = finalDecidedAt.slice(0, 10).replace(/-/g, '/')
    await expect(approvalDoc.locator('.print-approval-name time', { hasText: finalDecisionDateText }).first()).toBeVisible()
  })
})
