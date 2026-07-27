import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** PR #914 OPUS 라운드 fix — SONNET5 라이브 QA 하네스.
 *
 * N-1/N-2(실 문서유형 지출결의서·휴가신청서 9필드), N-3(조회중/실패/회복), N-4(좌표 해제),
 * N-5(배치 전환 가시화)를 실서버·실 렌더러(HashRouter, :5195)에서 확인한다.
 * 실제 게이트웨이와 groupware_db에 마커 throwaway DRAFT만 생성한다. 공유 실 템플릿
 * (지출결의서·휴가신청서 활성 양식)은 절대 수정/비활성화/삭제하지 않는다 — docType은
 * 재사용하되 이 스펙이 만드는 문서 양식은 항상 새 DRAFT이고 활성화(activate)를 호출하지 않는다.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5195'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const MARKER = 'PR914-SONNET-R-20260723'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '914-sonnet-round-2026-07-23'))
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

async function createDraft(page: Page, auth: LoginResult, docType: string, name: string): Promise<string> {
  const response = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      docType,
      name,
      schemaVersion: 2,
      document: {
        paper: 'A4_PORTRAIT',
        bands: [
          { key: 'h', kind: 'HEADER', elements: [{ key: 'h-title', type: 'TITLE' }, { key: 'h-meta', type: 'META_ROWS' }, { key: 'h-grid', type: 'APPROVAL_GRID' }] },
          { key: 'b', kind: 'BODY', elements: [] },
          { key: 'f', kind: 'FOOTER', elements: [{ key: 'f-close', type: 'CLOSING' }] },
        ],
      },
    },
  })
  expect(response.ok(), `throwaway 양식 생성 실패: HTTP ${response.status()}`).toBeTruthy()
  return (await response.json()).data.id as string
}

async function openEditor(page: Page, id: string): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${BASE_URL}/#/groupware/document-templates/${id}/edit`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('document-template-live-preview')).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

// 실측(groupware_db.approval_template_fields, 2026-07-23) — EXPENSE_REPORT/LEAVE_REQUEST 9필드 라벨.
const FIELD_LABEL: Record<string, string> = {
  expenseItem: '지출항목', amount: '금액', account: '계정과목', spentAt: '지출일', memo: '적요',
  leaveType: '휴가종류', startDate: '시작일', endDate: '종료일', reason: '사유',
}

// ── N-1 + N-2: 실 문서유형 9필드 전부가 진단 문구 없이 제 값을 렌더한다 ──────────────
for (const [docType, fields] of [
  ['GROUPWARE_EXPENSE_REPORT', ['expenseItem', 'amount', 'account', 'spentAt', 'memo']],
  ['GROUPWARE_LEAVE_REQUEST', ['leaveType', 'startDate', 'endDate', 'reason']],
] as const) {
  test(`N-1/N-2 라이브 — ${docType} 실서버 필드 전부가 진단 문구 없이 미리보기에 렌더된다`, async ({ page }) => {
    syncCleanup()
    const auth = await login(page)
    await installAuth(page, auth)
    const id = await createDraft(page, auth, docType, `${MARKER}-${docType}`)
    try {
      await openEditor(page, id)
      for (const fieldKey of fields) {
        await page.getByRole('button', { name: '필드 추가' }).click()
        const binding = page.getByRole('combobox', { name: '표시할 값' })
        const targetValue = `body.fieldRow[${fieldKey}]`
        await expect(binding.locator(`option[value="${targetValue}"]`), `${fieldKey} 옵션이 없다 — 실서버 fieldOptions와 어긋남`)
          .toHaveCount(1, { timeout: 15_000 })
        await binding.selectOption(targetValue)
      }
      const bodyText = await page.getByTestId('document-template-live-preview').innerText()
      expect(bodyText, 'N-1 위반 — 진단 문구가 지면에 보인다').not.toContain('사용할 수 없는')
      for (const fieldKey of fields) {
        const label = FIELD_LABEL[fieldKey]
        expect(bodyText, `N-2 위반 — ${fieldKey}(${label}) 필드 값이 미리보기에 없다`).toContain(`미리보기 ${label}`)
      }
      await page.screenshot({ path: join(SHOT_DIR, `N1N2-${docType}-필드전체-진단문구없음.png`), fullPage: true })
    } finally {
      syncCleanup()
    }
  })
}

// ── N-4 + N-5: 좌표 생성 시 가시적 상태 + 좌표 해제로 되돌리기 ─────────────────────
test('N-4/N-5 라이브 — 좌표 생성이 눈에 보이고, 좌표 해제로 요소를 지우지 않고 되돌린다', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  const id = await createDraft(page, auth, `GROUPWARE_${MARKER}-N4N5`, `${MARKER}-N4N5`)
  try {
    await openEditor(page, id)
    await page.getByRole('button', { name: '문구 추가' }).click()

    // N-5 전제 — 아직 좌표가 없으면 배치 상태 문구가 없다.
    await expect(page.getByText(/좌표로 배치/)).toHaveCount(0)
    await page.screenshot({ path: join(SHOT_DIR, 'N5-01-생성직후-일반배치-상태문구없음.png'), fullPage: true })

    // N-5 — w 칸 하나만 채워도(A-5 재현 입력) 배치 전환이 "보인다".
    await page.getByLabel('가로 크기(w, %)').fill('40')
    await expect(page.getByText(/좌표로 배치/)).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-template-element]').last()).toHaveAttribute('style', /position:\s*absolute/)
    await page.screenshot({ path: join(SHOT_DIR, 'N5-02-w만-입력-좌표배치-상태문구표시.png'), fullPage: true })

    // N-4 — 갇힌 상태를 인위로 재현하지 않고, 이미 absolute인 상태에서 "좌표 해제"로 직접 되돌린다.
    const clearButton = page.getByRole('button', { name: '좌표 해제' })
    await expect(clearButton).toBeVisible()
    await clearButton.click()

    await expect(page.getByText(/좌표로 배치/)).toHaveCount(0)
    await expect((await page.locator('[data-template-element]').last().getAttribute('style')) ?? '').not.toMatch(/position:\s*absolute/)
    for (const label of ['가로 위치(x, %)', '세로 위치(y, %)', '가로 크기(w, %)', '세로 크기(h, %)'] as const) {
      await expect(page.getByLabel(label)).toHaveValue('')
    }
    await page.screenshot({ path: join(SHOT_DIR, 'N4-03-좌표해제-일반배치로-복귀-요소존속.png'), fullPage: true })

    // 요소 자체는 삭제되지 않고 그대로 있다(N-4: "요소를 삭제하지 않고").
    await expect(page.locator('[data-template-element]')).toHaveCount(1)
  } finally {
    syncCleanup()
  }
})

