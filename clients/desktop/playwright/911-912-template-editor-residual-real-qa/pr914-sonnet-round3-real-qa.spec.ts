import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** PR #914 SONNET5 라운드3 fix — 발견1/2/3 AFTER 라이브 검증 + 회귀 울타리 F-1~F-9 전 항목 실제 재실행.
 *
 * 배경: 직전 라운드(SOL)가 validationMessage 를 코드 단위 제네릭 문구로 뭉개 TEXT 4096자·IMAGE
 * PNG/JPEG/WebP+50KB 정보를 잃었다(발견1). isNonEmptyString 이 "빈 값"과 "상한 초과"를 한 문구로
 * 묶었다(발견2 — name, 계열sweep으로 alt도 포함). fetchConfigurableDocTypes 의 삼킴이 문서 유형
 * select 를 "고를 것이 없는데 고르라"로 만들었다(발견3). "before" 화면(수정 전 재현)은 소스를 임시로
 * 되돌려 별도 실행 후 원복했다 — docs/qa/914-sonnet-round-2026-07-24/BEFORE-*.png 4장.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5195'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const MARKER = 'LUNA914R5'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '914-luna-round-2026-07-24'))
mkdirSync(SHOT_DIR, { recursive: true })

// F-9 대상 — #848 라운드가 남긴 기존 v1·ACTIVE 실 템플릿(읽기전용 재사용, 절대 수정하지 않는다).
const V1_ACTIVE_TEMPLATE_ID = '31b97122-3a59-467c-901f-4bc375aaa811'
// F-1/F-2/F-6 대상 — 기존 라운드들이 써 온 실 결재문서(읽기전용 인쇄면).
const REAL_APPROVAL_ID = 'd16da703-e914-4bd0-bdd2-43a715e6e418'

interface LoginResult { token: string; userId: string; role: string; displayName: string }

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
  return { token: data.token ?? '', userId: data.userId ?? '', role: data.role ?? 'MASTER', displayName: data.displayName ?? '개발책임자' }
}

async function installAuth(page: Page, auth: LoginResult): Promise<void> {
  await page.addInitScript((value: LoginResult) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...value, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, auth)
}

/** parser 경로(4097/101자)를 확인하기 위해 다른 클라이언트/과거 revision이 보낼 수 있는 입력을
 * 네이티브 value setter로 직접 주입해 React onChange를 태운다(fireEvent 계열과 동일 원리). */
async function setValueDirectly(locator: ReturnType<Page['getByLabel']>, value: string): Promise<void> {
  await locator.evaluate((element: HTMLInputElement | HTMLTextAreaElement, next: string) => {
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
    setter.call(element, next)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

async function openNewEditor(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${BASE_URL}/#/groupware/document-templates/new/edit`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
}

const FORBIDDEN = /envelope|payload|schemaVersion|(?<!type=")\bparse\b/i

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  syncCleanup()
  await installAuth(page, await login(page))
})
test.afterEach(() => syncCleanup())

test('R5-P5: 세 입력칸의 자연 초과 입력은 마지막 글자를 보존하고 현재 길이와 상한을 보여야 한다', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel('양식명').fill('a'.repeat(101))
  expect(await page.getByLabel('양식명').inputValue()).toHaveLength(101)
  await expect(page.getByText('101 / 100')).toBeVisible()

  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByRole('button', { name: '문구 추가' }).click()
  const text = page.getByLabel('문구', { exact: true })
  await text.fill('b'.repeat(4097))
  expect(await text.inputValue()).toHaveLength(4097)
  await expect(page.getByText('4097 / 4096')).toBeVisible()

  await page.getByRole('button', { name: '이미지/로고 추가' }).click()
  const alt = page.getByLabel('이미지 대체 문구')
  await alt.fill('c'.repeat(201))
  expect(await alt.inputValue()).toHaveLength(201)
  await expect(page.getByText('201 / 200')).toBeVisible()
})

test('R3-① 발견1 AFTER: TEXT 문구 4096자 양성대조 / 4097자·빈값은 4096 한계를 담은 서로 다른 문구', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel('양식명').fill(`${MARKER}-text`)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByRole('button', { name: '문구 추가' }).click()
  const textarea = page.getByLabel('문구', { exact: true })

  await textarea.fill('a'.repeat(4096))
  await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: join(SHOT_DIR, 'AFTER-01a-TEXT-4096자-양성대조-저장활성.png'), fullPage: true })

  await setValueDirectly(textarea, 'a'.repeat(4097))
  const tooLong = (await page.getByRole('alert').last().textContent()) ?? ''
  console.log(`■ [AFTER 발견1] TEXT 4097자: "${tooLong}"`)
  expect(tooLong).toContain('4096')
  expect(tooLong).not.toMatch(FORBIDDEN)
  await page.screenshot({ path: join(SHOT_DIR, 'AFTER-01b-TEXT-4097자-4096한계표시.png'), fullPage: true })

  await textarea.fill('')
  const empty = (await page.getByRole('alert').last().textContent()) ?? ''
  console.log(`■ [AFTER 발견1] TEXT 빈값: "${empty}"`)
  expect(empty).not.toBe(tooLong)
  expect(empty).not.toContain('4096')
  await page.screenshot({ path: join(SHOT_DIR, 'AFTER-01c-TEXT-빈값-다른문구.png'), fullPage: true })
})

