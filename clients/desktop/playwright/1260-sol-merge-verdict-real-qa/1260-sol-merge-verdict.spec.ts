import { expect, test, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5183'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(
  path.resolve(HERE, '../../../../docs/qa/d03-s5-blocker-fix'),
)

type ScreenResult = {
  screen: string
  totalRows: number
  visibleRows: number
  remote: string[]
  panel: string[]
  shape?: string[]
}

async function optionValues(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluate((node) =>
    Array.from((node as HTMLSelectElement).options).map((option) => option.value),
  )
}

async function captureScreen(
  page: Page,
  screen: string,
  bodyClass: string,
  rowSelector: string,
  optsSelector: string,
  remoteSelector: string,
  panelSelector: string,
  shapeSelector?: string,
): Promise<ScreenResult> {
  await expect(page.locator('body')).toHaveClass(new RegExp(bodyClass))
  await expect(page.locator(optsSelector)).toBeVisible()
  const rows = page.locator(rowSelector)
  const result: ScreenResult = {
    screen,
    totalRows: await rows.count(),
    visibleRows: await rows.evaluateAll((nodes) =>
      nodes.filter((node) => {
        const element = node as HTMLElement
        return element.offsetWidth > 0 || element.offsetHeight > 0
      }).length,
    ),
    remote: await optionValues(page, remoteSelector),
    panel: await optionValues(page, panelSelector),
  }
  if (shapeSelector) result.shape = await optionValues(page, shapeSelector)
  await page.locator(optsSelector).screenshot({
    path: path.resolve(SHOTS, `${screen}-remote-panel-options.png`),
  })
  return result
}

