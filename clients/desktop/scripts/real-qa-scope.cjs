const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REAL_QA_ROOT = 'clients/desktop/playwright'
const REAL_QA_SUFFIX = '-real-qa.spec.ts'

function normalizeRepoPath(value) {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

function walkFiles(root, relative = '') {
  const absolute = path.join(root, relative)
  if (!fs.existsSync(absolute)) return []

  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const nextRelative = path.join(relative, entry.name)
    if (entry.isDirectory()) return walkFiles(root, nextRelative)
    return entry.isFile() && entry.name.endsWith(REAL_QA_SUFFIX) ? [nextRelative] : []
  })
}

function listDiskRealQaFiles({ repoRoot }) {
  return walkFiles(repoRoot, REAL_QA_ROOT)
    .map(normalizeRepoPath)
    .sort()
}

function listTrackedRealQaFiles({ repoRoot }) {
  // 🚨 [SONNET5 R1 결함8 fix] `-z` 없이는 core.quotepath(기본값 true)가 비ASCII 파일명을
  // `"...\354\236\254..."` 형태로 따옴표+8진 이스케이프한다. 그러면 문자열이 닫는 따옴표(")로
  // 끝나 `.endsWith(REAL_QA_SUFFIX)`가 실패하고 그 파일이 tracked 집합에서 조용히 사라진다
  // (PC 별 core.quotepath 값에 판정이 좌우됨 — U-9). `-z`는 이름을 NUL로만 구분하고 절대
  // 따옴표/이스케이프하지 않는다(core.quotepath 값과 무관, git 문서상 공식 동작).
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--', REAL_QA_ROOT], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`
    throw new Error(`[real-QA 추적 집합 판정 실패] git ls-files --cached 를 실행하지 못했습니다: ${detail}`)
  }

  return result.stdout
    .split('\u0000')
    .filter((entry) => entry.length > 0)
    .map(normalizeRepoPath)
    .filter((file) => file.endsWith(REAL_QA_SUFFIX))
    .sort()
}

function compareRealQaScope({ diskFiles, trackedFiles }) {
  const disk = new Set(diskFiles.map(normalizeRepoPath))
  const tracked = new Set(trackedFiles.map(normalizeRepoPath))

  return {
    diskFiles: [...disk].sort(),
    trackedFiles: [...tracked].sort(),
    untrackedFiles: [...disk].filter((file) => !tracked.has(file)).sort(),
    missingFiles: [...tracked].filter((file) => !disk.has(file)).sort(),
  }
}

function getRealQaScope({ repoRoot }) {
  return compareRealQaScope({
    diskFiles: listDiskRealQaFiles({ repoRoot }),
    trackedFiles: listTrackedRealQaFiles({ repoRoot }),
  })
}

function formatScopeMismatch(scope) {
  const sections = ['[real-QA 추적 집합 불일치] 공식 공유 하네스 실행을 중단합니다.']
  if (scope.untrackedFiles.length > 0) {
    sections.push(
      '디스크에는 있지만 Git 추적 목록에는 없는 스펙(공식 수치에 섞이지 않음):',
      ...scope.untrackedFiles.map((file) => `- ${file}`),
    )
  }
  if (scope.missingFiles.length > 0) {
    sections.push(
      'Git 추적 목록에는 있지만 디스크에 없는 스펙(추적 집합 누락):',
      ...scope.missingFiles.map((file) => `- ${file}`),
    )
  }
  sections.push(
    '의도적으로 미추적 로컬 스펙만 실행하려면 REAL_QA_ALLOW_UNTRACKED=1 을 설정하고 명시 경로를 전달하십시오.',
  )
  return sections.join('\n')
}

// 🚨 [SONNET5 R1 결함1·3 fix] 명시 경로(narrow 실행) 판정 — argv 에서 실제 파일을 가리키는
// 위치 인자만 뽑아 그 경로가 가리키는 real-QA 스펙 집합을 계산한다. Playwright 는
// `playwright test --config=… [옵션들] [경로...]` 형태이므로 앞 2개(node, cli 스크립트)를
// 버리고 `test` 키워드와 `-`로 시작하는 옵션(및 `--grep 패턴`처럼 옵션 뒤에 오는 값)을 뺀
// 나머지를 후보로 본다. 후보가 실제 어떤 real-QA 스펙 경로도 가리키지 않으면(예: --grep 의
// 검색어) 그 후보는 무시되므로 별도 플래그 화이트리스트가 필요 없다 — 최종적으로 "실제 파일을
// 가리키는 인자가 있었는가"만으로 narrow 실행 여부를 판정한다.
function parseExplicitPathArgs(argv) {
  return argv.slice(2).filter((arg) => arg !== 'test' && !arg.startsWith('-'))
}