test('R3-② 발견1 AFTER: IMAGE URL 형식 오류 문구가 허용 형식(PNG/JPEG/WebP)을 보존한다', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel('양식명').fill(`${MARKER}-image`)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByRole('button', { name: '이미지/로고 추가' }).click()
  await page.getByLabel('이미지 source').fill('https://example.com/logo.png')

  const message = (await page.getByRole('alert').last().textContent()) ?? ''
  console.log(`■ [AFTER 발견1] IMAGE 형식 오류: "${message}"`)
  expect(message).toContain('PNG')
  expect(message).toContain('JPEG')
  expect(message).toContain('WebP')
  expect(message).not.toMatch(FORBIDDEN)
  await page.screenshot({ path: join(SHOT_DIR, 'AFTER-02-IMAGE-형식오류-허용형식표시.png'), fullPage: true })
})

test('R3-③ 발견2 AFTER: 양식명 100자 양성대조 / 101자·빈값은 100 한계를 담은 서로 다른 문구', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  const name = page.getByLabel('양식명')

  await name.fill('a'.repeat(100))
  await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: join(SHOT_DIR, 'AFTER-03a-양식명-100자-양성대조-저장활성.png'), fullPage: true })

  // 자연 입력 경로는 위 P-5 테스트가 검증하고, 여기서는 parser 경로도 별도로 확인한다
  // (예: 다른 클라이언트/과거 revision이 보낼 수 있는 입력).
  await page.getByRole('button', { name: '필드 추가' }).click()
  await setValueDirectly(name, 'a'.repeat(101))
  const tooLong = (await page.getByRole('alert').last().textContent()) ?? ''
  console.log(`■ [AFTER 발견2] 양식명 101자: "${tooLong}"`)
  expect(tooLong).toContain('100')
  expect(tooLong).not.toBe('양식명을 입력해야 저장할 수 있습니다.')
  expect(tooLong).not.toMatch(FORBIDDEN)
  await page.screenshot({ path: join(SHOT_DIR, 'AFTER-03b-양식명-101자-100한계표시.png'), fullPage: true })

  await name.fill('')
  const empty = (await page.getByRole('alert').last().textContent()) ?? ''
  console.log(`■ [AFTER 발견2] 양식명 빈값: "${empty}"`)
  expect(empty).toBe('양식명을 입력해야 저장할 수 있습니다.')
  expect(empty).not.toBe(tooLong)
  await page.screenshot({ path: join(SHOT_DIR, 'AFTER-03c-양식명-빈값-다른문구.png'), fullPage: true })
})

test('R3-④ 발견3 AFTER: 문서 유형 목록 조회 실패는 실패를 알리고 재시도로 회복한다', async ({ page }) => {
  await page.route('**/groupware/approval-templates/active', (route) => route.abort('failed'))
  await openNewEditor(page)

  const select = page.getByLabel(/^문서 유형/)
  await expect(select.locator('option')).toHaveCount(1) // placeholder만 — SLIP 옵션도 섞이지 않는다(이 화면은 GROUPWARE만 씀)
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('문서 유형 목록을 불러오지 못했습니다.')
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'AFTER-04a-문서유형목록-조회실패-알림및재시도.png'), fullPage: true })

  await page.unroute('**/groupware/approval-templates/active')
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(select.locator('option[value="GROUPWARE_EXPENSE_REPORT"]')).toHaveCount(1, { timeout: 15_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: join(SHOT_DIR, 'AFTER-04b-재시도-정상목록회복.png'), fullPage: true })
})

