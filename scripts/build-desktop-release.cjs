'use strict'

const { spawnSync } = require('node:child_process')
const {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const {
  createReleaseBuildEnvironment,
  createElectronBuilderVersionArgs,
  createNsisDisplayVersionInclude,
} = require('./app-build-version.cjs')
const { requireSigningEnvironment, requireUpdateFeedEnvironment } = require('./electron-update-contract.cjs')

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
    throw new Error(`${command} ${args.join(' ')} 종료 코드 ${result.status ?? 1}`)
  }
}

function createNsisIncludeFile(appVersion) {
  const directory = mkdtempSync(join(tmpdir(), 'samhan-public-nsis-'))
  const file = join(directory, 'display-version.nsh')
  writeFileSync(file, createNsisDisplayVersionInclude(appVersion), 'utf8')
  return {
    file,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
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
  requireSigningEnvironment(process.env)
  requireUpdateFeedEnvironment(process.env, 'desktop', 'DESKTOP_UPDATE_URL')

  console.log(`[release-build] VITE_APP_VERSION=${releaseBuild.appVersion}`)

  const legacyBuildScript = join(process.cwd(), 'scripts', 'build-legacy-estimate.cjs')
  const electronViteCli = join(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
  const electronBuilderCli = join(process.cwd(), 'node_modules', 'electron-builder', 'cli.js')
  const nsisInclude = createNsisIncludeFile(releaseBuild.appVersion)

  try {
    // 릴리스 모드와 명시 버전을 모든 실제 산출물 단계에 전파한다.
    run(process.execPath, [legacyBuildScript], releaseBuild.env)
    run(process.execPath, [electronViteCli, 'build'], releaseBuild.env)
    verifyReleaseRenderer(releaseBuild.appVersion)
    run(
      process.execPath,
      [
        electronBuilderCli,
        `--config.nsis.include=${nsisInclude.file}`,
        '--win',
        ...createElectronBuilderVersionArgs(releaseBuild.packageVersion, releaseBuild.appVersion),
      ],
      releaseBuild.env,
    )
  } finally {
    nsisInclude.cleanup()
  }
}

try {
  main()
} catch (error) {
  console.error(`[release-build] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
