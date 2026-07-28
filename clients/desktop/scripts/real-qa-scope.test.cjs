const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const test = require('node:test')

const {
  assertDerivedArtifactsFresh,
  assertRealQaScope,
  checkFreshnessOrSkip,
  decideRealQaScope,
  EXPLICIT_PATH_ARGS_ENV_VAR,
  getRealQaScope,
  listTrackedRealQaFiles,
  parseExplicitPathArgs,
  resolveRequestedFiles,
} = require('./real-qa-scope.cjs')

const repoRoot = path.resolve(__dirname, '../../..')
const MIN_TRACKED_REAL_QA_FILE_COUNT = 172

// assertRealQaScope 는 narrow 실행을 감지하면 부모→자식(워커) 전파를 위해 자기 자신의
// process.env 에 내부 마커를 남긴다(결함1·3 실측 보강, 아래 참고). node:test 는 한 파일의
// 모든 test() 를 같은 프로세스에서 실행하므로, 이 값이 앞 테스트에서 뒤 테스트로 새지 않도록
// assertRealQaScope 를 쓰는 각 테스트 시작 지점에서 지운다.
function resetExplicitPathEnv() {
  delete process.env[EXPLICIT_PATH_ARGS_ENV_VAR]
}
const F2_FILES = [
  'clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts',
  'clients/desktop/playwright/dispatch-collab-real-qa/dispatch-collab-real-qa.spec.ts',
]

test('real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다', () => {
  const scope = getRealQaScope({ repoRoot })

  // [SONNET5 R1 결함6 fix] assert.equal → 최소-기준(>=)으로 완화. 형제 트랙이 정상적으로
  // real-QA 스펙을 "추가"하는 방향은 CI 를 막지 않아야 한다(U-7). 감소(#864 계열 회귀)만 막는다.
  assert.ok(
    scope.trackedFiles.length >= MIN_TRACKED_REAL_QA_FILE_COUNT,
    `추적 real-QA 스펙 수(${scope.trackedFiles.length})가 최소 기준 ${MIN_TRACKED_REAL_QA_FILE_COUNT}개보다 줄었습니다. #864 계열 회귀일 수 있어 검토가 필요합니다.`,
  )
  assert.deepEqual(scope.untrackedFiles, [], '미추적 스펙이 공식 집합에 섞였습니다.')
  assert.deepEqual(scope.missingFiles, [], '추적 스펙이 디스크 수집에서 빠졌습니다.')
  assert.deepEqual(scope.diskFiles, scope.trackedFiles, '디스크 수집 집합과 Git 추적 집합이 다릅니다.')
})

test('F-2: .gitignore 등재 경로 안의 추적 스펙 2개가 공식 집합에 남는다', () => {
  const scope = getRealQaScope({ repoRoot })

  for (const file of F2_FILES) {
    assert.ok(scope.diskFiles.includes(file), `${file}가 디스크 수집 집합에서 빠졌습니다.`)
    assert.ok(scope.trackedFiles.includes(file), `${file}가 Git 추적 집합에서 빠졌습니다.`)
  }
})

test('결함6 참고: 구 assert.equal 방식은 추적 스펙이 늘기만 해도 실패했다(합성 173 vs 172, 고정 실측)', () => {
  assert.throws(
    () => assert.equal(173, MIN_TRACKED_REAL_QA_FILE_COUNT),
    /AssertionError/,
    '이것이 결함6의 근본원인 — 증가만 해도 옛 방식(assert.equal)은 RED 였다',
  )
})

// ---------------------------------------------------------------------------
// 결함 1·2·3·8 — 임시 git 저장소 fixture 로 순수 로직(git/fs 실접근)을 검증한다.
// 실 레포의 playwright/ 트리는 건드리지 않는다(RED-first 지침의 커밋 파일 삭제 사고 재발 방지).
// ---------------------------------------------------------------------------

function createTempRealQaRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-qa-scope-'))
  execFileSync('git', ['init', '--quiet'], { cwd: dir, windowsHide: true })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, windowsHide: true })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, windowsHide: true })
  return dir
}

