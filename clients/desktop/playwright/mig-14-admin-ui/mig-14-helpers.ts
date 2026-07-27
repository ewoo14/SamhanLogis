import { expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as http from 'http'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const BASE_URL =
  process.env['VITE_BASE_URL'] ?? process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
export const QA_DIR = resolveQaShotsDir(path.resolve(
  dirname,
  '../../../../docs/qa/mig-14-admin-ui/screenshots',
))

export const SKIP_UI =
  process.env['PLAYWRIGHT_SKIP_UI'] === '1' ||
  process.env['PLAYWRIGHT_SKIP_UI'] === 'true'

export type Permission = {
  pageCode: string
  canView: boolean
  canEdit: boolean
}

export function ensureQaDir(): void {
  if (!fs.existsSync(QA_DIR)) {
    fs.mkdirSync(QA_DIR, { recursive: true })
  }
}

export async function isServerAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const url = new URL(BASE_URL)
      const req = http.get(
        {
          hostname: url.hostname,
          port: Number(url.port) || 80,
          path: '/',
          timeout: 2000,
        },
        res => {
          resolve(true)
          res.resume()
        },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

export function appUrl(routePath: string, role = 'MANAGER', params: Record<string, string> = {}): string {
  const query = new URLSearchParams({ mockRole: role, ...params })
  return `${BASE_URL}/#${routePath}?${query.toString()}`
}

export function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

export async function waitForSettle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
}

export async function capture(page: Page, fileName: string): Promise<void> {
  ensureQaDir()
  const image = await page.screenshot({ fullPage: true })
  const destination = path.join(QA_DIR, fileName)
  // (2026-07-26 하네스 배치) 예전에는 쓰기 실패를 console.warn 으로 삼켰다 — 캡처가
  // 한 장도 안 남아도 테스트는 통과했다. QA_DIR 은 resolveQaShotsDir 이 모듈 로드
  // 시점에 mkdirSync(recursive) 로 보장하므로 여기서 실패하면 진짜 결함이다 → 그대로 던진다.
  fs.writeFileSync(destination, image)
}

export async function mockPermissions(page: Page, permissions: Permission[]): Promise<void> {
  await page.route('**/auth/admin/permissions/my', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: permissions,
      }),
    })
  })
}

export function grant(pageCodes: string[], canEdit = true): Permission[] {
  return pageCodes.map(pageCode => ({ pageCode, canView: true, canEdit }))
}

export async function mockApiJson(page: Page, pattern: string, body: unknown, status = 200): Promise<void> {
  await page.route(pattern, async route => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

export function apiPage<T>(content: T[], totalElements = content.length, page = 0, size = 50) {
  const totalPages = Math.max(1, Math.ceil(totalElements / size))
  return {
    success: true,
    data: {
      content,
      page,
      size,
      totalElements,
      totalPages,
      number: page,
      first: page <= 0,
      last: page >= totalPages - 1,
    },
  }
}

export async function expectAnyVisibleText(
  page: Page,
  candidates: string[],
  message: string,
): Promise<void> {
  const bodyText = (await page.locator('body').innerText({ timeout: 5000 })).trim()
  const found = candidates.some(candidate => bodyText.includes(candidate))
  expect(found, `${message}. candidates=${candidates.join(', ')} body=${bodyText.slice(0, 300)}`).toBe(true)
}

export async function expectNoUuidVisible(page: Page): Promise<void> {
  const bodyText = await page.locator('body').innerText({ timeout: 5000 })
  expect(
    bodyText,
    'MIG-14 UI must not expose raw UUID values; use slipNo/orderNo/partnerName/business IDs instead.',
  ).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
}

export async function expectPermissionBlocked(page: Page, routePath: string, screenshotName: string): Promise<void> {
  await page.goto(appUrl(routePath, 'SALES'), {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  })
  await waitForSettle(page)
  await capture(page, screenshotName)

  const currentUrl = page.url()
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
  const blockedByRedirect =
    currentUrl.includes('/#/') &&
    !currentUrl.includes(routePath) &&
    !currentUrl.includes(encodeURI(routePath))
  const blockedByText = /권한|접근\s*불가|forbidden|not\s*authorized/i.test(bodyText)

  expect(
    blockedByRedirect || blockedByText,
    `권한 없는 SALES 직접 진입이 차단되어야 함. url=${currentUrl} body=${bodyText.slice(0, 300)}`,
  ).toBe(true)
}

export async function expectMenuHidden(page: Page, menuText: RegExp, screenshotName: string): Promise<void> {
  await page.goto(appUrl('/', 'SALES'), {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  })
  await waitForSettle(page)
  await capture(page, screenshotName)

  const visibleMenuCount = await page.getByRole('link', { name: menuText }).count()
  expect(visibleMenuCount, `권한 없는 SALES 사이드바에는 ${menuText} 메뉴가 노출되면 안 됨`).toBe(0)
}
