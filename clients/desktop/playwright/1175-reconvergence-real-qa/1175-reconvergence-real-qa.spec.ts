import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const APP = 'http://127.0.0.1:39873'
const AUTH = 'http://127.0.0.1:39881'
const GATEWAY = 'http://127.0.0.1:39880'
const SHOTS = path.resolve('../../docs/qa/2026-08-12-1175-reconvergence')
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i

type Session = { token: string; userId?: string; role?: string; displayName?: string }
type BadgeStyle = { text: string; color: string; backgroundColor: string; borderColor: string }

const ORDER_LABELS: Record<string, string> = {
  DRAFT: '진행중', ON_HOLD: '보류', CONFIRMING: '확인중', CONFIRMED: '완료', CANCELED: '취소', CONVERTED: '전환완료',
}
const ESTIMATE_LABELS: Record<string, string> = {
  QUOTE_DRAFT: '작성중', QUOTE_SENT: '발송완료', QUOTE_ACCEPTED: '수주완료', QUOTE_REJECTED: '거절', QUOTE_CONVERTED: '전표변환완료',
}

async function badgeStyle(locator: Locator): Promise<BadgeStyle> {
  await expect(locator).toBeVisible()
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      text: element.textContent?.trim() ?? '',
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
    }
  })
}

async function isolatedSession(page: Page): Promise<Session> {
  const response = await page.request.post(`${AUTH}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(response.status()).toBe(200)
  const payload = await response.json() as { data: Session }
  expect(payload.data.token).toBeTruthy()
  return payload.data
}

async function installSession(page: Page, session: Session): Promise<void> {
  await page.addInitScript((auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
    Object.defineProperty(window, 'samhanUpdater', {
      configurable: true,
      value: {
        onStatus: (callback: (status: { kind: string }) => void) => {
          setTimeout(() => callback({ kind: 'not-available' }), 0)
          return () => undefined
        },
        check: async () => undefined,
        install: async () => undefined,
        quit: async () => undefined,
      },
    })
  }, {
    token: session.token,
    userId: session.userId,
    role: session.role,
    fullName: session.displayName ?? 'dev_master',
    partnerCode: null,
  })
}

async function assertVisibleSurface(page: Page, title: string): Promise<string> {
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(UUID)
  expect(text).not.toContain('undefined')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  return text
}

test('격리 실서비스 주문·견적 네 화면과 상태 11종', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await isolatedSession(page)
  await installSession(page, session)

  const headers = { Authorization: `Bearer ${session.token}` }
  const ordersResponse = await page.request.get(`${GATEWAY}/api/v1/partner-orders?size=100`, { headers })
  expect(ordersResponse.status()).toBe(200)
  const ordersPayload = await ordersResponse.json() as { data: { content: Array<{ orderNumber: string; status: string }> } }
  const order = ordersPayload.data.content[0]
  expect(order?.orderNumber).toBeTruthy()

  const estimatesResponse = await page.request.get(`${GATEWAY}/slips/estimates?size=100`, { headers })
  expect(estimatesResponse.status()).toBe(200)
  const estimatesPayload = await estimatesResponse.json() as { data: { content: Array<{ id: string; estimateNo: string; status: string }> } }
  const estimate = estimatesPayload.data.content[0]
  expect(estimate?.id).toBeTruthy()

  await page.goto(`${APP}/#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('partner-order-list-status-filter').selectOption('')
  await expect(page.getByTestId('partner-order-list-status-filter')).toHaveValue('')
  const orderListText = await assertVisibleSurface(page, '주문서 관리')
  for (const label of ['진행중', '보류', '확인중', '완료', '취소', '전환완료']) expect(orderListText).toContain(label)
  const orderListStyles: Record<string, BadgeStyle> = {}
  for (const [status, label] of Object.entries(ORDER_LABELS)) {
    await page.getByTestId('partner-order-list-status-filter').selectOption(status)
    const badge = page.locator(`[data-status="${status}"]`).first()
    orderListStyles[status] = await badgeStyle(badge)
    expect(orderListStyles[status].text).toBe(label)
  }
  console.log(`ORDER_LIST_BADGES=${JSON.stringify(orderListStyles)}`)
  await page.getByTestId('partner-order-list-status-filter').selectOption('')
  await page.screenshot({ path: path.join(SHOTS, '01-order-list.png'), fullPage: true })

  const orderDetailStyles: Record<string, BadgeStyle> = {}
  for (const [status, label] of Object.entries(ORDER_LABELS)) {
    const statusOrder = ordersPayload.data.content.find((item) => item.status === status)
    expect(statusOrder, `seed order for ${status}`).toBeTruthy()
    await page.goto(`${APP}/#/sales/partner-orders/${encodeURIComponent(statusOrder!.orderNumber)}`, { waitUntil: 'domcontentloaded' })
    const detailBadge = page.locator(`[data-status="${status}"]`).first()
    orderDetailStyles[status] = await badgeStyle(detailBadge)
    expect(orderDetailStyles[status].text).toBe(label)
    expect(orderDetailStyles[status]).toEqual(orderListStyles[status])
  }
  console.log(`ORDER_DETAIL_BADGES=${JSON.stringify(orderDetailStyles)}`)

  await page.goto(`${APP}/#/sales/partner-orders/${encodeURIComponent(order!.orderNumber)}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-order-number]').filter({ hasText: order!.orderNumber }).first()).toBeVisible()
  await expect(page.locator('.detail-grid')).toBeVisible()
  const orderDetailText = await page.locator('body').innerText()
  expect(orderDetailText).not.toMatch(UUID)
  expect(orderDetailText).not.toContain('undefined')
  await page.screenshot({ path: path.join(SHOTS, '02-order-detail.png'), fullPage: true })

  await page.goto(`${APP}/#/sales/estimates`, { waitUntil: 'domcontentloaded' })
  const estimateListText = await assertVisibleSurface(page, '견적서 관리')
  for (const label of ['작성중', '발송완료', '수주완료', '거절', '전표변환완료']) expect(estimateListText).toContain(label)
  const estimateListStyles: Record<string, BadgeStyle> = {}
  for (const [status, label] of Object.entries(ESTIMATE_LABELS)) {
    await page.getByTestId('estimate-list-filter-status').selectOption(status)
    const statusEstimate = estimatesPayload.data.content.find((item) => item.status === status)
    expect(statusEstimate, `seed estimate for ${status}`).toBeTruthy()
    const row = page.locator('tr').filter({ hasText: statusEstimate!.estimateNo }).first()
    estimateListStyles[status] = await badgeStyle(row.getByText(label, { exact: true }))
    expect(estimateListStyles[status].text).toBe(label)
  }
  console.log(`ESTIMATE_LIST_BADGES=${JSON.stringify(estimateListStyles)}`)
  await page.getByTestId('estimate-list-filter-status').selectOption('')
  await page.screenshot({ path: path.join(SHOTS, '03-estimate-list.png'), fullPage: true })

  const estimateDetailStyles: Record<string, BadgeStyle> = {}
  for (const [status, label] of Object.entries(ESTIMATE_LABELS)) {
    const statusEstimate = estimatesPayload.data.content.find((item) => item.status === status)
    await page.goto(`${APP}/#/sales/estimates/${encodeURIComponent(statusEstimate!.id)}`, { waitUntil: 'domcontentloaded' })
    estimateDetailStyles[status] = await badgeStyle(page.getByText(label, { exact: true }).first())
    expect(estimateDetailStyles[status]).toEqual(estimateListStyles[status])
  }
  console.log(`ESTIMATE_DETAIL_BADGES=${JSON.stringify(estimateDetailStyles)}`)

  await page.goto(`${APP}/#/sales/estimates/${encodeURIComponent(estimate!.id)}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('estimate-detail-no')).toHaveText(estimate!.estimateNo)
  await expect(page.locator('.detail-grid')).toBeVisible()
  const estimateDetailText = await page.locator('body').innerText()
  expect(estimateDetailText).not.toMatch(UUID)
  expect(estimateDetailText).not.toContain('undefined')
  await page.screenshot({ path: path.join(SHOTS, '04-estimate-detail.png'), fullPage: true })

  await page.goto(`${APP}/#/sales/order-approvals`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('주문서 승인 목록을 불러오는 중…', { exact: true })).toHaveCount(0, { timeout: 15_000 })
  await page.screenshot({ path: path.join(SHOTS, '05-order-approvals.png'), fullPage: true })

  await page.goto(`${APP}/#/sales/partner-dc-config`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('거래처 DC 목록을 불러오는 중…', { exact: true })).toHaveCount(0, { timeout: 15_000 })
  await page.screenshot({ path: path.join(SHOTS, '06-dc-config.png'), fullPage: true })

  await page.goto(`${APP}/#/sales/estimate-config`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('견적 가격 설정', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('설정을 불러오는 중...', { exact: true })).toHaveCount(0, { timeout: 15_000 })
  await page.screenshot({ path: path.join(SHOTS, '07-estimate-config.png'), fullPage: true })
})
