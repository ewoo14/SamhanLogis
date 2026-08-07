import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5331'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const PHASE = process.env['SHOT_PHASE'] ?? 'after'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '880-luna-round-2026-07-24'))

type Auth = { token: string; userId: string; role: string; fullName: string }

async function login(page: Page): Promise<Auth> {
  const response = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(response.ok(), `dev_master 로그인 실패 HTTP ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data ?? {}
  return {
    token: data.token ?? '',
    userId: data.userId ?? '',
    role: data.role ?? 'MASTER',
    fullName: data.displayName ?? '개발책임자',
  }
}

async function injectAuth(page: Page, auth: Auth) {
  await page.addInitScript((value: Auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...value, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
}

test('권한그룹 관리 실서버 — 좁은 폭 전폭·개명 클릭·빌트인 잠금·넓은 폭 2열', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const auth = await login(page)
  await injectAuth(page, auth)

  for (const width of [375, 320, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${BASE_URL}/#/admin/permission-groups/manage`, {
      waitUntil: 'domcontentloaded',
      timeout: 25_000,
    })
    const tableContainer = page.getByTestId('perm-group-manage-table')
    if (PHASE === 'before') {
      await expect(tableContainer).toHaveCount(1, { timeout: 20_000 })
      await expect(tableContainer.locator('table')).toHaveCount(1, { timeout: 20_000 })
    } else {
      await expect(tableContainer).toBeVisible({ timeout: 20_000 })
      await expect(tableContainer.locator('table')).toBeVisible({ timeout: 20_000 })
    }

    await page.screenshot({
      path: join(SHOT_DIR, `permission-group-${PHASE}-${width}.png`),
      fullPage: true,
    })
    if (PHASE === 'before') continue

    const layout = tableContainer.locator('xpath=../..')
    const sections = layout.locator(':scope > section')
    const layoutBox = await layout.boundingBox()
    const listBox = await sections.nth(0).boundingBox()
    expect(layoutBox, `${width}px layout 실측`).not.toBeNull()
    expect(listBox, `${width}px 조작 표 실측`).not.toBeNull()

    if (width <= 768) {
      expect(listBox!.width, `${width}px 조작 표 전폭`).toBeGreaterThanOrEqual(layoutBox!.width * 0.9)
      const edit = page.getByTestId('perm-group-edit-개발자')
      await expect(edit, `${width}px 개명 버튼 표시`).toBeVisible()
      await expect(edit, `${width}px 개명 버튼 활성`).toBeEnabled()
      await expect(page.getByTestId('perm-group-edit-master'), `${width}px 마스터 개명 잠금`).toBeDisabled()
      await expect(page.getByTestId('perm-group-delete-master'), `${width}px 마스터 삭제 잠금`).toBeDisabled()
      if (width === 375) {
        await edit.click()
        await expect(page.getByTestId('perm-group-form-name')).toHaveValue('개발자')
        await page.getByRole('button', { name: '취소', exact: true }).click()
      }
    } else {
      const formBox = await sections.nth(1).boundingBox()
      expect(formBox, `${width}px 계정 배속 폼 실측`).not.toBeNull()
      expect(listBox!.width, `${width}px 목록 1열 유지`).toBeGreaterThan(300)
      expect(formBox!.width, `${width}px 배속 2열 유지`).toBeGreaterThan(300)
    }
  }
})
