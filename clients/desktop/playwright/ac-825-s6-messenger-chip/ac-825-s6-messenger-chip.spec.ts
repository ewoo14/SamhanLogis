/**
 * #825 슬6 메신저 수신자 칩 복수선택 mock hard gate.
 *
 * 실제 /messenger 라우트와 mock.ts의 시드 수신자(박영업, 최영업 — UUID는 payload 전용)를 사용해
 * 검색·칩 표시·중복 후보 제거·bulk payload 왕복을 확인한다. 화면에는 UUID를 노출하지 않는다
 * (지어낸 id는 화면 노출 검증에만 쓰고 fixture 값으로는 시드 UUID를 그대로 쓴다).
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
const screenshotDir = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/ac-825-s6-messenger-chip/screenshots'))
fs.mkdirSync(screenshotDir, { recursive: true })

function permissionQuery(): string {
  return Buffer.from(JSON.stringify([
    { pageCode: 'messenger.send', view: true, edit: true },
  ]), 'utf8').toString('base64')
}

async function gotoMessenger(page: Page) {
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
  await page.goto(`${BASE}/?mockRole=MASTER&mockPerms=${permissionQuery()}#/messenger`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('messenger-page')).toBeVisible({ timeout: 15_000 })
}

test.describe('AC-825-S6 메신저 수신자 칩 mock 회귀', () => {
  test('R13 수신자가 없으면 발송을 잠그고 시드 수신함은 읽기 전용으로 표시한다', async ({ page }) => {
    await gotoMessenger(page)

    await expect(page.getByRole('button', { name: '발송' })).toBeDisabled()
    await expect(page.getByRole('list', { name: '메신저 수신함' })).toContainText('시드 메신저 메시지입니다.')
    await expect(page.getByText('읽기 전용')).toBeVisible()
  })

  test('R17 수신함을 열면 읽지 않은 시드 쪽지가 읽음 상태로 전환된다', async ({ page }) => {
    await gotoMessenger(page)

    const inbox = page.getByRole('list', { name: '메신저 수신함' })
    await expect(inbox).toContainText('시드 메신저 메시지입니다.')
    await expect.poll(() => page.evaluate(() => (
      (globalThis as typeof globalThis & { __SAMHAN_MOCK_MESSENGER_MARK_READ_CALL_COUNT__?: number })
        .__SAMHAN_MOCK_MESSENGER_MARK_READ_CALL_COUNT__
    ))).toBe(1)
    await expect.poll(() => page.evaluate(() => (
      (globalThis as typeof globalThis & { __SAMHAN_MOCK_LAST_MESSENGER_MARK_READ_STATUS__?: string })
        .__SAMHAN_MOCK_LAST_MESSENGER_MARK_READ_STATUS__
    ))).toBe('READ')
    await expect(inbox.getByText('읽음', { exact: true })).toBeVisible()
    await expect(page.getByTestId('notification-bell')).toHaveAttribute('aria-label', '알림 3건')
  })

  test('R15 칩은 시드 수신자의 이름·부서만 표시하고 opaque id를 노출하지 않는다', async ({ page }) => {
    await gotoMessenger(page)

    const input = page.getByTestId('messenger-recipient-search')
    await input.fill('박')
    const listbox = page.getByRole('listbox', { name: '메신저 수신자 검색 결과' })
    await expect(listbox.getByRole('option').filter({ hasText: '박영업' })).toBeVisible({ timeout: 10_000 })
    await listbox.getByRole('option').filter({ hasText: '박영업' }).click()

    const chip = page.getByTestId('messenger-recipient-chip')
    await expect(chip).toContainText('박영업')
    await expect(chip).toContainText('영업팀')
    await expect(page.getByTestId('messenger-page')).not.toContainText('10000000-0000-0000-0000-000000000303')
  })

  test('R16 선택한 시드 수신자는 재검색 후보에서 제거된다', async ({ page }) => {
    await gotoMessenger(page)

    const input = page.getByTestId('messenger-recipient-search')
    await input.fill('박')
    const listbox = page.getByRole('listbox', { name: '메신저 수신자 검색 결과' })
    await listbox.getByRole('option').filter({ hasText: '박영업' }).click()
    await expect(page.getByTestId('multiselect-chip-count')).toContainText('1개 선택됨')

    await input.fill('박')
    await expect(page.getByText('검색 결과 없음')).toBeVisible({ timeout: 10_000 })
    await expect(listbox.getByRole('option')).toHaveCount(0)
    await expect(page.getByTestId('messenger-recipient-chip')).toHaveCount(1)
  })

  test('R2 bulk 발송은 시드 수신자 순서와 본문을 실제 mock handler까지 전달한다', async ({ page }) => {
    await gotoMessenger(page)

    const input = page.getByTestId('messenger-recipient-search')
    const listbox = page.getByRole('listbox', { name: '메신저 수신자 검색 결과' })
    await input.fill('박')
    await listbox.getByRole('option').filter({ hasText: '박영업' }).click()
    await input.fill('최')
    await listbox.getByRole('option').filter({ hasText: '최영업' }).click()
    await page.getByTestId('messenger-body').fill('시드 bulk 발송 확인')

    // 발송 전 — 칩 2개가 실제로 보이는 시점에 캡처한다(발송 클릭 후는 폼이 초기화되어 칩이 사라진다).
    await expect(page.getByTestId('messenger-recipient-chip')).toHaveCount(2)
    await page.screenshot({ path: path.join(screenshotDir, '01-messenger-bulk-chips.png'), fullPage: true })

    await page.getByRole('button', { name: '발송' }).click()
    await expect.poll(() => page.evaluate(() => (
      (globalThis as typeof globalThis & { __SAMHAN_MOCK_MESSENGER_BULK_CALL_COUNT__?: number })
        .__SAMHAN_MOCK_MESSENGER_BULK_CALL_COUNT__
    ))).toBe(1)
    await expect.poll(() => page.evaluate(() => (
      (globalThis as typeof globalThis & {
        __SAMHAN_MOCK_LAST_MESSENGER_BULK_BODY__?: { recipientIds: string[]; body: string }
      }).__SAMHAN_MOCK_LAST_MESSENGER_BULK_BODY__
    ))).toEqual({
      recipientIds: ['10000000-0000-0000-0000-000000000303', '10000000-0000-0000-0000-000000000304'],
      body: '시드 bulk 발송 확인',
    })
    await expect(page.getByRole('status')).toContainText('2명에게 발송했습니다.')
  })

  test('M-7 동명이인 시드(채권추심 2건)는 담당자코드를 병기해 구분한다', async ({ page }) => {
    await gotoMessenger(page)

    const input = page.getByTestId('messenger-recipient-search')
    await input.fill('채권추심')
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 10_000 })
    const resultList = modal.getByRole('listbox', { name: '검색 결과 선택' })
    await expect(resultList.getByRole('checkbox', { name: '채권추심 (00000)' })).toBeVisible()
    await expect(resultList.getByRole('checkbox', { name: '채권추심 (999-99-99999)' })).toBeVisible()
    await resultList.getByRole('checkbox', { name: '채권추심 (00000)' }).check()
    await resultList.getByRole('checkbox', { name: '채권추심 (999-99-99999)' }).check()
    await modal.getByRole('button', { name: '선택 확정' }).click()
    await expect(page.getByTestId('messenger-recipient-chip')).toHaveCount(2)
    await expect(page.getByTestId('messenger-page')).toContainText('채권추심 (00000)')
    await expect(page.getByTestId('messenger-page')).toContainText('채권추심 (999-99-99999)')

    // 대조군 — 동명이인이 아닌 시드는 평소처럼 코드 병기가 없어야 한다(괄호 병기 없음).
    await input.fill('박영업')
    const listbox = page.getByRole('listbox', { name: '메신저 수신자 검색 결과' })
    const soleOption = listbox.getByRole('option').filter({ hasText: '박영업' })
    await expect(soleOption).toBeVisible({ timeout: 10_000 })
    await expect(soleOption).not.toContainText('(')
  })
})
