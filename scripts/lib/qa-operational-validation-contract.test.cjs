const assert = require('node:assert/strict')
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
