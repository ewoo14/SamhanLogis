const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const WORKTREE = path.resolve(__dirname, '../../..')
const CLIENTS_ROOT = path.join(WORKTREE, 'clients')
const SERVICES_ROOT = path.join(WORKTREE, 'services')
const SHARED_ROOT = path.join(WORKTREE, 'shared')
const DISPLAY_FIELDS = new Set([
  'actorName',
  'actorFullName',
  'authorName',
  'deletedByName',
  'proposerName',
  'processedBy',
  'createdByName',
  'requesterName',
  'approverName',
  'uploadedBy',
  'inspectorName',
])
const RESOLVER_NAMES = new Set([
  'safeActorName',
  'resolveActorDisplayName',
  'displayActorName',
  'deletedBadgeLabel',
  'deletedSlipBadgeLabel',
  'deletedBadgeAriaLabel',
  'deletedSlipBadgeAriaLabel',
  'maskCreatedBy',
  'displayActor',
  'displayName',
  'displayAuthorName',
  'displayWarehouseActor',
  'displayNameOrFallback',
  'formatUploader',
  'nullableInspectorName',
])
const OUTPUT_CALL_NAMES = /(?:print|csv|excel|export|download|notify|notification|email|sms|push|message|send)/i
const JAVA_DISPLAY_FIELDS = [
  'actorName',
  'authorName',
  'processedBy',
  'deletedByName',
  'createdByName',
  'requesterName',
  'proposerName',
  'uploadedBy',
  'inspectorName',
]
const JAVA_SAFE_MARKERS = /ActorDisplayName\.(?:resolve|resolveNullable)\s*\(|\b(?:safeActorName|resolveActorName|resolveAuthorName)\s*\(/s

function sourceRoots(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => path.join(root, entry.name, 'src'))
    .filter((src) => fs.existsSync(src))
}

function sourceFiles(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(fullPath)
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) return []
    if (/\.(test|spec|stories)\.(ts|tsx)$/.test(entry.name)) return []
    return [fullPath]
  })
}

function javaSourceRoots(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'build')
    .map((entry) => path.join(root, entry.name, 'src', 'main', 'java'))
    .filter((src) => fs.existsSync(src))
}

function javaSourceFiles(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) return javaSourceFiles(fullPath)
    return entry.isFile() && fullPath.endsWith('.java') ? [fullPath] : []
  })
}

function parser() {
  return require(path.join(WORKTREE, 'clients/desktop/node_modules/@typescript-eslint/parser/dist/index.js'))
}

function walk(node, ancestors, visitor) {
  if (!node || typeof node !== 'object') return
  visitor(node, ancestors)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments' || key === 'loc' || key === 'range') continue
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') walk(child, [...ancestors, node], visitor)
    } else if (value && typeof value.type === 'string') {
      walk(value, [...ancestors, node], visitor)
    }
  }
}

function memberField(node) {
  if (node.type !== 'MemberExpression' || node.computed) return null
  return node.property?.type === 'Identifier' && DISPLAY_FIELDS.has(node.property.name)
    ? node.property.name
    : null
}

function callName(node) {
  if (!node || node.type !== 'CallExpression') return ''
  const callee = node.callee
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression' && callee.property?.type === 'Identifier') return callee.property.name
  return ''
}

function hasAncestor(ancestors, type) {
  return ancestors.some((ancestor) => ancestor.type === type)
}

function isResolverArgument(ancestors) {
  return ancestors.some((ancestor) => ancestor.type === 'CallExpression' && RESOLVER_NAMES.has(callName(ancestor)))
}

function isOutputContext(ancestors) {
  if (hasAncestor(ancestors, 'JSXExpressionContainer') || hasAncestor(ancestors, 'JSXAttribute')) return true
  if (hasAncestor(ancestors, 'ReturnStatement')) return true
  return ancestors.some((ancestor) => ancestor.type === 'CallExpression' && OUTPUT_CALL_NAMES.test(callName(ancestor)))
}

function isPassThroughProperty(ancestors) {
  const parent = ancestors.at(-1)
  return parent?.type === 'Property' && parent.key?.type === 'Identifier' && DISPLAY_FIELDS.has(parent.key.name)
}

function containsRawMember(node) {
  let found = false
  walk(node, [], (child) => { if (memberField(child)) found = true })
  return found
}

