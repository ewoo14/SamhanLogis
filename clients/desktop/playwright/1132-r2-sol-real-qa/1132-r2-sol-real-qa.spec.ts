import { expect, test, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const BUNDLE_CODE = 'AM240AXVHHR1SY'
const SHOTS = path.resolve(dirname, '../../../../docs/qa/2026-08-11-1132-r2')

fs.mkdirSync(SHOTS, { recursive: true })

async function loginAndInstallAuth(page: Page): Promise<string> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      loginId: 'dev_master',
      password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'),
    },
  })
  expect(response.ok(), `실 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()).data ?? {}
  const token = String(body.token ?? '')

  await page.addInitScript(
    ({ tok, uid, role, name }: { tok: string; uid: string; role: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({
            token: tok,
            userId: uid,
            role,
            fullName: name,
            partnerCode: null,
          }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    {
      tok: token,
      uid: String(body.userId ?? ''),
      role: String(body.role ?? 'MASTER'),
      name: String(body.displayName ?? 'dev_master'),
    },
  )
  return token
}

test('V37 대상 세트 관리자 화면에서 isDefault를 조작할 수 있다', async ({ page }) => {
  const token = await loginAndInstallAuth(page)
  const response = await page.request.get(
    `${API_BASE}/api/v1/products/${encodeURIComponent(BUNDLE_CODE)}/components`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(response.ok(), `구성품 실 GET 실패: HTTP ${response.status()}`).toBeTruthy()
  const components = await response.json() as Array<{ isDefault?: boolean }>
  expect(components.length, 'V37 대상 실 구성품이 비어 있음').toBeGreaterThan(0)

  await page.goto(`${BASE_URL}/products/${encodeURIComponent(BUNDLE_CODE)}/edit`)
  const editor = page.getByTestId('product-form-components-editor')
  await expect(editor).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(() => editor.locator('[data-testid^="product-form-component-row-"]').count(), {
      timeout: 20_000,
      message: '실 구성품 행이 관리자 편집 화면에 렌더되지 않음',
    })
    .toBe(components.length)

  const defaultControls = editor.getByRole('checkbox', { name: '기본 구성품' })
  await expect(defaultControls).toHaveCount(components.length)
  const firstControl = defaultControls.first()
  const initialChecked = await firstControl.isChecked()
  await firstControl.click()
  expect(await firstControl.isChecked(), 'checkbox 클릭이 로컬 draft를 바꾸지 않음')
    .toBe(!initialChecked)

  console.log(
    `[LIVE-FE] ${BUNDLE_CODE}: 실 GET 구성품=${components.length}, 현재 배포 기본=${components.filter((item) => item.isDefault === true).length}, 화면 checkbox=${await defaultControls.count()}, 첫 행 ${initialChecked}->${await firstControl.isChecked()} (저장 안 함)`,
  )
  await page.screenshot({
    path: path.join(SHOTS, '03-admin-bundle-default-toggle-visible.png'),
    fullPage: true,
  })
  await editor.screenshot({
    path: path.join(SHOTS, '04-admin-bundle-default-toggle-visible-editor.png'),
  })
})
