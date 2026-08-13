const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', 'clients', 'desktop', 'src', 'renderer')
const LEGACY_ACCOUNT_CODES = new Set([
  '101', '102', '103', '104', '105', '110', '142', '146', '201',
  '210', '220', '221', '255', '260', '301', '343', '401', '404',
  '501', '801', '814', '818', '819', '831', '901', '919', '991',
])
const ACCOUNT_FIELD_LITERAL =
  /\b(?:accountCode|debitAccountCode|creditAccountCode)\s*:\s*['"](\d{3})['"]/g

function rendererFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name)
    if (entry.isDirectory()) return rendererFiles(filePath)
    return /\.(ts|tsx)$/.test(entry.name) ? [filePath] : []
  })
}

const findings = []
for (const filePath of rendererFiles(ROOT)) {
  const source = fs.readFileSync(filePath, 'utf8')
  for (const match of source.matchAll(ACCOUNT_FIELD_LITERAL)) {
    if (LEGACY_ACCOUNT_CODES.has(match[1])) {
      const line = source.slice(0, match.index ?? 0).split('\n').length
      findings.push(`${path.relative(ROOT, filePath)}:${line}=${match[1]}`)
    }
  }
}

assert.deepEqual(findings, [], `retired three-digit account-code literals remain:\n${findings.join('\n')}`)
console.log('round 3 account-code contract: PASS')
