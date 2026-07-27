import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const REAL_QA_FILES = [
  resolve(HERE, '../../../playwright/869-ds4-real-qa/869-ds4-real-qa.spec.ts'),
  resolve(HERE, '../../../playwright/869-ds4-real-qa/ds4-body-layer-regression-real-qa.spec.ts'),
]

describe('#913-1 실 QA 정리 계약', () => {
  it('두 스펙은 공통 broad prefix가 아니라 run 고유 이름으로만 정리한다', () => {
    const sources = REAL_QA_FILES.map((file) => readFileSync(file, 'utf8'))

    expect(sources.join('\n')).not.toMatch(/name\?\.startsWith\(['"]DS4 (?:실서버QA|회귀실측)/u)
  })
})
