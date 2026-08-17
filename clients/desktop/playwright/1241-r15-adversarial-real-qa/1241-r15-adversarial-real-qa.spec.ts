import { expect, test, type Page, type Route } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5184'
const API_BASE = process.env['R15_PARTNER_ORDER_API'] ?? 'http://127.0.0.1:28088'
const PRODUCT_API_BASE = process.env['R15_PRODUCT_API'] ?? 'http://127.0.0.1:28084'
const DESKTOP_BASE_URL = process.env['R15_DESKTOP_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GATEWAY_BASE = process.env['R15_GATEWAY_BASE'] ?? 'http://127.0.0.1:8080'
const ATTESTATION = process.env['SAMHAN_GATEWAY_ATTESTATION']?.trim()
if (!ATTESTATION) throw new Error('SAMHAN_GATEWAY_ATTESTATION 환경변수가 필요합니다')

const PARTNER_CODE = '1068689215'
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1241-r15-adversarial/screenshots'))

const identityHeaders = {
  'X-Samhan-Gateway-Attestation': ATTESTATION,
  'X-User-Id': USER_ID,
  'X-User-Name': encodeURIComponent('SOL R15 적대검증'),
  'X-Is-Partner': 'true',
  'X-Partner-Code': PARTNER_CODE,
}

type Captured = { url: string; method: string; status: number; request: string; response: string }

async function installRealApi(page: Page, captured: Captured[]): Promise<void> {
  await page.route(`${API_BASE}/**`, async (route: Route) => {
    const request = route.request()
    const response = await route.fetch({
      headers: { ...request.headers(), ...identityHeaders },
    })
    const body = await response.body()
    const url = request.url()
    if (url.includes('/price-preview') || /\/partner-orders\/[^/]+\/confirm$/.test(url)) {
      captured.push({
        url,
        method: request.method(),
        status: response.status(),
        request: request.postData() ?? '',
        response: body.toString('utf8'),
      })
    }
    await route.fulfill({ response, body })
  })
}

async function setSingleQuantity(page: Page, model: string): Promise<void> {
  const input = page.locator(`#singleBody input[data-model="${model}"]`)
  await expect(input, `${model} 품목표 행 미도달`).toBeVisible({ timeout: 30_000 })
  await input.fill('1')
  await input.dispatchEvent('change')
}

test('R15 주문서웹 실화면 — 품목표→미리보기→최종확인→격리 저장', async ({ page }) => {
  const captured: Captured[] = []
  page.on('console', message => console.log(`[BROWSER ${message.type()}] ${message.text()}`))
  page.on('requestfailed', request => console.log(`[REQUEST_FAILED] ${request.url()} ${request.failure()?.errorText}`))
  await installRealApi(page, captured)

  await page.goto(`${BASE_URL}/#/order`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#bizGateInput'), '주문서웹 사업자번호 게이트 미도달').toBeVisible()
  await page.evaluate((partnerCode) => {
    ;(window as any).CURRENT_BIZNO = partnerCode
    ;(window as any).AUTH_BIZ = partnerCode
    const gate = document.querySelector<HTMLElement>('#pageBizGate')
    gate?.classList.add('hidden')
    document.body.classList.remove('no-active')
  }, PARTNER_CODE)
  await page.locator('#btnGoSingle').click()
  await expect(page.locator('#cardSingle'), '싱글중대형 화면 미도달').toBeVisible()

  const due = page.locator('#due')
  await due.evaluate((node: HTMLInputElement) => { node.value = '2026-08-20' })
  await due.dispatchEvent('change')
  await setSingleQuantity(page, 'AR06D1150HZS')
  await setSingleQuantity(page, 'AC060CS6PBH1SY')

  const itemTable = await page.evaluate(() => {
    const result: Record<string, { unit: string; subtotal: string }> = {}
    for (const model of ['AR06D1150HZS', 'AC060CS6PBH1SY']) {
      const input = document.querySelector<HTMLInputElement>(`#singleBody input[data-model="${model}"]`)
      const row = input?.closest('tr')
      result[model] = {
        unit: row?.querySelector<HTMLElement>('[data-ssu]')?.textContent?.trim() ?? '',
        subtotal: row?.querySelector<HTMLElement>('[data-ss]')?.textContent?.trim() ?? '',
      }
    }
    return result
  })
  const sendRows = await page.evaluate(() => (window as any).buildSendRows())
  console.log(`ITEM_TABLE ${JSON.stringify(itemTable)}`)
  console.log(`BUILD_SEND_ROWS ${JSON.stringify(sendRows)}`)

  await page.locator('#btnPreview').click()
  await expect(page.locator('#dlgPreview')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('#btnProceed')).toBeEnabled({ timeout: 30_000 })
  const previewCapture = captured.find(entry => entry.url.includes('/price-preview'))
  expect(previewCapture, '가격 미리보기 실응답 미포착').toBeTruthy()
  expect(previewCapture?.status, previewCapture?.response).toBe(200)
  const previewJson = JSON.parse(previewCapture!.response)
  const previewRows = page.locator('#previewBody tr')
  const previewRowCount = await previewRows.count()
  expect(previewRowCount).toBe(previewJson.data.lines.length)
  console.log(`PREVIEW_RAW ${previewCapture!.response}`)
  console.log(`PREVIEW_COUNTS response=${previewJson.data.lines.length} screen=${previewRowCount}`)
  console.log(`PREVIEW_SCREEN ${JSON.stringify(await previewRows.allTextContents())}`)
  await page.screenshot({ path: path.join(SHOTS, '01-preview-ar-ac.png'), fullPage: true })

  await page.locator('#btnProceed').click()
  await expect(page.locator('#pageOrderInfo')).toBeVisible()
  await page.locator('#addrBase').evaluate((node: HTMLInputElement) => {
    node.value = '서울특별시 R15 격리 QA로 15'
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.locator('#addrDetail').fill('15층')
  await page.locator('#sameAddr').check()
  await page.locator('#tel').fill('01012345678')
  await page.locator('#due').fill('2026-08-20')
  await page.locator('#payDue').fill('2026-08-31')
  await page.locator('#memo').fill('R15 헤더 보존 격리 QA')
  await expect(page.locator('#btnSendOrder')).toBeEnabled()
  console.log(`ORDER_HEADERS ${JSON.stringify(await page.evaluate(() => ({
    address: (document.querySelector<HTMLInputElement>('#addrBase')?.value ?? '') + ' ' + (document.querySelector<HTMLInputElement>('#addrDetail')?.value ?? ''),
    siteAddress: (document.querySelector<HTMLInputElement>('#addrAuditBase')?.value ?? '') + ' ' + (document.querySelector<HTMLInputElement>('#addrAuditDetail')?.value ?? ''),
    phone: document.querySelector<HTMLInputElement>('#tel')?.value,
    due: document.querySelector<HTMLInputElement>('#due')?.value,
    paymentDue: document.querySelector<HTMLInputElement>('#payDue')?.value,
    memo: document.querySelector<HTMLInputElement>('#memo')?.value,
  })))}`)
  await page.screenshot({ path: path.join(SHOTS, '02-order-headers.png'), fullPage: true })

  await page.locator('#btnSendOrder').click()
  await expect(page.locator('#dlgFinal')).toBeVisible()
  const finalRows = page.locator('#finalBody tr')
  const finalRowCount = await finalRows.count()
  expect(finalRowCount).toBe(previewRowCount)
  console.log(`FINAL_COUNTS screen=${finalRowCount}`)
  console.log(`FINAL_SCREEN ${JSON.stringify(await finalRows.allTextContents())}`)
  await page.screenshot({ path: path.join(SHOTS, '03-final-confirm.png'), fullPage: true })

  await page.locator('#btnFinalSend').click()
  await expect(page.locator('#progressText')).toContainText('전송이 완료되었습니다', { timeout: 30_000 })
  const confirmCapture = captured.find(entry => /\/partner-orders\/[^/]+\/confirm$/.test(entry.url))
  expect(confirmCapture, '주문 확정 실응답 미포착').toBeTruthy()
  expect(confirmCapture?.status, confirmCapture?.response).toBe(200)
  console.log(`CONFIRM_RAW ${confirmCapture!.response}`)
  console.log(`FOUR_STAGE ${JSON.stringify({ itemTable, preview: previewJson.data, finalRows: await finalRows.allTextContents(), confirm: JSON.parse(confirmCapture!.response).data })}`)
  await page.screenshot({ path: path.join(SHOTS, '04-send-complete.png'), fullPage: true })
})

test('R15 데스크톱 실화면 — 거래처명 fallback과 폐기된 관리자 시트 기능', async ({ page }) => {
  const password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  const loginResponse = await page.request.post(`${GATEWAY_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(loginResponse.status(), await loginResponse.text()).toBe(200)
  const loginData = (await loginResponse.json()).data ?? {}
  expect(loginData.token, 'dev_master 실 JWT 부재').toBeTruthy()

  await page.addInitScript(({ token, userId, role, fullName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, {
    token: loginData.token,
    userId: loginData.userId,
    role: loginData.role,
    fullName: loginData.displayName ?? 'dev_master',
  })

  const masterHeaders = {
    'X-Samhan-Gateway-Attestation': ATTESTATION,
    'X-User-Id': loginData.userId,
    'X-User-Name': encodeURIComponent(loginData.displayName ?? 'dev_master'),
    'X-Is-Partner': 'false',
    'X-Is-System-Master': 'true',
  }
  await page.route(`${GATEWAY_BASE}/auth/me`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: {
        userId: loginData.userId,
        loginId: 'dev_master',
        role: loginData.role,
        displayName: loginData.displayName,
        groups: loginData.groups ?? [],
      } }),
    })
  })
  await page.route(`${GATEWAY_BASE}/auth/admin/permissions/my`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: {
        'sales.partner-order.list': ['VIEW'],
        'products.sync': ['VIEW', 'CREATE'],
      } }),
    })
  })
  await page.route(`${GATEWAY_BASE}/auth/admin/menu-catalog`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: [] }) })
  })
  await page.route(`${GATEWAY_BASE}/api/v1/partner-orders/**`, async route => {
    const request = route.request()
    if (request.url().includes('/collab/stream')) {
      await route.abort()
      return
    }
    const target = request.url().replace(`${GATEWAY_BASE}/api/v1/partner-orders`, `${API_BASE}/api/v1/partner-orders`)
    const response = await route.fetch({ url: target, headers: { ...request.headers(), ...masterHeaders } })
    await route.fulfill({ response, body: await response.body() })
  })
  await page.route(`${GATEWAY_BASE}/api/v1/products/admin/**`, async route => {
    const request = route.request()
    const target = request.url().replace(`${GATEWAY_BASE}/api/v1/products/admin`, `${PRODUCT_API_BASE}/api/v1/products/admin`)
    const response = await route.fetch({ url: target, headers: { ...request.headers(), ...masterHeaders } })
    const body = await response.body()
    if (request.method() === 'POST') console.log(`SHEET_ADMIN_RAW HTTP=${response.status()} ${body.toString('utf8')}`)
    await route.fulfill({ response, body })
  })

  await page.goto(`${DESKTOP_BASE_URL}/#/sales/partner-orders/2026-08-16-2`, { waitUntil: 'domcontentloaded' })
  const closeUpdate = page.getByRole('button', { name: '닫기' })
  if (await closeUpdate.isVisible({ timeout: 10_000 }).catch(() => false)) await closeUpdate.click()
  await expect(page.getByRole('heading', { name: '주문서 상세', level: 3 }), '주문서 상세 해시 라우트 미도달').toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('거래처 · 주식회사 중앙유통', { exact: true }), 'R03 거래처명 fallback 미도달').toBeVisible({ timeout: 30_000 })
  console.log('R03_SCREEN 거래처 · 주식회사 중앙유통')
  await page.screenshot({ path: path.join(SHOTS, '05-partner-name-fallback.png'), fullPage: true })

  await page.goto(`${DESKTOP_BASE_URL}/#/admin/sheet-sync`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '구글 시트 동기화', level: 3 }), '관리자 시트 화면 해시 라우트 미도달').toBeVisible({ timeout: 30_000 })
  const trigger = page.getByTestId('admin-sheetsync-trigger-btn')
  await expect(trigger).toHaveText('지금 동기화')
  await trigger.click()
  const alert = page.getByRole('alert')
  await expect(alert).toHaveText('동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', { timeout: 30_000 })
  console.log(`SHEET_ADMIN_SCREEN ${await alert.innerText()}`)
  await page.screenshot({ path: path.join(SHOTS, '06-sheet-sync-gone.png'), fullPage: true })
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
