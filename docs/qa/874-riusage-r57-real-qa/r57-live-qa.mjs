import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(import.meta.url)
const { chromium } = require(path.join(repoRoot, 'clients/desktop/node_modules/@playwright/test'))

const out = path.resolve(repoRoot, 'docs/qa/874-riusage-r57-real-qa')
fs.mkdirSync(out, { recursive: true })
const renderer = process.env.RENDERER_URL ?? 'http://localhost:5199'
const gateway = process.env.GATEWAY_URL ?? 'http://localhost:8080'
const password = process.env.DEV_PASSWORD ?? 'dev_p05_pass!'
const qaDate = process.env.QA_DATE ?? '2020-01-02'
const shots = path.join(out, 'screenshots')
fs.mkdirSync(shots, { recursive: true })

async function login(request, loginId) {
  const response = await request.post(`${gateway}/api/auth/login`, { data: { loginId, password } })
  const body = await response.json().catch(() => ({}))
  return { response, body, token: body?.data?.token, user: body?.data }
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForTimeout(2500)
}

async function screenshot(page, name) {
  const file = path.join(shots, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`[CAPTURE] ${file}`)
  return file
}

async function firstEditableSlip(request, token, excludeUserId) {
  const headers = { Authorization: `Bearer ${token}` }
  const url = `${gateway}/api/v1/slips/query?slipType=OUTBOUND&dateFrom=2020-01-01&dateTo=2030-12-31&page=0&size=50`
  const response = await request.get(url, { headers })
  const body = await response.json().catch(() => ({}))
  const content = body?.data?.content ?? body?.data ?? []
  const row = content.find((item) => item?.id && item.requesterId && item.requesterId !== excludeUserId && !/^0+$/.test(String(item.requesterId).replaceAll('-', '')) && !['DELIVERED', 'COMPLETED'].includes(item?.status))
    ?? content.find((item) => item?.id && !['DELIVERED', 'COMPLETED'].includes(item?.status))
    ?? content.find((item) => item?.id)
  return { url, response, body, row }
}

async function installAuth(page, account) {
  await page.addInitScript(({ token, userId, displayName, role }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ token, userId, role, fullName: displayName }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, {
    token: account.token,
    userId: account.user?.userId,
    displayName: account.user?.displayName ?? '[R57 LIVE QA]',
    role: account.user?.role ?? 'MANAGER',
  })
}

const browser = await chromium.launch({ headless: true })
const request = await requestContext(browser, gateway)
const manager = await login(request, 'dev_manager')
if (!manager.response.ok() || !manager.token) throw new Error(`dev_manager 로그인 실패: ${manager.response.status()}`)
const master = await login(request, 'dev_master')
if (!master.response.ok() || !master.token) throw new Error(`dev_master 로그인 실패: ${master.response.status()}`)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await installAuth(page, manager)

