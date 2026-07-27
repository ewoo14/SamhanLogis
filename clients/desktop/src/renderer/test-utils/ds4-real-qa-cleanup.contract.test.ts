import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Ds4RunScope } from '../../../playwright/support/ds4-real-qa-cleanup'
import * as cleanupSupport from '../../../playwright/support/ds4-real-qa-cleanup'

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

  it('저장 응답 본문을 받으면 대기 전에 서버 UUID를 registry에 기록한다', () => {
    const saveSource = readFileSync(REAL_QA_FILES[0]!, 'utf8')
    const recordCallOffset = saveSource.indexOf('rememberDs4TemplateIdFromSaveBody(runScope, savedBody)')
    const uiWaitOffset = saveSource.indexOf("await expect(page.getByText('저장된 상태입니다.')).toBeVisible")
    expect(recordCallOffset).toBeGreaterThanOrEqual(0)
    expect(uiWaitOffset).toBeGreaterThan(recordCallOffset)

    const recordSavedTemplateId = (cleanupSupport as unknown as {
      rememberDs4TemplateIdFromSaveBody?: (scope: Ds4RunScope, body: unknown) => string
    }).rememberDs4TemplateIdFromSaveBody
    expect(recordSavedTemplateId).toBeTypeOf('function')
    if (typeof recordSavedTemplateId !== 'function') return

    const registryDir = mkdtempSync(resolve(process.env.TEMP ?? process.cwd(), 'ds4-save-record-'))
    try {
      const scopeFile = resolve(registryDir, 'scope.json')
      writeFileSync(scopeFile, JSON.stringify({
        version: 1,
        runId: 'save-response-before-ui-wait',
        templateId: null,
        templateName: '사용자 지정 표시 이름',
        ownerPid: process.pid,
        startedAtMs: Date.now(),
      }), 'utf8')
      const scope = {
        runId: 'save-response-before-ui-wait',
        templateName: '사용자 지정 표시 이름',
        ownerPid: process.pid,
        stopFile: resolve(registryDir, 'stop'),
        scopeFile,
        templateId: null,
        spawnMethod: 'detached-fallback',
      } satisfies Ds4RunScope

      const templateId = 'ce302405-1111-4111-8111-222222222222'
      expect(recordSavedTemplateId(scope, { data: { id: templateId } })).toBe(templateId)
      expect(JSON.parse(readFileSync(scopeFile, 'utf8')).templateId)
        .toBe(templateId)
    } finally {
      rmSync(registryDir, { recursive: true, force: true })
    }
  })
})
