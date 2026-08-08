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
 * `process.platform === 'win32'` 로 정확히 분기하므로(qa-shots-dir.cjs:81,91 등 — 2026-07-28
 * R5 재수렴 정정: 이 fix 로 또 줄번호가 밀렸다. 아래 249행 인용과 함께 이 fix 완료 후 최종
 * 파일 기준으로 다시 확인한 값이다. 향후 편집으로 다시 밀릴 수 있으니 회의적으로 볼 것),
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
const docsQaShotsRoot = path.join(repoRoot, 'docs', 'qa-shots')
const docsDevReportsRoot = path.join(repoRoot, 'docs', 'dev-reports')
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
const DEV_REPORT_COMMITTED_DIR = path.join(docsDevReportsRoot, '__1116-s5-guard-fixture__')

function isWindowsPlatform() {
  return process.platform === 'win32'
}

function discoverCommittedCaptureRoots() {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', 'docs/**/*.png', 'docs/**/*.jpg', 'docs/**/*.jpeg'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
  return [...new Set(tracked.map(file => file.split('/').slice(0, 2).join('/')))].sort()
}

/**
 * 이 머신에 실제로 바인딩된 non-internal IPv4 주소 하나 — 2026-07-28 R5 재수렴
 * 결함3(자기 LAN IP UNC admin-share 가 10개 resolver 사본 전부를 통과) 재현/회귀
 * 테스트에 쓴다. os.networkInterfaces() 는 로컬 전용 조회라(네트워크 I/O 없음)
 * 원격 호스트 stat 기반 신원 대조와 달리 행(hang) 위험이 없다 — resolver 쪽 fix 도
 * 같은 이유로 이 API 를 쓴다(scripts/lib/qa-shots-dir.cjs 의 getSelfLanAddresses).
 * 이 파일 최상단(첫 test() 호출보다 먼저)에 둔다 — 여러 테스트가 파일 여기저기서
 * 참조하는데 test(...) 의 옵션 객체(예: { skip: LAN_IP_SKIP_REASON })는 등록 시점
 * (모듈 최초 실행, 파일 상단→하단 순서)에 즉시 평가되어 const 의 TDZ(temporal dead
 * zone)에 걸리기 쉽다 — 실제로 두 번 걸려서 여기로 옮겼다.
 */
