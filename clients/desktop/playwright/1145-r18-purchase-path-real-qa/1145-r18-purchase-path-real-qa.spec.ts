import { expect, test, type APIRequestContext, type BrowserContext, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:51146'
const AUTH_API = 'http://127.0.0.1:18182'
const ACCOUNTING_API = 'http://127.0.0.1:18087'
const SLIP_API = 'http://127.0.0.1:18187'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-1145-r18-purchase-path'))

const roles = [
  { role: 'MASTER', loginId: 'dev_master', lineIndex: 0, savedSlipNo: '2026/08/09-6522' },
  { role: 'MANAGER', loginId: 'dev_manager', lineIndex: 1, savedSlipNo: '2026/08/09-7578' },
  { role: 'ACCOUNTANT', loginId: 'dev_accountant', lineIndex: 2, savedSlipNo: '2026/08/09-8527' },
] as const

type Login = {
  token: string
  role: string
  userId: string
  displayName: string
  groups?: Array<{ id: string }>
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<redacted>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '<redacted-uuid>')
  }
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'token' ? '<redacted>' : redact(item)]))
  }
  return value
}

async function login(request: APIRequestContext, loginId: string): Promise<Login> {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }
  const response = await request.post(`${AUTH_API}/auth/login`, { data: { loginId, password } })
  expect(response.status(), `${loginId} login`).toBe(200)
  return (await response.json()).data as Login
}

async function proxyRealApi(route: Route, session: Login, evidence: Array<Record<string, unknown>>): Promise<void> {
  const request = route.request()
  const source = new URL(request.url())
  const targetBase = source.pathname.startsWith('/auth')
    ? AUTH_API
    : source.pathname.startsWith('/slips')
      ? SLIP_API
      : ACCOUNTING_API
  const target = `${targetBase}${source.pathname}${source.search}`
  const response = await route.fetch({
    url: target,
    headers: {
      ...request.headers(),
      'x-user-id': session.userId,
      'x-caller-id': session.userId,
      'x-user-name': `R18 ${session.role}`,
      'x-caller-name': `R18 ${session.role}`,
      'x-user-role': session.role,
      'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
      'x-is-system-master': session.role === 'MASTER' ? 'true' : 'false',
    },
  })
  const body = await response.text()
  if (
    source.pathname === '/auth/admin/permissions/my'
    || source.pathname === '/slips/by-period'
    || source.pathname.startsWith('/admin/purchase-slips')
  ) {
    evidence.push({ role: session.role, method: request.method(), source: source.href, target, status: response.status(), body: redact(body) })
  }
  await route.fulfill({ response, body })
}

async function pageFor(context: BrowserContext, session: Login, evidence: Array<Record<string, unknown>>): Promise<Page> {
  const page = await context.newPage()
  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
  await page.route(`${AUTH_API}/**`, (route) => proxyRealApi(route, session, evidence))
  return page
}

test('R18 — 격리 실원천으로 CREATE 보유 3역할 매입 저장', async ({ browser, request }) => {
  test.setTimeout(180_000)
  fs.mkdirSync(SHOTS, { recursive: true })
  const evidence: Array<Record<string, unknown>> = []

  for (const candidate of roles) {
    const session = await login(request, candidate.loginId)
    expect(session.role).toBe(candidate.role)
    const context = await browser.newContext()
    const page = await pageFor(context, session, evidence)

    await page.goto(`${BASE_URL}/#/accounting/purchase-slips/new`, { waitUntil: 'domcontentloaded' })
    const form = page.getByTestId('purchase-accounting-slip-form-page')
    await expect(form).toBeVisible()
    await form.getByLabel('전표일자').fill('2026-08-09')
    const sliders = form.getByRole('slider', { name: '2026/08/09-1 배분율' })
    await expect(sliders).toHaveCount(3)
    await sliders.nth(candidate.lineIndex).fill('100')
    await form.getByLabel('메모').fill(`R18 ${candidate.role} 실 GUI 매입 저장`)
    const save = form.getByRole('button', { name: '임시저장' })
    await expect(save).toBeEnabled()
    await page.screenshot({ path: path.join(SHOTS, `${candidate.role.toLowerCase()}-purchase-before-save.png`), fullPage: true })

    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/admin/purchase-slips') && response.request().method() === 'POST')
    await save.click()
    const response = await responsePromise
    const responseBody = await response.text()
    evidence.push({ role: candidate.role, step: 'purchase-save-response', status: response.status(), body: redact(responseBody) })
    fs.writeFileSync(path.join(SHOTS, 'purchase-save-evidence.json'), JSON.stringify(redact(evidence), null, 2), 'utf8')
    expect([200, 201]).toContain(response.status())
    await expect(page).toHaveURL(`${BASE_URL}/#/accounting/purchase-slips`)
    await expect(page.getByTestId('purchase-accounting-slip-page')).toBeVisible()
    evidence.push({ role: candidate.role, step: 'purchase-save', status: response.status(), finalUrl: page.url() })
    await page.screenshot({ path: path.join(SHOTS, `${candidate.role.toLowerCase()}-purchase-after-save.png`), fullPage: true })

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }

  fs.writeFileSync(path.join(SHOTS, 'purchase-save-evidence.json'), JSON.stringify(redact(evidence), null, 2), 'utf8')
})

test('R18 — 3역할 저장 결과 목록 재조회', async ({ browser, request }) => {
  test.setTimeout(120_000)
  fs.mkdirSync(SHOTS, { recursive: true })

  for (const candidate of roles) {
    const session = await login(request, candidate.loginId)
    expect(session.role).toBe(candidate.role)
    const context = await browser.newContext()
    const page = await pageFor(context, session, [])

    await page.goto(`${BASE_URL}/#/accounting/purchase-slips`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('purchase-accounting-slip-page')).toBeVisible()
    await expect(page.getByRole('cell', { name: candidate.savedSlipNo, exact: true })).toBeVisible({ timeout: 30_000 })
    const updateBannerClose = page.getByRole('button', { name: '닫기' }).first()
    if (await updateBannerClose.isVisible().catch(() => false)) await updateBannerClose.click()
    await page.screenshot({ path: path.join(SHOTS, `${candidate.role.toLowerCase()}-purchase-after-save.png`), fullPage: true })

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }
})
