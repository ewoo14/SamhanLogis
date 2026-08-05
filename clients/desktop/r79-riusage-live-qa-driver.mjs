import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const renderer = process.env.R79_RENDERER ?? 'http://localhost:5301'
const gateway = process.env.R79_GATEWAY ?? 'http://localhost:8080'
const qaDir = path.resolve(process.cwd(), '../../docs/qa/874-r79-real-qa')
const shotDir = path.join(qaDir, 'screenshots')
fs.mkdirSync(shotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const login = await context.request.post(`${gateway}/api/auth/login`, {
  data: { loginId: 'dev_manager', password: 'dev_p05_pass!' },
})
const loginText = await login.text()
fs.writeFileSync(path.join(qaDir, 'login-response.txt'), `${login.status()} ${loginText}`, 'utf8')
if (!login.ok()) throw new Error(`login failed ${login.status()}`)
const account = JSON.parse(loginText).data
if (!account?.token) throw new Error('missing login token')

await context.addInitScript(({ token, userId, displayName }) => {
  Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
    getToken: async () => ({ token, userId, role: 'MANAGER', fullName: displayName, partnerCode: null }),
    setToken: async () => undefined,
    clearToken: async () => undefined,
  } })
}, { token: account.token, userId: account.userId, displayName: account.displayName ?? '개발매니저' })

const page = await context.newPage()
const errors = []
const network = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
page.on('requestfailed', r => errors.push(`requestfailed: ${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? 'unknown'}`))
page.on('request', async request => {
  if (request.url().startsWith(gateway)) network.push({ type: 'request', method: request.method(), url: request.url(), body: request.postData() ?? null })
})
page.on('response', async response => {
  if (!response.url().startsWith(gateway)) return
  const request = response.request()
  let body = '[unreadable]'
  try { body = await response.text() } catch {}
  network.push({ type: 'response', status: response.status(), method: request.method(), url: response.url(), body })
})

async function capture(name) {
  const text = await page.locator('body').innerText()
  fs.writeFileSync(path.join(qaDir, `${name}.txt`), text, 'utf8')
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true })
  console.log(`CAPTURE ${name} ${page.url()}`)
  return text
}

