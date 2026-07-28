'use strict'

const { existsSync, readdirSync, readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { createReleaseBuildEnvironment } = require('./app-build-version.cjs')

const DESKTOP_DIR = resolve(__dirname, '../clients/arologis-desktop')

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: DESKTOP_DIR,
    env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function outputJavaScriptFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return outputJavaScriptFiles(path)
    return entry.name.endsWith('.js') ? [path] : []
  })
}

function verifyReleaseRenderer(appVersion) {
  const assetsDir = join(DESKTOP_DIR, 'out/renderer')
  const matches = outputJavaScriptFiles(assetsDir).filter((file) => readFileSync(file, 'utf8').includes(appVersion))
  if (matches.length === 0) {
    throw new Error(`[arologis-release] renderer 산출물에 주입 버전 ${appVersion}이 없습니다.`)
  }
  console.log(`[arologis-release] renderer 버전 주입 확인: ${appVersion}`)
}

function main() {
  if (!String(process.env.AROLOGIS_UPDATE_URL || '').trim()) {
    throw new Error('AROLOGIS_UPDATE_URL이 필요합니다. 코드서명된 아로로지스 전용 HTTPS 업데이트 피드를 지정하십시오.')
  }

  const releaseBuild = createReleaseBuildEnvironment({ variable: 'VITE_APP_VERSION' })
  const electronViteCli = resolve(DESKTOP_DIR, 'node_modules/electron-vite/bin/electron-vite.js')
  const electronBuilderCli = resolve(DESKTOP_DIR, 'node_modules/electron-builder/cli.js')

  console.log(`[arologis-release] VITE_APP_VERSION=${releaseBuild.appVersion}`)
  run(process.execPath, [electronViteCli, 'build'], releaseBuild.env)
  verifyReleaseRenderer(releaseBuild.appVersion)
  run(process.execPath, [electronBuilderCli, '--win'], releaseBuild.env)
}

try {
  main()
} catch (error) {
  console.error(`[arologis-release] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
