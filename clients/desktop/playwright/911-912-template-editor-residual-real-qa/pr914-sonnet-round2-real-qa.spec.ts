import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** PR #914 OPUS 재수렴 라운드 fix — SONNET5 라이브 QA 하네스(round2).
 *
 * 두 발견(같은 뿌리 — docType=''을 1급 상태로 다루지 못함)을 실서버·실 렌더러(HashRouter, :5195)에서
 * 4경로로 확인한다:
 *   ① 신규·유형 미선택 상태의 필드 목록 문구·저장 안내 문구
 *   ② 유형=지출결의서→필드 추가→금액 바인딩→유형을 다시 미선택으로 되돌려도 "사용할 수 없는"으로
 *      뒤집히지 않는다(가장 나쁜 경로 — 정상 바인딩 손실 위험)
 *   ③ 유형 선택 후 저장 201 → 재진입 시 유형 보존·읽기전용(F-7 회귀 확인)
 *   ④ 유형은 선택했는데 필드가 정말 0개인 양식은 ①과 다른 문구를 보인다
 *
 * 실제 게이트웨이와 groupware_db에 마커 throwaway DRAFT만 생성한다(document_templates). 공유 실 템플릿
 * (지출결의서·휴가신청서 활성 양식, approval_templates 마스터 데이터)은 절대 수정/비활성화/삭제하지
 * 않는다 — ④는 #848 라운드가 남긴 기존 실 데이터(approval_templates.code=LIVEQA848_..., active=true,
 * 필드 0개)를 읽기전용으로 재사용한다(내가 새로 만들지 않았고 수정하지도 않는다).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5195'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const MARKER = 'PR914-SONNET-R2-20260724'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '914-sonnet-round2-2026-07-23'))
mkdirSync(SHOT_DIR, { recursive: true })

interface LoginResult {
  token: string
  userId: string
  role: string
  displayName: string
}

function syncCleanup(): void {
  try {
    execFileSync('docker', [
      'exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'groupware_db', '-c',
      `UPDATE document_templates SET is_deleted = true WHERE name LIKE '${MARKER}%' AND is_deleted = false;`,
    ], { encoding: 'utf8', timeout: 10_000 })
  } catch (error) {
    console.warn(`동기 throwaway 정리 실패: ${String(error)}`)
  }
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

test('경로① 라이브 — 신규·유형 미선택 상태의 필드 목록 문구·저장 안내 문구', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  try {
    await openNewEditor(page)
    await page.getByLabel('양식명').fill(`${MARKER}-path1`)
    await page.getByRole('button', { name: '필드 추가' }).click()

    // P-1 — "모른다"(문서 유형 미선택)를 말하는 문구여야 하고, ④(정말 0개)의 문구와 달라야 한다.
    const binding = page.getByRole('combobox', { name: '표시할 값' })
    await expect(binding.locator('option[value=""]')).toHaveText('본문 필드(문서 유형을 먼저 선택하세요)')

    // P-4 — 저장이 막힌 이유가 "envelope" 내부 용어가 아니라 사용자의 말로 와야 한다.
    await expect(page.getByRole('alert').filter({ hasText: '문서 유형을 선택해야 저장할 수 있습니다.' })).toBeVisible()
    await expect(page.getByText('envelope')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()

    await page.screenshot({ path: join(SHOT_DIR, '01-신규-유형미선택-필드목록및저장안내.png'), fullPage: true })
  } finally {
    syncCleanup()
  }
})

test('경로② 라이브 — 정상 바인딩(금액) 후 유형을 다시 미선택으로 되돌려도 "사용할 수 없는"으로 뒤집히지 않는다', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  try {
    await openNewEditor(page)
    await page.getByLabel('양식명').fill(`${MARKER}-path2`)
    const docType = page.getByLabel(/^문서 유형/)
    await docType.selectOption('GROUPWARE_EXPENSE_REPORT')

    await page.getByRole('button', { name: '필드 추가' }).click()
    const binding = page.getByRole('combobox', { name: '표시할 값' })
    await expect(binding.locator('option[value="body.fieldRow[amount]"]')).toHaveCount(1, { timeout: 15_000 })
    await binding.selectOption('body.fieldRow[amount]')
    await expect(binding.locator('option[value="body.fieldRow[amount]"]')).toHaveText('본문 필드 · 금액')
    await page.screenshot({ path: join(SHOT_DIR, '02a-유형선택-금액바인딩-정상.png'), fullPage: true })

    // 핵심 재현 — "유형을 다시 미선택으로 되돌림"은 disabled 옵션이 아니라 정상 선택 가능한 조작이다.
    await docType.selectOption('')

    // P-2/P-3 — 이미 저장된 정상 바인딩(금액)이 "사용할 수 없는"으로 뒤집히지 않고, 이행 불가능한
    // "목록에서 실제 필드를 선택하세요" 지시도 뜨지 않는다.
    await expect(binding.locator('option[value="body.fieldRow[amount]"]')).not.toContainText('사용할 수 없는')
    await expect(binding.locator('option[value="body.fieldRow[amount]"]')).toHaveText('본문 필드 · amount(문서 유형 미선택)')
    await expect(page.getByText('현재 양식에서 선택할 수 없는 본문 필드 참조입니다')).toHaveCount(0)
    await page.screenshot({ path: join(SHOT_DIR, '02b-유형미선택복귀-금액바인딩-유지.png'), fullPage: true })
  } finally {
    syncCleanup()
  }
})

