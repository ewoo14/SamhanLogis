/**
 * QA 라이브 캡처 저장 경로 결정 — `docs/qa/**` 커밋 스크린샷 덮어쓰기 방지.
 *
 * 배경 (2026-07-25, #902 슬라이스 4회 반복 후 확정):
 *   `docs/qa/<slug>/*.png` 는 PR 리뷰가 참조하는 "확정 증거"다. 그런데 라이브QA
 *   스펙이 같은 파일명으로 하드코딩된 경로에 `page.screenshot()` 을 찍으면,
 *   스펙을 다시 실행할 때마다(재검증·회귀 확인·다음 라운드) 그 확정 증거가
 *   매번 새 캡처로 덮어써진다. 리뷰어 입장에서는 "라이브QA 를 실행하면 커밋된
 *   증거가 오염된다"는 딜레마가 되고, 실제로 이 슬라이스에서 리뷰어가 그 이유로
 *   라이브QA 실행 자체를 포기한 사례가 2회 있었다 — 머지 게이트 ③(라이브QA 실서버
 *   실행)을 구조적으로 차단하는 결과였다.
 *
 * 계약 (2026-07-26 PR #938 H-2→D-1 로 확정, real-QA·mock 공통 단일 함수):
 *   - `QA_SHOTS_DIR` 를 지정하지 않으면 기본값은 항상 `<committedDir>/_local` 이다.
 *     (#938 D-1: 1차 적용이 mock 게이트만 덮어 real-QA 가 뚫려 있었고, 실측으로
 *     커밋 증거 12장 오염이 나온 뒤 real-QA 포함 172파일 전체로 넓혔다 — 그 계약이
 *     이 함수다. real-QA 전용으로 "기본값은 커밋 디렉터리 자체" 를 되살리는 것은
 *     이 fix 이전으로 되돌아가는 회귀다.)
 *   - `QA_SHOTS_DIR` 를 지정했는데 그 경로가 레포의 커밋 QA 증거 루트
 *     (`docs/qa/**` — 자기 슬러그든 다른 슬러그든 루트 자체든) 안에 들어가면,
 *     `QA_ALLOW_OVERWRITE=1` 없이는 즉시 차단한다. `QA_SHOTS_DIR` 는 프로세스 전체가
 *     공유하는 전역 값이라, mock 스위트(또는 여러 real-QA 스펙)를 한 번에 실행하면
 *     "내 슬러그만 승격하려 했는데 다른 스펙 전부가 그 경로에 같이 쓰는" 사고가
 *     난다 — 그래서 자기 슬러그·타 슬러그·루트 자체를 가리지 않고 전부 막는다
 *     (2026-07-27 이슈 #863 D-3).
 *
 * (2026-07-27 R1 재수렴 — 이 파일은 한때 real-QA 용 `resolveQaShotsDir` 와 mock 전용
 *  `resolveMockQaShotsDir` 두 함수로 갈렸었다. 그 전제 — "mock 스펙 41개가 docs/qa 에
 *  직접 쓴다" — 가 거짓으로 드러났다: 전환 대상 35파일 전부가 main 에서 이미 이
 *  resolveQaShotsDir 를 경유했고 기본값도 이미 `_local` 이었다. 함수명이 갈리자
 *  harness-false-green-guard.test.ts 의 H-2 가드(decl.body.includes('resolveQaShotsDir')
 *  부분문자열 검사)가 깨져 전환 대상 34~35파일이 전부 위반으로 뒤집혔다 — 그래서 다시
 *  단일 함수로 합쳤다. D-3(전역 QA_SHOTS_DIR 가 다른 슬러그·루트를 침범하는 문제)는
 *  이 단일 함수에 합류시켜 real-QA 도 함께 보호한다 — mock 만 덮었다가 real-QA 가
 *  뚫려 있던 #938 D-1 과 같은 종류의 실수를 반복하지 않기 위해서다.)
 *
 * @param committedDir 기존 커밋 캡처가 있는(또는 있을) 절대경로 — 보통
 *   `path.resolve(_dirname, '../../../../docs/qa/<slug>')` 형태로 계산해 전달한다.
 * @returns 이번 실행에서 실제로 스크린샷을 써야 할 절대경로(디렉토리는 이미 생성됨).
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

/** 이 파일(clients/desktop/playwright/support) 기준 레포의 커밋 QA 증거 루트 전체. */
const DOCS_QA_ROOT = path.resolve(_dirname, '../../../../docs/qa')

function hasExplicitOverwriteIntent(): boolean {
  return ['1', 'true', 'yes'].includes(
    String(process.env['QA_ALLOW_OVERWRITE'] ?? '').trim().toLowerCase(),
  )
}

function isPathMissingError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

function throwPhysicalPathError(candidateDir: string, error: unknown): never {
  const reason = error instanceof Error ? error.message : String(error)
  throw new Error(`[QA 출력 경로 가드] 물리 경로 조회에 실패했습니다: ${candidateDir}: ${reason}`, { cause: error })
}

function isRemoteUncPath(candidateDir: string): boolean {
  if (process.platform !== 'win32') return false
  const match = /^\\\\([^\\]+)\\/.exec(candidateDir)
  if (!match) return false
  const host = match[1]?.toLowerCase() ?? ''
  const isKnownAlias = host === 'localhost' || host === '127.0.0.1' || host === '.' || host === os.hostname().toLowerCase()
  return !isKnownAlias && !getSelfLanAddresses().includes(host)
}

/** 존재하지 않는 하위 경로도 기존 부모의 junction/symlink를 물리 경로로 풀어낸다. */
function resolvePhysicalPath(candidateDir: string): string {
  if (isRemoteUncPath(candidateDir)) return path.resolve(candidateDir)
  let current = path.resolve(candidateDir)
  const missingParts: string[] = []

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
 * I/O 없음). 2026-07-28 R5 재수렴 결함3 — 고정 별칭 목록은 "열거"라서 어댑터가 늘
 * 때마다 다시 뚫린다. 자세한 배경은 scripts/lib/qa-shots-dir.cjs 의 동명 함수 주석 참조.
 */
function getSelfLanAddresses(): string[] {
  const addresses: string[] = []
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
 * (`D:\...`)로 통일한다(2026-07-28 R4 결함3 + R5 재수렴 결함3) — 자세한 배경은
 * scripts/lib/qa-shots-dir.cjs 의 동명 함수 주석 참조. 다른 호스트를 가리키는
 * admin-share 는 실제로 다른 물리 머신이므로 변환하지 않는다.
 */
function normalizeUncAdminShareToDrive(candidateDir: string): string {
  const match = /^\\\\([^\\]+)\\([A-Za-z])\$(\\.*)?$/.exec(candidateDir)
  if (!match) return candidateDir
  const host = (match[1] ?? '').toLowerCase()
  const isKnownAlias = host === 'localhost' || host === '127.0.0.1' || host === '.' || host === os.hostname().toLowerCase()
  const isSelf = isKnownAlias || getSelfLanAddresses().includes(host)
  if (!isSelf) return candidateDir
  return `${match[2]}:${match[3] ?? '\\'}`
}

function normalizePhysicalPath(candidateDir: string): string {
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

function isWithin(parentDir: string, candidateDir: string): boolean {
  const relative = path.relative(parentDir, candidateDir)
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

function isWithinPhysical(parentDir: string, candidateDir: string): boolean {
  return isWithin(
    normalizePhysicalPath(resolvePhysicalPath(parentDir)),
    normalizePhysicalPath(resolvePhysicalPath(candidateDir)),
  )
}

export function resolveQaShotsDir(committedDir: string): string {
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
