'use strict'

const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  createElectronBuilderVersionArgs,
  createReleaseBuildEnvironment,
} = require('./app-build-version.cjs')

const APP_DIR = resolve(__dirname, '../clients/internal-chat-desktop')

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: APP_DIR, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} 종료 코드 ${result.status ?? 1}`)
}

function main() {
  const releaseBuild = createReleaseBuildEnvironment({ variable: 'VITE_APP_VERSION' })
  const electronViteCli = resolve(APP_DIR, 'node_modules/electron-vite/bin/electron-vite.js')
  const electronBuilderCli = resolve(APP_DIR, 'node_modules/electron-builder/cli.js')

  console.log(`[internal-chat-release] VITE_APP_VERSION=${releaseBuild.appVersion}`)
  run(process.execPath, [electronViteCli, 'build'], releaseBuild.env)
  run(process.execPath, [
    electronBuilderCli,
    '--win',
    '--config.win.signAndEditExecutable=false',
    ...createElectronBuilderVersionArgs(releaseBuild.packageVersion, releaseBuild.appVersion),
  ], releaseBuild.env)
}

try {
  main()
} catch (error) {
  console.error(`[internal-chat-release] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
