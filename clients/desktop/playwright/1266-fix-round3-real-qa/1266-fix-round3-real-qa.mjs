import path from 'node:path'
import { chromium } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.cjs'

const shots = resolveQaShotsDir(path.resolve('docs/qa/1266-fix-round3/screenshots'))
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5126' })
const page = await context.newPage()
const apiEvidence = []
page.on('response', async (response) => {
  if (!response.url().includes('/slips/cleanup/history')) return
  let summary = ''
  try {
    const body = await response.json()
    const data = body?.data
    summary = Array.isArray(data?.content)
      ? `rows=${data.content.length}, totalElements=${data.totalElements}`
      : `detailTopic=${data?.topic ?? ''}, payloadEntries=${data?.responsePayload?.entries?.length ?? 'n/a'}`
  } catch { summary = 'body=unreadable' }
  apiEvidence.push(`${response.request().method()} ${new URL(response.url()).pathname}${new URL(response.url()).search} -> ${response.status()} ${summary}`)
})

await page.goto('/login')
await page.getByTestId('login-id-input').fill('dev_master')
await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
await page.getByTestId('login-submit-button').click()
await page.waitForURL(/\/$|\/sales\//, { timeout: 15_000 })
await page.goto('/sales/slip-cleanup')
await page.getByTestId('slip-cleanup-history-tab-list').click()
await page.getByTestId('slip-cleanup-history-query').click()
const rows = page.locator('[data-testid^="slip-cleanup-history-row-"][data-testid$="-created-at"]')
await rows.first().waitFor({ state: 'visible', timeout: 15_000 })
const listCount = await rows.count()
await page.screenshot({ path: path.join(shots, '01-slip-cleanup-history-list.png'), fullPage: true })
console.log(`A 목록 행 수=${listCount}`)
console.log(`A 화면 주제=${await rows.first().innerText()}`)

await rows.first().click()
await page.getByTestId('slip-cleanup-history-restored-banner').waitFor({ state: 'visible', timeout: 15_000 })
await page.getByTestId('slip-cleanup-history-tab-run').waitFor({ state: 'visible' })
const restoredText = await page.locator('body').innerText()
const restored = restoredText.includes('복원:') && restoredText.includes('QA-1266-R3')
await page.screenshot({ path: path.join(shots, '02-slip-cleanup-restored.png'), fullPage: true })
console.log(`B 복원 배너=${JSON.stringify(await page.getByTestId('slip-cleanup-history-restored-banner').innerText())}`)
console.log(`B 복원 payload 화면 식별자=QA-1266-R3 visible=${restored}`)
console.log('API 증거')
for (const line of apiEvidence) console.log(line)
if (listCount < 1 || !restored) throw new Error('전표정리 목록→상세 복원 UI 증거 부족')
await browser.close()
