const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { resolveQaCredential } = require('./qa-credentials.cjs')

const SCAN_ROOTS = ['clients/desktop', 'docs/qa', 'scripts']
const EXECUTABLE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts', '.tsx', '.ps1', '.sh', '.py'])
const QA_CREDENTIAL_KEY = /(?:^|_)(?:QA|DEV|LOADTEST|SAMHAN_DS4|AROLOGIS)(?:_[A-Z0-9]+)*_(?:PASSWORD|PW)$/
const ENV_ACCESS = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g
const POWERSHELL_ENV_ACCESS = /\$env:([A-Z][A-Z0-9_]*)/g
const SHELL_ENV_ACCESS = /\$\{([A-Z][A-Z0-9_]*)\}/g

function walkExecutableFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkExecutableFiles(entryPath))
    else if (EXECUTABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(entryPath)
  }
  return files
}

function credentialKeysIn(source, filePath = '') {
  const matches = [...source.matchAll(ENV_ACCESS)]
    .flatMap((match) => match.slice(1).filter(Boolean))
  if (path.extname(filePath).toLowerCase() === '.ps1') {
    matches.push(...[...source.matchAll(POWERSHELL_ENV_ACCESS)].map((match) => match[1]))
  }
  if (path.extname(filePath).toLowerCase() === '.sh') {
    const assigned = new Set([...source.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]))
    matches.push(...[...source.matchAll(SHELL_ENV_ACCESS)]
      .map((match) => match[1])
      .filter((key) => !assigned.has(key)))
  }
  return matches.filter((key) => QA_CREDENTIAL_KEY.test(key))
}

function discoverCredentialConsumers(repoRoot = path.resolve(__dirname, '..', '..')) {
  return SCAN_ROOTS
    .flatMap((relativeRoot) => walkExecutableFiles(path.join(repoRoot, relativeRoot)))
    .filter((filePath) => filePath !== __filename && filePath !== path.join(repoRoot, 'scripts/lib/qa-credentials.cjs'))
    .map((filePath) => ({
      filePath,
      source: fs.readFileSync(filePath, 'utf8'),
    }))
    .filter(({ filePath, source }) => source.includes('resolveQaCredential')
      || source.includes('Resolve-QaCredential')
      || credentialKeysIn(source, filePath).length > 0)
}

function relativeToRepo(filePath) {
  return path.relative(path.resolve(__dirname, '..', '..'), filePath)
}

function directCredentialAccessPattern(keys, filePath) {
  const alternatives = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const extension = path.extname(filePath).toLowerCase()
  const shell = extension === '.sh' ? `|\\$\\{(?:${alternatives})\\}` : ''
  const powershell = extension === '.ps1' ? `|\\$env:(?:${alternatives})` : ''
  return new RegExp(`(?:process\\.env(?:\\.(?:${alternatives})|\\[['"](?:${alternatives})['"]\\])${shell}${powershell})`)
}

function withEnvFile(contents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'samhan-qa-credentials-'))
  const envFilePath = path.join(directory, '.env.local')
  fs.writeFileSync(envFilePath, contents, 'utf8')
  return { directory, envFilePath }
}

test('표준 환경변수가 .env.local보다 우선한다', () => {
  const { directory, envFilePath } = withEnvFile('QA_DEV_DEFAULT_PASSWORD=file-value\n')
  try {
    assert.equal(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD', {
      env: { QA_DEV_DEFAULT_PASSWORD: 'process-value' },
      envFilePath,
    }), 'process-value')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('.env.local만 있어도 표준 키로 자격을 얻는다', () => {
  const { directory, envFilePath } = withEnvFile('QA_DEV_DEFAULT_PASSWORD=file-value\n')
  try {
    assert.equal(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD', { env: {}, envFilePath }), 'file-value')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('두 입력이 없으면 경로와 누락 키를 포함해 fail-fast한다', () => {
  const { directory, envFilePath } = withEnvFile('OTHER_KEY=value\n')
  try {
    assert.throws(
      () => resolveQaCredential('QA_DEV_DEFAULT_PASSWORD', { env: {}, envFilePath }),
      (error) => error.code === 'QA_CREDENTIAL_MISSING'
        && error.message.includes('.env.local')
        && error.message.includes('QA_DEV_DEFAULT_PASSWORD'),
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('DEV_PASSWORD는 표준 키를 위한 호환 입력으로만 허용한다', () => {
  const { directory, envFilePath } = withEnvFile('')
  try {
    assert.equal(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD', {
      env: { DEV_PASSWORD: 'compat-value' },
      envFilePath,
    }), 'compat-value')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('실행 자격 소비자는 발견 기반으로 표준 로더를 경유하고 옛 키를 직접 읽지 않는다', () => {
  const consumers = discoverCredentialConsumers()
  assert.ok(consumers.length > 0, '자격 소비자를 한 건 이상 발견해야 합니다.')
  for (const { filePath, source } of consumers) {
    const relativePath = relativeToRepo(filePath)
    assert.match(source, /(?:resolveQaCredential\(['"][A-Z][A-Z0-9_]*['"]\)|Resolve-QaCredential)/, relativePath)
    const credentialAccess = credentialKeysIn(source, filePath)
      .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')
    if (credentialAccess) {
      assert.doesNotMatch(
        source,
        directCredentialAccessPattern(credentialKeysIn(source, filePath), filePath),
        relativePath,
      )
    }
  }
})

test('새 파일은 등록 없이 발견되고 자격 불필요 파일은 소비자로 분류하지 않는다', () => {
  const directory = fs.mkdtempSync(path.join(path.resolve(__dirname, '..', '..', 'docs', 'qa'), 's10-discovery-'))
  const consumerPath = path.join(directory, 'unregistered-consumer.mjs')
  const unrelatedPath = path.join(directory, 'unrelated-script.mjs')
  fs.writeFileSync(consumerPath, "const password = process.env.DEV_PASSWORD\n", 'utf8')
  fs.writeFileSync(unrelatedPath, "const password = 'test-fixture-value'\n", 'utf8')
  try {
    const discovered = discoverCredentialConsumers().map(({ filePath }) => filePath)
    assert.ok(discovered.includes(consumerPath), '등록하지 않은 새 소비자를 발견해야 합니다.')
    assert.doesNotMatch(fs.readFileSync(unrelatedPath, 'utf8'), /resolveQaCredential/)
    assert.ok(!discovered.includes(unrelatedPath), '자격 불필요 파일은 소비자로 분류하지 않아야 합니다.')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