function writeRealQaSpec(repoRoot_, relPath, content = '// real-qa spec fixture\n') {
  const absolute = path.join(repoRoot_, relPath)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content, 'utf8')
}

function commitAllRealQaSpecs(repoRoot_) {
  execFileSync('git', ['add', '-A'], { cwd: repoRoot_, windowsHide: true })
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repoRoot_, windowsHide: true })
}

function removeTempRepo(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function captureStreams(fn) {
  const originalOut = process.stdout.write.bind(process.stdout)
  const originalErr = process.stderr.write.bind(process.stderr)
  let out = ''
  let err = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  process.stderr.write = (chunk) => {
    err += chunk
    return true
  }
  try {
    const result = fn()
    return { out, err, result }
  } finally {
    process.stdout.write = originalOut
    process.stderr.write = originalErr
  }
}

test('결함1: REAL_QA_ALLOW_UNTRACKED 세션 잔존은 명시 경로 없는 전체 실행을 오염시키지 않는다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/a-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    // 직전 narrow 실행이 세션에 남긴 것처럼 미추적 로컬 스펙을 흩어놓는다.
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts')

    const fullRunArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts', '--reporter=line']
    assert.throws(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: true, argv: fullRunArgv }),
      /추적 집합 불일치/,
      'ALLOW_UNTRACKED=1 이 세션에 남아도 명시 경로 없는 전체 실행은 차단되어야 합니다(U-1/U-2)',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('결함1 U-1: 예외 모드 경고가 stdout 에도 남는다(1> 리다이렉트로도 보여야 함)', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/a-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts')

    const narrowArgv = [
      'node',
      'cli.js',
      'test',
      '--config=playwright.real-qa.config.ts',
      'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts',
    ]

    const { out } = captureStreams(() =>
      assertRealQaScope({ repoRoot: tempRoot, allowUntracked: true, argv: narrowArgv }),
    )
    assert.match(out, /로컬 실행 모드/, '예외 모드 경고가 stdout(수치와 같은 스트림)에도 남아야 합니다')
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('결함2: allowUntracked 는 집합이 줄어드는 방향(missingFiles)을 절대 덮지 않는다(#864 계열)', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/a-real-qa.spec.ts')
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/b-real-qa.spec.ts')
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/c-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    fs.rmSync(path.join(tempRoot, 'clients/desktop/playwright/b-real-qa.spec.ts'))
    fs.rmSync(path.join(tempRoot, 'clients/desktop/playwright/c-real-qa.spec.ts'))
    // disk=1(a) tracked=3(a,b,c) missing=[b,c] — PR#969 R1 결함2 원 repro 재현

    const fullRunArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts']
    assert.throws(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: true, argv: fullRunArgv }),
      /추적 집합 불일치/,
      'missingFiles 는 allowUntracked=true 라도 항상 막아야 합니다(U-3, 집합 축소 방지)',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('결함3: 미추적 로컬 스펙이 있어도 추적 스펙만의 격리 실행은 막지 않는다(플래그 불필요)', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    // 관련 없는 미추적 로컬 스펙 — .gitignore 가 권장하는 7개 디렉터리 중 하나를 흉내낸다.
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/a1-leak-probe-real-qa.spec.ts')

    const narrowArgv = [
      'node',
      'cli.js',
      'test',
      '--config=playwright.real-qa.config.ts',
      '--list',
      'playwright/manual/slip-form-3d-real-qa.spec.ts',
    ]

    assert.doesNotThrow(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: narrowArgv }),
      'REAL_QA_ALLOW_UNTRACKED 없이도 추적 스펙만의 격리 실행은 통과해야 합니다(U-4)',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('결함3 보강: narrow 실행에 미추적 스펙 자신이 포함되면 여전히(플래그 없이는) 막는다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/manual/tracked-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/my-local-real-qa.spec.ts')

    const narrowArgv = [
      'node',
      'cli.js',
      'test',
      '--config=playwright.real-qa.config.ts',
      'playwright/n1b-native-qa/my-local-real-qa.spec.ts',
    ]

    assert.throws(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: narrowArgv }),
      /추적 집합 불일치/,
      '요청 파일 자신이 미추적이면 narrow 실행이라도 플래그 없이는 막아야 합니다',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('결함1·3 실측 보강: Playwright 워커 프로세스처럼 argv 가 비어도 narrow 실행이 유지된다(부모→자식 전파)', () => {
  // 실측(PR#969 R1 fix 세션): --list 는 config 를 메인 프로세스 1회만 로드하지만, 실제
  // playwright test 실행은 워커 자식 프로세스에서 config 를 다시 로드한다(node_modules/
  // playwright/lib/common/process.js). 그 워커의 process.argv 는 원래 CLI 인자를 담지 않아
  // (예: ["node","…/process.js"]) narrow 실행이 워커 단계에서 "명시 경로 없는 전체 실행"으로
  // 오판되어 다시 막혔다 — REAL_QA_ALLOW_UNTRACKED=1 로 실제 실행해서만 드러났다(--list 로는
  // 안 드러남). 아래는 그 워커 재호출을 argv 없이 흉내 낸다.
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/manual/worker-sim-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/unrelated-real-qa.spec.ts')

    const mainProcessArgv = [
      'node',
      'cli.js',
      'test',
      '--config=playwright.real-qa.config.ts',
      'playwright/manual/worker-sim-real-qa.spec.ts',
    ]
    assert.doesNotThrow(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: mainProcessArgv }),
      '메인 프로세스(원래 CLI 인자 보유)는 narrow 실행으로 통과해야 합니다',
    )

    // 워커 프로세스 흉내 — 실측된 실제 argv 형태(원래 CLI 인자 없음). [SONNET5 R2-3 fix]
    // TEST_WORKER_INDEX 도 함께 심는다 — 실제 워커는 Playwright 가 워커 생성자에서 이 값을
    // 항상 먼저 설정해 둔다(실측: node_modules/playwright/lib/worker/workerMain.js:60, 실제
    // 프로세스 fork 로 config 재로드 시점에 이미 존재함을 확인). 이 값이 없으면(=진짜 워커가
    // 아니면) R2-3 fix 가 상속을 거부하므로, "진짜 워커" 시나리오를 정확히 흉내내려면 이 값도
    // 함께 심어야 한다 — R2-3 fix 전에는 이 값의 유무가 결과에 영향이 없었다(그것이 R2-3 결함).
    process.env['TEST_WORKER_INDEX'] = '0'
    const workerProcessArgv = ['node', 'D:\\...\\node_modules\\playwright\\lib\\common\\process.js']
    assert.doesNotThrow(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: workerProcessArgv }),
      '워커가 부모의 명시 경로를 이어받지 못하면 narrow 실행이 워커 단계에서 다시 막힌다(실측 재현)',
    )
  } finally {
    delete process.env['TEST_WORKER_INDEX']
    resetExplicitPathEnv()
    removeTempRepo(tempRoot)
  }
})