test('R3-F1/F2 라이브 — 실 결재문서 인쇄면: 진단문구 0 · A4 폭 · 배너 제외 PDF 1페이지', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`${BASE_URL}/#/groupware/approvals/${REAL_APPROVAL_ID}/print`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.paper')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.approval-doc-print-content')).toBeVisible({ timeout: 30_000 })

  const text = await page.locator('.approval-doc-print-content').innerText()
  expect(text, 'F-8: 화면에 내부 용어가 없어야 한다').not.toMatch(FORBIDDEN)
  expect(text, '진단문구(편집기 전용 경고)가 실 문서 인쇄면에 섞이면 안 된다').not.toContain('사용할 수 없는')

  // 참고: 이 실 문서(GROUPWARE_DEFAULT 레이아웃)는 좌표 배치(geometry) 요소를 쓰지 않으므로
  // data-template-element 카운트가 0이 정상이다(PositionedElementBand 전용 속성) — F-6은 좌표
  // 요소가 실제로 있는 F4/F5 테스트에서 확인한다.
  const paperWidth = await page.evaluate(() => document.querySelector<HTMLElement>('.paper')?.getBoundingClientRect().width ?? 0)
  console.log(`■ [F-1 인쇄 지면 폭] ${paperWidth}`)
  expect(Math.abs(paperWidth - 793.701), `A4 폭이 아니다: ${paperWidth}`).toBeLessThan(1)

  // 하네스 아티팩트 — 이 dev 렌더러는 VITE_APP_VERSION 이 없어 버전 배너가 뜬다(#914 무관, no-print 없음).
  // "배너 제외" 측정을 위해 닫고 잰다.
  const banner = page.getByTestId('app-version-minor-banner')
  if (await banner.isVisible().catch(() => false)) {
    await page.getByTestId('app-version-minor-dismiss').click()
    await expect(banner).toBeHidden()
  }
  await page.screenshot({ path: join(SHOT_DIR, 'F1F6-01-실결재문서-인쇄면.png'), fullPage: true })

  const pdfPath = join(SHOT_DIR, 'F1-실결재문서-A4.pdf')
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
  const pages = Number(execFileSync('python', ['-c', 'from pypdf import PdfReader; import sys; print(len(PdfReader(sys.argv[1]).pages))', pdfPath], { encoding: 'utf8', timeout: 15_000 }).trim())
  console.log(`■ [F-1 PDF 페이지 수(배너 제외)] ${pages}`)
  expect(pages, 'F-1: 배너 제외 PDF는 1페이지여야 한다').toBe(1)

  // F-2 — 신규 편집기 라이브 미리보기에서 지출결의서 5필드 / 휴가신청서 4필드가 상호 섞이지 않는다.
  const EXPENSE = ['지출항목', '금액', '계정과목', '지출일', '적요']
  const LEAVE = ['휴가종류', '시작일', '종료일', '사유']
  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  const previewA = page.getByTestId('document-template-live-preview')
  for (const label of EXPENSE) await expect(previewA).toContainText(`미리보기 ${label}`)
  for (const label of LEAVE) await expect(previewA).not.toContainText(`미리보기 ${label}`)
  await page.screenshot({ path: join(SHOT_DIR, 'F2-01-지출결의서-5필드.png'), fullPage: true })

  await openNewEditor(page)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_LEAVE_REQUEST')
  const previewB = page.getByTestId('document-template-live-preview')
  for (const label of LEAVE) await expect(previewB).toContainText(`미리보기 ${label}`)
  for (const label of EXPENSE) await expect(previewB).not.toContainText(`미리보기 ${label}`)
  console.log('■ [F-2 필드 측정] EXPENSE='+EXPENSE.length+', LEAVE='+LEAVE.length+', 상호 미혼입=0')
  await page.screenshot({ path: join(SHOT_DIR, 'F2-02-휴가신청서-4필드.png'), fullPage: true })
})

