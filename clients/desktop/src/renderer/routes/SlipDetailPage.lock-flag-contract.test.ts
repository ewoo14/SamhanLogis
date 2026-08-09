import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = fs.readFileSync(path.resolve(__dirname, 'SlipDetailPage.tsx'), 'utf8')
const apiSource = fs.readFileSync(path.resolve(__dirname, '../api/slip.ts'), 'utf8')
const mockSource = fs.readFileSync(path.resolve(__dirname, '../api/mock.ts'), 'utf8')

describe('SlipDetailPage lockFlag contract', () => {
  it('RED-A: lockFlag is part of the detail API and drives a status-independent lock badge', () => {
    expect(apiSource).toMatch(/interface SlipSummary[\s\S]*?lockFlag\??:\s*boolean/)
    expect(pageSource).toContain('slip.lockFlag === true')
    expect(pageSource).toContain('data-testid="slip-detail-lock-badge"')
    expect(pageSource).toContain('const isLocked = slip.lockFlag === true || isPhysicalTerminal')
  })

  it('RED-B: mock detail response carries both locked and unlocked lockFlag values', () => {
    expect(mockSource).toContain('lockFlag: true')
    expect(mockSource).toContain('lockFlag: false')
    expect(mockSource).toContain('lockFlag: true')
  })

  it('잠금 전표 취소는 409를 사용자에게 잠금 사유로 안내한다', () => {
    expect(mockSource).toContain('lockFlag === true')
    expect(mockSource).toContain("return mockError(409, 'CONFLICT', '회계 마감으로 잠긴 전표는 취소·반려할 수 없습니다.')")
    expect(pageSource).toContain('마감 잠금')
  })
})