test('결함8: core.quotepath 8진 이스케이프가 걸려도 비ASCII 추적 real-QA 스펙을 잃지 않는다', () => {
  const tempRoot = createTempRealQaRepo()
  try {
    const specRelPath = 'clients/desktop/playwright/n1-korean-real-qa/재고조회-real-qa.spec.ts'
    writeRealQaSpec(tempRoot, specRelPath)
    commitAllRealQaSpecs(tempRoot)

    for (const quotepath of ['true', 'false']) {
      execFileSync('git', ['config', '--local', 'core.quotepath', quotepath], { cwd: tempRoot, windowsHide: true })
      const tracked = listTrackedRealQaFiles({ repoRoot: tempRoot })
      assert.ok(
        tracked.includes(specRelPath),
        `core.quotepath=${quotepath} 에서 비ASCII 추적 스펙이 tracked 집합에서 사라졌습니다(U-9): ${JSON.stringify(tracked)}`,
      )
    }
  } finally {
    removeTempRepo(tempRoot)
  }
})

// ---------------------------------------------------------------------------
// R2 라운드 — R2-1(위치 인자 매칭이 Playwright 가 지원하는 형태 전부를 통과) ·
// R2-2(예외 모드 stdout 쓰기가 --reporter=json/junit 산출물을 오염) ·
// R2-3(내부 전용 마커를 외부에서 export 하면 전체 실행 게이트를 우회) fixture.
// ---------------------------------------------------------------------------

