import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseDocumentTemplate } from './templateSchema'

const fixtureDir = resolve(process.cwd(), '../../services/groupware-service/src/test/resources/document-template-fixtures')

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtureDir, name), 'utf8')) as unknown
}

describe('shared document template fixture corpus', () => {
  it('accepts both canonical valid fixtures', () => {
    expect(parseDocumentTemplate(fixture('valid-default.json')).ok).toBe(true)
    expect(parseDocumentTemplate(fixture('valid-reordered-sparse.json')).ok).toBe(true)
    expect(parseDocumentTemplate(fixture('canonical-active-response.json')).ok).toBe(true)
  })

  it.each([
    'invalid-duplicate-key.json',
    'invalid-missing-singleton.json',
    'invalid-placement.json',
    'invalid-unknown-version.json',
    'invalid-paper.json',
  ])('rejects %s', (name) => {
    expect(parseDocumentTemplate(fixture(name)).ok).toBe(false)
  })
})
