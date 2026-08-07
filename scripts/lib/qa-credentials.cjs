const fs = require('node:fs')
const path = require('node:path')

const REPO_ENV_FILE = path.resolve(__dirname, '..', '..', 'infrastructure', '.env.local')
const COMPATIBILITY_ALIASES = {
  QA_DEV_DEFAULT_PASSWORD: ['DEV_PASSWORD'],
  QA_MASTER_PASSWORD: ['QA_PASSWORD', 'QA_MASTER_PW'],
  QA_AROLOGIS_ADMIN_PASSWORD: ['AROLOGIS_ADMIN_PASSWORD'],
  LOADTEST_PASSWORD: ['DEV_PASSWORD'],
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const result = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[match[1]] = value
  }
  return result
}

function firstNonEmpty(env, keys) {
  for (const key of keys) {
    const value = env[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function resolveQaCredential(key = 'QA_DEV_DEFAULT_PASSWORD', options = {}) {
  const env = options.env || process.env
  const envFilePath = options.envFilePath || REPO_ENV_FILE
  const fileEnv = parseEnvFile(envFilePath)
  const value = firstNonEmpty(env, [key])
    || firstNonEmpty(fileEnv, [key])
    || firstNonEmpty(env, COMPATIBILITY_ALIASES[key] || [])
  if (value !== undefined) return value.trim()

  const error = new Error(`QA 자격이 없습니다: ${envFilePath}에 ${key}를 입력하거나 표준 환경변수를 설정하십시오.`)
  error.code = 'QA_CREDENTIAL_MISSING'
  throw error
}

module.exports = { parseEnvFile, resolveQaCredential, REPO_ENV_FILE }
