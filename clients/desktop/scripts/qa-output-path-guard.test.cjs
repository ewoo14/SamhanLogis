/**
 * QA 출력 경로·덮어쓰기 가드 회귀 테스트 (이슈 #863).
 *
 * 2026-07-27 R1 재수렴 — 원래 이 파일은 `resolveQaShotsDir`(real-QA)와
 * `resolveMockQaShotsDir`(mock 전용)를 따로 검증했다. 그 전제 — "mock 스펙 41개가
 * docs/qa 에 직접 쓴다" — 가 거짓으로 드러났다(PR #952 R1 적대검증): 전환 대상 35파일
 * 전부가 main 에서 이미 resolveQaShotsDir 를 경유했고 기본값도 이미 `_local` 이었다.
 * 게다가 함수명이 갈리자 harness-false-green-guard.test.ts 의 H-2 가드
 * (decl.body.includes('resolveQaShotsDir') 부분문자열 검사)가 깨져 전환 대상
 * 34~35파일이 전부 위반으로 뒤집혔다(Frontend Desktop CI RED). 그래서 mock 측
 * 이름 변경·전환은 되돌리고, real-QA·mock 공통 단일 함수(resolveQaShotsDir)로
 * 합쳤다 — "raw docs/qa 인벤토리=41" 류 카운트 테스트는 그 전제와 함께 폐기한다
 * (그 자리를 대신하는, 레포 전체를 훑는 훨씬 더 정확한 검사가
 * clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts 의
 * H-2 다 — 이 파일과 중복하지 않는다).
 *
 * 이 파일에 남기는 것 — D-3(전역 QA_SHOTS_DIR 가 "다른 슬러그"·"docs/qa 루트 자체"를
 * 전혀 막지 못했던 문제)의 회귀 가드와, resolver 3벌(.ts/.mjs/.cjs)의 parity 검증.
 *
 * 2026-07-28 R3 재수렴 — R2 가 추가한 물리 경로 판정 테스트("물리적으로 docs/qa 아래인
 * junction·extended·표기 변형은 세 resolver가 차단한다")가 `extended-root`·
 * `extended-missing`·`case` 세 케이스에서 플랫폼 분기 없이 Windows 판정(확장 길이
 * prefix 제거·대소문자 무시)을 무조건 단언해, 리눅스 CI(desktop-playwright 잡의
 * mock 회귀 hard gate 641 테스트 전체)를 막았다. resolver 자신은 이 세 의미론을
 * `process.platform === 'win32'` 로 정확히 분기하므로(qa-shots-dir.cjs:43,52 등),
 * POSIX 에서는 이 표기들이 물리적으로 다른(차단되지 않아야 할) 경로다 — resolver 는
 * 옳고 테스트가 틀렸다. 세 케이스는 이제 Windows 에서만 실행한다(POSIX 에서 실행하면
 * resolver 가 차단하지 않고 실제 mkdirSync 까지 진행해 저장소 밖에 부작용을 남기므로,
 * "차단 안 됨"을 직접 단언하는 대신 아예 실행하지 않는다).
 *
 * 2026-07-28 재수렴(D-A/D-B/N-1/N-2) — 신규 `scripts/lib/qa-shots-dir.ps1`(UTF-16LE+BOM)가
 * `.gitattributes`의 `*.ps1 text eol=crlf`(UTF-16 예외 목록에 미등재)로 인해 체크아웃마다
 * 바이트 정렬이 깨져(신규 클론에서만 재현 — 기존 워크트리는 이미 자리잡은 파일이라 재현
 * 안 됨) 30개 스크립트가 dot-source 시점에 파싱 실패했는데도 CI 는 green 이었다: 손상된
 * 바이트를 `readSourceText`가 UTF-16 디코드하면 쓰레기가 나와 `discoverQaResolverSources()`
 * 의 정규식이 매치하지 못해 그 사본이 인벤토리에서 조용히 사라지고, 당시 하한이
 * `count >= 8`이라 10→9 손실을 흡수했다(D-A). 대응: ① `.gitattributes`에
 * `scripts/lib/qa-shots-dir.ps1 -text`를 추가(기존 `operational-validation.ps1`과 동일
 * 패턴). ② 아래 "N-2" 테스트로 하한을 정확한 목록 비교로 강화 — 사본 하나가 사라지면
 * 반드시 RED. ③ 아래 "N-1" 테스트로 `git checkout-index`(신규 클론과 동일한 EOL/attr
 * 처리)가 UTF-16 resolver 사본을 committed blob 과 바이트 단위로 동일하게 materialize
 * 하는지 직접 검증 — PowerShell 실행 없이 Windows·Linux CI 양쪽에서 이 회귀 클래스
 * 전체(향후 추가되는 UTF-16 사본 포함)를 잡는다. 별개로 `generate-sp-08-4-4-order-print-
 * form-screenshots.ps1:99`의 `Join-Path (Get-Location) $OutputDir`도 고쳤다(D-B) — main
 * 에서는 `$OutputDir` 기본값이 상대경로라 옳았지만, 이 PR 이 `Resolve-QaShotsDir`(항상
 * 절대경로)로 바꾸며 PowerShell Join-Path(.NET Path.Combine과 달리 절대+절대 결합 시
 * 첫 인자를 버리지 않음)가 `C:\...\C:\...` 형태로 깨져 New-Item/Save 가 전부 실패하고도
 * exit 0 + "Generated..." 문구가 그대로 찍혔다 — 그 스크립트 자체에 산출물 존재 검증을
 * 추가해 실패가 성공처럼 보이지 않게 했다(N-3, 이 테스트 파일 범위 밖).
 *
 * 실행: `node --test clients/desktop/scripts/qa-output-path-guard.test.cjs`
 * (CI: .github/workflows/qa-e2e.yml desktop-playwright 잡, "QA 출력 경로·덮어쓰기 가드" step)
 */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const typescript = require('typescript')

