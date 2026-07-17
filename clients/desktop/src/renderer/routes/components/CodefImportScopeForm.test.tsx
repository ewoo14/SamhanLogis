// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CodefImportResultSummary } from './CodefImportScopeForm'
import type { CodefImportResponse } from '../../api/codef'

const baseResult: CodefImportResponse = {
  fetchedCount: 10,
  importedCount: 7,
  duplicateSkippedCount: 1,
  matchedCount: 5,
  staleSkippedCount: 0,
  staleNormalizedNames: [],
  unavailableSkippedCount: 0,
  unavailableNames: [],
}

afterEach(() => {
  cleanup()
})

describe('CodefImportResultSummary 보류 경고 (#810 R3 계약 pin)', () => {
  it('보류가 없으면 요약만 표시하고 경고 배너를 렌더하지 않는다', () => {
    render(<CodefImportResultSummary result={baseResult} />)
    expect(screen.getByTestId('codef-import-result')).toBeTruthy()
    expect(screen.queryByTestId('codef-stale-warning')).toBeNull()
    expect(screen.queryByTestId('codef-unavailable-warning')).toBeNull()
  })

  it('unavailable(일시장애)은 role=status 재시도 안내로 표시하고 대상 이름을 노출한다', () => {
    render(
      <CodefImportResultSummary
        result={{ ...baseResult, unavailableSkippedCount: 2, unavailableNames: ['삼한상사', '강남에어'] }}
      />,
    )
    const banner = screen.getByTestId('codef-unavailable-warning')
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.textContent).toContain('거래처 조회 일시 장애로 2건 매칭 보류')
    expect(banner.textContent).toContain('잠시 후 다시 가져오기 하세요')
    expect(banner.textContent).toContain('대상: 삼한상사, 강남에어')
    expect(screen.queryByTestId('codef-stale-warning')).toBeNull()
  })

  it('stale(영구·재선택)과 unavailable(일시·재시도)이 함께면 두 경고를 구분해 동시 표시한다', () => {
    render(
      <CodefImportResultSummary
        result={{
          ...baseResult,
          staleSkippedCount: 1,
          staleNormalizedNames: ['옛거래처'],
          unavailableSkippedCount: 3,
          unavailableNames: ['새거래처'],
        }}
      />,
    )
    const stale = screen.getByTestId('codef-stale-warning')
    const unavailable = screen.getByTestId('codef-unavailable-warning')
    expect(stale.getAttribute('role')).toBe('alert')
    expect(unavailable.getAttribute('role')).toBe('status')
    expect(stale.textContent).toContain('거래처 조회가 확인되지 않아 1건을 보류했습니다')
    expect(stale.textContent).toContain('대상: 옛거래처')
    expect(unavailable.textContent).toContain('거래처 조회 일시 장애로 3건 매칭 보류')
    expect(unavailable.textContent).toContain('대상: 새거래처')
  })
})
