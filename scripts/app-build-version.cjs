'use strict'

const DEVELOPMENT_VERSION_PATTERN = /^(\d{4})\/(\d{2})\/(\d{2})-([1-9][0-9]*)$/
const DEVELOPMENT_FALLBACK_VERSION = '0.1.0-dev'
const RELEASE_BUILD_ENV = 'SAMHAN_RELEASE_BUILD'
const RELEASE_ARTIFACT_VERSION_ENV = 'SAMHAN_RELEASE_ARTIFACT_VERSION'
const RELEASE_PACKAGE_VERSION_ENV = 'SAMHAN_RELEASE_PACKAGE_VERSION'

/**
 * 빌드 산출물에 넣을 개발 버전을 해석한다.
 *
 * 패키지 semver는 Electron/Expo 도구가 요구하는 메타데이터로 남기고,
 * 릴리스 산출물의 renderer와 정책 정본은 릴리스 파이프라인이 명시한 YYYY/MM/DD-번호를 사용한다.
 * 개발·CI 산출물은 등록할 수 없는 고정 sentinel을 사용해 호스트 시계가 릴리스 순서를 만들지
 * 못하게 한다. `SAMHAN_RELEASE_BUILD=1` 또는 `BUILD_ENV=production|preview`인 릴리스 모드에서는
 * sentinel fallback 없이 명시 주입을 요구한다.
 */
function resolveBuildAppVersion({
  env = process.env,
  variable = 'VITE_APP_VERSION',
} = {}) {
  const injected = String(env[variable] ?? '').trim()
  if (!injected) {
    if (isReleaseBuild(env)) {
      throw new Error(
        `${variable}에 YYYY/MM/DD-{번호} 형식의 릴리스 버전을 명시적으로 주입해야 합니다. `
        + '릴리스 모드에서는 개발 sentinel을 사용하지 않습니다.',
      )
    }
    return DEVELOPMENT_FALLBACK_VERSION
  }

  validateDevelopmentVersion(injected, variable)
  return injected
}

/**
 * 데스크톱 릴리스 하위 프로세스에 검증된 버전과 릴리스 모드를 전달한다.
 * 릴리스 명령은 개발 sentinel을 사용할 수 없으므로 공통 resolver를 릴리스 모드로
 * 고정한 뒤, 정규화한 버전을 자식 프로세스 환경에도 다시 기록한다.
 */
function createReleaseBuildEnvironment({
  env = process.env,
  variable = 'VITE_APP_VERSION',
} = {}) {
  const releaseEnv = {
    ...env,
    [RELEASE_BUILD_ENV]: '1',
  }
  const appVersion = resolveBuildAppVersion({ env: releaseEnv, variable })
  const packageVersion = resolveReleasePackageVersion(appVersion)
  return {
    appVersion,
    packageVersion,
    env: {
      ...releaseEnv,
      [variable]: appVersion,
      [RELEASE_ARTIFACT_VERSION_ENV]: appVersion.replaceAll('/', '-'),
      [RELEASE_PACKAGE_VERSION_ENV]: packageVersion,
      VITE_MOCK_MODE: '0',
    },
  }
}

/**
 * electron-updater가 비교할 내부 semver를 날짜 버전에서 만든다.
 * major=1, minor=YYYYMMDD, patch=당일 순번으로 두어 날짜와 같은 날짜의 후속 릴리스를 모두 구분한다.
 * renderer·정책 서버에는 이 값을 노출하지 않고 YYYY/MM/DD-번호를 유지한다.
 */
function resolveReleasePackageVersion(appVersion) {
  const match = DEVELOPMENT_VERSION_PATTERN.exec(String(appVersion ?? '').trim())
  if (!match) {
    validateDevelopmentVersion(String(appVersion ?? '').trim(), 'VITE_APP_VERSION')
  }
  return `1.${match[1]}${match[2]}${match[3]}.${match[4]}`
}

/**
 * electron-builder의 extraMetadata.version에 릴리스 semver를 명시 주입한다.
 * electron-builder 25는 YAML extraMetadata 안의 env 표현식을 확장하지 않으므로
 * CLI config override로 전달해야 포장 package.json과 AppInfo가 같은 버전을 사용한다.
 */
function createElectronBuilderVersionArgs(packageVersion) {
  const normalized = String(packageVersion ?? '').trim()
  if (!/^1\.\d{8}\.[1-9][0-9]*$/.test(normalized)) {
    throw new Error(
      `${RELEASE_PACKAGE_VERSION_ENV}에 유효한 릴리스 semver를 명시해야 합니다: ${packageVersion ?? ''}`,
    )
  }
  return [`--config.extraMetadata.version=${normalized}`]
}

function isReleaseBuild(env) {
  const buildEnv = String(env.BUILD_ENV ?? '').trim().toLowerCase()
  return /^(1|true|yes)$/i.test(String(env[RELEASE_BUILD_ENV] ?? '').trim())
    || buildEnv === 'production'
    || buildEnv === 'preview'
}

function validateDevelopmentVersion(value, variable) {
  const match = DEVELOPMENT_VERSION_PATTERN.exec(value)
  if (!match) {
    throw new Error(`${variable}는 YYYY/MM/DD-{번호} 형식이어야 합니다: ${value}`)
  }
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`)
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() + 1 !== Number(match[2])
    || date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`${variable}의 날짜가 유효하지 않습니다: ${value}`)
  }
}

module.exports = {
  DEVELOPMENT_FALLBACK_VERSION,
  DEVELOPMENT_VERSION_PATTERN,
  RELEASE_BUILD_ENV,
  RELEASE_ARTIFACT_VERSION_ENV,
  RELEASE_PACKAGE_VERSION_ENV,
  createReleaseBuildEnvironment,
  createElectronBuilderVersionArgs,
  resolveReleasePackageVersion,
  resolveBuildAppVersion,
  validateDevelopmentVersion,
}
