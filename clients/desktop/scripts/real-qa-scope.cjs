const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')

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

// 🚨 [SONNET5 재수렴 결함1 fix] `.gitignore`(88-95행)가 개발책임자 요청(2026-07-05)으로 로컬
// 세션 QA 아티팩트 7개 디렉터리를 "커밋 대상 아님"으로 명시했다. 그 디렉터리 안의
// -real-qa.spec.ts 는 어느 개발 PC 에나 정상적으로 존재할 수 있다 — git 이 스스로
// "무시하라"고 선언한 상태이기 때문이다. 이 함수는 그런 파일을 걸러내 "untracked 인데
// .gitignore 로도 안 걸리는" 진짜 이상 상태(#864 계열 — 새 스펙을 만들고 git add 를
// 잊은 경우)만 남긴다. `git ls-files --others --ignored --exclude-standard` 는 Git 자신의
// .gitignore 판정 결과이므로 이 스크립트가 정책(7개 디렉터리 목록)을 따로 하드코딩해
// 중복 유지할 필요가 없다 — .gitignore 가 바뀌면 이 판정도 자동으로 같이 바뀐다.
function listGitignoredUntrackedRealQaFiles({ repoRoot }) {
  const result = spawnSync(
    'git',
    ['ls-files', '-z', '--others', '--ignored', '--exclude-per-directory=.gitignore', '--', REAL_QA_ROOT],
    { cwd: repoRoot, encoding: 'utf8', windowsHide: true },
  )

  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`
    throw new Error(`[real-QA 무시 파일 판정 실패] git ls-files --others --ignored 를 실행하지 못했습니다: ${detail}`)
  }

  return result.stdout
    .split('\u0000')
    .filter((entry) => entry.length > 0)
    .map(normalizeRepoPath)
    .filter((file) => file.endsWith(REAL_QA_SUFFIX))
    .sort()
}

function compareRealQaScope({ diskFiles, trackedFiles, gitignoredFiles = [] }) {
  const disk = new Set(diskFiles.map(normalizeRepoPath))
  const tracked = new Set(trackedFiles.map(normalizeRepoPath))
  const gitignored = new Set(gitignoredFiles.map(normalizeRepoPath))

  const untrackedFiles = [...disk].filter((file) => !tracked.has(file)).sort()

  return {
    diskFiles: [...disk].sort(),
    trackedFiles: [...tracked].sort(),
    // untrackedFiles 는 기존 그대로 유지한다(디스크에 있는데 추적 안 된 전체) — narrow/전체
    // 실행 게이트(decideRealQaScope)가 이 필드를 그대로 계속 쓰며, 그 게이트의 "전체 실행은
    // .gitignore 여부와 무관하게 항상 막는다"는 기존 의도된 동작(README:294-298 문서화됨)은
    // 이번 fix 의 대상이 아니다.
    untrackedFiles,
    // 🆕 unexpectedUntrackedFiles — untracked 이면서 .gitignore 로도 안 걸리는 파일만. 개발자
    // PC 의 정상적인 로컬 QA 세션 잔존물(.gitignore 가 허용)은 여기서 빠진다. 단위 테스트가
    // "공식 수집 집합이 Git 추적 집합과 일치한다"를 검증할 때는 이 필드를 써야
    // npm run typecheck 가 개발자 PC 상태에 따라 영구 RED 가 되지 않는다.
    unexpectedUntrackedFiles: untrackedFiles.filter((file) => !gitignored.has(file)).sort(),
    ignoredUntrackedFiles: untrackedFiles.filter((file) => gitignored.has(file)).sort(),
    missingFiles: [...tracked].filter((file) => !disk.has(file)).sort(),
  }
}

function getRealQaScope({ repoRoot }) {
  return compareRealQaScope({
    diskFiles: listDiskRealQaFiles({ repoRoot }),
    trackedFiles: listTrackedRealQaFiles({ repoRoot }),
    gitignoredFiles: listGitignoredUntrackedRealQaFiles({ repoRoot }),
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

// 🚨 [SONNET5 R1 결함1·3 fix, R2-1 fix 로 화이트리스트 보강] 명시 경로(narrow 실행) 판정 —
// argv 에서 실제 파일을 가리키는 위치 인자만 뽑아 그 경로가 가리키는 real-QA 스펙 집합을
// 계산한다. Playwright 는 `playwright test --config=… [옵션들] [경로...]` 형태이므로 앞
// 2개(node, cli 스크립트)를 버리고 `test` 키워드와 `-`로 시작하는 옵션을 뺀 나머지를 후보로
// 본다.
//
// R1 원 주석은 "후보가 실제 어떤 real-QA 스펙 경로도 가리키지 않으면(예: --grep 의 검색어)
// 그 후보는 무시되므로 별도 플래그 화이트리스트가 필요 없다"고 가정했다 — 그 시점의 매칭이
// 문자열 접미사 비교라 "line"·"2" 같은 흔한 값이 어떤 경로 세그먼트와도 정확히 일치하지
// 않았기 때문에 그 가정이 성립했다. R2-1 fix 로 매칭을 Playwright 의 실제 정규식 부분일치로
// 바꾸면서 이 가정이 깨졌다(실측: repoRoot 를 실제로 넣어 확인 — "line"→8개, "2"→63개 파일이
// 절대경로 부분일치로 잡힘). `--reporter line`처럼 흔한 공백형 실행이 그 파일들만의 narrow
// 실행으로 오인되면, 트리 어딘가의 무관한 실제 미추적/누락 스펙을 걸러내지 않고 지나칠
// 위험이 생긴다(경계 오인, 회귀 울타리 2번 재발). 그래서 이제는 Playwright가 실제로 등록한
// 옵션 스키마에서 값 옵션을 읽는다. 이 게이트가 Playwright config 로드 중 실행될 때는
// 설치된 `playwright/lib/program`이 이미 같은 CLI 명령을 등록한 상태이므로, 새 값 옵션이
// 추가돼도 별도 화이트리스트를 갱신할 필요가 없다. node_modules 없는 순수 단위 테스트와
// node_modules 없는 순수 단위 테스트에서는 빈 schema를 사용한다. 실제 Playwright config는
// 그런 환경에서 로드되지 않으므로 옵션 계약을 추측하는 production fallback을 두지 않는다.
const EMPTY_VALUE_TAKING_FLAGS = new Set()

// 🚨 [SONNET5 재수렴 결함4 fix] `--project`는 값을 하나만 받는 게 아니라 commander 의
// 가변인자(variadic) 옵션이다(playwright/lib/program.js:208 `"--project <project-name...>"`).
// 실측(main 대조군, 게이트 없음): `--project renderer order-app playwright/manual/` 을 그대로
// playwright 에 넘기면 세 번째 토큰까지 프로젝트명으로 흡수해 `Project(s) "playwright/manual/"
// not found` 로 실패한다 — playwright 자신이 "다음 `-`로 시작하는 토큰(또는 인자 끝)까지"를
// 전부 값으로 삼는다는 뜻이다. `VALUE_TAKING_FLAGS`처럼 딱 한 토큰만 건너뛰면, `--project a b`
// 에서 `b`(그리고 그 뒤에 이어지는 진짜 위치 인자까지)가 우리 게이트에서는 "위치 인자"로
// 오분류돼 차단 사유가 사실과 달라진다(전달한 적 없는 경로를 찾다 실패한 것처럼 보임). 값을
// 받는 옵션 중 가변인자는 현재 스키마에서 `--project` 하나뿐이다.
const EMPTY_VARIADIC_FLAGS = new Set()

function parsePlaywrightVersion(version) {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version ?? '')
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0) } : null
}

