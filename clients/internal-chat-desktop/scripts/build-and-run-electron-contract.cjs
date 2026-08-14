const { spawnSync } = require('node:child_process')
const path = require('node:path')

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const result = spawnSync(npm, ['run', 'build'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, VITE_API_BASE_URL: 'http://127.0.0.1:18080' },
  shell: process.platform === 'win32',
  stdio: 'inherit',
})
if (result.error) { console.error(result.error); process.exit(1) }
if (result.status !== 0) process.exit(result.status ?? 1)
require('./actual-entry.electron.contract.cjs')
