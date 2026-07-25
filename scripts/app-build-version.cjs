'use strict'

const DEVELOPMENT_VERSION_PATTERN = /^(\d{4})\/(\d{2})\/(\d{2})-([1-9][0-9]*)$/

/**
 * 빌드 산출물에 넣을 개발 버전을 해석한다.
 *
 * 패키지 semver는 Electron/Expo 도구가 요구하는 메타데이터로 남기고,
 * 업데이트 게이트가 전송할 값은 이 함수가 만든 YYYY/MM/DD-번호로 통일한다.
 * 명시값이 없을 때도 0.0.0으로 조용히 떨어지지 않도록 KST 날짜 기반 값을 만들고 경고한다.
 */
function resolveBuildAppVersion({
  env = process.env,
  variable = 'VITE_APP_VERSION',
  now = new Date(),
  warn = console.warn,
} = {}) {
  const injected = String(env[variable] ?? '').trim()
  if (injected) {
    validateDevelopmentVersion(injected, variable)
    return injected
  }

  const sequence = String(env.SAMHAN_BUILD_NUMBER ?? env.EXPO_BUILD_NUMBER ?? '1').trim()
  if (!/^[1-9][0-9]*$/.test(sequence)) {
    throw new Error(`SAMHAN_BUILD_NUMBER는 1 이상의 숫자여야 합니다: ${sequence}`)
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const generated = `${values.year}/${values.month}/${values.day}-${sequence}`
  warn(`[Samhan] 개발 버전 주입값(${variable})이 없어 ${generated}을 자동 생성했습니다. 배포 릴리스에는 명시 주입값을 사용하십시오.`)
  return generated
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
  DEVELOPMENT_VERSION_PATTERN,
  resolveBuildAppVersion,
  validateDevelopmentVersion,
}