test('경로③ 라이브 — 유형 선택 후 저장 201, 재진입 시 유형 보존·읽기전용(F-7 회귀 확인)', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  try {
    await openNewEditor(page)
    await page.getByLabel('양식명').fill(`${MARKER}-path3`)
    await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_LEAVE_REQUEST')

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/admin/groupware/document-templates') && res.request().method() === 'POST'),
      page.getByRole('button', { name: '저장' }).click(),
    ])
    expect(response.status(), `저장 실패 — HTTP ${response.status()}`).toBe(201)
    await expect(page.getByText('저장된 상태입니다.')).toBeVisible()
    await page.screenshot({ path: join(SHOT_DIR, '03a-저장성공-201.png'), fullPage: true })

    await page.reload()
    await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
    const docTypeInput = page.getByLabel('문서 유형(생성 후 변경 불가)')
    await expect(docTypeInput).toHaveValue('GROUPWARE_LEAVE_REQUEST')
    await expect(docTypeInput).toBeDisabled()
    await page.screenshot({ path: join(SHOT_DIR, '03b-재진입-유형보존-읽기전용.png'), fullPage: true })
  } finally {
    syncCleanup()
  }
})

test('경로④ 라이브 — 유형은 선택했는데 필드가 정말 0개인 양식은 ①과 다른 문구를 보인다', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  try {
    await openNewEditor(page)
    await page.getByLabel('양식명').fill(`${MARKER}-path4`)
    // 실측(2026-07-24, groupware_db.approval_templates) — code=LIVEQA848_...(active=true, 필드 0개).
    // #848 라운드가 남긴 기존 실 데이터를 읽기전용으로 재사용한다.
    await page.getByLabel(/^문서 유형/).selectOption({ label: 'LiveQA848 overflow verify' })

    await page.getByRole('button', { name: '필드 추가' }).click()
    const binding = page.getByRole('combobox', { name: '표시할 값' })
    // ready(조회 완료) + 정말 빈 배열 — ①(unselected)과 다른 문구여야 한다.
    await expect(binding.locator('option[value=""]')).toHaveText('본문 필드(현재 양식 필드 없음)', { timeout: 15_000 })
    await expect(binding.locator('option[value=""]')).not.toHaveText('본문 필드(문서 유형을 먼저 선택하세요)')

    await page.screenshot({ path: join(SHOT_DIR, '04-유형선택-정말0개-다른문구.png'), fullPage: true })
  } finally {
    syncCleanup()
  }
})
