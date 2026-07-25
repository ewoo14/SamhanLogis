const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')

const DESKTOP_DIR = resolve(__dirname, '../clients/desktop')
const CAPACITOR_CLI = resolve(DESKTOP_DIR, 'node_modules/@capacitor/cli/bin/capacitor')

function createSyncEnvironment(mode, baseEnvironment = process.env) {
  if (mode !== 'development' && mode !== 'release') {
    throw new Error(`지원하지 않는 Capacitor sync 모드입니다: ${mode}`)
  }

  return {
    ...baseEnvironment,
    CAPACITOR_SYNC_MODE: mode,
  }
}

function run() {
  const mode = process.argv[2]
  const result = spawnSync(process.execPath, [CAPACITOR_CLI, 'sync', 'android'], {
    cwd: DESKTOP_DIR,
    env: createSyncEnvironment(mode),
    encoding: 'utf8',
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(result.error.message)
  }
  process.exit(result.status ?? 1)
}

module.exports = { createSyncEnvironment }

if (require.main === module) {
  run()
}