function getPlaywrightCliContract() {
  try {
    const { program } = require('playwright/lib/program')
    const testCommand = program.commands.find((command) => command.name() === 'test')
    if (testCommand?.options?.length > 0) {
      const valueTakingFlags = new Set()
      const variadicFlags = new Set()
      for (const option of testCommand.options) {
        const names = [option.short, option.long].filter(Boolean)
        if (option.required || option.optional) names.forEach((name) => valueTakingFlags.add(name))
        if (option.variadic) names.forEach((name) => variadicFlags.add(name))
      }
      const version = parsePlaywrightVersion(require('playwright/package.json').version)
      return {
        valueTakingFlags,
        variadicFlags,
        // Playwright 1.62 changed `test [test-filter...]` so arguments after `--`
        // are removed before runTests receives the filters. Keep the 1.59–1.61
        // behavior for the lower end of the declared dependency range.
        postDashArgsAreIgnored: Boolean(version && (version.major > 1 || version.major === 1 && version.minor >= 62)),
      }
    }
  } catch {
    // The config cannot be loaded without Playwright. Unit tests inject a fixture contract.
  }
  return {
    valueTakingFlags: EMPTY_VALUE_TAKING_FLAGS,
    variadicFlags: EMPTY_VARIADIC_FLAGS,
    postDashArgsAreIgnored: false,
  }
}

