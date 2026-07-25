const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { readdirSync, readFileSync } = require('node:fs')
const { dirname, join, resolve } = require('node:path')
const { test } = require('node:test')

const DESKTOP_DIR = resolve(__dirname, '..')
const REPOSITORY_DIR = resolve(DESKTOP_DIR, '../..')
const ELECTRON_VITE = resolve(dirname(require.resolve('electron-vite')), '..', 'bin', 'electron-vite.js')

function read(relativePath) {
  return readFileSync(join(REPOSITORY_DIR, relativePath), 'utf8')
}

function electronBuild(envOverrides) {
  const result = spawnSync(process.execPath, [ELECTRON_VITE, 'build'], {
    cwd: DESKTOP_DIR,
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
  const rendererDir = join(DESKTOP_DIR, 'out', 'renderer', 'assets')
  return readdirSync(rendererDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(rendererDir, file), 'utf8'))
    .join('\n')
}

test('Electron 산출물은 릴리스 주입과 개발 sentinel을 구분한다', () => {
  const output = electronBuild({ VITE_APP_VERSION: '2026/07/25-91001' })
  assert.match(output, /2026\/07\/25-91001/)
  assert.equal(output.includes('CURRENT_VERSION = resolveBuildAppVersion("0.0.0")'), false)

  const developmentOutput = electronBuild({ VITE_APP_VERSION: '', SAMHAN_RELEASE_BUILD: '' })
  assert.match(developmentOutput, /0\.1\.0-dev/)
  assert.equal(developmentOutput.includes('0.0.0'), false)

  const releaseResult = spawnSync(process.execPath, [ELECTRON_VITE, 'build'], {
    cwd: DESKTOP_DIR,
    env: { ...process.env, VITE_APP_VERSION: '', SAMHAN_RELEASE_BUILD: '1' },
    encoding: 'utf8',
  })
  assert.notEqual(releaseResult.status, 0, `${releaseResult.error ?? ''}\n${releaseResult.stdout}\n${releaseResult.stderr}`)
  assert.match(`${releaseResult.stdout}\n${releaseResult.stderr}`, /릴리스.*명시|VITE_APP_VERSION.*명시/)
})

test('데스크톱의 모든 Vite 빌드 설정은 0.0.0 폴백 없이 공통 버전 해석기를 사용한다', () => {
  for (const relativePath of [
    'clients/desktop/electron.vite.config.ts',
    'clients/desktop/vite.config.ts',
    'clients/desktop/vite.web.config.ts',
    'clients/desktop/vite.capacitor.config.ts',
  ]) {
    const source = read(relativePath)
    assert.equal(/\|\|\s*['"]0\.0\.0['"]/.test(source), false, relativePath)
    assert.equal(/app-build-version/.test(source), true, relativePath)
  }
})

test('Expo 3앱의 app.config는 무주입 개발 sentinel을 사용한다', () => {
  for (const relativePath of [
    'clients/mobile/app.config.js',
    'clients/mobile-staff/app.config.js',
    'clients/arologis-mobile/app.config.js',
  ]) {
    const script = [
      `const cfg = require(${JSON.stringify(join(REPOSITORY_DIR, relativePath))})`,
      'process.stdout.write(String(cfg.expo.extra.appVersion))',
    ].join(';')
    const result = spawnSync(process.execPath, ['-e', script], {
      env: { ...process.env, EXPO_PUBLIC_APP_VERSION: '' },
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, `${relativePath}\n${result.stdout}\n${result.stderr}`)
    assert.equal(result.stdout, '0.1.0-dev', relativePath)
  }
})

test('#909 실 QA 5개 스펙은 개발 최신 버전과 전환기 semver 최소 버전을 사용한다', () => {
  const paths = [
    'clients/desktop/playwright/909-auto-update-real-qa/force-level-gate-real-qa.spec.ts',
    'clients/desktop/playwright/909-auto-update-real-qa/luna-round-real-qa.spec.ts',
    'clients/desktop/playwright/909-auto-update-real-qa/opus-reconv3-probe-real-qa.spec.ts',
    'clients/desktop/playwright/909-auto-update-real-qa/sonnet-round2-print-sweep-real-qa.spec.ts',
    'clients/desktop/playwright/909-auto-update-real-qa/sonnet-round2-notice-overlap-real-qa.spec.ts',
  ]
  for (const relativePath of paths) {
    const source = read(relativePath)
    assert.equal(/clientType:\s*'DESKTOP',\s*version:\s*'9\.9\./.test(source), false, relativePath)
    assert.equal(/minSupportedVersion:\s*'9\.9\./.test(source), false, relativePath)
    assert.equal(/minSupportedVersion:\s*'(?:\d+\.\d+\.\d+|\d{4}\/\d{2}\/\d{2}-[1-9]\d*)'/.test(source), true, relativePath)
  }
})

test('문서는 존재하지 않는 semver 폴백과 무조건 주입된다는 서술을 계약으로 남기지 않는다', () => {
  assert.equal(/주입이 없는 구버전 실행 환경은 패키지 semver를 읽어 호환성을 유지/.test(read('docs/dev-reports/2026-07-25-910-app-client-identity.md')), false)
  assert.equal(/0\.1\.0-dev/.test(read('services/dashboard-service/README.md')), true)
})
