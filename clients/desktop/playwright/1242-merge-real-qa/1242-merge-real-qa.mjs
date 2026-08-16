import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '../../../..')
const mainCheckout = path.resolve(repoRoot, '../../..')
const require = createRequire(import.meta.url)
const { chromium } = require(path.join(mainCheckout, 'clients/desktop/node_modules/playwright'))

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:25142'
const bizNo = process.env.QA_BIZ_NO
const password = resolveQaCredential('QA_PARTNER_ORDER_PASSWORD')
const chromiumPath = process.env.QA_CHROMIUM_PATH
const shots = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/pr-1242-sol-merge-real-qa/screenshots'))

if (!bizNo || !password) throw new Error('QA 자격 환경변수 누락')

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (/token|password|authorization/i.test(key)) {
        return [key, child ? '[REDACTED_PRESENT]' : child]
      }
      return [key, sanitize(child)]
    }))
  }
  return value
}

async function responseBody(response) {
  try {
    return sanitize(await response.json())
  } catch {
    return null
  }
}

const browser = await chromium.launch({
  headless: true,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
})

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
})
const page = await context.newPage()
const api = []
const pageErrors = []
const consoleErrors = []

page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text())
})
page.on('response', async response => {
  if (!response.url().includes('/api/')) return
  if (!/partner-status|partner-login|bootstrap|price-preview|drafts|confirm/.test(response.url())) return
  const apiPath = new URL(response.url()).pathname
  const rawBody = await responseBody(response)
  const body = apiPath.includes('/bootstrap') && rawBody?.data?.payloads
    ? {
        success: rawBody.success,
        payloadCounts: Object.fromEntries(Object.entries(rawBody.data.payloads)
          .map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])),
      }
    : rawBody
  api.push({
    status: response.status(),
    method: response.request().method(),
    path: apiPath,
    body,
  })
})

try {
  // 주문서웹은 정적 legacy 앱이지만 라이브QA 공통 HashRouter 진입 규약을 그대로 사용한다.
  await page.goto(`${baseUrl}/#/orders`, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.locator('#bizGateInput').fill(bizNo)
  await page.locator('#btnBizQuery').click()
  try {
    await page.locator('#authPw1').waitFor({ state: 'visible', timeout: 10_000 })
  } catch (error) {
    console.log('AUTH_DIAGNOSTIC=' + JSON.stringify({
      api,
      pageErrors,
      consoleErrors,
      visibleText: (await page.locator('body').innerText()).slice(0, 3_000),
      visibleButtons: await page.locator('button').evaluateAll(nodes => nodes
        .filter(node => node.offsetParent !== null)
        .map(node => ({ id: node.id, text: node.innerText, disabled: node.disabled }))),
    }, null, 2))
    throw error
  }
  await page.locator('#authPw1').fill(password)
  await page.locator('#btnAuthAction').click()
  await page.locator('#btnEnterHome').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(5_000)

  const tutorialNo = page.getByRole('button', { name: '아니오', exact: true })
  if (await tutorialNo.isVisible().catch(() => false)) {
    await tutorialNo.click()
  } else {
    const tutorialSkip = page.getByRole('button', { name: '튜토리얼 스킵', exact: true })
    if (await tutorialSkip.isVisible().catch(() => false)) await tutorialSkip.click()
  }
  await page.waitForTimeout(1_000)

  await page.locator('#btnEnterHome').click()
  await page.locator('#homeFilterText').waitFor({ state: 'visible', timeout: 15_000 })
  const catalogRows = await page.locator('#homeBody tr').count()
  await page.screenshot({ path: path.join(shots, '01-login-home-real-qa.png'), fullPage: false })

  const model = 'AR-CH01'
  const row = page.locator('#homeBody tr').filter({ hasText: model }).first()
  await row.waitFor({ state: 'visible', timeout: 15_000 })
  await row.scrollIntoViewIfNeeded()
  const qty = row.locator('input').first()
  await qty.fill('1')
  await qty.dispatchEvent('change')
  await page.waitForTimeout(500)

  await page.locator('#btnPreview').click()
  await page.locator('#dlgPreview').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('#btnProceed').waitFor({ state: 'visible', timeout: 10_000 })
  if (await page.locator('#btnProceed').isDisabled()) throw new Error('가격 미리보기 후 진행 버튼 비활성')
  const previewRows = await page.locator('#previewBody tr').count()
  const previewText = await page.locator('#dlgPreview').innerText()
  await page.locator('#dlgPreview .modal').screenshot({ path: path.join(shots, '02-price-preview-real-qa.png') })

  await page.locator('#btnProceed').click()
  await page.locator('#pageOrderInfo').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('#addrBase').evaluate(element => {
    element.value = '서울특별시 중구 세종대로 110'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const marker = `SOL #1242 격리QA ${Date.now()}`
  await page.locator('#addrDetail').fill(marker)
  await page.locator('#sameAddr').check()
  await page.locator('#tel').fill('01012345678')
  const now = new Date()
  const due = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
  const payDue = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10)
  await page.locator('#due').fill(due)
  await page.locator('#payDue').fill(payDue)
  await page.locator('#memo').fill(marker)
  await page.locator('#memo').dispatchEvent('input')
  await page.locator('#btnSendOrder').waitFor({ state: 'visible', timeout: 10_000 })
  if (await page.locator('#btnSendOrder').isDisabled()) throw new Error('전송목록 확인 버튼 비활성')
  await page.locator('#btnSendOrder').click()

  await page.locator('#dlgFinal').waitFor({ state: 'visible', timeout: 10_000 })
  const finalRows = await page.locator('#finalBody tr').count()
  await page.locator('#dlgFinal .modal').screenshot({ path: path.join(shots, '03-final-confirm-real-qa.png') })
  await page.locator('#btnFinalSend').click()
  await page.locator('#dlgProgress').waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForFunction(
    () => /완료|실패|에러/.test(document.querySelector('#progressText')?.innerText ?? ''),
    null,
    { timeout: 30_000 },
  )
  const progressText = await page.locator('#progressText').innerText()
  await page.locator('#dlgProgress .modal').screenshot({ path: path.join(shots, '04-order-result-real-qa.png') })

  const previewApi = [...api].reverse().find(entry => entry.path.includes('price-preview'))
  const confirmApi = [...api].reverse().find(entry => entry.path.includes('/confirm'))
  const previewResponseRows = previewApi?.body?.data?.lines?.length ?? 0
  if (previewRows !== previewResponseRows) {
    throw new Error(`미리보기 행 수 불일치: 화면=${previewRows}, 응답=${previewResponseRows}`)
  }
  if (previewApi?.status !== 200) throw new Error(`가격 미리보기 HTTP ${previewApi?.status ?? 'missing'}`)
  if (confirmApi?.status !== 200) throw new Error(`주문 확정 HTTP ${confirmApi?.status ?? 'missing'}`)

  console.log('LIVE_QA_RESULT=' + JSON.stringify({
    url: page.url(),
    loginScreenAssertion: '#homeFilterText visible',
    catalogRows,
    model,
    previewRows,
    previewResponseRows,
    finalRows,
    previewText,
    progressText,
    pricePreviewHttp: previewApi.status,
    confirmHttp: confirmApi.status,
    api,
    pageErrors,
    consoleErrors,
    visibleUuidCount: ((await page.locator('body').innerText()).match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig) ?? []).length,
    shots,
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
