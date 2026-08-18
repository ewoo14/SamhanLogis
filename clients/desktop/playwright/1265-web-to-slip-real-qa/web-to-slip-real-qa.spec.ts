import { expect, test } from '@playwright/test'
import path from 'node:path'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const estimateBase = process.env['ESTIMATE_QA_BASE'] ?? 'http://127.0.0.1:2583'
const desktopBase = process.env['DESKTOP_QA_BASE'] ?? 'http://127.0.0.1:25173'
const gatewayBase = process.env['GATEWAY_QA_BASE'] ?? 'http://127.0.0.1:8080'
const slipBase = process.env['SLIP_QA_BASE'] ?? 'http://127.0.0.1:28086'
const orderBase = process.env['ORDER_QA_BASE'] ?? 'http://127.0.0.1:25180'
const partnerOrderBase = process.env['PARTNER_ORDER_QA_BASE'] ?? 'http://127.0.0.1:28088'
const gatewayAttestation = process.env['SAMHAN_GATEWAY_ATTESTATION'] ?? ''
const shots = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/1265-sol-merge-verdict/screenshots'))

test('종합견적서 구성품 4행을 격리 전표로 실제 발행하고 상세 화면에서 확인한다', async ({ page, request }) => {
  const login = await request.post(`${gatewayBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(login.ok(), `로그인 실패 ${login.status()}`).toBeTruthy()
  const auth = (await login.json()).data ?? {}

  const dialogs: string[] = []
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message())
    await dialog.accept()
  })

  await page.goto(`${estimateBase}/?email=dev_master@samhan-air.com`, { waitUntil: 'load' })
  await page.waitForTimeout(5_000)
  await page.locator('#btnGoSingle').evaluate(node => (node as HTMLButtonElement).click())
  await expect(page.locator('#ss_remote')).toBeVisible()

  for (const [selector, index] of [
    ['#ss_remote', 2],
    ['#ss_panel', 4],
    ['#ss_p360', 1],
    ['#ss_mat', 0],
  ] as const) {
    await page.locator(selector).evaluate((node, selectedIndex) => {
      const select = node as HTMLSelectElement
      select.selectedIndex = selectedIndex
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }, index)
  }

  const setRow = page.locator('tr[data-id]:visible').filter({ hasText: 'AC060CS6PBH1SY' }).first()
  await setRow.locator('.qty-input').fill('3')
  await setRow.locator('.qty-input').blur()
  await page.waitForTimeout(700)

  const webRows = await page.evaluate(() => (window as typeof window & {
    buildSendRows: () => Array<Record<string, unknown>>
  }).buildSendRows())
  expect(webRows).toHaveLength(4)
  for (const row of webRows) {
    expect(row['bundleSetOptions']).toEqual({
      remoteOption: '컬러유선리모컨',
      remoteExcluded: false,
      panelOption: '공청판넬',
      panelShape360: '사각',
      materialIncluded: true,
    })
  }

  await page.locator('#btnGoFinal').click({ force: true })
  await page.waitForTimeout(500)
  const uploadRows = page.locator('table:visible tbody tr:visible').filter({ has: page.locator('td') })
  const uploadRowCount = await uploadRows.count()
  await page.screenshot({ path: path.join(shots, '01-web-estimate-upload-4rows.png'), fullPage: true })
  expect(uploadRowCount).toBe(4)

  await page.locator('#btnGoOrderInfo').click({ force: true })
  await page.locator('#custSearch').fill('QA')
  await page.waitForTimeout(500)
  await page.locator('#custSuggestions .ac-row').click()
  await page.locator('#addrBase').fill('QA isolation address')
  await page.locator('#addrDetail').fill('PR1265')
  if (!(await page.locator('#sameAddr').isChecked())) await page.locator('#sameAddr').check()
  await page.locator('#tel').fill('01012345678')
  await page.locator('#memo').fill('PR1265 SOL isolated QA')
  await page.locator('#managerSearch').fill('dev')
  await page.waitForTimeout(500)
  await page.locator('#managerSuggestions .ac-row').first().click()
  await page.locator('#memo').press('Tab')
  await page.waitForTimeout(700)
  await expect(page.locator('#btnGenSlip')).toBeEnabled()

  const rpcResponsePromise = page.waitForResponse(response =>
    response.url().includes('/rpc/sendOrderFromUi') && response.request().method() === 'POST',
  )
  await page.locator('#btnGenSlip').click()
  const rpcResponse = await rpcResponsePromise
  expect(rpcResponse.ok(), `견적 RPC 실패 ${rpcResponse.status()}`).toBeTruthy()
  const rpcJson = await rpcResponse.json()
  const result = rpcJson.result ?? rpcJson
  expect(result.ok, JSON.stringify(result)).toBeTruthy()
  const payload = result.body?.data ?? result.body ?? {}
  const slipId = String(payload.slipId ?? payload.id ?? '')
  const slipNo = String(result.slipNo ?? payload.slipNo ?? '')
  expect(slipId).not.toBe('')
  expect(slipNo).not.toBe('')

  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token, role, userId, fullName: displayName, partnerCode: null }),
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
  }, {
    token: auth.token ?? '', role: auth.role ?? '', userId: auth.userId ?? '',
    displayName: auth.displayName ?? 'dev_master',
  })

  await page.route('**/slips/**', async route => {
    const url = new URL(route.request().url())
    const branchPath = url.pathname.startsWith('/api/v1/slips/')
      ? url.pathname.slice('/api/v1'.length)
      : url.pathname
    const branchUrl = `${slipBase}${branchPath}${url.search}`
    if (branchPath.endsWith('/realtime')) {
      await route.abort()
      return
    }
    const response = await route.fetch({
      url: branchUrl,
      headers: {
        ...route.request().headers(),
        'X-Samhan-Gateway-Attestation': gatewayAttestation,
        'X-User-Id': auth.userId ?? '',
        'X-User-Role': auth.role ?? 'MASTER',
        'X-User-Name': 'dev_master',
        'X-Is-System-Master': 'true',
      },
    })
    console.log(`[BRANCH_ROUTE] ${url.pathname} -> ${branchUrl} = ${response.status()}`)
    await route.fulfill({ response })
  })
  await page.goto(`${desktopBase}/#/sales/${slipId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6_000)
  await expect(page.getByText(slipNo, { exact: false }).first()).toBeVisible()
  for (const model of ['AC060CN6PBH1', 'AC060CXAPBH1', 'AR-EH05', 'PC6NUCK1NW']) {
    await expect(page.getByText(model, { exact: false }).first()).toBeVisible()
  }
  const detailRows = page.locator('table tbody tr:visible').filter({ has: page.locator('td') })
  const detailRowCount = await detailRows.count()
  expect(detailRowCount).toBeGreaterThanOrEqual(4)
  await page.screenshot({ path: path.join(shots, '02-created-slip-detail-4rows.png'), fullPage: true })

  console.log('[SOL1265]', JSON.stringify({
    uploadRowCount,
    detailRowCount,
    slipId,
    slipNo,
    dialogs,
    webRows,
  }))
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('주문서웹 실제 거래처 인증 후 홈멀티 행 수를 확인한다', async ({ page }) => {
  await page.route('**/api/v1/partner-orders/**', async route => {
    const url = new URL(route.request().url())
    const response = await route.fetch({
      url: `${partnerOrderBase}${url.pathname}${url.search}`,
      headers: {
        ...route.request().headers(),
        'X-Samhan-Gateway-Attestation': gatewayAttestation,
        'X-Partner-Code': 'QA-ORDER-PORTAL',
        'X-Biz-Code': '9999000001',
      },
    })
    await route.fulfill({ response })
  })

  await page.goto(orderBase, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3_500)
  await page.locator('#bizGateInput').fill('9999000001')
  await page.locator('#btnBizQuery').click()
  await page.waitForTimeout(500)
  await page.locator('#authPw1').fill(resolveQaCredential('QA_PARTNER_ORDER_PASSWORD'))
  await page.locator('#btnAuthAction').click()
  await page.waitForTimeout(6_000)
  await expect(page.locator('#pageBizGate')).toBeHidden()

  const tutorialButtons = page.locator('button:visible')
  if ((await tutorialButtons.allTextContents()).some(text => text.trim() === '아니오')) {
    const texts = await tutorialButtons.allTextContents()
    await tutorialButtons.nth(texts.findIndex(text => text.trim() === '아니오')).click()
  }
  await page.waitForTimeout(500)
  await page.locator('button:visible').first().click()
  await page.waitForTimeout(1_500)

  const orderRows = page.locator('table:visible tbody tr:visible').filter({ has: page.locator('td') })
  const orderRowCount = await orderRows.count()
  await page.screenshot({ path: path.join(shots, '03-order-web-authenticated-0rows.png'), fullPage: true })
  expect(orderRowCount).toBe(0)
  console.log(`[SOL1265_ORDER] authenticatedHomeRows=${orderRowCount}`)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
