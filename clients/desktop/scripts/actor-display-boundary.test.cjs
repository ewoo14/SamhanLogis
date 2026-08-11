const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const WORKTREE = path.resolve(__dirname, '../../..')
const SOURCE_ROOTS = [
  path.join(WORKTREE, 'clients/desktop/src/renderer'),
  path.join(WORKTREE, 'clients/arologis-desktop/src/renderer'),
  path.join(WORKTREE, 'clients/mobile-staff/src'),
  path.join(WORKTREE, 'clients/web/design-system/src'),
]
const JAVA_DISPLAY_ROOT = path.join(WORKTREE, 'services/slip-service/src/main/java')
const DISPLAY_FIELDS = [
  'actorName',
  'actorFullName',
  'authorName',
  'deletedByName',
  'proposerName',
  'processedBy',
  'createdByName',
  'requesterName',
  'approverName',
  'authorFullName',
  'uploadedBy',
  'inspectorName',
]
const RESOLVER_MARKERS = [
  'safeActorName(',
  'resolveActorDisplayName(',
  'displayActorName(',
  'deletedBadgeLabel(',
  'deletedSlipBadgeLabel(',
  'deletedBadgeAriaLabel(',
  'deletedSlipBadgeAriaLabel(',
  'maskCreatedBy(',
  'displayActor(',
  'displayName(',
  'displayAuthorName(',
  'displayWarehouseActor(',
  'displayNameOrFallback(',
  'formatUploader(',
  'nullableInspectorName(',
]

function sourceFiles(root) {
  if (!fs.existsSync(root)) return []
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(fullPath))
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.[^.]+$/.test(entry.name)) files.push(fullPath)
  }
  return files
}

function javaSourceFiles(root) {
  if (!fs.existsSync(root)) return []
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...javaSourceFiles(fullPath))
    else if (/\.java$/.test(entry.name)) files.push(fullPath)
  }
  return files
}

function stripComments(line) {
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
}

function hasRawDisplayRead(line) {
  const field = DISPLAY_FIELDS.join('|')
  if (!new RegExp(`\\b(?:${field})\\b`).test(line)) return false
  if (RESOLVER_MARKERS.some((marker) => line.includes(marker))) return false
  if (/^\s*(import|export\s+type|interface|type)\b/.test(line)) return false
  return (
    /\{[^}\n]*\.(?:actorName|actorFullName|authorName|authorFullName|deletedByName|proposerName|processedBy|createdByName|requesterName|approverName|uploadedBy|inspectorName)\b[^}\n]*\}/.test(line) ||
    /\$\{[^}]*\.(?:actorName|actorFullName|authorName|authorFullName|deletedByName|proposerName|processedBy|createdByName|requesterName|approverName|uploadedBy|inspectorName)\b/.test(line) ||
    /\b(?:actorName|actorFullName|authorName|authorFullName|deletedByName|proposerName|processedBy|createdByName|requesterName|approverName|uploadedBy|inspectorName)\s*\?\.?\s*trim\(\)/.test(line) ||
    /\b(?:actorName|actorFullName|authorName|authorFullName|deletedByName|proposerName|processedBy|createdByName|requesterName|approverName|uploadedBy|inspectorName)\??\.trim\(\)/.test(line) ||
    /\b(?:actorName|actorFullName|authorName|authorFullName|deletedByName|proposerName|processedBy|createdByName|requesterName|approverName|uploadedBy|inspectorName)\s*\?\?\s*['"`]/.test(line)
  )
}

function isJavaDisplayDto(file) {
  const relative = path.relative(WORKTREE, file)
  return relative.includes(`${path.sep}web${path.sep}`) && /(?:Response|Dto)\.java$/.test(file)
}