// 🚨 [SONNET5 R1 fix, 실측 보강] Playwright 는 `workers` 설정 값만큼 이 config 파일을
// **워커 자식 프로세스에서 별도로 다시 로드**한다(실측: node_modules/playwright/lib/common/
// process.js). 그 워커의 process.argv 는 원래 CLI 인자를 담지 않는다(예:
// ["node","…/process.js"]) — `--list`(수집만, 워커 미기동)에서는 드러나지 않고 실제 테스트
// 실행에서만 드러나는 차이다. argv 만 봤다면 워커 쪽에서 "명시 경로 없는 전체 실행"으로
// 오판해 결함1·3 의 narrow 실행이 워커 단계에서 다시 막혔을 것이다(실측 재현·회귀 테스트로 확인).
//
// 해결: 메인 프로세스가 argv 에서 명시 경로를 찾으면, 그 프로세스의 **자기 자신의**
// process.env 에 값을 적어 둔다. 자식 프로세스(워커)는 fork 시점에 부모의 process.env
// 스냅샷을 물려받으므로 그 값을 읽을 수 있다. 이 값은 PowerShell 세션 변수가 아니라 이번
// invocation 의 프로세스 트리 안에서만 존재한다 — 자식은 부모의 환경을 결코 그 부모의
// 부모(터미널 세션)로 되써넣을 수 없으므로, 이 값이 다음 셸 명령으로 새는 경로는 없다(U-2 유지).
const EXPLICIT_PATH_ARGS_ENV_VAR = 'REAL_QA_EXPLICIT_PATH_ARGS__INTERNAL'

function resolveExplicitPathArgs(argv) {
  const fromArgv = parseExplicitPathArgs(argv)
  if (fromArgv.length > 0) {
    process.env[EXPLICIT_PATH_ARGS_ENV_VAR] = JSON.stringify(fromArgv)
    return fromArgv
  }

  const inherited = process.env[EXPLICIT_PATH_ARGS_ENV_VAR]
  if (!inherited) return []
  try {
    const parsed = JSON.parse(inherited)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeArgPath(arg) {
  return arg.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\.\//, '')
}

function argReferencesFile(file, arg) {
  const normalizedArg = normalizeArgPath(arg)
  if (!normalizedArg) return false
  return file === normalizedArg || file.endsWith(`/${normalizedArg}`) || file.includes(`/${normalizedArg}/`)
}

function resolveRequestedFiles({ scope, explicitPathArgs }) {
  const universe = new Set([...scope.diskFiles, ...scope.trackedFiles])
  const requested = new Set()
  for (const arg of explicitPathArgs) {
    for (const file of universe) {
      if (argReferencesFile(file, arg)) requested.add(file)
    }
  }
  return requested
}

function writeExceptionModeWarning(scopedMismatch) {
  // 🚨 [SONNET5 R1 결함1 fix] U-1 — 예외 모드였다는 사실이 수치와 "같은" 출력 스트림에 남아야
  // 리다이렉트(`1> file`)로도 보인다. 기존에는 stderr 에만 적었다. 이제 stdout·stderr 모두에 쓴다.
  const message = `${formatScopeMismatch(scopedMismatch)}\n[real-QA 로컬 실행 모드] 위 차집합은 의도 실행으로 허용했으며 공식 수치로 사용하지 마십시오.\n`
  process.stdout.write(message)
  process.stderr.write(message)
}

// 🚨 [SONNET5 R1 fix] 순수 판정 로직 — git/fs 접근이 없어 합성 scope 로 직접 단위테스트 가능.
//
// 규칙(불변식 U-1~U-4):
//  - narrow 실행(명시 경로가 실제 스펙을 가리킴)이면, 그 요청과 무관한 차집합은 절대 막지
//    않는다(U-4) — 단 missingFiles 는 "집합이 줄어드는 방향"이라 요청이 그 파일 자신을
//    가리키는 경우에는 narrow 실행이라도 예외 없이 막는다(U-3).
//  - narrow 실행에서 요청이 untrackedFiles 를 가리키면 allowUntracked 로만 통과하고,
//    통과 시 경고를 stdout+stderr 모두에 남긴다(U-1).
//  - 명시 경로가 없는 전체(공식) 실행은 allowUntracked 값을 아예 참조하지 않는다 — 세션에
//    남은 환경변수가 다음 전체 실행으로 새지 않는다(U-2). missingFiles·untrackedFiles 모두
//    무조건 막는다(U-3, M-1 유지).
function decideRealQaScope({ scope, allowUntracked, explicitPathArgs }) {
  const requestedFiles = resolveRequestedFiles({ scope, explicitPathArgs })
  const isNarrowRun = requestedFiles.size > 0

  if (isNarrowRun) {
    const relevantMissing = scope.missingFiles.filter((file) => requestedFiles.has(file))
    if (relevantMissing.length > 0) {
      throw new Error(formatScopeMismatch({ ...scope, untrackedFiles: [], missingFiles: relevantMissing }))
    }

    const relevantUntracked = scope.untrackedFiles.filter((file) => requestedFiles.has(file))
    if (relevantUntracked.length === 0) return scope

    const scopedMismatch = { ...scope, untrackedFiles: relevantUntracked, missingFiles: [] }
    if (!allowUntracked) throw new Error(formatScopeMismatch(scopedMismatch))
    writeExceptionModeWarning(scopedMismatch)
    return scope
  }

  const mismatch = scope.untrackedFiles.length > 0 || scope.missingFiles.length > 0
  if (mismatch) {
    const ignoredFlagNote = allowUntracked
      ? '\nREAL_QA_ALLOW_UNTRACKED 은 명시 경로가 있는 실행에만 적용됩니다. 명시 경로 없는 전체 실행은 이 값과 무관하게 항상 중단합니다.'
      : ''
    throw new Error(formatScopeMismatch(scope) + ignoredFlagNote)
  }
  return scope
}

function assertRealQaScope({ repoRoot, allowUntracked = false, argv = process.argv }) {
  const scope = getRealQaScope({ repoRoot })
  return decideRealQaScope({ scope, allowUntracked, explicitPathArgs: resolveExplicitPathArgs(argv) })
}

function walkSourceFiles(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) return walkSourceFiles(absolute)
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return []
    if (/\.(?:test|spec|stories)\.(?:ts|tsx)$/.test(entry.name)) return []
    return [absolute]
  })
}

