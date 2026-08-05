import { describe, expect, it } from 'vitest'
import { actionsForStatus } from './SlipDetailPage'

describe('출고 검수 전이 액션 계약', () => {
  it('PROCESSING은 complete, INSPECTING은 inspect를 호출한다', () => {
    expect(actionsForStatus('PROCESSING', 'OUTBOUND')).toEqual(['complete'])
    expect(actionsForStatus('INSPECTING', 'OUTBOUND')).toEqual(['inspect'])
  })
})
