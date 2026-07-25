const { spawnSync } = require('node:child_process')
const { existsSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const {
  createReleaseBuildEnvironment,
} = require('./app-build-version.cjs')

const DESKTOP_DIR = resolve(__dirname, '../clients/desktop')
const VITE_CLI = resolve(DESKTOP_DIR, 'node_modules/vite/bin/vite.js')
const TARGETS = {
  web: {
    config: 'vite.web.config.ts',
    output: 'dist/web',
  },
  capacitor: {
    config: 'vite.capacitor.config.ts',
    output: 'dist/capacitor',
  },
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function outputJavaScriptFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return outputJavaScriptFiles(path)
    return entry.name.endsWith('.js') ? [path] : []
  })
}

function runViteRelease(target, releaseEnv) {
  const result = spawnSync(process.execPath, [
    VITE_CLI,
    'build',
    '--config',
    target.config,
  ], {
    cwd: DESKTOP_DIR,
    env: releaseEnv,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Vite ${target.config} 릴리스 빌드가 실패했습니다. (${result.status ?? 'signal'})`)
  }
}

function verifyReleaseOutput(target, appVersion) {
  const outputDir = join(DESKTOP_DIR, target.output)
  const versionPattern = new RegExp(`(?:["'])${escapeRegExp(appVersion)}(?:["'])`)
  const matches = outputJavaScriptFiles(outputDir).filter((file) =>
    versionPattern.test(readFileSync(file, 'utf8')))
  if (matches.length === 0) {
    throw new Error(`${target.output}에 주입 버전 ${appVersion}이 없습니다.`)
  }

  writeFileSync(join(outputDir, '.samhan-release.json'), `${JSON.stringify({
    artifact: target.output,
    appVersion,
    release: true,
  }, null, 2)}\n`, 'utf8')
  console.log(`[release-build] ${target.output}에 ${appVersion} 릴리스 표식을 기록했습니다.`)
}

function main() {
  const target = TARGETS[process.argv[2]]
  if (!target) {
    throw new Error(`지원하지 않는 데스크톱 릴리스 대상입니다: ${process.argv[2] ?? '(없음)'}`)
  }

  const releaseBuild = createReleaseBuildEnvironment({
    variable: 'VITE_APP_VERSION',
  })
  console.log(`[release-build] VITE_APP_VERSION=${releaseBuild.appVersion}`)
  runViteRelease(target, releaseBuild.env)
  verifyReleaseOutput(target, releaseBuild.appVersion)
}

try {
  main()
} catch (error) {
  console.error(`[release-build] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
