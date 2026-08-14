const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { _electron: electron } = require('@playwright/test')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const PORT = 18080
const api = `http://127.0.0.1:${PORT}`
const screenshotDir = resolveQaShotsDir(
  process.env.ELECTRON_CONTRACT_OUTPUT ?? path.resolve(__dirname, '../../../docs/qa/2026-08-14-1180-reconv/screenshots'),
)
fs.mkdirSync(screenshotDir, { recursive: true })
const stepLog = (value) => { const line = `ELECTRON_STEP|${value}`; console.log(line); fs.appendFileSync(path.join(screenshotDir, 'execution.log'), `${line}\n`) }
const sseClients = new Set()
const observed = { direct: 0, join: 0, leave: 0 }
const sessions = [{ sessionCode: 'CLD-1', title: '배차 일정 요약', messageCount: 2, lastMessage: '내일 오전 배차를 정리했습니다.', lastMessageAt: '2026-08-14T08:36:00+09:00', summaryMode: 'REAL' }]

const employee = (employeeCode, name, status) => ({ employeeCode, name, jobTitle: '대리', departmentName: '개발팀', employmentStatus: 'ACTIVE', presenceStatus: status })
function json(res, data, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ data, success: true, code: 'OK', message: '', timestamp: new Date().toISOString() }))
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, api)
  if (url.pathname === '/api/users/messenger/me') return json(res, employee('ME', '홍길동', 'AVAILABLE'))
  if (url.pathname === '/api/users/messenger/directory') return json(res, [employee('E2', '김대리', 'OFFLINE'), employee('E1', '박개발', 'AVAILABLE')])
  if (url.pathname.startsWith('/api/users/messenger/presence/sessions/') && req.method === 'POST') { observed.join++; return json(res, null) }
  if (url.pathname.startsWith('/api/users/messenger/presence/sessions/') && req.method === 'DELETE') { observed.leave++; return json(res, null) }
  if (url.pathname === '/api/users/messenger/presence/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write('event:connected\ndata:{"ok":true}\n\n')
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    return
  }
  if (url.pathname === '/admin/groupware/chat/rooms/groups') return json(res, [{ roomCode: 'GROUP-1', type: 'GROUP', roomName: '운영방', participants: [{ name: '홍길동' }, { name: '김대리' }, { name: '박개발' }, { name: '이과장' }], unreadCount: 0, latestMessageAt: '2026-08-14T08:36:00+09:00' }])
  if (url.pathname === '/admin/groupware/chat/rooms/GROUP-1/messages') return json(res, [{ roomCode: 'GROUP-1', sequence: 1, body: '오늘 일정 공유드립니다', sentAt: '2026-08-14T08:36:00+09:00' }])
  if (url.pathname === '/api/v1/admin/groupware/chat/rooms/direct/by-employee-code' && req.method === 'POST') { observed.direct++; return json(res, { roomCode: 'DIRECT-1', type: 'DIRECT' }, 201) }
  if (url.pathname === '/api/v1/admin/groupware/chat/rooms/direct/by-employee-code') return json(res, null, 404)
  if (url.pathname === '/admin/groupware/chat/rooms') return json(res, [])
  if (url.pathname === '/auth/claude/sessions' && req.method === 'GET') return json(res, sessions)
  if (url.pathname === '/auth/claude/sessions' && req.method === 'POST') return json(res, sessions[0], 201)
  return json(res, null, 404)
})

