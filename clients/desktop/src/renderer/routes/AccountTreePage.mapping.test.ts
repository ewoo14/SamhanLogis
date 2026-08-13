import { describe, expect, it } from 'vitest'
import { accountMappingLabel } from './AccountTreePage'

describe('계정과목 이카운트 매핑 표시', () => {
  it('미정 코드는 숫자를 만들지 않고 미정으로 표시한다', () => {
    expect(accountMappingLabel({
      code: '103',
      name: '당좌예금',
      category: '100',
      ecountCode: null,
      mappingStatus: 'UNDETERMINED',
      mappingLabel: '미정',
    })).toBe('미정')
  })

  it('확정 매핑은 이카운트 코드를 표시한다', () => {
    expect(accountMappingLabel({
      code: '110',
      name: '외상매출금',
      category: '100',
      ecountCode: '1089',
      mappingStatus: 'MAPPED',
      mappingLabel: '1089',
    })).toBe('1089')
  })
})