function newestMtime(files) {
  return files.reduce((latest, file) => Math.max(latest, fs.statSync(file).mtimeMs), 0)
}

function describeMtime(file) {
  return fs.existsSync(file) ? new Date(fs.statSync(file).mtimeMs).toISOString() : '없음'
}

function checkFreshArtifact({ artifact, sourceRoots, label, command }) {
  if (!fs.existsSync(artifact)) {
    return `${label}이(가) 없습니다: ${path.relative(process.cwd(), artifact)}. ${command}`
  }

  const sourceFiles = sourceRoots.flatMap(walkSourceFiles)
  const sourceMtime = newestMtime(sourceFiles)
  const artifactMtime = fs.statSync(artifact).mtimeMs
  if (sourceMtime > artifactMtime) {
    const newestSource = sourceFiles
      .filter((file) => fs.statSync(file).mtimeMs === sourceMtime)
      .map((file) => path.relative(process.cwd(), file))[0]
    return [
      `${label}이(가) 소스보다 오래됐습니다: ${path.relative(process.cwd(), artifact)}`,
      `산출물=${describeMtime(artifact)}, 최신 소스=${newestSource ?? '확인 불가'} (${new Date(sourceMtime).toISOString()})`,
      `코드 오류로 단정하지 말고 먼저 ${command}`,
    ].join('\n')
  }
  return null
}

function checkInstalledElectronUpdater({ desktopRoot }) {
  const packageJsonPath = path.join(desktopRoot, 'package.json')
  const lockPath = path.join(desktopRoot, 'package-lock.json')
  const installedPath = path.join(desktopRoot, 'node_modules/electron-updater/package.json')
  if (!fs.existsSync(installedPath)) {
    return 'electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.'
  }

  const installedVersion = JSON.parse(fs.readFileSync(installedPath, 'utf8')).version
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
  const lockedVersion = lock.packages?.['node_modules/electron-updater']?.version
  const declaredRange = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).dependencies?.['electron-updater']
  if (lockedVersion && installedVersion !== lockedVersion) {
    return `electron-updater 설치 버전(${installedVersion})이 package-lock 버전(${lockedVersion})과 다릅니다. clients/desktop에서 npm ci 를 실행하십시오.`
  }
  if (!declaredRange) return 'package.json에 electron-updater 의존성 선언이 없습니다.'
  return null
}

// 🚨 [SONNET5 R1 결함7 fix] 이 게이트가 실제로 보는 대상은 이 3종(및 typecheck 단계는 이
// 중 2종)의 mtime/버전뿐이다. node_modules 의 `file:` 심볼릭 링크/정션 무결성이나 그 밖의
// 일반 의존성(예: electron-store) 설치 상태는 보지 않는다 — 그런 문제는 이 게이트를 통과한
// 뒤 이어지는 tsc/vitest 원본 오류로 드러난다. "확인 완료"가 그 이상을 검사했다는 인상을
// 주지 않도록 성공 메시지에 대상을 명시한다(검사 범위 확대가 아니라 계약 문구 정정).
function describeFreshnessTargets(phase) {
  return phase === 'test'
    ? 'design-system dist 최신성 · electron-updater 설치 버전 일치 · Electron out/main 빌드 최신성'
    : 'design-system dist 최신성 · electron-updater 설치 버전 일치'
}

