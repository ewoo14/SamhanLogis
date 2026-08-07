const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { resolveQaCredential } = require('./qa-credentials.cjs')

const CREDENTIAL_CONSUMER_FILES = [
  '../../clients/desktop/playwright/dispatch-collab-real-qa/dispatch-collab-codex-round.spec.ts',
  '../../clients/desktop/playwright/dispatch-collab-real-qa/dispatch-collab-real-qa.spec.ts',
  '../../clients/desktop/playwright/dispatch-collab-real-qa/kst-verification.spec.ts',
  '../../clients/desktop/playwright/manual/e3-s1-cash-receipt-permission-qa.spec.ts',
  '../../clients/desktop/playwright/cash-receipt-coedit-real-qa/cash-receipt-coedit-real-qa.spec.ts',
  '../../clients/desktop/scripts/ds4-real-qa-cleanup-worker.cjs',
  '../../clients/desktop/scripts/ds4-real-qa-reap.cjs',
  '../../scripts/verify-ds4-real-qa-cleanup.cjs',
]

const LEGACY_KEY = ['DEV', 'PASSWORD'].join('_')

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

test('실행 자격 소비자는 표준 로더를 경유하고 옛 키를 직접 읽지 않는다', () => {
  for (const relativePath of CREDENTIAL_CONSUMER_FILES) {
    const filePath = path.resolve(__dirname, relativePath)
    const source = fs.readFileSync(filePath, 'utf8')
    assert.match(source, /resolveQaCredential\(['"]QA_DEV_DEFAULT_PASSWORD['"]\)/, relativePath)
    assert.doesNotMatch(
      source,
      new RegExp(`process\\.env(?:\\.(?:${LEGACY_KEY}|DEV_SEED_PASSWORD|SAMHAN_DS4_QA_PASSWORD|QA_DEV_DEFAULT_PASSWORD)|\\[['"](?:${LEGACY_KEY}|DEV_SEED_PASSWORD|SAMHAN_DS4_QA_PASSWORD|QA_DEV_DEFAULT_PASSWORD)['"]\\])`),
      relativePath,
    )
  }
})
