import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'

async function installAuth(page: import('@playwright/test').Page): Promise<void> {
  const login = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })
}

test('LUNA B-1 — DETAIL screen/print style parity at mobile and desktop', async ({ page }) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await installAuth(page)
    await page.goto(`${BASE_URL}/groupware/document-templates/new/edit`)
    await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
    const preview = page.getByTestId('document-template-live-preview')
    await page.getByRole('button', { name: '품목행 추가' }).click()
    await page.locator('fieldset').filter({ hasText: '스타일' }).locator('input[type="number"]').fill('20')
    const measure = () => preview.locator('[data-template-detail]').evaluate((node) => {
      const table = node.querySelector('table')!
      const cell = node.querySelector('td')!
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(table)
      return { fontSize: style.fontSize, padding: getComputedStyle(cell).padding, height: rect.height }
    })
    const screen = await measure()
    await page.emulateMedia({ media: 'print' })
    const print = await measure()
    console.log(`LUNA B-1 width=${width} screen=${JSON.stringify(screen)} print=${JSON.stringify(print)}`)
    expect(Math.abs(parseFloat(screen.fontSize) - parseFloat(print.fontSize)), `DETAIL font drift at ${width}px`).toBeLessThan(1)
    expect(Math.abs(parseFloat(screen.padding) - parseFloat(print.padding)), `DETAIL padding drift at ${width}px`).toBeLessThan(0.1)
    await page.emulateMedia({ media: 'screen' })
  }
})

test('LUNA B-2 — HEADER coordinate origin is stable across mobile print media', async ({ page }) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await installAuth(page)
    await page.goto(`${BASE_URL}/groupware/document-templates/new/edit`)
    await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
    const preview = page.getByTestId('document-template-live-preview')
    await page.getByRole('button', { name: '이미지/로고 추가' }).click()
    const measure = () => preview.evaluate((root) => {
      const paper = root.querySelector<HTMLElement>('.paper')!
      const layer = root.querySelector<HTMLElement>('[data-testid="document-template-v2-elements-header"]')!
      const body = root.querySelector<HTMLElement>('.approval-doc-print-content')!
      const header = root.querySelector<HTMLElement>('.print-approval-doc-header')!
      const doc = root.querySelector<HTMLElement>('.print-approval-doc')!
      return { topFromPaper: layer.getBoundingClientRect().top - paper.getBoundingClientRect().top, headerLayerWidth: layer.getBoundingClientRect().width, bodyContentWidth: body.getBoundingClientRect().width, headerHeight: header.getBoundingClientRect().height, docTop: doc.getBoundingClientRect().top, paperTop: paper.getBoundingClientRect().top }
    })
    const screen = await measure()
    await page.emulateMedia({ media: 'print' })
    const print = await measure()
    console.log(`LUNA B-2 width=${width} screen=${JSON.stringify(screen)} print=${JSON.stringify(print)}`)
    expect(Math.abs(screen.topFromPaper - print.topFromPaper), `HEADER top drift at ${width}px`).toBeLessThan(2)
    expect(Math.abs(screen.headerLayerWidth - screen.bodyContentWidth), `H7 width drift at ${width}px`).toBeLessThan(2)
    expect(Math.abs(print.headerLayerWidth - print.bodyContentWidth), `H7 print width drift at ${width}px`).toBeLessThan(2)
    await page.emulateMedia({ media: 'screen' })
  }
})

test('LUNA B-4 — IMAGE inspector does not expose non-rendering text controls', async ({ page }) => {
  await installAuth(page)
  await page.goto(`${BASE_URL}/groupware/document-templates/new/edit`)
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: '이미지/로고 추가' }).click()
  const inspector = page.getByRole('region', { name: '속성 패널' })
  await expect(inspector.getByText('글꼴 크기')).toHaveCount(0)
  await expect(inspector.getByText('굵게')).toHaveCount(0)
  await expect(inspector.getByText('정렬')).toHaveCount(0)
  await expect(inspector.getByText('테두리')).toBeVisible()
})
