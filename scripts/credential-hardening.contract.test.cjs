const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const qaCredentialLoaderMarker = ['resolve', 'Qa', 'Credential'].join('')
const qaDefaultPasswordKey = ['QA', 'DEV', 'DEFAULT', 'PASSWORD'].join('_')

function serviceSecuritySources() {
  return fs.readdirSync(path.join(root, 'services'))
    .map((service) => path.join(root, 'services', service, 'src', 'main', 'java'))
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => {
      const files = []
      const visit = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const target = path.join(current, entry.name)
          if (entry.isDirectory()) visit(target)
          else if (entry.name === 'SecurityConfig.java') files.push(fs.readFileSync(target, 'utf8'))
        }
      }
      visit(directory)
      return files
    })
}

test('초기화 계약은 코드가 실제로 요구하는 모든 gateway attestation 키를 포함한다', () => {
  const requiredByCode = new Set()
  for (const source of serviceSecuritySources()) {
    if (source.includes('SAMHAN_GATEWAY_ATTESTATION')) requiredByCode.add('SAMHAN_GATEWAY_ATTESTATION')
  }
  assert.ok(requiredByCode.has('SAMHAN_GATEWAY_ATTESTATION'))

  const consumers = [
    read('infrastructure/scripts/ensure-local-env.ps1'),
    read('scripts/ensure-local-env.sh'),
    read('infrastructure/.env.example'),
  ]
  for (const consumer of consumers) {
    for (const key of requiredByCode) assert.match(consumer, new RegExp(`\\b${key}\\b`))
  }
})

test('15개 서비스 테스트의 attestation enforcement 기본값은 true다', () => {
  const buildFiles = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (entry.name === 'build.gradle') buildFiles.push(fs.readFileSync(target, 'utf8'))
    }
  }
  visit(path.join(root, 'services'))
  const guarded = buildFiles.filter((source) => source.includes('gateway-attestation-enforcement'))
  assert.equal(guarded.length, 15)
  for (const source of guarded) assert.doesNotMatch(source, /gateway-attestation-enforcement'\s*,\s*'false'/)
  for (const source of guarded) assert.doesNotMatch(source, /gateway-attestation-enforcement',\s*System\.getProperty\([^,]+,\s*'false'/)
})

test('아로로지스 JWT는 소스 fallback이 없고 비운영에서도 안전하지 않으면 실패한다', () => {
  assert.doesNotMatch(read('services/arologis-service/src/main/resources/application.yml'), /SAMHAN_AROLOGIS_JWT_SECRET:[^}]+}/)
  assert.doesNotMatch(read('services/arologis-service/src/main/java/com/samhanair/logis/arologis/config/ArologisJwtProperties.java'), /DEV_DEFAULT_SECRET|warn\(/)
})

test('공유 DB 자격과 Testcontainers 리터럴을 재사용하지 않는다', () => {
  const source = read('services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/TaxInvoiceLegacyMarkerV103IT.java')
  assert.doesNotMatch(source, /withPassword\("[^"]+"\)/)
  assert.doesNotMatch(source, /withUsername\("samhan"\)/)
  const allMain = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (/\.(yml|yaml|java)$/.test(entry.name) && target.includes(`${path.sep}src${path.sep}main${path.sep}`)) allMain.push(fs.readFileSync(target, 'utf8'))
    }
  }
  visit(path.join(root, 'services'))
  for (const text of allMain) assert.doesNotMatch(text, /LIVE_SHARED_USER|samhan_dev_pw/)
})

test('CI 임시 자격은 GITHUB_ENV 기록 전에 로그 마스킹한다', () => {
  for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/arologis-ci.yml']) {
    const source = read(workflow)
    assert.match(source, /ci_value\(\)\s*\{[\s\S]*?echo "::add-mask::\$value"[\s\S]*?echo "\$name=\$value" >> "\$GITHUB_ENV"/)
    assert.doesNotMatch(source, /echo "(?:SAMHAN_|DB_)[A-Z_]+=\$\(ci_secret\)"/)
  }
})

test('arologis IT uses only the shared gateway attestation entry point', () => {
  const localCopy = path.join(
    root,
    'services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/GatewayAttestationMockMvcConfig.java',
  )
  assert.equal(fs.existsSync(localCopy), false)

  const abstractPostgresIt = read(
    'services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/AbstractPostgresIT.java',
  )
  assert.match(
    abstractPostgresIt,
    /@Import\(com\.samhanair\.logis\.security\.test\.GatewayAttestationMockMvcConfig\.class\)/,
  )
  assert.doesNotMatch(abstractPostgresIt, /GatewayAttestationMockMvcConfig\.ATTESTATION/)
})

test('QA evidence never stores reusable JWTs or fixed credential values', () => {
  const evidenceRoots = [
    path.join(root, 'docs/qa'),
    path.join(root, 'docs/qa-shots'),
  ]
  const evidenceFiles = []
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (/\.(json|md|txt|ps1|sh)$/.test(entry.name)) evidenceFiles.push(target)
    }
  }
  evidenceRoots.forEach(visit)

  for (const target of evidenceFiles) {
    const source = fs.readFileSync(target, 'utf8')
    assert.doesNotMatch(source, /eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){2}/, target)
    for (const line of source.split(/\r?\n/)) {
      if (line.includes(qaCredentialLoaderMarker) || line.includes(qaDefaultPasswordKey)) continue
      assert.doesNotMatch(
        line,
        /(?:password|passwd|pwd|api[_-]?key|x-api-key|client[_-]?secret|access[_-]?key)\s*[:=]\s*["'](?!\$\{|<|\{|\*|REDACTED|redacted|wrong-password)[^"']+["']/i,
        target,
      )
    }
  }
})
