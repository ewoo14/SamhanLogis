const assert = require('node:assert/strict')
const test = require('node:test')

const { formatResidueReport, parseStatusOutput } = require('./check-docs-qa-clean.cjs')

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
