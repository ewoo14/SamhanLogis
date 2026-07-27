const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { readdirSync, readFileSync } = require('node:fs')
const { dirname, join, resolve } = require('node:path')
const { test } = require('node:test')

const DESKTOP_DIR = resolve(__dirname, '..')
const REPOSITORY_DIR = resolve(DESKTOP_DIR, '../..')
// 🚨 2026-07-27 재수렴 6차 D-2 — **최상위에서 resolve 하지 않는다.**
// 이 파일에는 빌드 산출물 계약(=electron-vite 필요)과 문서/소스 본문 계약(=node 빌트인만
// 필요)이 함께 있다. 최상위 `require.resolve('electron-vite')` 는 `npm ci` 를 하지 않은
// 경량 러너에서 즉시 MODULE_NOT_FOUND 로 파일 전체를 죽여서, 문서 계약만 돌리는
// docs-guard.yml 잡을 원천적으로 불가능하게 만들었다(실측: 레포 루트에서 THROWS).
// 빌드가 필요한 테스트가 실제로 호출할 때만 resolve 한다.
function electronViteBin() {
  return resolve(dirname(require.resolve('electron-vite')), '..', 'bin', 'electron-vite.js')
}

function read(relativePath) {
  return readFileSync(join(REPOSITORY_DIR, relativePath), 'utf8')
}

function electronBuild(envOverrides) {
  const result = spawnSync(process.execPath, [electronViteBin(), 'build'], {
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
  assert.match(output, /CURRENT_VERSION\s*=\s*resolveBuildAppVersion\(\s*["']2026\/07\/25-91001["']/)
  assert.equal(output.includes('CURRENT_VERSION = resolveBuildAppVersion("0.0.0")'), false)

  const developmentOutput = electronBuild({ VITE_APP_VERSION: '', SAMHAN_RELEASE_BUILD: '' })
  assert.match(developmentOutput, /0\.1\.0-dev/)
  assert.equal(developmentOutput.includes('0.0.0'), false)

  const releaseResult = spawnSync(process.execPath, [electronViteBin(), 'build'], {
    cwd: DESKTOP_DIR,
    env: { ...process.env, VITE_APP_VERSION: '', SAMHAN_RELEASE_BUILD: '1' },
    encoding: 'utf8',
  })
  assert.notEqual(releaseResult.status, 0, `${releaseResult.error ?? ''}\n${releaseResult.stdout}\n${releaseResult.stderr}`)
  assert.match(`${releaseResult.stdout}\n${releaseResult.stderr}`, /릴리스.*명시|VITE_APP_VERSION.*명시/)
})

test('build:win은 무주입 릴리스 산출물을 만들기 전에 명시 버전 오류로 중단한다', () => {
  const isWindows = process.platform === 'win32'
  const command = isWindows ? process.env.ComSpec : 'npm'
  const args = isWindows ? ['/d', '/s', '/c', 'npm run build:win'] : ['run', 'build:win']
  const result = spawnSync(command, args, {
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      VITE_APP_VERSION: '',
      SAMHAN_RELEASE_BUILD: '',
      BUILD_ENV: '',
    },
    encoding: 'utf8',
  })
  const output = `${result.stdout}\n${result.stderr}`
  assert.notEqual(result.status, 0, output)
  assert.match(output, /\[release-build\].*VITE_APP_VERSION.*명시/, `${result.error ?? ''}\n${output}`)
  assert.equal(output.includes('[build-legacy-estimate]'), false)
})

test('PWA·Capacitor 릴리스 wrapper도 무주입 sentinel 산출물을 허용하지 않는다', () => {
  for (const scriptName of ['build:web:release', 'build:capacitor:release']) {
    const command = process.platform === 'win32' ? process.env.ComSpec : 'npm'
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', `npm run ${scriptName}`]
      : ['run', scriptName]
    const result = spawnSync(command, args, {
      cwd: DESKTOP_DIR,
      env: {
        ...process.env,
        VITE_APP_VERSION: '',
        SAMHAN_RELEASE_BUILD: '',
        BUILD_ENV: '',
      },
      encoding: 'utf8',
    })
    const output = `${result.stdout}\n${result.stderr}`
    assert.notEqual(result.status, 0, `${scriptName}\n${result.error ?? ''}\n${output}`)
    assert.match(output, /릴리스.*명시|VITE_APP_VERSION.*명시/, `${scriptName}\n${output}`)
  }
})

test('Electron 직접 포장과 Capacitor sync도 릴리스 표식 없는 산출물을 거부한다', () => {
  const builderConfig = read('clients/desktop/electron-builder.yml')
  assert.match(builderConfig, /beforePack:\s*scripts\/validate-desktop-release\.cjs/)
  assert.match(builderConfig, /SAMHAN_RELEASE_ARTIFACT_VERSION/)

  const capacitorConfig = read('clients/desktop/capacitor.config.ts')
  assert.match(capacitorConfig, /dist\/capacitor\/\.samhan-release\.json/)
  assert.match(capacitorConfig, /CAPACITOR_SYNC_MODE/)
  assert.match(read('clients/desktop/package.json'), /"cap:sync":\s*"npm run build:capacitor && node \.\.\/\.\.\/scripts\/sync-capacitor\.cjs development"/)
  assert.match(read('clients/desktop/package.json'), /"cap:sync:release":\s*"npm run build:capacitor:release && node \.\.\/\.\.\/scripts\/sync-capacitor\.cjs release"/)
})

test('Electron 직접 포장 검증기는 공통 릴리스 버전 형식 검증기를 호출한다', () => {
  const validator = read('clients/desktop/scripts/validate-desktop-release.cjs')
  assert.match(validator, /validateDevelopmentVersion/)
  assert.match(validator, /app-build-version\.cjs/)
})

test('Capacitor sync wrapper는 개발·릴리스 모드를 명시적으로 전달한다', () => {
  const { createSyncEnvironment } = require(resolve(REPOSITORY_DIR, 'scripts/sync-capacitor.cjs'))
  assert.equal(createSyncEnvironment('development', {}).CAPACITOR_SYNC_MODE, 'development')
  assert.equal(createSyncEnvironment('release', {}).CAPACITOR_SYNC_MODE, 'release')
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

test('Expo EAS preview·production 프로파일은 명시 버전 없이 릴리스 산출물을 허용하지 않는다', () => {
  const apps = [
    ['clients/mobile/eas.json', 'clients/mobile/app.config.js'],
    ['clients/mobile-staff/eas.json', 'clients/mobile-staff/app.config.js'],
    ['clients/arologis-mobile/eas.json', 'clients/arologis-mobile/app.config.js'],
  ]
  for (const [easPath, appConfigPath] of apps) {
    const eas = JSON.parse(read(easPath))
    for (const profile of ['preview', 'production']) {
      assert.equal(eas.build[profile].env.BUILD_ENV, profile, `${easPath}:${profile}`)
      const script = [
        `const cfg = require(${JSON.stringify(join(REPOSITORY_DIR, appConfigPath))})`,
        'process.stdout.write(String(cfg.expo.extra.appVersion))',
      ].join(';')
      const result = spawnSync(process.execPath, ['-e', script], {
        env: {
          ...process.env,
          BUILD_ENV: profile,
          EXPO_PUBLIC_APP_VERSION: '',
        },
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0, `${easPath}:${profile}\n${result.stdout}\n${result.stderr}`)
      assert.match(`${result.stdout}\n${result.stderr}`, /EXPO_PUBLIC_APP_VERSION.*명시/, `${easPath}:${profile}`)
    }
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
