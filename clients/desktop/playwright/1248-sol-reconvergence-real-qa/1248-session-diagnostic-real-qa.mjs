import { chromium } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const api = 'http://localhost:8080'
const app = 'http://localhost:5943'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const observations = []

page.on('response', (response) => {
  const url = response.url()
  if (response.status() >= 400 || /\/auth\/(login|me|logout)|sales-commission-settlements|permissions/.test(url)) {
    observations.push({ method: response.request().method(), url, status: response.status() })
  }
})

try {
  const login = await context.request.post(`${api}/auth/login`, {
    data: {
      loginId: resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'),
      password: resolveQaCredential('QA_DEV_MANAGER_PASSWORD'),
    },
  })
  const headers = await login.headersArray()
  let body = {}
  try { body = await login.json() } catch {}
  console.log(JSON.stringify({
    phase: 'login',
    status: login.status(),
    setCookieHeaders: headers.filter((header) => header.name.toLowerCase() === 'set-cookie').map((header) => header.value.split(';')[0].split('=')[0]),
    dataKeys: Object.keys(body?.data ?? {}),
  }))

  const state = await context.storageState()
  console.log(JSON.stringify({
    phase: 'storageState',
    cookies: state.cookies.map(({ name, domain, path, httpOnly, secure, sameSite, expires }) => ({ name, domain, path, httpOnly, secure, sameSite, expires })),
  }))

  const me = await context.request.get(`${api}/auth/me`)
  console.log(JSON.stringify({ phase: 'request-me', status: me.status() }))

  const menu = await context.request.get(`${api}/auth/admin/menu-catalog`)
  console.log(JSON.stringify({ phase: 'request-menu-catalog', status: menu.status(), body: await menu.text() }))

  await page.goto(`${app}/#/accounting/sales-commission-settlements`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const finalState = await context.storageState()
  console.log(JSON.stringify({
    phase: 'page',
    url: page.url(),
    observations,
    finalCookies: finalState.cookies.map(({ name, domain, path, httpOnly, secure, sameSite, expires }) => ({ name, domain, path, httpOnly, secure, sameSite, expires })),
  }))
} finally {
  await context.close()
  await browser.close()
}