function getSelfLanIPv4() {
  const nets = os.networkInterfaces()
  for (const addrs of Object.values(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return null
}

const SELF_LAN_IPV4 = isWindowsPlatform() ? getSelfLanIPv4() : null
const LAN_IP_SKIP_REASON = SELF_LAN_IPV4
  ? false
  : 'UNC admin-share 는 Windows 전용 개념이거나(POSIX) 이 머신에 non-internal IPv4 인터페이스가 없습니다'

function resetEnvironment() {
  delete process.env.QA_SHOTS_DIR
  delete process.env.QA_ALLOW_OVERWRITE
  delete process.env.QA_REPO_ROOT
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

test.afterEach(resetEnvironment)

test('S5 RED-B docs/dev-reports도 호출자의 보호 선언 기본값으로 차단된다', () => {
  process.env.QA_SHOTS_DIR = DEV_REPORT_COMMITTED_DIR
  assert.throws(
    () => resolveQaShotsDir(DEV_REPORT_COMMITTED_DIR),
    error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
    'docs/dev-reports 커밋 증거 루트가 보호되지 않습니다',
  )
})

test('S5 행위 울타리 — 커밋 캡처가 있는 docs 루트는 보호 또는 재생성 선언으로 분류된다', async () => {
  const roots = discoverCommittedCaptureRoots()
  assert.ok(roots.length > 0, '커밋된 docs 캡처 루트를 찾지 못했습니다')

  const { resolveQaShotsDir: mjsResolve } = await import(pathToFileURL(rootMjsHelperPath).href)
  const resolvers = [
    ['cjs', resolveQaShotsDir],
    ['mjs', mjsResolve],
    ['ts', loadTypeScriptResolver()],
  ]
  const regeneratingSources = []
  for (const file of [
    path.join(repoRoot, 'tools', 'manual-capture', 'sync-screenshots.js'),
    path.join(repoRoot, 'tools', 'manual-capture', 'generate-mobile-placeholders.js'),
    path.join(repoRoot, 'tools', 'manual-capture', 'capture-manual-all.js'),
  ]) {
    if (fs.readFileSync(file, 'utf8').includes('protect: false')) regeneratingSources.push(file)
  }
  assert.equal(regeneratingSources.length, 3, '재생성 호출자 3곳 모두 보호 해제를 선언해야 합니다')

  const unclassified = []
  for (const root of roots) {
    const committedDir = path.join(repoRoot, root)
    let protectedByDefault = true
    for (const [name, resolver] of resolvers) {
      process.env.QA_SHOTS_DIR = committedDir
      try {
        resolver(committedDir)
        protectedByDefault = false
        unclassified.push(`${root}:${name}`)
      } catch (error) {
        assert.match(String(error?.message ?? error), /QA_ALLOW_OVERWRITE=1/)
      }
    }
    if (!protectedByDefault && !regeneratingSources.some(file => fs.readFileSync(file, 'utf8').includes(root))) {
      unclassified.push(root)
    }
  }
  assert.deepEqual(unclassified, [], `캡처 루트가 보호/재생성 어느 쪽에도 분류되지 않았습니다: ${unclassified.join(', ')}`)
})
test.after(resetEnvironment)

test('S7 RED-B — 여섯 resolver는 동일 입력에서 protect/regenerate 판정을 모두 일치시킨다', async () => {
  assert.ok(POWERSHELL_EXE, 'PowerShell 인터프리터가 없어 .ps1 행위를 검증할 수 없습니다')
  assert.ok(GITBASH_EXE, 'cygpath를 제공하는 Git Bash 인터프리터가 없어 .sh 행위를 검증할 수 없습니다')
  assert.ok(PYTHON_EXE, 'Python 인터프리터가 없어 .py 행위를 검증할 수 없습니다')

  const runProcess = (name, args, env = {}) => {
    const childEnv = { ...process.env }
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete childEnv[key]
      else childEnv[key] = value
    }
    if (!Object.prototype.hasOwnProperty.call(env, 'QA_SHOTS_DIR')) delete childEnv.QA_SHOTS_DIR
    try {
      execFileSync(name, args, { cwd: repoRoot, encoding: 'utf8', env: childEnv })
      return 'ALLOW'
    } catch (error) {
      const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
      assert.match(output, /QA_ALLOW_OVERWRITE=1/, `${name} 판정이 가드 오류가 아닌 이유로 실패했습니다: ${output}`)
      return 'BLOCK'
    }
  }

  const runPowerShell = (committedDir, targetDir, mode) => runProcess(POWERSHELL_EXE, [
    '-NoProfile', '-Command',
    `. '${path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.ps1')}' ; ` +
      `Resolve-QaShotsDir -CommittedDir '${committedDir}' -RequestedDir '${targetDir ?? ''}' -ProtectionMode ${mode} | Out-Null`,
  ], targetDir === undefined ? {} : { QA_SHOTS_DIR: targetDir })

  const runBash = (committedDir, targetDir, mode) => {
    const libPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.sh').replaceAll('\\', '/')
    return runProcess(GITBASH_EXE, ['-lc',
      `source '${libPath}'; resolve_qa_shots_dir "$COMMITTED_DIR" ${mode}`,
    ], {
      ...(targetDir === undefined ? {} : { QA_SHOTS_DIR: targetDir.replaceAll('\\', '/') }),
      COMMITTED_DIR: committedDir.replaceAll('\\', '/'),
    })
  }

  const runPython = (committedDir, targetDir, protect) => runProcess(PYTHON_EXE, ['-c', [
    'import os, sys',
    `sys.path.insert(0, ${JSON.stringify(path.join(repoRoot, 'scripts', 'lib'))})`,
    'from qa_shots_dir import resolve_qa_shots_dir',
    `resolve_qa_shots_dir(${JSON.stringify(committedDir)}, protect=${protect ? 'True' : 'False'})`,
  ].join('\n'),], targetDir === undefined ? {} : { QA_SHOTS_DIR: targetDir })

  const nodeResolvers = [
    ['cjs', async (committedDir, targetDir, protect) => {
      process.env.QA_SHOTS_DIR = targetDir ?? ''
      return resolveQaShotsDir(committedDir, { protect })
    }],
    ['mjs', async (committedDir, targetDir, protect) => {
      process.env.QA_SHOTS_DIR = targetDir ?? ''
      return (await import(pathToFileURL(path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.mjs')).href)).resolveQaShotsDir(committedDir, { protect })
    }],
    ['ts', async (committedDir, targetDir, protect) => {
      process.env.QA_SHOTS_DIR = targetDir ?? ''
      return loadTypeScriptResolver()(committedDir, { protect })
    }],
  ]
  const processResolvers = [
    ['ps1', (committedDir, targetDir, protect) => runPowerShell(committedDir, targetDir, protect ? 'Protect' : 'Regenerate')],
    ['sh', (committedDir, targetDir, protect) => runBash(committedDir, targetDir, protect ? 'protect' : 'regenerate')],
    ['py', (committedDir, targetDir, protect) => runPython(committedDir, targetDir, protect)],
  ]
  const qaCases = [
    ['docs/qa', path.join(repoRoot, 'docs', 'qa'), path.join(repoRoot, 'docs', 'qa')],
    ['docs/qa-shots', path.join(repoRoot, 'docs', 'qa-shots'), path.join(repoRoot, 'docs', 'qa-shots')],
    ['docs/dev-reports', path.join(repoRoot, 'docs', 'dev-reports'), path.join(repoRoot, 'docs', 'dev-reports')],
    ['manual regenerate', path.join(repoRoot, 'docs', 'manual', 'screenshots'), path.join(repoRoot, 'docs', 'manual', 'screenshots')],
    ['repo outside', path.join(repoRoot, 'docs', 'manual', 'screenshots'), path.join(tempRoot, 's7-outside')],
  ]
  const rows = []
  const runNodeCase = async (name, resolver, committedDir, targetDir, protect) => {
    const expectedPath = targetDir ?? path.join(committedDir, '_local')
    let verdict = 'ALLOW'
    try {
      const actual = await resolver(committedDir, targetDir, protect)
      assert.equal(actual, expectedPath, `${name}가 예상 경로가 아닌 곳을 반환했습니다`)
    } catch (error) {
      assert.match(String(error), /QA_ALLOW_OVERWRITE=1/)
      verdict = 'BLOCK'
    }
    return verdict
  }
  for (const [label, committedDir, targetDir] of qaCases) {
    const protect = label !== 'manual regenerate'
    for (const [name, resolver] of nodeResolvers) rows.push([name, label, await runNodeCase(name, resolver, committedDir, targetDir, protect)])
    for (const [name, resolver] of processResolvers) rows.push([name, label, resolver(committedDir, targetDir, protect)])
    const expectedVerdict = label === 'docs/qa' || label === 'docs/qa-shots' || label === 'docs/dev-reports' ? 'BLOCK' : 'ALLOW'
    assert.deepEqual(rows.slice(-6).map(([, , verdict]) => verdict), Array(6).fill(expectedVerdict), `${label} 6종 판정 불일치`)
  }
  for (const [label, committedDir] of [['default', path.join(repoRoot, 'docs', 'manual', 'screenshots')]]) {
    for (const [name, resolver] of nodeResolvers) rows.push([name, label, (await runNodeCase(name, resolver, committedDir, undefined, true)) === 'ALLOW' ? 'ALLOW' : 'BLOCK'])
    for (const [name, resolver] of processResolvers) rows.push([name, label, resolver(committedDir, undefined, true)])
  }
  assert.deepEqual(rows.slice(-6).map(([, , verdict]) => verdict), Array(6).fill('ALLOW'), 'default 6종 판정 불일치')
  console.log(`[S7 six-impl parity] ${rows.map(([name, label, verdict]) => `${name}/${label}=${verdict}`).join(' ')}`)
})

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

test('D-3 [E] 새 커밋 QA 증거 루트도 모집단 축에 따라 자동 차단한다', () => {
  process.env.QA_SHOTS_DIR = path.join(docsQaShotsRoot, 'new-root-fixture')

  assert.throws(
    () => resolveQaShotsDir(path.join(docsQaShotsRoot, 'new-root-fixture')),
    error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
  )
})

test('S5 RED-A 매뉴얼 재생성 호출자 선언은 보호를 해제하고 통과한다', () => {
  for (const committedDir of [
    path.join(repoRoot, 'docs', 'manual', 'screenshots'),
    path.join(repoRoot, 'docs', 'manual', 'screenshots'),
    path.join(repoRoot, 'docs', 'manual', 'screenshots', '04-모바일'),
  ]) {
    process.env.QA_SHOTS_DIR = committedDir
    assert.equal(resolveQaShotsDir(committedDir, { protect: false }), committedDir)
  }
})

test('S3 RED-B docs/qa-shots 는 호출자의 증거 루트로 보호된다', () => {
  process.env.QA_SHOTS_DIR = path.join(repoRoot, 'docs', 'qa-shots', 'new-root-fixture')

  assert.throws(
    () => resolveQaShotsDir(path.join(repoRoot, 'docs', 'qa-shots', 'new-root-fixture')),
    error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
  )
})

test('D-3 A~E 전부 QA_ALLOW_OVERWRITE=1 이면 명시 경로를 그대로 사용한다 (승격 opt-in 은 유지)', () => {
  process.env.QA_ALLOW_OVERWRITE = '1'
  const cases = {
    A: OTHER_SLUG_COMMITTED_DIR,
    B: MY_FIXTURE_COMMITTED_DIR,
    C: docsQaRoot,
    D: path.join(docsQaRoot, 'some-other-slug', '..', '__863-r1-guard-fixture__'),
    E: path.join(docsQaShotsRoot, 'new-root-fixture'),
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

function findFreeSubstLetter() {
  for (let code = 87; code <= 90; code += 1) {
    const candidate = String.fromCharCode(code)
    if (!fs.existsSync(`${candidate}:\\`)) return candidate
  }
  return null
}

function runNodePathMatrixCase(resolver, target) {
  const originalMkdirSync = fs.mkdirSync
  let mkdirCalls = 0
  let thrown = null
  fs.mkdirSync = (...args) => {
    mkdirCalls += 1
    return args[0]
  }
  process.env.QA_SHOTS_DIR = target
  try {
    resolver(MY_FIXTURE_COMMITTED_DIR)
  } catch (error) {
    thrown = error
  } finally {
    delete process.env.QA_SHOTS_DIR
    fs.mkdirSync = originalMkdirSync
  }
  return { mkdirCalls, thrown }
}

test(
  '978-A-1 경로 표기 판정표 — 같은 docs/qa 물리 위치의 평문·UNC·슬래시·subst·mklink /J 는 모두 BLOCK, 외부 UNC 는 ALLOW 이다',
  { skip: isWindowsPlatform() && SELF_LAN_IPV4 ? false : '자기 LAN IP·admin-share·subst·mklink /J 표기는 Windows와 non-internal IPv4가 필요합니다', timeout: 30000 },
  async () => {
    const { resolveQaShotsDir: mjsResolve } = await import(pathToFileURL(mjsHelperPath).href)
    const { resolveQaShotsDir: rootMjsResolve } = await import(pathToFileURL(rootMjsHelperPath).href)
    const resolvers = [
      ['cjs', resolveQaShotsDir],
      ['mjs', mjsResolve],
      ['root-mjs', rootMjsResolve],
      ['ts', loadTypeScriptResolver()],
    ]

    const drive = OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()
    const driveRest = OTHER_SLUG_COMMITTED_DIR.slice(2)
    const substRoot = path.resolve(repoRoot, '..', '..', '..', '..')
    const relativeFromSubstRoot = path.relative(substRoot, OTHER_SLUG_COMMITTED_DIR)
    assert.ok(
      relativeFromSubstRoot && !relativeFromSubstRoot.startsWith('..'),
      `subst 기준점이 저장소를 포함하지 않습니다: ${substRoot} -> ${OTHER_SLUG_COMMITTED_DIR}`,
    )

    const matrixTempRoot = path.join(os.tmpdir(), 'samhan-978-a1-path-matrix')
    const junctionParent = path.join(matrixTempRoot, 'cross-drive-junction-parent')
    const junctionLink = path.join(junctionParent, 'docs-qa')
    let substLetter = null

    try {
      fs.mkdirSync(junctionParent, { recursive: true })
      const mklinkOutput = execFileSync(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/c', 'mklink', '/J', junctionLink, docsQaRoot],
        { encoding: 'utf8' },
      )
      assert.equal(fs.existsSync(junctionLink), true, `mklink /J 가 junction 을 만들지 못했습니다: ${mklinkOutput}`)
      console.log(`[978-A-1 path matrix] mklink /J created: ${mklinkOutput.trim()}`)

      substLetter = findFreeSubstLetter()
      assert.ok(substLetter, 'subst 에 쓸 미사용 드라이브 문자(W~Z)를 찾지 못했습니다')
      execFileSync('subst', [`${substLetter}:`, substRoot])

      const blockedCases = [
        ['평범', OTHER_SLUG_COMMITTED_DIR],
        ['슬래시', OTHER_SLUG_COMMITTED_DIR.replaceAll('\\', '/')],
        ['혼합', `${drive}:\\${driveRest.slice(1).replaceAll('\\', '/')}`],
        ['UNC-localhost', `\\\\localhost\\${drive}$${driveRest}`],
        ['UNC-127.0.0.1', `\\\\127.0.0.1\\${drive}$${driveRest}`],
        ['UNC-computername', `\\\\${os.hostname()}\\${drive}$${driveRest}`],
        ['UNC-self-LAN-IP', `\\\\${SELF_LAN_IPV4}\\${drive}$${driveRest}`],
        ['subst', `${substLetter}:\\${relativeFromSubstRoot}`],
        ['cross-drive-junction-mklink', path.join(junctionLink, path.relative(docsQaRoot, OTHER_SLUG_COMMITTED_DIR))],
      ]

      for (const [label, target] of blockedCases) {
        for (const [resolverName, resolver] of resolvers) {
          const { mkdirCalls, thrown } = runNodePathMatrixCase(resolver, target)
          assert.ok(
            thrown instanceof Error && thrown.message.includes('QA_ALLOW_OVERWRITE=1'),
            `${resolverName}:${label} 표기가 BLOCK 되지 않았습니다. target=${target} error=${thrown?.message ?? '없음'}`,
          )
          assert.equal(mkdirCalls, 0, `${resolverName}:${label} 가드가 쓰기 전 mkdir 을 호출했습니다`)
        }
        console.log(`[978-A-1 path matrix] ${label}\tBLOCK\t${target}\tresolvers=${resolvers.map(([name]) => name).join(',')}`)
      }

      const externalHost = '203.0.113.77'
      const externalTarget = `\\\\${externalHost}\\${drive}$${driveRest}`
      for (const [resolverName, resolver] of resolvers) {
        const { mkdirCalls, thrown } = runNodePathMatrixCase(resolver, externalTarget)
        assert.ok(
          !(thrown instanceof Error && thrown.message.includes('QA_ALLOW_OVERWRITE=1')),
          `${resolverName}:외부 UNC 를 과차단했습니다. error=${thrown?.message ?? '없음'}`,
        )
        assert.equal(mkdirCalls, 1, `${resolverName}:외부 UNC 허용 후 출력 디렉터리 결정이 실행되지 않았습니다`)
      }
      console.log(`[978-A-1 path matrix] 외부 UNC\tALLOW\t${externalTarget}\tresolvers=${resolvers.map(([name]) => name).join(',')}`)
    } finally {
      delete process.env.QA_SHOTS_DIR
      if (substLetter) {
        execFileSync('subst', [`${substLetter}:`, '/D'])
        console.log(`[978-A-1 cleanup] subst ${substLetter}: released=${!fs.existsSync(`${substLetter}:\\`)}`)
      }
      assert.ok(
        path.resolve(junctionParent).startsWith(path.resolve(os.tmpdir()) + path.sep),
        `junction 정리 대상이 os.tmpdir() 밖입니다: ${junctionParent}`,
      )
      fs.rmSync(junctionParent, { recursive: true, force: true })
      console.log(`[978-A-1 cleanup] mklink /J parent removed=${!fs.existsSync(junctionParent)}`)
      fs.rmSync(matrixTempRoot, { recursive: true, force: true })
    }
  },
)

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
  // 분기한다(qa-shots-dir.cjs:81,91 · qa-screenshot-dir.ts:106,116 · .mjs:71,81 — 2026-07-28
  // R5 재수렴 fix 완료 후 최종 파일 기준 재확인값. 이전 라운드(R4)가 만든 값(43,52·73,82·
  // 38,47)이 이번 fix 의 삽입으로 다시 드리프트했었다). POSIX
  // 에서 `\\?\<path>` 표기와 대문자 표기는 물리적으로 "다른"(실존하지 않는) 경로이므로
  // resolver 가 차단하지 '않는' 것이 옳다 — 여기서 무조건 차단을 단언한 R2 테스트가
  // 리눅스 CI(mock 회귀 hard gate 641 테스트 게이트)를 막았다(R3 재수렴, 2026-07-28,
  // PR #952). POSIX 에서 "차단되지 않음"을 직접 단언하는 대신 이 세 케이스를 아예
  // 실행하지 않는다: 차단되지 않으면 resolver 가 실제 fs.mkdirSync 까지 진행해
  // 저장소 밖(심하면 파일시스템 루트 바로 아래)에 우연한 대문자/이스케이프 경로를
  // 실제로 생성해버리는 부작용이 있기 때문이다.
  // 2026-07-28 R4 재수렴 결함3 — 자기 자신을 가리키는 UNC admin-share(`\\localhost\D$\...`,
  // `\\<컴퓨터명>\D$\...`)도 드라이브 문자 표기와 물리적으로 같은 경로다. R4 재현: 정규화가
  // `\\?\`/`\\?\UNC\` 접두만 벗기고 이 표기를 드라이브 문자로 통일하지 않아 비교 단계에서
  // 문자열이 달라 4개 resolver 전부 통과(ALLOW)했다.
  const uncAdminShareLocalhost = `\\\\localhost\\${OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()}$${OTHER_SLUG_COMMITTED_DIR.slice(2)}`
  const uncAdminShareComputerName = `\\\\${os.hostname()}\\${OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()}$${OTHER_SLUG_COMMITTED_DIR.slice(2)}`
  const windowsOnlyCases = [
    ['extended-root', extendedRoot],
    ['extended-missing', extendedMissing],
    ['case', OTHER_SLUG_COMMITTED_DIR.toUpperCase()],
    ['unc-admin-share-localhost', uncAdminShareLocalhost],
    ['unc-admin-share-computername', uncAdminShareComputerName],
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
  // 핵심 계약 마커(기본값 _local·호출자 파생 증거 루트·QA_ALLOW_OVERWRITE 탈출구)를 확인한다.
  // 실제 런타임 동작은 clients/desktop 전체 Playwright mock 스위트 실행(.ts 를 실제로 실행)과
  // 아래 .mjs 실행 비교로 이중 확인한다.
  const tsSource = fs.readFileSync(tsHelperPath, 'utf8')
  assert.match(tsSource, /path\.join\(committed,\s*'_local'\)/, '.ts 기본값이 _local 이 아님 (D-2 회귀)')
  assert.match(tsSource, /deriveQaEvidenceRoot/, '.ts 에 호출자 파생 QA 증거 축 가드가 없음 (D-3 미이관)')
  assert.match(tsSource, /QA_ALLOW_OVERWRITE/, '.ts 에 명시 허용 탈출구가 없음')
  assert.match(tsSource, /export function resolveQaShotsDir/, '.ts 가 resolveQaShotsDir 를 export 하지 않음 (H-2 가드 대상)')
  assert.doesNotMatch(
    tsSource,
    /export function resolveMockQaShotsDir/,
    '.ts 가 별도 mock 전용 함수를 다시 export 함 (H-2 재발 위험 — resolveQaShotsDir 단일 함수로 유지할 것)',
  )

  const mjsSource = fs.readFileSync(mjsHelperPath, 'utf8')
  assert.match(mjsSource, /deriveQaEvidenceRoot/, '.mjs 에 호출자 파생 QA 증거 축 가드가 없음 (D-3 미이관)')

  const qaPlaywrightSource = fs.readFileSync(qaPlaywrightHelperPath, 'utf8')
  assert.match(qaPlaywrightSource, /deriveQaEvidenceRoot/, 'qa/playwright resolver에 호출자 파생 QA 증거 축 가드가 없음')

  const { resolveQaShotsDir: mjsResolve } = await import(pathToFileURL(mjsHelperPath).href)
  const committedDir = MY_FIXTURE_COMMITTED_DIR

  // 기본값 parity
  assert.equal(mjsResolve(committedDir), resolveQaShotsDir(committedDir))

  // D-3 parity — 다른 슬러그 지정 시 .mjs 도 동일하게 차단
  process.env.QA_SHOTS_DIR = OTHER_SLUG_COMMITTED_DIR
  assert.throws(() => mjsResolve(committedDir), /QA_ALLOW_OVERWRITE=1/)

  // QA_ALLOW_OVERWRITE parity
  process.env.QA_ALLOW_OVERWRITE = '1'
  assert.equal(mjsResolve(committedDir), resolveQaShotsDir(committedDir))
})

test('S3 반열거 울타리 — 모든 resolver는 호출자 파생 축을 가져야 하며 docs 전역 축을 되살리면 RED가 된다', () => {
  const resolverPaths = [
    rootMjsHelperPath,
    tsHelperPath,
    mjsHelperPath,
    path.join(repoRoot, 'clients', 'desktop', 'src', 'main', 'capture.ts'),
    qaPlaywrightHelperPath,
    path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.cjs'),
    path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.mjs'),
    path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.ps1'),
    path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.sh'),
    path.join(repoRoot, 'scripts', 'lib', 'qa_shots_dir.py'),
  ]
  const source = resolverPaths.map(readSourceText).join('\n')
  assert.doesNotMatch(source, /QA_EVIDENCE_AXIS|qaEvidenceAxis|qa_evidence_axis/, 'docs 전역 축 열거가 되살아났습니다')
  assert.match(source, /deriveQaEvidenceRoot|Get-QaEvidenceRoot|_derive_qa_evidence_root|_qa_evidence_root/, '호출자 파생 축이 사라졌습니다')
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

function findActualAlternateCheckout() {
  const currentCheckout = path.resolve(repoRoot)
  const candidates = []
  let ancestor = currentCheckout
  while (true) {
    const worktreesRoot = path.join(ancestor, '.claude', 'worktrees')
    if (fs.existsSync(worktreesRoot) && fs.statSync(worktreesRoot).isDirectory()) {
      candidates.push(ancestor)
      for (const entry of fs.readdirSync(worktreesRoot)) candidates.push(path.join(worktreesRoot, entry))
    }
    const parent = path.dirname(ancestor)
    if (parent === ancestor) break
    ancestor = parent
  }

  return (
    candidates.find(candidate => {
      const resolvedCandidate = path.resolve(candidate)
      return (
        resolvedCandidate !== currentCheckout &&
        fs.existsSync(path.join(resolvedCandidate, '.git')) &&
        fs.existsSync(path.join(resolvedCandidate, 'docs', 'qa', '809-partner-product-price-memory'))
      )
    }) ?? null
  )
}

const ALTERNATE_CHECKOUT_ROOT = findActualAlternateCheckout()
const ALTERNATE_CHECKOUT_SKIP_REASON = ALTERNATE_CHECKOUT_ROOT
  ? false
  : '현재 checkout 과 다른 실재 Git 워크트리 및 커밋 QA 경로를 찾을 수 없습니다'

test(
  '978-A-1 경로 표기 판정표 — 실제 다른 Git 워크트리를 -ProjectRoot 로 지정해도 그 워크트리의 docs/qa 는 BLOCK 이다',
  {
    skip:
      POWERSHELL_SKIP_REASON ||
      (isWindowsPlatform() ? false : '실제 다른 Git 워크트리의 -ProjectRoot 경로 판정은 Windows 전용입니다') ||
      ALTERNATE_CHECKOUT_SKIP_REASON,
    timeout: 30000,
  },
  () => {
    // 다른 워크트리의 커밋 증거를 직접 겨누되, guard 가 회귀해도 저장소에 쓰지 못하도록
    // New-Item 을 sentinel 로 바꾼다. BLOCK 이면 이 함수에 도달하지 않고, ALLOW 로 새면
    // sentinel 이 즉시 중단하므로 어느 쪽도 기존 REPORT.md 를 덮어쓸 수 없다.
    const alternateCheckoutRoot = ALTERNATE_CHECKOUT_ROOT
    const alternateTarget = path.join(alternateCheckoutRoot, 'docs', 'qa', '809-partner-product-price-memory')
    assert.equal(fs.existsSync(alternateTarget), true, `alternate checkout 의 커밋 QA 경로가 없습니다: ${alternateTarget}`)

    const scriptPath = path.join(repoRoot, 'infrastructure', 'scripts', 'operational-validation.ps1')
    const psCommand = [
      "function New-Item { throw 'WRITE_SENTINEL' }",
      `$env:QA_SHOTS_DIR='${alternateTarget}'`,
      `& '${scriptPath}' -SkipDocker -ProjectRoot '${alternateCheckoutRoot}'`,
    ].join('; ')

    let threw = false
    let combined = ''
    try {
      combined = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-Command', psCommand], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      })
    } catch (error) {
      threw = true
      combined = `${error.stdout ?? ''}${error.stderr ?? ''}`
    }

    assert.ok(threw, `실제 다른 워크트리의 -ProjectRoot docs/qa 가 BLOCK 되지 않았습니다. 출력: ${combined}`)
    assert.match(combined, /QA_ALLOW_OVERWRITE=1/, `-ProjectRoot 판정이 guard 오류가 아닙니다. 출력: ${combined}`)
    assert.doesNotMatch(combined, /WRITE_SENTINEL/, 'ALLOW 로 새어 실제 저장 직전 sentinel 까지 진행했습니다')
    console.log(`[978-A-1 path matrix] -ProjectRoot-other-worktree\tBLOCK\t${alternateTarget}`)
  },
)

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

// 2026-07-28 R5 재수렴 결함2/D-2 — qa-shots-dir.ps1 자신의 Resolve-QaShotsDir 도
// operational-validation.ps1(T-17/D-2)과 같은 Resolve-QaPhysicalPath 를 쓴다. 별도
// 사본이므로 독립적으로 실 자식 프로세스로 재현한다(U-2 — "같은 텍스트 패턴이니
// 대표 사례가 나머지를 대표한다"는 추론 금지, 10사본 전부 개별 확인).
test(
  'T-18 (2026-07-28 R5 재수렴 결함2/D-2) — qa-shots-dir.ps1 의 Resolve-QaShotsDir 는 subst 드라이브·크로스드라이브 junction 을 통해 지정된 커밋 경로도 차단한다',
  { skip: POWERSHELL_SKIP_REASON, timeout: 30000 },
  () => {
    const libPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.ps1')

    // --- subst (Windows 전용 개념 — Linux 에는 subst.exe 자체가 없다) ---
    // (2026-07-28 CI RED② fix) 이 블록은 process.platform 분기 없이 subst 를 무조건 실행해
    // Linux CI 에서 spawnSync ENOENT 로 죽었다(subst 바이너리 부재 — 가드 판정과 무관한
    // 테스트 하네스 결함). T-9/T-14(UNC admin-share)·GITBASH_SKIP_REASON(.sh 전체)과 동일하게
    // Windows 전용으로 gate 한다 — 결함2 자체와 무관하다. 아래 크로스드라이브 junction(D-2
    // 계열)은 심볼릭 링크로 흉내내 전 플랫폼에서 계속 검증한다(Get-QaFinalPhysicalPath 가
    // 2026-07-28 CI RED② fix 로 비-Windows 에서도 ResolveLinkTarget 를 쓰게 됐으므로 실제로
    // 의미가 있다).
    if (isWindowsPlatform()) {
      let substLetter = null
      for (let code = 87; code <= 90; code += 1) {
        const candidate = String.fromCharCode(code)
        if (!fs.existsSync(`${candidate}:\\`)) {
          substLetter = candidate
          break
        }
      }
      assert.ok(substLetter, '이 머신에서 subst 에 쓸 미사용 드라이브 문자(W~Z)를 찾지 못했습니다')
      execFileSync('subst', [`${substLetter}:`, docsQaRoot])
      try {
        const psCommand = [
          `. '${libPath}'`,
          `try { Resolve-QaShotsDir -CommittedDir '${MY_FIXTURE_COMMITTED_DIR}' -RequestedDir '${substLetter}:\\__957-r5-libps1-subst-guard-fixture__' | Out-Null; Write-Output 'ALLOW' } catch { Write-Output ('BLOCK:' + $_.Exception.Message) }`,
        ].join('; ')
        const out = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-Command', psCommand], { encoding: 'utf8', timeout: 20000 })
        assert.match(
          out,
          /^BLOCK:.*QA_ALLOW_OVERWRITE=1/s,
          `qa-shots-dir.ps1 이 subst 드라이브(${substLetter}:)를 통해 지정된 커밋 경로를 차단하지 못했습니다(결함2 재발). 출력: ${out}`,
        )
      } finally {
        execFileSync('subst', [`${substLetter}:`, '/D'])
        fs.rmSync(path.join(docsQaRoot, '__957-r5-libps1-subst-guard-fixture__'), { recursive: true, force: true })
      }
    }

    // --- 크로스드라이브 junction(D-2) — tempRoot(보통 C: 아래)에 junction 을 만들어
    // docsQaRoot(D: 아래, 이 저장소가 D: 에 있음)를 가리키게 한다. junction 은 항상
    // "담은 부모"를 재귀삭제한다 — junction 경로 자체를 최상위 인자로 삭제하면
    // 대상 콘텐츠까지 cascade 삭제될 위험이 있다(이 라운드 실측, Node 도 동일).
    const junctionParent = path.join(tempRoot, 't18-cross-drive-junction-parent')
    fs.rmSync(junctionParent, { recursive: true, force: true })
    fs.mkdirSync(junctionParent, { recursive: true })
    const junctionChild = path.join(junctionParent, 'link-to-docs-qa')
    fs.symlinkSync(docsQaRoot, junctionChild, 'junction')
    try {
      const requestedDir = path.join(junctionChild, '__957-r5-libps1-junction-guard-fixture__')
      const psCommand = [
        `. '${libPath}'`,
        `try { Resolve-QaShotsDir -CommittedDir '${MY_FIXTURE_COMMITTED_DIR}' -RequestedDir '${requestedDir}' | Out-Null; Write-Output 'ALLOW' } catch { Write-Output ('BLOCK:' + $_.Exception.Message) }`,
      ].join('; ')
      const out = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-Command', psCommand], { encoding: 'utf8', timeout: 20000 })
      assert.match(
        out,
        /^BLOCK:.*QA_ALLOW_OVERWRITE=1/s,
        `qa-shots-dir.ps1 이 크로스드라이브 junction 을 통해 지정된 커밋 경로를 차단하지 못했습니다(D-2 재발). 출력: ${out}`,
      )
    } finally {
      fs.rmSync(junctionParent, { recursive: true, force: true })
    }
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

// ============================================================================
// 2026-07-28 R4 재수렴 결함1/2/3 회귀 가드.
//
// 결함1 — infrastructure/scripts/operational-validation.ps1 의 -ReportPath 파라미터가
// (비어있을 때만 Resolve-QaShotsDir 를 부르던 구조 때문에) 가드를 통째로 우회해 커밋된
// REPORT.md 를 실제로 덮어썼다(신규 clone 실측: 7539B → 5630B). 결함2 — 같은 파일의
// -ProjectRoot 파라미터가 docsQaRoot 계산에 그대로 쓰여, 워크트리에서 -ProjectRoot 로 메인
// 체크아웃을 가리키면(스크립트 자신의 .EXAMPLE 이 보여주는 그 형태) 가드 기준점이 통째로
// 옮겨져 침묵했다. 결함3 — 5개 resolver(ps1/cjs/mjs/py/sh) 전부가 UNC admin-share
// (`\\localhost\D$\...`) 표기를 드라이브 문자 표기와 동일시하지 못해 물리 판정이 통과했다.
// ============================================================================

test(
  'T-6 (2026-07-28 R4 재수렴 결함1) — operational-validation.ps1 을 -ReportPath 파라미터로 커밋 경로를 겨눠 실행하면 차단된다(resolver 직접호출이 아닌 진짜 파라미터 경로)',
  { skip: POWERSHELL_SKIP_REASON },
  () => {
    const fixtureReportPath = path.join(docsQaRoot, '__957-r4-reportpath-param-guard-fixture__', 'REPORT.md')
    const scriptPath = path.join(repoRoot, 'infrastructure', 'scripts', 'operational-validation.ps1')

    let threw = false
    let combined = ''
    try {
      combined = execFileSync(
        POWERSHELL_EXE,
        ['-NoProfile', '-Command', `& '${scriptPath}' -SkipDocker -ReportPath '${fixtureReportPath}'`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 },
      )
    } catch (e) {
      threw = true
      combined = `${e.stdout ?? ''}${e.stderr ?? ''}`
    }

    assert.ok(threw, `-ReportPath 로 커밋 경로를 겨눴는데 차단되지 않았습니다(exit 0, 결함1 재발). 출력 마지막 300자: ${combined.slice(-300)}`)
    assert.match(combined, /QA_ALLOW_OVERWRITE=1/, `가드 메시지가 아닌 다른 이유로 실패했을 수 있습니다. 출력 마지막 300자: ${combined.slice(-300)}`)
    assert.equal(
      fs.existsSync(fixtureReportPath),
      false,
      'REPORT.md 가 실제로 write 됐습니다 — 가드가 파일 작성 이전에 막지 못했습니다.',
    )
  },
)

test(
  'T-7 (2026-07-28 R4 재수렴 결함2) — operational-validation.ps1 을 -ProjectRoot 로 다른 트리를 가리키게 해도 QA_SHOTS_DIR 로 지정한 docs/qa 하위 경로는 여전히 차단된다(가드 기준점이 호출자 인자로 갈아끼워지지 않음)',
  { skip: POWERSHELL_SKIP_REASON },
  () => {
    const decoyProjectRoot = path.join(tempRoot, 't7-decoy-project-root')
    fs.mkdirSync(decoyProjectRoot, { recursive: true })
    const scriptPath = path.join(repoRoot, 'infrastructure', 'scripts', 'operational-validation.ps1')
    const fixtureUnderDocsQa = path.join(docsQaRoot, '__957-r4-projectroot-decoy-guard-fixture__')

    let threw = false
    let combined = ''
    try {
      combined = execFileSync(
        POWERSHELL_EXE,
        [
          '-NoProfile',
          '-Command',
          `$env:QA_SHOTS_DIR='${fixtureUnderDocsQa}'; & '${scriptPath}' -SkipDocker -ProjectRoot '${decoyProjectRoot}'`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 },
      )
    } catch (e) {
      threw = true
      combined = `${e.stdout ?? ''}${e.stderr ?? ''}`
    } finally {
      delete process.env.QA_SHOTS_DIR
    }

    assert.ok(
      threw,
      `QA_SHOTS_DIR=docs/qa 하위 fixture + -ProjectRoot=다른 트리 조합인데 차단되지 않았습니다(exit 0, 결함2 재발). 출력 마지막 300자: ${combined.slice(-300)}`,
    )
    assert.match(combined, /QA_ALLOW_OVERWRITE=1/, `가드 메시지가 아닌 다른 이유로 실패했을 수 있습니다. 출력 마지막 300자: ${combined.slice(-300)}`)
    assert.equal(fs.existsSync(fixtureUnderDocsQa), false, 'fixture 디렉터리가 실제로 생성됐습니다 — 가드가 막지 못했습니다.')
  },
)

// ============================================================================
// 2026-07-28 R5 재수렴 A2 — operational-validation.ps1 결함2/D-1/D-2.
// ============================================================================

test(
  'T-17 (2026-07-28 R5 재수렴 결함2) — operational-validation.ps1 은 subst 드라이브를 통해 지정된 커밋 경로도 차단한다',
  {
    // (2026-07-28 CI RED② fix) subst 는 Windows 전용 개념(Linux 에는 subst.exe 자체가 없다) —
    // process.platform 분기 없이 무조건 실행해 Linux CI 에서 spawnSync ENOENT 로 죽었다.
    // T-9/T-14(UNC admin-share)·GITBASH_SKIP_REASON(.sh 전체)과 동일하게 Windows 전용으로
    // gate 한다 — 결함2 자체와 무관한 결함이다. D-2(크로스드라이브 junction, 별도 테스트)는
    // 심볼릭 링크로 흉내내 전 플랫폼에서 계속 검증한다.
    skip: POWERSHELL_SKIP_REASON || (isWindowsPlatform() ? false : 'subst 는 Windows 전용 개념입니다(Linux 에는 subst.exe 자체가 없다 - 2026-07-28 CI RED② 재수렴)'),
    timeout: 30000,
  },
  () => {
    const scriptPath = path.join(repoRoot, 'infrastructure', 'scripts', 'operational-validation.ps1')
    let substLetter = null
    for (let code = 87; code <= 90; code += 1) {
      const candidate = String.fromCharCode(code)
      if (!fs.existsSync(`${candidate}:\\`)) {
        substLetter = candidate
        break
      }
    }
    assert.ok(substLetter, '이 머신에서 subst 에 쓸 미사용 드라이브 문자(W~Z)를 찾지 못했습니다')
    execFileSync('subst', [`${substLetter}:`, docsQaRoot])
    try {
      const fixtureReportPath = `${substLetter}:\\__957-r5-opsval-subst-guard-fixture__\\REPORT.md`
      let threw = false
      let combined = ''
      try {
        combined = execFileSync(
          POWERSHELL_EXE,
          ['-NoProfile', '-Command', `& '${scriptPath}' -SkipDocker -ReportPath '${fixtureReportPath}'`],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 },
        )
      } catch (e) {
        threw = true
        combined = `${e.stdout ?? ''}${e.stderr ?? ''}`
      }
      assert.ok(
        threw,
        `subst 드라이브(${substLetter}:)를 통해 커밋 경로를 겨눴는데 차단되지 않았습니다(exit 0, 결함2 재발). 출력 마지막 300자: ${combined.slice(-300)}`,
      )
      assert.match(combined, /QA_ALLOW_OVERWRITE=1/, `가드 메시지가 아닌 다른 이유로 실패했을 수 있습니다. 출력 마지막 300자: ${combined.slice(-300)}`)
    } finally {
      execFileSync('subst', [`${substLetter}:`, '/D'])
      // 방어적 정리 — 가드가 회귀해 실제로 fixture 가 생겼더라도(RED 상태) docs/qa 에
      // 잔재를 남기지 않는다(GREEN 상태에서는 애초에 생성되지 않아 no-op).
      fs.rmSync(path.join(docsQaRoot, '__957-r5-opsval-subst-guard-fixture__'), { recursive: true, force: true })
    }
  },
)

// D-2 (2026-07-28 R5 재수렴) — 크로스드라이브(C: 부모 -> D: 대상) junction 아래에서
// operational-validation.ps1 의 Resolve-QaPhysicalPath 가 잘못된 Target(접근 드라이브
// 문자를 그대로 유지한 팬텀 경로)을 돌려줘 가드가 무력화됐다. tempRoot(os.tmpdir(),
// 이 머신에서 C: 아래)에 junction 을 만들어 docsQaRoot(D: 아래)를 가리키게 한다 —
// 실제 존재하는 두 드라이브 조합으로 재현한다.
test(
  'D-2 (2026-07-28 R5 재수렴) — operational-validation.ps1 은 크로스드라이브 junction 을 통해 지정된 커밋 경로도 차단한다',
  { skip: POWERSHELL_SKIP_REASON, timeout: 30000 },
  () => {
    const junctionParent = path.join(tempRoot, 'd2-cross-drive-junction-parent')
    fs.rmSync(junctionParent, { recursive: true, force: true })
    fs.mkdirSync(junctionParent, { recursive: true })
    const junctionChild = path.join(junctionParent, 'link-to-docs-qa')
    fs.symlinkSync(docsQaRoot, junctionChild, 'junction')
    // junctionParent 는 tempRoot(보통 C: 아래) 의 자식이고 docsQaRoot 는 D: 아래이므로
    // (이 저장소가 D: 에 있음) 실제 크로스드라이브 조합이다. junction 을 지울 때는 항상
    // "junction 을 담은 부모"를 재귀삭제한다 — junction 경로 자체를 최상위 인자로 재귀
    // 삭제하면(이 라운드 실측) 대상 콘텐츠까지 cascade 삭제될 위험이 있다(Node 도 동일).
    try {
      const scriptPath = path.join(repoRoot, 'infrastructure', 'scripts', 'operational-validation.ps1')
      const fixtureReportPath = path.join(junctionChild, '__957-r5-opsval-junction-guard-fixture__', 'REPORT.md')
      let threw = false
      let combined = ''
      try {
        combined = execFileSync(
          POWERSHELL_EXE,
          ['-NoProfile', '-Command', `& '${scriptPath}' -SkipDocker -ReportPath '${fixtureReportPath}'`],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 },
        )
      } catch (e) {
        threw = true
        combined = `${e.stdout ?? ''}${e.stderr ?? ''}`
      }
      assert.ok(
        threw,
        `크로스드라이브 junction 을 통해 커밋 경로를 겨눴는데 차단되지 않았습니다(exit 0, D-2 재발). 출력 마지막 300자: ${combined.slice(-300)}`,
      )
      assert.match(combined, /QA_ALLOW_OVERWRITE=1/, `가드 메시지가 아닌 다른 이유로 실패했을 수 있습니다. 출력 마지막 300자: ${combined.slice(-300)}`)
    } finally {
      fs.rmSync(junctionParent, { recursive: true, force: true })
    }
  },
)

test(
  'T-19 (2026-07-28 R5 재수렴 결함3) — operational-validation.ps1 도 자기 LAN IP UNC admin-share 를 차단한다',
  { skip: POWERSHELL_SKIP_REASON || LAN_IP_SKIP_REASON, timeout: 30000 },
  () => {
    const scriptPath = path.join(repoRoot, 'infrastructure', 'scripts', 'operational-validation.ps1')
    const fixtureUnderDocsQa = path.join(docsQaRoot, '__957-r5-opsval-lanip-guard-fixture__')
    const uncTarget = `\\\\${SELF_LAN_IPV4}\\${fixtureUnderDocsQa.slice(0, 1).toLowerCase()}$${fixtureUnderDocsQa.slice(2)}`
    let threw = false
    let combined = ''
    let fixtureWasCreated = false
    try {
      combined = execFileSync(
        POWERSHELL_EXE,
        ['-NoProfile', '-Command', `$env:QA_SHOTS_DIR='${uncTarget}'; & '${scriptPath}' -SkipDocker`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 },
      )
    } catch (e) {
      threw = true
      combined = `${e.stdout ?? ''}${e.stderr ?? ''}`
    } finally {
      fixtureWasCreated = fs.existsSync(fixtureUnderDocsQa)
      // 방어적 정리 — 가드가 회귀해 실제로 fixture 가 생겼더라도(RED 상태) docs/qa 에
      // 잔재를 남기지 않는다(GREEN 상태에서는 애초에 생성되지 않아 no-op).
      fs.rmSync(fixtureUnderDocsQa, { recursive: true, force: true })
    }
    assert.ok(
      threw,
      `자기 LAN IP(${SELF_LAN_IPV4}) UNC 로 커밋 경로를 겨눴는데 차단되지 않았습니다(exit 0, 결함3 재발). 출력 마지막 300자: ${combined.slice(-300)}`,
    )
    assert.match(combined, /QA_ALLOW_OVERWRITE=1/, `가드 메시지가 아닌 다른 이유로 실패했을 수 있습니다. 출력 마지막 300자: ${combined.slice(-300)}`)
    assert.equal(fixtureWasCreated, false, 'fixture 디렉터리가 실제로 생성됐습니다 — 가드가 막지 못했습니다.')
  },
)

// D-1 (2026-07-28 R5 재수렴, R4 회귀) — $docsQaRoot(가드 기준점)는 $PSScriptRoot(스크립트
// 자신의 물리 위치)를 따르는데 $CommittedReportDir(실제 write 대상 유도)는 -ProjectRoot 를
// 따른다. -ProjectRoot 가 스크립트가 물리적으로 든 체크아웃과 "다른, 실존하는" 체크아웃을
// 정당하게 가리키면(스크립트 자신의 .EXAMPLE 이 그 형태를 안내한다) $docsQaRoot 는 여전히
// "이 스크립트가 든" 체크아웃에 고정된 채라, QA_SHOTS_DIR 를 그 다른 체크아웃의 실제 커밋
// docs/qa 로 지정해도 두 값이 물리적으로 달라 가드가 통과(ALLOW)해버린다 — 그 다른 체크아웃의
// 커밋 REPORT.md 가 실제로 덮어써진다. 저장소 밖 throwaway "체크아웃"(스크립트 파일은 복사하지
// 않고 이 저장소의 실제 스크립트를 그대로 실행 — -ProjectRoot 인자만 그 throwaway 트리를
// 가리킨다)으로 재현한다.
test(
  'D-1 (2026-07-28 R5 재수렴, R4 회귀) — operational-validation.ps1 을 -ProjectRoot 로 다른 "실존하는" 체크아웃을 가리키면 그 체크아웃의 커밋 docs/qa 도 보호된다',
  { skip: POWERSHELL_SKIP_REASON, timeout: 30000 },
  () => {
    const otherCheckoutRoot = path.join(tempRoot, 'd1-other-real-checkout')
    const otherCommittedDir = path.join(otherCheckoutRoot, 'docs', 'qa', 'operational-validation')
    fs.rmSync(otherCheckoutRoot, { recursive: true, force: true })
    const committedReportPath = path.join(otherCommittedDir, 'REPORT.md')
    // (2026-07-28 CI RED① fix) "이미 존재하는 커밋 REPORT" 픽스처를 이 파일이 fs.mkdirSync/
    // fs.writeFileSync 로 직접 만들면 G3a(하네스 거짓 green 가드)가 docs/qa 형태 목적지로의
    // 실제 fs 쓰기로 잡는다(2026-07-28 CI RED① 실측) — G3a 가 막으려는 것은 "이 스크립트가
    // QA 증거를 docs/qa 에 직접 캡처하는지"이지 "테스트가 대상 .ps1 에게 사전조건을 마련해
    // 주는 것"이 아니다. 이 파일의 다른 모든 "커밋 디렉토리 시뮬레이션"(MY_FIXTURE_COMMITTED_DIR
    // 등)과 동일하게, 실제 파일 생성은 자식 PowerShell 프로세스에 위임한다 — 이 파일 자신은
    // 목적지 문자열만 구성하고 실 쓰기는 하지 않는다.
    execFileSync(
      POWERSHELL_EXE,
      [
        '-NoProfile',
        '-Command',
        `New-Item -ItemType Directory -Force -Path '${otherCommittedDir}' | Out-Null; Set-Content -LiteralPath '${committedReportPath}' -NoNewline -Value '# 커밋된 것처럼 취급되는 REPORT (throwaway 체크아웃)'`,
      ],
      { timeout: 20000 },
    )
    const beforeContent = fs.readFileSync(committedReportPath, 'utf8')

    const scriptPath = path.join(repoRoot, 'infrastructure', 'scripts', 'operational-validation.ps1')
    process.env.QA_SHOTS_DIR = otherCommittedDir
    let threw = false
    let combined = ''
    try {
      combined = execFileSync(
        POWERSHELL_EXE,
        ['-NoProfile', '-Command', `& '${scriptPath}' -SkipDocker -ProjectRoot '${otherCheckoutRoot}'`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 },
      )
    } catch (e) {
      threw = true
      combined = `${e.stdout ?? ''}${e.stderr ?? ''}`
    } finally {
      delete process.env.QA_SHOTS_DIR
    }

    assert.ok(
      threw,
      `-ProjectRoot 가 가리킨 다른 실존 체크아웃의 커밋 경로를 QA_SHOTS_DIR 로 겨눴는데 차단되지 않았습니다(exit 0, D-1 재발). 출력 마지막 300자: ${combined.slice(-300)}`,
    )
    assert.match(combined, /QA_ALLOW_OVERWRITE=1/, `가드 메시지가 아닌 다른 이유로 실패했을 수 있습니다. 출력 마지막 300자: ${combined.slice(-300)}`)
    const afterContent = fs.readFileSync(committedReportPath, 'utf8')
    assert.equal(afterContent, beforeContent, '다른 체크아웃의 커밋된 REPORT.md 내용이 실제로 덮어써졌습니다(D-1 재발).')
    fs.rmSync(otherCheckoutRoot, { recursive: true, force: true })
  },
)

// 2026-07-28 R5 재수렴 CI RED② — 이 테스트는 process.platform 분기 없이 Windows 전용
// UNC admin-share 문자열을 만들어 assert.throws 를 단언했다. capture.ts 의 resolver 자신은
// isWindows 로 정확히 분기해 UNC 정규화를 Windows 에서만 수행하므로(정상), Linux 에서는
// 이 UNC 형태 문자열이 물리적으로 아무 의미도 없어 가드가 당연히 통과(ALLOW)시킨다 —
// "Missing expected exception" 으로 desktop-playwright CI 잡(mock 회귀 hard gate) 이 항상
// RED 였다(R4 담당이 "논리로는 안전하나 실측은 안 함" 이라 남긴 가정이 실측으로 반증됨).
// T-8(py)·T-9(sh) 와 동일하게 Windows 전용으로 gate 한다 — 결함3 자체와 무관한 결함이다.
test(
  'capture.ts 관찰(2026-07-28 R4 재수렴 결함3) — 자기 자신을 가리키는 UNC admin-share 표기도 물리 가드가 차단한다',
  { skip: isWindowsPlatform() ? false : 'UNC admin-share 는 Windows 전용 개념입니다(resolver 도 process.platform===\'win32\' 로 분기, 2026-07-28 R5 CI RED② 재수렴)' },
  () => {
  const resolveOutputDir = loadCaptureOutputDirResolver(path.join(desktopRoot, 'src', 'main'))
  const realCommittedDir = path.join(docsQaRoot, 'electron-skeleton-slice', 'screenshots')
  const uncTarget = `\\\\localhost\\${realCommittedDir.slice(0, 1).toLowerCase()}$${realCommittedDir.slice(2)}`
  process.env.QA_SHOTS_DIR = uncTarget
  try {
    assert.throws(
      () => resolveOutputDir(),
      (error) => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
      'capture.ts 가 UNC admin-share(localhost) 표기로 지정된 커밋 경로를 차단하지 못했습니다(결함3 재발).',
    )
  } finally {
    delete process.env.QA_SHOTS_DIR
  }
})

// 2026-07-28 R5 재수렴 CI RED② 계열(위 capture.ts 테스트와 동일 근본원인) — 이 테스트도
// 플랫폼 가드 없이 Windows 전용 UNC 문자열을 단언해 Linux CI 에서 실패할 수 있었다.
test(
  'qa/playwright captureForQa(2026-07-28 R4 재수렴 결함3) — 자기 자신을 가리키는 UNC admin-share 목적지도 차단한다',
  { skip: isWindowsPlatform() ? false : 'UNC admin-share 는 Windows 전용 개념입니다(resolver 도 process.platform===\'win32\' 로 분기, 2026-07-28 R5 CI RED② 재수렴)' },
  async () => {
  const captureForQa = loadQaPlaywrightCapture()
  process.env.QA_REPO_ROOT = repoRoot
  const uncTarget = `\\\\127.0.0.1\\${docsQaRoot.slice(0, 1).toLowerCase()}$${docsQaRoot.slice(2)}`
  process.env.QA_SHOTS_DIR = uncTarget

  const page = {
    screenshot: async () => {
      throw new Error('물리 경로 가드가 먼저 실패해야 합니다')
    },
  }
  const testInfo = { attach: async () => {} }

  try {
    await assert.rejects(
      () => captureForQa(page, testInfo, 'qa-playwright-unc-alias'),
      error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
    )
  } finally {
    delete process.env.QA_REPO_ROOT
    delete process.env.QA_SHOTS_DIR
  }
})

function findPythonExecutable() {
  for (const candidate of ['python', 'python3']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' })
      return candidate
    } catch {
      continue
    }
  }
  return null
}

const PYTHON_EXE = findPythonExecutable()
const PYTHON_SKIP_REASON = !isWindowsPlatform()
  ? 'UNC admin-share 는 Windows 전용 개념입니다(resolver 도 os.name==nt 로 분기)'
  : PYTHON_EXE
    ? false
    : '이 환경에 python/python3 실행파일이 없습니다'

test(
  'T-8 (2026-07-28 R4 재수렴 결함3) — qa_shots_dir.py 도 자기 자신을 가리키는 UNC admin-share 표기를 차단한다',
  { skip: PYTHON_SKIP_REASON },
  () => {
    const pyLibDir = path.join(repoRoot, 'scripts', 'lib')
    const uncTarget = `\\\\localhost\\${OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()}$${OTHER_SLUG_COMMITTED_DIR.slice(2)}`
    const code = [
      'import sys, os',
      `sys.path.insert(0, ${JSON.stringify(pyLibDir)})`,
      'from qa_shots_dir import resolve_qa_shots_dir',
      `os.environ['QA_SHOTS_DIR'] = ${JSON.stringify(uncTarget)}`,
      'try:',
      `    resolve_qa_shots_dir(${JSON.stringify(MY_FIXTURE_COMMITTED_DIR)})`,
      '    print("ALLOW")',
      'except Exception as e:',
      '    print("BLOCK:" + str(e))',
    ].join('\n')
    const out = execFileSync(PYTHON_EXE, ['-c', code], { encoding: 'utf8' })
    assert.match(
      out,
      /^BLOCK:.*QA_ALLOW_OVERWRITE=1/s,
      `qa_shots_dir.py 가 UNC admin-share(localhost) 를 차단하지 못했습니다(결함3 재발). 출력: ${out}`,
    )
  },
)

test(
  'T-13 (2026-07-28 R5 재수렴 결함3) — qa_shots_dir.py 도 자기 LAN IP UNC admin-share 를 차단한다',
  { skip: PYTHON_SKIP_REASON || LAN_IP_SKIP_REASON },
  () => {
    const pyLibDir = path.join(repoRoot, 'scripts', 'lib')
    const uncTarget = `\\\\${SELF_LAN_IPV4}\\${OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()}$${OTHER_SLUG_COMMITTED_DIR.slice(2)}`
    const code = [
      'import sys, os',
      `sys.path.insert(0, ${JSON.stringify(pyLibDir)})`,
      'from qa_shots_dir import resolve_qa_shots_dir',
      `os.environ['QA_SHOTS_DIR'] = ${JSON.stringify(uncTarget)}`,
      'try:',
      `    resolve_qa_shots_dir(${JSON.stringify(MY_FIXTURE_COMMITTED_DIR)})`,
      '    print("ALLOW")',
      'except Exception as e:',
      '    print("BLOCK:" + str(e))',
    ].join('\n')
    const out = execFileSync(PYTHON_EXE, ['-c', code], { encoding: 'utf8' })
    assert.match(
      out,
      /^BLOCK:.*QA_ALLOW_OVERWRITE=1/s,
      `qa_shots_dir.py 가 자기 LAN IP(${SELF_LAN_IPV4}) UNC 를 차단하지 못했습니다(결함3 재발). 출력: ${out}`,
    )
  },
)

function findGitBashExecutable() {
  const candidates = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe', 'bash']
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['-c', 'command -v cygpath'], { stdio: 'ignore' })
      return candidate
    } catch {
      continue
    }
  }
  return null
}

const GITBASH_EXE = findGitBashExecutable()
const GITBASH_SKIP_REASON = !isWindowsPlatform()
  ? 'UNC admin-share 는 Windows 전용 개념입니다(resolver 도 cygpath 존재를 환경 신호로 분기)'
  : GITBASH_EXE
    ? false
    : '이 환경에 cygpath 를 가진 bash(Git-Bash/MSYS) 실행파일이 없습니다'

test(
  'T-9 (2026-07-28 R4 재수렴 결함3) — qa-shots-dir.sh 도 자기 자신을 가리키는 UNC admin-share 표기를 차단한다',
  { skip: GITBASH_SKIP_REASON },
  () => {
    // 주의: uncTarget(이중 백슬래시 UNC 문자열)을 bash -c 스크립트 "본문 텍스트"에 직접
    // 보간하면 Windows 의 argv 직렬화 과정에서 백슬래시가 깨진다(실측: \\localhost\... 가
    // \localhost\... 로 축약되어 cygpath 가 다른 경로로 오판). 스크립트 텍스트에는 백슬래시를
    // 전혀 넣지 않고, 환경변수(대상은 CreateProcess 환경 블록이라 argv 이스케이프 규칙을
    // 타지 않는다)로 값을 전달해 우회한다.
    const shLibPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.sh').replaceAll('\\', '/')
    const targetPosix = MY_FIXTURE_COMMITTED_DIR.replaceAll('\\', '/')
    const uncTarget = `\\\\localhost\\${OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()}$${OTHER_SLUG_COMMITTED_DIR.slice(2)}`
    const script = [
      `source '${shLibPath}'`,
      `export QA_SHOTS_DIR="$T9_UNC_TARGET"`,
      `if out="$(resolve_qa_shots_dir '${targetPosix}' 2>&1)"; then printf 'ALLOW\\t%s' "$out"; else printf 'BLOCK\\t%s' "$out"; fi`,
    ].join('\n')
    const out = execFileSync(GITBASH_EXE, ['-c', script], {
      encoding: 'utf8',
      env: { ...process.env, T9_UNC_TARGET: uncTarget },
    })
    assert.match(
      out,
      /^BLOCK\t.*QA_ALLOW_OVERWRITE=1/s,
      `qa-shots-dir.sh 가 UNC admin-share(localhost) 를 차단하지 못했습니다(결함3 재발). 출력: ${out}`,
    )
  },
)

test(
  'T-14 (2026-07-28 R5 재수렴 결함3) — qa-shots-dir.sh 도 자기 LAN IP UNC admin-share 를 차단한다',
  { skip: GITBASH_SKIP_REASON || LAN_IP_SKIP_REASON },
  () => {
    const shLibPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.sh').replaceAll('\\', '/')
    const targetPosix = MY_FIXTURE_COMMITTED_DIR.replaceAll('\\', '/')
    const uncTarget = `\\\\${SELF_LAN_IPV4}\\${OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()}$${OTHER_SLUG_COMMITTED_DIR.slice(2)}`
    const script = [
      `source '${shLibPath}'`,
      `export QA_SHOTS_DIR="$T14_UNC_TARGET"`,
      `if out="$(resolve_qa_shots_dir '${targetPosix}' 2>&1)"; then printf 'ALLOW\\t%s' "$out"; else printf 'BLOCK\\t%s' "$out"; fi`,
    ].join('\n')
    const out = execFileSync(GITBASH_EXE, ['-c', script], {
      encoding: 'utf8',
      env: { ...process.env, T14_UNC_TARGET: uncTarget },
      timeout: 20000,
    })
    assert.match(
      out,
      /^BLOCK\t.*QA_ALLOW_OVERWRITE=1/s,
      `qa-shots-dir.sh 가 자기 LAN IP(${SELF_LAN_IPV4}) UNC 를 차단하지 못했습니다(결함3 재발). 출력: ${out}`,
    )
  },
)

// 2026-07-28 R5 재수렴 결함1 — .sh 만 UNC 슬래시/혼합 표기를 통과시켜 커밋 증거를 실제로
// 덮어썼다. 근본 원인: 나머지 9개 사본은 정규화 이전에 path.resolve/GetFullPath/abspath 가
// '/'→'\' 를 통일해 우연히 막았지만, .sh 의 _qa_normalize_unc_admin_share 정규식은
// 리터럴 백슬래시만 매치해서 순수 슬래시(`//host/C$/...`)·혼합(`\\host\C$/...`) 표기는
// 매치 자체가 안 돼 변환 없이 그대로 cygpath/realpath 로 넘어갔다(그 둘은 lexical
// 변환이라 host/share 를 드라이브 문자로 통일하지 못한다).
test(
  'T-15 (2026-07-28 R5 재수렴 결함1) — qa-shots-dir.sh 는 UNC 슬래시(//host/C$/...)·혼합(\\host\\C$/...) 표기도 차단한다',
  { skip: GITBASH_SKIP_REASON },
  () => {
    const shLibPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.sh').replaceAll('\\', '/')
    const targetPosix = MY_FIXTURE_COMMITTED_DIR.replaceAll('\\', '/')
    const drive = OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()
    const rest = OTHER_SLUG_COMMITTED_DIR.slice(2)
    const cases = {
      'all-slash': `//localhost/${drive}$${rest.replaceAll('\\', '/')}`,
      'mixed-backslash-host-slash-rest': `\\\\localhost\\${drive}$${rest.replaceAll('\\', '/')}`,
    }
    for (const [label, uncTarget] of Object.entries(cases)) {
      const script = [
        `source '${shLibPath}'`,
        `export QA_SHOTS_DIR="$T15_UNC_TARGET"`,
        `if out="$(resolve_qa_shots_dir '${targetPosix}' 2>&1)"; then printf 'ALLOW\\t%s' "$out"; else printf 'BLOCK\\t%s' "$out"; fi`,
      ].join('\n')
      const out = execFileSync(GITBASH_EXE, ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, T15_UNC_TARGET: uncTarget },
        timeout: 20000,
      })
      assert.match(
        out,
        /^BLOCK\t.*QA_ALLOW_OVERWRITE=1/s,
        `qa-shots-dir.sh 가 [${label}] 표기(${uncTarget})를 차단하지 못했습니다(결함1 재발). 출력: ${out}`,
      )
    }
  },
)

// 2026-07-28 R5 재수렴 결함2(.sh) — subst/net-use 매핑 드라이브를 통해 지정된 커밋
// 경로가 차단되지 않았다. cygpath/realpath 는 순수 lexical 변환이라 DOS 디바이스 매핑을
// 모른다(실측: cygpath -u 'X:\probe' → '/x/probe', 물리 대상으로 되돌리지 못함).
// subst/net use 명령 자체의 텍스트 출력(둘 다 로캘 무관 안정 포맷 실측 확인)을
// 유일한 권위 있는 매핑 소스로 파싱한다. 드라이브 문자로 시작하지 않는 입력(대다수
// 실사용 경로)은 이 조회를 완전히 건너뛴다 — subst/net use 프로세스 기동이 각각
// 약 0.4~0.5초로 느려(이 라운드 실측) hot path 에 넣을 수 없다.
test(
  'T-16 (2026-07-28 R5 재수렴 결함2) — qa-shots-dir.sh 는 subst 드라이브를 통해 지정된 커밋 경로도 차단한다',
  { skip: GITBASH_SKIP_REASON, timeout: 30000 },
  () => {
    const shLibPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.sh').replaceAll('\\', '/')
    const targetPosix = MY_FIXTURE_COMMITTED_DIR.replaceAll('\\', '/')
    const docsQaRootWin = docsQaRoot // 절대 Windows 경로, subst 대상으로 그대로 존재
    let substLetter = null
    for (let code = 87; code <= 90; code += 1) {
      // W..Z 중 미사용 문자를 찾는다(A-V 는 실제 볼륨/구형 드라이브와 겹칠 위험 회피)
      const candidate = String.fromCharCode(code)
      if (!fs.existsSync(`${candidate}:\\`)) {
        substLetter = candidate
        break
      }
    }
    assert.ok(substLetter, '이 머신에서 subst 에 쓸 미사용 드라이브 문자(W~Z)를 찾지 못했습니다')
    execFileSync('subst', [`${substLetter}:`, docsQaRootWin])
    try {
      const substTargetPosix = `${substLetter.toLowerCase()}:/__957-r5-subst-guard-fixture__`
      const script = [
        `source '${shLibPath}'`,
        `export QA_SHOTS_DIR="$T16_SUBST_TARGET"`,
        `if out="$(resolve_qa_shots_dir '${targetPosix}' 2>&1)"; then printf 'ALLOW\\t%s' "$out"; else printf 'BLOCK\\t%s' "$out"; fi`,
      ].join('\n')
      const out = execFileSync(GITBASH_EXE, ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, T16_SUBST_TARGET: substTargetPosix },
        timeout: 20000,
      })
      assert.match(
        out,
        /^BLOCK\t.*QA_ALLOW_OVERWRITE=1/s,
        `qa-shots-dir.sh 가 subst 드라이브(${substLetter}:)를 통해 지정된 커밋 경로를 차단하지 못했습니다(결함2 재발). 출력: ${out}`,
      )
    } finally {
      execFileSync('subst', [`${substLetter}:`, '/D'])
      // 방어적 정리 — 가드가 회귀해 실제로 fixture 가 생겼더라도(RED 상태) docs/qa 에
      // 잔재를 남기지 않는다(GREEN 상태에서는 애초에 생성되지 않아 no-op).
      fs.rmSync(path.join(docsQaRoot, '__957-r5-subst-guard-fixture__'), { recursive: true, force: true })
    }
  },
)

// ============================================================================
// 2026-07-28 R5 재수렴 결함1/2/3 · D-1/D-2 회귀 가드.
//
// R5 가 실행으로 반증한 것 — R4 는 "\\localhost\D$\...· \\127.0.0.1\D$\...·
// \\<컴퓨터명>\D$\..." 세 표기만 자기호스트로 인정했는데, 실제 자기 LAN 어댑터 IP
// (예: \\172.21.176.1\D$\...)는 10개 resolver 사본 전부에서 여전히 통과(ALLOW)했다
// (결함3). 고정 별칭 목록은 "열거"이므로 어댑터가 느는 대로 다시 뚫린다 — 그래서 이
// fix 는 고정 목록에 "로컬 인터페이스 실측 조회"를 추가한다(모든 어댑터 IP 를 실제
// OS API 로 물어봐서 비교 — DNS/원격 접속 없이 로컬에서 즉시 끝나는 조회만 쓴다.
// 원격 호스트에 대한 fs.statSync 기반 신원 대조는 이 라운드에서 조사했지만
// 실측으로 도달 불가능한 호스트에서 8초+ 행(hang) 이 재현돼 채택하지 않았다).
// SELF_LAN_IPV4/LAN_IP_SKIP_REASON 정의는 이 파일 상단(PYTHON_SKIP_REASON 근처)으로
// 옮겨져 있다 — T-13(Python)·T-15(sh) 등 더 이른 테스트도 이를 참조하기 때문이다.
// ============================================================================

test(
  'T-10 (2026-07-28 R5 재수렴 결함3) — 4 resolver(cjs/mjs/root-mjs/ts)가 자기 LAN IP UNC admin-share 도 차단한다(고정 별칭 목록이 아니라 로컬 인터페이스 실측 기반 — R4 는 localhost/127.0.0.1/컴퓨터명만 인정했다)',
  { skip: LAN_IP_SKIP_REASON },
  async () => {
    const { resolveQaShotsDir: mjsResolve } = await import(pathToFileURL(mjsHelperPath).href)
    const { resolveQaShotsDir: rootMjsResolve } = await import(pathToFileURL(rootMjsHelperPath).href)
    const resolvers = [
      ['cjs', resolveQaShotsDir],
      ['mjs', mjsResolve],
      ['root-mjs', rootMjsResolve],
      ['ts', loadTypeScriptResolver()],
    ]
    const uncTarget = `\\\\${SELF_LAN_IPV4}\\${OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()}$${OTHER_SLUG_COMMITTED_DIR.slice(2)}`
    try {
      for (const [resolverName, resolver] of resolvers) {
        process.env.QA_SHOTS_DIR = uncTarget
        assert.throws(
          () => resolver(MY_FIXTURE_COMMITTED_DIR),
          (error) => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
          `${resolverName} 가 자기 LAN IP(${SELF_LAN_IPV4}) UNC 표기를 차단하지 못했습니다(결함3 재발).`,
        )
      }
    } finally {
      delete process.env.QA_SHOTS_DIR
    }
  },
)

test(
  'capture.ts 관찰(2026-07-28 R5 재수렴 결함3) — 자기 LAN IP UNC admin-share 표기도 물리 가드가 차단한다',
  { skip: LAN_IP_SKIP_REASON },
  () => {
    const resolveOutputDir = loadCaptureOutputDirResolver(path.join(desktopRoot, 'src', 'main'))
    const realCommittedDir = path.join(docsQaRoot, 'electron-skeleton-slice', 'screenshots')
    const uncTarget = `\\\\${SELF_LAN_IPV4}\\${realCommittedDir.slice(0, 1).toLowerCase()}$${realCommittedDir.slice(2)}`
    process.env.QA_SHOTS_DIR = uncTarget
    try {
      assert.throws(
        () => resolveOutputDir(),
        (error) => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
        `capture.ts 가 자기 LAN IP(${SELF_LAN_IPV4}) UNC 표기로 지정된 커밋 경로를 차단하지 못했습니다(결함3 재발).`,
      )
    } finally {
      delete process.env.QA_SHOTS_DIR
    }
  },
)

test(
  'qa/playwright captureForQa(2026-07-28 R5 재수렴 결함3) — 자기 LAN IP UNC 목적지도 차단한다',
  { skip: LAN_IP_SKIP_REASON },
  async () => {
    const captureForQa = loadQaPlaywrightCapture()
    process.env.QA_REPO_ROOT = repoRoot
    const uncTarget = `\\\\${SELF_LAN_IPV4}\\${docsQaRoot.slice(0, 1).toLowerCase()}$${docsQaRoot.slice(2)}`
    process.env.QA_SHOTS_DIR = uncTarget

    const page = {
      screenshot: async () => {
        throw new Error('물리 경로 가드가 먼저 실패해야 합니다')
      },
    }
    const testInfo = { attach: async () => {} }

    try {
      await assert.rejects(
        () => captureForQa(page, testInfo, 'qa-playwright-lan-ip-alias'),
        (error) => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
      )
    } finally {
      delete process.env.QA_REPO_ROOT
      delete process.env.QA_SHOTS_DIR
    }
  },
)

// ============================================================================
// 2026-07-28 R5 재수렴 부수 지적 — "타 호스트는 여전히 ALLOW(과차단 0)" 가 R4/R5 라운드
// 보고서에 실행 결과처럼 인용됐지만, 저장소에 이를 확인하는 **자동 테스트가 없었다**(대조
// 각도가 독립 수동 프로브로 참임을 확인했을 뿐 — 이 저장소가 스스로 회귀를 잡지 못하는
// 상태였다). 결함3 fix(자기 LAN IP 로컬 인터페이스 조회 추가)는 특히 "진짜 다른 호스트를
// 실수로 self 로 오판하지 않는가"가 핵심 과차단 위험이므로, 그 축을 10개 사본 전부에서
// 직접 검증하는 자동 테스트를 추가한다(서술 정정 대신 테스트 추가 쪽을 택함 — 재발 방지
// 가치가 더 크다).
// ============================================================================
test(
  'N-3 (2026-07-28 R5 재수렴 부수) — 진짜 다른 호스트를 가리키는 UNC admin-share 는 10개 resolver 사본 전부에서 여전히 ALLOW 다(과차단 0)',
  { skip: LAN_IP_SKIP_REASON },
  async () => {
    // 실존하지 않을 가능성이 매우 높은 사설 IP(TEST-NET-3, RFC 5737)를 "다른 호스트"로
    // 쓴다 — 이 머신의 실제 어댑터 IP(SELF_LAN_IPV4)와 절대 겹치지 않는다.
    const otherHost = '203.0.113.77'
    assert.notEqual(otherHost, SELF_LAN_IPV4, '테스트 상수가 우연히 이 머신의 실제 IP 와 같습니다 — 다른 값으로 교체할 것')
    const uncTarget = `\\\\${otherHost}\\${OTHER_SLUG_COMMITTED_DIR.slice(0, 1).toLowerCase()}$${OTHER_SLUG_COMMITTED_DIR.slice(2)}`

    // --- Node/TS 4종(cjs/mjs/root-mjs/ts) ---
    const { resolveQaShotsDir: mjsResolve } = await import(pathToFileURL(mjsHelperPath).href)
    const { resolveQaShotsDir: rootMjsResolve } = await import(pathToFileURL(rootMjsHelperPath).href)
    const nodeResolvers = [
      ['cjs', resolveQaShotsDir],
      ['mjs', mjsResolve],
      ['root-mjs', rootMjsResolve],
      ['ts', loadTypeScriptResolver()],
    ]
    // 주의 — otherHost 는 실존하지 않는 호스트라, 가드가 "차단 안 함"(ALLOW) 판정을 내린
    // *이후*에도 실제 fs.mkdirSync/mkdir 시도 자체가 ENOENT/EHOSTUNREACH 류로 실패한다.
    // 이건 "다른 호스트를 실제로 쓸 수 없다"는 당연한 결과이지 과차단이 아니다 — 그래서
    // 예외가 나더라도 **가드의 특정 메시지(QA_ALLOW_OVERWRITE=1)가 아니면** 과차단이
    // 아닌 것으로 판정한다(가드가 던지는 유일한 예외 서명이 이 문자열이다).
    function isGuardBlockedError(error) {
      return error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1')
    }

    for (const [resolverName, resolver] of nodeResolvers) {
      process.env.QA_SHOTS_DIR = uncTarget
      let guardBlocked = false
      try {
        resolver(MY_FIXTURE_COMMITTED_DIR)
      } catch (error) {
        guardBlocked = isGuardBlockedError(error)
      } finally {
        delete process.env.QA_SHOTS_DIR
      }
      assert.equal(guardBlocked, false, `${resolverName} 가 진짜 다른 호스트(${otherHost}) UNC 를 과차단했습니다(회귀).`)
    }

    // --- capture.ts ---
    {
      const resolveOutputDir = loadCaptureOutputDirResolver(path.join(desktopRoot, 'src', 'main'))
      const realCommittedDir = path.join(docsQaRoot, 'electron-skeleton-slice', 'screenshots')
      const captureUncTarget = `\\\\${otherHost}\\${realCommittedDir.slice(0, 1).toLowerCase()}$${realCommittedDir.slice(2)}`
      process.env.QA_SHOTS_DIR = captureUncTarget
      let guardBlocked = false
      try {
        resolveOutputDir()
      } catch (error) {
        guardBlocked = isGuardBlockedError(error)
      } finally {
        delete process.env.QA_SHOTS_DIR
      }
      assert.equal(guardBlocked, false, `capture.ts 가 진짜 다른 호스트(${otherHost}) UNC 를 과차단했습니다(회귀).`)
    }

    // --- qa/playwright --- (mkdir 이 fake host 에서 실패할 수 있으므로 가드 메시지
    // 유무로만 과차단을 판정한다. mkdir 자체의 실패는 이 테스트의 관심사가 아니다.)
    {
      const captureForQa = loadQaPlaywrightCapture()
      process.env.QA_REPO_ROOT = repoRoot
      process.env.QA_SHOTS_DIR = `\\\\${otherHost}\\${docsQaRoot.slice(0, 1).toLowerCase()}$${docsQaRoot.slice(2)}`
      const page = { screenshot: async () => {} }
      const testInfo = { attach: async () => {} }
      let guardBlocked = false
      try {
        await captureForQa(page, testInfo, 'qa-playwright-other-host-allow')
      } catch (error) {
        guardBlocked = isGuardBlockedError(error)
      } finally {
        delete process.env.QA_REPO_ROOT
        delete process.env.QA_SHOTS_DIR
      }
      assert.equal(guardBlocked, false, `qa/playwright 가 진짜 다른 호스트(${otherHost}) UNC 를 과차단했습니다(회귀).`)
    }

    // --- Python ---
    if (!PYTHON_SKIP_REASON) {
      const pyLibDir = path.join(repoRoot, 'scripts', 'lib')
      const code = [
        'import sys, os',
        `sys.path.insert(0, ${JSON.stringify(pyLibDir)})`,
        'from qa_shots_dir import resolve_qa_shots_dir',
        `os.environ['QA_SHOTS_DIR'] = ${JSON.stringify(uncTarget)}`,
        'try:',
        `    resolve_qa_shots_dir(${JSON.stringify(MY_FIXTURE_COMMITTED_DIR)})`,
        '    print("ALLOW")',
        'except Exception as e:',
        '    print("BLOCK:" + str(e))',
      ].join('\n')
      // otherHost 가 실존하지 않아 os.makedirs 자체가(가드 통과 후) 실패할 수 있다 —
      // 그 실패는 과차단이 아니다. 가드의 특정 메시지가 없으면 과차단 아닌 것으로 판정.
      const out = execFileSync(PYTHON_EXE, ['-c', code], { encoding: 'utf8' })
      assert.doesNotMatch(
        out,
        /QA_ALLOW_OVERWRITE=1/,
        `qa_shots_dir.py 가 진짜 다른 호스트(${otherHost}) UNC 를 과차단했습니다(회귀). 출력: ${out}`,
      )
    }

    // --- sh ---
    if (!GITBASH_SKIP_REASON) {
      const shLibPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.sh').replaceAll('\\', '/')
      const targetPosix = MY_FIXTURE_COMMITTED_DIR.replaceAll('\\', '/')
      const script = [
        `source '${shLibPath}'`,
        `export QA_SHOTS_DIR="$N3_UNC_TARGET"`,
        `if out="$(resolve_qa_shots_dir '${targetPosix}' 2>&1)"; then printf 'ALLOW\\t%s' "$out"; else printf 'BLOCK\\t%s' "$out"; fi`,
      ].join('\n')
      // otherHost 가 실존하지 않아 mkdir -p 자체가(가드 통과 후) 실패할 수 있다 — 그
      // 실패는 과차단이 아니다. 가드의 특정 메시지가 없으면 과차단 아닌 것으로 판정.
      const out = execFileSync(GITBASH_EXE, ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, N3_UNC_TARGET: uncTarget },
        timeout: 20000,
      })
      assert.doesNotMatch(
        out,
        /QA_ALLOW_OVERWRITE=1/,
        `qa-shots-dir.sh 가 진짜 다른 호스트(${otherHost}) UNC 를 과차단했습니다(회귀). 출력: ${out}`,
      )
    }

    // --- PowerShell 2종(qa-shots-dir.ps1 / operational-validation.ps1) ---
    if (!POWERSHELL_SKIP_REASON) {
      const libPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.ps1')
      const psCommand1 = [
        `. '${libPath}'`,
        `try { Resolve-QaShotsDir -CommittedDir '${MY_FIXTURE_COMMITTED_DIR}' -RequestedDir '${uncTarget}' | Out-Null; Write-Output 'ALLOW' } catch { Write-Output ('BLOCK:' + $_.Exception.Message) }`,
      ].join('; ')
      // otherHost 가 실존하지 않아 New-Item(디렉터리 생성) 자체가(가드 통과 후) 실패할 수
      // 있다 — 그 실패는 과차단이 아니다. 가드의 특정 메시지가 없으면 과차단 아닌 것으로 판정.
      const out1 = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-Command', psCommand1], { encoding: 'utf8', timeout: 20000 })
      assert.doesNotMatch(
        out1,
        /QA_ALLOW_OVERWRITE=1/,
        `qa-shots-dir.ps1 이 진짜 다른 호스트(${otherHost}) UNC 를 과차단했습니다(회귀). 출력: ${out1}`,
      )

      const opsvalScriptPath = path.join(repoRoot, 'infrastructure', 'scripts', 'operational-validation.ps1')
      let threw = false
      let combined = ''
      try {
        combined = execFileSync(
          POWERSHELL_EXE,
          ['-NoProfile', '-Command', `$env:QA_SHOTS_DIR='${uncTarget}'; & '${opsvalScriptPath}' -SkipDocker -ProjectRoot '${repoRoot}'`],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 },
        )
      } catch (e) {
        threw = true
        combined = `${e.stdout ?? ''}${e.stderr ?? ''}`
      }
      // 과차단 되지 않았다면 가드 throw 가 없어 스크립트가 끝까지 실행돼야 한다(항목 4 의
      // 무관한 선재 Join-Path 비종료 오류는 나더라도 [QA 출력 경로 가드] 메시지는 없어야 함).
      assert.doesNotMatch(
        combined,
        /\[QA 출력 경로 가드\]/,
        `operational-validation.ps1 이 진짜 다른 호스트(${otherHost}) UNC 를 과차단했습니다(회귀). 출력 마지막 300자: ${combined.slice(-300)}`,
      )
    }
  },
)

