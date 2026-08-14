const { spawnSync } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

async function main() {
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port: assignedPort } = probe.address()
      probe.close(() => resolve(assignedPort))
    })
  })
  const api = `http://127.0.0.1:${port}`
  const result = spawnSync(npm, ['run', 'build'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ELECTRON_CONTRACT_PORT: String(port), VITE_API_BASE_URL: api, VITE_AUTH_API_BASE_URL: api },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
  else {
    process.env.ELECTRON_CONTRACT_PORT = String(port)
    require('./actual-entry.electron.contract.cjs')
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
