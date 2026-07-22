/**
 * #825 슬6 메신저 수신자 칩 복수선택 mock hard gate.
 *
 * 실제 /messenger 라우트와 mock.ts의 시드 수신자(user-003, user-004)를 사용해
 * 검색·칩 표시·중복 후보 제거·bulk payload 왕복을 확인한다. UUID나 지어낸 사용자 id는
 * 화면에 노출하거나 스펙 fixture로 만들지 않는다.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotDir = path.resolve(dirname, '../../../../docs/qa/ac-825-s6-messenger-chip/screenshots')
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
    await expect(page.getByTestId('messenger-page')).not.toContainText('user-003')
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

    await page.getByRole('button', { name: '발송' }).click()
    await expect.poll(() => page.evaluate(() => (
      (globalThis as typeof globalThis & { __SAMHAN_MOCK_MESSENGER_BULK_CALL_COUNT__?: number })
        .__SAMHAN_MOCK_MESSENGER_BULK_CALL_COUNT__
    ))).toBe(1)
    await expect.poll(() => page.evaluate(() => (
      (globalThis as typeof globalThis & {
        __SAMHAN_MOCK_LAST_MESSENGER_BULK_BODY__?: { recipientIds: string[]; body: string }
      }).__SAMHAN_MOCK_LAST_MESSENGER_BULK_BODY__
    ))).toEqual({ recipientIds: ['user-003', 'user-004'], body: '시드 bulk 발송 확인' })
    await expect(page.getByRole('status')).toContainText('2명에게 발송했습니다.')
    await page.screenshot({ path: path.join(screenshotDir, '01-messenger-bulk-chips.png'), fullPage: true })
  })
})
