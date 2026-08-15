import { expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiBase = process.env['API_BASE']
if (!apiBase) throw new Error('API_BASE is required for real QA')

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1218-desktop-menu-real-qa'))
fs.mkdirSync(shots, { recursive: true })

type Session = {
  token: string
  userId: string
  role: string
  fullName: string
}

async function login(page: Page): Promise<Session> {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_developer', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(response.status(), 'DEVELOPER login').toBe(200)
  const data = (await response.json()).data
  return {
    token: data.token,
    userId: data.userId,
    role: data.role,
    fullName: data.displayName ?? 'dev_developer',
  }
}

async function installAuth(page: Page, session: Session): Promise<void> {
  await page.addInitScript(({ token, userId, role, fullName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
}

test('실서버 DEVELOPER 계정은 개발 메뉴를 본다', async ({ page }) => {
  const catalogResponses: string[] = []
  page.on('response', async (response) => {
    if (response.url().includes('/auth/admin/menu-catalog') || response.url().includes('/auth/admin/permissions/my')) {
      catalogResponses.push(`${response.status()} ${await response.text()}`)
    }
  })

  const session = await login(page)
  expect(session.role).toBe('DEVELOPER')
  const permissionsResponse = await page.request.get(`${apiBase}/auth/admin/permissions/my`, {
    headers: { Authorization: `Bearer ${session.token}` },
  })
  const permissionsBody = await permissionsResponse.text()
  await installAuth(page, session)
  await page.goto('/#/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  const observation = {
    role: session.role,
    loginId: 'dev_developer',
    route: page.url(),
    catalogResponses,
    permissionsResponse: `${permissionsResponse.status()} ${permissionsBody}`,
    bodyText: await page.locator('body').innerText(),
    howUserGetsHere: '사용자는 실제 DEVELOPER 계정으로 로그인한 뒤 기본 홈에서 인사 > 개발 그룹의 메뉴를 통해 각 화면으로 이동한다.',
  }
  fs.writeFileSync(path.join(shots, 'developer-menu-observation.json'), JSON.stringify(observation, null, 2), 'utf8')
  const developmentToggle = page.getByTestId('sidebar-category-toggle-개발')
  await developmentToggle.click()
  await expect(developmentToggle).toHaveAttribute('aria-expanded', 'true')
  console.log(JSON.stringify({
    developmentExpanded: await developmentToggle.getAttribute('aria-expanded'),
    devTestIds: await page.locator('[data-testid^="sidebar-dev-"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid'))),
    developmentGroupText: await page.locator('[aria-labelledby="sidebar-group-heading-개발"]').allTextContents(),
  }))
  await page.screenshot({ path: path.join(shots, 'developer-menu-sidebar.png'), fullPage: true })
  console.log(JSON.stringify(observation))

  await expect(page.getByTestId('sidebar-dev-app-releases')).toContainText('버전 관리')
  await expect(page.getByTestId('sidebar-dev-popup-notice')).toContainText('팝업공지')
  await expect(page.getByTestId('sidebar-dev-activity-log')).toContainText('로그')

})
