const assert = require('node:assert/strict')
const fs = require('node:fs')
const { readFileSync } = fs
const childProcess = require('node:child_process')
const { resolve } = require('node:path')
const { test } = require('node:test')
const {
  DEVELOPMENT_FALLBACK_VERSION,
  RELEASE_BUILD_ENV,
  RELEASE_ARTIFACT_VERSION_ENV,
  RELEASE_PACKAGE_VERSION_ENV,
  createReleaseBuildEnvironment,
  createElectronBuilderVersionArgs,
  resolveBuildAppVersion,
} = require('./app-build-version.cjs')

function numericSemverGreater(left, right) {
  const leftParts = left.split('.').map(BigInt)
  const rightParts = right.split('.').map(BigInt)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index]
  }
  return false
}

test('무주입 개발·CI 빌드는 릴리스가 아닌 고정 sentinel을 사용한다', () => {
  const first = resolveBuildAppVersion({ env: {} })
  const second = resolveBuildAppVersion({ env: {} })

  assert.equal(first, DEVELOPMENT_FALLBACK_VERSION)
  assert.equal(second, DEVELOPMENT_FALLBACK_VERSION)
  assert.notEqual(first, '0.0.0')
  assert.match(first, /^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/)
})

test('릴리스 모드의 무주입 빌드는 호스트 날짜와 무관하게 실패한다', () => {
  assert.throws(
    () => resolveBuildAppVersion({
      env: { [RELEASE_BUILD_ENV]: '1' },
    }),
    /릴리스.*명시|VITE_APP_VERSION|EXPO_PUBLIC_APP_VERSION/,
  )
})

test('production·preview 빌드도 릴리스 주입 없이 sentinel을 사용하지 않는다', () => {
  for (const buildEnv of ['production', 'preview']) {
    assert.throws(
      () => resolveBuildAppVersion({ env: { BUILD_ENV: buildEnv } }),
      /릴리스.*명시|VITE_APP_VERSION/,
      buildEnv,
    )
  }
})

test('명시 주입 릴리스는 개발 형식 버전을 그대로 사용한다', () => {
  assert.equal(
    resolveBuildAppVersion({
      env: { [RELEASE_BUILD_ENV]: '1', VITE_APP_VERSION: '2026/07/25-91002' },
    }),
    '2026/07/25-91002',
  )
})

test('데스크톱 릴리스 wrapper는 검증된 버전과 릴리스 모드를 하위 빌드에 전달한다', () => {
  const result = createReleaseBuildEnvironment({
    env: { VITE_APP_VERSION: '2026/07/25-91003', VITE_MOCK_MODE: '1' },
    variable: 'VITE_APP_VERSION',
  })

  assert.equal(result.appVersion, '2026/07/25-91003')
  assert.equal(result.packageVersion, '1.20260725.91003')
  assert.equal(result.env.VITE_APP_VERSION, '2026/07/25-91003')
  assert.equal(result.env[RELEASE_BUILD_ENV], '1')
  assert.equal(result.env[RELEASE_ARTIFACT_VERSION_ENV], '2026-07-25-91003')
  assert.equal(result.env[RELEASE_PACKAGE_VERSION_ENV], '1.20260725.91003')
  assert.equal(result.env.VITE_MOCK_MODE, '0')
})

test('날짜 버전만 올라간 후속 릴리스도 Electron updater 비교 버전이 올라간다', () => {
  const first = createReleaseBuildEnvironment({
    env: { VITE_APP_VERSION: '2026/07/30-2' },
  })
  const sameDayFollowUp = createReleaseBuildEnvironment({
    env: { VITE_APP_VERSION: '2026/07/30-3' },
  })
  const nextDay = createReleaseBuildEnvironment({
    env: { VITE_APP_VERSION: '2026/07/31-1' },
  })

  assert.equal(first.env[RELEASE_PACKAGE_VERSION_ENV], '1.20260730.2')
  assert.equal(sameDayFollowUp.env[RELEASE_PACKAGE_VERSION_ENV], '1.20260730.3')
  assert.equal(nextDay.env[RELEASE_PACKAGE_VERSION_ENV], '1.20260731.1')
  assert.equal(
    numericSemverGreater(
      sameDayFollowUp.env[RELEASE_PACKAGE_VERSION_ENV],
      first.env[RELEASE_PACKAGE_VERSION_ENV],
    ),
    true,
  )
  assert.equal(
    numericSemverGreater(
      nextDay.env[RELEASE_PACKAGE_VERSION_ENV],
      sameDayFollowUp.env[RELEASE_PACKAGE_VERSION_ENV],
    ),
    true,
  )
})

test('날짜 semver는 같은 날 9→10과 월·연 경계에서도 단조 증가한다', () => {
  const appVersions = [
    '2026/07/30-1',
    '2026/07/30-2',
    '2026/07/30-9',
    '2026/07/30-10',
    '2026/07/31-1',
    '2026/08/01-1',
    '2026/12/31-9',
    '2027/01/01-1',
  ]
  const packageVersions = appVersions.map((appVersion) =>
    createReleaseBuildEnvironment({ env: { VITE_APP_VERSION: appVersion } })
      .env[RELEASE_PACKAGE_VERSION_ENV])

  assert.deepEqual(packageVersions, [
    '1.20260730.1',
    '1.20260730.2',
    '1.20260730.9',
    '1.20260730.10',
    '1.20260731.1',
    '1.20260801.1',
    '1.20261231.9',
    '1.20270101.1',
  ])
  for (let index = 1; index < packageVersions.length; index += 1) {
    assert.equal(
      numericSemverGreater(packageVersions[index], packageVersions[index - 1]),
      true,
      `${packageVersions[index - 1]} < ${packageVersions[index]}`,
    )
  }
})

