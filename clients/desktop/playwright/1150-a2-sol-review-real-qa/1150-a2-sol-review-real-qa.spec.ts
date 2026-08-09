import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Locator, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/2026-08-09-1150-a2-sol-review-real-qa/screenshots',
))

interface LoginResult { token: string; role: string; userId: string; displayName: string }
interface Warehouse { id: string; code: string; name: string; type: string; active: boolean }
interface NativeInputEventLog {
  type: string
  data?: string | null
  inputType?: string
  isComposing?: boolean
  key?: string
  value: string
  selectionStart: number | null
  selectionEnd: number | null
}

async function realLogin(page: Page): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(response.ok(), `실서버 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()).data ?? {}
  return {
    token: body.token ?? '',
    role: body.role ?? '',
    userId: body.userId ?? '',
    displayName: body.displayName ?? 'dev_master',
  }
}

async function installAuthBridge(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ token, role, userId, displayName }: LoginResult) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token, role, userId, fullName: displayName, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    login,
  )
}

async function fetchWarehouses(page: Page, token: string): Promise<Warehouse[]> {
  const response = await page.request.get(`${API_BASE}/inventory/warehouses`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok(), `창고 조회 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()).data
  expect(Array.isArray(body), '창고 응답 data가 배열이 아님').toBeTruthy()
  return body as Warehouse[]
}

function searchWarehouses(warehouses: Warehouse[], query: string): Warehouse[] {
  const trimmed = query.trim()
  if (!trimmed) return warehouses
  const lower = trimmed.toLocaleLowerCase()
  const byCode = warehouses.filter((warehouse) => warehouse.code.toLocaleLowerCase().startsWith(lower))
  const codeIds = new Set(byCode.map((warehouse) => warehouse.id))
  return [
    ...byCode,
    ...warehouses.filter((warehouse) =>
      !codeIds.has(warehouse.id) && warehouse.name.toLocaleLowerCase().includes(lower)),
  ]
}

function shortestUniqueQuery(warehouses: Warehouse[], target: Warehouse): string {
  const candidates: string[] = []
  for (let length = 1; length <= target.code.length; length += 1) {
    candidates.push(target.code.slice(0, length))
  }
  for (let length = 1; length <= target.name.length; length += 1) {
    for (let start = 0; start + length <= target.name.length; start += 1) {
      candidates.push(target.name.slice(start, start + length))
    }
  }
  return candidates
    .sort((left, right) => left.length - right.length)
    .find((query) => searchWarehouses(warehouses, query).length === 1) ?? target.code
}

function shortestUniqueCodePrefix(warehouses: Warehouse[], target: Warehouse): string | undefined {
  for (let length = 1; length <= target.code.length; length += 1) {
    const query = target.code.slice(0, length)
    if (searchWarehouses(warehouses, query).length === 1) return query
  }
  return undefined
}

function shortestUniqueHangulQuery(warehouses: Warehouse[], target: Warehouse, minLength = 1): string | undefined {
  const characters = [...target.name]
  for (let length = minLength; length <= characters.length; length += 1) {
    for (let start = 0; start + length <= characters.length; start += 1) {
      const query = characters.slice(start, start + length).join('')
      if (/^[가-힣]+$/.test(query) && searchWarehouses(warehouses, query).length === 1) return query
    }
  }
  return undefined
}

