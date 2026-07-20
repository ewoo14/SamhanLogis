// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HistoryTable, partnerCodeCell, partnerNameCell } from './DepositorMappingPage'
import type { DepositorMappingHistoryResponse, DepositorMappingResponse } from '../api/accounting'

const baseRow: DepositorMappingResponse = {
  rawName: '삼한상사',
  normalizedName: '삼한상사',
  partnerCode: 'P-2026-0001',
  partnerName: '삼한상사',
  targetStatus: 'ACTIVE',
  staleTarget: false,
  modifiedAt: '2026-07-17T09:00:00',
  actor: '사용자',
  active: true,
}

/** BE 채번 opaque entryKey 대칭(#810 R3 S4-M3) — 행마다 유일한 기본값을 만든다. */
let historyEntrySeq = 0

function historyRow(overrides: Partial<DepositorMappingHistoryResponse>): DepositorMappingHistoryResponse {
  historyEntrySeq += 1
  return {
    entryKey: `test-entry-${historyEntrySeq}`,
    fieldName: 'mapping.partnerCode',
    oldValue: null,
    newValue: 'P-2026-0001',
    actor: '사용자',
    changedAt: '2026-07-17T09:00:00',
    revisionNo: 1,
    operationOrdinal: 1,
    generation: 1,
    ...overrides,
  } as DepositorMappingHistoryResponse
}

afterEach(() => {
  cleanup()
})

describe('DepositorMappingPage 거래처 상태 셀 (#810 R3 계약 pin)', () => {
  it('정상(ACTIVE) 매핑은 partnerCode 를 그대로 표시한다', () => {
    const { container } = render(<>{partnerCodeCell(baseRow)}</>)
    expect(container.textContent).toBe('P-2026-0001')
  })

  it('staleTarget(삭제/비활성)은 재선택 배지를 표시한다', () => {
    render(<>{partnerCodeCell({ ...baseRow, targetStatus: 'TERMINATED', staleTarget: true, partnerName: null })}</>)
    expect(screen.getByText('거래처 재선택 필요 (TERMINATED)')).toBeTruthy()
  })

  it("UNAVAILABLE(일시장애)은 '거래처 조회 불가(일시)'로 표시하고 재선택/삭제됨 문구와 구분한다", () => {
    render(<>{partnerCodeCell({ ...baseRow, targetStatus: 'UNAVAILABLE', staleTarget: false, partnerName: null })}</>)
    expect(screen.getByText('거래처 조회 불가(일시)')).toBeTruthy()
    expect(screen.queryByText(/재선택|삭제됨/)).toBeNull()
  })

  it('거래처명 셀 — UNAVAILABLE 은 role=status 일시 안내, stale 은 role=alert 재선택 경고다', () => {
    render(
      <>
        {partnerNameCell({ ...baseRow, targetStatus: 'UNAVAILABLE', staleTarget: false, partnerName: null })}
        {partnerNameCell({ ...baseRow, targetStatus: 'TERMINATED', staleTarget: true, partnerName: null })}
      </>,
    )
    expect(screen.getByRole('status').textContent).toBe('거래처 일시 조회 불가')
    expect(screen.getByRole('alert').textContent).toBe('비활성 거래처 — 재선택 필요')
  })
})

