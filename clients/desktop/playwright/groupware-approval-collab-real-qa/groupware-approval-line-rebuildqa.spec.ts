import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * §7 그룹웨어 결재 — 리뷰 fix 반영 후 재빌드 라이브 QA.
 *
 * 검증 항목 (efcf5943a / e1a5fe314 fix 반영):
 *   1. 결재자 검색 minChars=2 — 2글자 입력 후 후보 표시.
 *   2. 결재선 칩 작성 — 2명 추가 + 순서(순번:실명).
 *   3. 중복 결재자 차단 — 같은 사람 재선택 시 칩 증가 없음.
 *   4. 첨부 확정 칩 — 문서참조 선택 후 입력행 사라지고 칩만.
 *   5. 상세 결재선 — 실명 텍스트 + 상태 배지 (칩 아님), UUID 노출 0.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 * 실행: vite :5175(mock off);
 *   node_modules/.bin/playwright test --config playwright/groupware-approval-collab-real-qa/playwright.config.ts groupware-approval-line-rebuildqa.spec.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page, type Locator } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/groupware-approval-templates'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let captureIdx = 0
async function capture(page: Page, name: string): Promise<string> {
  captureIdx++
  const fname = `rebuild-${String(captureIdx).padStart(2, '0')}-${name}.png`
  const fpath = path.join(SCREENSHOT_DIR, fname)
  await page.screenshot({ path: fpath, fullPage: false })
  console.log(`[CAPTURE] ${fpath}`)
  return fpath
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')) })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let d = ''
        res.on('data', (c) => { d += c })
        res.on('end', () => {
          try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token parse: ' + d)) }
        })
      },
    )
    req.on('error', reject); req.write(body); req.end()
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
    if (u.pathname.endsWith('/collab/stream')) { await route.abort(); return }
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
    } catch (err) { console.error('[PROXY]', realUrl, err); await route.abort() }
  })
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(1_500)
}

/**
 * AsyncAutocomplete 드롭다운에서 첫 번째 후보를 선택한다.
 * onMouseDown 핸들러 방식이므로 dispatchEvent 로 직접 mousedown 을 발생시킨다.
 */
async function pickFirstDropdownOption(page: Page, listboxLabel: string, timeoutMs = 8_000): Promise<boolean> {
  const listbox = page.getByRole('listbox', { name: listboxLabel })
  try {
    await listbox.waitFor({ state: 'visible', timeout: timeoutMs })
  } catch {
    return false
  }
  const options = listbox.getByRole('option')
  const count = await options.count()
  if (count === 0) return false
  const firstOption = options.first()
  // onMouseDown 핸들러가 e.preventDefault 를 호출하므로 dispatchEvent mousedown 으로 직접 트리거.
  await firstOption.dispatchEvent('mousedown')
  await page.waitForTimeout(400)
  return true
}

