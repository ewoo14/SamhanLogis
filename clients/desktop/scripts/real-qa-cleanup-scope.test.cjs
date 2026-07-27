const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

const SPEC_FILES = [
  'playwright/869-ds4-real-qa/869-ds4-real-qa.spec.ts',
  'playwright/869-ds4-real-qa/ds4-body-layer-regression-real-qa.spec.ts',
]

const isDescendantOf = (node, ancestor) => {
  for (let current = node.parent; current; current = current.parent) {
    if (current === ancestor) return true
  }
  return false
}

const findNodes = (root, predicate) => {
  const matches = []
  const visit = (node) => {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

for (const relativePath of SPEC_FILES) {
  test(`${relativePath} keeps cleanup id outside its try block`, () => {
    const sourceText = readFileSync(relativePath, 'utf8')
    const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const declaration = findNodes(sourceFile, (node) =>
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'savedTemplateId',
    )[0]
    assert.ok(declaration, 'savedTemplateId declaration must exist')

    const cleanupTry = findNodes(sourceFile, (node) =>
      ts.isTryStatement(node)
      && node.finallyBlock !== undefined
      && findNodes(node.finallyBlock, (child) =>
        ts.isIdentifier(child) && child.text === 'savedTemplateId',
      ).length > 0,
    )[0]
    assert.ok(cleanupTry, 'cleanup finally must reference savedTemplateId')
    assert.equal(
      isDescendantOf(declaration, cleanupTry.tryBlock),
      false,
      'savedTemplateId must be declared outside the try block used by finally cleanup',
    )
  })
}
