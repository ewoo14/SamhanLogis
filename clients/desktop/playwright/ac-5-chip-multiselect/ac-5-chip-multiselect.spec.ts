/**
 * #825 슬4 — 칩 복수선택 표준 컴포넌트 mock hard gate.
 *
 * 결재작성·결재선설정·결재양식의 실제 화면을 VITE_MOCK_MODE로 렌더링해
 * 칩 delta, 순서, 복합키, optionsJson 왕복, UUID 비공개를 검증한다.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const dirname = path.dirname(fileURLToPath(import.meta.url))
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const screenshotDir = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/ac-5-chip-multiselect/screenshots'))
fs.mkdirSync(screenshotDir, { recursive: true })

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
const HEX_UUID_PREFIX = /[0-9a-f]{8}-[0-9a-f]{4}-/i

async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

function permissionQuery(pageCodes: string[]): string {
  const permissions = pageCodes.map((pageCode) => ({ pageCode, view: true, edit: true }))
  return Buffer.from(JSON.stringify(permissions), 'utf8').toString('base64')
}

async function gotoPage(page: Page, route: string, pageCodes: string[]): Promise<void> {
  await installAuthMock(page)
  const permissions = permissionQuery(pageCodes)
  await page.goto(`${BASE}/?mockRole=MASTER&mockPerms=${permissions}#${route}`, {
    waitUntil: 'domcontentloaded',
  })
  // 고정 sleep 대신 앱 셸(AppLayout main) 렌더 신호로 안정화한다(flaky 완화).
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true })
}

async function chooseApprover(page: Page, name: string): Promise<void> {
  const input = page.getByTestId('approver-search-input')
  await input.fill(name)
  const listbox = page.getByRole('listbox', { name: '결재자 검색 결과' })
  await expect(listbox).toBeVisible({ timeout: 10_000 })
  await listbox.getByRole('option').filter({ hasText: name }).first().click()
}

test.describe('AC-5 칩 복수선택 foundation·결재작성', () => {
  test('연속 추가·dedup·remove focus·키보드 제거·UUID 비공개', async ({ page }) => {
    await gotoPage(page, '/groupware/approvals/new', ['groupware.approvals'])
    await expect(page.getByTestId('groupware-approval-create-template')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('groupware-approval-create-template').selectOption({ label: '지출결의서' })
    // 고정 sleep 대신 결재자 검색 입력이 상호작용 가능해질 때까지 대기한다(flaky 완화).
    await expect(page.getByTestId('approver-search-input')).toBeVisible({ timeout: 10_000 })

    await chooseApprover(page, '김기철')
    await chooseApprover(page, '김은지')
    const chips = page.getByTestId('approver-chip')
    await expect(chips).toHaveCount(2)
    await expect(chips.first()).toContainText('1')
    await expect(chips.nth(1)).toContainText('2')

    // 이미 선택한 userId는 새 검색 결과에 나오지 않아 중복 add가 불가능하다.
    const input = page.getByTestId('approver-search-input')
    await input.fill('김기철')
    await expect(page.getByText('검색 결과 없음')).toBeVisible({ timeout: 10_000 })
    await expect(chips).toHaveCount(2)

    const firstRemove = page.getByRole('button', { name: '김기철 (영업2팀) 제거' })
    await firstRemove.click()
    await expect(input).toBeFocused()
    await expect(chips).toHaveCount(1)
    await expect(chips.first()).toContainText('1')

    await input.fill('김기철')
    const opaqueList = page.getByRole('listbox', { name: '결재자 검색 결과' })
    await expect(opaqueList.getByRole('option').first()).toBeVisible({ timeout: 10_000 })
    const optionIds = await opaqueList.getByRole('option').evaluateAll((items) => items.map((item) => item.id))
    for (const id of optionIds) {
      expect(id).toMatch(/-opt-\d+$/)
      expect(id).not.toMatch(HEX_UUID_PREFIX)
    }
    const bodyText = (await page.locator('body').textContent()) ?? ''
    expect(bodyText).not.toMatch(UUID_PATTERN)

    await opaqueList.getByRole('option').first().click()
    const keyboardRemove = page.getByRole('button', { name: '김기철 (영업2팀) 제거' })
    await keyboardRemove.focus()
    await page.keyboard.press('Space')
    await expect(chips).toHaveCount(1)

    await chooseApprover(page, '김기철')
    const enterRemove = page.getByRole('button', { name: '김기철 (영업2팀) 제거' })
    await enterRemove.focus()
    await page.keyboard.press('Enter')
    await expect(chips).toHaveCount(1)
    await capture(page, '01-create-multiselect')
  })

  test('결재작성 payload 순서는 approverIds와 칩 순서를 유지한다', async ({ page }) => {
    await gotoPage(page, '/groupware/approvals/new', ['groupware.approvals'])
    await page.getByTestId('groupware-approval-create-template').selectOption({ label: '지출결의서' })
    // 고정 sleep 대신 결재자 검색 입력이 상호작용 가능해질 때까지 대기한다(flaky 완화).
    await expect(page.getByTestId('approver-search-input')).toBeVisible({ timeout: 10_000 })
    await chooseApprover(page, '김은지')
    await chooseApprover(page, '김기철')
    await expect(page.getByTestId('approver-chip').first()).toContainText('1')
    await expect(page.getByTestId('approver-chip').first()).toContainText('김은지')
    await expect(page.getByTestId('approver-chip').nth(1)).toContainText('김기철')

    await page.getByTestId('groupware-approval-create-title').fill('결재자 payload 순서 검증')
    await page.getByTestId('dynamic-approval-field-expenseItem').fill('QA 지출항목')
    await page.getByTestId('dynamic-approval-field-amount').fill('1000')
    await page.getByTestId('dynamic-approval-field-accountCode').selectOption('복리후생비')
    await page.getByTestId('dynamic-approval-field-expenseDate').fill('2026-07-18')
    await page.getByTestId('groupware-approval-create-submit').click()

    // mock adapter가 실제 생성 POST handler에서 캡처한 요청 배열을 칩 순서와 직접 대조한다.
    await expect.poll(() => page.evaluate(() => (
      (window as unknown as {
        __SAMHAN_MOCK_LAST_GROUPWARE_APPROVAL_CREATE_BODY__?: { approverIds: string[] }
      }).__SAMHAN_MOCK_LAST_GROUPWARE_APPROVAL_CREATE_BODY__?.approverIds
    ))).toEqual([
      '00000000-0000-0000-0000-000000010003',
      '00000000-0000-0000-0000-000000010002',
    ])
    await capture(page, '02-create-order')
  })
})

test.describe('AC-5 결재선설정·결재양식', () => {
  test('GROUP/USER 복합키 add와 저장 id DELETE를 화면에서 왕복한다', async ({ page }) => {
    await gotoPage(page, '/admin/approval-line-config', ['admin.approval-line-config'])
    const groupInput = page.getByTestId('approval-role-approver-search-출고자')
    await expect(groupInput).toBeVisible({ timeout: 10_000 })
    await groupInput.fill('매니저')
    const groupList = page.getByRole('listbox', { name: '출고자 결재자 검색 결과' })
    await expect(groupList).toBeVisible({ timeout: 10_000 })
    await groupList.getByRole('option').filter({ hasText: '매니저' }).first().click()
    await expect(page.getByTestId('approval-role-approver-chip')).toContainText('매니저')

    await groupInput.fill('김기철')
    const userList = page.getByRole('listbox', { name: '출고자 결재자 검색 결과' })
    await expect(userList).toBeVisible({ timeout: 10_000 })
    await userList.getByRole('option').filter({ hasText: '김기철' }).first().click()
    await expect(page.getByTestId('approval-role-approver-chip')).toHaveCount(2)

    const userRemove = page.getByRole('button', { name: '김기철 제거' })
    await userRemove.click()
    await expect(page.getByTestId('approval-role-approver-chip')).toHaveCount(1)
    const bodyText = (await page.locator('body').textContent()) ?? ''
    expect(bodyText).not.toMatch(UUID_PATTERN)
    await capture(page, '03-line-config')
  })

  test('SELECT 옵션은 문자열 칩으로 편집하고 빈 목록 저장을 차단한다', async ({ page }) => {
    await gotoPage(page, '/groupware/approval-templates', ['groupware.approval-templates'])
    await expect(page.getByText('지출결의서').first()).toBeVisible({ timeout: 10_000 })
    await page.getByText('지출결의서').first().click()
    const optionInput = page.getByRole('textbox', { name: '선택 옵션' })
    await expect(optionInput).toBeVisible({ timeout: 10_000 })

    await optionInput.fill('새 옵션, 새 옵션,  추가 옵션 ')
    await optionInput.press('Enter')
    await expect(page.getByText('새 옵션')).toBeVisible()
    await expect(page.getByText('추가 옵션')).toBeVisible()
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('저장했습니다.', { timeout: 10_000 })

    const optionRemoveButtons = page.getByRole('button', { name: /제거$/ })
    const count = await optionRemoveButtons.count()
    for (let index = count - 1; index >= 0; index -= 1) {
      await optionRemoveButtons.nth(index).click()
    }
    await expect(page.getByRole('button', { name: '저장', exact: true })).toBeDisabled()
    await capture(page, '04-template-free-text')
  })
})
