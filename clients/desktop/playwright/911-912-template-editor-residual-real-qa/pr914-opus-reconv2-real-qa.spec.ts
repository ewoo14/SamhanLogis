import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #914 OPUS 재수렴(2차) 적대검증 라이브 QA — 실서버 5195 / API 8080.
 *
 * 단일 질문: 실 사용자 경로로 재현 가능한 결함이 있는가.
 * 공유 실 데이터(approval_templates 지출결의서·휴가신청서, approval_lines 실 결재문서)는 읽기 전용으로만
 * 쓰고, 생성한 문서 양식은 마커 접두사 + 동기 soft-delete 로 원상 복구한다.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5195'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const MARKER = 'OPUSRECONV2-914-20260724'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '914-opus-reconv2-2026-07-24'))
/** #848 라운드 잔재(실 데이터, schemaVersion=1, ACTIVE) — 읽기 전용으로만 연다. */
const LEGACY_V1_TEMPLATE_ID = '31b97122-3a59-467c-901f-4bc375aaa811'
/** 실 결재문서(지출결의서, 5필드 전부 값 있음). */
const REAL_APPROVAL_ID = 'd16da703-e914-4bd0-bdd2-43a715e6e418'

mkdirSync(SHOT_DIR, { recursive: true })

interface LoginResult {
  token: string
  userId: string
  role: string
  displayName: string
}

function psql(sql: string): string {
  return execFileSync('docker', [
    'exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'groupware_db', '-tAc', sql,
  ], { encoding: 'utf8', timeout: 15_000 }).trim()
}

function syncCleanup(): void {
  psql(`UPDATE document_templates SET status = 'DRAFT', is_deleted = true WHERE name LIKE '${MARKER}%' AND is_deleted = false;`)
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

async function openNewEditor(page: Page, width = 1600): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
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

test('O1 저장 흐름 전체 — 신규→유형→요소→저장201→재진입→편집 PUT200→활성화200→비활성화200', async ({ page }) => {
  const before = psql(`SELECT count(*) FROM document_templates WHERE doc_type='GROUPWARE_LEAVE_REQUEST' AND status='ACTIVE' AND is_deleted=false;`)
  expect(before, '시작 전 휴가신청서 활성 문서양식은 0이어야 한다').toBe('0')

  await openNewEditor(page)
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  await page.getByRole('button', { name: '문구 추가' }).click()
  await expect(page.getByRole('alert')).toContainText('문서 유형을 선택해야 저장할 수 있습니다.')
  await page.screenshot({ path: join(SHOT_DIR, 'O1-01-신규-유형미선택-저장차단.png'), fullPage: true })

  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_LEAVE_REQUEST')
  await page.getByLabel('양식명').fill(`${MARKER}-flow`)
  await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()

  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/admin/groupware/document-templates') && r.request().method() === 'POST'),
    page.getByRole('button', { name: '저장' }).click(),
  ])
  expect(created.status(), `신규 저장 실패 HTTP ${created.status()}`).toBe(201)
  await expect(page.getByText('저장된 상태입니다.')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'O1-02-POST201-저장완료.png'), fullPage: true })

  const id = page.url().match(/document-templates\/([^/]+)\/edit/)?.[1]
  expect(id, '저장 후 URL 에 양식 id 가 있어야 한다').toBeTruthy()

  await page.reload()
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
  const docTypeInput = page.getByLabel('문서 유형(생성 후 변경 불가)')
  await expect(docTypeInput).toHaveValue('GROUPWARE_LEAVE_REQUEST')
  await expect(docTypeInput).toBeDisabled()
  await expect(page.getByLabel('양식명')).toHaveValue(`${MARKER}-flow`)
  await page.screenshot({ path: join(SHOT_DIR, 'O1-03-재진입-유형읽기전용.png'), fullPage: true })

  await page.getByLabel('양식명').fill(`${MARKER}-flow-edited`)
  const [updated] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/admin/groupware/document-templates/${id}`) && r.request().method() === 'PUT'),
    page.getByRole('button', { name: '저장' }).click(),
  ])
  expect(updated.status(), `편집 저장 실패 HTTP ${updated.status()}`).toBe(200)
  await page.screenshot({ path: join(SHOT_DIR, 'O1-04-PUT200-편집저장.png'), fullPage: true })

  // 활성화·비활성화는 실제 사용자 경로(목록 화면 버튼)로 수행한다.
  await page.goto(`${BASE_URL}/#/groupware/document-templates`, { waitUntil: 'domcontentloaded' })
  const row = page.getByRole('row', { name: new RegExp(`${MARKER}-flow-edited`) })
  await expect(row).toBeVisible({ timeout: 30_000 })
  const [activated] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/activate') && r.request().method() === 'POST'),
    row.getByRole('button', { name: '활성화' }).click(),
  ])
  expect(activated.status(), `활성화 실패 HTTP ${activated.status()}`).toBe(200)
  await expect(page.getByRole('row', { name: new RegExp(`${MARKER}-flow-edited`) })).toContainText('사용 중')
  await page.screenshot({ path: join(SHOT_DIR, 'O1-05-활성화POST200.png'), fullPage: true })

  const [deactivated] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/deactivate') && r.request().method() === 'POST'),
    page.getByRole('row', { name: new RegExp(`${MARKER}-flow-edited`) }).getByRole('button', { name: '비활성화' }).click(),
  ])
  expect(deactivated.status(), `비활성화 실패 HTTP ${deactivated.status()}`).toBe(200)
  await expect(page.getByRole('row', { name: new RegExp(`${MARKER}-flow-edited`) })).toContainText('임시저장')
  await page.screenshot({ path: join(SHOT_DIR, 'O1-06-비활성화POST200.png'), fullPage: true })

  syncCleanup()
  const after = psql(`SELECT count(*) FROM document_templates WHERE doc_type='GROUPWARE_LEAVE_REQUEST' AND status='ACTIVE' AND is_deleted=false;`)
  expect(after, '정리 후 휴가신청서 활성 문서양식은 다시 0이어야 한다').toBe('0')
})

