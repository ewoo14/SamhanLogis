import { describe, expect, it } from 'vitest'
import { BANK_TXN_SOURCE_LABEL } from '../accounting'

describe('입출금 거래 사용자 표시 라벨', () => {
  it('소스 라벨은 레거시 vendor acronym 대신 업무 용어로 표시한다', () => {
    expect(BANK_TXN_SOURCE_LABEL.CSV_IMPORT).toBe('파일')
  })
})