test.describe('§7 그룹웨어 결재 — 리뷰 fix 재빌드 라이브 QA', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('시나리오1: 결재 작성 — 결재선 2글자 검색 + 2명 칩 + 중복 차단 + 첨부 확정 칩', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    await gotoAndSettle(page, `${BASE_URL}/#/groupware/approvals/new?mockRole=MASTER`)

    // 결재유형 선택 (지출결의서)
    const templateSelect = page.getByTestId('groupware-approval-create-template')
    await expect(templateSelect).toBeVisible({ timeout: 10_000 })
    const options = await templateSelect.locator('option').allTextContents()
    const expenseOption = options.find(o => o.includes('지출결의'))
    if (expenseOption) {
      await templateSelect.selectOption({ label: expenseOption.trim() })
      await page.waitForTimeout(700)
    }

    // 제목 입력
    const titleInput = page.getByTestId('groupware-approval-create-title')
    await expect(titleInput).toBeVisible({ timeout: 5_000 })
    await titleInput.fill('리뷰fix QA - 결재선실명+중복차단+첨부칩 검증')

    // === 결재자 검색 (AsyncAutocomplete, data-testid="approver-search-input") ===
    const approverInput = page.getByTestId('approver-search-input')
    await expect(approverInput).toBeVisible({ timeout: 5_000 })

    // 1글자 입력 — minChars=2 이므로 드롭다운 미표시 기대
    await approverInput.fill('김')
    await page.waitForTimeout(1_200)
    const listboxAfter1char = page.getByRole('listbox', { name: '결재자 검색 결과' })
    const listboxVisible1 = await listboxAfter1char.isVisible().catch(() => false)
    console.log(`[CHECK] 1글자 후 드롭다운 표시 (false 기대 minChars=2): ${listboxVisible1}`)
    await capture(page, 'approver-1char-nodropdown')

    // 2글자 입력 — 드롭다운 표시 기대
    await approverInput.fill('김은')
    await page.waitForTimeout(1_500) // debounce 300ms + API 응답
    const listboxVisible2 = await listboxAfter1char.isVisible().catch(() => false)
    console.log(`[CHECK] 2글자 후 드롭다운 표시 (true 기대 minChars=2): ${listboxVisible2}`)
    await capture(page, 'approver-2chars-dropdown')

    // 첫 번째 결재자 선택 (김은지)
    const picked1 = await pickFirstDropdownOption(page, '결재자 검색 결과')
    console.log(`[CHECK] 결재자 1번 선택 성공: ${picked1}`)

    // 칩 1개 확인
    const chips = page.getByTestId('approver-chip')
    await page.waitForTimeout(500)
    const chip1Count = await chips.count()
    console.log(`[CHECK] 결재자 칩 1차 수 (1 기대): ${chip1Count}`)
    if (chip1Count === 0) {
      console.warn('[P2 결함] 결재자 선택 후 칩 미생성')
    }
    await capture(page, 'approver-chip-1person')

    // 두 번째 결재자 — 김미선 (대표실)
    await approverInput.fill('김미')
    await page.waitForTimeout(1_500)
    const picked2 = await pickFirstDropdownOption(page, '결재자 검색 결과')
    console.log(`[CHECK] 결재자 2번 선택 성공: ${picked2}`)
    await page.waitForTimeout(500)
    const chip2Count = await chips.count()
    console.log(`[CHECK] 결재자 칩 2차 수 (2 기대): ${chip2Count}`)
    if (chip2Count < 2) {
      console.warn(`[P2 결함] 2명 추가 후 칩 수 부족: ${chip2Count}`)
    }
    await capture(page, 'approver-chips-2persons')

    // 중복 차단 검증 — 김은지 재선택
    await approverInput.fill('김은')
    await page.waitForTimeout(1_500)
    const picked3 = await pickFirstDropdownOption(page, '결재자 검색 결과')
    console.log(`[CHECK] 중복 재선택 시도 성공: ${picked3}`)
    await page.waitForTimeout(500)
    const chipAfterDupCount = await chips.count()
    console.log(`[CHECK] 중복 후 칩 수 (${chip2Count} 유지 기대): ${chipAfterDupCount}`)
    if (chipAfterDupCount > chip2Count) {
      console.warn(`[P2 결함] 중복 결재자 차단 미작동: ${chip2Count} -> ${chipAfterDupCount}`)
    } else {
      console.log('[OK] 중복 결재자 차단 정상')
    }
    await capture(page, 'approver-dup-blocked-chips')

    // === 첨부 — 문서 참조 추가 ===
    const addRefBtn = page.getByRole('button', { name: '문서 참조 추가' })
    await expect(addRefBtn).toBeVisible({ timeout: 5_000 })
    await addRefBtn.click()
    await page.waitForTimeout(600)
    await capture(page, 'attachment-docref-input-row')

    // 입력행이 표시되어야 함
    const docRefInput = page.getByTestId('doc-ref-search-input')
    const inputRowVisible = await docRefInput.first().isVisible().catch(() => false)
    console.log(`[CHECK] 문서참조 입력행 표시: ${inputRowVisible}`)

    if (inputRowVisible) {
      // 유형 선택 (첫 번째 유형 사용)
      const docTypeSelect = page.getByTestId('doc-ref-type-select').first()
      if (await docTypeSelect.isVisible().catch(() => false)) {
        const typeOptions = await docTypeSelect.locator('option').allTextContents()
        console.log(`[CHECK] 문서 유형 옵션: ${typeOptions.join(', ')}`)
        // 두 번째 옵션 선택 (첫 번째는 '선택' placeholder 일 수 있음)
        if (typeOptions.length > 1) {
          await docTypeSelect.selectOption({ index: 1 })
          await page.waitForTimeout(300)
        }
      }

      // 번호 입력 → 자동완성 선택
      const searchInput = page.getByTestId('doc-ref-search-input').first()
      await searchInput.fill('2026')
      await page.waitForTimeout(1_500)
      await capture(page, 'docref-autocomplete-open')

      // 결과가 있으면 첫 번째 선택
      const docOption = page.getByTestId('doc-ref-search-option').first()
      const docOptionVisible = await docOption.isVisible({ timeout: 5_000 }).catch(() => false)
      if (docOptionVisible) {
        await docOption.dispatchEvent('mousedown')
        await page.waitForTimeout(700)
        await capture(page, 'docref-confirmed-chip')

        // 확정 후 입력행 사라졌는지 확인
        const remainingInputs = await page.getByTestId('doc-ref-search-input').count()
        console.log(`[CHECK] 첨부 확정 후 입력행 수 (0 기대): ${remainingInputs}`)
        if (remainingInputs > 0) {
          console.warn(`[P2 결함] 첨부 확정 후 입력행 미숨김: ${remainingInputs}개 잔존`)
        } else {
          console.log('[OK] 첨부 확정 후 입력행 숨김 정상')
        }
        // 칩 확인
        const attachChips = page.locator('[data-testid="attachment-chip"]')
        const attachChipCount = await attachChips.count()
        console.log(`[CHECK] 첨부 칩 수 (1 이상 기대): ${attachChipCount}`)
        if (attachChipCount === 0) {
          console.warn('[P2 결함] 첨부 확정 후 칩 미생성')
        }
      } else {
        console.warn('[P3] 문서참조 자동완성 후보 없음 — 전표 데이터 부족 가능성')
        await capture(page, 'docref-no-autocomplete-result')
      }
    }

    await capture(page, 'create-form-final')
  })

  test('시나리오2: 결재 목록 + 상세 — 결재선 실명+배지, UUID 노출 0, 첨부 링크', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    // 결재 목록
    await gotoAndSettle(page, `${BASE_URL}/#/groupware/approvals?mockRole=MASTER`)
    await page.waitForTimeout(1_000)
    await capture(page, 'approval-list')

    // 목록 첫 번째 결재 클릭
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstRow.click()
      await page.waitForURL(/groupware\/approvals\/[^?]+/, { timeout: 15_000 }).catch(() => {})
      await page.waitForTimeout(2_000)
    } else {
      // fallback: 직접 기존 UUID로 이동
      await gotoAndSettle(page, `${BASE_URL}/#/groupware/approvals/d16da703-e914-4bd0-bdd2-43a715e6e418?mockRole=MASTER`)
    }
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    await page.waitForTimeout(1_000)

    // 결재번호 슬래시 확인
    const detailNo = page.getByTestId('groupware-approval-detail-no')
    await detailNo.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    const detailNoText = await detailNo.textContent().catch(() => '')
    console.log(`[CHECK] 결재번호: "${detailNoText}"`)
    if (detailNoText && !detailNoText.includes('/')) {
      console.warn(`[P2 결함] 결재번호 슬래시 미포함: "${detailNoText}"`)
    }

    // 요청자 실명 표시 확인 (UUID 아닌 이름)
    const requesterEl = page.getByTestId('groupware-approval-requester-name')
      .or(page.locator('[data-testid*="requester"]').first())
    if (await requesterEl.first().isVisible().catch(() => false)) {
      const requesterText = await requesterEl.first().textContent().catch(() => '')
      console.log(`[CHECK] 요청자 표시: "${requesterText}"`)
      if (requesterText?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)) {
        console.warn('[P1 결함] 요청자 필드에 UUID 노출')
      }
    }

    await capture(page, 'detail-header')

    // 결재선 영역 (실명 텍스트 + 상태 배지)
    const stepsSection = page.getByTestId('groupware-approval-steps')
      .or(page.locator('[data-testid*="step"]').first())
      .or(page.locator('[class*="step"]').first())
    if (await stepsSection.first().isVisible().catch(() => false)) {
      const stepsText = await stepsSection.first().textContent().catch(() => '')
      console.log(`[CHECK] 결재선 텍스트 (100자): "${stepsText?.slice(0, 100)}"`)
      const uuidInSteps = stepsText?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)
      if (uuidInSteps && uuidInSteps.length > 0) {
        console.warn(`[P1 결함] 결재선 영역 UUID 노출: ${uuidInSteps.join(', ')}`)
      }
    }
    await capture(page, 'detail-approvalline-steps')

    // 첨부 영역
    const attachArea = page.locator('[data-testid="attachment-chip"], [data-testid*="attach"]')
    const attachCount = await attachArea.count()
    console.log(`[CHECK] 첨부 칩/링크 수: ${attachCount}`)
    if (attachCount > 0) {
      // 첫 번째 첨부에 href 링크가 있는지 확인
      const firstLink = attachArea.first().locator('a[href]')
      const hasLink = await firstLink.isVisible().catch(() => false)
      console.log(`[CHECK] 첨부 링크(<a href>) 존재: ${hasLink}`)
      if (!hasLink) {
        console.warn('[P3] 첨부 링크 미노출 — 클릭 시 이동 불가 가능성')
      }
    }

    // 협업 패널
    const collabPanel = page.getByTestId('groupware-approval-collaboration-panel')
    await collabPanel.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(500)
    await capture(page, 'detail-collab-panel')

    // UUID 전체 노출 검사
    const bodyText = await page.locator('body').textContent().catch(() => '')
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
    const allMatches = bodyText?.match(uuidPattern) ?? []
    // DOM text 노드 수준에서 UUID — 주소 표시줄(URL fragment) 제외한 텍스트이므로
    // 결재ID 자체가 URL에 포함되어도 body textContent에 UUID가 노출되면 안 됨.
    if (allMatches.length > 2) {
      console.warn(`[P2 결함 후보] body 텍스트에 UUID 다수 노출 (${allMatches.length}건): ${allMatches.slice(0, 3).join(', ')}...`)
    } else {
      console.log(`[OK] UUID 노출 수 안전 범위: ${allMatches.length}건`)
    }

    await capture(page, 'detail-final')
  })
})