// ============================================================================
// #957 조사 보고서 6건 RED-first 회귀 테스트.
//
// 아래 테스트는 수정 전 현재 구현에서 반드시 실패해야 한다. 조회 실패를
// "경로 밖"으로 바꾸는 각 경계를 직접 모킹하고, 정상적인 OS temp 경로를
// 사용해 RED 상태에서도 커밋된 docs/qa 파일은 건드리지 않는다.
// ============================================================================

test('957-RED-1 — Node 물리 조회가 false로 흡수되면 안 되고 커밋 QA 대상은 차단되어야 한다', () => {
  const aliasRoot = path.join(tempRoot, '957-red-node-alias')
  fs.mkdirSync(tempRoot, { recursive: true })
  fs.symlinkSync(docsQaRoot, aliasRoot, 'junction')
  const originalExistsSync = fs.existsSync
  fs.existsSync = candidate => (path.resolve(candidate) === path.resolve(aliasRoot) ? false : originalExistsSync(candidate))
  process.env.QA_SHOTS_DIR = aliasRoot
  try {
    assert.throws(
      () => resolveQaShotsDir(MY_FIXTURE_COMMITTED_DIR),
      error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
      '조회 실패를 경로 없음으로 해석해 물리 docs/qa alias가 허용되었습니다',
    )
  } finally {
    fs.existsSync = originalExistsSync
  }
})