test('같은 날짜·순번 입력은 같은 내부 semver를 만든다', () => {
  const first = createReleaseBuildEnvironment({
    env: { VITE_APP_VERSION: '2026/07/30-10' },
  })
  const second = createReleaseBuildEnvironment({
    env: { VITE_APP_VERSION: '2026/07/30-10' },
  })

  assert.equal(first.packageVersion, '1.20260730.10')
  assert.equal(second.packageVersion, first.packageVersion)
})

test('두 Electron builder 설정에 env 리터럴 버전이 남지 않는다', () => {
  for (const relativePath of [
    'clients/desktop/electron-builder.yml',
    'clients/arologis-desktop/electron-builder.yml',
  ]) {
    const config = readFileSync(resolve(__dirname, '..', relativePath), 'utf8')
    assert.doesNotMatch(config, /\$\{env\.SAMHAN_RELEASE_PACKAGE_VERSION\}/, relativePath)
  }
})

// 이 guard 잡은 데스크톱 node_modules를 설치하지 않는다. app-builder-lib의 private 파일을
// require하는 대신, 두 실제 wrapper를 로드해 builder CLI 경계의 인자를 검증한다.
function captureReleaseBuilderInvocation(relativeScript, appVersion) {
  const calls = []
  const repoRoot = resolve(__dirname, '..')
  const scriptPath = resolve(__dirname, relativeScript)
  const environmentKeys = ['VITE_APP_VERSION', 'AROLOGIS_UPDATE_URL']
  const previousEnvironment = new Map(
    environmentKeys.map((key) => [key, process.env[key]]),
  )
  const previousExitCode = process.exitCode
  const previousCwd = process.cwd()
  const originalSpawnSync = childProcess.spawnSync
  const originalExistsSync = fs.existsSync
  const originalReaddirSync = fs.readdirSync
  const originalReadFileSync = fs.readFileSync

  const isRendererFixture = (path) => {
    const normalizedPath = String(path).replaceAll('\\', '/')
    return normalizedPath.includes('/out/renderer')
  }

  try {
    process.chdir(repoRoot)
    process.env.VITE_APP_VERSION = appVersion
    process.env.AROLOGIS_UPDATE_URL = 'https://updates.invalid/arologis'
    childProcess.spawnSync = (command, args, options) => {
      calls.push({ command, args, options })
      return { status: 0 }
    }
    fs.existsSync = (path) => {
      if (String(path).replaceAll('\\', '/').endsWith('/out/renderer')) return true
      return originalExistsSync(path)
    }
    fs.readdirSync = (directory, options) => {
      if (!isRendererFixture(directory)) return originalReaddirSync(directory, options)
      if (options?.withFileTypes) {
        return [{ name: 'version-fixture.js', isDirectory: () => false }]
      }
      return ['version-fixture.js']
    }
    fs.readFileSync = (path, encoding) => {
      if (isRendererFixture(path)) {
        return `const CURRENT_VERSION = resolveBuildAppVersion("${appVersion}")`
      }
      return originalReadFileSync(path, encoding)
    }

    delete require.cache[require.resolve(scriptPath)]
    require(scriptPath)
  } finally {
    delete require.cache[require.resolve(scriptPath)]
    childProcess.spawnSync = originalSpawnSync
    fs.existsSync = originalExistsSync
    fs.readdirSync = originalReaddirSync
    fs.readFileSync = originalReadFileSync
    process.chdir(previousCwd)
    for (const [key, value] of previousEnvironment) {
      if (value == null) delete process.env[key]
      else process.env[key] = value
    }
    process.exitCode = previousExitCode
  }

  return calls
}

test('두 릴리스 wrapper가 실제 package semver를 builder CLI transformer 입력으로 전달한다', () => {
  const release = createReleaseBuildEnvironment({
    env: { VITE_APP_VERSION: '2026/07/30-2' },
  })
  const builderArgs = createElectronBuilderVersionArgs(release.packageVersion)

  for (const [relativeScript, relativeProject] of [
    ['build-desktop-release.cjs', 'clients/desktop'],
    ['build-arologis-desktop-release.cjs', 'clients/arologis-desktop'],
  ]) {
    const calls = captureReleaseBuilderInvocation(relativeScript, release.appVersion)
    const builderCall = calls.find(({ args }) => args.includes(builderArgs[0]))
    assert.ok(builderCall, `${relativeProject} release wrapper의 builder 호출이 없습니다.`)
    assert.equal(
      builderCall.command,
      process.execPath,
      relativeProject,
    )
    assert.equal(builderCall.args.at(-2), '--win', relativeProject)
    assert.equal(builderCall.args.at(-1), builderArgs[0], relativeProject)
    assert.equal(builderCall.args.at(-1).split('=', 2)[1], release.packageVersion, relativeProject)
    assert.equal(
      builderCall.options.env[RELEASE_PACKAGE_VERSION_ENV],
      release.packageVersion,
      relativeProject,
    )
  }

  assert.deepEqual(builderArgs, [
    '--config.extraMetadata.version=1.20260730.2',
  ])
})

test('electron-builder package semver가 없거나 env 리터럴이면 조용히 진행하지 않는다', () => {
  for (const packageVersion of ['', '${env.SAMHAN_RELEASE_PACKAGE_VERSION}', '20260730.2.0']) {
    assert.throws(
      () => createElectronBuilderVersionArgs(packageVersion),
      /SAMHAN_RELEASE_PACKAGE_VERSION.*semver/,
      packageVersion,
    )
  }
})
