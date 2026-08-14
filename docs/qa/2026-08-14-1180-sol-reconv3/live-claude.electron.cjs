const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const { _electron: electron } = require('@playwright/test')
const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const appDir = path.resolve(__dirname, '../../../clients/internal-chat-desktop')
const shots = resolveQaShotsDir(path.resolve(__dirname, 'screenshots'))
const authBase = 'http://127.0.0.1:29482'

function json(res, data, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ success: true, data, code: 'OK', message: '', timestamp: new Date().toISOString() }))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:29480')
  if (url.pathname === '/api/users/messenger/me') return json(res, { employeeCode: 'ME', name: '검증자', jobTitle: '대리', departmentName: '개발팀', employmentStatus: 'ACTIVE', presenceStatus: 'AVAILABLE' })
  if (url.pathname === '/api/users/messenger/directory') return json(res, [])
  if (url.pathname.includes('/presence/sessions/')) return json(res, null)
  if (url.pathname === '/api/users/messenger/presence/stream') { res.writeHead(200, { 'content-type': 'text/event-stream' }); return res.end() }
  if (url.pathname.includes('/chat/rooms')) return json(res, [])
  return json(res, null, 404)
})

async function api(pathname, init = {}) {
  const response = await fetch(authBase + pathname, init)
  const payload = await response.json()
  if (!response.ok) throw new Error(`${pathname} ${response.status} ${JSON.stringify(payload)}`)
  return payload.data
}

async function main() {
  await new Promise((resolve) => server.listen(29480, '127.0.0.1', resolve))
  const login = await api('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId: 'dev_master', password: resolveQaCredential() }) })
  const headers = { authorization: `Bearer ${login.token}`, 'x-user-id': login.userId }
  const app = await electron.launch({ args: ['out/main/index.js'], cwd: appDir, env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' } })
  const page = await app.firstWindow()
  await page.route(`${authBase}/**`, (route) => route.continue({ headers: { ...route.request().headers(), ...headers } }))
  await page.getByRole('button', { name: '클로드' }).click()
  await page.getByRole('list', { name: '클로드 세션 목록' }).waitFor()
  await page.getByText('가상 요약 · 오늘 미배차 차량과 우선 처리 순서를 한 줄로 요약해줘', { exact: true }).waitFor()
  await page.getByText('요약을 생성할 수 없음 · 자격 미설정', { exact: true }).waitFor()
  await page.screenshot({ path: path.join(shots, '01-actual-api-claude-list-real-electron.png'), fullPage: true })
  const rows = await page.getByRole('list', { name: '클로드 세션 목록' }).locator('li').allTextContents()
  const styles = await page.getByRole('list', { name: '클로드 세션 목록' }).locator('li button').evaluateAll((nodes) => nodes.map((node) => { const s = getComputedStyle(node); const r = node.getBoundingClientRect(); return { height: r.height, border: s.border, outline: s.outline, background: s.backgroundColor } }))
  console.log('ACTUAL_API_CLAUDE_ROWS=' + JSON.stringify(rows))
  console.log('CLAUDE_DESIGN=' + JSON.stringify(styles))
  assert(rows.some((row) => row.includes('가상 요약')))
  assert(rows.some((row) => row.includes('자격 미설정')))
  await app.close()
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => server.close())