test('R2-1 글롭 인자: `<접두사>-*` 형태로 추적 스펙 2개만의 격리 실행이 통과한다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(
      tempRoot,
      'clients/desktop/playwright/r2fix-alpha-null-semantics-real-qa/r2fix-alpha-null-semantics-real-qa.spec.ts',
    )
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/r2fix-alpha-other-real-qa/r2fix-alpha-other-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    // 무관한 미추적 로컬 스펙 — 격리 실행을 막으면 안 된다(U-4 유지 확인).
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/unrelated-r2fix-real-qa.spec.ts')

    const globArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts', '--list', 'playwright/r2fix-alpha-*']
    assert.doesNotThrow(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: globArgv }),
      'Playwright 가 실제로 지원하는 글롭 인자는 REAL_QA_ALLOW_UNTRACKED 없이도 격리 실행을 통과해야 합니다(U-1)',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-1 조각(fragment) 인자 — 여러 파일에 걸치는 조각(예: 825-s5)', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(
      tempRoot,
      'clients/desktop/playwright/r2fix-alpha-null-semantics-real-qa/r2fix-alpha-null-semantics-real-qa.spec.ts',
    )
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/r2fix-alpha-other-real-qa/r2fix-alpha-other-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/unrelated-r2fix-real-qa.spec.ts')

    const fragmentArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts', '--list', 'r2fix-alpha']
    assert.doesNotThrow(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: fragmentArgv }),
      '문서형 조각 인자(예: 825-s5)도 격리 실행을 통과해야 합니다(U-1)',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-1 조각(fragment) 인자 — 파일 하나만 골라내는 조각(예: null-semantics)은 형제 파일을 끌어오지 않는다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    const onlyFile = 'clients/desktop/playwright/r2fix-alpha-null-semantics-real-qa/r2fix-alpha-null-semantics-real-qa.spec.ts'
    writeRealQaSpec(tempRoot, onlyFile)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/r2fix-alpha-other-real-qa/r2fix-alpha-other-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)

    const requested = resolveRequestedFiles({
      scope: getRealQaScope({ repoRoot: tempRoot }),
      explicitPathArgs: parseExplicitPathArgs([
        'node',
        'cli.js',
        'test',
        '--config=playwright.real-qa.config.ts',
        '--list',
        'null-semantics',
      ]),
      repoRoot: tempRoot,
    })
    assert.deepEqual(
      [...requested].sort(),
      [onlyFile],
      '조각이 한 파일에만 있으면 그 한 파일만 선택돼야 합니다(다른 형제 파일까지 끌려오면 안 됨)',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-1 절대경로(정방향 슬래시) 인자로 추적 스펙 격리 실행이 통과한다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    const relPath = 'clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts'
    writeRealQaSpec(tempRoot, relPath)
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/unrelated-r2fix-real-qa.spec.ts')

    const absolutePath = path.resolve(tempRoot, relPath).split(path.sep).join('/')
    const absArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts', '--list', absolutePath]
    assert.doesNotThrow(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: absArgv }),
      '절대경로(정방향 슬래시) 인자도 격리 실행을 통과해야 합니다(U-1)',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-1 I-3: 미추적 스펙 자신을 조각으로 지정 + ALLOW=1 이면 통과한다(R1 에서는 이 형태가 불가능했음)', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/manual/tracked-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/r2fix-untracked-only-real-qa.spec.ts')

    const fragmentArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts', 'r2fix-untracked-only']
    assert.throws(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: fragmentArgv }),
      /추적 집합 불일치/,
      'ALLOW 없이는 여전히 막혀야 합니다',
    )
    assert.doesNotThrow(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: true, argv: fragmentArgv }),
      '미추적 스펙 자신을 조각으로 지정 + ALLOW=1 이면 이제는 통과해야 합니다(I-3)',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-1 U-2: 글롭 인자 + ALLOW=1 실행 시 "명시 경로가 있는 실행에만 적용" 모순 메시지가 더는 나오지 않는다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/manual/tracked-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/r2fix-untracked-glob-real-qa.spec.ts')

    const globArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts', '--list', 'r2fix-untracked-glob-*']
    const { out, err } = captureStreams(() => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: true, argv: globArgv }))
    assert.doesNotMatch(
      out + err,
      /명시 경로가 있는 실행에만 적용/,
      '글롭으로 명시 경로를 줬으므로 이 모순 메시지가 나오면 안 됩니다(U-2, R2 라운드 (다) 재현 해소)',
    )
    assert.match(out, /로컬 실행 모드/, '예외 모드 경고 자체는 여전히 나와야 합니다')
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-1 회귀: 백슬래시 상대경로 인자(Windows 관용 표기)는 여전히 격리 실행을 통과한다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)

    const backslashArgv = [
      'node',
      'cli.js',
      'test',
      '--config=playwright.real-qa.config.ts',
      'playwright\\manual\\slip-form-3d-real-qa.spec.ts',
    ]
    assert.doesNotThrow(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: backslashArgv }),
      '백슬래시 상대경로는 R1 에서도 통과하던 형태입니다 — 회귀시키면 안 됩니다(Playwright 자신은 이 형태를 regex\n' +
        '이스케이프 문제로 지원하지 않지만(실측: 실제 CLI 로 0 tests), 사람이 타이핑한 의도는 명확해 구분자만 정규화합니다)',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-1 경계: 알려진 파일 어디에도 없는 단어는 narrow 실행으로 오인되지 않는다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)

    const requested = resolveRequestedFiles({
      scope: getRealQaScope({ repoRoot: tempRoot }),
      explicitPathArgs: ['zzz-does-not-exist-anywhere'],
      repoRoot: tempRoot,
    })
    assert.equal(requested.size, 0, '어떤 파일도 가리키지 않는 후보는 requestedFiles 에 들어가면 안 됩니다(경계 오인 방지)')
  } finally {
    removeTempRepo(tempRoot)
  }
})

