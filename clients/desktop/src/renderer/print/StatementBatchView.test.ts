import { describe, expect, it } from 'vitest'
import { selectStatementBatchRows } from './StatementBatchView'
import type { StatementBatchRow } from '../api/statementBatchApi'

describe('거래명세서 일괄 인쇄 데이터 계약', () => {
  it('query의 실제 거래처 선택만 출력 대상으로 남긴다', () => {
    const rows = [
      { partnerCode: 'REAL-1', partnerName: '실거래처 1', chatRoomNames: [], slips: [] },
      { partnerCode: 'REAL-2', partnerName: '실거래처 2', chatRoomNames: [], slips: [] },
    ] satisfies StatementBatchRow[]

    expect(selectStatementBatchRows(rows, ['REAL-2']).map((row) => row.partnerCode))
      .toEqual(['REAL-2'])
  })
})
