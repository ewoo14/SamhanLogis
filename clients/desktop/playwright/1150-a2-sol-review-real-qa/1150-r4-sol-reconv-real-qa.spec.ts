import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/2026-08-09-1150-r4-sol-reconv'))

interface LoginResult { token: string; role: string; userId: string; displayName: string }
interface Warehouse { id: string; code: string; name: string; type: string; active: boolean }

async function login(page: Page, password: string): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(response.ok(), `실서버 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()).data ?? {}
  return {
    token: body.token ?? '', role: body.role ?? '', userId: body.userId ?? '',
    displayName: body.displayName ?? 'dev_master',
  }
}

async function installAuth(page: Page, auth: LoginResult): Promise<void> {
  await page.addInitScript(({ token, role, userId, displayName }: LoginResult) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, role, userId, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
    const holder = window as typeof window & { __r4Events?: unknown[] }
    holder.__r4Events = []
    const record = (event: Event) => {
      const input = event.target as HTMLInputElement | null
      const keyboard = event as KeyboardEvent
      const inputEvent = event as InputEvent
      holder.__r4Events!.push({
        type: event.type,
        key: 'key' in keyboard ? keyboard.key : undefined,
        isComposing: 'isComposing' in keyboard ? keyboard.isComposing : undefined,
        inputType: 'inputType' in inputEvent ? inputEvent.inputType : undefined,
        data: 'data' in inputEvent ? inputEvent.data : undefined,
        target: input?.getAttribute?.('aria-label') ?? input?.getAttribute?.('data-testid') ?? input?.tagName,
        value: typeof input?.value === 'string' ? input.value : undefined,
        selectionStart: input?.selectionStart,
        selectionEnd: input?.selectionEnd,
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
      })
    }
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input', 'keydown']) {
      document.addEventListener(type, record, true)
    }
  }, auth)
}

async function warehouses(page: Page, token: string): Promise<Warehouse[]> {
  const response = await page.request.get(`${API_BASE}/inventory/warehouses`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok(), `실 창고 API 실패: HTTP ${response.status()}`).toBeTruthy()
  return ((await response.json()).data as Warehouse[]).filter((item) => item.type !== 'VIRTUAL')
}

function matching(items: Warehouse[], query: string): Warehouse[] {
  const lower = query.trim().toLocaleLowerCase()
  const code = items.filter((item) => item.code.toLocaleLowerCase().startsWith(lower))
  const ids = new Set(code.map((item) => item.id))
  return [...code, ...items.filter((item) => !ids.has(item.id) && item.name.toLocaleLowerCase().includes(lower))]
}

function uniqueHangul(items: Warehouse[]): { query: string; target: Warehouse } | undefined {
  for (const target of items) {
    const chars = [...target.name]
    for (let length = 1; length <= chars.length; length += 1) {
      for (let start = 0; start + length <= chars.length; start += 1) {
        const query = chars.slice(start, start + length).join('')
        if (/^[가-힣]+$/.test(query) && matching(items, query).length === 1) return { query, target }
      }
    }
  }
  return undefined
}

function ambiguousHangul(items: Warehouse[]): { query: string; count: number } | undefined {
  const candidates = new Set<string>()
  for (const item of items) for (const char of [...item.name]) if (/^[가-힣]$/.test(char)) candidates.add(char)
  for (const query of candidates) {
    const count = matching(items, query).length
    if (count > 1) return { query, count }
  }
  return undefined
}

async function open(page: Page): Promise<Locator> {
  await page.goto(`${BASE_URL}/#/sales/partner-orders`)
  await expect(page.getByTestId('merge-convert-open')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('merge-convert-open').click()
  const input = page.getByTestId('merge-convert-warehouse').locator('input')
  await expect(input).toBeEnabled({ timeout: 30_000 })
  return input
}

async function state(input: Locator) {
  return input.evaluate((node: HTMLInputElement) => ({
    value: node.value, start: node.selectionStart, end: node.selectionEnd,
    expanded: node.getAttribute('aria-expanded'), controls: node.getAttribute('aria-controls'),
  }))
}

async function events(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as typeof window & { __r4Events?: unknown[] }).__r4Events ?? [])
}

async function clearEvents(page: Page): Promise<void> {
  await page.evaluate(() => { (window as typeof window & { __r4Events?: unknown[] }).__r4Events = [] })
}