async function openMergeWarehouse(page: Page): Promise<Locator> {
  await page.goto(`${BASE_URL}/#/sales/partner-orders`)
  await expect(page.getByTestId('merge-convert-open')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('merge-convert-open').click()
  const input = page.getByTestId('merge-convert-warehouse').locator('input')
  await expect(input).toBeEnabled({ timeout: 30_000 })
  return input
}

async function resetAutocomplete(input: Locator): Promise<void> {
  await input.click()
  await input.press('Control+A')
  await input.press('Backspace')
}

async function selection(input: Locator): Promise<{ value: string; start: number | null; end: number | null }> {
  return input.evaluate((node: HTMLInputElement) => ({
    value: node.value,
    start: node.selectionStart,
    end: node.selectionEnd,
  }))
}

async function installNativeInputProbe(input: Locator): Promise<void> {
  await input.evaluate((node: HTMLInputElement) => {
    const holder = window as typeof window & { __a2NativeEvents?: NativeInputEventLog[] }
    holder.__a2NativeEvents = []
    const record = (event: Event) => {
      const inputEvent = event as InputEvent
      const keyboardEvent = event as KeyboardEvent
      holder.__a2NativeEvents!.push({
        type: event.type,
        data: 'data' in inputEvent ? inputEvent.data : undefined,
        inputType: 'inputType' in inputEvent ? inputEvent.inputType : undefined,
        isComposing: 'isComposing' in inputEvent ? inputEvent.isComposing : undefined,
        key: 'key' in keyboardEvent ? keyboardEvent.key : undefined,
        value: node.value,
        selectionStart: node.selectionStart,
        selectionEnd: node.selectionEnd,
      })
    }
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input', 'keydown']) {
      node.addEventListener(type, record)
    }
  })
}

async function nativeEvents(page: Page): Promise<NativeInputEventLog[]> {
  return page.evaluate(() =>
    ((window as typeof window & { __a2NativeEvents?: NativeInputEventLog[] }).__a2NativeEvents ?? []),
  )
}

