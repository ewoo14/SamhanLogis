import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { parseEnvFile, resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL']
if (!BASE_URL) throw new Error('AUDIT_BASE_URL가 필요합니다 — 실서버 렌더러 주소를 지정하십시오.')

const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), 'playwright/1223-nav-duplication-real-qa'))
const QA_ENV = parseEnvFile(path.resolve(process.cwd(), '../../infrastructure/.env.local'))

async function login(page: Page, loginId = 'dev_master', password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('input').nth(0).fill(loginId)
  await page.locator('input').nth(1).fill(password)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await page.waitForURL(/#\/$/, { timeout: 20_000 })
  await page.waitForTimeout(1200)
}

async function openSales(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}#${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

async function capture(page: Page, file: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: true })
}

function visible(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true }).isVisible().catch(() => false)
}

test('라이브 QA — 판매 사이드바와 견적서 관리 화면', async ({ page }) => {
  await login(page)
  await openSales(page, '/sales/estimates')

  await expect(page.getByRole('button', { name: '웹 종합견적서 ↗', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '웹 주문서 ↗', exact: true })).toBeVisible()
  await capture(page, '01-estimates-sidebar-and-no-subnav.png')
  console.log('[SHOT] 01-estimates-sidebar-and-no-subnav.png — 사용자는 로그인 후 사이드바 판매 그룹에서 견적서 관리로 이동한다.')
  console.log('[ESTIMATE URL]', page.url())
  console.log('[ESTIMATE BODY]', (await page.locator('body').innerText()).slice(0, 5000))
  console.log('[ESTIMATE NAV TEXT]', await page.locator('nav').allTextContents())
})

test('라이브 QA — 주문서 관리 상단 sub navigation 제거', async ({ page }) => {
  await login(page)
  await openSales(page, '/sales/partner-orders')
  await expect(page.getByRole('button', { name: '웹 종합견적서 ↗', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '웹 주문서 ↗', exact: true })).toBeVisible()
  await capture(page, '02-orders-sidebar-and-no-subnav.png')
  console.log('[SHOT] 02-orders-sidebar-and-no-subnav.png — 사용자는 로그인 후 사이드바 판매 그룹에서 주문서 관리로 이동한다.')
  console.log('[ORDER URL]', page.url())
  console.log('[ORDER BODY]', (await page.locator('body').innerText()).slice(0, 5000))
  console.log('[ORDER NAV TEXT]', await page.locator('nav').allTextContents())
})

test('라이브 QA — 웹 종합견적서 미설정 fail-closed', async ({ page }) => {
  await login(page)
  await openSales(page, '/sales/estimates')
  await expect(page.getByRole('button', { name: '웹 종합견적서 ↗', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '웹 종합견적서 ↗', exact: true }).click()
  await expect(page.getByText('외부 웹앱 주소가 운영 빌드에 설정되지 않았습니다', { exact: true })).toBeVisible()
  await capture(page, '03-web-estimate-fail-closed.png')
  console.log('[SHOT] 03-web-estimate-fail-closed.png — 사용자는 사이드바 판매 그룹의 웹 종합견적서 ↗를 클릭해 안내를 본다.')
  console.log('[FAIL CLOSED URL]', page.url())
})

test('라이브 QA — 권한 없는 역할의 외부 링크 노출 관측', async ({ page }) => {
  const candidates = [
    ['QA_KIMGICHEOL_LOGIN_ID', 'QA_KIMGICHEOL_PASSWORD'],
    ['QA_KIMEUNJI_LOGIN_ID', 'QA_KIMEUNJI_PASSWORD'],
  ] as const
  let observed = false
  for (const [idKey, passwordKey] of candidates) {
    const loginId = QA_ENV[idKey]
    const password = QA_ENV[passwordKey]
    if (!loginId || !password) {
      console.log('[ROLE OBSERVATION SKIP]', `${idKey}/${passwordKey} 자격 없음`)
      continue
    }
    await login(page, loginId, password)
    await openSales(page, '/sales/estimates')
    const body = await page.locator('body').innerText()
    const roleLine = body.split('\n').find((line) => /MASTER|MANAGER|SALES|ACCOUNTANT|WAREHOUSE|역할/.test(line)) ?? '<role-line-not-found>'
    const estimateVisible = await visible(page, '웹 종합견적서 ↗')
    const orderVisible = await visible(page, '웹 주문서 ↗')
    console.log('[ROLE CANDIDATE]', loginId, roleLine)
    console.log('[ROLE EXTERNAL LINK VISIBILITY]', JSON.stringify({ estimateVisible, orderVisible }))
    if (!estimateVisible && !orderVisible) {
      await capture(page, '04-role-visibility.png')
      console.log('[SHOT] 04-role-visibility.png — 사용자는 외부 링크 권한이 없는 역할로 로그인 후 판매 사이드바를 확인한다.')
      observed = true
      break
    }
  }
  if (!observed) console.log('[UNAUTHORIZED ROLE] 관측 불가 — 제공된 후보 계정에서 외부 링크 숨김 상태를 확인하지 못함')
})
