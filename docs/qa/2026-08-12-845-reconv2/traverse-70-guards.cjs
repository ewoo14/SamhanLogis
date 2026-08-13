const { chromium } = require('../../../clients/desktop/node_modules/playwright')
const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')

const appBase = 'http://127.0.0.1:40275'
const apiBase = 'http://127.0.0.1:40280'
const uuidPattern = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i

async function main() {
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
  if (!loginResponse.ok() || !login.token) throw new Error(`login ${loginResponse.status()}`)

  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token, role, userId, fullName: displayName, partnerCode: null }),
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
  }, { token: login.token, role: login.role, userId: login.userId, displayName: login.displayName || 'dev_master' })

  const listResponse = await page.request.get(`${apiBase}/admin/groupware/approvals`, {
    headers: { Authorization: `Bearer ${login.token}` },
  })
  const listBody = await listResponse.json()
  const approvals = Array.isArray(listBody.data) ? listBody.data : []
  const blocked = []
  const uuidDocs = []
  const questionMarkDocs = []
  let opened = 0
  for (const approval of approvals) {
    try {
      await page.goto(`${appBase}/#/groupware/approvals/${approval.approvalId}/print`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.locator('.print-approval-doc').waitFor({ state: 'visible', timeout: 20_000 })
      const text = await page.locator('.print-approval-doc').innerText()
      opened += 1
      if (uuidPattern.test(text)) uuidDocs.push(approval.approvalNo)
      if (text.includes('?')) questionMarkDocs.push(approval.approvalNo)
    } catch (error) {
      blocked.push({ approvalNo: approval.approvalNo, error: String(error).split('\n')[0] })
    }
  }
  console.log(JSON.stringify({
    listHttp: listResponse.status(),
    total: approvals.length,
    opened,
    blocked: blocked.length,
    blockedDocs: blocked,
    uuidVisibleDocs: uuidDocs.length,
    uuidDocs,
    questionMarkDocs: questionMarkDocs.length,
    questionDocs: questionMarkDocs,
    pageErrors,
  }))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
