const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const scripts = [
  path.join(root, 'tools', 'operational-validation', 'run-smoke-tests.ps1'),
  path.join(root, 'tools', 'operational-validation', 'import-notion-csv.ps1'),
]
const jwtConsumers = [...scripts, path.join(root, 'scripts', 'seed-local-stack.ps1')]

function readScript(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function invokePowerShell(script) {
  return execFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command', script,
  ], { encoding: 'utf8' }).trim()
}

test('운영검증 JWT 소비처는 role claim을 요구하지 않고 명시적 identity claim을 전달한다', () => {
  for (const filePath of jwtConsumers) {
    const source = readScript(filePath)
    assert.doesNotMatch(source, /\$roleName\s*=\s*\$claims\.role/)
    assert.doesNotMatch(source, /claims 부재 \(sub \/ role\)/)
    assert.doesNotMatch(source, /X-User-Role.*\$roleName/)
    assert.match(source, /\$claims\.groups/)
    assert.match(source, /\$claims\.isSystemMaster/)
    assert.match(source, /\$claims\.departmentName/)
    assert.match(source, /X-User-Groups/)
    assert.match(source, /X-Is-System-Master/)
    assert.match(source, /X-User-Department/)
  }
})

test('운영검증 PowerShell은 표준 QA 자격 로더를 사용한다', () => {
  const loaderPath = path.join(root, 'scripts', 'lib', 'qa-credentials.ps1')
  assert.equal(fs.existsSync(loaderPath), true)
  for (const filePath of scripts) {
    const source = readScript(filePath)
    assert.match(source, /qa-credentials\.ps1/)
    assert.match(source, /Resolve-QaCredential/)
  }
})

test('smoke 판정은 업무 404와 경로 404를 구분하고 0/1/다건 실패를 정확히 센다', () => {
  const helper = path.join(root, 'tools', 'operational-validation', 'smoke-test-helpers.ps1')
  const command = `
. '${helper}'
$cases = @(
  (Get-SmokeVerdict -Status '404' -Body '{"code":"NOT_FOUND"}'),
  (Get-SmokeVerdict -Status '404' -Body '{"message":"no route"}'),
  (Get-SmokeVerdict -Status '200' -Body '')
)
$counts = @(
  (Get-SmokeFailureCount -Results @()),
  (Get-SmokeFailureCount -Results @([pscustomobject]@{ Verdict = 'FAIL' })),
  (Get-SmokeFailureCount -Results @(
    [pscustomobject]@{ Verdict = 'FAIL' },
    [pscustomobject]@{ Verdict = 'PATH_404' },
    [pscustomobject]@{ Verdict = 'OK' }
  ))
)
[pscustomobject]@{ Cases = $cases; Counts = $counts } | ConvertTo-Json -Compress
`
  const result = JSON.parse(invokePowerShell(command))
  assert.deepEqual(result.Cases, ['BUSINESS_404', 'PATH_404', 'OK'])
  assert.deepEqual(result.Counts, [0, 1, 2])
})

test('seed 포트 해석은 실제 SAMHAN_*_PORT override를 사용한다', () => {
  const helper = path.join(root, 'scripts', 'lib', 'local-stack-port.ps1')
  const command = `
. '${helper}'
[pscustomobject]@{
  Default = Resolve-LocalStackPort -EnvironmentValue '' -DefaultPort 8086
  Override = Resolve-LocalStackPort -EnvironmentValue '8186' -DefaultPort 8086
} | ConvertTo-Json -Compress
`
  const result = JSON.parse(invokePowerShell(command))
  assert.deepEqual(result, { Default: 8086, Override: 8186 })
})
