import { expect, test, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'
const AUTH_API = 'http://127.0.0.1:18181'
const ACCOUNTING_API = 'http://127.0.0.1:18087'
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/1145-r14-real-qa'))
fs.mkdirSync(SHOTS, { recursive: true })

const roles = [
  { role: 'MASTER', loginId: 'dev_master', canWrite: true },
  { role: 'MANAGER', loginId: 'dev_manager', canWrite: true },
  { role: 'ACCOUNTANT', loginId: 'dev_accountant', canWrite: true },
  { role: 'SALES', loginId: 'dev_sales', canWrite: false },
] as const

type Login = {
  token: string
  role: string
  userId: string
  displayName: string
  groups?: Array<{ id: string }>
}

async function proxyRealApi(route: Route, session: Login): Promise<void> {
  const request = route.request()
  const source = new URL(request.url())
  const targetBase = source.pathname.startsWith('/auth') ? AUTH_API : ACCOUNTING_API
  const response = await route.fetch({
    url: `${targetBase}${source.pathname}${source.search}`,
    headers: {
      ...request.headers(),
      'x-user-id': session.userId,
      'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
      'x-is-system-master': session.role === 'MASTER' ? 'true' : 'false',
    },
  })
  await route.fulfill({ response })
}

async function installSession(page: Page, session: Login): Promise<void> {
  await page.route(`${AUTH_API}/**`, (route) => proxyRealApi(route, session))
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
}

test('PR #1145 R14 — 네 역할 회계전표 전 액션 버튼 실 API 양방향', async ({ browser, request }) => {
  const observations: Array<Record<string, unknown>> = []

  for (const candidate of roles) {
    const loginResponse = await request.post(`${AUTH_API}/auth/login`, {
      data: { loginId: candidate.loginId, password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
    })
    expect(loginResponse.status(), `${candidate.role} login`).toBe(200)
    const session = ((await loginResponse.json()).data ?? {}) as Login
    expect(session.role).toBe(candidate.role)

    const context = await browser.newContext()
    const page = await context.newPage()
    await installSession(page, session)

    for (const kind of ['sales', 'purchase'] as const) {
      const label = kind === 'sales' ? '매출' : '매입'
      const listTestId = `${kind}-accounting-slip-page`
      await page.goto(`${BASE_URL}/#/accounting/${kind}-slips`, { waitUntil: 'domcontentloaded' })
      const list = page.getByTestId(listTestId)
      await expect(list, `${candidate.role} ${label}전표 고유 화면`).toBeVisible()
      await expect(list.getByText(kind === 'sales' ? 'R14 격리 매출' : 'R14 격리 매입')).toBeVisible()
      const listButtons = (await list.getByRole('button').allTextContents()).map((text) => text.trim()).filter(Boolean)
      expect(listButtons, `${candidate.role} ${label} 목록 액션 전수`).toEqual(
        candidate.canWrite ? ['작성', '전기'] : [],
      )
      await page.screenshot({ path: path.join(SHOTS, `${candidate.role.toLowerCase()}-${kind}-slips.png`), fullPage: true })
      observations.push({ role: candidate.role, screen: `${kind}-list`, buttons: listButtons, url: page.url() })

      if (candidate.canWrite) {
        await page.goto(`${BASE_URL}/#/accounting/${kind}-slips/new`, { waitUntil: 'domcontentloaded' })
        const form = page.getByTestId(`${kind}-accounting-slip-form-page`)
        await expect(form, `${candidate.role} ${label}전표 작성 고유 화면`).toBeVisible()
        const formButtons = (await form.getByRole('button').allTextContents()).map((text) => text.trim()).filter(Boolean)
        expect(formButtons, `${candidate.role} ${label} 작성 액션 전수`).toEqual(['목록', '임시저장'])
        await page.screenshot({ path: path.join(SHOTS, `${candidate.role.toLowerCase()}-${kind}-form.png`), fullPage: true })
        observations.push({ role: candidate.role, screen: `${kind}-form`, buttons: formButtons, url: page.url() })
      } else {
        await page.goto(`${BASE_URL}/#/accounting/${kind}-slips/new`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByTestId(`${kind}-accounting-slip-form-page`)).toHaveCount(0)
        await expect(page).toHaveURL(`${BASE_URL}/#/`)
        observations.push({ role: candidate.role, screen: `${kind}-form`, buttons: [], url: page.url(), blocked: true })
      }
    }

    await context.close()
  }

  fs.writeFileSync(path.join(SHOTS, 'button-observations.json'), JSON.stringify(observations, null, 2), 'utf8')
  console.log(`R14_BUTTON_OBSERVATIONS=${JSON.stringify(observations)}`)
})
