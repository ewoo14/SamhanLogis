import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'http'
import { readFile } from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RENDERER_ROOT = path.resolve(HERE, '../../out/renderer')
const SHOTS = resolveQaShotsDir(
  path.resolve(HERE, '../../../../docs/qa/2026-08-15-1220-adversarial'),
)
let server: Server
let origin: string

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://local.invalid').pathname
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const file = path.resolve(RENDERER_ROOT, relative)
    if (!file.startsWith(`${RENDERER_ROOT}${path.sep}`)) {
      response.writeHead(403).end()
      return
    }
    try {
      const body = await readFile(file)
      const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'
      response.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` }).end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('임시 renderer 서버 주소를 얻지 못했습니다.')
  origin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('운영 env 주입 산출물의 두 버튼이 주입된 HTTPS URL을 preload 경계로 전달한다', async ({ page }) => {
  await page.addInitScript(() => {
    const auth = {
      token: 'qa-local-only',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '적대검증자',
      partnerCode: null,
    }
    Object.defineProperty(window, '__qaOpenedUrls', { configurable: true, value: [] })
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => auth, setToken: async () => undefined, clearToken: async () => undefined },
    })
    Object.defineProperty(window, 'samhanLegacy', {
      configurable: true,
      value: {
        getEstimateUrl: async () => '',
        openExternal: async (url: string) => {
          ;(window as typeof window & { __qaOpenedUrls: string[] }).__qaOpenedUrls.push(url)
        },
      },
    })
  })
  await page.goto(`${origin}/#/sales/estimates?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  const nav = page.getByTestId('sales-subnav-external')
  await expect(nav).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '03-injected-production-entry.png'), fullPage: true })
  await nav.getByRole('button', { name: /웹 종합견적서/ }).click()
  await nav.getByRole('button', { name: /웹 주문서/ }).click()
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __qaOpenedUrls: string[] }).__qaOpenedUrls,
  )).toEqual(['https://estimate.samhan-air.com/', 'https://order.samhan-air.com'])
})
