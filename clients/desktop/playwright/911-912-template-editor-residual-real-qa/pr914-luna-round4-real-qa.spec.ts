import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** PR #914 CODEX LUNA 5.6 — residual envelope validation live QA (5195). */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5195'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const MARKER = 'PR914-LUNA-R4-20260724'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '914-luna-round4-2026-07-24'))
mkdirSync(SHOT_DIR, { recursive: true })

interface LoginResult {
  token: string
  userId: string
  role: string
  displayName: string
}

function syncCleanup(): void {
  execFileSync('docker', [
    'exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'groupware_db', '-c',
    `UPDATE document_templates SET is_deleted = true WHERE name LIKE '${MARKER}%' AND is_deleted = false;`,
  ], { encoding: 'utf8', timeout: 10_000 })
}

async function login(page: Page): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(response.ok(), `실서버 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data ?? {}
  return {
    token: data.token ?? '',
    userId: data.userId ?? '',
    role: data.role ?? 'MASTER',
    displayName: data.displayName ?? '개발책임자',
  }
}

async function installAuth(page: Page, auth: LoginResult): Promise<void> {
  await page.addInitScript((value: LoginResult) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...value, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
}

async function openNewEditor(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${BASE_URL}/#/groupware/document-templates/new/edit`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  syncCleanup()
  await installAuth(page, await login(page))
})

test.afterEach(() => {
  syncCleanup()
})

test('LUNA-① 신규 양식명 공백·유형 미선택은 문서 유형 안내를 표시한다', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel('양식명').fill('')
  await page.getByRole('button', { name: '필드 추가' }).click()

  await expect(page.getByRole('alert')).toContainText('문서 유형을 선택해야 저장할 수 있습니다.')
  await expect(page.getByText('envelope')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  await page.screenshot({ path: join(SHOT_DIR, '01-양식명공백-유형미선택-문서유형안내.png'), fullPage: true })
})

test('LUNA-② 양식명 공백에서 지출결의서 선택 후에도 양식명 안내를 유지한다', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel('양식명').fill('')
  await page.getByRole('button', { name: '필드 추가' }).click()
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')

  await expect(page.getByRole('alert')).toContainText('양식명을 입력해야 저장할 수 있습니다.')
  await expect(page.getByText('envelope')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  await page.screenshot({ path: join(SHOT_DIR, '02-양식명공백-지출결의서선택-양식명안내.png'), fullPage: true })
})

test('LUNA-③ 양식명을 채우고 유형을 선택하면 저장이 활성화되고 POST 201이 된다', async ({ page }) => {
  const auth = await login(page)
  await openNewEditor(page)
  await page.getByLabel('양식명').fill(`${MARKER}-save`)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()
  await page.screenshot({ path: join(SHOT_DIR, '03-양식명입력-지출결의서선택-저장활성.png'), fullPage: true })

  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/admin/groupware/document-templates') && res.request().method() === 'POST'),
    page.getByRole('button', { name: '저장' }).click(),
  ])
  expect(response.status(), `저장 실패 — HTTP ${response.status()}`).toBe(201)
  await expect(page.getByText('저장된 상태입니다.')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, '04-POST201-저장완료.png'), fullPage: true })

  await page.reload()
  const docTypeInput = page.getByLabel('문서 유형(생성 후 변경 불가)')
  await expect(docTypeInput).toHaveValue('GROUPWARE_EXPENSE_REPORT')
  await expect(docTypeInput).toBeDisabled()

  const id = page.url().match(/document-templates\/([^/]+)\/edit/)?.[1]
  expect(id, '저장 후 문서 양식 ID가 URL에 있어야 한다').toBeTruthy()
  await page.getByLabel('양식명').fill(`${MARKER}-save-updated`)
  const [updateResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes(`/admin/groupware/document-templates/${id}`) && res.request().method() === 'PUT'),
    page.getByRole('button', { name: '저장' }).click(),
  ])
  expect(updateResponse.status(), `편집 저장 실패 — HTTP ${updateResponse.status()}`).toBe(200)

  const activateResponse = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/activate`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  })
  expect(activateResponse.status(), `활성화 실패 — HTTP ${activateResponse.status()}`).toBe(200)
  await page.screenshot({ path: join(SHOT_DIR, '05-PUT200-활성화POST200.png'), fullPage: true })
})

test('LUNA-④ F-3 미선택·조회중·조회실패·필드0개를 서로 다른 문구로 구별하고 실패 후 회복한다', async ({ page }) => {
  await openNewEditor(page)
  await page.getByRole('button', { name: '필드 추가' }).click()
  const binding = page.getByRole('combobox', { name: '표시할 값' })

  await expect(binding.locator('option[value=""]')).toHaveText('본문 필드(문서 유형을 먼저 선택하세요)')
  await page.screenshot({ path: join(SHOT_DIR, '06-F3-미선택.png'), fullPage: true })

  let releaseLoading!: () => void
  const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve })
  await page.route('**/admin/groupware/approval-templates', async (route) => {
    await loadingGate
    await route.continue()
  })
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await expect(page.getByText('본문 필드 목록을 확인하는 중입니다')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, '07-F3-조회중.png'), fullPage: true })
  releaseLoading()
  await expect(binding.locator('option[value="body.fieldRow[amount]"]')).toHaveCount(1, { timeout: 15_000 })
  await page.unroute('**/admin/groupware/approval-templates')

  await page.route('**/admin/groupware/approval-templates', (route) => route.abort('failed'))
  await page.reload()
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByRole('button', { name: '필드 추가' }).click()
  await expect(page.getByRole('alert')).toContainText('본문 필드 목록을 불러오지 못했습니다.')
  await page.screenshot({ path: join(SHOT_DIR, '08-F3-조회실패.png'), fullPage: true })

  await page.unroute('**/admin/groupware/approval-templates')
  await page.getByRole('button', { name: '다시 시도' }).click()
  const recoveredBinding = page.getByRole('combobox', { name: '표시할 값' }).last()
  await expect(recoveredBinding.locator('option[value="body.fieldRow[amount]"]')).toHaveCount(1, { timeout: 15_000 })
  await page.screenshot({ path: join(SHOT_DIR, '09-F3-실패후회복.png'), fullPage: true })

  await page.getByLabel(/^문서 유형/).selectOption({ label: 'LiveQA848 overflow verify' })
  await page.getByRole('button', { name: '필드 추가' }).click()
  await expect(page.getByRole('combobox', { name: '표시할 값' }).last().locator('option[value=""]'))
    .toHaveText('본문 필드(현재 양식 필드 없음)', { timeout: 15_000 })
  await page.screenshot({ path: join(SHOT_DIR, '10-F3-필드0개.png'), fullPage: true })
})