test('O2 기존 저장 양식(실 데이터 v1·ACTIVE) 재진입 — 갑자기 무효 판정되지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`${BASE_URL}/#/groupware/document-templates/${LEGACY_V1_TEMPLATE_ID}/edit`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })

  // 양성 단언 — 저장된 내용이 실제로 화면에 살아 있다.
  await expect(page.getByLabel('문서 유형(생성 후 변경 불가)')).toHaveValue(/GROUPWARE_LIVEQA848/)
  await expect(page.getByLabel('양식명')).toHaveValue(/LiveQA848/)
  await expect(page.getByRole('button', { name: '제목' }).first()).toBeVisible()
  await expect(page.getByText('사용 중인 양식은 직접 수정할 수 없습니다.')).toBeVisible()

  // 부재 단언 — 로드만 했는데 검증 오류가 뜨지 않는다(dirty 아님 → validationError 미표시가 정상).
  const alerts = await page.getByRole('alert').allTextContents()
  expect(alerts.join(' | '), `기존 양식 재진입에서 오류 문구가 떴다: ${alerts.join(' | ')}`)
    .not.toMatch(/확인하세요|입력해야|선택해야|처리에 실패/)
  await expect(page.getByText('저장된 상태입니다.')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'O2-01-기존v1양식-재진입-정상.png'), fullPage: true })
})

