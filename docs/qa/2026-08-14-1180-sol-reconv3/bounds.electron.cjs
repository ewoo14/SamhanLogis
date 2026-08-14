const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { _electron: electron } = require('@playwright/test')

function json(res, data, status = 200) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, data })) }
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:18080')
  const person = { employeeCode: 'E2', name: '김대리', jobTitle: '대리', departmentName: '개발팀', employmentStatus: 'ACTIVE', presenceStatus: 'AVAILABLE' }
  if (u.pathname === '/api/users/messenger/me') return json(res, { ...person, employeeCode: 'ME', name: '검증자' })
  if (u.pathname === '/api/users/messenger/directory') return json(res, [person])
  if (u.pathname.includes('/presence/sessions/')) return json(res, null)
  if (u.pathname === '/api/users/messenger/presence/stream') { res.writeHead(200, { 'content-type': 'text/event-stream' }); return res.end() }
  if (u.pathname === '/api/v1/admin/groupware/chat/rooms/direct/by-employee-code' && req.method === 'POST') return json(res, { roomCode: 'BOUNDS-1', type: 'DIRECT' }, 201)
  if (u.pathname.includes('/chat/rooms')) return json(res, [])
  return json(res, null, 404)
})

async function main() {
  await new Promise((resolve) => server.listen(18080, '127.0.0.1', resolve))
  const appDir = path.resolve(__dirname, '../../../clients/internal-chat-desktop')
  const app = await electron.launch({ args: [`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'sol1180r3-bounds-'))}`, 'out/main/index.js'], cwd: appDir, env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' } })
  const main = await app.firstWindow()
  let opened = app.waitForEvent('window')
  await main.getByRole('button', { name: /김대리/ }).click()
  let child = await opened
  await child.getByTestId('conversation-window').waitFor()
  const set = { x: 140, y: 150, width: 720, height: 640 }
  await app.evaluate(({ BrowserWindow }, b) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('#/conversation/'))?.setBounds(b), set)
  await child.close()
  opened = app.waitForEvent('window')
  await main.getByRole('button', { name: /김대리/ }).click()
  child = await opened
  await child.getByTestId('conversation-window').waitFor()
  const restored = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('#/conversation/'))?.getBounds())
  assert.deepEqual(restored, set)
  console.log('BOUNDS_RESTORE|set=' + JSON.stringify(set) + '|restored=' + JSON.stringify(restored) + '|windows=' + app.windows().length)
  await child.screenshot({ path: path.resolve(__dirname, 'screenshots/10-direct-restored-real-electron.png'), fullPage: true })
  await app.close()
}
main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => server.close())
