const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
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

test('두 릴리스 wrapper가 실제 package semver를 builder transformer에 전달한다', async () => {
  const release = createReleaseBuildEnvironment({
    env: { VITE_APP_VERSION: '2026/07/30-2' },
  })
  const builderArgs = createElectronBuilderVersionArgs(release.packageVersion)
  const versionOverride = builderArgs
    .find((argument) => argument.startsWith('--config.extraMetadata.version='))
    ?.split('=', 2)[1]

  for (const relativePath of [
    'clients/desktop',
    'clients/arologis-desktop',
  ]) {
    const projectDir = resolve(__dirname, '..', relativePath)
    const appBuilderLib = resolve(projectDir, 'node_modules', 'app-builder-lib')
    const { getConfig } = require(resolve(appBuilderLib, 'out/util/config/config.js'))
    const { createTransformer } = require(resolve(appBuilderLib, 'out/fileTransformer.js'))
    const config = await getConfig(
      projectDir,
      null,
      versionOverride == null ? null : { extraMetadata: { version: versionOverride } },
    )
    const transformedPackageJson = await createTransformer(
      projectDir,
      config,
      config.extraMetadata,
    )(join(projectDir, 'package.json'))

    assert.equal(
      JSON.parse(transformedPackageJson).version,
      release.packageVersion,
      relativePath,
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