function parseExplicitPathArgs(argv, { cliContract = getPlaywrightCliContract() } = {}) {
  const rest = argv.slice(2)
  const candidates = []
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg === 'test') continue
    if (arg === '--') {
      if (cliContract.postDashArgsAreIgnored) break
      continue
    }
    if (arg.startsWith('-')) {
      if (!arg.includes('=')) {
        if (cliContract.variadicFlags.has(arg)) {
          while (i + 1 < rest.length && !rest[i + 1].startsWith('-')) i += 1
        } else if (cliContract.valueTakingFlags.has(arg)) {
          i += 1
        }
      }
      continue
    }
    candidates.push(arg)
  }
  return candidates
}

// 🚨 [SONNET5 R1 fix, 실측 보강] Playwright 는 `workers` 설정 값만큼 이 config 파일을
// 워커 자식 프로세스에서 별도로 다시 로드하며, 그 자식의 process.argv 에는 원래 CLI 인자가
// 없다. `--list`(수집만, 워커 미기동)에서는 드러나지 않고 실제 테스트 실행에서만 드러나는
// 차이이므로, 메인 프로세스가 계산한 명시 경로를 자식에게 전달해야 한다.
//
// 해결: 메인 프로세스가 argv 에서 명시 경로를 찾으면, 그 프로세스의 **자기 자신의**
// process.env 에 값을 적어 둔다. 자식 프로세스(워커)는 fork 시점에 부모의 process.env
// 스냅샷을 물려받으므로 그 값을 읽을 수 있다. 토큰에는 메인 PID와 매 invocation 새로 만든
// UUID를 넣고, 자식에서는 process.ppid가 토큰의 PID와 일치할 때만 읽는다. 따라서 공개
// PowerShell 세션 변수나 Playwright 내부 환경변수에 의존하지 않고 이 프로세스 트리만
// narrow 실행 정보를 공유한다.
const EXPLICIT_PATH_ARGS_ENV_VAR = 'REAL_QA_EXPLICIT_PATH_ARGS__INTERNAL'
const EXPLICIT_PATH_TOKEN_ENV_VAR = 'REAL_QA_EXPLICIT_PATH_TOKEN__INTERNAL'

function hasInheritedExplicitPathMarker() {
  const marker = process.env[EXPLICIT_PATH_TOKEN_ENV_VAR]
  if (!marker) return false
  const separator = marker.indexOf(':')
  if (separator <= 0) return false
  return Number(marker.slice(0, separator)) === process.ppid
}