test('O3 메시지 유용성 — 양식명 길이 초과가 "입력해야"로 오도되는가', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')

  // 양성 대조 — 100자는 저장 가능(정상 판정).
  await page.getByLabel('양식명').fill(`${MARKER}`.padEnd(100, 'x'))
  await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()
  await page.screenshot({ path: join(SHOT_DIR, 'O3-01-양성대조-100자-저장활성.png'), fullPage: true })

  // 101자 — 저장 차단 + 화면 문구
  await page.getByLabel('양식명').fill(`${MARKER}`.padEnd(101, 'x'))
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  const message = await page.getByRole('alert').first().textContent()
  console.log(`■ [O3 양식명 101자] 입력값 길이=101 · 화면 문구="${message}"`)
  await page.screenshot({ path: join(SHOT_DIR, 'O3-02-양식명101자-저장차단-문구.png'), fullPage: true })
  expect(message ?? '').not.toBe('')
})

test('O4 메시지 유용성 — 문구 길이 초과·빈 문구의 원인이 화면에 남는가', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByLabel('양식명').fill(`${MARKER}-text`)
  await page.getByRole('button', { name: '문구 추가' }).click()
  const textArea = page.getByRole('textbox', { name: '문구' })

  // 양성 대조 — 4,096자는 저장 가능.
  await textArea.fill('가'.repeat(4096))
  await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()
  await page.screenshot({ path: join(SHOT_DIR, 'O4-01-양성대조-문구4096자-저장활성.png'), fullPage: true })

  // 4,097자 — 저장 차단 + 화면 문구
  await textArea.fill('가'.repeat(4097))
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  const tooLong = await page.getByRole('alert').first().textContent()
  console.log(`■ [O4 문구 4097자] 화면 문구="${tooLong}"`)
  await page.screenshot({ path: join(SHOT_DIR, 'O4-02-문구4097자-저장차단-문구.png'), fullPage: true })

  // 빈 문구
  await textArea.fill('')
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  const empty = await page.getByRole('alert').first().textContent()
  console.log(`■ [O4 문구 빈값] 화면 문구="${empty}"`)
  await page.screenshot({ path: join(SHOT_DIR, 'O4-03-문구빈값-저장차단-문구.png'), fullPage: true })
})

test('O5 메시지 유용성 — 이미지 source 오류 원인이 화면에 남는가', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByLabel('양식명').fill(`${MARKER}-image`)
  await page.getByRole('button', { name: '이미지/로고 추가' }).click()

  // 양성 대조 — 기본 로고는 저장 가능.
  await expect(page.getByLabel('이미지 source')).toHaveValue('/print-logo.svg')
  await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()
  await page.screenshot({ path: join(SHOT_DIR, 'O5-01-양성대조-기본로고-저장활성.png'), fullPage: true })

  await page.getByLabel('이미지 source').fill('https://example.com/logo.png')
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  const message = await page.getByRole('alert').first().textContent()
  console.log(`■ [O5 이미지 source 오류] 화면 문구="${message}"`)
  await page.screenshot({ path: join(SHOT_DIR, 'O5-02-이미지source오류-문구.png'), fullPage: true })
})

test('O6 서버 오류 — 이름 중복 409 의 원인이 사용자에게 보이는가', async ({ page }) => {
  const auth = await login(page)
  const name = `${MARKER}-dup`
  const create = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    data: {
      docType: 'GROUPWARE_EXPENSE_REPORT',
      name,
      schemaVersion: 2,
      document: {
        paper: 'A4_PORTRAIT',
        bands: [
          { key: 'header', kind: 'HEADER', elements: [{ key: 'title', type: 'TITLE' }, { key: 'approval', type: 'APPROVAL_GRID' }] },
          { key: 'body', kind: 'BODY', elements: [] },
          { key: 'footer', kind: 'FOOTER', elements: [{ key: 'closing', type: 'CLOSING' }] },
        ],
      },
    },
  })
  expect(create.status(), `사전 준비 생성 실패 HTTP ${create.status()}`).toBe(201)

  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByLabel('양식명').fill(name)
  const [failed] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/admin/groupware/document-templates') && r.request().method() === 'POST'),
    page.getByRole('button', { name: '저장' }).click(),
  ])
  console.log(`■ [O6 중복 저장] HTTP ${failed.status()} · 서버 본문=${JSON.stringify(await failed.json())}`)
  const shown = await page.getByRole('alert').first().textContent()
  console.log(`■ [O6 화면 문구] "${shown}"`)
  await page.screenshot({ path: join(SHOT_DIR, 'O6-01-이름중복-서버오류-문구.png'), fullPage: true })
})

