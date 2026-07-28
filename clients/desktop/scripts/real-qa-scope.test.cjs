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

    // 워커 프로세스 흉내 — 실측된 실제 argv 형태(원래 CLI 인자 없음).
    const workerProcessArgv = ['node', 'D:\\...\\node_modules\\playwright\\lib\\common\\process.js']
    assert.doesNotThrow(
      () => assertRealQaScope({ repoRoot: tempRoot, allowUntracked: false, argv: workerProcessArgv }),
      '워커가 부모의 명시 경로를 이어받지 못하면 narrow 실행이 워커 단계에서 다시 막힌다(실측 재현)',
    )
  } finally {
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
// 결함 4·5·7 — 신선도 게이트(assertDerivedArtifactsFresh / checkFreshnessOrSkip) fixture
// ---------------------------------------------------------------------------

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
