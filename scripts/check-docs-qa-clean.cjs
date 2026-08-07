#!/usr/bin/env node

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const REPO_ROOT = path.resolve(__dirname, '..')

function parseStatusOutput(output) {
  return output
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
}

function formatResidueReport(residue) {
  if (residue.length === 0) return ''

  return [
    '[docs/qa 결과 검사] 실패: tracked 변경 + non-ignored untracked 잔재 0 계약 위반',
    '[docs/qa 결과 검사] 더럽혀진 항목:',
    ...residue.map(line => `  ${line}`),
  ].join('\n')
}

function main() {
  const result = spawnSync(
    'git',
    ['-C', REPO_ROOT, 'status', '--porcelain=v1', '--untracked-files=all', '--', 'docs/qa'],
    { encoding: 'utf8' },
  )

  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`
    console.error(`[docs/qa 결과 검사] git status 실행 실패: ${detail}`)
    return 1
  }

  const residue = parseStatusOutput(result.stdout)
  if (residue.length > 0) {
    console.error(formatResidueReport(residue))
    return 1
  }

  console.log('[docs/qa 결과 검사] 통과: tracked 변경 + non-ignored untracked 잔재 0')
  return 0
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = { formatResidueReport, main, parseStatusOutput }
