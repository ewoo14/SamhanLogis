import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const qaShotsDir = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '897-column-hierarchy'))

type TableGeometry = {
  tableW: number
  clientW: number
  wrapperW: number
  docW: number
  scrollW: number
  headers: string[]
  rowHeights: number[]
  overflowingCells: Array<{ index: number; label: string; clientW: number; scrollW: number }>
}

async function readTableGeometry(table: import('@playwright/test').Locator): Promise<TableGeometry> {
  return table.evaluate((node) => {
    const scroll = node.parentElement
    const wrapper = scroll?.parentElement
    return {
      tableW: Math.round(node.getBoundingClientRect().width),
      clientW: scroll?.clientWidth ?? 0,
      wrapperW: Math.round(wrapper?.getBoundingClientRect().width ?? 0),
      docW: document.documentElement.clientWidth,
      scrollW: scroll?.scrollWidth ?? 0,
      headers: Array.from(node.querySelectorAll('thead th')).map((header) => header.textContent?.trim() ?? ''),
      rowHeights: Array.from(node.querySelectorAll('tbody tr')).map((row) => Math.round(row.getBoundingClientRect().height)),
      overflowingCells: Array.from(node.querySelectorAll('tbody td')).flatMap((cell, index) => {
        if (cell.scrollWidth <= cell.clientWidth) return []
        return [{
          index,
          label: cell.getAttribute('data-label') ?? '',
          clientW: cell.clientWidth,
          scrollW: cell.scrollWidth,
        }]
      }),
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
    const geometry = await readTableGeometry(table)
    console.log('[897 폭 실측] bank', JSON.stringify(geometry))
    expect(geometry.tableW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.scrollW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.headers).toEqual(['선택', '거래일', '적요', '거래처', '입금', '출금', '잔액', '소스', '매칭상태', '상세'])

    const detailToggle = page.getByTestId('bank-transaction-detail-toggle-mock-bank-20260623-001')
    await detailToggle.click()
    const detail = page.getByTestId('bank-transaction-detail-mock-bank-20260623-001')
    await expect(detail).toContainText('국민 123-456')
    await expect(detail).toContainText('파일')
    const detailGeometry = await detail.evaluate((node) => {
      const panel = node as HTMLElement
      const values = Array.from(panel.querySelectorAll('dd')).map((value) => Math.round(value.getBoundingClientRect().width))
      return {
        panelW: Math.round(panel.getBoundingClientRect().width),
        clientW: panel.clientWidth,
        scrollW: panel.scrollWidth,
        valueWidths: values,
      }
    })
    console.log('[897 상세 폭 실측] bank', JSON.stringify(detailGeometry))
    expect(detailGeometry.panelW).toBeGreaterThan(0)
    expect(detailGeometry.valueWidths.every((width) => width > 0), JSON.stringify(detailGeometry)).toBe(true)
    expect(detailGeometry.scrollW, JSON.stringify(detailGeometry)).toBeLessThanOrEqual(detailGeometry.clientW)

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
    expect(geometry.headers).toEqual(['마감일', '구분', '마감범위', '건수', '금액 합계', '마감상태', '작업'])

    await page.getByTestId('daily-closing-detail-button-2026-06-07-ALL-SALES-TAX_INVOICE').click()
    const detail = page.locator('#daily-closing-detail')
    await expect(detail).toContainText('2026/06/07-1')
    await expect(detail).toContainText('삼한거래처')

    await page.screenshot({ path: join(qaShotsDir, 'daily-1600.png'), fullPage: true })
  })

  test('Bank 전체 소스 4탭은 1024~1920px 전 구간에서 표가 wrapper를 넘지 않는다', async ({ page }) => {
    const viewports = [1024, 1280, 1440, 1920]
    const sourceTabs = ['codef-tab-ALL', 'codef-tab-CODEF_BANK', 'codef-tab-CODEF_CARD', 'codef-tab-CODEF_LOAN']

    for (const width of viewports) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/#/accounting/bank-transactions?mockRole=MASTER', { waitUntil: 'domcontentloaded' })
      await showBankRows(page)

      for (const sourceTab of sourceTabs) {
        await page.getByTestId(sourceTab).click()
        const table = page.locator('.bank-transaction-table:visible table').first()
        await expect(table).toBeVisible()
        const geometry = await readTableGeometry(table)
        console.log('[897 폭 실측] bank matrix', width, sourceTab, JSON.stringify(geometry))
        expect(geometry.tableW, JSON.stringify({ width, sourceTab, ...geometry })).toBeLessThanOrEqual(geometry.wrapperW)
        expect(geometry.scrollW, JSON.stringify({ width, sourceTab, ...geometry })).toBeLessThanOrEqual(geometry.wrapperW)
        expect(geometry.overflowingCells, JSON.stringify({ width, sourceTab, ...geometry })).toEqual([])
      }
    }
  })

  test('일마감 표도 1024~1920px 전 구간에서 셀 내용이 옆 셀을 넘지 않는다', async ({ page }) => {
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/#/accounting/daily-closing?mockRole=MASTER', { waitUntil: 'domcontentloaded' })

      const table = page.getByTestId('daily-closing-list-table').locator('table')
      await expect(table).toBeVisible()
      const geometry = await readTableGeometry(table)
      console.log('[897 폭 실측] daily matrix', width, JSON.stringify(geometry))
      expect(geometry.tableW, JSON.stringify({ width, ...geometry })).toBeLessThanOrEqual(geometry.wrapperW)
      expect(geometry.scrollW, JSON.stringify({ width, ...geometry })).toBeLessThanOrEqual(geometry.wrapperW)
      expect(geometry.overflowingCells, JSON.stringify({ width, ...geometry })).toEqual([])
    }
  })

  test('선택 셀은 입금보고서 전표 배지로 거래일 셀을 침범하지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/#/accounting/bank-transactions?mockRole=MASTER', { waitUntil: 'domcontentloaded' })
    await showBankRows(page)

    const checkbox = page.getByTestId('bank-transaction-select-mock-bank-20260621-003')
    const selectionCell = checkbox.locator('xpath=ancestor::td')
    await expect(selectionCell).toBeVisible()
    await expect(selectionCell.getByTestId('bank-transaction-cash-receipt-slip-mock-bank-20260621-003')).toHaveCount(0)
    const nextCell = selectionCell.locator('xpath=following-sibling::td[1]')
    const geometry = await selectionCell.evaluate((cell) => {
      const rect = cell.getBoundingClientRect()
      const next = cell.nextElementSibling?.getBoundingClientRect()
      return {
        right: rect.right,
        nextLeft: next?.left ?? 0,
        scrollW: cell.scrollWidth,
        clientW: cell.clientWidth,
      }
    })
    expect(geometry.scrollW).toBeLessThanOrEqual(geometry.clientW)
    expect(geometry.right).toBeLessThanOrEqual(geometry.nextLeft)
    await expect(nextCell).toBeVisible()
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
    const dailyAction = page.getByTestId('daily-closing-reverse-button-2026-06-07-ALL-SALES-TAX_INVOICE')
    await expect(dailyAction).toBeVisible()
    await expect(dailyAction).toBeEnabled()
    await dailyAction.click({ trial: true })
  })
})
