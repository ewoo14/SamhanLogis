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
    ...overrides,
  }
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

describe('DepositorMappingPage 이력 표시 (#810 적대검증 R3 L4-M1)', () => {
  it('BE 반환 순서(changedAt desc)를 재정렬하지 않는다 — 신 entity rev 1이 구 entity rev 2보다 위', () => {
    // 같은 키 삭제+재생성 시나리오: BE 는 시간순(desc)으로 신 entity 생성(rev 1)을
    // 구 entity 삭제(rev 2)보다 먼저 반환한다. FE 가 revisionNo 를 1차 정렬 키로 재정렬하면
    // 이 순서가 #2-#1-#1 로 뒤집혀 시간순이 뒤섞인다 — 결함 재현 가드.
    const rows = [
      historyRow({ fieldName: 'mapping.partnerCode', newValue: 'P-2026-0002', revisionNo: 1, changedAt: '2026-07-17T10:00:00' }),
      historyRow({ fieldName: 'mapping.rawName', oldValue: '삼한상사', newValue: null, revisionNo: 2, changedAt: '2026-07-17T09:00:00' }),
      historyRow({ fieldName: 'mapping.partnerCode', newValue: 'P-2026-0001', revisionNo: 1, changedAt: '2026-07-17T08:00:00' }),
    ]
    render(<HistoryTable rows={rows} loading={false} />)
    const revisionCells = screen.getAllByText(/^#\d+$/)
    expect(revisionCells.map((cell) => cell.textContent)).toEqual(['#1', '#2', '#1'])
  })

  it('rowKey 는 opaque entryKey — 다른 entity 가 같은 회차·시각·필드라도 React key 가 충돌하지 않는다 (#810 R3 S4-M3)', () => {
    // 같은 키의 삭제+재생성(또는 두 entity 의 변경)이 같은 초에 기록되면 revisionNo·changedAt·
    // fieldName 세 값이 모두 동일한 서로 다른 행이 생긴다 — 구 조합 키
    // (`revisionNo-changedAt-fieldName`)는 여기서 React duplicate key 경고를 낸다. 결함 재현 가드.
    const errorSpy = vi.spyOn(console, 'error')
    render(
      <HistoryTable
        rows={[
          historyRow({ entryKey: 'entry-recreate', newValue: 'P-2026-0002', revisionNo: 1, changedAt: '2026-07-17T10:00:00' }),
          historyRow({ entryKey: 'entry-origin', newValue: 'P-2026-0001', revisionNo: 1, changedAt: '2026-07-17T10:00:00' }),
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
