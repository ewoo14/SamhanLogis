import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'PreClassifyPage.tsx'), 'utf8')

describe('가배차 실행 모드 저장·복원 계약', () => {
  it('수동 저장 requestParams에 mode를 저장한다', () => {
    expect(source).toMatch(/saveMode: 'MANUAL_NAMED'[\s\S]{0,500}\{ from, to, mode: executionMode, rowCount \}/)
  })

  it('복원한 모드를 선택 상태로 복구하고 mode 변경 시 복원 payload를 버린다', () => {
    expect(source).toMatch(/setExecutionMode\(restoredMode\)/)
    expect(source).toMatch(/restoredRegionMode === executionMode/)
    expect(source).toMatch(/autoSaveKey = .*executionMode/)
  })
})