test('957-RED-2 — Python commonpath 조회 실패는 False가 아니라 명시적 실패여야 한다', () => {
  const fixtureDir = path.join(docsQaRoot, '__957-red-python-commonpath__')
  const pyLibDir = path.join(repoRoot, 'scripts', 'lib')
  const code = [
    'import os, sys',
    `sys.path.insert(0, ${JSON.stringify(pyLibDir)})`,
    'import qa_shots_dir',
    'qa_shots_dir.os.path.commonpath = lambda paths: (_ for _ in ()).throw(ValueError("injected commonpath failure"))',
    `os.environ['QA_SHOTS_DIR'] = ${JSON.stringify(fixtureDir)}`,
    'try:',
    `    qa_shots_dir.resolve_qa_shots_dir(${JSON.stringify(MY_FIXTURE_COMMITTED_DIR)})`,
    '    print("ALLOW")',
    'except Exception as error:',
    '    print("BLOCK:" + str(error))',
  ].join('\n')
  try {
    const output = execFileSync(PYTHON_EXE ?? 'python', ['-c', code], { encoding: 'utf8' })
    assert.match(output, /^BLOCK:/s, `commonpath 조회 실패가 허용 경로로 흘렀습니다: ${output}`)
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  }
})

test('957-RED-3 — Bash 포함 판정 조회 실패는 외부 경로로 오인하지 않고 resolver가 실패해야 한다', () => {
  const shLibPath = path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.sh').replaceAll('\\', '/')
  const outputDir = path.join(tempRoot, '957-red-bash-query-failure')
  const targetPosix = path.join(tempRoot, 'committed').replaceAll('\\', '/')
  const script = [
    `source '${shLibPath}'`,
    '_qa_is_within_physical() { return 2; }',
    `export QA_SHOTS_DIR='${outputDir.replaceAll('\\', '/')}'`,
    `if out="$(resolve_qa_shots_dir '${targetPosix}' 2>&1)"; then printf 'ALLOW\\t%s' "$out"; else printf 'BLOCK\\t%s' "$out"; fi`,
  ].join('\n')
  const output = execFileSync(GITBASH_EXE ?? 'bash', ['-c', script], { encoding: 'utf8' })
  assert.match(output, /^BLOCK\t/s, `Bash 조회 실패가 허용 경로로 흘렀습니다: ${output}`)
  assert.equal(fs.existsSync(outputDir), false, 'Bash 조회 실패 뒤 OS temp 출력 디렉터리가 생성되었습니다')
})