async function openNew(name) {
  await page.goto(`${renderer}/#/sales/new`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  await capture(name)
}

async function warehouse() {
  const input = page.getByPlaceholder('창고 코드 또는 이름 입력…')
  await input.fill('2')
  await page.waitForTimeout(700)
  const option = page.getByRole('option').filter({ hasText: '상일창고' }).first()
  if (await option.count()) await option.click()
  else { await input.press('ArrowDown'); await input.press('Enter') }
  await page.waitForTimeout(500)
}

async function partner(keyword, expected) {
  const input = page.getByPlaceholder('거래처명 또는 코드 입력…')
  await input.fill(keyword)
  await page.waitForTimeout(850)
  const option = page.getByRole('option').filter({ hasText: expected }).first()
  if (!(await option.count())) throw new Error(`partner option missing: ${expected}`)
  await option.click()
  await page.waitForTimeout(700)
}

async function product(line, model, captureName) {
  const input = page.locator(`input[aria-label="라인 ${line} 품목"]`)
  await input.fill(model)
  await page.waitForTimeout(850)
  const option = page.getByRole('option').filter({ hasText: model }).first()
  if (await option.count()) await option.click()
  else { await input.press('ArrowDown'); await input.press('Enter') }
  await page.waitForTimeout(900)
  if (captureName) await capture(captureName)
}

async function quantity(line) {
  const input = page.locator(`input[aria-label="라인 ${line} 수량"]`)
  await input.fill('1')
  await input.press('Tab')
}

async function save(name) {
  const button = page.getByRole('button', { name: '저장', exact: true })
  const started = Date.now()
  for (let i = 0; i < 50 && await button.isDisabled(); i++) await page.waitForTimeout(100)
  const enabledMs = Date.now() - started
  const enabled = !(await button.isDisabled())
  fs.writeFileSync(path.join(qaDir, `${name}-save-readiness.txt`), JSON.stringify({ enabled, enabledMs }, null, 2), 'utf8')
  if (!enabled) {
    fs.writeFileSync(path.join(qaDir, `${name}-save-response.txt`), 'NO_POST_RESPONSE\n저장 버튼 비활성', 'utf8')
    await capture(name)
    return { status: null, raw: 'NO_POST_RESPONSE', enabledMs }
  }
  const responsePromise = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/slips'), { timeout: 20000 }).catch(() => null)
  await button.click()
  const response = await responsePromise
  await page.waitForTimeout(1500)
  const raw = response ? `${response.status()} ${response.url()}\n${await response.text()}` : 'NO_POST_RESPONSE'
  fs.writeFileSync(path.join(qaDir, `${name}-save-response.txt`), raw, 'utf8')
  let requery = null
  if (response) {
    try {
      const created = JSON.parse(raw.slice(raw.indexOf('\n') + 1))?.data?.id
      if (created) {
        requery = await page.evaluate(async ({ gateway, created }) => {
          const auth = await window.samhanAuth.getToken()
          const res = await fetch(`${gateway}/slips/${created}`, { headers: { authorization: `Bearer ${auth.token}` } })
          return { status: res.status, url: res.url, body: await res.text() }
        }, { gateway, created })
        fs.writeFileSync(path.join(qaDir, `${name}-requery-response.txt`), `${requery.status} ${requery.url}\n${requery.body}`, 'utf8')
      }
    } catch (error) {
      fs.writeFileSync(path.join(qaDir, `${name}-requery-response.txt`), `REQUERY_ERROR ${String(error)}`, 'utf8')
    }
  }
  await capture(name)
  return { status: response?.status() ?? null, raw, requery, enabledMs }
}

async function lineSnapshot() {
  return await page.locator('[data-testid^="slip-line"], [role="row"]').allTextContents().catch(() => [])
}

const results = { errors, scenarios: {} }

// 정상 경로: 전역DC 거래처에서 네 품목을 한 전표에 섞는다.
await openNew('01-initial')
await warehouse()
await partner('4348703365', '주식회사 엠엠시스템에어')
await product(1, 'AX17B17NNDB-86', '02-line-1-ax17b17nndb-86')
await quantity(1)
await product(2, 'AR09TXEAAWKNEU-04', '03-line-2-ar09txeaawkneu-04')
await quantity(2)
await product(3, 'AJ060MXHNBC1', '04-line-3-aj060mxhnbc1')
await quantity(3)
await product(4, 'AJ020FERPBC2', '05-line-4-aj020ferpbc2')
await quantity(4)
await page.waitForTimeout(700)
await capture('06-mixed-lines-before-save')
results.scenarios.mixedBeforeLines = await lineSnapshot()
results.scenarios.mixedSave = await save('07-mixed-lines-after-save')

// F2: 첫 거래처 DC 응답 하나만 4초 지연시키고, 늦은 응답 도착 전에 거래처를 변경한다.
await openNew('08-f2-initial')
let delayedDc = { matched: 0, releasedAt: null }
await page.route('**/api/v1/partner-dc-configs/4348703365', async route => {
  delayedDc.matched += 1
  await new Promise(resolve => setTimeout(resolve, 4000))
  delayedDc.releasedAt = Date.now()
  await route.continue()
})
await warehouse()
const f2Started = Date.now()
await partner('4348703365', '주식회사 엠엠시스템에어')
await partner('000011111111', '한울냉열시스템')
await product(1, 'AJ060MXHNBC1', '09-f2-after-partner-switch')
await quantity(1)
await capture('10-f2-before-save')
results.scenarios.f2BeforeSave = await lineSnapshot()
results.scenarios.f2Save = await save('11-f2-after-save')
results.scenarios.f2 = { elapsedMs: Date.now() - f2Started, delayedDc, saveReadiness: fs.readFileSync(path.join(qaDir, '11-f2-after-save-save-readiness.txt'), 'utf8') }
await page.unroute('**/api/v1/partner-dc-configs/4348703365')

fs.writeFileSync(path.join(qaDir, 'network-responses.json'), JSON.stringify(network, null, 2), 'utf8')
fs.writeFileSync(path.join(qaDir, 'driver-summary.json'), JSON.stringify({ renderer, gateway, results, networkCount: network.length }, null, 2), 'utf8')
console.log(`SUMMARY ${JSON.stringify(results)}`)
await browser.close()