describe('DepositorMappingPage 이력 표시 (#810 적대검증 R3 L4-M1 · #832 R1 UX fix)', () => {
  it('revisionNo(회차) 대신 작업 ordinal·세대를 병합 컬럼으로 표시한다', () => {
    render(
      <HistoryTable
        rows={[historyRow({ revisionNo: 99, operationOrdinal: 3, generation: 2 })]}
        loading={false}
      />,
    )
    // UX1: '작업'/'세대' 2컬럼이 '작업 / 세대' 1컬럼으로 병합돼 값 컬럼 폭을 확보한다.
    expect(screen.getByText('작업 / 세대')).toBeTruthy()
    expect(screen.getByText('작업 3')).toBeTruthy()
    expect(screen.getByText('2세대')).toBeTruthy()
    // 내부 채번 회차(revisionNo)는 사용자에게 노출하지 않는다.
    expect(screen.queryByText('#99')).toBeNull()
    expect(screen.queryByText(/회차/)).toBeNull()
  })

  it('BE 반환 순서(changedAt desc)를 재정렬하지 않는다 — 신세대(작업 4) rev 1이 구세대 delete(작업 3) rev 3보다 위', () => {
    // 삭제+재생성(다세대) 시나리오. operationOrdinal 은 정규화명 전체에서 1..N 유일이고
    // (신세대 create=작업 4), revisionNo 는 entity 단위 채번이라 신세대 create(rev 1)가
    // 구세대 delete(rev 3)·update(rev 2)보다 작다. FE 가 revisionNo 로 재정렬하면 작업 4가
    // 아래로 밀려 시간순이 뒤섞인다 — 결함 재현 가드. BE 순서(newest-first)를 그대로 신뢰한다.
    const rows = [
      historyRow({ fieldName: 'mapping.partnerCode', newValue: 'P-2026-0002', revisionNo: 1, operationOrdinal: 4, generation: 2, changedAt: '2026-07-17T10:00:00' }),
      // 같은 작업(4/2)의 2번째 필드행 — 작업/세대 셀은 공란 처리되어야 한다.
      historyRow({ fieldName: 'mapping.rawName', oldValue: null, newValue: '삼한상사(신)', revisionNo: 1, operationOrdinal: 4, generation: 2, changedAt: '2026-07-17T10:00:00' }),
      historyRow({ fieldName: 'mapping.rawName', oldValue: '삼한상사(구)', newValue: null, revisionNo: 3, operationOrdinal: 3, generation: 1, changedAt: '2026-07-17T09:00:00' }),
      historyRow({ fieldName: 'mapping.partnerCode', newValue: 'P-2026-0001b', revisionNo: 2, operationOrdinal: 2, generation: 1, changedAt: '2026-07-17T08:30:00' }),
      historyRow({ fieldName: 'mapping.partnerCode', newValue: 'P-2026-0001', revisionNo: 1, operationOrdinal: 1, generation: 1, changedAt: '2026-07-17T08:00:00' }),
    ]
    render(<HistoryTable rows={rows} loading={false} />)
    // 표시 순서 = BE 입력 순서 [4,3,2,1]. revisionNo desc(=[3,2,4?,1]) 로 재정렬되지 않았음을 증명.
    // 동시에 작업 4(2개 행)가 그룹핑으로 1회만 표기(연속행 공란)됨을 증명한다.
    const operationCells = screen.getAllByText(/^작업 \d+$/)
    expect(operationCells.map((cell) => cell.textContent)).toEqual(['작업 4', '작업 3', '작업 2', '작업 1'])
    expect(screen.getAllByText('작업 4')).toHaveLength(1)
  })

  it('같은 작업의 연속 필드행은 작업/세대를 첫 행에만 표기하고 값은 모두 렌더한다 (UX2 그룹핑)', () => {
    // 한 작업(7/2)이 거래처코드+원본명 2개 필드를 바꾼 경우 — 작업/세대는 1회만, 값은 2행 모두.
    const rows = [
      historyRow({ fieldName: 'mapping.partnerCode', oldValue: null, newValue: 'P-9002', operationOrdinal: 7, generation: 2, changedAt: '2026-07-18T10:00:00' }),
      historyRow({ fieldName: 'mapping.rawName', oldValue: '옛이름', newValue: '새이름', operationOrdinal: 7, generation: 2, changedAt: '2026-07-18T10:00:00' }),
    ]
    render(<HistoryTable rows={rows} loading={false} />)
    // 그룹핑: '작업 7'/'2세대'는 2개 행 중 첫 행에만 = 정확히 1회.
    expect(screen.getAllByText('작업 7')).toHaveLength(1)
    expect(screen.getAllByText('2세대')).toHaveLength(1)
    // 연속행(공란 작업 셀)도 값·필드 라벨은 정상 렌더 = 데이터 손실 없음.
    expect(screen.getByText('거래처 코드')).toBeTruthy()
    expect(screen.getByText('원본 입금자명')).toBeTruthy()
    expect(screen.getByText('옛이름')).toBeTruthy()
    expect(screen.getByText('새이름')).toBeTruthy()
  })

  it('operationOrdinal·generation 이 0/부재이면 "작업 0"/"0세대" 대신 —(대시)로 방어한다 (UX4 null 가드)', () => {
    const rows = [
      // 작업 순번 부재(0) — 병합 셀은 '작업 0' 이 아니라 '—'.
      historyRow({ fieldName: 'mapping.partnerCode', oldValue: '가', newValue: '나', operationOrdinal: 0, generation: 0, changedAt: '2026-07-18T09:00:00' }),
      // 작업 순번은 유효하나 세대만 0 — '작업 5' 는 표기하되 '0세대' 는 숨긴다.
      historyRow({ fieldName: 'mapping.rawName', oldValue: '다', newValue: '라', operationOrdinal: 5, generation: 0, changedAt: '2026-07-18T08:00:00' }),
    ]
    render(<HistoryTable rows={rows} loading={false} />)
    expect(screen.queryByText('작업 0')).toBeNull()
    expect(screen.queryByText('0세대')).toBeNull()
    // 값 셀은 구체 문자열이라 유일한 '—' 는 작업 순번 부재 셀뿐이다.
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('작업 5')).toBeTruthy()
  })

  it('rowKey 는 opaque entryKey — 다른 entity 가 같은 회차·시각·필드라도 React key 가 충돌하지 않는다 (#810 R3 S4-M3)', () => {
    // 같은 키의 삭제+재생성(두 세대의 변경)이 같은 초에 기록되면 revisionNo·changedAt·
    // fieldName 세 값이 모두 동일한 서로 다른 행이 생긴다 — 구 조합 키
    // (`revisionNo-changedAt-fieldName`)는 여기서 React duplicate key 경고를 낸다. 결함 재현 가드.
    const errorSpy = vi.spyOn(console, 'error')
    render(
      <HistoryTable
        rows={[
          historyRow({ entryKey: 'entry-recreate', newValue: 'P-2026-0002', revisionNo: 1, operationOrdinal: 2, generation: 2, changedAt: '2026-07-17T10:00:00' }),
          historyRow({ entryKey: 'entry-origin', newValue: 'P-2026-0001', revisionNo: 1, operationOrdinal: 1, generation: 1, changedAt: '2026-07-17T10:00:00' }),
        ]}
        loading={false}
      />,
    )
    expect(screen.getByText('P-2026-0002')).toBeTruthy()
    expect(screen.getByText('P-2026-0001')).toBeTruthy()
    const duplicateKeyWarnings = errorSpy.mock.calls.filter((call) => String(call[0]).includes('same key'))
    expect(duplicateKeyWarnings).toEqual([])
    errorSpy.mockRestore()
  })

  it('mapping.* fieldName 을 한국어 라벨로 표시한다', () => {
    render(
      <HistoryTable
        rows={[
          historyRow({ fieldName: 'mapping.rawName', newValue: '삼한상사' }),
          historyRow({ fieldName: 'mapping.reason', newValue: 'ADMIN_CREATE' }),
        ]}
        loading={false}
      />,
    )
    expect(screen.getByText('원본 입금자명')).toBeTruthy()
    expect(screen.getByText('변경 사유')).toBeTruthy()
  })
})