async function main() {
  stepLog('server-start')
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'samhan-electron-contract-'))
  stepLog('launching-electron')
  const app = await electron.launch({ args: [`--user-data-dir=${userDataDir}`, 'out/main/index.js'], cwd: path.resolve(__dirname, '..'), env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' } })
  stepLog('electron-launched')
  const page = await app.firstWindow()
  stepLog('entry-window')
  await page.waitForSelector('[data-testid="messenger-app"]')
  await page.screenshot({ path: path.join(screenshotDir, 'round-fix-1-entry-real-electron.png'), fullPage: true })

  const childPromise = app.waitForEvent('window', { timeout: 5_000 }).catch(() => null)
  await page.getByRole('button', { name: /김대리/ }).click()
  const child = app.windows().find((window) => window !== page) ?? await childPromise
  if (!child) throw new Error('ELECTRON_OBSERVATION_FAILED|direct conversation window was not exposed')
  stepLog('direct-child')
  await child.waitForSelector('[data-testid="conversation-window"]')
  await child.waitForSelector('textarea[aria-label="메시지 본문"]')
  assert.equal(observed.direct, 1)
  assert.equal(app.windows().length, 2)
  await page.getByRole('button', { name: /김대리/ }).click()
  await page.waitForTimeout(100)
  assert.equal(app.windows().length, 2)
  await child.screenshot({ path: path.join(screenshotDir, 'round-fix-2-direct-real-electron.png'), fullPage: true })
  await child.close()
  stepLog('direct-closed')
  const childCloseLeave = observed.leave
  assert.equal(childCloseLeave, 0)
  assert.equal(observed.join, 1)

  await page.getByRole('button', { name: '그룹별' }).click()
  stepLog('group-page')
  await page.getByText('운영방').waitFor()
  await assert.doesNotReject(() => page.getByText('4').waitFor())
  await page.getByText('오늘 일정 공유드립니다').waitFor()
  await page.getByText('오전 8:36').waitFor()
  await page.screenshot({ path: path.join(screenshotDir, 'round-fix-3-group-metadata-real-electron.png'), fullPage: true })

  for (const client of sseClients) client.write('event:presence\ndata:{"employeeCode":"E2","presenceStatus":"IN_MEETING","label":"회의중"}\n\n')
  await page.getByLabel('김대리 상태: 회의중').waitFor()
  await page.screenshot({ path: path.join(screenshotDir, 'round-fix-4-presence-real-electron.png'), fullPage: true })

  await page.getByRole('button', { name: '클로드' }).click()
  stepLog('claude-page')
  await page.getByText('배차 일정 요약').waitFor()
  await page.screenshot({ path: path.join(screenshotDir, 'round-fix-5-claude-session-list-real-electron.png'), fullPage: true })

  await page.getByRole('button', { name: '개별' }).click()
  await page.getByRole('button', { name: /김대리/ }).waitFor()
  stepLog('switch-back-individual')
  const persistenceChildPromise = app.waitForEvent('window', { timeout: 5_000 }).catch(() => null)
  stepLog('before-persistence-click')
  await page.getByRole('button', { name: /김대리/ }).click()
  stepLog('after-persistence-click')
  const persistenceChild = app.windows().find((window) => window !== page) ?? await persistenceChildPromise
  if (!persistenceChild) throw new Error('ELECTRON_OBSERVATION_FAILED|conversation window was not reused or opened')
  stepLog('persistence-child')
  await persistenceChild.waitForSelector('[data-testid="conversation-window"]')
  await app.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().includes('#/conversation/'))
    mainWindow?.close()
  })
  stepLog('main-closed')
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(observed.leave, 0)
  stepLog('before-survivor-screenshot')
  const survivingWindow = app.windows().find((window) => window.url().includes('#/conversation/'))
  if (!survivingWindow) throw new Error('ELECTRON_OBSERVATION_FAILED|room window did not survive main close')
  await survivingWindow.getByRole('textbox', { name: '메시지 본문' }).fill('메인 창 종료 후에도 방 창 유지 확인')
  await survivingWindow.screenshot({ path: path.join(screenshotDir, 'round-fix-6-main-closed-room-survives-real-electron.png'), fullPage: true })
  stepLog('after-survivor-screenshot')
  await app.evaluate(({ BrowserWindow }) => {
    const childWindow = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/conversation/'))
    childWindow?.close()
  })
  await new Promise((resolve) => setTimeout(resolve, 2_500))
  assert.equal(observed.leave, 1)
  console.log(`ELECTRON_CONTRACT|direct=${observed.direct}|windows=deduped|group=metadata|presence=reflected|join=${observed.join}|childCloseLeave=${childCloseLeave}|leave=${observed.leave}`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => server.close())
