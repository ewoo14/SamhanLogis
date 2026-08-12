import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const repo = process.cwd()
const requireFromDesktop = createRequire(path.join(repo, 'clients/desktop/package.json'))
const { chromium, request } = requireFromDesktop('@playwright/test')
const { resolveQaCredential } = requireFromDesktop(path.join(repo, 'scripts/lib/qa-credentials.cjs'))

const WEB = 'http://127.0.0.1:52794'
const API = 'http://127.0.0.1:39780'
const shots = path.join(repo, 'docs/qa/2026-08-12-1094-reconv')
fs.mkdirSync(shots, { recursive: true })

const result = { passed: [], failed: [], skipped: [], observations: {} }
const pass = (name, detail = '') => { result.passed.push({ name, detail }); console.log(`PASS | ${name} | ${detail}`) }
const fail = (name, detail = '') => { result.failed.push({ name, detail }); console.log(`FAIL | ${name} | ${detail}`) }
const skip = (name, detail = '') => { result.skipped.push({ name, detail }); console.log(`SKIP | ${name} | ${detail}`) }
const check = (ok, name, detail = '') => ok ? pass(name, detail) : fail(name, detail)
const shot = async (page, name) => page.screenshot({ path: path.join(shots, name), fullPage: true })

const api = await request.newContext({ baseURL: API })
const login = await api.post('/auth/login', {
  data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
})
if (!login.ok()) throw new Error(`격리 auth 로그인 실패 HTTP ${login.status()}: ${await login.text()}`)
const loginBody = await login.json()
const auth = loginBody.data ?? loginBody
console.log(`LOGIN_HTTP=${login.status()} ROLE=${auth.role}`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript((a) => {
  Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
    getToken: async () => ({ token: a.token, userId: a.userId, role: a.role, fullName: a.displayName, partnerCode: a.partnerCode ?? null, groups: a.groups ?? [] }),
    setToken: async () => undefined,
    clearToken: async () => undefined,
  } })
}, auth)

const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

// 1) reference 경로: 목록 번호 링크 -> DS 상세 -> 목록 -> 원래 URL/scroll.
const draftRes = await api.get('/accounting/cash-receipts?status=DRAFT&page=0&size=50', {
  headers: { Authorization: `Bearer ${auth.token}` },
})
if (!draftRes.ok()) throw new Error(`DRAFT 조회 실패 HTTP ${draftRes.status()}: ${await draftRes.text()}`)
const draftEnvelope = await draftRes.json()
const draftPage = draftEnvelope.data ?? draftEnvelope
const draft = (draftPage.content ?? []).find((r) => r.kind !== 'BANK_LINKED')
if (!draft) throw new Error('편집 가능한 DRAFT 입금보고서가 격리 clone에 없음')
console.log(`DRAFT_BUSINESS_ID=${draft.slipNo}`)

const listHash = `#/accounting/admin/cash-receipts?slipNo=${encodeURIComponent(draft.slipNo)}`
await page.goto(`${WEB}/${listHash}`, { waitUntil: 'domcontentloaded' })
await page.getByTestId(`cash-receipt-slip-${draft.slipNo}`).waitFor({ state: 'visible', timeout: 20000 })
await page.evaluate(() => document.querySelector('.app-main')?.insertAdjacentHTML('beforeend', '<div data-testid="qa-scroll-spacer" style="height:1800px"></div>'))
await page.evaluate(() => window.scrollTo(0, 640))
const beforeScroll = await page.evaluate(() => window.scrollY)
const cashLink = page.getByTestId(`cash-receipt-slip-${draft.slipNo}`)
const linkTag = await cashLink.evaluate((el) => el.tagName)
const linkText = (await cashLink.textContent())?.trim() ?? ''
const linkHref = await cashLink.getAttribute('href')
check(linkTag === 'A' && linkText === draft.slipNo, '입금보고서 번호 하이퍼링크', `tag=${linkTag} text=${linkText}`)
check(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(linkText), '번호 링크 UUID 비노출', `visible=${linkText}`)
await shot(page, '01-cash-list-document-link.png')
await cashLink.evaluate((el) => el.click())
await page.getByRole('button', { name: '목록', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
const cashDetailUrl = page.url()
const cashCardCount = await page.locator('.detail-grid').count()
check(cashCardCount > 0, '입금보고서 DS 상세 셸과 뒤로가기 공존', `detail-grid=${cashCardCount} url=${cashDetailUrl}`)
await shot(page, '02-cash-detail-ds-shell-back.png')
await page.getByRole('button', { name: '목록', exact: true }).click()
await page.waitForURL((u) => u.hash.includes('/accounting/admin/cash-receipts?'))
const returnedUrl = page.url()
await page.waitForTimeout(300)
const returnedScroll = await page.evaluate(() => window.scrollY)
check(returnedUrl.includes(`slipNo=${encodeURIComponent(draft.slipNo)}`) && Math.abs(returnedScroll - beforeScroll) <= 2,
  '입금보고서 원래 URL/scroll 복귀', `before=${beforeScroll} after=${returnedScroll} url=${returnedUrl}`)

// 2) mutation 후 identity: 목록 -> 상세 -> 편집 -> 저장은 원래 목록 entry로 -2.
await page.evaluate(() => window.scrollTo(0, 640))
const mutationBefore = await page.evaluate(() => window.scrollY)
await page.getByTestId(`cash-receipt-slip-${draft.slipNo}`).evaluate((el) => el.click())
await page.getByRole('button', { name: '편집', exact: true }).click()
const memo = page.getByLabel('적요', { exact: true })
await memo.waitFor({ state: 'visible', timeout: 20000 })
const stamp = `1094-reconv-${Date.now()}`
await memo.fill(stamp)
const save = page.getByRole('button', { name: '저장', exact: true })
await save.waitFor({ state: 'visible' })
await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '저장')?.hasAttribute('disabled'), null, { timeout: 20000 }).catch(() => {})
await save.click()
await page.waitForURL((u) => u.hash.includes('/accounting/admin/cash-receipts?'), { timeout: 30000 })
await page.waitForTimeout(300)
const mutationUrl = page.url()
const mutationAfter = await page.evaluate(() => window.scrollY)
check(mutationUrl.includes(`slipNo=${encodeURIComponent(draft.slipNo)}`) && Math.abs(mutationAfter - mutationBefore) <= 2,
  'mutation 후 원래 entry identity 유지', `before=${mutationBefore} after=${mutationAfter} url=${mutationUrl}`)