test('957-RED-4 — Bash 실제 소비자는 resolver의 nonzero 상태를 무시하고 다음 쓰기로 진행하면 안 된다', () => {
  function readBackendConsumerPrefix() {
    return fs
      .readFileSync(path.join(repoRoot, 'docs', 'qa', 'dev-menu-dev2', 'backend-qa.sh'), 'utf8')
      .split(/\r?\n/)
      .slice(0, 13)
  }
  const consumerLines = readBackendConsumerPrefix()
  consumerLines[5] = `source '${path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.sh').replaceAll('\\', '/')}'`
  consumerLines.push("printf 'CONTINUED'")
  const probePath = path.join(tempRoot, '957-red-bash-consumer.sh')
  fs.mkdirSync(tempRoot, { recursive: true })
  fs.writeFileSync(probePath, `${consumerLines.join('\n')}\n`, 'utf8')
  let output = ''
  let status = 0
  try {
    output = execFileSync(GITBASH_EXE ?? 'bash', [probePath.replaceAll('\\', '/')], {
      encoding: 'utf8',
      env: { ...process.env, QA_SHOTS_DIR: docsQaRoot.replaceAll('\\', '/') },
    })
  } catch (error) {
    status = error.status ?? 1
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
  assert.equal(status, 1, `resolver 실패를 소비자가 성공으로 처리했습니다: ${output}`)
  assert.doesNotMatch(output, /CONTINUED/, `resolver return 1 뒤에도 소비자가 진행했습니다: ${output}`)
})

test('957-RED-5 — 공유 PowerShell 물리 조회 실패는 $null lexical fallback으로 낮아지면 안 된다', () => {
  const source = readSourceText(path.join(repoRoot, 'scripts', 'lib', 'qa-shots-dir.ps1'))
  assert.doesNotMatch(
    source,
    /catch\s*\{\s*return\s+\$null\s*\}/s,
    'Get-QaFinalPhysicalPath가 조회 예외를 $null로 삼키는 fallback을 유지합니다',
  )
  assert.doesNotMatch(source, /while\s*\(-not\s*\(Test-Path\s+-LiteralPath\s+\$current\)\)/s, 'Test-Path False와 조회 오류를 구분하지 않습니다')
})

test('957-RED-6 — operational-validation.ps1은 물리 판정 실패 시 Continue/기본 False로 REPORT 쓰기를 진행하면 안 된다', () => {
  const source = readSourceText(path.join(repoRoot, 'infrastructure', 'scripts', 'operational-validation.ps1'))
  assert.doesNotMatch(source, /^\s*\$ErrorActionPreference\s*=\s*["']Continue["']/m, '전역 Continue가 물리 조회 실패를 비종료 오류로 만듭니다')
  assert.doesNotMatch(
    source,
    /if\s*\(\$AdditionalDocsQaRoot\s*-and\s*\(Test-Path\s+-LiteralPath\s+\$AdditionalDocsQaRoot\)\)/s,
    '추가 anchor Test-Path 실패가 기본 False로 흡수됩니다',
  )
})
