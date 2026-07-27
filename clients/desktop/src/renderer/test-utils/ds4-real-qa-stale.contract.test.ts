import { describe, expect, it } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-var-requires -- scripts/ 는 tsc typecheck 범위 밖(.cjs 순수 모듈).
import {
  DEFAULT_STALE_GRACE_MS,
  isStaleDs4Run,
  parseDs4RunRecord,
} from '../../../scripts/ds4-real-qa-stale.cjs'

const TEMPLATE_ID = '89445fa4-4f12-4ef1-9d92-5fa9bbaa35d8'

function record(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    runId: 'qa-run-1',
    templateId: TEMPLATE_ID,
    templateName: '사용자도 고를 수 있는 표시 이름',
    ownerPid: 2 ** 30,
    startedAtMs: Date.now() - DEFAULT_STALE_GRACE_MS * 2,
    ...overrides,
  }
}

describe('ds4-real-qa-stale — registry scope 판정', () => {
  it('template ID가 없는 scope는 stale이 아니며 parser가 보존 근거를 요구한다', () => {
    expect(parseDs4RunRecord(record({ templateId: null }))).toMatchObject({ templateId: null })
    expect(isStaleDs4Run(record({ templateId: null }))).toBe(false)
  })

  it('표시 이름과 무관하게 등록된 scope만 owner lifecycle로 stale 판정한다', () => {
    const parsed = parseDs4RunRecord(record())
    expect(parsed).toMatchObject({ templateId: TEMPLATE_ID, ownerPid: 2 ** 30 })
    expect(isStaleDs4Run(record())).toBe(true)
    expect(isStaleDs4Run(record({ ownerPid: process.pid }))).toBe(false)
  })

  it('유예기간 이내면 owner가 죽었어도 아직 stale이 아니다', () => {
    expect(isStaleDs4Run(record({ startedAtMs: Date.now() }))).toBe(false)
  })

  it('registry 형태가 아니면 null이며 삭제 대상으로 승격되지 않는다', () => {
    expect(parseDs4RunRecord({ version: 1, templateId: TEMPLATE_ID })).toBeNull()
    expect(parseDs4RunRecord({
      version: 1,
      runId: 'qa-run-1',
      templateId: 'not-a-uuid',
      ownerPid: 2 ** 30,
      startedAtMs: Date.now() - DEFAULT_STALE_GRACE_MS * 2,
    })).toBeNull()
  })
})
