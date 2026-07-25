'use strict'

const DEVELOPMENT_VERSION_PATTERN = /^(\d{4})\/(\d{2})\/(\d{2})-([1-9][0-9]*)$/
const DEVELOPMENT_FALLBACK_VERSION = '0.1.0-dev'
const RELEASE_BUILD_ENV = 'SAMHAN_RELEASE_BUILD'

/**
 * 빌드 산출물에 넣을 개발 버전을 해석한다.
 *
 * 패키지 semver는 Electron/Expo 도구가 요구하는 메타데이터로 남기고,
 * 릴리스 산출물은 릴리스 파이프라인이 명시한 YYYY/MM/DD-번호를 사용한다.
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
  resolveBuildAppVersion,
  validateDevelopmentVersion,
}
