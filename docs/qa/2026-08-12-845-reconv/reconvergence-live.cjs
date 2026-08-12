const { chromium } = require('../../../clients/desktop/node_modules/playwright')
const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')
const fs = require('node:fs')
const path = require('node:path')

const appBase = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:40275'
const apiBase = process.env.API_BASE || 'http://127.0.0.1:40280'
const outputDir = __dirname
const uuidPattern = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i

const scenarios = [
  { name: 'reference-12-lines', id: '77554976-81f7-4756-bb94-303f65d32e8f', shot: '01-reference-12-lines-preview.png', expectedRows: 12 },
  { name: 'reference-48-lines', id: '27d08fba-fc64-492a-9360-f3e75c62b83c', shot: '02-reference-48-lines-preview.png', expectedRows: 48 },
  { name: 'no-reference', id: 'faaadfc6-58a8-4132-b522-d97c39b36a3f', shot: '03-no-reference-preview.png', expectedRows: 0 },
  { name: 'broken-reference', id: '947da872-f726-46b6-a93c-cc07ec3636a5', shot: '04-broken-reference-preview.png', expectedRows: 0 },
  { name: 'non-default-connected', id: '1f43b3c7-635a-4a8a-a378-e5c6848c4c8d', shot: '05-non-default-connected-preview.png', expectedRows: 0 },
]

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  const loginResponse = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  const loginBody = await loginResponse.json()
  const login = loginBody.data || {}
  console.log(JSON.stringify({ loginHttp: loginResponse.status(), tokenPresent: Boolean(login.token), role: login.role }))
  if (!loginResponse.ok() || !login.token) throw new Error(`격리 로그인 실패 HTTP ${loginResponse.status()}`)

  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token, role, userId, fullName: displayName, partnerCode: null }),
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
  }, { token: login.token, role: login.role, userId: login.userId, displayName: login.displayName || 'dev_master' })

  const results = []
  for (const scenario of scenarios) {
    const responses = []
    const listener = (response) => {
      const url = new URL(response.url())
      if (url.origin === apiBase) responses.push(`${response.status()} ${url.pathname}${url.search}`)
    }
    page.on('response', listener)
    const url = `${appBase}/#/groupware/approvals/${scenario.id}/print`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    try {
      await page.locator('.print-approval-doc').waitFor({ state: 'visible', timeout: 30_000 })
    } catch (error) {
      const debugText = await page.locator('body').innerText().catch(() => '')
      await page.screenshot({ path: path.join(outputDir, '00-debug-first-load.png'), fullPage: true }).catch(() => undefined)
      console.log(JSON.stringify({ scenario: scenario.name, finalUrl: page.url(), debugText, responses }))
      throw error
    }
    await page.waitForTimeout(500)
    const bodyText = await page.locator('body').innerText()
    const rows = await page.locator('[data-template-detail-row]').count()
    const headers = await page.locator('.document-template-detail th').allInnerTexts()
    const firstRow = rows > 0 ? await page.locator('[data-template-detail-row]').first().locator('td').allInnerTexts() : []
    const docHeight = await page.locator('.print-approval-doc').evaluate((element) => Math.ceil(element.getBoundingClientRect().height))
    await page.screenshot({ path: path.join(outputDir, scenario.shot), fullPage: true })
    const result = {
      scenario: scenario.name,
      url,
      printDoc: await page.locator('.print-approval-doc').count(),
      loadingText: bodyText.includes('불러오는 중'),
      errorBanner: await page.locator('.error-banner').count(),
      detailLayer: await page.locator('[data-testid="document-template-detail-layer"]').count(),
      detailRows: rows,
      expectedRows: scenario.expectedRows,
      headers,
      firstRow,
      modelNameVisible: bodyText.includes('AJ060MXHNBC1'),
      uuidVisible: uuidPattern.test(bodyText),
      documentHeight: docHeight,
      responseTail: responses.slice(-14),
    }
    results.push(result)
    console.log(JSON.stringify(result))

    if (scenario.name === 'reference-12-lines') {
      await page.emulateMedia({ media: 'print' })
      await page.screenshot({ path: path.join(outputDir, '06-reference-12-lines-print-media.png'), fullPage: true })
      await page.pdf({ path: path.join(outputDir, 'reference-12-lines.pdf'), format: 'A4', printBackground: true })
      await page.emulateMedia({ media: 'screen' })
    }
    if (scenario.name === 'reference-48-lines') {
      await page.emulateMedia({ media: 'print' })
      await page.screenshot({ path: path.join(outputDir, '07-reference-48-lines-print-media.png'), fullPage: true })
      await page.pdf({ path: path.join(outputDir, 'reference-48-lines.pdf'), format: 'A4', printBackground: true })
      await page.emulateMedia({ media: 'screen' })
    }
    page.off('response', listener)
  }

  if (process.env.SKIP_ALL === '1') {
    console.log(JSON.stringify({ pageErrors }))
    await browser.close()
    return
  }

  const listResponse = await page.request.get(`${apiBase}/admin/groupware/approvals`, {
    headers: { Authorization: `Bearer ${login.token}` },
  })
  const listBody = await listResponse.json()
  const approvals = Array.isArray(listBody.data) ? listBody.data : []
  const blockedDocs = []
  let opened = 0
  for (const approval of approvals) {
    try {
      await page.goto(`${appBase}/#/groupware/approvals/${approval.approvalId}/print`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.locator('.print-approval-doc').waitFor({ state: 'visible', timeout: 20_000 })
      opened += 1
    } catch (error) {
      blockedDocs.push({ approvalNo: approval.approvalNo, error: String(error).split('\n')[0] })
    }
  }
  const allApprovalPaths = { listHttp: listResponse.status(), total: approvals.length, opened, blocked: blockedDocs.length, blockedDocs }
  console.log(JSON.stringify({ allApprovalPaths }))
  console.log(JSON.stringify({ pageErrors }))
  fs.writeFileSync(path.join(outputDir, 'raw-results.json'), JSON.stringify({ results, allApprovalPaths, pageErrors }, null, 2), 'utf8')
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