test.describe.serial('PR #1150 A2 SOL 첫 적대검증 — 실 API/mock OFF', () => {
  test('창고 발화 조건 카운트 + 원 결함/붙여넣기/연속입력/지우고 재입력', async ({ page, context }) => {
    const login = await realLogin(page)
    await installAuthBridge(page, login)
    const warehouses = (await fetchWarehouses(page, login.token)).filter((warehouse) => warehouse.type !== 'VIRTUAL')
    const reachable = warehouses
      .map((warehouse) => ({ warehouse, codePrefix: shortestUniqueCodePrefix(warehouses, warehouse), query: shortestUniqueQuery(warehouses, warehouse) }))
      .filter((entry) => searchWarehouses(warehouses, entry.query).length === 1)
    console.log('[WAREHOUSE_TRIGGER_COUNT]', JSON.stringify({
      visible: warehouses.length,
      reachable: reachable.length,
      uniqueCodePrefix: reachable.filter((entry) => entry.codePrefix).length,
      triggers: reachable.map((entry) => ({ code: entry.warehouse.code, name: entry.warehouse.name, query: entry.query, codePrefix: entry.codePrefix ?? null })),
    }))
    expect(reachable.length, '자동확정 발화 가능한 창고가 0건이라 판정 불가').toBeGreaterThan(0)

    const targetEntry = reachable.find((entry) => entry.codePrefix && entry.codePrefix.length < entry.warehouse.code.length) ?? reachable[0]!
    const target = targetEntry.warehouse
    const query = targetEntry.codePrefix ?? targetEntry.query
    const label = `${target.code} · ${target.name}`
    const input = await openMergeWarehouse(page)

    await input.fill(query)
    await expect(input).toHaveValue(label)
    const afterConfirm = await selection(input)
    const residual = target.code.slice(query.length, query.length + 1) || 'X'
    await input.type(residual)
    await expect(input).toHaveValue(label)
    const afterResidual = await selection(input)
    console.log('[WAREHOUSE_ORIGINAL_DEFECT]', JSON.stringify({ query, residual, label, afterConfirm, afterResidual }))
    await page.screenshot({ path: path.join(SHOTS, '01-warehouse-original-defect.png'), fullPage: false })

    await resetAutocomplete(input)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL })
    await page.evaluate((value) => navigator.clipboard.writeText(value), query)
    await input.press('Control+V')
    await expect(input).toHaveValue(label)
    console.log('[WAREHOUSE_PASTE]', JSON.stringify(await selection(input)))

    await resetAutocomplete(input)
    const fastText = `${query}${residual}`
    await input.pressSequentially(fastText, { delay: 0 })
    await expect(input).toHaveValue(label)
    console.log('[WAREHOUSE_FAST_INPUT]', JSON.stringify({ fastText, state: await selection(input) }))

    await resetAutocomplete(input)
    await input.pressSequentially(query, { delay: 10 })
    await expect(input).toHaveValue(label)
    await resetAutocomplete(input)
    await input.pressSequentially(query, { delay: 10 })
    await expect(input).toHaveValue(label)
    console.log('[WAREHOUSE_CLEAR_RETYPE]', JSON.stringify(await selection(input)))
  })

  test('창고 IME 네이티브 composition 중 자동확정 + 갱신(backspace 상당) + ESC', async ({ page }) => {
    const login = await realLogin(page)
    await installAuthBridge(page, login)
    const warehouses = (await fetchWarehouses(page, login.token)).filter((warehouse) => warehouse.type !== 'VIRTUAL')
    const target = warehouses.find((warehouse) => shortestUniqueHangulQuery(warehouses, warehouse)) ?? warehouses[0]!
    const query = shortestUniqueHangulQuery(warehouses, target) ?? target.name
    const updateQuery = shortestUniqueHangulQuery(warehouses, target, 2) ?? query
    const label = `${target.code} · ${target.name}`
    const input = await openMergeWarehouse(page)
    await installNativeInputProbe(input)
    await input.click()
    const cdp = await page.context().newCDPSession(page)

    await cdp.send('Input.imeSetComposition', { text: updateQuery, selectionStart: updateQuery.length, selectionEnd: updateQuery.length })
    await page.waitForTimeout(100)
    const duringComposition = await selection(input)
    const duringEvents = await nativeEvents(page)
    console.log('[WAREHOUSE_IME_DURING]', JSON.stringify({ query: updateQuery, label, duringComposition, events: duringEvents }))
    expect(duringComposition.value, '네이티브 IME 조합 중 자동확정됨').not.toBe(label)
    expect(duringEvents.some((event) => event.type === 'compositionstart'), '네이티브 compositionstart 미발생').toBeTruthy()
    expect(duringEvents.some((event) => event.inputType === 'insertCompositionText' && event.isComposing === true), '네이티브 insertCompositionText 미발생').toBeTruthy()
    await page.screenshot({ path: path.join(SHOTS, '02-warehouse-ime-during.png'), fullPage: false })

    const shortened = query
    await cdp.send('Input.imeSetComposition', { text: shortened, selectionStart: shortened.length, selectionEnd: shortened.length })
    await page.waitForTimeout(50)
    console.log('[WAREHOUSE_IME_UPDATE_BACKSPACE_EQUIVALENT]', JSON.stringify({ shortened, state: await selection(input), events: await nativeEvents(page) }))

    await cdp.send('Input.insertText', { text: shortened })
    await page.waitForTimeout(100)
    console.log('[WAREHOUSE_IME_COMMIT]', JSON.stringify({ state: await selection(input), events: await nativeEvents(page) }))
    expect((await selection(input)).value, '조합 종료 후 창고 라벨이 확정되지 않음').toBe(label)
    expect((await nativeEvents(page)).some((event) => event.type === 'compositionstart'), '브라우저 compositionstart 미발생').toBeTruthy()

    await cdp.send('Input.imeSetComposition', { text: query, selectionStart: query.length, selectionEnd: query.length })
    await page.waitForTimeout(50)
    const beforeEscape = await selection(input)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    const inputAfterEscape = page.getByTestId('merge-convert-warehouse').locator('input')
    const inputCountAfterEscape = await inputAfterEscape.count()
    const dialogCountAfterCompositionEscape = await page.getByRole('dialog').count()
    const afterCompositionEscape = inputCountAfterEscape ? await selection(inputAfterEscape) : null
    console.log('[WAREHOUSE_IME_ESCAPE]', JSON.stringify({
      inputCountAfterEscape,
      dialogCountAfterCompositionEscape,
      state: afterCompositionEscape,
      url: page.url(),
      events: await nativeEvents(page),
    }))
    expect(inputCountAfterEscape, '조합 중 Escape 뒤 창고 input이 제거되지 않음').toBe(1)
    expect(dialogCountAfterCompositionEscape, '조합 중 Escape 뒤 병합 dialog가 제거되지 않음').toBeGreaterThan(0)
    expect(afterCompositionEscape, '조합 중 Escape 뒤 input 상태가 보존됨').toEqual(beforeEscape)

    await page.reload()
    const normalInput = await openMergeWarehouse(page)
    await normalInput.blur()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('품목 공통 AsyncAutocomplete — 기존 선택영역/동일 라벨 suffix/양방향 입력', async ({ page }) => {
    const login = await realLogin(page)
    await installAuthBridge(page, login)
    await page.goto(`${BASE_URL}/#/sales/estimates/new`)
    const input = page.getByRole('combobox', { name: '라인 1 모델명' })
    await expect(input).toBeEnabled({ timeout: 30_000 })

    const response = await page.request.get(`${API_BASE}/api/products?q=&size=20`, {
      headers: { Authorization: `Bearer ${login.token}` },
    })
    expect(response.ok(), `품목 조회 실패: HTTP ${response.status()}`).toBeTruthy()
    const content = (await response.json()).data?.content ?? []
    expect(content.length, '실 품목 후보 0건').toBeGreaterThan(0)

    let chosen: { modelName: string; query: string } | undefined
    for (const item of content as Array<{ modelName?: string }>) {
      const modelName = item.modelName ?? ''
      for (let length = 1; length <= Math.min(modelName.length, 12); length += 1) {
        const query = modelName.slice(0, length)
        const candidateResponse = await page.request.get(`${API_BASE}/api/products?q=${encodeURIComponent(query)}&size=20`, {
          headers: { Authorization: `Bearer ${login.token}` },
        })
        if (!candidateResponse.ok()) continue
        const candidates = (await candidateResponse.json()).data?.content ?? []
        if (candidates.length === 1 && query.length < candidates[0].modelName.length) {
          chosen = { modelName: candidates[0].modelName, query }
          break
        }
      }
      if (chosen) break
    }
    expect(chosen, '단일 후보 품목 검색어를 찾지 못함').toBeTruthy()
    const { modelName, query } = chosen!

    await input.click()
    await input.fill(query)
    await input.evaluate((node: HTMLInputElement) => node.setSelectionRange(0, Math.min(1, node.value.length)))
    const userSelectionBeforeResult = await selection(input)
    await expect(input).toHaveValue(modelName, { timeout: 15_000 })
    const selectionAfterResult = await selection(input)
    console.log('[PRODUCT_EXISTING_SELECTION]', JSON.stringify({ query, modelName, userSelectionBeforeResult, selectionAfterResult }))

    await input.click()
    await input.fill(modelName)
    await expect(input).toHaveValue(modelName, { timeout: 15_000 })
    const identicalLabelSelection = await selection(input)
    console.log('[PRODUCT_IDENTICAL_LABEL_SUFFIX]', JSON.stringify(identicalLabelSelection))

    await input.click()
    await input.fill(query)
    await expect(input).toHaveValue(modelName, { timeout: 15_000 })
    const suffixStart = (await selection(input)).start ?? 0
    const residual = modelName.slice(suffixStart, suffixStart + 1) || 'X'
    await input.type(residual)
    await expect(input).toHaveValue(modelName, { timeout: 15_000 })
    console.log('[PRODUCT_BIDIRECTIONAL]', JSON.stringify({ residual, state: await selection(input) }))
    await page.screenshot({ path: path.join(SHOTS, '03-product-async-selection.png'), fullPage: false })
  })
})
