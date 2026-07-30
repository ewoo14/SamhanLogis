const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const {
  DEVELOPMENT_FALLBACK_VERSION,
  RELEASE_BUILD_ENV,
  RELEASE_ARTIFACT_VERSION_ENV,
  RELEASE_PACKAGE_VERSION_ENV,
  createReleaseBuildEnvironment,
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
  assert.equal(result.packageVersion, '20260725.91003.0')
  assert.equal(result.env.VITE_APP_VERSION, '2026/07/25-91003')
  assert.equal(result.env[RELEASE_BUILD_ENV], '1')
  assert.equal(result.env[RELEASE_ARTIFACT_VERSION_ENV], '2026-07-25-91003')
  assert.equal(result.env[RELEASE_PACKAGE_VERSION_ENV], '20260725.91003.0')
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

  assert.equal(first.env[RELEASE_PACKAGE_VERSION_ENV], '20260730.2.0')
  assert.equal(sameDayFollowUp.env[RELEASE_PACKAGE_VERSION_ENV], '20260730.3.0')
  assert.equal(nextDay.env[RELEASE_PACKAGE_VERSION_ENV], '20260731.1.0')
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

test('두 Electron builder가 포장 package.json에 내부 비교 버전을 주입한다', () => {
  for (const relativePath of [
    'clients/desktop/electron-builder.yml',
    'clients/arologis-desktop/electron-builder.yml',
  ]) {
    const config = readFileSync(resolve(__dirname, '..', relativePath), 'utf8')
    assert.match(
      config,
      /extraMetadata:\s+version:\s+\$\{env\.SAMHAN_RELEASE_PACKAGE_VERSION\}/,
      relativePath,
    )
  }
})