test('PR #1260 SOL 머지 판정 — 세 화면 옵션·인피니트·화면단 동적 반영', async ({ page }) => {
  const login = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      loginId: 'dev_master',
      password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'),
    },
  })
  expect(login.ok(), `직원 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const auth = (await login.json()).data ?? {}
  await page.addInitScript(({ token, role, userId, name }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, role, userId, fullName: name, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, {
    token: auth.token ?? '',
    role: auth.role ?? '',
    userId: auth.userId ?? '',
    name: auth.displayName ?? 'dev_master',
  })

  await page.goto(`${BASE_URL}/?email=dev_master%40samhan-air.com`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  })
  await page.waitForSelector('#btnGoHome', { timeout: 60_000 })

  await page.locator('#btnGoHome').click()
  const home = await captureScreen(
    page, '01-home-multi', 'home-active', '#homeBody tr', '#homeOpts',
    '#home_remote', '#home_panel',
  )
  const diagnostics = await page.evaluate(() => {
    const inspect = (rows: Array<Record<string, unknown>>) => ({
      rows: rows.length,
      kindRemote: rows.filter((row) => String(row.componentKind ?? row.kind ?? '').toUpperCase() === 'REMOTE').length,
      kindPanel: rows.filter((row) => String(row.componentKind ?? row.kind ?? '').toUpperCase() === 'PANEL').length,
      remoteAttr: rows.filter((row) => row.remote_type || row.remoteType || row.remoteOption).length,
      panelAttr: rows.filter((row) => row.panel_type || row.panelType).length,
      shapeAttr: rows.filter((row) => row.componentShape || row.shape).length,
      nameRemote: rows.filter((row) => /리모컨|remote/i.test(`${String(row.name ?? '')} ${String(row.feat ?? '')}`)).length,
      namePanel: rows.filter((row) => /판넬|패널|panel/i.test(`${String(row.name ?? '')} ${String(row.feat ?? '')}`)).length,
    })
    return {
      home: inspect(HOMEMULTI),
      single: inspect(SINGLE_PARTS),
      commercialParts: inspect(COMM_PARTS),
      commercialCatalog: inspect(COMMULTI),
      configured: {
        homeRemote: d03ConfiguredVariants_(HOMEMULTI, 'REMOTE'),
        homePanel: d03ConfiguredVariants_(HOMEMULTI, 'PANEL'),
        singleRemote: d03ConfiguredVariants_(SINGLE_PARTS, 'REMOTE'),
        singlePanel: d03ConfiguredVariants_(SINGLE_PARTS, 'PANEL'),
        commercialRemote: d03ConfiguredVariants_(COMMULTI.length ? COMMULTI : COMM_PARTS, 'REMOTE'),
        commercialPanel: d03ConfiguredVariants_(COMMULTI.length ? COMMULTI : COMM_PARTS, 'PANEL'),
        commercialShapes: ['원형', '사각'],
      singleShapes: d03ConfiguredShapes_(SINGLE_PARTS),
      commercialKinds: Object.entries(COMM_PARTS.reduce((acc, row) => { const key = String(row.kind ?? ''); acc[key] = (acc[key] ?? 0) + 1; return acc }, {} as Record<string, number>)),
      },
    }
  })
  console.log(`[PR1260-SOL-DIAGNOSTICS] ${JSON.stringify(diagnostics)}`)
  expect(home.remote.length, '홈멀티 리모컨 셀렉트는 제외 외 실제 옵션을 렌더해야 함').toBeGreaterThanOrEqual(2)
  expect(home.panel.length, '홈멀티 판넬 셀렉트는 판넬제외 외 실제 옵션을 렌더해야 함').toBeGreaterThanOrEqual(2)

  const infinite = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#homeBody tr'))
    const row = rows.find((node) => /인피니트/.test(node.textContent ?? '')) as HTMLElement | undefined
    if (!row) return { found: false, rowText: '', panel: [] as string[] }
    row.scrollIntoView({ block: 'center' })
    const input = row.querySelector('.qty-input') as HTMLInputElement | null
    if (input) {
      input.value = '1'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const panel = document.querySelector('#home_panel') as HTMLSelectElement
    return {
      found: true,
      rowText: (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
      panel: Array.from(panel.options).map((option) => option.value),
    }
  })
  expect(infinite.found).toBeTruthy()
  expect(infinite.panel.length, '인피니트 판넬 셀렉트는 판넬 4종과 제외를 렌더해야 함').toBeGreaterThanOrEqual(5)
  await page.locator('#homeOpts').screenshot({
    path: path.resolve(SHOTS, '02-infinite-home-panel-options.png'),
  })

  await page.locator('#btnGoComm').click()
  const commercial = await captureScreen(
    page, '03-commercial-multi', 'comm-active', '#commBody tr', '#commOpts',
    '#comm_remote', '#comm_panel', '#comm_p360',
  )
  expect(commercial.remote.length, '상업멀티 리모컨 셀렉트는 DB 속성값을 렌더해야 함').toBeGreaterThanOrEqual(2)
  expect(commercial.panel.length, '상업멀티 판넬 셀렉트는 DB 속성값을 렌더해야 함').toBeGreaterThanOrEqual(2)
  expect(commercial.shape?.length ?? 0, '상업멀티 360판넬 셀렉트는 원형·사각을 렌더해야 함').toBeGreaterThanOrEqual(2)

  await page.locator('#btnGoSingle').click()
  const single = await captureScreen(
    page, '04-single', 'single-active', '#singleBody tr', '#singleOpts',
    '#ss_remote', '#ss_panel', '#ss_p360',
  )
  expect(single.remote.length, '싱글중대형 리모컨 셀렉트는 구성품 variant를 렌더해야 함').toBeGreaterThanOrEqual(2)
  expect(single.panel.length, '싱글중대형 판넬 셀렉트는 구성품 variant를 렌더해야 함').toBeGreaterThanOrEqual(2)
  expect(single.shape?.length ?? 0, '싱글중대형 360판넬 셀렉트는 원형·사각을 렌더해야 함').toBeGreaterThanOrEqual(2)

  const exclusion = await page.evaluate(() => {
    const remote = document.querySelector('#ss_remote') as HTMLSelectElement
    const excluded = document.querySelector('#ss_remote_ex') as HTMLInputElement
    remote.value = '유선'
    excluded.checked = true
    remote.dispatchEvent(new Event('change', { bubbles: true }))
    excluded.dispatchEvent(new Event('change', { bubbles: true }))
    const set = SINGLE_SETS.find((item) =>
      partsForSetStrict_(item).some((part) =>
        /리모컨/.test(`${String(part?.kind ?? '')} ${String(part?.name ?? '')}`),
      ),
    )
    const parts = set ? explodeSetParts(set, 1) : []
    return {
      selected: remote.value,
      excluded: excluded.checked,
      setFound: Boolean(set),
      emittedRemoteParts: parts.filter((part) =>
        /리모컨/.test(`${String(part?.kind ?? '')} ${String(part?.name ?? '')}`),
      ).map((part) => ({ model: part.model, qty: part.qty })),
    }
  })
  expect(exclusion).toMatchObject({
    selected: '유선',
    excluded: true,
    setFound: true,
    emittedRemoteParts: [],
  })
  await page.locator('#singleOpts').screenshot({
    path: path.resolve(SHOTS, '05-single-wired-exclusion-wins.png'),
  })

  const dynamic = await page.evaluate(() => {
    const parts = SINGLE_PARTS as Array<Record<string, unknown>>
    const row = parts.find((item) =>
      String(item.componentKind ?? item.kind ?? '').toUpperCase() === 'REMOTE')
    if (!row) return { applied: false, before: [] as string[], after: [] as string[] }
    const select = document.querySelector('#ss_remote') as HTMLSelectElement
    const before = Array.from(select.options).map((option) => option.value)
    const original = row.componentVariant ?? row.variant ?? row.feat
    row.componentVariant = 'SOL-화면격리-동적옵션'
    document.querySelector('#singleOpts')!.innerHTML = ''
    renderSingleOptions()
    const next = document.querySelector('#ss_remote') as HTMLSelectElement
    const after = Array.from(next.options).map((option) => option.value)
    next.value = 'SOL-화면격리-동적옵션'
    row.componentVariant = original
    return { applied: after.includes('SOL-화면격리-동적옵션'), before, after }
  })
  expect(dynamic.applied).toBeTruthy()
  await page.locator('#singleOpts').screenshot({
    path: path.resolve(SHOTS, '06-isolated-component-change-reflected.png'),
  })

  const evidence = { home, infinite, commercial, single, exclusion, dynamic }
  fs.writeFileSync(
    path.resolve(SHOTS, 'live-measurement.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8',
  )
  console.log(`[PR1260-SOL] ${JSON.stringify(evidence)}`)
})
