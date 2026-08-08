/**
 * QA 라이브 캡처 저장 경로 결정 (CommonJS 버전, 루트 공유).
 *
 * clients/desktop/playwright/support/qa-screenshot-dir.ts 와 동일 계약이다 — 그 파일은
 * clients/desktop/playwright 패키지 전용이라, 그 밖(clients/*\/scripts, 루트 scripts/,
 * tools/manual-capture/)의 .cjs 캡처 스크립트는 이 루트 공유 버전을 쓴다(2026-07-26 하네스
 * 재수렴 라운드 G3, tools/manual-capture 는 2026-07-27 H1 흡수에서 편입).
 *
 * 기본값은 `<committedDir>/_local` 이고(#938 D-1 확정 계약, real-QA·mock 공통),
 * `QA_SHOTS_DIR` 가 레포의 커밋 QA 증거 루트(docs/qa/** 전체 — 자기 슬러그·타 슬러그·
 * 루트 자체 불문)를 가리키면 `QA_ALLOW_OVERWRITE=1` 없이는 차단한다(2026-07-27 이슈
 * #863 D-3 — 자세한 배경은 .ts 파일 헤더 주석 참조).
 *
 * @param {string} committedDir 기존 커밋 캡처가 있는(또는 있을) 절대경로
 * @returns {string} 이번 실행에서 실제로 스크린샷을 써야 할 절대경로(디렉토리는 이미 생성됨)
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/** 이 파일(scripts/lib) 기준 레포의 커밋 QA 증거 루트 전체. */
/** 개별 증거 루트를 열거하지 않고 모든 docs 하위 증거 루트를 보호하는 축. */
const QA_EVIDENCE_AXIS = path.resolve(__dirname, '../../docs')

function hasExplicitOverwriteIntent() {
  return ['1', 'true', 'yes'].includes(String(process.env['QA_ALLOW_OVERWRITE'] ?? '').trim().toLowerCase())
}

function isPathMissingError(error) {
  return error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

function throwPhysicalPathError(candidateDir, error) {
  const reason = error instanceof Error ? error.message : String(error)
  throw new Error(`[QA 출력 경로 가드] 물리 경로 조회에 실패했습니다: ${candidateDir}: ${reason}`, { cause: error })
}

function isRemoteUncPath(candidateDir) {
  if (process.platform !== 'win32') return false
  const match = /^\\\\([^\\]+)\\/.exec(candidateDir)
  if (!match) return false
  const host = match[1].toLowerCase()
  const isKnownAlias = host === 'localhost' || host === '127.0.0.1' || host === '.' || host === os.hostname().toLowerCase()
  return !isKnownAlias && !getSelfLanAddresses().includes(host)
}

/** 존재하지 않는 하위 경로도 기존 부모의 junction/symlink를 물리 경로로 풀어낸다. */
function resolvePhysicalPath(candidateDir) {
  if (isRemoteUncPath(candidateDir)) return path.resolve(candidateDir)
  let current = path.resolve(candidateDir)
  const missingParts = []

  while (true) {
    try {
      fs.lstatSync(current)
    } catch (error) {
      if (!isPathMissingError(error)) throwPhysicalPathError(candidateDir, error)
      const parent = path.dirname(current)
      if (parent === current) throwPhysicalPathError(candidateDir, error)
      missingParts.unshift(path.basename(current))
      current = parent
      continue
    }

    try {
      return path.join(fs.realpathSync.native(current), ...missingParts)
    } catch (error) {
      throwPhysicalPathError(candidateDir, error)
    }
  }
}

/**
 * 이 머신에 실제로 바인딩된 non-internal IPv4 주소 전부(로컬 전용 조회 — 네트워크
 * I/O 없음, os.networkInterfaces() 는 OS 가 캐싱한 어댑터 목록을 즉시 반환한다).
 * 2026-07-28 R5 재수렴 결함3 — 고정 별칭 목록(localhost/127.0.0.1/hostname)은
 * "열거"라서 어댑터가 늘 때마다 다시 뚫린다(실측: \\<LAN IP>\D$\... 가 10개
 * resolver 사본 전부를 통과했다). 원격 호스트에 대한 fs.statSync 신원 대조는
 * 도달 불가능한 호스트에서 실측 8초+ 행(hang) 이 재현돼 채택하지 않았다 — 로컬
 * 인터페이스 조회는 네트워크를 타지 않아 그 위험이 없다.
 */
function getSelfLanAddresses() {
  const addresses = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4') addresses.push(entry.address.toLowerCase())
    }
  }
  if (addresses.length === 0) {
    throw new Error('[QA 출력 경로 가드] 자기 LAN 주소 조회 결과가 비어 있어 UNC 물리 식별을 계속할 수 없습니다')
  }
  return addresses
}

/**
 * 자기 자신을 가리키는 UNC admin-share(`\\localhost\D$\...`, `\\127.0.0.1\D$\...`,
 * `\\<컴퓨터명>\D$\...`, `\\<자기 LAN IP>\D$\...`)를 등가의 드라이브 문자 표기
 * (`D:\...`)로 통일한다(2026-07-28 R4 결함3 + R5 재수렴 결함3) — 이 변환이 없으면
 * 같은 물리 경로를 UNC 로 표기했을 때 DOCS_QA_ROOT(항상 드라이브 문자로 계산됨)와
 * 문자열이 달라 포함 판정이 통과해버린다. 다른 호스트를 가리키는 admin-share 는
 * 실제로 다른 물리 머신이므로 변환하지 않는다.
 */
function normalizeUncAdminShareToDrive(candidateDir) {
  const match = /^\\\\([^\\]+)\\([A-Za-z])\$(\\.*)?$/.exec(candidateDir)
  if (!match) return candidateDir
  const host = (match[1] ?? '').toLowerCase()
  const isKnownAlias = host === 'localhost' || host === '127.0.0.1' || host === '.' || host === os.hostname().toLowerCase()
  const isSelf = isKnownAlias || getSelfLanAddresses().includes(host)
  if (!isSelf) return candidateDir
  return `${match[2]}:${match[3] ?? '\\'}`
}

function normalizePhysicalPath(candidateDir) {
  const isWindows = process.platform === 'win32'
  const withoutExtendedPrefix = isWindows && candidateDir.startsWith('\\\\?\\UNC\\')
    ? `\\\\${candidateDir.slice('\\\\?\\UNC\\'.length)}`
    : isWindows && candidateDir.startsWith('\\\\?\\')
      ? candidateDir.slice('\\\\?\\'.length)
      : candidateDir
  const withoutUncAdminShare = isWindows ? normalizeUncAdminShareToDrive(withoutExtendedPrefix) : withoutExtendedPrefix
  const normalized = path.normalize(withoutUncAdminShare)
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

function resolveQaShotsDir(committedDir) {
  const committed = path.resolve(committedDir)
  const override = process.env['QA_SHOTS_DIR']
  const trimmed = override && override.trim().length > 0 ? override.trim() : undefined
  const dir = trimmed ? path.resolve(trimmed) : path.join(committed, '_local')

  if (trimmed && isWithinPhysical(QA_EVIDENCE_AXIS, dir) && !hasExplicitOverwriteIntent()) {
    throw new Error(
      `[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: ${dir}. ` +
        '명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.',
    )
  }

  fs.mkdirSync(dir, { recursive: true })
  return dir
}

module.exports = { resolveQaShotsDir }