test('O7 N-1 실 결재문서 인쇄면 — 진단문구 없음 + 5필드 양성 대조 + A4 1페이지', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`${BASE_URL}/#/groupware/approvals/${REAL_APPROVAL_ID}/print`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.paper')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.approval-doc-print-content')).toBeVisible({ timeout: 30_000 })

  // 양성 단언 먼저 — 실 필드 5종이 지면에 실제로 찍힌다.
  for (const value of ['택배비(6월)', '30,000', '복리후생비', '2026-06-14', '실서버 QA — 동적 필드 입력 검증']) {
    await expect(page.locator('.approval-doc-print-content')).toContainText(value)
  }
  const text = (await page.locator('.approval-doc-print-content').innerText())
  expect(text).not.toContain('사용할 수 없는 본문 필드 참조')
  expect(text).not.toMatch(/envelope|payload|schemaVersion|parse/i)

  const metrics = await page.evaluate(() => ({
    paperWidth: document.querySelector<HTMLElement>('.paper')?.getBoundingClientRect().width ?? 0,
    templateElements: document.querySelectorAll('[data-template-element]').length,
    printElements: document.querySelectorAll('[data-template-print-element]').length,
  }))
  console.log(`■ [O7 인쇄 지면] ${JSON.stringify(metrics)}`)
  expect(Math.abs(metrics.paperWidth - 793.701), `A4 폭이 아니다: ${metrics.paperWidth}`).toBeLessThan(1)

  const countPages = (path: string) => Number(execFileSync(
    'python',
    ['-c', 'from pypdf import PdfReader; import sys; print(len(PdfReader(sys.argv[1]).pages))', path],
    { encoding: 'utf8', timeout: 15_000 },
  ).trim())

  // 하네스 아티팩트 격리 — 이 renderer dev 서버는 VITE_APP_VERSION 이 없어 CURRENT_VERSION='0.0.0' 이라
  // AppVersionGate minor 배너가 항상 뜬다(#914 코드와 무관, position:fixed·no-print 없음).
  const banner = page.getByTestId('app-version-minor-banner')
  const bannerVisible = await banner.isVisible().catch(() => false)
  console.log(`■ [O7 버전 배너 노출] ${bannerVisible}`)
  if (bannerVisible) {
    await page.screenshot({ path: join(SHOT_DIR, 'O7-03-하네스아티팩트-버전배너-인쇄혼입.png'), fullPage: true })
    const withBanner = join(SHOT_DIR, 'O7-04-실결재문서-A4-버전배너포함.pdf')
    await page.pdf({ path: withBanner, format: 'A4', printBackground: true })
    console.log(`■ [O7 PDF · 배너 포함] pages=${countPages(withBanner)}`)
    await page.getByTestId('app-version-minor-dismiss').click()
    await expect(banner).toBeHidden()
  }

  const pdfPath = join(SHOT_DIR, 'O7-02-실결재문서-A4.pdf')
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
  const pages = countPages(pdfPath)
  console.log(`■ [O7 PDF] pages=${pages}`)
  expect(pages).toBe(1)
  await page.screenshot({ path: join(SHOT_DIR, 'O7-01-실결재문서-인쇄면-794px.png'), fullPage: true })
})