// ── N-3: 조회 중 / 실패+회복 / 정말 없음을 화면이 구분한다 ────────────────────────
// 네트워크 실패는 실제 서버 장애를 기다릴 수 없으므로 page.route()로 시뮬레이션한다 — 가짜
// "업무 데이터"가 아니라 네트워크 계층 실패 주입이며, 이 기법 자체를 보고서에 명시한다.

test('N-3-a 라이브 — 본문 필드 목록 조회 중에는 "사용할 수 없는 필드"로 단정하지 않는다', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  const id = await createDraft(page, auth, 'GROUPWARE_EXPENSE_REPORT', `${MARKER}-N3a`)
  try {
    let sawLoadingState = false
    await page.route('**/admin/groupware/approval-templates', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await route.continue()
    })

    await openEditor(page, id)
    await page.getByRole('button', { name: '필드 추가' }).click()
    // 기본 binding(header.docNo)은 body.fieldRow 패턴이 아니라 N-3 대상이 아니다 — 조회 지연 중에도
    // select는 이미 fieldOptions가 필요한 상태(연결된 docType)이므로 로딩 문구가 뜬다.
    await expect(page.getByRole('status').filter({ hasText: '본문 필드 목록을 확인하는 중입니다' })).toBeVisible({ timeout: 2500 })
    await expect(page.getByText('현재 양식에서 선택할 수 없는 본문 필드 참조입니다')).toHaveCount(0)
    sawLoadingState = true
    await page.screenshot({ path: join(SHOT_DIR, 'N3a-01-조회중-단정안함.png'), fullPage: true })

    // 지연이 끝나면 정상 로드되고, 실제 필드를 정상적으로 고를 수 있다(회복이 아니라 "정상 완료").
    const binding = page.getByRole('combobox', { name: '표시할 값' })
    await expect(binding.locator('option[value="body.fieldRow[expenseItem]"]')).toHaveCount(1, { timeout: 8000 })
    await binding.selectOption('body.fieldRow[expenseItem]')
    await expect(page.getByTestId('document-template-live-preview')).toContainText('미리보기 지출항목')
    await page.screenshot({ path: join(SHOT_DIR, 'N3a-02-조회완료-정상선택.png'), fullPage: true })

    expect(sawLoadingState, '로딩 상태를 실제로 관측하지 못했다(3초 지연이 너무 짧았을 수 있다)').toBeTruthy()
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    syncCleanup()
  }
})

test('N-3-b 라이브 — 본문 필드 목록 조회 실패는 실패로 고지되고, 다시 시도로 회복한다', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  const id = await createDraft(page, auth, 'GROUPWARE_EXPENSE_REPORT', `${MARKER}-N3b`)
  try {
    let shouldFail = true
    let calls = 0
    await page.route('**/admin/groupware/approval-templates', async (route) => {
      calls += 1
      if (shouldFail) {
        await route.abort('failed')
        return
      }
      await route.continue()
    })

    await openEditor(page, id)
    await page.getByRole('button', { name: '필드 추가' }).click()

    await expect(page.getByRole('alert').filter({ hasText: '본문 필드 목록을 불러오지 못했습니다' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('현재 양식에서 선택할 수 없는 본문 필드 참조입니다'), 'N-3 위반 — 조회 실패를 참조 오류로 오인').toHaveCount(0)
    const retryButton = page.getByRole('button', { name: '다시 시도' })
    await expect(retryButton, 'N-3 위반 — 실패에 회복 수단(다시 시도)이 없다').toBeVisible()
    await page.screenshot({ path: join(SHOT_DIR, 'N3b-01-조회실패-회복버튼-단정안함.png'), fullPage: true })

    // 회복 — 라우트를 정상으로 돌리고 다시 시도를 누르면 실제로 복구된다.
    shouldFail = false
    await retryButton.click()
    await expect(page.getByText('본문 필드 목록을 불러오지 못했습니다')).toHaveCount(0, { timeout: 8000 })
    const binding = page.getByRole('combobox', { name: '표시할 값' })
    await expect(binding.locator('option[value="body.fieldRow[expenseItem]"]')).toHaveCount(1, { timeout: 8000 })
    await page.screenshot({ path: join(SHOT_DIR, 'N3b-02-다시시도-회복.png'), fullPage: true })

    console.log(`■ approval-templates 호출 횟수 = ${calls}(실패 1회 이상 + 회복 1회 이상이어야 한다)`)
    expect(calls).toBeGreaterThan(1)
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    syncCleanup()
  }
})