function hasJavaDisplayRead(code) {
  return /get(?:ActorName|AuthorName|ProposerName|DecidedByName|DeletedByName|CreatedByName|RequesterName|ProcessedBy)\s*\(/.test(code)
}

function collectViolations() {
  const violations = []
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      const relative = path.relative(WORKTREE, file)
      if (relative.split(path.sep).includes('api') || relative.includes('mock')) continue
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
      lines.forEach((line, index) => {
        const code = stripComments(line)
        if (hasRawDisplayRead(code)) violations.push(`${relative}:${index + 1}: raw actor display read`)
      })
    }
  }

  for (const file of javaSourceFiles(JAVA_DISPLAY_ROOT).filter(isJavaDisplayDto)) {
    const code = fs.readFileSync(file, 'utf8')
    if (hasJavaDisplayRead(code) && !/ActorDisplayName\.(?:resolve|resolveNullable)\s*\(/.test(code)) {
      violations.push(`${path.relative(WORKTREE, file)}: raw actor display read is not resolver-bound`)
    }
  }

  for (const file of [
    path.join(WORKTREE, 'clients/desktop/src/renderer/utils/maskCreatedBy.ts'),
    path.join(WORKTREE, 'clients/arologis-desktop/src/renderer/utils/maskCreatedBy.ts'),
  ]) {
    const code = fs.readFileSync(file, 'utf8')
    if (!code.includes('safeActorName(')) {
      violations.push(`${path.relative(WORKTREE, file)}: local actor mask is not resolver-backed`)
    }
  }
  return violations
}

test('all actor display reads are resolver-bound', () => {
  const violations = collectViolations()
  assert.deepEqual(violations, [], `raw actor display exits detected:\n${violations.join('\n')}`)
})

test('a newly added raw display exit is rejected (mutation RED)', () => {
  const mutationDir = path.join(WORKTREE, 'clients/desktop/src/renderer/.actor-display-mutation')
  const mutationFile = path.join(mutationDir, 'NewActorExit.tsx')
  fs.mkdirSync(mutationDir, { recursive: true })
  fs.writeFileSync(mutationFile, 'export function NewActorExit({ row }) { return <span>{row.actorFullName}</span> }\n')
  try {
    const violations = collectViolations()
    console.log(`MUTATION_RED ${violations.find((entry) => entry.includes('NewActorExit.tsx'))}`)
    assert.ok(violations.some((entry) => entry.includes('NewActorExit.tsx') && entry.includes('raw actor display read')), violations.join('\n'))
  } finally {
    fs.rmSync(mutationDir, { recursive: true, force: true })
  }
})

test('a newly added raw API display exit is rejected (mutation RED)', () => {
  const mutationFile = path.join(
    JAVA_DISPLAY_ROOT,
    'com/samhanair/logis/slip/web/dto/NewActorApiResponse.java',
  )
  fs.writeFileSync(mutationFile, 'final class NewActorApiResponse { String actorName(Object row) { return row.getActorName(); } }\n')
  try {
    const violations = collectViolations()
    console.log(`MUTATION_RED_API ${violations.find((entry) => entry.includes('NewActorApiResponse.java'))}`)
    assert.ok(violations.some((entry) => entry.includes('NewActorApiResponse.java') && entry.includes('not resolver-bound')), violations.join('\n'))
  } finally {
    fs.rmSync(mutationFile, { force: true })
  }
})

test('a resolver-backed renderer is accepted', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'actor-display-boundary-'))
  const tempFile = path.join(WORKTREE, 'clients/desktop/src/renderer/.actor-display-boundary-ok.tsx')
  fs.writeFileSync(tempFile, "import { safeActorName } from '@samhan/design-system'\nexport function Safe({ row }) { return <span>{safeActorName(row.actorName)}</span> }\n")
  try {
    const violations = collectViolations()
    assert.equal(violations.some((entry) => entry.includes('.actor-display-boundary-ok.tsx')), false, violations.join('\n'))
  } finally {
    fs.rmSync(tempFile, { force: true })
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

module.exports = { collectViolations }
