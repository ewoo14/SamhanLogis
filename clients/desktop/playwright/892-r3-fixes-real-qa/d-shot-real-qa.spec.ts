import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** D 결함 증거 캡처 — 51건 수신함인데 `다음` 이 비활성 (2페이지 도달 불가) */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5191'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '892-r3-live-qa-2026-07-23'))

test.use({ viewport: { width: 1600, height: 1000 } })

test('D 결함 증거 — 51건인데 다음 비활성', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const login = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  const d = (await login.json()).data ?? {}
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })

  await page.goto(`${BASE_URL}/#/messenger`)
  await expect(page.getByTestId('messenger-page')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('1페이지')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'D-결함-51건-다음버튼-비활성.png'), fullPage: true })

  // 페이저 영역 근접 캡처
  const pager = page.getByText('1페이지').locator('..')
  await pager.screenshot({ path: join(SHOT_DIR, 'D-결함-페이저-근접.png') })
  console.log('■ 다음 disabled =', await page.getByRole('button', { name: '다음' }).isDisabled())
})
