import { describe, expect, it } from 'vitest'
import { parseStatementBatchSelectionKeys, selectStatementBatchRows } from './StatementBatchView'
import type { StatementBatchRow } from '../api/statementBatchApi'

describe('거래명세서 일괄 인쇄 데이터 계약', () => {
  it('query의 실제 거래처 선택만 출력 대상으로 남긴다', () => {
    const rows = [
      { selectionKey: 'REAL-1', partnerCode: 'REAL-1', partnerName: '실거래처 1', chatRoomNames: [], slips: [] },
      { selectionKey: 'REAL-2', partnerCode: 'REAL-2', partnerName: '실거래처 2', chatRoomNames: [], slips: [] },
    ] satisfies StatementBatchRow[]

    expect(selectStatementBatchRows(rows, ['REAL-2']).map((row) => row.partnerCode))
      .toEqual(['REAL-2'])
  })

  it('표시 코드가 같아도 opaque selectionKey로 한 row만 선택한다', () => {
    const rows = [
      { partnerCode: 'SAME-DISPLAY', selectionKey: 'partner-A', partnerName: 'A', chatRoomNames: [], slips: [] },
      { partnerCode: 'SAME-DISPLAY', selectionKey: 'partner-B', partnerName: 'B', chatRoomNames: [], slips: [] },
    ] as StatementBatchRow[]

    expect(selectStatementBatchRows(rows, ['partner-A']).map((row) => row.partnerName))
      .toEqual(['A'])
  })

  it('쉼표가 포함된 selectionKey를 query 구분자로 분리하지 않는다', () => {
    const rows = [
      { partnerCode: 'DISPLAY-A', selectionKey: 'A,B', partnerName: 'A', chatRoomNames: [], slips: [] },
    ] as StatementBatchRow[]

    expect(selectStatementBatchRows(rows, ['A,B']).map((row) => row.partnerName))
      .toEqual(['A'])
  })

  it('선택 query가 없으면 전체 rows를 그대로 반환한다', () => {
    const rows = [
      { partnerCode: 'DISPLAY-A', selectionKey: 'partner-A', partnerName: 'A', chatRoomNames: [], slips: [] },
      { partnerCode: 'DISPLAY-B', selectionKey: 'partner-B', partnerName: 'B', chatRoomNames: [], slips: [] },
    ] as StatementBatchRow[]

    expect(selectStatementBatchRows(rows, [])).toBe(rows)
  })

  it('반복 query의 쉼표 포함 값을 하나의 selectionKey로 왕복한다', () => {
    const params = new URLSearchParams()
    params.append('selectionKeys', 'A,B')
    params.append('selectionKeys', 'C')

    expect(parseStatementBatchSelectionKeys(params)).toEqual(['A,B', 'C'])
  })
})