test('O8 N-2 미리보기 실서버 파생 — 지출결의서 5종·휴가신청서 4종 상호 미혼입', async ({ page }) => {
  const EXPENSE = ['지출항목', '금액', '계정과목', '지출일', '적요']
  const LEAVE = ['휴가종류', '시작일', '종료일', '사유']

  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  const preview = page.getByTestId('document-template-live-preview')
  for (const label of EXPENSE) await expect(preview).toContainText(`미리보기 ${label}`)
  for (const label of LEAVE) await expect(preview).not.toContainText(`미리보기 ${label}`)
  await page.screenshot({ path: join(SHOT_DIR, 'O8-01-지출결의서-미리보기5종.png'), fullPage: true })

  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_LEAVE_REQUEST')
  const preview2 = page.getByTestId('document-template-live-preview')
  for (const label of LEAVE) await expect(preview2).toContainText(`미리보기 ${label}`)
  for (const label of EXPENSE) await expect(preview2).not.toContainText(`미리보기 ${label}`)
  await page.screenshot({ path: join(SHOT_DIR, 'O8-02-휴가신청서-미리보기4종.png'), fullPage: true })
})

test('O9 N-3/N-4/N-5 + 사본 분리 — 네 상태 구별·좌표 해제·배치 문구·요소 사본 1:1', async ({ page }) => {
  await openNewEditor(page)
  await page.getByRole('button', { name: '필드 추가' }).click()
  const binding = page.getByRole('combobox', { name: '표시할 값' })

  // ① 미선택
  await expect(binding.locator('option[value=""]')).toHaveText('본문 필드(문서 유형을 먼저 선택하세요)')
  await expect(page.getByText('문서 유형을 선택하면 본문 필드 목록을 확인합니다.')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'O9-01-N3-미선택.png'), fullPage: true })

  // ② 조회중
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/admin/groupware/approval-templates', async (route) => {
    await gate
    await route.continue()
  })
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await expect(page.getByText('본문 필드 목록을 확인하는 중입니다')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'O9-02-N3-조회중.png'), fullPage: true })
  release()
  await expect(binding.locator('option[value="body.fieldRow[amount]"]')).toHaveCount(1, { timeout: 20_000 })
  await page.unroute('**/admin/groupware/approval-templates')

  // ③ 조회실패 → 회복
  await page.route('**/admin/groupware/approval-templates', (route) => route.abort('failed'))
  await page.reload()
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByRole('button', { name: '필드 추가' }).click()
  await expect(page.getByRole('alert')).toContainText('본문 필드 목록을 불러오지 못했습니다.')
  await page.screenshot({ path: join(SHOT_DIR, 'O9-03-N3-조회실패.png'), fullPage: true })
  await page.unroute('**/admin/groupware/approval-templates')
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByRole('combobox', { name: '표시할 값' }).last().locator('option[value="body.fieldRow[amount]"]'))
    .toHaveCount(1, { timeout: 20_000 })
  await page.screenshot({ path: join(SHOT_DIR, 'O9-04-N3-실패후회복.png'), fullPage: true })

  // ④ 필드 0개
  await page.getByLabel(/^문서 유형/).selectOption({ label: 'LiveQA848 overflow verify' })
  await page.getByRole('button', { name: '필드 추가' }).click()
  await expect(page.getByRole('combobox', { name: '표시할 값' }).last().locator('option[value=""]'))
    .toHaveText('본문 필드(현재 양식 필드 없음)', { timeout: 20_000 })
  await page.screenshot({ path: join(SHOT_DIR, 'O9-05-N3-필드0개.png'), fullPage: true })

  // N-4/N-5 좌표 해제 + 배치 상태 문구 + 사본 분리
  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByRole('button', { name: '문구 추가' }).click()
  const beforeGeometry = await page.evaluate(() => ({
    screen: document.querySelectorAll('[data-template-element="text-1"]').length,
    print: document.querySelectorAll('[data-template-print-element="text-1"]').length,
  }))
  await page.getByLabel('가로 크기(w, %)').fill('40')
  await expect(page.getByText('이 요소는 지정한 좌표로 배치되어 있습니다(일반 배치가 아님).')).toBeVisible()
  const positioned = await page.evaluate(() => ({
    screen: document.querySelectorAll('[data-template-element="text-1"]').length,
    print: document.querySelectorAll('[data-template-print-element="text-1"]').length,
  }))
  console.log(`■ [O9 사본] geometry 이전=${JSON.stringify(beforeGeometry)} 좌표배치=${JSON.stringify(positioned)}`)
  expect(positioned.screen, '화면 사본은 1개여야 한다').toBe(1)
  expect(positioned.print, '인쇄 측정 사본은 1개여야 한다').toBe(1)
  await page.screenshot({ path: join(SHOT_DIR, 'O9-06-N5-좌표배치문구.png'), fullPage: true })

  await page.getByRole('button', { name: '좌표 해제' }).click()
  await expect(page.getByText('이 요소는 지정한 좌표로 배치되어 있습니다(일반 배치가 아님).')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '문구' })).toHaveValue('새 문구')
  await page.screenshot({ path: join(SHOT_DIR, 'O9-07-N4-좌표해제-요소존속.png'), fullPage: true })
})

