const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const assert = require('node:assert/strict')
const { _electron: electron } = require('@playwright/test')
const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const appDir = path.resolve(__dirname, '../../../clients/desktop')
const shots = resolveQaShotsDir(path.resolve(__dirname, 'screenshots'))

async function main() {
  const app = await electron.launch({
    executablePath: path.join(appDir, 'node_modules/electron/dist/electron.exe'),
    args: [appDir, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'sol1180r3-desktop-'))}`, '--disable-gpu'],
    env: { ...process.env, VITE_API_BASE_URL: 'http://127.0.0.1:8080' },
  })
  const page = await app.firstWindow()
  await page.getByTestId('login-id-input').fill('dev_master')
  await page.getByTestId('login-password-input').fill(resolveQaCredential())
  await page.getByTestId('login-submit-button').click()
  await page.getByText('대시보드', { exact: true }).waitFor({ timeout: 30_000 })
  const index = path.join(appDir, 'out/renderer/index.html').replaceAll('\\', '/')
  await page.goto(`file:///${index}#/chat`)
  await page.getByTestId('chat-rooms-page').waitFor({ timeout: 30_000 })
  await page.getByRole('list', { name: '채팅방 목록' }).waitFor()
  const listText = await page.locator('body').innerText()
  await page.screenshot({ path: path.join(shots, '08-desktop-chat-list-global-header-real-electron.png'), fullPage: true })
  console.log('DESKTOP_CHAT_LIST|devSeed=' + (listText.includes('[DEV-SEED]') ? 1 : 0))

  const search = page.getByRole('textbox', { name: '대화 상대 검색' })
  await search.fill('탈퇴사용자')
  await page.waitForTimeout(700)
  const inactiveVisible = await page.getByText(/탈퇴사용자/).count()
  console.log('INACTIVE_SEARCH|visible=' + inactiveVisible)
  assert.equal(inactiveVisible, 0)

  await search.fill('')
  const firstRoom = page.getByRole('list', { name: '채팅방 목록' }).getByRole('link').first()
  if (await firstRoom.count()) {
    await firstRoom.click()
    await page.getByTestId('chat-room-page').waitFor({ timeout: 30_000 })
    const roomText = await page.locator('body').innerText()
    await page.screenshot({ path: path.join(shots, '09-desktop-room-global-header-real-electron.png'), fullPage: true })
    console.log('DESKTOP_CHAT_ROOM|devSeed=' + (roomText.includes('[DEV-SEED]') ? 1 : 0) + '|participantList=' + (roomText.includes('참여자') ? 1 : 0))
  } else {
    console.log('DESKTOP_CHAT_ROOM|OBSERVATION_UNAVAILABLE|reason=no-room-link')
  }
  await app.close()
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
