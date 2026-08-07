const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const { formatResidueReport, parseStatusOutput } = require('./check-docs-qa-clean.cjs')
const { spawnSyncWithFileOutput, summarizeOutputFile } = require('./capture-child-output.cjs')

function createEmptyIndex() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-qa-result-'))
  const index = path.join(dir, 'index')
  const result = spawnSync('git', ['read-tree', '--empty'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, GIT_INDEX_FILE: index },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return { dir, index }
}

test('docs/qa 결과 검사는 tracked 변경과 non-ignored untracked 경로를 모두 목록으로 보고한다', () => {
  const residue = parseStatusOutput(' M docs/qa/evidence.md\n?? docs/qa/new-shot.png\n')

  assert.deepEqual(residue, [
    ' M docs/qa/evidence.md',
    '?? docs/qa/new-shot.png',
  ])
  assert.match(
    formatResidueReport(residue),
    /tracked 변경 \+ non-ignored untracked 잔재 0 계약 위반/,
  )
  assert.match(formatResidueReport(residue), /docs\/qa\/evidence\.md/)
  assert.match(formatResidueReport(residue), /docs\/qa\/new-shot\.png/)
})

test('빈 git status는 결과 검사 통과로 표현된다', () => {
  assert.deepEqual(parseStatusOutput(''), [])
  assert.equal(formatResidueReport([]), '')
})

test('정상 docs/qa 상태는 결과 검사 통과로 표현된다', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'check-docs-qa-clean.cjs')], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /통과: tracked 변경 \+ non-ignored untracked 잔재 0/)
})

test('대규모 오염도 목록 일부와 정확한 총 건수를 보존한다', () => {
  const { dir, index } = createEmptyIndex()
  try {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'check-docs-qa-clean.cjs')], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, GIT_INDEX_FILE: index },
      encoding: 'utf8',
    })

    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stderr, /ENOBUFS/)
    assert.match(result.stderr, /더럽혀진 항목:/)
    assert.match(result.stderr, /docs\/qa\//)

    const expected = spawnSyncWithFileOutput(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all', '--', 'docs/qa'],
      { cwd: path.resolve(__dirname, '..'), env: { ...process.env, GIT_INDEX_FILE: index } },
    )
    assert.equal(expected.status, 0, expected.stderr)
    const expectedCount = summarizeOutputFile(expected.stdoutPath, { limit: 0 }).totalCount
    expected.cleanup()
    const reportedCount = Number(result.stderr.match(/총 (\d+)건/)?.[1])
    assert.equal(reportedCount, expectedCount)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('공통 캡처기는 대규모 출력 전체를 메모리에 올리지 않고 앞 레코드와 정확한 총 건수만 제공한다', () => {
  const recordCount = 20_000
  const result = spawnSyncWithFileOutput(
    process.execPath,
    ['-e', `for (let i = 0; i < ${recordCount}; i += 1) process.stdout.write('record-' + i + '\\n')`],
  )

  try {
    assert.equal(result.status, 0)
    assert.equal(typeof result.stdoutPath, 'string')
    assert.equal(typeof result.cleanup, 'function')
    assert.equal('stdout' in result, false)

    const summary = summarizeOutputFile(result.stdoutPath, { limit: 200 })
    assert.equal(summary.totalCount, recordCount)
    assert.deepEqual(summary.records.slice(0, 3), ['record-0', 'record-1', 'record-2'])
    assert.equal(summary.records.at(-1), 'record-199')
    assert.equal(summary.truncated, true)
  } finally {
    result.cleanup()
  }
})