test('O10 활성화 422 게이트 — DETAIL/IMAGE 양식의 활성화 실패 원인이 사용자에게 보이는가', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByLabel('양식명').fill(`${MARKER}-gate`)
  await page.getByRole('button', { name: '이미지/로고 추가' }).click()
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/admin/groupware/document-templates') && r.request().method() === 'POST'),
    page.getByRole('button', { name: '저장' }).click(),
  ])
  expect(created.status(), `게이트 테스트용 저장 실패 HTTP ${created.status()}`).toBe(201)
  await expect(page.getByTestId('document-template-activation-blocked-notice')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'O10-01-편집기-활성화제한-사전고지.png'), fullPage: true })

  await page.goto(`${BASE_URL}/#/groupware/document-templates`, { waitUntil: 'domcontentloaded' })
  const row = page.getByRole('row', { name: new RegExp(`${MARKER}-gate`) })
  await expect(row).toBeVisible({ timeout: 30_000 })
  const [blocked] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/activate') && r.request().method() === 'POST'),
    row.getByRole('button', { name: '활성화' }).click(),
  ])
  console.log(`■ [O10 활성화] HTTP ${blocked.status()} · 서버=${JSON.stringify(await blocked.json())}`)
  const shown = await page.getByRole('alert').first().textContent()
  console.log(`■ [O10 목록 화면 문구] "${shown}"`)
  await page.screenshot({ path: join(SHOT_DIR, 'O10-02-활성화422-화면문구.png'), fullPage: true })
  expect(blocked.status()).toBe(422)
})

test('O11 문서 유형 목록 조회 실패 — 화면이 상태를 말하는가(이행 가능한 지시인가)', async ({ page }) => {
  // 양성 대조 — 정상 조회에서는 실서버 유형이 실제로 채워진다.
  await openNewEditor(page)
  const options = await page.getByLabel(/^문서 유형/).locator('option').allTextContents()
  console.log(`■ [O11 정상 조회 선택지] ${JSON.stringify(options)}`)
  expect(options.length, '정상 조회에서는 선택지가 있어야 한다').toBeGreaterThan(1)
  await page.screenshot({ path: join(SHOT_DIR, 'O11-01-양성대조-문서유형-선택지정상.png'), fullPage: true })

  await page.route('**/groupware/approval-templates/active', (route) => route.abort('failed'))
  await openNewEditor(page)
  const failedOptions = await page.getByLabel(/^문서 유형/).locator('option').allTextContents()
  await page.getByRole('button', { name: '문구 추가' }).click()
  const alerts = await page.getByRole('alert').allTextContents()
  const statuses = await page.getByRole('status').allTextContents()
  console.log(`■ [O11 조회 실패] 선택지=${JSON.stringify(failedOptions)}`)
  console.log(`■ [O11 조회 실패] alert=${JSON.stringify(alerts)}`)
  console.log(`■ [O11 조회 실패] status=${JSON.stringify(statuses)}`)
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  await page.screenshot({ path: join(SHOT_DIR, 'O11-02-문서유형조회실패-선택지없음-저장불가.png'), fullPage: true })
  await page.unroute('**/groupware/approval-templates/active')
})