test('R3-F3 라이브 — 미선택·조회중·조회실패(+회복)·필드0개 네 문구를 구별한다', async ({ page }) => {
  await openNewEditor(page)
  await page.getByRole('button', { name: '필드 추가' }).click()
  const binding = page.getByRole('combobox', { name: '표시할 값' })
  await expect(binding.locator('option[value=""]')).toHaveText('본문 필드(문서 유형을 먼저 선택하세요)')
  console.log('■ [F-3 미선택] '+await binding.locator('option[value=""]').textContent())
  await page.screenshot({ path: join(SHOT_DIR, 'F3-01-미선택.png'), fullPage: true })

  let releaseLoading!: () => void
  const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve })
  await page.route('**/admin/groupware/approval-templates', async (route) => { await loadingGate; await route.continue() })
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await expect(page.getByText('본문 필드 목록을 확인하는 중입니다')).toBeVisible()
  console.log('■ [F-3 조회중] '+await page.getByText('본문 필드 목록을 확인하는 중입니다').textContent())
  await page.screenshot({ path: join(SHOT_DIR, 'F3-02-조회중.png'), fullPage: true })
  releaseLoading()
  await expect(binding.locator('option[value="body.fieldRow[amount]"]')).toHaveCount(1, { timeout: 15_000 })
  await page.unroute('**/admin/groupware/approval-templates')

  await page.route('**/admin/groupware/approval-templates', (route) => route.abort('failed'))
  await page.reload()
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByRole('button', { name: '필드 추가' }).click()
  await expect(page.getByRole('alert')).toContainText('본문 필드 목록을 불러오지 못했습니다.')
  console.log('■ [F-3 조회실패] '+await page.getByRole('alert').textContent())
  await page.screenshot({ path: join(SHOT_DIR, 'F3-03-조회실패.png'), fullPage: true })

  await page.unroute('**/admin/groupware/approval-templates')
  await page.getByRole('button', { name: '다시 시도' }).click()
  const recovered = page.getByRole('combobox', { name: '표시할 값' }).last()
  await expect(recovered.locator('option[value="body.fieldRow[amount]"]')).toHaveCount(1, { timeout: 15_000 })
  await page.screenshot({ path: join(SHOT_DIR, 'F3-04-실패후회복.png'), fullPage: true })

  await page.getByLabel(/^문서 유형/).selectOption({ label: 'LiveQA848 overflow verify' })
  await page.getByRole('button', { name: '필드 추가' }).click()
  await expect(page.getByRole('combobox', { name: '표시할 값' }).last().locator('option[value=""]'))
    .toHaveText('본문 필드(현재 양식 필드 없음)', { timeout: 15_000 })
  console.log('■ [F-3 필드0개] '+await page.getByRole('combobox', { name: '표시할 값' }).last().locator('option[value=""]').textContent())
  await page.screenshot({ path: join(SHOT_DIR, 'F3-05-필드0개.png'), fullPage: true })
})

test('R3-F4/F5/F6 라이브 — 좌표 해제 후 요소 존속·일반 배치 복귀, 배치 상태 문구 상시 노출, 화면/인쇄 사본 분리', async ({ page }) => {
  await openNewEditor(page)
  await page.getByLabel('양식명').fill(`${MARKER}-geometry`)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.getByRole('button', { name: '문구 추가' }).click()

  await expect(page.getByText(/좌표로 배치/)).toHaveCount(0)
  await page.getByLabel('가로 위치(x, %)').fill('10')
  await expect(page.getByText(/좌표로 배치/)).toBeVisible()
  console.log('■ [F-4/F-5 좌표 상태] 상태문구='+await page.getByText(/좌표로 배치/).count()+', 문구입력='+await page.getByLabel('문구', { exact: true }).count())
  await page.screenshot({ path: join(SHOT_DIR, 'F4F5-01-좌표입력-배치상태문구.png'), fullPage: true })

  // F-6: 좌표 배치 요소가 실제로 있는 지금, 화면 사본(data-template-element)과 인쇄 측정 사본
  // (data-template-print-element)이 서로 다른 DOM 노드로 분리돼 있어야 한다(공유 시 쿼리가 늘 2개
  // 매칭되는 회귀 — N-7(Q-1)).
  const copies = await page.getByTestId('document-template-live-preview').evaluate((root) => ({
    templateElements: root.querySelectorAll('[data-template-element]').length,
    printElements: root.querySelectorAll('[data-template-print-element]').length,
  }))
  console.log(`■ [F-6 화면/인쇄 사본 카운트] ${JSON.stringify(copies)}`)
  expect(copies.templateElements, 'F-6: 화면 사본이 존재해야 한다').toBeGreaterThan(0)
  expect(copies.printElements, 'F-6: 인쇄 측정 사본이 화면 사본과 별도로 존재해야 한다').toBeGreaterThan(0)

  await page.getByRole('button', { name: '좌표 해제' }).click()
  await expect(page.getByText(/좌표로 배치/)).toHaveCount(0)
  await expect(page.getByLabel('문구', { exact: true })).toBeVisible() // 요소 존속(삭제되지 않음)
  console.log('■ [F-4 해제 후] 상태문구='+await page.getByText(/좌표로 배치/).count()+', 문구입력='+await page.getByLabel('문구', { exact: true }).count())
  await page.screenshot({ path: join(SHOT_DIR, 'F4F5-02-좌표해제-요소존속-일반배치복귀.png'), fullPage: true })
})