function containingFunction(ancestors) {
  return [...ancestors].reverse().find((ancestor) =>
    ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(ancestor.type))
}

function functionHasTaintedUse(functionNode, variableName) {
  let found = false
  walk(functionNode, [], (node, ancestors) => {
    if (node.type !== 'Identifier' || node.name !== variableName) return
    if (isOutputContext(ancestors)) found = true
  })
  return found
}

function collectTypeScriptViolations(file) {
  const code = fs.readFileSync(file, 'utf8')
  let ast
  try {
    ast = parser().parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      loc: true,
    })
  } catch (error) {
    return [`${path.relative(WORKTREE, file)}: unable to parse source: ${error.message}`]
  }

  const violations = []
  walk(ast, [], (node, ancestors) => {
    const field = memberField(node)
    if (!field || isResolverArgument(ancestors)) return
    if (isPassThroughProperty(ancestors) && !hasAncestor(ancestors, 'ReturnStatement')) return
    const isControlCondition = ancestors.some((ancestor) =>
      (ancestor.type === 'ConditionalExpression' && ancestor.test === node) ||
      (ancestor.type === 'IfStatement' && ancestor.test === node))
    if (isControlCondition) return
    const location = `${path.relative(WORKTREE, file)}:${node.loc.start.line}:${node.loc.start.column + 1}`
    if (isOutputContext(ancestors)) {
      violations.push(`${location}: raw actor display read reaches output (${field})`)
      return
    }

    const variable = [...ancestors].reverse().find((ancestor) =>
      ancestor.type === 'VariableDeclarator' && ancestor.id?.type === 'Identifier' && ancestor.init)
    if (variable && containsRawMember(variable.init) && functionHasTaintedUse(containingFunction(ancestors), variable.id.name)) {
      violations.push(`${location}: raw actor display alias reaches output (${field} -> ${variable.id.name})`)
    }
  })
  return violations
}

function javaPathIsOutputBoundary(file) {
  const relative = path.relative(WORKTREE, file).replaceAll(path.sep, '/')
  return /\/(?:web|dto)\//.test(`/${relative}/`) || /(?:notification|print|csv|excel|export|email|sms|push)/i.test(relative)
}

function javaHasDisplayField(code) {
  return JAVA_DISPLAY_FIELDS.some((field) => new RegExp(`\\b${field}\\b`).test(code))
}

function recordNames(code) {
  return [...code.matchAll(/\brecord\s+(\w+)\s*\(([^)]*)\)/gs)]
    .filter((match) => JAVA_DISPLAY_FIELDS.some((field) => new RegExp(`\\b${field}\\b`).test(match[2])))
    .map((match) => match[1])
}

function collectJavaViolations(files) {
  const allCode = files.map((file) => ({ file, code: fs.readFileSync(file, 'utf8') }))
  const violations = []
  for (const { file, code } of allCode) {
    if (!javaPathIsOutputBoundary(file) || !javaHasDisplayField(code) || JAVA_SAFE_MARKERS.test(code)) continue
    const records = recordNames(code)
    for (const name of records) {
      const constructorSites = allCode.filter(({ code: candidate }) => new RegExp(`\\bnew\\s+${name}\\s*\\(`).test(candidate))
      if (constructorSites.length === 0) {
        violations.push(`${path.relative(WORKTREE, file)}: raw actor display record component is not resolver-bound (${name})`)
      }
    }
    const isDto = /(?:Response|Dto)\.java$/.test(file) || /[\\/]dto[\\/]/.test(file)
    const isNotificationOrDeliveryOutput = /(?:notification|print|csv|excel|export|email|sms|push)/i.test(file)
    if ((isDto || isNotificationOrDeliveryOutput) && /\b(?:get(?:ActorName|AuthorName|ProposerName|DecidedByName|DeletedByName|CreatedByName|RequesterName|ProcessedBy)|actorName\s*\()/.test(code)) {
      violations.push(`${path.relative(WORKTREE, file)}: raw actor display mapping/string output is not resolver-bound`)
    }
  }
  return violations
}

function collectViolations() {
  const violations = []
  for (const root of sourceRoots(CLIENTS_ROOT)) {
    for (const file of sourceFiles(root)) {
      const relativeParts = path.relative(WORKTREE, file).split(path.sep)
      if (relativeParts.includes('api') || relativeParts.includes('mock') || relativeParts.includes('__fixtures__')) continue
      violations.push(...collectTypeScriptViolations(file))
    }
  }
  const javaFiles = [...javaSourceRoots(SERVICES_ROOT), ...javaSourceRoots(SHARED_ROOT)].flatMap(javaSourceFiles)
  violations.push(...collectJavaViolations(javaFiles))
  for (const file of [
    path.join(WORKTREE, 'clients/desktop/src/renderer/utils/maskCreatedBy.ts'),
    path.join(WORKTREE, 'clients/arologis-desktop/src/renderer/utils/maskCreatedBy.ts'),
  ]) {
    const code = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    if (!code.includes('safeActorName(')) violations.push(`${path.relative(WORKTREE, file)}: local actor mask is not resolver-backed`)
  }
  return [...new Set(violations)]
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
    assert.ok(violations.some((entry) => entry.includes('NewActorExit.tsx') && entry.includes('raw actor display')), violations.join('\n'))
  } finally {
    fs.rmSync(mutationDir, { recursive: true, force: true })
  }
})

