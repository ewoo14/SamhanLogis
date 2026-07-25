import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const qaShotsDir = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '897-column-hierarchy'))

type TableGeometry = {
  tableW: number
  wrapperW: number
  docW: number
  scrollW: number
  headers: string[]
}

async function readTableGeometry(table: import('@playwright/test').Locator): Promise<TableGeometry> {
  return table.evaluate((node) => {
    const scroll = node.parentElement
    const wrapper = scroll?.parentElement
    return {
      tableW: Math.round(node.getBoundingClientRect().width),
      wrapperW: Math.round(wrapper?.getBoundingClientRect().width ?? 0),
      docW: document.documentElement.clientWidth,
      scrollW: scroll?.scrollWidth ?? 0,
      headers: Array.from(node.querySelectorAll('thead th')).map((header) => header.textContent?.trim() ?? ''),
    }
  })
}

async function showBankRows(page: import('@playwright/test').Page): Promise<void> {
  // mock seed는 2026년 6월 거래이므로 조회 기간을 명시해 오늘 날짜에 의존하지 않는다.
  const queryFrom = page.getByRole('textbox', { name: '시작일' }).nth(1)
  const queryTo = page.getByRole('textbox', { name: '종료일' }).nth(1)
  await queryFrom.fill('2026-06-01')
  await queryTo.fill('2026-06-30')
  await page.getByRole('button', { name: '조회', exact: true }).click()
}

test.describe('897 열 계층화 mock 회귀 울타리', () => {
  test('입출금 내역은 핵심 열만 폭 안에 표시되고 감춘 계좌 값은 상세에서 읽힌다', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/#/accounting/bank-transactions?mockRole=MASTER', { waitUntil: 'domcontentloaded' })

    const table = page.locator('.bank-transaction-table table').first()
    await expect(table).toBeVisible()
    await showBankRows(page)
    await expect(page.getByTestId('bank-transaction-detail-mock-bank-20260623-001')).toBeVisible()
    const geometry = await readTableGeometry(table)
    console.log('[897 폭 실측] bank', JSON.stringify(geometry))
    expect(geometry.tableW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.scrollW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.headers).toEqual(['선택', '거래일', '적요', '거래처', '입금', '출금', '잔액', '소스', '매칭상태', '상세'])

    const detail = page.getByTestId('bank-transaction-detail-mock-bank-20260623-001')
    await detail.locator('summary').click()
    await expect(detail).toContainText('국민 123-456')
    await expect(detail).toContainText('파일')

    await page.screenshot({ path: join(qaShotsDir, 'bank-1600.png'), fullPage: true })
  })

  test('일일 마감은 핵심 열만 폭 안에 표시되고 상세 경로에서 세부 값을 읽는다', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/#/accounting/daily-closing?mockRole=MASTER', { waitUntil: 'domcontentloaded' })

    const table = page.getByTestId('daily-closing-list-table').locator('table')
    await expect(table).toBeVisible()
    const geometry = await readTableGeometry(table)
    console.log('[897 폭 실측] daily', JSON.stringify(geometry))
    expect(geometry.tableW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.scrollW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.headers).toEqual(['마감일', '구분', '건수', '금액 합계', '마감상태', '상세', ''])

    await page.getByTestId('daily-closing-detail-button-2026-06-07-SALES-TAX_INVOICE').click()
    const detail = page.locator('#daily-closing-detail')
    await expect(detail).toContainText('2026/06/07-1')
    await expect(detail).toContainText('삼한거래처')

    await page.screenshot({ path: join(qaShotsDir, 'daily-1600.png'), fullPage: true })
  })

  test('좁은 폭에서도 #880 조작 버튼은 DOM에 있고 클릭 가능한 상태다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/#/accounting/bank-transactions?mockRole=MASTER', { waitUntil: 'domcontentloaded' })
    await showBankRows(page)
    const bankAction = page.getByRole('button', { name: '이 거래만 해제' }).first()
    await expect(bankAction).toBeVisible()
    await expect(bankAction).toBeEnabled()
    await bankAction.click({ trial: true })

    await page.goto('/#/accounting/daily-closing?mockRole=MASTER', { waitUntil: 'domcontentloaded' })
    const dailyAction = page.getByTestId('daily-closing-reverse-button-2026-06-07-SALES-TAX_INVOICE')
    await expect(dailyAction).toBeVisible()
    await expect(dailyAction).toBeEnabled()
    await dailyAction.click({ trial: true })
  })
})