const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '../..')
const docsQaRoot = path.join(repoRoot, 'docs', 'qa')
const tsHelperPath = path.join(desktopRoot, 'playwright', 'support', 'qa-screenshot-dir.ts')
const mjsHelperPath = path.join(desktopRoot, 'playwright', 'support', 'qa-screenshot-dir.mjs')
const rootMjsHelperPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.mjs')
const qaPlaywrightHelperPath = path.join(repoRoot, 'qa', 'playwright', 'utils', 'screenshot.ts')
const tempRoot = path.join(os.tmpdir(), 'samhan-863-qa-output-path-guard')

/**
 * D-3 재현에 쓰는 "다른 슬러그" 고정값 — `docs/qa/809-partner-product-price-memory`
 * (git 추적 PNG 504장, 2026-07-27 R1 fix 라운드 실측). `897-column-hierarchy` 는
 * 추적 파일이 0건이라(R1 적대검증 지적) 실제 커밋 증거가 있는 디렉터리로 바꿨다 —
 * 어차피 이 가드는 mkdirSync 이전에 throw 하므로 어느 디렉터리를 골라도 실제로는
 * 쓰지 않지만, "커밋 증거가 있는 경로를 겨눴다"는 근거를 남기기 위해 실존 디렉터리를 쓴다.
 */
const OTHER_SLUG_COMMITTED_DIR = path.join(docsQaRoot, '809-partner-product-price-memory')
const MY_FIXTURE_COMMITTED_DIR = path.join(docsQaRoot, '__863-r1-guard-fixture__')

