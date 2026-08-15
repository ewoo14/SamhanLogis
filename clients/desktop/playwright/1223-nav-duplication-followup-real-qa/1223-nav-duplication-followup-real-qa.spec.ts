import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL']
if (!BASE_URL) throw new Error('AUDIT_BASE_URL가 필요합니다 — 실서버 렌더러 주소를 지정하십시오.')

const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), 'playwright/1223-nav-duplication-followup-real-qa'))

async function login(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('input').nth(0).fill('dev_master')
  await page.locator('input').nth(1).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await page.waitForURL(/#\/$/, { timeout: 20_000 })
  await page.waitForTimeout(1000)
}

async function openRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}#${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
}

async function capture(page: Page, name: string, provenance: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true })
  console.log(`[SHOT] ${name} — ${provenance}`)
}

async function filterRows(page: Page, testIds: string[]): Promise<number> {
  const boxes = await Promise.all(testIds.map((id) => page.getByTestId(id).boundingBox()))
  const y = boxes.filter((box): box is NonNullable<typeof box> => Boolean(box)).map((box) => Math.round(box.y))
  console.log('[FILTER BOX Y]', JSON.stringify(testIds.map((id, index) => ({ id, y: boxes[index]?.y ?? null }))))
  return y.sort((a, b) => a - b).reduce((rows, current) => {
    if (rows.length === 0 || current - rows[rows.length - 1] > 8) rows.push(current)
    return rows
  }, [] as number[]).length
}

test('라이브 QA — 외부 링크 사이드바 형태·route 유지·fail-closed', async ({ page }) => {
  await login(page)
  await openRoute(page, '/sales/estimates')

  const sidebarEstimate = page.getByRole('button', { name: '웹 종합견적서 ↗', exact: true })
  const sidebarOrder = page.getByRole('button', { name: '웹 주문서 ↗', exact: true })
  await expect(sidebarEstimate).toBeVisible()
  await expect(sidebarOrder).toBeVisible()
  await expect(sidebarEstimate).toHaveClass(/app-sidebar-link/)
  await expect(sidebarOrder).toHaveClass(/app-sidebar-link/)

  const sidebarAnchor = page.locator('.app-sidebar nav a').first()
  const anchorStyles = await sidebarAnchor.evaluate((node) => {
    const style = getComputedStyle(node)
    return { display: style.display, padding: style.padding, borderRadius: style.borderRadius, color: style.color }
  })
  const externalStyles = await sidebarEstimate.evaluate((node) => {
    const style = getComputedStyle(node)
    return { display: style.display, padding: style.padding, borderRadius: style.borderRadius, color: style.color }
  })
  expect(externalStyles).toEqual(anchorStyles)
  await capture(page, '01-sidebar-external-link-shape.png', '사용자는 로그인 후 판매 사이드바에서 외부 웹앱 진입구를 확인한다.')

  const beforeUrl = page.url()
  await sidebarEstimate.click()
  await expect(page).toHaveURL(beforeUrl)
  await expect(page.getByRole('alert')).toContainText('외부 웹앱 주소가 운영 빌드에 설정되지 않았습니다')
  await capture(page, '02-external-link-route-stable.png', '사용자는 판매 사이드바의 웹 종합견적서 ↗를 클릭하고 현재 화면에 그대로 남는다.')
})

test('라이브 QA — 견적서 관리 문구 제거와 필터 2~3행', async ({ page }) => {
  const requestsWithDeleted: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('includeDeleted')) requestsWithDeleted.push(request.url())
  })
  await login(page)
  await openRoute(page, '/sales/estimates')

  await expect(page.getByTestId('estimate-audience-banner')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('내부 영업·관리자용 화면입니다')
  await expect(page.getByTestId('estimate-list-include-deleted')).toHaveCount(0)
  const rows = await filterRows(page, [
    'estimate-list-filter-status',
    'estimate-list-filter-start',
    'estimate-list-filter-end',
    'estimate-list-filter-partner',
  ])
  console.log('[ESTIMATE FILTER ROWS]', rows)
  expect(rows).toBeGreaterThanOrEqual(1)
  expect(rows).toBeLessThanOrEqual(3)
  expect(requestsWithDeleted).toEqual([])
  await capture(page, '03-estimates-no-banner-filter-layout.png', '사용자는 로그인 후 판매 사이드바에서 견적서 관리로 이동한다.')
})

test('라이브 QA — 주문서 관리 문구·삭제 파라미터·서버 기본 제외와 필터 2~3행', async ({ page }) => {
  const requestsWithDeleted: string[] = []
  const orderResponses: Array<{ isDeleted?: boolean }> = []
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('includeDeleted')) requestsWithDeleted.push(request.url())
  })
  page.on('response', async (response) => {
    if (response.request().method() !== 'GET' || !response.url().includes('/api/v1/partner-orders')) return
    try {
      const body = await response.json() as { data?: { content?: Array<{ isDeleted?: boolean }> } }
      orderResponses.push(...(body.data?.content ?? []))
    } catch {
      // 목록 외 응답은 관측 대상이 아니다.
    }
  })
  await login(page)
  await openRoute(page, '/sales/partner-orders')
  await page.waitForTimeout(1000)

  await expect(page.getByTestId('partner-order-audience-banner')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('내부 영업·관리자용 화면입니다')
  await expect(page.getByTestId('partner-order-list-include-deleted')).toHaveCount(0)
  const rows = await filterRows(page, [
    'partner-order-list-date-from',
    'partner-order-list-date-to',
    'partner-order-list-partner-filter',
    'partner-order-list-status-filter',
    'partner-order-list-slip-publish-filter',
    'partner-order-list-keyword-filter',
  ])
  console.log('[ORDER FILTER ROWS]', rows)
  console.log('[ORDER RESPONSE ROWS]', orderResponses.length)
  console.log('[ORDER RESPONSE DELETED ROWS]', orderResponses.filter((row) => row.isDeleted === true).length)
  expect(rows).toBeGreaterThanOrEqual(1)
  expect(rows).toBeLessThanOrEqual(3)
  expect(requestsWithDeleted).toEqual([])
  expect(orderResponses.length).toBeGreaterThan(0)
  expect(orderResponses.some((row) => row.isDeleted === true)).toBe(false)
  await capture(page, '04-orders-no-banner-filter-layout.png', '사용자는 로그인 후 판매 사이드바에서 주문서 관리로 이동한다.')
})