// 아래 두 테스트는 순수 판정 계층(decideRealQaScope/resolveRequestedFiles)을 합성 scope 로
// 직접 검증한다 — git fixture(createTempRealQaRepo)를 안 쓴다. os.tmpdir()의 무작위 접미사가
// "2" 같은 흔한 한 글자와 우연히 겹칠 수 있어(실제로 최초 작성판에서 발생) fixture 기반은
// 이 시나리오에 비결정적이다. FAKE_REPO_ROOT 는 숫자를 전혀 포함하지 않는 고정 문자열이라
// 결정적이다.
const FAKE_REPO_ROOT = 'C:\\fakerepo-no-digit-collision'

test('R2-1 경계(신규 발견): 공백형 값 플래그(--reporter line 등)의 값이 실제 파일명 일부와 우연히 겹쳐도 narrow 오인되지 않는다', () => {
  // "line"이 파일명 일부에 들어있는 추적 스펙 — 공백형 --reporter line 의 값과 우연히 겹친다
  // (실측: 실 레포에서 "line" 인자가 902-slip-line-ecount-real-qa 등 8개 파일과 부분일치).
  const trackedFile = 'clients/desktop/playwright/902-slip-line-ecount-real-qa/902-slip-line-ecount-real-qa.spec.ts'
  const unrelatedUntracked = 'clients/desktop/playwright/n1b-native-qa/unrelated-flagvalue-real-qa.spec.ts'
  const scope = {
    diskFiles: [trackedFile, unrelatedUntracked],
    trackedFiles: [trackedFile],
    untrackedFiles: [unrelatedUntracked],
    missingFiles: [],
  }
  const spaceFormArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts', '--reporter', 'line', '--list']
  assert.throws(
    () =>
      decideRealQaScope({
        scope,
        allowUntracked: false,
        explicitPathArgs: parseExplicitPathArgs(spaceFormArgv),
        repoRoot: FAKE_REPO_ROOT,
      }),
    /추적 집합 불일치/,
    '"--reporter line"의 값 "line"이 우연히 파일명과 겹쳐도 전체 실행 취급을 유지해야 하고, 무관한 미추적 스펙을 여전히 잡아야 합니다',
  )
})