test('R3-F7 라이브 — 저장 체인: POST 201 → reload 유형 읽기전용 → PUT 200 → 활성화 200 → 비활성화 200', async ({ page }) => {
  const auth = await login(page)
  await openNewEditor(page)
  await page.getByLabel('양식명').fill(`${MARKER}-savechain`)
  await page.getByLabel(/^문서 유형/).selectOption('GROUPWARE_LEAVE_REQUEST')

  const [postRes] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/admin/groupware/document-templates') && res.request().method() === 'POST'),
    page.getByRole('button', { name: '저장' }).click(),
  ])
  expect(postRes.status(), `저장 실패 — HTTP ${postRes.status()}`).toBe(201)
  console.log('■ [F-7 POST] '+postRes.status())
  await page.screenshot({ path: join(SHOT_DIR, 'F7-01-POST201.png'), fullPage: true })

  await page.reload()
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
  const docTypeInput = page.getByLabel('문서 유형(생성 후 변경 불가)')
  await expect(docTypeInput).toHaveValue('GROUPWARE_LEAVE_REQUEST')
  await expect(docTypeInput).toBeDisabled()
  const id = page.url().match(/document-templates\/([^/]+)\/edit/)?.[1]
  expect(id, '저장 후 ID가 URL에 있어야 한다').toBeTruthy()
  await page.screenshot({ path: join(SHOT_DIR, 'F7-02-reload-유형읽기전용.png'), fullPage: true })

  await page.getByLabel('양식명').fill(`${MARKER}-savechain-updated`)
  const [putRes] = await Promise.all([
    page.waitForResponse((res) => res.url().includes(`/admin/groupware/document-templates/${id}`) && res.request().method() === 'PUT'),
    page.getByRole('button', { name: '저장' }).click(),
  ])
  expect(putRes.status(), `PUT 실패 — HTTP ${putRes.status()}`).toBe(200)
  console.log('■ [F-7 PUT] '+putRes.status())
  await page.screenshot({ path: join(SHOT_DIR, 'F7-03-PUT200.png'), fullPage: true })

  const activateRes = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/activate`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  })
  expect(activateRes.status(), `활성화 실패 — HTTP ${activateRes.status()}`).toBe(200)
  console.log('■ [F-7 활성화] '+activateRes.status())
  await page.screenshot({ path: join(SHOT_DIR, 'F7-04-활성화200.png'), fullPage: true })

  await page.reload()
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
  const [deactivateRes] = await Promise.all([
    page.waitForResponse((res) => res.url().includes(`/deactivate`) && res.request().method() === 'POST'),
    page.getByRole('button', { name: '편집 시작' }).click(),
  ])
  expect(deactivateRes.status(), `비활성화 실패 — HTTP ${deactivateRes.status()}`).toBe(200)
  console.log('■ [F-7 비활성화] '+deactivateRes.status())
  await page.screenshot({ path: join(SHOT_DIR, 'F7-05-비활성화200.png'), fullPage: true })
})

test('R3-F9 라이브 — 기존 저장된 v1·ACTIVE 양식이 여전히 정상 재진입한다(판정 동등성, 읽기전용)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`${BASE_URL}/#/groupware/document-templates/${V1_ACTIVE_TEMPLATE_ID}/edit`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('문서 양식을 불러오지 못했습니다.')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  const nameInput = page.getByLabel('양식명')
  await expect(nameInput).not.toHaveValue('')
  console.log(`■ [F-9] v1 ACTIVE 재진입 — 양식명="${await nameInput.inputValue()}"`)
  await page.screenshot({ path: join(SHOT_DIR, 'F9-01-v1ACTIVE-재진입-정상.png'), fullPage: true })
})