test('the eight adversarial raw actor exits are all rejected (mutation RED)', () => {
  const files = [
    [path.join(WORKTREE, 'clients/desktop/src/renderer/.actor-display-mutation/01-direct.tsx'), 'export function Direct({ row }) { return <span>{row.actorName}</span> }\n'],
    [path.join(WORKTREE, 'clients/desktop/src/renderer/.actor-display-mutation/02-alias-template.tsx'), 'export function Alias({ row }) { const actor = row.actorName; return <span>{`작업자: ${actor}`}</span> }\n'],
    [path.join(WORKTREE, 'clients/desktop/src/renderer/.actor-display-mutation/03-concat.tsx'), "export function Concat({ row }) { return <span>{'작업자: ' + row.actorName}</span> }\n"],
    [path.join(WORKTREE, 'clients/desktop/src/renderer/.actor-display-mutation/04-print-csv.tsx'), "export function Csv({ rows }) { return rows.map((row) => '작업자: ' + row.actorName).join('\\n') }\n"],
    [path.join(WORKTREE, 'clients/new-sol-review3-service/src/NewExit.tsx'), 'export function NewExit({ row }) { return <span>{row.actorName}</span> }\n'],
    [path.join(WORKTREE, 'services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/NewActorRecordResponse.java'), 'record NewActorRecordResponse(String actorName) {}\n'],
    [path.join(WORKTREE, 'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/NewActorResponse.java'), 'record NewActorResponse(String actorName) {}\n'],
    [path.join(WORKTREE, 'services/notification-service/src/main/java/com/samhanair/logis/notification/NotificationBodyFactory.java'), 'final class NotificationBodyFactory { String body(Row row) { return "작업자: " + row.actorName(); } }\n'],
  ]
  const created = []
  try {
    for (const [file, content] of files) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content)
      created.push(file)
    }
    const violations = collectViolations()
    console.log(`MUTATION_RED_EIGHT\n${files.map(([file]) => `${path.basename(file)}=${violations.some((entry) => entry.startsWith(path.relative(WORKTREE, file))) ? 'RED' : 'GREEN'}`).join('\n')}`)
    for (const [file] of files) {
      assert.ok(violations.some((entry) => entry.startsWith(path.relative(WORKTREE, file))), `mutation was not rejected: ${path.relative(WORKTREE, file)}\n${violations.join('\n')}`)
    }
  } finally {
    for (const file of created) fs.rmSync(file, { force: true })
    for (const dir of [path.join(WORKTREE, 'clients/desktop/src/renderer/.actor-display-mutation'), path.join(WORKTREE, 'clients/new-sol-review3-service')]) fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a newly added raw API display exit is rejected (mutation RED)', () => {
  const mutationFile = path.join(WORKTREE, 'services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/NewActorApiResponse.java')
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
  const tempFile = path.join(WORKTREE, 'clients/desktop/src/renderer/.actor-display-boundary-ok.tsx')
  fs.writeFileSync(tempFile, "import { safeActorName } from '@samhan/design-system'\nexport function Safe({ row }) { return <span>{safeActorName(row.actorName)}</span> }\n")
  try {
    const violations = collectViolations()
    assert.equal(violations.some((entry) => entry.includes('.actor-display-boundary-ok.tsx')), false, violations.join('\n'))
  } finally {
    fs.rmSync(tempFile, { force: true })
  }
})

module.exports = { collectViolations }