test('R2-1 경계(신규 발견): 공백형 --workers 2 의 값 "2"도 narrow 오인되지 않는다', () => {
  const trackedFile = 'clients/desktop/playwright/e2-rollout-order-list-real-qa/e2-order-real-qa.spec.ts'
  const unrelatedUntracked = 'clients/desktop/playwright/n1b-native-qa/unrelated-flag-value-real-qa.spec.ts'
  const scope = {
    diskFiles: [trackedFile, unrelatedUntracked],
    trackedFiles: [trackedFile],
    untrackedFiles: [unrelatedUntracked],
    missingFiles: [],
  }
  const spaceFormArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts', '--workers', '2', '--list']
  assert.throws(
    () =>
      decideRealQaScope({
        scope,
        allowUntracked: false,
        explicitPathArgs: parseExplicitPathArgs(spaceFormArgv),
        repoRoot: FAKE_REPO_ROOT,
      }),
    /추적 집합 불일치/,
    '"--workers 2"의 값 "2"가 우연히 파일명과 겹쳐도 전체 실행 취급을 유지해야 합니다',
  )
})

test('R2-2: --reporter=json 실행에서 예외 모드 경고가 stdout 을 오염시키지 않는다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/a-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts')

    const jsonArgv = [
      'node',
      'cli.js',
      'test',
      '--config=playwright.real-qa.config.ts',
      '--reporter=json',
      'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts',
    ]
    const { out, err } = captureStreams(() => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: true, argv: jsonArgv }))
    assert.equal(out, '', '--reporter=json 실행에서는 stdout 에 아무것도 쓰면 안 됩니다(그 스트림이 곧 JSON 산출물)')
    assert.match(err, /로컬 실행 모드/, '경고 자체는 stderr 로는 여전히 나와야 합니다')
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-2: --reporter json (공백형)도 동일하게 stdout 을 건드리지 않는다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/a-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts')

    const jsonArgv = [
      'node',
      'cli.js',
      'test',
      '--config=playwright.real-qa.config.ts',
      '--reporter',
      'json',
      'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts',
    ]
    const { out } = captureStreams(() => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: true, argv: jsonArgv }))
    assert.equal(out, '', '공백형 --reporter json 도 stdout 을 건드리면 안 됩니다')
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-2: --reporter=junit 도 stdout 을 오염시키지 않는다', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/a-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts')

    const junitArgv = [
      'node',
      'cli.js',
      'test',
      '--config=playwright.real-qa.config.ts',
      '--reporter=junit',
      'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts',
    ]
    const { out, err } = captureStreams(() => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: true, argv: junitArgv }))
    assert.equal(out, '', '--reporter=junit 실행에서도 stdout 을 건드리면 안 됩니다')
    assert.match(err, /로컬 실행 모드/, '경고는 stderr 로는 나와야 합니다')
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-2 회귀: 기본(line) 리포터는 여전히 stdout+stderr 둘 다에 경고를 남긴다(R1 결함1 유지)', () => {
  resetExplicitPathEnv()
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/a-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts')

    const lineArgv = [
      'node',
      'cli.js',
      'test',
      '--config=playwright.real-qa.config.ts',
      '--reporter=line',
      'clients/desktop/playwright/n1b-native-qa/leftover-real-qa.spec.ts',
    ]
    const { out, err } = captureStreams(() => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: true, argv: lineArgv }))
    assert.match(out, /로컬 실행 모드/, 'line 리포터는 R1 대로 stdout 에도 남아야 합니다(회귀 금지)')
    assert.match(err, /로컬 실행 모드/, 'line 리포터는 stderr 에도 남아야 합니다')
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('R2-3: 내부 마커를 외부에서 export 해도(워커가 아니면) 명시 경로 없는 전체 실행은 여전히 막힌다', () => {
  resetExplicitPathEnv()
  delete process.env['TEST_WORKER_INDEX']
  const tempRoot = createTempRealQaRepo()
  try {
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/a-real-qa.spec.ts')
    commitAllRealQaSpecs(tempRoot)
    // 진짜 미추적 스펙 — narrow 오인 없이는 전체 실행이 반드시 이걸로 막혀야 한다.
    writeRealQaSpec(tempRoot, 'clients/desktop/playwright/n1b-native-qa/unrelated-r2-3-real-qa.spec.ts')
    // 실제 narrow 실행을 거치지 않고, 사용자가 셸에서 직접 export 한 것처럼 내부 마커를
    // 흉내낸다 — 위 미추적 스펙과 "무관한"(추적+디스크에 실재하는) 다른 파일을 가리킨다.
    // 마커를 신뢰하면 게이트가 이걸 narrow 실행으로 오인해 무관한 미추적 스펙을 걸러내지
    // 않고 전체 실행을 통과시켜버린다(R2 라운드 실측: `549 tests in 173 files`, 안 막힘).
    process.env[EXPLICIT_PATH_ARGS_ENV_VAR] = JSON.stringify(['clients/desktop/playwright/a-real-qa.spec.ts'])

    const fullRunArgv = ['node', 'cli.js', 'test', '--config=playwright.real-qa.config.ts', '--list']
    assert.throws(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: fullRunArgv }),
      /추적 집합 불일치/,
      '메인 프로세스(TEST_WORKER_INDEX 미설정)는 외부에서 주입된 내부 마커를 신뢰하면 안 됩니다(U-4)',
    )
  } finally {
    delete process.env[EXPLICIT_PATH_ARGS_ENV_VAR]
    removeTempRepo(tempRoot)
  }
})



