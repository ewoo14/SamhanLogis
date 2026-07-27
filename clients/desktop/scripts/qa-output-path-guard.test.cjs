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
 * 실행: `node --test clients/desktop/scripts/qa-output-path-guard.test.cjs`
 * (CI: .github/workflows/qa-e2e.yml desktop-playwright 잡, "QA 출력 경로·덮어쓰기 가드" step)
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '../..')
const docsQaRoot = path.join(repoRoot, 'docs', 'qa')
const tsHelperPath = path.join(desktopRoot, 'playwright', 'support', 'qa-screenshot-dir.ts')
const mjsHelperPath = path.join(desktopRoot, 'playwright', 'support', 'qa-screenshot-dir.mjs')
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
