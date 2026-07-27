import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Playwright를 직접 실행하는 ESM 캡처 유틸리티용 QA 출력 경로 resolver.
 * clients/desktop/playwright/support/qa-screenshot-dir.ts 와 동일 계약이다 —
 * 기본값은 `<committedDir>/_local`, `QA_SHOTS_DIR` 가 레포의 커밋 QA 증거 루트
 * (docs/qa/** 전체 — 자기 슬러그·타 슬러그·루트 자체 불문) 를 가리키면
 * `QA_ALLOW_OVERWRITE=1` 없이는 차단한다(2026-07-27 이슈 #863 D-3, real-QA·mock
 * 공통 단일 함수 — 자세한 배경은 .ts 파일 헤더 주석 참조).
 */
const _dirname = path.dirname(fileURLToPath(import.meta.url))

/** 이 파일(clients/desktop/playwright/support) 기준 레포의 커밋 QA 증거 루트 전체. */
const DOCS_QA_ROOT = path.resolve(_dirname, '../../../../docs/qa')

function hasExplicitOverwriteIntent() {
  return ['1', 'true', 'yes'].includes(String(process.env['QA_ALLOW_OVERWRITE'] ?? '').trim().toLowerCase())
}

/** 존재하지 않는 하위 경로도 기존 부모의 junction/symlink를 물리 경로로 풀어낸다. */
function resolvePhysicalPath(candidateDir) {
  let current = path.resolve(candidateDir)
  const missingParts = []

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) return current
    missingParts.unshift(path.basename(current))
    current = parent
  }

  return path.join(fs.realpathSync.native(current), ...missingParts)
}

function normalizePhysicalPath(candidateDir) {
  const isWindows = process.platform === 'win32'
  const withoutExtendedPrefix = isWindows && candidateDir.startsWith('\\\\?\\UNC\\')
    ? `\\\\${candidateDir.slice('\\\\?\\UNC\\'.length)}`
    : isWindows && candidateDir.startsWith('\\\\?\\')
      ? candidateDir.slice('\\\\?\\'.length)
      : candidateDir
  const normalized = path.normalize(withoutExtendedPrefix)
  const root = path.parse(normalized).root
  const comparable = normalized === root ? normalized : normalized.replace(/[\\/]+$/, '')
  return isWindows ? comparable.toLowerCase() : comparable
}

function isWithin(parentDir, candidateDir) {
  const relative = path.relative(parentDir, candidateDir)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function isWithinPhysical(parentDir, candidateDir) {
  return isWithin(
    normalizePhysicalPath(resolvePhysicalPath(parentDir)),
    normalizePhysicalPath(resolvePhysicalPath(candidateDir)),
  )
}

export function resolveQaShotsDir(committedDir) {
  const committed = path.resolve(committedDir)
  const override = process.env['QA_SHOTS_DIR']
  const trimmed = override && override.trim().length > 0 ? override.trim() : undefined
  const dir = trimmed ? path.resolve(trimmed) : path.join(committed, '_local')

  if (trimmed && isWithinPhysical(DOCS_QA_ROOT, dir) && !hasExplicitOverwriteIntent()) {
    throw new Error(
      `[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: ${dir}. ` +
        '명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.',
    )
  }

  fs.mkdirSync(dir, { recursive: true })
  return dir
}
