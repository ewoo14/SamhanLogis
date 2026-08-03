import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const baseUrl = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:5943'
const loginId = process.env.AUDIT_LOGIN_ID ?? 'dev_master'
const onlyLabel = process.env.AUDIT_ONLY_LABEL ?? ''
const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const shots = path.join(repoRoot, 'docs/qa/874-riusage-global-dc-real-qa')
fs.mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
page.on('dialog', async dialog => {
  console.log(`[dialog:${dialog.type()}] ${dialog.message()}`)
  await dialog.accept()
})
page.on('pageerror', error => console.log(`[pageerror] ${error.message}`))
page.on('console', message => {
  if (message.type() === 'error') console.log(`[console:error] ${message.text()}`)
})
page.on('response', async response => {
  if (response.request().method() === 'POST' && /sales|slip/i.test(response.url())) {
    console.log(`[response] ${response.status()} ${response.request().method()} ${response.url()}`)
  }
})

async function login() {
  await page.goto(`${baseUrl}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('textbox', { name: '사용자 ID (필수)' }).fill(loginId)
  await page.getByRole('textbox', { name: '비밀번호 (필수)' }).fill('dev_p05_pass!')
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await page.waitForURL('**/#/', { timeout: 20_000 })
}

async function chooseAutocomplete(combo, query, exactText) {
  await combo.fill(query)
  await page.waitForTimeout(1000)
  const options = page.locator('[role="listbox"] [role="option"]')
  const count = await options.count()
  if (!count) throw new Error(`자동완성 결과 없음: ${query}`)
  // The list can extend below the viewport when a lower line is edited.
  // Select the top filtered result through the same keyboard interaction a GUI
  // user can perform, avoiding a synthetic DOM mutation or API call.
  await combo.press('ArrowDown')
  await combo.press('Enter')
  await page.waitForTimeout(250)
}

async function openSalesNew() {
  await page.getByRole('button', { name: '판매', exact: true }).click()
  await page.getByRole('button', { name: '새 판매전표', exact: true }).click()
  await page.waitForURL('**/#/sales/new', { timeout: 20_000 })
  const warehouse = page.getByRole('combobox').nth(0)
  await chooseAutocomplete(warehouse, 'HQ-001', 'HQ-001')
  const partner = page.getByRole('combobox').nth(2)
  await chooseAutocomplete(partner, 'P0-6-C002', 'P0-6-C002')
}

async function fillLine(line, query, modelCode, unitPrice) {
  const product = page.getByRole('combobox', { name: `라인 ${line} 품목` })
  await chooseAutocomplete(product, query, modelCode)
  await page.getByRole('textbox', { name: `라인 ${line} 단가` }).fill(String(unitPrice))
  await page.getByRole('textbox', { name: `라인 ${line} 단가` }).press('Tab')
}

async function createSlip(label, panelPrice) {
  await page.goto(`${baseUrl}/#/`, { waitUntil: 'domcontentloaded' })
  await openSalesNew()
  await page.getByRole('textbox', { name: '메모' }).fill(`QA-874-${label} · 패널→본체→패널 · 단가분리 throwaway`)
  await fillLine(1, 'PC1', 'PC1BWCK3NW', panelPrice)
  await fillLine(2, 'AC072', 'AC072CS1DBC1SY', 1160000)
  await fillLine(3, 'PC1', 'PC1BWCK3NW', panelPrice)
  await page.screenshot({ path: path.join(shots, `10-${label}-before-save.png`), fullPage: true })
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(shots, `11-${label}-after-save.png`), fullPage: true })
  console.log(`${label} URL`, page.url())
  console.log(`${label} BODY`, (await page.locator('body').innerText()).slice(-3500))
}

await login()
if (!onlyLabel || onlyLabel === 'A') await createSlip('A', 286165)
if (!onlyLabel || onlyLabel === 'B') await createSlip('B', 286166)
await browser.close()
