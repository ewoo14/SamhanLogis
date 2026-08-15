import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const baseUrl = process.env['AUDIT_BASE_URL']
if (!baseUrl) throw new Error('AUDIT_BASE_URL is required')
const shots = resolveQaShotsDir(path.resolve(process.cwd(), 'playwright/1223-order-convert-flow-real-qa'))

async function login(page: Page) {
  await page.goto(baseUrl!, { waitUntil: 'domcontentloaded' })
  await page.locator('input').nth(0).fill('dev_master')
  await page.locator('input').nth(1).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await page.waitForURL(/#\/$/, { timeout: 20_000 })
}

async function openOrders(page: Page) {
  await page.goto(`${baseUrl}#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: '*,:before,:after{animation:none!important;transition:none!important}' })
  await expect(page.getByTestId('order-convert-open')).toBeVisible()
  await expect(page.locator('[data-testid^="partner-order-select-"]').first()).toBeVisible()
}

async function capture(page: Page, name: string, provenance: string) {
  await page.screenshot({ path: path.join(shots, name), fullPage: true })
  console.log(`[SHOT] ${name} — ${provenance}`)
}

test('주문 개별·병합 전환 정본 흐름을 쓰기 없이 확인한다', async ({ page }) => {
  await login(page)
  await openOrders(page)

  const posts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url())
  })

  const eligible = page.locator('[data-testid^="partner-order-row-"]').filter({ has: page.locator('input:not([disabled])') })
  const count = await eligible.count()
  expect(count).toBeGreaterThanOrEqual(2)
  const first = eligible.nth(0)
  const firstPartner = (await first.locator('td').nth(2).textContent())?.trim()
  let secondIndex = 1
  while (secondIndex < count && ((await eligible.nth(secondIndex).locator('td').nth(2).textContent())?.trim() !== firstPartner)) secondIndex += 1
  expect(secondIndex).toBeLessThan(count)
  await first.locator('input[type="checkbox"]').check()
  await eligible.nth(secondIndex).locator('input[type="checkbox"]').check()
  await expect(page.getByTestId('merge-convert-selection-count')).toContainText('2')
  await page.getByTestId('order-convert-open').click()
  await expect(page.getByTestId('individual-convert-choice-buttons')).toBeVisible()
  await page.waitForTimeout(200)
  console.log('[MODAL_STYLE]', await page.getByTestId('individual-convert-choice-buttons').evaluate((node) => {
    const dialog = node.closest('[role="dialog"]') ?? node
    const style = getComputedStyle(dialog)
    return { opacity: style.opacity, zIndex: style.zIndex, animation: style.animationName, transition: style.transition }
  }))
  await expect(page.getByTestId('individual-convert-action')).toHaveText('개별전환')
  await expect(page.getByTestId('merge-convert-action')).toHaveText('병합전환')
  await capture(page, '08-r3-convert-choice-modal.png', '사용자는 선택 후 출고전표 전환 버튼을 눌러 개별전환·병합전환 중 하나를 고른다.')

  await page.getByTestId('merge-convert-action').click()
  await expect(page.getByTestId('merge-convert-preview')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('merge-convert-irreversible-warning')).toContainText('병합전환')
  await expect(page.getByTestId('merge-convert-irreversible-warning')).not.toContainText('병합 발행')
  await page.waitForTimeout(200)
  console.log('[MERGE_MODAL_STYLE]', await page.getByTestId('merge-convert-preview').evaluate((node) => {
    const dialog = node.closest('[role="dialog"]') ?? node
    const style = getComputedStyle(dialog)
    return { opacity: style.opacity, zIndex: style.zIndex, animation: style.animationName, transition: style.transition }
  }))
  await expect(page.getByTestId('merge-convert-preview-header')).toContainText('첫 번째 주문 기준')
  await expect(page.getByTestId('merge-convert-preview-header')).toContainText('주식회사 중앙유통')
  await expect(page.getByTestId('merge-convert-discarded-header-notice')).toBeVisible()
  await expect(page.getByTestId('partner-order-detail-read-only')).toBeVisible()
  await expect(page.getByTestId('partner-order-detail-read-only')).toContainText('품목명')
  await expect(page.getByTestId('partner-order-detail-read-only')).toContainText('납품가')
  await expect(page.getByTestId('partner-order-detail-read-only')).toContainText('구성품 펼침')
  await expect(page.getByTestId('partner-order-detail-read-only')).toContainText('AJ060MXHNBC1')
  await expect(page.getByTestId('merge-convert-submit')).toHaveAccessibleName('승인')
  await page.keyboard.press('Escape')
  await page.getByTestId('merge-convert-preview').evaluate((node) => {
    let current: HTMLElement | null = node.parentElement
    while (current) {
      current.scrollTop = 0
      current = current.parentElement
    }
  })
  await capture(page, '09-r3-merge-preview-before-approval.png', '사용자는 병합전환을 선택한 뒤 승인 버튼을 누르기 전에 첫 주문 헤더와 병합 품목을 검토한다.')

  await page.getByTestId('merge-convert-cancel').click()
  const detailHref = await first.locator('a').first().getAttribute('href')
  expect(detailHref).toBeTruthy()
  await page.goto(`${baseUrl}${detailHref!}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('주문서 상세', { exact: true })).toBeVisible()
  await capture(page, '10-r4-normal-order-detail.png', '사용자는 주문서 관리 목록의 주문번호를 눌러 평소 보던 주문서 상세 화면으로 이동한다.')
  await page.goto(`${baseUrl}#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
  const status = page.getByTestId('partner-order-list-status-filter')
  await expect(status.locator('option')).toHaveText(['전체', '접수', '완료'])
  await status.selectOption('')
  await expect(status).toHaveValue('')
  await status.selectOption('CONVERTED')
  await expect(status).toHaveValue('CONVERTED')
  await expect(page.locator('[data-testid^="partner-order-row-"]').first()).toContainText('완료')
  await status.selectOption('DRAFT')
  await expect(page.locator('[data-testid^="partner-order-row-"]').first()).toContainText('접수')
  await expect(page.locator('[data-testid^="partner-order-row-"]').first()).not.toContainText('완료')

  expect(posts.filter((url) => url.includes('convert-to-slip'))).toEqual([])
  console.log(`[QA] POST observed: ${posts.length === 0 ? 'none' : posts.join(', ')}`)
})
