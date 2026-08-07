const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { resolveQaCredential } = require('./qa-credentials.cjs')

// Scan the repository tree so a new root, file name, or language cannot silently bypass this guard.
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'bin', 'coverage', 'playwright-report',
  'test-results', '.gradle', '.next', '.turbo', 'target', 'venv', '.venv', '__pycache__', 'worktrees',
])
// perf/k6/mixed-load.js intentionally reads LOADTEST_PASSWORD through k6's __ENV API.
// k6 cannot use Node's fs/module loader, and scripts/run-load-test.ps1 injects this value
// with -e LOADTEST_PASSWORD; it is therefore a runtime loader boundary, not a direct
// Node/PowerShell credential consumer for this guard to rewrite.
const CREDENTIAL_KEY = /(?:^|[_-])(?:qa|dev|loadtest|samhan_ds4|arologis)(?:[_-][a-z0-9]+)*[_-](?:password|pw)$/i
const ACCESS_PATTERNS = [
  /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\])/g,
  /\$env:([A-Za-z_][A-Za-z0-9_]*)/gi,
  /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
  /__ENV(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\])/g,
  /os\.environ(?:\.get\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]|\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\])/gi,
  /\bgetenv\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\)/gi,
  /%([A-Za-z_][A-Za-z0-9_]*)%/g,
]

function walkRepositoryFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkRepositoryFiles(entryPath))
    else files.push(entryPath)
  }
  return files
}

function credentialKeysIn(source) {
  return ACCESS_PATTERNS
    .flatMap((pattern) => [...source.matchAll(pattern)].flatMap((match) => match.slice(1).filter(Boolean)))
    .filter((key) => CREDENTIAL_KEY.test(key))
}

function discoverCredentialConsumers(repoRoot = path.resolve(__dirname, '..', '..')) {
  return walkRepositoryFiles(repoRoot)
    .filter((filePath) => {
      const relative = path.relative(repoRoot, filePath).replaceAll('\\', '/')
      const baseName = path.basename(filePath).toLowerCase()
      const extension = path.extname(filePath).toLowerCase()
      return filePath !== __filename
        && filePath !== path.join(repoRoot, 'scripts/lib/qa-credentials.cjs')
        && filePath !== path.join(repoRoot, 'clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts')
        && !relative.startsWith('docs/')
        && !relative.startsWith('.claude/memory/')
        && !relative.startsWith('clients/desktop/playwright/sp-08-8-credential-plaintext-guard/')
        && relative !== 'services/user-service/src/main/java/com/samhanair/logis/user/seed/OrgChartSeeder.java'
        && !['.md', '.mdx', '.log'].includes(extension)
        && baseName !== 'dockerfile'
        && !baseName.startsWith('docker-compose')
        && !baseName.startsWith('gradlew')
        && baseName !== '_headers'
    })
    .map((filePath) => {
      try {
        const source = fs.readFileSync(filePath, 'utf8')
        return source.includes('\0') ? null : { filePath, source }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .filter(({ filePath, source }) => relativeToRepo(filePath).replaceAll('\\', '/') !== 'perf/k6/mixed-load.js'
      && (source.includes('resolveQaCredential')
      || source.includes('Resolve-QaCredential')
      || credentialKeysIn(source).length > 0))
}

function relativeToRepo(filePath) {
  return path.relative(path.resolve(__dirname, '..', '..'), filePath)
}

function directCredentialAccessPattern(keys) {
  const alternatives = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(
    `(?:process\\.env(?:\\.(?:${alternatives})|\\[['"](?:${alternatives})['"]\\])` +
      `|(?:^|[;\\r\\n])\\s*\\$env:(?:${alternatives})|\\$\\{(?:${alternatives})\\}` +
      `|__ENV(?:\\.(?:${alternatives})|\\[['"](?:${alternatives})['"]\\])` +
      `|os\\.environ(?:\\.get\\s*\\(\\s*['"](?:${alternatives})['"]|\\[['"](?:${alternatives})['"]\\])` +
      `|getenv\\s*\\(\\s*['"](?:${alternatives})['"]\\s*\\)` +
      `|%(?:${alternatives})%)`,
    'i',
  )
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

test('확장자·키 대소문자·접근 문법과 무관하게 옛 자격 직접 읽기를 발견한다', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const directory = fs.mkdtempSync(path.join(repoRoot, '.s12-credential-discovery-'))
  const probes = [
    ['legacy.bat', 'echo %QA_PASSWORD%\n'],
    ['legacy.cmd', 'echo %qa_password%\n'],
    ['legacy.psm1', '$env:qa_password\n'],
    ['legacy.zsh', 'echo ${MY_QA_SECRET_PASSWORD}\n'],
    ['legacy.cts', 'process.env.qa_password\n'],
    ['legacy', "os.environ.get('MY_QA_SECRET_PASSWORD')\ngetenv('qa_password')\n"],
  ].map(([name, source]) => {
    const filePath = path.join(directory, name)
    fs.writeFileSync(filePath, source, 'utf8')
    return filePath
  })
  try {
    const discovered = new Set(discoverCredentialConsumers().map(({ filePath }) => filePath))
    for (const filePath of probes) {
      assert.ok(discovered.has(filePath), `새 축의 직접 읽기를 발견해야 합니다: ${path.basename(filePath)}`)
    }
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
    assert.match(source, /(?:resolveQaCredential\(|Resolve-QaCredential)/, relativePath)
    const credentialAccess = credentialKeysIn(source)
      .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')
    if (credentialAccess) {
      assert.doesNotMatch(
        source,
        directCredentialAccessPattern(credentialKeysIn(source)),
        relativePath,
      )
    }
  }
})

test('새 파일은 등록 없이 발견되고 자격 불필요 파일은 소비자로 분류하지 않는다', () => {
  const directory = fs.mkdtempSync(path.join(path.resolve(__dirname, '..', '..'), '.s10-discovery-'))
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