function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8')
}

function setupElectronUpdaterOk(desktopRoot) {
  writeJson(path.join(desktopRoot, 'package.json'), { dependencies: { 'electron-updater': '1.0.0' } })
  writeJson(path.join(desktopRoot, 'package-lock.json'), {
    packages: { 'node_modules/electron-updater': { version: '1.0.0' } },
  })
  writeJson(path.join(desktopRoot, 'node_modules/electron-updater/package.json'), { version: '1.0.0' })
}

// out/main/index.js 를 소스보다 오래되게 만든 stale fixture. design-system 은 src 디렉터리를
// 만들지 않아(walkSourceFiles가 빈 배열 반환) 항상 trivially fresh — out/main 단일 변수만 남긴다.
function makeStaleOutMainFixture() {
  const repoRoot_ = fs.mkdtempSync(path.join(os.tmpdir(), 'real-qa-freshness-'))
  const desktopRoot = path.join(repoRoot_, 'clients/desktop')
  const designSystemRoot = path.join(repoRoot_, 'clients/web/design-system')

  setupElectronUpdaterOk(desktopRoot)
  fs.mkdirSync(path.join(designSystemRoot, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(designSystemRoot, 'dist/index.d.ts'), '// dist\n')

  const outMainFile = path.join(desktopRoot, 'out/main/index.js')
  fs.mkdirSync(path.dirname(outMainFile), { recursive: true })
  fs.writeFileSync(outMainFile, '// built\n')
  fs.utimesSync(outMainFile, new Date(1000), new Date(1000))

  const srcMainFile = path.join(desktopRoot, 'src/main/index.ts')
  fs.mkdirSync(path.dirname(srcMainFile), { recursive: true })
  fs.writeFileSync(srcMainFile, '// src, mtime 만 새로 touch 된 것처럼\n')
  fs.utimesSync(srcMainFile, new Date(2000), new Date(2000))

  return repoRoot_
}

// design-system dist 가 아예 없는 fixture(typecheck phase 전용, out/main 무관).
function makeMissingDesignSystemDistFixture() {
  const repoRoot_ = fs.mkdtempSync(path.join(os.tmpdir(), 'real-qa-freshness-cd-'))
  const desktopRoot = path.join(repoRoot_, 'clients/desktop')
  setupElectronUpdaterOk(desktopRoot)
  // clients/web/design-system 자체를 만들지 않는다 → dist/index.d.ts "없습니다" 분기.
  return repoRoot_
}

// 3종 모두 신선한 fixture(성공 메시지 문구 검증용).
function makeAllFreshFixture() {
  const repoRoot_ = fs.mkdtempSync(path.join(os.tmpdir(), 'real-qa-freshness-ok-'))
  const desktopRoot = path.join(repoRoot_, 'clients/desktop')
  const designSystemRoot = path.join(repoRoot_, 'clients/web/design-system')
  setupElectronUpdaterOk(desktopRoot)
  fs.mkdirSync(path.join(designSystemRoot, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(designSystemRoot, 'dist/index.d.ts'), '// dist\n')
  const outMainFile = path.join(desktopRoot, 'out/main/index.js')
  fs.mkdirSync(path.dirname(outMainFile), { recursive: true })
  fs.writeFileSync(outMainFile, '// built\n')
  return repoRoot_
}

test('결함4: 신선도 게이트는 mtime 만 바뀐 stale 상태를 여전히 막는다(회귀 확인)', () => {
  const tempRoot = makeStaleOutMainFixture()
  try {
    assert.throws(
      () => assertDerivedArtifactsFresh({ repoRoot: tempRoot, phase: 'test' }),
      /신선도 확인 실패/,
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('결함4: REAL_QA_SKIP_FRESHNESS_CHECK 탈출구로 같은 stale 상태에서도 npm test 를 진행할 수 있다(U-5)', () => {
  const tempRoot = makeStaleOutMainFixture()
  try {
    assert.throws(
      () => checkFreshnessOrSkip({ repoRoot: tempRoot, phase: 'test', skip: false }),
      /신선도 확인 실패/,
      '탈출구를 안 쓰면 여전히 막아야 합니다(회귀 방지)',
    )
    const message = checkFreshnessOrSkip({ repoRoot: tempRoot, phase: 'test', skip: true })
    assert.match(message, /건너뜀/, '탈출구 사용 시 건너뛴 사실을 출력해야 합니다(침묵 우회 금지)')
  } finally {
    removeTempRepo(tempRoot)
  }
})

test('결함5: 신선도 안내의 cd 명령이 출력 시점 cwd 기준으로 실제 design-system 경로를 가리킨다', () => {
  const tempRoot = makeMissingDesignSystemDistFixture()
  const desktopRoot = path.join(tempRoot, 'clients/desktop')
  const originalCwd = process.cwd()
  process.chdir(desktopRoot)
  try {
    assert.throws(
      () => assertDerivedArtifactsFresh({ repoRoot: tempRoot, phase: 'typecheck' }),
      (error) => {
        const cdMatch = /cd ([^\n;]+);/.exec(error.message)
        assert.ok(cdMatch, `cd 안내를 찾지 못했습니다: ${error.message}`)
        const resolved = path.resolve(process.cwd(), cdMatch[1])
        assert.equal(
          resolved,
          path.join(tempRoot, 'clients/web/design-system'),
          `안내된 cd 대상이 그 출력 위치(cwd=${process.cwd()})에서 실제 design-system 경로와 다릅니다: ${resolved}`,
        )
        return true
      },
    )
  } finally {
    process.chdir(originalCwd)
  }
})

test('결함7: "확인 완료" 메시지가 실제 검사 대상만 명시하고 범위를 과장하지 않는다', () => {
  const tempRoot = makeAllFreshFixture()
  try {
    const message = checkFreshnessOrSkip({ repoRoot: tempRoot, phase: 'test', skip: false })
    assert.match(message, /design-system dist/, '검사 대상에 design-system dist 를 명시해야 합니다')
    assert.match(message, /electron-updater/, '검사 대상에 electron-updater 를 명시해야 합니다')
    assert.match(message, /out\/main/, '검사 대상에 out/main 을 명시해야 합니다(phase=test)')
    assert.match(
      message,
      /다루지 않|해당하지 않|무관|이 확인은/,
      '검사 범위가 한정됨을 명시해 과잉 신뢰(false reassurance)를 막아야 합니다',
    )
  } finally {
    removeTempRepo(tempRoot)
  }
})

module.exports = {
  captureStreams,
  createTempRealQaRepo,
  writeRealQaSpec,
}