function resetEnvironment() {
  delete process.env.QA_SHOTS_DIR
  delete process.env.QA_ALLOW_OVERWRITE
  delete process.env.QA_REPO_ROOT
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

test.afterEach(resetEnvironment)
test.after(resetEnvironment)

test('resolver 기본 출력(QA_SHOTS_DIR 미지정)은 <committedDir>/_local 이다', () => {
  const committedDir = path.join(tempRoot, 'committed')
  assert.equal(resolveQaShotsDir(committedDir), path.join(committedDir, '_local'))
})

test('D-3 [B] 자기 슬러그 커밋 경로를 QA_SHOTS_DIR 로 지정하면 QA_ALLOW_OVERWRITE 없이는 차단한다 (회귀 없음)', () => {
  process.env.QA_SHOTS_DIR = MY_FIXTURE_COMMITTED_DIR

  assert.throws(
    () => resolveQaShotsDir(MY_FIXTURE_COMMITTED_DIR),
    error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
  )
})

test('D-3 [D] 자기 슬러그를 ".." 우회 표기로 지정해도 차단한다 (회귀 없음)', () => {
  process.env.QA_SHOTS_DIR = path.join(docsQaRoot, 'some-other-slug', '..', '__863-r1-guard-fixture__')

  assert.throws(
    () => resolveQaShotsDir(MY_FIXTURE_COMMITTED_DIR),
    error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
  )
})

test('D-3 [A] 다른 슬러그의 커밋 디렉터리를 QA_SHOTS_DIR 로 지정하면 차단한다 (R1 적대검증 원 지적 — fix 전 BLOCKED=FALSE 였다)', () => {
  process.env.QA_SHOTS_DIR = OTHER_SLUG_COMMITTED_DIR

  assert.throws(
    () => resolveQaShotsDir(MY_FIXTURE_COMMITTED_DIR),
    error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
  )
})

test('D-3 [C] docs/qa 루트 자체를 QA_SHOTS_DIR 로 지정하면 차단한다 (R1 적대검증 원 지적 — fix 전 BLOCKED=FALSE 였다)', () => {
  process.env.QA_SHOTS_DIR = docsQaRoot

  assert.throws(
    () => resolveQaShotsDir(MY_FIXTURE_COMMITTED_DIR),
    error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
  )
})

test('D-3 A~D 전부 QA_ALLOW_OVERWRITE=1 이면 명시 경로를 그대로 사용한다 (승격 opt-in 은 유지)', () => {
  process.env.QA_ALLOW_OVERWRITE = '1'
  const cases = {
    A: OTHER_SLUG_COMMITTED_DIR,
    B: MY_FIXTURE_COMMITTED_DIR,
    C: docsQaRoot,
    D: path.join(docsQaRoot, 'some-other-slug', '..', '__863-r1-guard-fixture__'),
  }
  for (const [label, target] of Object.entries(cases)) {
    process.env.QA_SHOTS_DIR = target
    assert.equal(resolveQaShotsDir(MY_FIXTURE_COMMITTED_DIR), path.resolve(target), `케이스 ${label} 이 통과하지 않음`)
  }
})

function loadTypeScriptResolver() {
  // 이 테스트는 CommonJS로 실행되므로 import.meta.url만 불변의 __dirname 분기로 치환한다.
  // resolver 본문은 저장소의 .ts 원문을 TypeScript로 변환해 그대로 실행한다.
  const source = fs.readFileSync(tsHelperPath, 'utf8').replaceAll('import.meta.url', "''")
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText
  const moduleValue = { exports: {} }
  const wrapper = vm.runInThisContext(
    `(function(require,module,exports,__dirname,__filename){${output}\n})`,
    { filename: tsHelperPath },
  )
  wrapper(require, moduleValue, moduleValue.exports, path.dirname(tsHelperPath), tsHelperPath)
  return moduleValue.exports.resolveQaShotsDir
}

function loadQaPlaywrightCapture() {
  const source = fs.readFileSync(qaPlaywrightHelperPath, 'utf8').replaceAll('import.meta.url', "''")
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText
  const moduleValue = { exports: {} }
  const wrapper = vm.runInThisContext(
    `(function(require,module,exports,__dirname,__filename){${output}\n})`,
    { filename: qaPlaywrightHelperPath },
  )
  wrapper(require, moduleValue, moduleValue.exports, path.dirname(qaPlaywrightHelperPath), qaPlaywrightHelperPath)
  return moduleValue.exports.captureForQa
}

test('물리적으로 docs/qa 아래인 junction·extended·표기 변형은 세 resolver가 차단한다', async () => {
  const junctionRoot = path.join(tempRoot, 'junction-to-docs-qa')
  const junctionMissing = path.join(junctionRoot, '__863-r2-not-created__')
  const extendedRoot = `\\\\?\\${docsQaRoot}`
  const extendedMissing = `${extendedRoot}\\__863-r2-not-created__`
  const relativeOtherSlug = path.relative(process.cwd(), OTHER_SLUG_COMMITTED_DIR)
  const lowerDriveOtherSlug = OTHER_SLUG_COMMITTED_DIR.replace(
    /^([A-Z]):/,
    (_, drive) => `${drive.toLowerCase()}:`,
  )
  fs.mkdirSync(tempRoot, { recursive: true })
  fs.symlinkSync(docsQaRoot, junctionRoot, 'junction')

  const { resolveQaShotsDir: mjsResolve } = await import(pathToFileURL(mjsHelperPath).href)
  const { resolveQaShotsDir: rootMjsResolve } = await import(pathToFileURL(rootMjsHelperPath).href)
  const resolvers = [
    ['cjs', resolveQaShotsDir],
    ['mjs', mjsResolve],
    ['root-mjs', rootMjsResolve],
    ['ts', loadTypeScriptResolver()],
  ]
  // 플랫폼 불문 케이스 — junction·후행 구분자·상대/절대·드라이브 문자는 물리적으로
  // 같은 경로임이 POSIX 에서도 성립한다(리눅스 CI 재현으로 확인, R3 재수렴).
  const universalCases = [
    ['junction-root', junctionRoot],
    ['junction-missing', junctionMissing],
    ['trailing-separator', `${OTHER_SLUG_COMMITTED_DIR}${path.sep}`],
    ['relative', relativeOtherSlug],
    ['absolute', path.resolve(OTHER_SLUG_COMMITTED_DIR)],
    ['drive-letter', lowerDriveOtherSlug],
  ]
  // Windows 전용 케이스 — `\\?\` 확장 길이 prefix 제거와 대소문자 무시는 Windows
  // 파일시스템 의미론이고, resolver 도 이를 `process.platform === 'win32'` 로 정확히
  // 분기한다(qa-shots-dir.cjs:43,52 · qa-screenshot-dir.ts:73,82 · .mjs:38,47). POSIX
  // 에서 `\\?\<path>` 표기와 대문자 표기는 물리적으로 "다른"(실존하지 않는) 경로이므로
  // resolver 가 차단하지 '않는' 것이 옳다 — 여기서 무조건 차단을 단언한 R2 테스트가
  // 리눅스 CI(mock 회귀 hard gate 641 테스트 게이트)를 막았다(R3 재수렴, 2026-07-28,
  // PR #952). POSIX 에서 "차단되지 않음"을 직접 단언하는 대신 이 세 케이스를 아예
  // 실행하지 않는다: 차단되지 않으면 resolver 가 실제 fs.mkdirSync 까지 진행해
  // 저장소 밖(심하면 파일시스템 루트 바로 아래)에 우연한 대문자/이스케이프 경로를
  // 실제로 생성해버리는 부작용이 있기 때문이다.
  const windowsOnlyCases = [
    ['extended-root', extendedRoot],
    ['extended-missing', extendedMissing],
    ['case', OTHER_SLUG_COMMITTED_DIR.toUpperCase()],
  ]
  const isWindows = process.platform === 'win32'
  const cases = isWindows ? [...universalCases, ...windowsOnlyCases] : universalCases

  for (const [resolverName, resolver] of resolvers) {
    for (const [caseName, target] of cases) {
      process.env.QA_SHOTS_DIR = target
      assert.throws(
        () => resolver(MY_FIXTURE_COMMITTED_DIR),
        error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
        `${resolverName}:${caseName} 물리 경로가 차단되지 않음`,
      )
    }
  }
})

test('qa/playwright captureForQa도 물리적으로 docs/qa 아래인 목적지를 차단한다', async () => {
  const junctionRoot = path.join(tempRoot, 'qa-playwright-junction-to-docs-qa')
  fs.mkdirSync(tempRoot, { recursive: true })
  fs.symlinkSync(docsQaRoot, junctionRoot, 'junction')

  const captureForQa = loadQaPlaywrightCapture()
  process.env.QA_REPO_ROOT = repoRoot
  process.env.QA_SHOTS_DIR = junctionRoot

  const page = {
    screenshot: async () => {
      throw new Error('물리 경로 가드가 먼저 실패해야 합니다')
    },
  }
  const testInfo = { attach: async () => {} }

  await assert.rejects(
    () => captureForQa(page, testInfo, 'qa-playwright-physical-alias'),
    error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
  )
})

test('qa/playwright captureForQa의 기본 출력과 명시적 승격은 계속 통과한다', async () => {
  const qaRepoRoot = path.join(tempRoot, 'qa-playwright-repo')
  const captureForQa = loadQaPlaywrightCapture()
  const capturedPaths = []
  const page = { screenshot: async ({ path: target }) => capturedPaths.push(target) }
  const testInfo = { attach: async () => {} }
  process.env.QA_REPO_ROOT = qaRepoRoot

  const localTarget = await captureForQa(page, testInfo, 'first-capture')
  assert.equal(localTarget, capturedPaths[0])
  assert.match(localTarget, /[\\/]phase7-e2e[\\/]_local[\\/]first-capture\.png$/)

  process.env.QA_SHOTS_DIR = path.join(tempRoot, 'promoted-output')
  process.env.QA_ALLOW_OVERWRITE = '1'
  const promotedTarget = await captureForQa(page, testInfo, 'promoted-capture')
  assert.equal(promotedTarget, capturedPaths[1])
  assert.match(promotedTarget, /[\\/]promoted-output[\\/]promoted-capture\.png$/)
})

test('qa/playwright 캡처 호출은 실행 시 docs/qa 직접 경로를 사용하지 않는다', () => {
  const files = []
  const pending = [path.join(repoRoot, 'qa', 'playwright')]
  while (pending.length > 0) {
    const current = pending.pop()
    const stat = fs.statSync(current)
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        if (entry !== 'node_modules' && entry !== 'test-results' && entry !== 'playwright-report') {
          pending.push(path.join(current, entry))
        }
      }
    } else if (/\.(mjs|js|cjs|ts)$/.test(current)) {
      files.push(current)
    }
  }

  const directPaths = files.flatMap(file => {
    const source = fs.readFileSync(file, 'utf8')
    return source.match(/path:\s*['\"]docs[\\/]qa[\\/][^'\"]+/g) ?? []
  })

  assert.deepEqual(directPaths, [], `직접 docs/qa 캡처 경로 ${directPaths.length}개가 남아 있습니다`)
})

// D-1 (2026-07-28 R1 적대검증) 이 제외해야 하는 디렉토리 이름 — repoRoot 전체를 훑는
// 동안 어떤 깊이에서도 이 이름을 가진 디렉토리는 서브트리째 건너뛴다. `.claude` 는 이
// 저장소 관례상 `.claude/worktrees/**` 에 이 저장소 자신의 다른 git worktree 전체
// (다른 브랜치 체크아웃)를 담고 있다 — 그 worktree 들은 별도 진행 중 작업이라 이
// 가드 대상이 아닌데도 실측 41개 파일(그중 36개가 .claude/worktrees 출처)이
// 물리 판정 마커 없이 걸려 개발자 로컬(메인 체크아웃, 활성 worktree 다수)에서
// hard RED 였고, 부수로 전체 walk 가 1.1초 → 73.8초로 느려졌다(worktree 22개 실측).
// CI 러너에는 `.claude/worktrees` 가 없어 이 결함이 CI 로는 전혀 드러나지 않는다.
const EXCLUDED_DIR_NAMES = new Set(['.git', '.claude', 'node_modules', 'test-results', 'playwright-report'])

// N-2 (2026-07-28 재수렴) — 이전엔 `sources.length >= 8` 느슨한 하한이었다. 실제 인벤토리는
// 10개인데, resolver 사본 하나가 인코딩 손상으로 발견에서 조용히 사라져도(9개) 그 하한을
// 여전히 만족해 CI 가 green 이었다(D-A). 정확한 목록 비교로 강화한다 — 사본이 하나라도
// 사라지거나(경로 바뀜·인코딩 손상·정규식 미매치) 늘어나면 즉시 RED. 새 resolver 사본을
// 의도적으로 추가/제거했다면 이 목록도 함께 갱신할 것(그 자체가 "발견을 인지했다"는 의도적
// 신호다 — 조용한 하한 통과가 아니라).
const EXPECTED_RESOLVER_PATHS = [
  'clients/desktop/playwright/support/qa-screenshot-dir.mjs',
  'clients/desktop/playwright/support/qa-screenshot-dir.ts',
  'clients/desktop/src/main/capture.ts',
  'infrastructure/scripts/operational-validation.ps1',
  'qa/playwright/utils/screenshot.ts',
  'scripts/lib/qa_shots_dir.py',
  'scripts/lib/qa-shots-dir.cjs',
  'scripts/lib/qa-shots-dir.mjs',
  'scripts/lib/qa-shots-dir.ps1',
  'scripts/lib/qa-shots-dir.sh',
]

function discoverQaResolverSources() {
  const sources = []
  const pending = [repoRoot]
  while (pending.length > 0) {
    const current = pending.pop()
    const stat = fs.statSync(current)
    if (stat.isDirectory()) {
      const name = path.basename(current)
      if (!EXCLUDED_DIR_NAMES.has(name)) {
        for (const entry of fs.readdirSync(current)) pending.push(path.join(current, entry))
      }
      continue
    }

    if (!/\.(cjs|mjs|ps1|py|sh|ts)$/.test(current) || /\.test\.[^.]+$/.test(current)) continue
    const source = readSourceText(current)
    const declaresResolver =
      /\b(?:function|def)\s+(?:resolveQaShotsDir|resolve_qa_shots_dir|Resolve-QaShotsDir|resolveOutputDir)\b/.test(source) ||
      /\bresolve_qa_shots_dir\s*\(\s*\)/.test(source)
    if (source.includes('QA_SHOTS_DIR') && declaresResolver) sources.push({ path: current, source })
  }
  return sources.sort((left, right) => left.path.localeCompare(right.path))
}

function readSourceText(filePath) {
  const content = fs.readFileSync(filePath)
  if (content[0] === 0xff && content[1] === 0xfe) return content.subarray(2).toString('utf16le')
  if (content[0] === 0xfe && content[1] === 0xff) return content.subarray(2).toString('utf16le')
  return content.toString('utf8')
}

test('QA resolver 가드 표면은 저장소 소스에서 동적으로 발견되고 물리 판정을 선언한다', () => {
  const sources = discoverQaResolverSources()
  const relativePaths = sources.map(({ path: filePath }) => path.relative(repoRoot, filePath).replaceAll(path.sep, '/'))

  assert.deepStrictEqual(
    relativePaths,
    EXPECTED_RESOLVER_PATHS,
    `resolver 인벤토리가 예상 목록과 다릅니다(발견 ${relativePaths.length}개, 예상 ${EXPECTED_RESOLVER_PATHS.length}개). ` +
      '사본이 조용히 사라지면(인코딩 손상으로 소스가 깨져 정규식 미매치 등) 느슨한 하한(>=8)은 이를 흡수했다(D-A, 2026-07-28). ' +
      'resolver 사본을 의도적으로 추가/제거했다면 EXPECTED_RESOLVER_PATHS 도 함께 갱신할 것.',
  )
  for (const { path: filePath, source } of sources) {
    assert.match(
      source,
      /DOCS_QA_ROOT|isWithinPhysical|_is_within_physical|_qa_is_within_physical|Test-QaPhysicalWithin/,
      `${path.relative(repoRoot, filePath)} 에 물리 경로 판정이 없습니다`,
    )
  }

  console.log(`[QA resolver inventory] count=${sources.length} ${relativePaths.join(', ')}`)
})

test('N-2 (2026-07-28 재수렴) — 느슨한 하한(>=8)은 사본 1개 손실(10→9)을 흡수하지만 정확한 목록 비교는 잡는다', () => {
  // 이 테스트는 discoverQaResolverSources() 를 다시 부르지 않는다 — "가드 로직 자체의
  // 민감도"를 검증하는 메타 테스트다(D-A 때 실제로 벌어진 일: 인코딩 손상으로 사본 1개가
  // 조용히 사라져 10→9 가 됐는데 당시 하한 `count >= 8` 은 여전히 통과였다).
  const droppedByOne = EXPECTED_RESOLVER_PATHS.slice(0, -1)
  assert.equal(droppedByOne.length, EXPECTED_RESOLVER_PATHS.length - 1)

  // 옛 느슨한 하한 — 9개도 여전히 통과시켰다(이게 D-A 를 흡수한 바로 그 조건이다).
  assert.ok(droppedByOne.length >= 8, '(참고용, 회귀 없음 확인) 예전 하한도 9개를 통과시켰어야 한다')

  // 새 정확한 목록 비교 — 사본 1개 손실을 반드시 RED 로 잡아야 한다.
  assert.throws(
    () => assert.deepStrictEqual(droppedByOne, EXPECTED_RESOLVER_PATHS),
    /AssertionError/,
    '정확한 목록 비교가 사본 1개 손실을 잡지 못했습니다 — N-2 가 회귀했습니다',
  )
})

test('N-1 (2026-07-28 재수렴, D-A 회귀 가드) — UTF-16 resolver 사본은 git checkout 시 committed blob 과 바이트가 동일하다', () => {
  // git checkout-index 는 실제 checkout/신규 clone 과 동일한 clean/smudge·EOL 변환을
  // 거친다(단 대상 경로 밖 --prefix 로만 써서 이 워크트리의 추적 파일은 절대 건드리지
  // 않는다). UTF-16 파일에 `*.ps1 text eol=crlf` 류 EOL 강제가 적용되면 바이트 정렬이
  // 깨진다(D-A) — 이 테스트는 그 손상이 CI 에서도(PowerShell 실행 없이, Windows·Linux
  // 무관) 잡히게 한다. discoverQaResolverSources() 가 찾아낸 "지금 이 순간의" 전체
  // resolver 사본을 대상으로 하므로, 향후 추가되는 UTF-16 사본도 자동으로 커버한다.
  const sources = discoverQaResolverSources()
  const checkoutRoot = path.join(tempRoot, 'n1-checkout-index-probe')
  fs.rmSync(checkoutRoot, { recursive: true, force: true })
  fs.mkdirSync(checkoutRoot, { recursive: true })

  let utf16Checked = 0
  for (const { path: filePath } of sources) {
    const relPath = path.relative(repoRoot, filePath).replaceAll(path.sep, '/')
    const blobBuffer = execFileSync('git', ['cat-file', 'blob', `HEAD:${relPath}`], {
      cwd: repoRoot,
      maxBuffer: 20 * 1024 * 1024,
    })
    const isUtf16 =
      (blobBuffer[0] === 0xff && blobBuffer[1] === 0xfe) || (blobBuffer[0] === 0xfe && blobBuffer[1] === 0xff)
    if (!isUtf16) continue // 이 회귀는 UTF-16 파일에만 해당한다 — 다른 인코딩은 EOL 변환 자체가 안전하다(N-4 sweep 확인).
    utf16Checked += 1

    const prefix = `${checkoutRoot.replaceAll('\\', '/')}/`
    execFileSync('git', ['checkout-index', `--prefix=${prefix}`, '--', relPath], { cwd: repoRoot })
    const checkedOutBuffer = fs.readFileSync(path.join(checkoutRoot, ...relPath.split('/')))

    assert.ok(
      blobBuffer.equals(checkedOutBuffer),
      `${relPath} 가 git checkout(신규 클론과 동일한 EOL/attr 처리)에서 committed blob 과 바이트가 다릅니다 ` +
        `(blob ${blobBuffer.length}바이트, checkout ${checkedOutBuffer.length}바이트) — UTF-16 파일에 CRLF 변환이 ` +
        `적용되면 바이트 정렬이 깨집니다(D-A). .gitattributes 에 '${relPath} -text' 를 추가하세요.`,
    )
  }

  // 최소 1개(scripts/lib/qa-shots-dir.ps1, infrastructure/scripts/operational-validation.ps1)는
  // 항상 UTF-16 이어야 한다 — 0건이면 discoverQaResolverSources() 자체가 손상됐다는 신호다.
  assert.ok(utf16Checked >= 1, 'UTF-16 resolver 사본이 하나도 발견되지 않았습니다(discoverQaResolverSources 이상 의심)')
})

test('resolver 3벌(.ts/.mjs/.cjs)이 같은 계약을 선언한다 — .ts 소스는 구조 마커로, .mjs 는 실행으로 대조', async () => {
  // .ts 는 이 CommonJS 테스트에서 직접 require/import 할 수 없다(ts-node 미설치) — 소스 텍스트로
  // 핵심 계약 마커(기본값 _local·DOCS_QA_ROOT 기반 가드·QA_ALLOW_OVERWRITE 탈출구)를 확인한다.
  // 실제 런타임 동작은 clients/desktop 전체 Playwright mock 스위트 실행(.ts 를 실제로 실행)과
  // 아래 .mjs 실행 비교로 이중 확인한다.
  const tsSource = fs.readFileSync(tsHelperPath, 'utf8')
  assert.match(tsSource, /path\.join\(committed,\s*'_local'\)/, '.ts 기본값이 _local 이 아님 (D-2 회귀)')
  assert.match(tsSource, /DOCS_QA_ROOT/, '.ts 에 전역 docs/qa 루트 가드가 없음 (D-3 미이관)')
  assert.match(tsSource, /QA_ALLOW_OVERWRITE/, '.ts 에 명시 허용 탈출구가 없음')
  assert.match(tsSource, /export function resolveQaShotsDir/, '.ts 가 resolveQaShotsDir 를 export 하지 않음 (H-2 가드 대상)')
  assert.doesNotMatch(
    tsSource,
    /export function resolveMockQaShotsDir/,
    '.ts 가 별도 mock 전용 함수를 다시 export 함 (H-2 재발 위험 — resolveQaShotsDir 단일 함수로 유지할 것)',
  )

  const mjsSource = fs.readFileSync(mjsHelperPath, 'utf8')
  assert.match(mjsSource, /DOCS_QA_ROOT/, '.mjs 에 전역 docs/qa 루트 가드가 없음 (D-3 미이관)')

  const qaPlaywrightSource = fs.readFileSync(qaPlaywrightHelperPath, 'utf8')
  assert.match(qaPlaywrightSource, /DOCS_QA_ROOT/, 'qa/playwright resolver에 전역 docs/qa 루트 가드가 없음')

  const { resolveQaShotsDir: mjsResolve } = await import(pathToFileURL(mjsHelperPath).href)
  const committedDir = path.join(tempRoot, 'ts-mjs-parity')

  // 기본값 parity
  assert.equal(mjsResolve(committedDir), resolveQaShotsDir(committedDir))

  // D-3 parity — 다른 슬러그 지정 시 .mjs 도 동일하게 차단
  process.env.QA_SHOTS_DIR = OTHER_SLUG_COMMITTED_DIR
  assert.throws(() => mjsResolve(committedDir), /QA_ALLOW_OVERWRITE=1/)

  // QA_ALLOW_OVERWRITE parity
  process.env.QA_ALLOW_OVERWRITE = '1'
  assert.equal(mjsResolve(committedDir), resolveQaShotsDir(committedDir))
})

// ============================================================================
// 2026-07-28 재수렴 D-C/D-D/T-5 — "-OutputDir/-OutDir 파라미터가 가드를 통째로 우회한다".
//
// 위의 모든 테스트는 resolver 함수(resolveQaShotsDir 등)를 "직접" 호출해서 검사한다. D-C 는
// 바로 그 전제를 깬 결함이었다 — scripts/generate-*.ps1 14개 + loadtest-metrics-snapshot.ps1
// 이 `if (-not $OutputDir) { $OutputDir = Resolve-QaShotsDir ... }` 형태로 -OutputDir 가
// 비어있을 때만 resolver 를 불렀다. -OutputDir 를 명시하면(예: 커밋된 docs/qa 슬러그 경로
// 그대로) resolver 자체가 호출되지 않아 "resolver 를 직접 호출해서 검사" 하는 방식으로는
// 이 결함을 절대 잡을 수 없었다 — 환경변수(QA_SHOTS_DIR)는 차단되는데 파라미터(-OutputDir)는
// 그대로 통과해 커밋 PNG 4장이 실제로 덮어써졌다(신규 clone 실측 CASE 2/3).
//
// 아래 테스트들은 그래서 두 층으로 나뉜다:
//   1) 구조 sweep — 15개 호출부 전부가 무조건 Resolve-QaShotsDir 를 -RequestedDir 로 부르는지
//      (PowerShell 실행 없이, N-2 와 동일한 "정확한 목록 비교" 패턴으로 회귀를 잡는다).
//   2) 실 프로세스 실행 — 실제 .ps1 파일을 자식 프로세스로 띄워 진짜 -OutputDir/-OutDir
//      파라미터 경로를 통과시킨다(resolver 를 우회해서 부르지 않는다). 차단(guard) 케이스는
//      가드가 New-Item/Add-Type 이전에 throw 하므로 Windows/Linux(pwsh) 모두에서 안전하게
//      실행할 수 있다 — 저장소의 실제 docs/qa 아래 존재하지 않는 fixture 슬러그만 겨눈다.
// ============================================================================

function findPowerShellExecutable() {
  for (const candidate of ['pwsh', 'powershell']) {
    try {
      execFileSync(candidate, ['-NoProfile', '-Command', 'exit 0'], { stdio: 'ignore' })
      return candidate
    } catch {
      continue
    }
  }
  return null
}

const POWERSHELL_EXE = findPowerShellExecutable()
const POWERSHELL_SKIP_REASON = POWERSHELL_EXE ? false : '이 환경에 pwsh/powershell 실행파일이 없습니다'

// -OutputDir/-OutDir 파라미터를 노출하는 스크립트 15개의 정확한 목록 — N-2 와 동일하게
// "느슨한 개수" 가 아니라 "정확한 목록" 으로 비교한다(하나만 고치고 14개를 빠뜨리는 회귀,
// 또는 새 스크립트가 같은 파라미터를 추가하고 가드를 안 받는 회귀를 모두 잡는다).
const EXPECTED_OUTPUT_DIR_PARAM_SCRIPTS = [
  'scripts/generate-sp-08-3-2-arologis-history-screenshots.ps1',
  'scripts/generate-sp-08-3-3-slip-cleanup-history-screenshots.ps1',
  'scripts/generate-sp-08-3-4-dispatch-sms-history-screenshots.ps1',
  'scripts/generate-sp-08-4-1-partner-order-list-detail-screenshots.ps1',
  'scripts/generate-sp-08-4-4-order-print-form-screenshots.ps1',
  'scripts/generate-sp-08-5-1-purchase-slip-list-detail-screenshots.ps1',
  'scripts/generate-sp-08-5-2-purchase-slip-edit-put-screenshots.ps1',
  'scripts/generate-sp-08-5-3-purchase-slip-soft-delete-screenshots.ps1',
  'scripts/generate-sp-08-5-4-purchase-inspection-cta-regression-screenshots.ps1',
  'scripts/generate-sp-08-5-5-purchase-print-form-screenshots.ps1',
  'scripts/generate-sp-08-6-1-sales-slip-list-detail-screenshots.ps1',
  'scripts/generate-sp-08-6-2-sales-slip-edit-put-screenshots.ps1',
  'scripts/generate-sp-08-6-4-sales-print-form-screenshots.ps1',
  'scripts/loadtest-metrics-snapshot.ps1',
  'scripts/regen-sp-08-5-2-shot2.ps1',
].sort()

test('T-2/T-5 (2026-07-28 재수렴 D-C) — -OutputDir/-OutDir 파라미터 보유 스크립트 15개 전부가 무조건 Resolve-QaShotsDir 를 -RequestedDir 로 호출한다(구조 sweep)', () => {
  const scriptsRoot = path.join(repoRoot, 'scripts')
  const discovered = fs
    .readdirSync(scriptsRoot)
    .filter((name) => name.endsWith('.ps1'))
    .map((name) => path.join(scriptsRoot, name))
    .filter((filePath) => /\[string\]\$Out(?:put)?Dir\b/.test(readSourceText(filePath)))
    .map((filePath) => path.relative(repoRoot, filePath).replaceAll(path.sep, '/'))
    .sort()

  assert.deepStrictEqual(
    discovered,
    EXPECTED_OUTPUT_DIR_PARAM_SCRIPTS,
    `-OutputDir/-OutDir 파라미터 보유 스크립트 인벤토리가 예상과 다릅니다(발견 ${discovered.length}개, 예상 ${EXPECTED_OUTPUT_DIR_PARAM_SCRIPTS.length}개). ` +
      '새 스크립트를 추가/제거했다면 이 목록과 D-C fix(무조건 -RequestedDir 통과)를 함께 갱신할 것.',
  )

  for (const relPath of discovered) {
    const source = readSourceText(path.join(repoRoot, ...relPath.split('/')))
    assert.ok(
      !/if\s*\(\s*-not\s+\$OutputDir\s*\)/.test(source) && !/IsNullOrEmpty\(\$OutDir\)/.test(source),
      `${relPath} 가 여전히 -OutputDir/-OutDir 를 조건부(if 비어있을 때만)로만 가드에 통과시킵니다(D-C 재발) — ` +
        '무조건 Resolve-QaShotsDir 호출로 바뀌어야 합니다.',
    )
    assert.match(
      source,
      /-RequestedDir\s+\$Out(?:put)?Dir\b/,
      `${relPath} 가 Resolve-QaShotsDir 호출에 -RequestedDir 를 넘기지 않습니다(D-C 재발) — 파라미터 원문이 물리 판정을 받지 못합니다.`,
    )
  }
})

test(
  'T-5 (2026-07-28 재수렴 D-C) — 실제 .ps1 자식 프로세스를 -OutputDir 파라미터로 실행하면 커밋 경로가 차단된다(resolver 직접호출이 아닌 진짜 파라미터 경로)',
  { skip: POWERSHELL_SKIP_REASON },
  () => {
    const fixtureDir = path.join(docsQaRoot, '__851-r3-outputdir-param-guard-fixture__', 'screenshots')
    const scriptPath = path.join(repoRoot, 'scripts', 'generate-sp-08-4-4-order-print-form-screenshots.ps1')

    let threw = false
    let combined = ''
    try {
      combined = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-Command', `& '${scriptPath}' -OutputDir '${fixtureDir}'`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      threw = true
      combined = `${e.stdout ?? ''}${e.stderr ?? ''}`
    }

    assert.ok(threw, `-OutputDir 로 커밋 경로를 겨눴는데 차단되지 않았습니다(exit 0, D-C 재발). 출력: ${combined}`)
    assert.match(combined, /QA_ALLOW_OVERWRITE=1/, `가드 메시지가 아닌 다른 이유로 실패했을 수 있습니다. 출력: ${combined}`)
    assert.equal(
      fs.existsSync(fixtureDir) && fs.readdirSync(fixtureDir).length > 0,
      false,
      'PNG 가 실제로 write 됐습니다 — 가드가 New-Item/Save 이전에 막지 못했습니다.',
    )
  },
)

test(
  'T-5 (2026-07-28 재수렴 D-C) — loadtest-metrics-snapshot.ps1 의 -OutDir 파라미터도 같은 물리 가드를 받는다(다른 shape, repoRoot-relative)',
  { skip: POWERSHELL_SKIP_REASON },
  () => {
    const scriptPath = path.join(repoRoot, 'scripts', 'loadtest-metrics-snapshot.ps1')
    const fixtureRelOutDir = 'docs/qa/__851-r3-loadtest-outdir-param-guard-fixture__/timeseries'

    let threw = false
    let combined = ''
    try {
      combined = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-Command', `& '${scriptPath}' -OutDir '${fixtureRelOutDir}' -Once`], {
        encoding: 'utf8',
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      threw = true
      combined = `${e.stdout ?? ''}${e.stderr ?? ''}`
    }

    assert.ok(threw, `-OutDir 로 repoRoot-relative 커밋 경로를 겨눴는데 차단되지 않았습니다(exit 0, D-C 재발, loadtest shape). 출력: ${combined}`)
    assert.match(combined, /QA_ALLOW_OVERWRITE=1/, `가드 메시지가 아닌 다른 이유로 실패했을 수 있습니다. 출력: ${combined}`)
  },
)

test(
  'T-3 (2026-07-28 재수렴 회귀 가드) — loadtest-metrics-snapshot.ps1 의 정당한 repoRoot-relative -OutDir(docs/qa 밖)는 실제로 성공한다(GDI+ 불필요 — Windows/Linux 공용)',
  { skip: POWERSHELL_SKIP_REASON },
  () => {
    // docs/qa 밖이어야 "정당한(차단되지 않아야 할) override" 다 — docs/qa 아래는 슬러그가
    // 뭐든 전부 차단 대상이다(D-3 설계 자체가 그렇다). repoRoot 바로 아래 미추적 스크래치
    // "폴더"(파일 아님) 하나로 감싸 정리 시 그 폴더만 지우고 repoRoot 자체는 절대 건드리지
    // 않는다(fixtureRoot != repoRoot 를 아래에서 assert 로 이중 확인 후에만 rmSync 한다).
    const fixtureRoot = path.join(repoRoot, '__851-r3-loadtest-legit-relative-scratch__')
    const relOutDir = '__851-r3-loadtest-legit-relative-scratch__/out'
    const scriptPath = path.join(repoRoot, 'scripts', 'loadtest-metrics-snapshot.ps1')
    const absOutDir = path.join(repoRoot, ...relOutDir.split('/'))
    assert.notEqual(fixtureRoot, repoRoot, 'fixtureRoot 가 repoRoot 와 같습니다 — 절대 rmSync 하면 안 됩니다.')
    fs.rmSync(fixtureRoot, { recursive: true, force: true })

    try {
      const combined = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-Command', `& '${scriptPath}' -OutDir '${relOutDir}' -Once`], {
        encoding: 'utf8',
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      assert.match(combined, /snapshot appended/, `정당한 override 가 실패한 것처럼 보입니다. 출력: ${combined}`)
      const csvFiles = fs.readdirSync(absOutDir).filter((f) => f.endsWith('.csv'))
      assert.ok(csvFiles.length > 0, `CSV 산출물이 없습니다 — 정당한 override 가 실제로 동작하지 않았습니다(디렉터리: ${absOutDir}).`)
    } finally {
      // 실행 fixture 청소 — 이 테스트가 방금 만든 repoRoot 밖-아닌-전용 스크래치 폴더만 지운다.
      assert.notEqual(fixtureRoot, repoRoot, 'fixtureRoot 가 repoRoot 와 같습니다 — 절대 rmSync 하면 안 됩니다.')
      fs.rmSync(fixtureRoot, { recursive: true, force: true })
    }
  },
)

test(
  'D-D (2026-07-28 재수렴) — 상대경로 RequestedDir 는 Environment.CurrentDirectory 가 아니라 PowerShell $PWD(Set-Location 이후) 기준으로 절대화된다',
  { skip: POWERSHELL_SKIP_REASON },
  () => {
    // 이 환경에서 실측: Set-Location 은 $PWD 만 바꾸고 .NET Environment.CurrentDirectory 는
    // 그대로 둔다. 자식 프로세스를 dirB 에서 띄우면(둘 다 dirB 로 시작) 그 프로세스 "안"에서
    // Set-Location dirA 를 실행해야 비로소 두 값이 갈린다(새 프로세스를 dirA 로 다시 스폰하면
    // 그 새 프로세스는 시작부터 둘 다 dirA 로 동기화되어 재현이 안 된다 — 반드시 한 프로세스
    // 안에서 Set-Location 으로 갈라야 한다).
    const dirA = path.join(tempRoot, 'dd-pwd-envcwd', 'dirA')
    const dirB = path.join(tempRoot, 'dd-pwd-envcwd', 'dirB')
    fs.mkdirSync(dirA, { recursive: true })
    fs.mkdirSync(dirB, { recursive: true })

    const libPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.ps1')
    const fallbackCommittedDir = path.join(dirA, 'unused-fallback-committed-dir')
    const psCommand = [
      `Set-Location '${dirA}'`,
      `. '${libPath}'`,
      `Resolve-QaShotsDir -CommittedDir '${fallbackCommittedDir}' -RequestedDir 'tmp-rel-dd'`,
    ].join('; ')

    const output = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-Command', psCommand], {
      encoding: 'utf8',
      cwd: dirB,
    }).trim()

    const expected = path.join(dirA, 'tmp-rel-dd')
    assert.equal(
      output,
      expected,
      'RequestedDir 상대경로가 Set-Location 이후의 PowerShell $PWD 가 아니라 다른 기준(예: 프로세스 시작 위치 ' +
        `${dirB} = Environment.CurrentDirectory)으로 풀렸습니다 — D-D 재발. 실제 출력: ${output}`,
    )
  },
)