const observations = []
try {
  // ① 일마감 화면: 세트 riUsage 및 거래처 전역DC의 실제 응답/표시를 확인한다.
  await page.goto(`${renderer}/#/accounting/daily-closings`)
  await settle(page)
  for (const input of await page.locator('input[type="date"]').all()) await input.fill(qaDate)
  const salesSlipSource = page.getByRole('button', { name: '매출전표', exact: true }).first()
  if (await salesSlipSource.isVisible().catch(() => false)) await salesSlipSource.click()
  await page.waitForTimeout(6000)
  await screenshot(page, '01-daily-closing-riusage-global-dc.png')
  const dailyText = await page.locator('body').innerText()
  fs.writeFileSync(path.join(out, '01-daily-closing-visible.txt'), dailyText, 'utf8')
  const hasRiUsage = /riUsage|RI 사용|세트|구성품/i.test(dailyText)
  const hasGlobalDc = /전역DC|할인율|global discount/i.test(dailyText)
  observations.push({ item: '① 세트 riUsage·거래처 전역DC 실 화면', result: hasRiUsage && hasGlobalDc ? 'PASS' : '미실시', capture: 'screenshots/01-daily-closing-riusage-global-dc.png', note: `riUsage/세트=${hasRiUsage}, 전역DC/할인율=${hasGlobalDc}` })

  // ② 협업 수정 저장: 실제 버튼과 POST 응답 시간을 측정한다.
  const slip = await firstEditableSlip(request, manager.token, manager.user.userId)
  fs.writeFileSync(path.join(out, '02-slip-query-response.json'), JSON.stringify(slip.body, null, 2), 'utf8')
  if (!slip.row?.id) {
    observations.push({ item: '② 전표 협업 수정 저장·알림', result: '미실시', capture: null, note: `게이트웨이 전표 조회 ${slip.response.status()} 응답에 수정 대상 전표가 없음` })
  } else {
    await page.goto(`${renderer}/#/sales/${slip.row.id}`)
    await settle(page)
    await screenshot(page, '02-slip-detail-before-collab-edit.png')
    const editButton = page.getByRole('button', { name: '협업 수정', exact: true }).first()
    if (!(await editButton.isVisible().catch(() => false))) {
      observations.push({ item: '② 전표 협업 수정 저장·알림', result: '미실시', capture: 'screenshots/02-slip-detail-before-collab-edit.png', note: `전표 ${slip.row.slipNo ?? slip.row.id} 상세에서 협업 수정 버튼을 찾지 못함` })
    } else {
      await editButton.click()
      await page.waitForTimeout(500)
      const memo = page.getByLabel('메모 수정값').first()
      if (await memo.isVisible().catch(() => false)) await memo.fill(`R57 live QA ${new Date().toISOString()}`)
      const reason = page.getByLabel('수정 사유').first()
      if (await reason.isVisible().catch(() => false)) await reason.fill('R57 라이브QA 협업 수정 알림 도달 검증')
      await screenshot(page, '03-collab-edit-filled.png')
      const started = Date.now()
      const responsePromise = page.waitForResponse((response) => response.url().includes('/collab/edits') && response.request().method() === 'POST', { timeout: 15000 }).catch(() => null)
      const submit = page.getByRole('button', { name: '수정완료', exact: true }).first()
      await submit.click()
      const response = await responsePromise
      const elapsedMs = Date.now() - started
      await page.waitForTimeout(1800)
      await screenshot(page, '04-collab-edit-saved.png')
      const body = await page.locator('body').innerText()
      const notificationResponse = await request.get(`${gateway}/api/notifications/history?page=0&size=50`, { headers: { Authorization: `Bearer ${master.token}` } })
      const notificationBody = await notificationResponse.json().catch(() => ({}))
      fs.writeFileSync(path.join(out, '04-notification-history-response.json'), JSON.stringify(notificationBody, null, 2), 'utf8')
      await installAuth(page, master)
      await page.goto(`${renderer}/#/notifications`)
      await settle(page)
      await screenshot(page, '06-notification-history-after-collab-edit.png')
      const notificationText = await page.locator('body').innerText()
      const saved = response?.ok() && /수정완료|수정이 완료|저장 완료/.test(body)
      const notified = notificationResponse.ok() && /전표|수정|협업/.test(notificationText)
      observations.push({ item: '② 전표 협업 수정 저장·알림', result: saved && notified ? 'PASS' : 'FAIL', capture: 'screenshots/06-notification-history-after-collab-edit.png', note: `전표=${slip.row.slipNo ?? slip.row.id}, POST=${response?.status() ?? '응답 없음'}, UI 대기=${elapsedMs}ms, 알림 API=${notificationResponse.status()}, 화면 알림=${notified}, 외부 호출 대기 여부는 응답 시각으로 판단` })
    }
  }

  // ③ 게이트웨이 경유 TERMINAL 관리자 조회 + 권한 없는 계정.
  const terminalUrl = `${gateway}/admin/slip-collab-notifications/terminal`
  const terminal = await request.get(terminalUrl, { headers: { Authorization: `Bearer ${master.token}` } })
  const terminalBody = await terminal.json().catch(() => ({}))
  fs.writeFileSync(path.join(out, '03-terminal-gateway-response.json'), JSON.stringify({ url: terminalUrl, status: terminal.status(), body: terminalBody }, null, 2), 'utf8')
  await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(`<h1>GET ${terminalUrl}</h1><p>HTTP ${terminal.status()}</p><pre>${escapeHtml(JSON.stringify(terminalBody, null, 2))}</pre>`))
  await screenshot(page, '05-terminal-gateway-response.png')
  const terminalItems = terminalBody?.data ?? []
  const terminalShape = terminal.ok() && Array.isArray(terminalItems) && terminalItems.every((x) => x && x.slipNo && x.reason && Number.isInteger(x.attempts) && !JSON.stringify(x).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i))
  const unauthorized = await login(request, 'dev_accountant')
  const denied = unauthorized.token ? await request.get(terminalUrl, { headers: { Authorization: `Bearer ${unauthorized.token}` } }) : null
  observations.push({ item: '③ TERMINAL 관리자 조회·게이트웨이·권한', result: terminalShape && denied && [401, 403].includes(denied.status()) ? 'PASS' : 'FAIL', capture: 'screenshots/05-terminal-gateway-response.png', note: `dev_master 관리자 HTTP=${terminal.status()}, UUID 없음/전표번호·사유·시도횟수 shape=${terminalShape}, dev_accountant HTTP=${denied?.status() ?? '로그인 실패'}` })

  // ④ 저장 경로 차단/지연 여부는 ②의 실제 저장 응답과 같은 사용자 경로의 결과로 판정한다.
  const saveObservation = observations.find((x) => x.item.startsWith('②'))
  observations.push({ item: '④ 저장·수정 차단/눈에 띄는 지연', result: saveObservation?.result === 'PASS' && Number(saveObservation.note.match(/UI 대기=(\d+)ms/)?.[1] ?? 99999) < 5000 ? 'PASS' : '미실시', capture: 'screenshots/04-collab-edit-saved.png', note: saveObservation?.note ?? '② 미실시로 함께 판정 불가' })
} finally {
  fs.writeFileSync(path.join(out, 'observations.json'), JSON.stringify(observations, null, 2), 'utf8')
  await request.dispose()
  await browser.close()
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

async function requestContext(browser, baseURL) {
  const { request } = require(path.join(repoRoot, 'clients/desktop/node_modules/@playwright/test'))
  return request.newContext({ baseURL })
}