function assertDerivedArtifactsFresh({ repoRoot, phase }) {
  const desktopRoot = path.join(repoRoot, 'clients/desktop')
  const designSystemRoot = path.join(repoRoot, 'clients/web/design-system')
  // 🚨 [SONNET5 R1 결함5 fix] 안내 명령의 `cd` 대상을 출력 시점 cwd 기준 상대경로로 동적
  // 계산한다. 기존에는 artifact 경로(위 checkFreshArtifact 의 path.relative(process.cwd(), …))는
  // cwd 기준인데 cd 안내만 repo root 기준 문자열을 하드코딩해 같은 줄 안에서 자기모순이었다
  // (cwd=clients/desktop 일 때 "cd clients/web/design-system"을 실행하면 존재하지 않는
  // clients/desktop/clients/web/design-system 을 찾는다). 어떤 cwd 에서 호출되든 동일한
  // 기준(process.cwd())으로 계산하므로 항상 실행 가능하다(U-6).
  const designSystemCdHint = path.relative(process.cwd(), designSystemRoot) || '.'
  const issues = [
    checkInstalledElectronUpdater({ desktopRoot }),
    checkFreshArtifact({
      artifact: path.join(designSystemRoot, 'dist/index.d.ts'),
      sourceRoots: [path.join(designSystemRoot, 'src')],
      label: 'file: 의존 design-system dist',
      command: `cd ${designSystemCdHint}; npm run build`,
    }),
  ].filter(Boolean)

  if (phase === 'test') {
    issues.push(
      checkFreshArtifact({
        artifact: path.join(desktopRoot, 'out/main/index.js'),
        sourceRoots: [
          path.join(desktopRoot, 'src/main'),
          path.join(desktopRoot, 'src/preload'),
        ],
        label: 'Electron main 빌드 산출물 out/main/index.js',
        command: 'npm run build',
      }),
    )
  }

  const actualIssues = issues.filter(Boolean)
  if (actualIssues.length > 0) {
    throw new Error(
      [
        '[로컬 파생물 신선도 확인 실패] 검증 결과를 코드 결함으로 해석하지 마십시오.',
        ...actualIssues.flatMap((issue) => [`- ${issue}`]),
      ].join('\n'),
    )
  }
}

// 🚨 [SONNET5 R1 결함4 fix] U-5 — mtime 만 바뀌어도(내용은 그대로인) 상태에서 npm test·
// npm run typecheck 가 막힐 수 있는데(수단이 mtime 비교라 원천적으로 오탐 가능), 수집
// 게이트(REAL_QA_ALLOW_UNTRACKED)에는 있던 탈출구가 이 신선도 게이트에는 전혀 없었다.
// REAL_QA_SKIP_FRESHNESS_CHECK=1 로 건너뛸 수 있게 하되, 침묵 우회가 되지 않도록 매번
// "건너뛴 사실"과 "무엇을 건너뛰었는지"를 표준출력에 남긴다.
function checkFreshnessOrSkip({ repoRoot, phase, skip }) {
  const targets = describeFreshnessTargets(phase)
  if (skip) {
    return `[로컬 파생물 신선도 건너뜀] REAL_QA_SKIP_FRESHNESS_CHECK=1 — ${phase} 대상 확인(${targets})을 건너뜁니다. 산출물이 실제로 최신인지는 직접 확인하십시오.\n`
  }
  assertDerivedArtifactsFresh({ repoRoot, phase })
  return `[로컬 파생물 신선도] ${phase} 대상 확인 완료 — 이 확인은 ${targets}만 봅니다. node_modules 의 file: 링크 무결성이나 그 외 일반 의존성 상태는 다루지 않으며, 그런 문제는 이어지는 tsc/vitest 원본 오류로 드러납니다.\n`
}

if (require.main === module) {
  const phase = process.argv.includes('--phase=test') ? 'test' : 'typecheck'
  const skip = process.env['REAL_QA_SKIP_FRESHNESS_CHECK'] === '1'
  try {
    process.stdout.write(checkFreshnessOrSkip({ repoRoot: path.resolve(__dirname, '../../..'), phase, skip }))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  REAL_QA_ROOT,
  REAL_QA_SUFFIX,
  assertDerivedArtifactsFresh,
  assertRealQaScope,
  checkFreshnessOrSkip,
  compareRealQaScope,
  decideRealQaScope,
  describeFreshnessTargets,
  formatScopeMismatch,
  getRealQaScope,
  listDiskRealQaFiles,
  listTrackedRealQaFiles,
  EXPLICIT_PATH_ARGS_ENV_VAR,
  parseExplicitPathArgs,
  resolveExplicitPathArgs,
  resolveRequestedFiles,
}
