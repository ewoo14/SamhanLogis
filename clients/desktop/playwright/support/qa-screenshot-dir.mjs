import fs from 'node:fs'
import path from 'node:path'

/**
 * Playwright를 직접 실행하는 ESM 캡처 유틸리티용 QA 출력 경로 resolver.
 * 기존 외부 캡처 스크립트의 resolveQaShotsDir 계약은 유지하고, mock은
 * resolveMockQaShotsDir를 사용한다.
 */
export function resolveQaShotsDir(committedDir) {
  const override = process.env['QA_SHOTS_DIR']
  const dir = override && override.trim().length > 0
    ? path.resolve(override)
    : path.join(committedDir, '_local')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function hasExplicitOverwriteIntent() {
  return ['1', 'true', 'yes'].includes(String(process.env['QA_ALLOW_OVERWRITE'] ?? '').trim().toLowerCase())
}

function isWithin(parentDir, candidateDir) {
  const relative = path.relative(parentDir, candidateDir)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

export function resolveMockQaShotsDir(committedDir) {
  const committed = path.resolve(committedDir)
  const override = process.env['QA_SHOTS_DIR']?.trim()
  const dir = override ? path.resolve(override) : path.join(committed, '_local')

  if (override && isWithin(committed, dir) && !hasExplicitOverwriteIntent()) {
    throw new Error(
      `[QA 출력 경로 가드] mock 캡처의 커밋 경로 overwrite 시도를 차단했습니다: ${dir}. ` +
        '명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.',
    )
  }

  fs.mkdirSync(dir, { recursive: true })
  return dir
}
