import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'PreClassifyPage.tsx'), 'utf8')

describe('아로로지스 수신 전용 전환 계약', () => {
  it('legacy 8모드 실행 상태를 포함하지 않는다', () => {
    expect(source).not.toMatch(/EXECUTION_MODES|DispatchExecutionMode|setExecutionMode|saveDispatchHistory/)
  })

  it('수신 전용 화면을 export한다', () => {
    expect(source).toContain('ReceivedGroupsPage')
    expect(source).toContain('ArologisPreClassifyPage')
  })
})
