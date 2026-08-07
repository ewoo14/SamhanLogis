const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { resolveQaCredential } = require('./qa-credentials.cjs')

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