await shot(page, '03-cash-after-edit-return-identity.png')

// 3) 직접 URL: state/history contract 없이 상세 진입해도 상세와 canonical 목록 fallback이 동작.
const direct = await context.newPage()
await direct.goto(`${WEB}/#/accounting/admin/cash-receipts/${draft.id}`, { waitUntil: 'domcontentloaded' })
await direct.getByRole('button', { name: '목록', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
await shot(direct, '04-cash-direct-url-detail.png')
await direct.getByRole('button', { name: '목록', exact: true }).click()
await direct.waitForURL((u) => u.hash === '#/accounting/admin/cash-receipts' || u.hash === '#/accounting/admin/cash-receipts?')
check(direct.url().includes('#/accounting/admin/cash-receipts'), '직접 URL canonical fallback', `url=${direct.url()}`)
await shot(direct, '05-cash-direct-url-canonical-list.png')
await direct.close()

// 4) #1175 DS 견적 표면: 번호가 링크인지, 상세에 뒤로가기 surface가 남았는지.
await page.goto(`${WEB}/#/sales/estimates`, { waitUntil: 'domcontentloaded' })
await page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 25000 })
const estimateRow = page.locator('tbody tr').first()
const estimateNumberCell = estimateRow.locator('td').first()
const estimateNumber = (await estimateNumberCell.textContent())?.trim() ?? ''
const estimateAnchorCount = await estimateNumberCell.locator('a').count()
check(estimateAnchorCount > 0, '견적번호 하이퍼링크', `estimateNo=${estimateNumber} anchorCount=${estimateAnchorCount}`)
await shot(page, '06-estimate-list-number-surface.png')
await estimateRow.click()
await page.locator('[data-testid="estimate-detail-no"]').waitFor({ state: 'visible', timeout: 25000 })
const estimateGrid = await page.locator('.detail-grid').count()
const estimateBack = await page.getByRole('button', { name: /목록|뒤로/ }).count()
check(estimateGrid > 0, '견적 DS Card/detail-grid 렌더', `detail-grid=${estimateGrid}`)
check(estimateBack > 0, '견적 상세 뒤로가기 버튼', `backButtonCount=${estimateBack}`)
await shot(page, '07-estimate-detail-ds-shell-missing-back.png')

// 5) #1175 DS 주문 표면: 번호 링크 및 원래 검색 자리 복귀.
await page.goto(`${WEB}/#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
const orderSearch = page.getByTestId('partner-order-list-keyword-filter')
await orderSearch.waitFor({ state: 'visible', timeout: 25000 })
const firstOrderText = (await page.locator('tbody tr').first().textContent())?.trim() ?? ''
const firstOrderToken = firstOrderText.split(/\s+/)[0] ?? ''
if (firstOrderToken) await orderSearch.fill(firstOrderToken)
await page.waitForTimeout(500)
const orderRow = page.locator('tbody tr').first()
await orderRow.waitFor({ state: 'visible', timeout: 25000 })
const orderFirstCell = orderRow.locator('td').first()
const orderAnchorCount = await orderFirstCell.locator('a').count()
check(orderAnchorCount > 0, '주문번호 하이퍼링크', `anchorCount=${orderAnchorCount} firstCell=${(await orderFirstCell.textContent())?.trim()}`)
await shot(page, '08-order-list-number-and-filter.png')
await orderRow.click()
await page.locator('.detail-grid').first().waitFor({ state: 'visible', timeout: 25000 })
const orderBack = page.getByRole('button', { name: /목록/ }).first()
check(await orderBack.count() > 0, '주문 상세 뒤로가기 버튼 존재', `count=${await page.getByRole('button', { name: /목록/ }).count()}`)
await shot(page, '09-order-detail-ds-shell-back.png')
if (await orderBack.count()) {
  await orderBack.click()
  await page.waitForURL((u) => u.hash.startsWith('#/sales/partner-orders'))
  await page.waitForTimeout(300)
  const restoredKeyword = await page.getByTestId('partner-order-list-keyword-filter').inputValue()
  check(restoredKeyword === firstOrderToken, '주문 상세 원래 검색 자리 복귀', `before=${firstOrderToken} after=${restoredKeyword}`)
  await shot(page, '10-order-return-position.png')
}

result.observations = { pageErrors, linkHref, cashDetailUrl }
fs.writeFileSync(path.join(shots, 'live-qa-result.json'), JSON.stringify(result, null, 2), 'utf8')
console.log(`SUMMARY passed=${result.passed.length} skipped=${result.skipped.length} failed=${result.failed.length}`)
console.log(`PAGE_ERRORS=${JSON.stringify(pageErrors)}`)

await context.close()
await browser.close()
await api.dispose()
if (result.failed.length > 0) process.exitCode = 2
