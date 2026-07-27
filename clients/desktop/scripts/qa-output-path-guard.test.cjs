const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { resolveMockQaShotsDir, resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const desktopRoot = path.resolve(__dirname, '..')
const playwrightRoot = path.join(desktopRoot, 'playwright')
const tsHelperPath = path.join(playwrightRoot, 'support', 'qa-screenshot-dir.ts')
const tempRoot = path.join(os.tmpdir(), 'samhan-863-qa-output-path-guard')
const qaMarker = ['docs', 'qa'].join('/')

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(child)
    return [child]
  })
}

function mockQaFiles() {
  return listFiles(playwrightRoot).filter(file => {
    const normalized = file.replaceAll(path.sep, '/')
    if (normalized.includes('-real-qa')) return false
    if (normalized.includes('playwright/manual/')) return false
    if (normalized.includes('playwright/support/qa-screenshot-dir')) return false
    return fs.readFileSync(file, 'utf8').includes(qaMarker)
  })
}

function isQaWriter(content) {
  return /\.screenshot\s*\(|page\.screenshot|writeFileSync|copyFileSync/.test(content)
}

function unprotectedMockWriters() {
  return mockQaFiles().filter(file => {
    const content = fs.readFileSync(file, 'utf8')
    return isQaWriter(content) && !content.includes('resolveMockQaShotsDir')
  })
}

function resetEnvironment() {
  delete process.env.QA_SHOTS_DIR
  delete process.env.QA_ALLOW_OVERWRITE
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

test.afterEach(resetEnvironment)
test.after(resetEnvironment)

test('mock QA 출력 인벤토리는 41개이고 직접 writer는 0개다', () => {
  const files = mockQaFiles()
  const writers = unprotectedMockWriters()
  console.log(`[QA 출력 경로 인벤토리] raw docs/qa 파일=${files.length}, 미보호 mock writer=${writers.length}`)
  assert.equal(files.length, 41)
  assert.deepEqual(writers, [])
})

test('mock resolver 기본 출력은 _local이다', () => {
  const committedDir = path.join(tempRoot, 'committed')
  assert.equal(resolveMockQaShotsDir(committedDir), path.join(committedDir, '_local'))
})

test('mock resolver가 커밋 경로 overwrite 시도를 차단한다', () => {
  const committedDir = path.join(tempRoot, 'committed')
  process.env.QA_SHOTS_DIR = committedDir

  assert.throws(
    () => resolveMockQaShotsDir(committedDir),
    error => error instanceof Error && error.message.includes('QA_ALLOW_OVERWRITE=1'),
  )
})

test('QA_ALLOW_OVERWRITE=1이면 명시한 커밋 경로를 사용한다', () => {
  const committedDir = path.join(tempRoot, 'committed')
  process.env.QA_SHOTS_DIR = committedDir
  process.env.QA_ALLOW_OVERWRITE = '1'

  assert.equal(resolveMockQaShotsDir(committedDir), committedDir)
})

test('real Playwright resolver는 커밋 경로를 기본 대상으로 선언한다', () => {
  const source = fs.readFileSync(tsHelperPath, 'utf8')
  assert.match(source, /path\.resolve\(committedDir\)/)
  assert.match(source, /export function resolveQaShotsDir/)
  assert.equal(resolveQaShotsDir(path.join(tempRoot, 'committed')), path.join(tempRoot, 'committed', '_local'))
})
