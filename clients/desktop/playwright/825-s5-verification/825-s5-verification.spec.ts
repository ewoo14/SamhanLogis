/** PR #1120 / #825 S5 — 공용 검색결과 선택 모달 최종 도달성 검증. */
import * as path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa-shots/825-s5-verify'))
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

function permissionQuery(pageCodes: string[]): string {
  return Buffer.from(JSON.stringify(pageCodes.map((pageCode) => ({
    pageCode,
    view: true,
    edit: true,
    create: true,
    update: true,
    delete: true,
  }))), 'utf8').toString('base64')
}

async function gotoMock(page: Page, hash: string, pageCodes: string[] = []): Promise<void> {
  const query = pageCodes.length > 0
    ? `?mockRole=MASTER&mockPerms=${permissionQuery(pageCodes)}`
    : '?mockRole=MASTER'
  await page.goto(`${BASE}/${query}#${hash}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
}

async function assertNoUuid(page: Page): Promise<void> {
  expect((await page.locator('body').textContent()) ?? '').not.toMatch(UUID_PATTERN)
}

async function labelsOf(inputs: Locator): Promise<string[]> {
  return inputs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))
}

test.describe('#825 S5 대표 3화면·신규 경계 도달성', () => {
  test('결재자 multiple — 내부 검색, 키보드 이동, 필터 밖 선택 유지, IME, 확정', async ({ page }) => {
    await gotoMock(page, '/admin/approval-line-config', ['admin.approval-line-config'])
    const outer = page.getByTestId('approval-role-approver-search-출고자')
    await outer.fill('팀')

    const dialog = page.getByRole('dialog', { name: '출고자 결재자 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    const search = dialog.getByRole('searchbox', { name: '검색 결과 필터' })
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('')

    const boxes = dialog.getByRole('checkbox')
    await expect(boxes).toHaveCount(3)
    const labels = await labelsOf(boxes)
    expect(labels.every(Boolean)).toBe(true)

    // 초기 포커스에서 Tab 한 번으로 첫 후보에 도달한다.
    await page.keyboard.press('Tab')
    await expect(boxes.first()).toBeFocused()
    await page.keyboard.press('Space')

    // 첫 선택이 필터 밖으로 사라져도 선택 상태는 유지된다.
    const secondLabel = labels[1]!
    await search.fill(secondLabel)
    await expect(dialog.getByRole('checkbox', { name: secondLabel })).toBeVisible()
    await expect(dialog.getByRole('checkbox', { name: labels[0]! })).toHaveCount(0)
    await dialog.getByRole('checkbox', { name: secondLabel }).check()

    // 한글 IME 조합 이벤트 중에도 입력/필터가 살아 있고 취소 경로가 잠기지 않는다.
    const koreanLabel = labels.find((label) => /[가-힣]/.test(label))!
    const koreanQuery = koreanLabel.match(/[가-힣]{1,2}/)?.[0] ?? koreanLabel
    await search.evaluate((element, value) => {
      const input = element as HTMLInputElement
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
      setValue?.call(input, value)
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: value,
        inputType: 'insertCompositionText',
        isComposing: true,
      }))
      input.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: value }))
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: value }))
    }, koreanQuery)
    await expect(search).toHaveValue(koreanQuery)
    await expect(dialog.getByRole('checkbox').first()).toBeVisible()

    await search.fill('')
    await expect(dialog.getByRole('checkbox', { name: labels[0]! })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: secondLabel })).toBeChecked()
    await dialog.screenshot({ path: path.join(SHOTS, '01-approval-multiple-filter-retains-selection.png') })
    await dialog.getByRole('button', { name: '선택 확정' }).click()
    await expect(page.getByTestId('approval-role-approver-chip')).toHaveCount(2)
    await assertNoUuid(page)
  })

  test('은행거래 single — 첫 글자 뒤 내부 검색으로 목표 거래처 도달·확정', async ({ page }) => {
    await gotoMock(page, '/accounting/bank-transactions', [
      'accounting.bank-matching',
      'accounting.bank-transactions',
    ])
    const filterDates = page.locator('input[type="date"]')
    await filterDates.nth(2).fill('2026-06-01')
    await filterDates.nth(3).fill('2026-06-30')
    await page.getByRole('button', { name: '조회' }).click()
    const outer = page
      .getByTestId('bank-transaction-partner-search-CSV_IMPORT-mock-bank-20260624-005')
      .getByRole('combobox')
    await outer.fill('P')

    const dialog = page.getByRole('dialog', { name: '거래처 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    const radios = dialog.getByRole('radio')
    expect(await radios.count()).toBeGreaterThan(1)
    const labels = await labelsOf(radios)
    const target = labels.at(-1)!
    const search = dialog.getByRole('searchbox', { name: '검색 결과 필터' })
    await expect(search).toBeFocused()
    await search.fill(target)
    await expect(dialog.getByRole('radio')).toHaveCount(1)
    await dialog.getByRole('radio', { name: target }).check()
    await dialog.screenshot({ path: path.join(SHOTS, '02-bank-partner-filtered-target.png') })
    await dialog.getByRole('button', { name: '선택 확정' }).click()
    await expect(dialog).toBeHidden()
    await expect(outer).not.toHaveValue('P')
    await assertNoUuid(page)
  })

  test('병합전환 single — 0건에서 확정 잠김·취소 가능, 재진입 후 목표 창고 확정', async ({ page }) => {
    await gotoMock(page, '/sales/partner-orders')
    await page.getByTestId('merge-convert-open').click()
    const outer = page.getByTestId('merge-convert-warehouse').getByRole('combobox')
    await outer.fill('창')

    const dialog = page.getByRole('dialog', { name: '출고 창고 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    const search = dialog.getByRole('searchbox', { name: '검색 결과 필터' })
    await search.fill('존재하지않는창고')
    await expect(dialog.getByText('검색 결과가 없습니다.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: '선택 확정' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: '취소' })).toBeEnabled()
    await dialog.screenshot({ path: path.join(SHOTS, '03-warehouse-zero-results-cancel-enabled.png') })
    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(dialog).toBeHidden()
    await expect(outer).toBeFocused()

    await outer.fill('')
    await outer.fill('창')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(dialog).toBeHidden()
    await expect(outer).toBeFocused()
    await outer.fill('')
    await outer.fill('창')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    const radios = dialog.getByRole('radio')
    expect(await radios.count()).toBeGreaterThan(1)
    const labels = await labelsOf(radios)
    const target = labels.find((label) => label.includes('HQ')) ?? labels[0]!
    await dialog.getByRole('searchbox', { name: '검색 결과 필터' }).fill(target)
    await expect(dialog.getByRole('radio')).toHaveCount(1)
    await dialog.getByRole('radio', { name: target }).check()
    await dialog.getByRole('button', { name: '선택 확정' }).click()
    await expect(dialog).toBeHidden()
    await expect(outer).not.toHaveValue('창')
    await assertNoUuid(page)
  })
})

test.describe('#825 S5 기존 소비처 추가 표면', () => {
  test('입금자명 매핑 — 내부 검색어 공란이면 전체 후보를 유지하고 단일 확정', async ({ page }) => {
    await gotoMock(page, '/accounting/deposit-mappings', ['accounting.deposit-mapping'])
    await page.getByTestId('depositor-mapping-create').click()
    const outer = page.getByTestId('depositor-mapping-partner')
    await outer.fill('P')

    const dialog = page.getByRole('dialog', { name: '거래처 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    const search = dialog.getByRole('searchbox', { name: '검색 결과 필터' })
    await expect(search).toHaveValue('')
    const radios = dialog.getByRole('radio')
    expect(await radios.count()).toBeGreaterThan(1)
    await radios.first().check()
    await dialog.getByRole('button', { name: '선택 확정' }).click()
    await expect(dialog).toBeHidden()
    await expect(outer).not.toHaveValue('P')
    await assertNoUuid(page)
  })
})