test('O12 N-1 강화 — 활성 v2 양식(정상 필드 + 깨진 참조)을 실 결재문서에 적용해도 지면에 진단문구가 없다', async ({ page }) => {
  const auth = await login(page)
  const before = psql(`SELECT count(*) FROM document_templates WHERE doc_type='GROUPWARE_EXPENSE_REPORT' AND status='ACTIVE' AND is_deleted=false;`)
  expect(before, '시작 전 지출결의서 활성 문서양식은 0이어야 한다').toBe('0')
  const headers = { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
  let id = ''
  try {
    const created = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
      headers,
      data: {
        docType: 'GROUPWARE_EXPENSE_REPORT',
        name: `${MARKER}-print`,
        schemaVersion: 2,
        document: {
          paper: 'A4_PORTRAIT',
          bands: [
            { key: 'header', kind: 'HEADER', elements: [{ key: 'title', type: 'TITLE' }, { key: 'approval', type: 'APPROVAL_GRID' }] },
            {
              key: 'body',
              kind: 'BODY',
              elements: [
                { key: 'ok-field', type: 'FIELD', binding: 'body.fieldRow[amount]' },
                { key: 'ghost-field', type: 'FIELD', binding: 'body.fieldRow[ghostFieldKey]' },
              ],
            },
            { key: 'footer', kind: 'FOOTER', elements: [{ key: 'closing', type: 'CLOSING' }] },
          ],
        },
      },
    })
    expect(created.status(), `인쇄용 양식 생성 실패 HTTP ${created.status()}`).toBe(201)
    id = (await created.json()).data.id
    const activated = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/activate`, { headers })
    expect(activated.status(), `인쇄용 양식 활성화 실패 HTTP ${activated.status()}`).toBe(200)

    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto(`${BASE_URL}/#/groupware/approvals/${REAL_APPROVAL_ID}/print`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.paper')).toBeVisible({ timeout: 30_000 })
    // 양성 단언 — 이 양식이 실제로 적용됐고 정상 필드가 값을 낸다.
    await expect(page.locator('.paper')).toContainText('30,000')
    const text = await page.locator('.paper').innerText()
    console.log(`■ [O12 활성 v2 양식 지면] ${JSON.stringify(text)}`)
    expect(text).not.toContain('사용할 수 없는 본문 필드 참조')
    expect(text).not.toMatch(/envelope|payload|schemaVersion|parse/i)
    const metrics = await page.evaluate(() => ({
      paperWidth: document.querySelector<HTMLElement>('.paper')?.getBoundingClientRect().width ?? 0,
      screenCopies: document.querySelectorAll('[data-template-element="ok-field"]').length,
      printCopies: document.querySelectorAll('[data-template-print-element="ok-field"]').length,
    }))
    console.log(`■ [O12 지면 측정] ${JSON.stringify(metrics)}`)
    expect(Math.abs(metrics.paperWidth - 793.701)).toBeLessThan(1)
    await page.screenshot({ path: join(SHOT_DIR, 'O12-01-활성v2양식-실결재문서-인쇄면-진단문구없음.png'), fullPage: true })
  } finally {
    if (id) {
      await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/deactivate`, { headers })
    }
    syncCleanup()
  }
  const after = psql(`SELECT count(*) FROM document_templates WHERE doc_type='GROUPWARE_EXPENSE_REPORT' AND status='ACTIVE' AND is_deleted=false;`)
  expect(after, '정리 후 지출결의서 활성 문서양식은 다시 0이어야 한다').toBe('0')
})
