const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { getRealQaScope } = require('./real-qa-scope.cjs')

const repoRoot = path.resolve(__dirname, '../../..')
const EXPECTED_TRACKED_REAL_QA_FILE_COUNT = 172
const F2_FILES = [
  'clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts',
  'clients/desktop/playwright/dispatch-collab-real-qa/dispatch-collab-real-qa.spec.ts',
]

test('real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다', () => {
  const scope = getRealQaScope({ repoRoot })

  assert.equal(
    scope.trackedFiles.length,
    EXPECTED_TRACKED_REAL_QA_FILE_COUNT,
    '추적 real-QA 스펙 수가 기준 172개에서 줄거나 늘었습니다. 기준 변경은 별도 검토가 필요합니다.',
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
