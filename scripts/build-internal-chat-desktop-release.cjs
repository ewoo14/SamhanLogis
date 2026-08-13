'use strict'

const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const {
  createElectronBuilderVersionArgs,
  createReleaseBuildEnvironment,
  createNsisDisplayVersionInclude,
} = require('./app-build-version.cjs')

const APP_DIR = resolve(__dirname, '../clients/internal-chat-desktop')

function requireReleaseEnvironment(name) {
  if (!String(process.env[name] || '').trim()) {
    throw new Error(`${name}이(가) 필요합니다. 사내 feed와 자체서명 인증서를 지정하십시오.`)
  }
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: APP_DIR, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} 종료 코드 ${result.status ?? 1}`)
}

function main() {
  requireReleaseEnvironment('INTERNAL_CHAT_UPDATE_URL')
  requireReleaseEnvironment('CSC_LINK')
  requireReleaseEnvironment('CSC_KEY_PASSWORD')
  const releaseBuild = createReleaseBuildEnvironment({ variable: 'VITE_APP_VERSION' })
  const electronViteCli = resolve(APP_DIR, 'node_modules/electron-vite/bin/electron-vite.js')
  const electronBuilderCli = resolve(APP_DIR, 'node_modules/electron-builder/cli.js')

  const includeDirectory = mkdtempSync(resolve(tmpdir(), 'internal-chat-nsis-'))
  const includeFile = resolve(includeDirectory, 'display-version.nsh')
  writeFileSync(includeFile, createNsisDisplayVersionInclude(releaseBuild.appVersion), 'utf8')
  try {
    console.log(`[internal-chat-release] VITE_APP_VERSION=${releaseBuild.appVersion}`)
    run(process.execPath, [electronViteCli, 'build'], releaseBuild.env)
    run(process.execPath, [
      electronBuilderCli,
      `--config.nsis.include=${includeFile}`,
      '--win',
      ...createElectronBuilderVersionArgs(releaseBuild.packageVersion, releaseBuild.appVersion),
    ], releaseBuild.env)
  } finally {
    rmSync(includeDirectory, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(`[internal-chat-release] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
