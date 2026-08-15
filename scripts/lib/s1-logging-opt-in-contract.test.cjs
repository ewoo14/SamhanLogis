const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const composeSourceFiles = [
  'infrastructure/docker-compose.yml',
  'infrastructure/docker-compose.local-all.yml',
]
const composeFiles = [
  '-f', 'infrastructure/docker-compose.yml',
  '-f', 'infrastructure/docker-compose.local-all.yml',
]

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function composeProbeEnv() {
  const requiredVariables = new Set()
  const requiredVariablePattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\:\?[^}]*\}/g

  for (const relativePath of composeSourceFiles) {
    for (const match of read(relativePath).matchAll(requiredVariablePattern)) {
      requiredVariables.add(match[1])
    }
  }

  const env = { ...process.env }
  for (const variable of requiredVariables) {
    env[variable] = crypto.randomBytes(24).toString('hex')
  }
  return env
}

function composeServices(extraArgs = []) {
  const output = execFileSync('docker', [
    'compose',
    ...extraArgs,
    ...composeFiles,
    'config', '--services',
  ], { cwd: root, encoding: 'utf8', env: composeProbeEnv() })
  return output.trim().split(/\r?\n/).filter(Boolean)
}

test('기본 local-all 합성은 logging-service 없이 기존 서비스 집합을 유지한다', () => {
  const allServices = composeServices(['--profile', 'logging'])
  const defaultServices = composeServices()

  assert.ok(allServices.includes('logging-service'))
  assert.ok(!defaultServices.includes('logging-service'))
  assert.deepEqual(
    [...defaultServices].sort(),
    allServices.filter((service) => service !== 'logging-service').sort(),
  )
})

test('logging-service는 명시적 logging profile에서만 기본 합성에 추가된다', () => {
  const compose = read('infrastructure/docker-compose.local-all.yml')
  assert.match(compose, /logging-service:\s*[\s\S]*?\n\s+profiles:\s*\n\s+- logging\b/)
})

test('기본 런처는 기존 무필터 compose 호출을 유지하고 logging-service를 기본 build하지 않는다', () => {
  const powershell = read('scripts/launch-local-stack.ps1')
  const bash = read('scripts/launch-local-stack.sh')

  assert.match(powershell, /docker compose (?:--env-file \$localEnvFile )?@ComposeFiles @composeArgs/)
  assert.match(bash, /docker compose (?:--env-file "\$LOCAL_ENV_FILE" )?-f infrastructure\/docker-compose\.yml -f infrastructure\/docker-compose\.local-all\.yml up -d/)
  assert.doesNotMatch(powershell, /:services:logging-service:bootJar/)
  assert.doesNotMatch(bash, /:services:logging-service:bootJar/)
})

test('문서는 기존 대상 지정 방식으로 logging-service opt-in을 안내한다', () => {
  const localStackReadme = read('docs/local-stack/README.md')
  const validationGuide = read('docs/operational-validation/boot-and-smoke-validation.md')

  for (const source of [localStackReadme, validationGuide]) {
    assert.match(source, /logging-service/)
    assert.match(source, /up -d --build --no-deps logging-service/)
  }
})
