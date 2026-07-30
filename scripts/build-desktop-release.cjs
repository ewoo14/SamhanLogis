'use strict'

const { spawnSync } = require('node:child_process')
const { readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const {
  createReleaseBuildEnvironment,
  createElectronBuilderVersionArgs,
} = require('./app-build-version.cjs')

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function verifyReleaseRenderer(appVersion) {
  const assetsDir = join(process.cwd(), 'out', 'renderer', 'assets')
  const versionPattern = new RegExp(
    `CURRENT_VERSION\\s*=\\s*resolveBuildAppVersion\\(\\s*["']${escapeRegExp(appVersion)}["']`,
  )
  const hasInjectedVersion = readdirSync(assetsDir)
    .filter((file) => file.endsWith('.js'))
    .some((file) => versionPattern.test(readFileSync(join(assetsDir, file), 'utf8')))
  if (!hasInjectedVersion) {
    throw new Error(
      `[release-build] renderer CURRENT_VERSION에 ${appVersion}이 주입되지 않았습니다.`,
    )
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')
}

function main() {
  let releaseBuild
  try {
    releaseBuild = createReleaseBuildEnvironment({
      variable: 'VITE_APP_VERSION',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[release-build] ${message}`)
    process.exitCode = 1
    return
  }

  console.log(`[release-build] VITE_APP_VERSION=${releaseBuild.appVersion}`)

  const legacyBuildScript = join(process.cwd(), 'scripts', 'build-legacy-estimate.cjs')
  const electronViteCli = join(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
  const electronBuilderCli = join(process.cwd(), 'node_modules', 'electron-builder', 'cli.js')

  // 릴리스 모드와 명시 버전을 모든 실제 산출물 단계에 전파한다.
  run(process.execPath, [legacyBuildScript], releaseBuild.env)
  run(process.execPath, [electronViteCli, 'build'], releaseBuild.env)
  verifyReleaseRenderer(releaseBuild.appVersion)
  run(
    process.execPath,
    [electronBuilderCli, '--win', ...createElectronBuilderVersionArgs(releaseBuild.packageVersion)],
    releaseBuild.env,
  )
}

main()