function loadCaptureOutputDirResolver(fakeDirname) {
  const capturePath = path.join(desktopRoot, 'src', 'main', 'capture.ts')
  const originalSource = fs.readFileSync(capturePath, 'utf8')
  const anchor = 'const __filename = fileURLToPath(import.meta.url)\nconst __dirname = dirname(__filename)'
  if (!originalSource.includes(anchor)) {
    throw new Error('capture.ts 의 __dirname 앵커 라인을 찾지 못했습니다 — 구조가 바뀌었으면 이 테스트도 갱신할 것.')
  }
  const patched = originalSource.replace(anchor, `const __dirname = ${JSON.stringify(fakeDirname)}`)
  const source = patched + '\nmodule.exports.__test__ = { resolveOutputDir };\n'
  const output = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
  }).outputText
  const moduleValue = { exports: {} }
  const fakeRequire = (id) => (id === 'electron' ? {} : require(id))
  const wrapper = vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: capturePath })
  wrapper(fakeRequire, moduleValue, moduleValue.exports)
  return moduleValue.exports.__test__.resolveOutputDir
}

test('capture.ts 관찰(2026-07-28 재수렴) — resolveOutputDir 는 process.cwd() 가 clients/desktop 이 아니어도 실제 docs/qa 를 올바르게 가리키고 가드가 그대로 작동한다', () => {
  // scripts/lib/qa-shots-dir.ps1 은 $PSScriptRoot(파일 자신의 물리 위치)에 앵커해서 D-3 류
  // 재발을 막았는데, capture.ts 의 원래 구현은 반대로 process.cwd()(메인 프로세스가 보통
  // clients/desktop 에서 뜬다는 가정)에 앵커했다. CAPTURE_MODE=1 이 clients/desktop 이 아닌
  // cwd(예: 저장소 루트에서 `electron .` 직접 실행)로 뜨면 docsQaRoot 자체가 엉뚱한 경로로
  // 계산되어 물리 판정이 조용히 통과해버렸다(재현 확인 후 __dirname 앵커로 수정, D-C 와 동일
  // 계열). dev(src/main)와 번들(electron-vite outDir=out/main) 두 실행 형태 모두 검증한다.
  const scenarios = [
    ['dev src/main 위치', path.join(desktopRoot, 'src', 'main')],
    ['bundled out/main 위치(electron-vite outDir)', path.join(desktopRoot, 'out', 'main')],
  ]
  const realCommittedDir = path.join(docsQaRoot, 'electron-skeleton-slice', 'screenshots')
  const realCwd = process.cwd

  try {
    for (const [label, fakeDirname] of scenarios) {
      const resolveOutputDir = loadCaptureOutputDirResolver(fakeDirname)
      process.cwd = () => repoRoot // 의도적으로 "틀린" cwd — fix 전엔 가드가 무력화되던 조건

      process.env.QA_SHOTS_DIR = realCommittedDir
      assert.throws(
        () => resolveOutputDir(),
        (error) => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
        `[${label}] cwd 가 clients/desktop 이 아닐 때 커밋된 electron-skeleton-slice 경로가 차단되지 않았습니다(재발).`,
      )
      delete process.env.QA_SHOTS_DIR

      const defaultDir = resolveOutputDir()
      assert.equal(
        defaultDir,
        path.join(realCommittedDir, '_local'),
        `[${label}] cwd 가 틀렸을 때 기본 출력 경로가 실제 docs/qa 를 가리키지 않습니다(엉뚱한 경로로 샐 위험).`,
      )
    }
  } finally {
    process.cwd = realCwd
    delete process.env.QA_SHOTS_DIR
  }
})
