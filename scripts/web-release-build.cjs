'use strict'

const { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { createReleaseBuildEnvironment } = require('./app-build-version.cjs')

const REPO_ROOT = resolve(__dirname, '..')

const TARGETS = {
  'estimate-app': { projectDir: 'clients/web/estimate-app', kind: 'server' },
  'order-app': { projectDir: 'clients/web/order-app', kind: 'vite' },
  'mobile-public': { projectDir: 'clients/web/mobile-public', kind: 'vite' },
}

function outputFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? outputFiles(path) : [path]
  })
}

function createWebReleaseEnvironment(env = process.env) {
  return createReleaseBuildEnvironment({ env, variable: 'VITE_APP_VERSION' })
}

function verifyViteReleaseOutput({ outputDir, appName, appVersion }) {
  const matches = outputFiles(outputDir)
    .filter((file) => /\.(?:html|js|css|json|webmanifest)$/.test(file))
    .filter((file) => readFileSync(file, 'utf8').includes(appVersion))
  if (matches.length === 0) {
    throw new Error(`${appName} dist 산출물에 주입 버전 ${appVersion}이 없습니다.`)
  }
  const marker = { appName, appVersion, release: true, artifact: 'vite-dist' }
  writeFileSync(join(outputDir, '.samhan-release.json'), `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
  const verified = JSON.parse(readFileSync(join(outputDir, '.samhan-release.json'), 'utf8'))
  if (verified.appVersion !== appVersion || verified.release !== true) {
    throw new Error(`${appName} 릴리스 marker 검증에 실패했습니다.`)
  }
  return verified
}

function writeAndVerifyServerReleaseManifest({ manifestPath, appName, appVersion }) {
  const manifest = { appName, appVersion, release: true, artifact: 'server-runtime-manifest' }
  mkdirSync(resolve(manifestPath, '..'), { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const verified = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (verified.appVersion !== appVersion || verified.release !== true) {
    throw new Error(`${appName} 서버 릴리스 manifest 검증에 실패했습니다.`)
  }
  return verified
}

function runBuild(target, releaseEnv) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm'
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd run build'] : ['run', 'build']
  const result = spawnSync(command, args, {
    cwd: resolve(REPO_ROOT, target.projectDir),
    env: releaseEnv,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${target.projectDir} 릴리스 build가 실패했습니다. (${result.status ?? 'signal'})`)
}

function main(appName = process.argv[2]) {
  const target = TARGETS[appName]
  if (!target) throw new Error(`지원하지 않는 웹 릴리스 대상입니다: ${appName ?? '(없음)'}`)
  const release = createWebReleaseEnvironment(process.env)
  console.log(`[web-release] ${appName} VITE_APP_VERSION=${release.appVersion}`)
  runBuild(target, release.env)
  if (target.kind === 'vite') {
    const marker = verifyViteReleaseOutput({
      outputDir: resolve(REPO_ROOT, target.projectDir, 'dist'),
      appName,
      appVersion: release.appVersion,
    })
    console.log(`[web-release] ${appName} dist 버전 사후검증 PASS: ${marker.appVersion}`)
    return
  }
  const marker = writeAndVerifyServerReleaseManifest({
    manifestPath: resolve(REPO_ROOT, target.projectDir, 'release/.samhan-release.json'),
    appName,
    appVersion: release.appVersion,
  })
  console.log(`[web-release] ${appName} 서버 manifest 사후검증 PASS: ${marker.appVersion}`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(`[web-release] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

module.exports = {
  TARGETS,
  createWebReleaseEnvironment,
  verifyViteReleaseOutput,
  writeAndVerifyServerReleaseManifest,
}
