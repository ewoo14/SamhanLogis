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
 * 실행: `node --test clients/desktop/scripts/qa-output-path-guard.test.cjs`
 * (CI: .github/workflows/qa-e2e.yml desktop-playwright 잡, "QA 출력 경로·덮어쓰기 가드" step)
 */
const assert = require('node:assert/strict')
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

function discoverQaResolverSources() {
  const sources = []
  const pending = [repoRoot]
  while (pending.length > 0) {
    const current = pending.pop()
    const stat = fs.statSync(current)
    if (stat.isDirectory()) {
      const name = path.basename(current)
      if (name !== '.git' && name !== 'node_modules' && name !== 'test-results' && name !== 'playwright-report') {
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

  assert.ok(sources.length >= 8, `resolver 사본이 예상 최소치보다 적습니다: ${sources.length}`)
  for (const { path: filePath, source } of sources) {
    assert.match(
      source,
      /DOCS_QA_ROOT|isWithinPhysical|_is_within_physical|_qa_is_within_physical|Test-QaPhysicalWithin/,
      `${path.relative(repoRoot, filePath)} 에 물리 경로 판정이 없습니다`,
    )
  }

  console.log(`[QA resolver inventory] count=${sources.length} ${relativePaths.join(', ')}`)
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