test('PR #1150 R4 SOL 재수렴 — 실 GUI·실 API·CDP IME', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : String(error))
    return
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const network: Array<{ url: string; status: number; body: string }> = []
  const servedModules: Array<{ url: string; hasComposingOrRef: boolean; hasStopPropagation: boolean; snippets: string[] }> = []
  page.on('response', async (response) => {
    const url = response.url()
    try {
      if (url.startsWith(API_BASE) && !url.includes('/auth/login')) {
        network.push({ url, status: response.status(), body: await response.text() })
      }
      if (url.startsWith(BASE_URL) && response.status() === 200 &&
          (response.headers()['content-type'] ?? '').includes('javascript')) {
        const body = await response.text()
        const composingMatches = [...body.matchAll(/nativeEvent\.isComposing \|\| [A-Za-z]+\.current/g)]
        const hasComposingOrRef = composingMatches.length > 0
        const hasStopPropagation = body.includes('stopPropagation')
        if (hasComposingOrRef) {
          servedModules.push({
            url, hasComposingOrRef, hasStopPropagation,
            snippets: composingMatches.map((match) => body.slice(Math.max(0, match.index! - 100), match.index! + 280)),
          })
        }
      }
    } catch { /* navigation 취소 응답은 판정 근거에서 제외 */ }
  })

  const auth = await login(page, password)
  await installAuth(page, auth)
  const items = await warehouses(page, auth.token)
  const unique = uniqueHangul(items)
  const ambiguous = ambiguousHangul(items)
  expect(items.length, '실 창고 표본 0 — 판정 불가').toBeGreaterThan(0)
  expect(unique, 'CDP IME 단일 후보 발화 조건 0 — 판정 불가').toBeTruthy()

  const result: Record<string, unknown> = {
    environment: { baseUrl: BASE_URL, apiBase: API_BASE, warehouseCount: items.length },
    triggers: {
      unique: unique ? { query: unique.query, code: unique.target.code, name: unique.target.name } : null,
      ambiguous,
    },
  }

  // 각도 1: 원 결함 — 조합 중 Escape 뒤 모달/input/value/selection 보존.
  let input = await open(page)
  await page.screenshot({ path: path.join(SHOTS, '00-angle1-modal-before-ime.png') })
  await input.click()
  await clearEvents(page)
  let cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.imeSetComposition', {
    text: unique!.query, selectionStart: unique!.query.length, selectionEnd: unique!.query.length,
  })
  await page.waitForTimeout(100)
  const angle1Before = await state(input)
  await page.screenshot({ path: path.join(SHOTS, '01-angle1-composing.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const angle1Input = page.getByTestId('merge-convert-warehouse').locator('input')
  const angle1 = {
    beforeEscape: angle1Before,
    afterEscape: await state(angle1Input),
    inputCount: await angle1Input.count(),
    dialogCount: await page.getByRole('dialog').count(),
    listboxCount: await page.getByRole('listbox', { name: '창고 목록' }).count(),
    events: await events(page),
  }
  result.angle1 = angle1
  console.log('[R4_ANGLE1]', JSON.stringify(angle1))
  await page.screenshot({ path: path.join(SHOTS, '02-angle1-after-composing-escape.png') })
  expect(angle1.inputCount).toBe(1)
  expect(angle1.dialogCount).toBe(1)
  expect(angle1.afterEscape).toEqual(angle1.beforeEscape)

  // 각도 2-A: 조합 중이 아닌 Escape는 모달을 닫아야 한다.
  await page.getByTestId('merge-convert-cancel').click()
  input = await open(page)
  await input.blur()
  await clearEvents(page)
  await page.screenshot({ path: path.join(SHOTS, '03-angle2-normal-before-escape.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const angle2Normal = { dialogCount: await page.getByRole('dialog').count(), events: await events(page) }
  result.angle2Normal = angle2Normal
  console.log('[R4_ANGLE2_NORMAL]', JSON.stringify(angle2Normal))
  await page.screenshot({ path: path.join(SHOTS, '04-angle2-normal-after-escape.png') })
  expect(angle2Normal.dialogCount).toBe(0)

  // 각도 2-B: compositionend 직후 첫 Escape도 모달을 닫아야 한다.
  input = await open(page)
  await input.click()
  await clearEvents(page)
  cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.imeSetComposition', {
    text: unique!.query, selectionStart: unique!.query.length, selectionEnd: unique!.query.length,
  })
  await cdp.send('Input.insertText', { text: unique!.query })
  await page.waitForTimeout(100)
  const angle2EndedBefore = await state(input)
  await page.screenshot({ path: path.join(SHOTS, '05-angle2-compositionend-before-first-escape.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const angle2Ended = { beforeEscape: angle2EndedBefore, dialogCount: await page.getByRole('dialog').count(), events: await events(page) }
  result.angle2AfterCompositionEnd = angle2Ended
  console.log('[R4_ANGLE2_AFTER_COMPOSITIONEND]', JSON.stringify(angle2Ended))
  await page.screenshot({ path: path.join(SHOTS, '06-angle2-after-compositionend-first-escape.png') })
  expect(angle2Ended.dialogCount).toBe(0)

  // 각도 3: listbox가 열린 조합 중 Escape와 그 직후 Escape의 소비 순서.
  input = await open(page)
  await input.click()
  await clearEvents(page)
  cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.imeSetComposition', {
    text: unique!.query, selectionStart: unique!.query.length, selectionEnd: unique!.query.length,
  })
  await page.waitForTimeout(100)
  const listboxBefore = await page.getByRole('listbox', { name: '창고 목록' }).count()
  await page.screenshot({ path: path.join(SHOTS, '07-angle3-listbox-composing.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const listboxAfterCompositionEscape = await page.getByRole('listbox', { name: '창고 목록' }).count()
  const dialogAfterCompositionEscape = await page.getByRole('dialog').count()
  await page.screenshot({ path: path.join(SHOTS, '08-angle3-after-composing-escape.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const angle3 = {
    listboxBefore,
    listboxAfterCompositionEscape,
    dialogAfterCompositionEscape,
    listboxAfterNextEscape: await page.getByRole('listbox', { name: '창고 목록' }).count(),
    dialogAfterNextEscape: await page.getByRole('dialog').count(),
    events: await events(page),
  }
  result.angle3 = angle3
  console.log('[R4_ANGLE3]', JSON.stringify(angle3))
  await page.screenshot({ path: path.join(SHOTS, '09-angle3-after-next-escape.png') })
  expect(angle3.listboxBefore).toBe(1)
  expect(angle3.dialogAfterCompositionEscape).toBe(1)
  expect(angle3.dialogAfterNextEscape).toBe(1)

  // 각도 4: 실제 복수 후보 선택 모달이 뜨는 중첩 dialog 경로.
  await page.getByTestId('merge-convert-cancel').click()
  input = await open(page)
  if (ambiguous) {
    await input.click()
    await clearEvents(page)
    cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.imeSetComposition', {
      text: ambiguous.query, selectionStart: ambiguous.query.length, selectionEnd: ambiguous.query.length,
    })
    await page.waitForTimeout(150)
    const beforeDialogs = await page.getByRole('dialog').count()
    await page.screenshot({ path: path.join(SHOTS, '10-angle4-nested-modal-composition.png') })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    const angle4 = {
      ambiguous,
      beforeDialogs,
      afterDialogs: await page.getByRole('dialog').count(),
      titlesAfter: await page.getByRole('dialog').allTextContents(),
      events: await events(page),
    }
    result.angle4 = angle4
    console.log('[R4_ANGLE4]', JSON.stringify(angle4))
    await page.screenshot({ path: path.join(SHOTS, '11-angle4-after-escape.png') })
    expect(angle4.beforeDialogs).toBe(2)
    expect(angle4.afterDialogs).toBe(1)
  } else {
    result.angle4 = { trigger: 'none' }
  }

  result.network = network
  result.servedModules = servedModules
  result.resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name))
  console.log('[R4_ENVIRONMENT]', JSON.stringify(result.environment))
  console.log('[R4_TRIGGERS]', JSON.stringify(result.triggers))
  console.log('[R4_SERVED_MODULES]', JSON.stringify(servedModules))
  console.log('[R4_RESOURCES]', JSON.stringify(result.resources))
  fs.writeFileSync(path.join(SHOTS, 'live-qa-result.json'), JSON.stringify(result, null, 2), 'utf8')
})
