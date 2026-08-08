#!/usr/bin/env node

const path = require('node:path')
const { spawnSyncWithFileOutput, summarizeOutputFile } = require('./capture-child-output.cjs')

const REPO_ROOT = path.resolve(__dirname, '..')
const MAX_REPORTED_RESIDUE = 200

function parseStatusOutput(output) {
  return output
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
}

function formatResidueReport(residue, totalCount = residue.length) {
  if (residue.length === 0) return ''

  const visibleResidue = residue.slice(0, MAX_REPORTED_RESIDUE)
  const omittedCount = totalCount - visibleResidue.length

  return [
    '[docs/qa 결과 검사] 실패: tracked 변경 + non-ignored untracked 잔재 0 계약 위반',
    '[docs/qa 결과 검사] 더럽혀진 항목:',
    ...visibleResidue.map(line => `  ${line}`),
    omittedCount > 0
      ? `  ... 외 ${omittedCount}건 (총 ${totalCount}건)`
      : `  총 ${totalCount}건`,
  ].join('\n')
}

function main() {
  const result = spawnSyncWithFileOutput(
    'git',
    ['-C', REPO_ROOT, 'status', '--porcelain=v1', '--untracked-files=all', '--', 'docs/qa'],
    {},
  )

  try {
    if (result.error || result.status !== 0) {
      const stderr = summarizeOutputFile(result.stderrPath, { limit: 1 }).records[0]?.trim()
      const detail = result.error?.message ?? stderr ?? `exit ${result.status}`
      console.error(`[docs/qa 결과 검사] git status 실행 실패: ${detail}`)
      return 1
    }

    const summary = summarizeOutputFile(result.stdoutPath, { limit: MAX_REPORTED_RESIDUE })
    if (summary.totalCount > 0) {
      console.error(formatResidueReport(summary.records, summary.totalCount))
      return 1
    }
  } finally {
    result.cleanup()
  }

  console.log('[docs/qa 결과 검사] 통과: tracked 변경 + non-ignored untracked 잔재 0')
  return 0
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = { formatResidueReport, main, parseStatusOutput }