function resolveExplicitPathArgs(argv) {
  const fromArgv = parseExplicitPathArgs(argv)
  if (fromArgv.length > 0) {
    process.env[EXPLICIT_PATH_ARGS_ENV_VAR] = JSON.stringify(fromArgv)
    process.env[EXPLICIT_PATH_TOKEN_ENV_VAR] = `${process.pid}:${randomUUID()}`
    return fromArgv
  }

  if (!hasInheritedExplicitPathMarker()) return []
  const inherited = process.env[EXPLICIT_PATH_ARGS_ENV_VAR]
  if (!inherited) return []
  try {
    const parsed = JSON.parse(inherited)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// 🚨 [CODEX SOL] Playwright 의 위치 인자는 리터럴 경로가 아니라 파일 경로에 대한
// 대소문자 무시 정규식 부분일치 필터다. `:줄번호[:열번호]` 접미사는 파일 필터에서
// 제외하고, Windows 경로 구분자는 CLI 입력 호환을 위해 정규화한다. 이 동작을
// Playwright 내부 모듈에 require 로 위임하면 허용 범위 내 업데이트에서 함수가 사라질 때
// 명시 파일 실행만 죽으므로, CLI 계약에 필요한 최소 동작을 이 게이트 안에서 유지한다.
function parseLocationArg(arg) {
  const match = /^(.*?):(\d+):?(\d+)?$/.exec(arg)
  return match ? match[1] : arg
}
function normalizeArgSeparators(arg) {
  // Playwright 자신은 원시 백슬래시 상대경로(Windows 사용자가 흔히 타이핑·복붙)를 지원하지
  // 않는다(실측: 실제 CLI로 `playwright\manual\slip-form-3d-real-qa.spec.ts` 실행 시 "Total: 0
  // tests in 0 files"). 사람이 백슬래시로 경로를 타이핑한 의도는 명확하므로(구분자 표기
  // 차이일 뿐 다른 파일을 가리키는 게 아님) 폴백 후보로만 이 구분자 정규화를 쓴다 — 아래
  // buildMatcherCandidates 참고. 이 함수 자체는 무조건 호출하지 않는다(결함2 fix).
  return arg.replace(/\\/g, '/')
}

function compileRegex(pattern) {
  const wrapped = /^\/(.*)\/([gi]*)$/.exec(pattern)
  try {
    return new RegExp(wrapped ? wrapped[1] : pattern, wrapped ? wrapped[2] : 'gi')
  } catch {
    // 유효하지 않은 정규식(예: 백슬래시 원시 경로를 그대로 정규식으로 해석하려다 실패한
    // 경우) — 이 후보는 그냥 매치 0건으로 취급한다.
    return null
  }
}

function matchUniverse(matcher, universe, repoRoot) {
  const matched = new Set()
  if (!matcher) return matched
  for (const file of universe) {
    const absolute = path.resolve(repoRoot, file)
    // Playwright's createFileMatcher tests regex filters against the absolute
    // OS path and, on Windows, its file:// URL. Do not add repo-relative or
    // slash-normalized absolute candidates: anchored patterns against those
    // forms would pass this gate while Playwright selects zero files.
    const candidates = [absolute]
    if (path.sep === '\\') candidates.push(pathToFileURL(absolute).href)
    if (
      candidates.some((candidate) => {
        matcher.lastIndex = 0
        return matcher.test(candidate)
      })
    ) {
      matched.add(file)
    }
  }
  return matched
}

// 🚨 [SONNET5 재수렴 결함2 fix] 이전 버전은 인자마다 백슬래시를 무조건 `/`로 치환한 뒤
// 정규식으로 컴파일했다. 그러면 정규식 이스케이프(`\.`·`\d`·`\b`·`\w` 등)가 전부 깨진다
// (`\.` → `/.`(임의의 문자 매칭으로 의미가 바뀜), `\d` → `/d`(리터럴 "/d" 매칭) 등) —
// Playwright 는 이 인자들을 실제로 정규식 부분일치로 해석해 파일을 찾는데, 게이트는 그
// 치환 탓에 0건으로 오판해 과차단했다(실측: `92[0-9]-.*-real-qa\.spec\.ts` 가 playwright
// 자신에게는 23개 테스트를 선택하지만, 치환 후에는 아무 파일도 못 찾았다).
//
// fix — 인자별로 먼저 "있는 그대로"(백슬래시 보존) 정규식으로 시도한다. 그 결과가 이미
// 1개 이상 매치하면 그것으로 확정하고 끝낸다(정규식 이스케이프를 쓴 인자는 항상 여기서
// 끝나므로 이 함수가 그 인자의 백슬래시를 다시는 건드리지 않는다). 원시 매치가 0건일
// 때만 백슬래시→슬래시로 치환한 두 번째 후보로 재시도한다(Windows 상대경로 관용 표기
// 지원, 회귀 테스트 "R2-1 회귀: 백슬래시 상대경로 인자" 참고).
function resolveRequestedFiles({ scope, explicitPathArgs, repoRoot }) {
  const universe = new Set([...scope.diskFiles, ...scope.trackedFiles])
  if (explicitPathArgs.length === 0 || universe.size === 0) return new Set()

  const requested = new Set()
  for (const arg of explicitPathArgs) {
    const pattern = parseLocationArg(arg)
    const rawMatches = matchUniverse(compileRegex(pattern), universe, repoRoot)
    if (rawMatches.size > 0) {
      rawMatches.forEach((file) => requested.add(file))
      continue
    }
    const converted = normalizeArgSeparators(pattern)
    if (converted !== pattern) {
      matchUniverse(compileRegex(converted), universe, repoRoot).forEach((file) => requested.add(file))
    }
  }
  return requested
}

// 🚨 [SONNET5 R2-2 fix] U-3 — R1 결함1 fix 는 "예외 모드였다는 사실이 수치와 같은 스트림에
// 남는다"를 위해 stdout 에도 썼는데, `--reporter=json`/`--reporter=junit` 은 출력 파일을
// 안 정하면 stdout 자체가 곧 그 리포터의 산출물이다(실측: 출력 파일을 지정하지 않은
// json/junit 리포터가 산출물을 stdout에 쓴다). 그 앞에 우리 텍스트가 섞이면 JSON.parse 가
// "Unexpected token"으로 깨진다(R2 라운드 실측: `--reporter=json … 1> report.json` 앞 6줄이
// 우리 경고). 이 두 리포터에서는 stdout 이 이미 유일한 산출물 스트림이라 어디에 끼워도 그
// 산출물 자체가 깨지므로 "산출물 무결성"과 "수치와 같은 스트림"이 동시에 성립할 수 없다 —
// 산출물 무결성을 우선해 stdout 을 건드리지 않고 stderr 에만 남긴다(터미널에서 실행하면
// 여전히 즉시 보이므로 R1 결함1 이 막으려던 "완전히 흔적 없이 사라짐"은 일어나지 않는다).
const STDOUT_SENSITIVE_REPORTERS = new Set(['json', 'junit'])

function usesStdoutSensitiveReporter(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    let value = null
    if (arg === '--reporter') value = argv[i + 1] ?? null
    else if (arg.startsWith('--reporter=')) value = arg.slice('--reporter='.length)
    if (value === null) continue
    if (value.split(',').some((name) => STDOUT_SENSITIVE_REPORTERS.has(name.trim()))) return true
  }
  return false
}

function writeExceptionModeWarning(scopedMismatch, { suppressStdout = false } = {}) {
  const message = `${formatScopeMismatch(scopedMismatch)}\n[real-QA 로컬 실행 모드] 위 차집합은 의도 실행으로 허용했으며 공식 수치로 사용하지 마십시오.\n`
  if (!suppressStdout) process.stdout.write(message)
  process.stderr.write(message)
}

// 🚨 [SONNET5 R1 fix] 순수 판정 로직 — git/fs 접근이 없어 합성 scope 로 직접 단위테스트 가능.
//
// 규칙(불변식 U-1~U-4):
//  - narrow 실행(명시 경로가 실제 스펙을 가리킴)이면, 그 요청과 무관한 차집합은 절대 막지
//    않는다(U-4) — 단 missingFiles 는 "집합이 줄어드는 방향"이라 요청이 그 파일 자신을
//    가리키는 경우에는 narrow 실행이라도 예외 없이 막는다(U-3).
//  - narrow 실행에서 요청이 untrackedFiles 를 가리키면 allowUntracked 로만 통과하고,
//    통과 시 경고를 stderr 에 남기고, stdout 은 리포터가 json/junit(산출물이 곧 stdout)이
//    아닌 한 함께 남긴다([SONNET5 R2-2 fix], 위 writeExceptionModeWarning 참고).
//    단, 요청이 알려진 전체 파일 집합을 선택하면 공식 전체 실행으로 간주해
//    allowUntracked 를 참조하지 않고 항상 차단한다(K-1).
//  - 명시 경로가 없는 전체(공식) 실행은 allowUntracked 값을 아예 참조하지 않는다 — 세션에
//    남은 환경변수가 다음 전체 실행으로 새지 않는다(U-2). missingFiles·untrackedFiles 모두
//    무조건 막는다(U-3, M-1 유지).
function decideRealQaScope({ scope, allowUntracked, explicitPathArgs, repoRoot, suppressStdoutWarning = false }) {
  const requestedFiles = resolveRequestedFiles({ scope, explicitPathArgs, repoRoot })
  if (requestedFiles.size === 0) {
    if (explicitPathArgs.length > 0) {
      throw new Error(
        [
          '[real-QA 위치 인자 불일치] 전달한 위치 인자가 real-QA 스펙을 하나도 선택하지 않아 실행을 차단합니다.',
          `전달한 위치 인자: ${explicitPathArgs.join(' ')}`,
          '파일 경로·디렉터리·파일명 조각 또는 Playwright가 해석하는 정규식 형태를 확인하십시오.',
        ].join('\n'),
      )
    }

    const sections = [
      '[real-QA 전체 실행 차단] 파일을 명시하지 않은 real-QA 실행은 허용하지 않습니다.',
      '실행할 스펙 파일·디렉터리·글롭·파일명 조각을 위치 인자로 전달하십시오.',
      '예: npx playwright test --config playwright.real-qa.config.ts --list playwright/<spec-path>',
    ]
    if (scope.untrackedFiles.length > 0 || scope.missingFiles.length > 0) {
      sections.push('', formatScopeMismatch(scope))
    }
    throw new Error(sections.join('\n'))
  }

  const relevantMissing = scope.missingFiles.filter((file) => requestedFiles.has(file))
  if (relevantMissing.length > 0) {
    throw new Error(formatScopeMismatch({ ...scope, untrackedFiles: [], missingFiles: relevantMissing }))
  }

  const knownFiles = new Set([...scope.diskFiles, ...scope.trackedFiles].map(normalizeRepoPath))
  const selectsEntireKnownScope = requestedFiles.size === knownFiles.size
  if (selectsEntireKnownScope && scope.untrackedFiles.length > 0) {
    throw new Error(formatScopeMismatch(scope))
  }

  const relevantUntracked = scope.untrackedFiles.filter((file) => requestedFiles.has(file))
  if (relevantUntracked.length === 0) return scope

  const scopedMismatch = { ...scope, untrackedFiles: relevantUntracked, missingFiles: [] }
  if (!allowUntracked) throw new Error(formatScopeMismatch(scopedMismatch))
  writeExceptionModeWarning(scopedMismatch, { suppressStdout: suppressStdoutWarning })
  return scope
}

function assertRealQaScope({ repoRoot, allowUntracked = false, argv = process.argv }) {
  const scope = getRealQaScope({ repoRoot })
  return decideRealQaScope({
    scope,
    allowUntracked,
    explicitPathArgs: resolveExplicitPathArgs(argv),
    repoRoot,
    suppressStdoutWarning: usesStdoutSensitiveReporter(argv),
  })
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
  listGitignoredUntrackedRealQaFiles,
  listTrackedRealQaFiles,
  EXPLICIT_PATH_ARGS_ENV_VAR,
  EXPLICIT_PATH_TOKEN_ENV_VAR,
  parseExplicitPathArgs,
  resolveExplicitPathArgs,
  resolveRequestedFiles,
  usesStdoutSensitiveReporter,
}
