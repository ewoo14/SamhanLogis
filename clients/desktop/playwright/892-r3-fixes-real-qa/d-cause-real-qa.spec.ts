/** D 결함 원인 격리 — 브라우저가 X-Has-Next-Page 를 읽을 수 있는가 (CORS) vs 캐시가 떨구는가 */
import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5191'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')

test('D 원인 격리', async ({ page }) => {
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

  // ① 브라우저(fetch)가 커스텀 헤더를 읽을 수 있는가 — CORS 노출 여부
  const probe = await page.evaluate(async ({ api, token, userId, role }) => {
    const r = await fetch(`${api}/admin/groupware/messages/inbox?page=0`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-User-Id': userId, 'X-User-Role': role },
    })
    const visible: string[] = []
    r.headers.forEach((_v, k) => visible.push(k))
    return {
      status: r.status,
      hasNextHeader: r.headers.get('x-has-next-page'),
      visibleHeaders: visible.sort(),
    }
  }, { api: API_BASE, token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER' })

  console.log('■ 브라우저에서 본 응답 헤더 =', JSON.stringify(probe.visibleHeaders))
  console.log('■ x-has-next-page 값        =', probe.hasNextHeader)

  // ② 앱이 실제로 그리는 다음 버튼 상태
  const nextDisabled = await page.getByRole('button', { name: '다음' }).isDisabled()
  console.log('■ 화면 다음 버튼 disabled   =', nextDisabled)

  expect(probe.status).toBe(200)
})
