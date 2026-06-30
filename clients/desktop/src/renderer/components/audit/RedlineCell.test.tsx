// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RedlineCell } from './RedlineCell'

afterEach(() => {
  cleanup()
})

describe('RedlineCell', () => {
  it('layers 3개를 최신값 상단 + 이전값 취소선 스택으로 표시한다', () => {
    render(
      <RedlineCell
        layers={[
          { value: '원본', actorName: null, actorColor: null, changedAt: null },
          { value: '1차', actorName: '김영업', actorColor: '#DB2777', changedAt: '2026-06-30T09:15:00' },
          { value: '2차', actorName: '박관리', actorColor: '#2563EB', changedAt: '2026-06-30T10:20:00' },
        ]}
      />,
    )

    expect(screen.getByTestId('redline-cell-current').textContent).toContain('2차')
    expect(screen.getByTestId('redline-cell-current').textContent).toContain('박관리')
    const struck = screen.getAllByTestId('redline-cell-struck')
    expect(struck).toHaveLength(2)
    expect(struck[0].textContent).toContain('1차')
    expect(struck[0].textContent).toContain('김영업')
    expect(struck[0].style.textDecoration).toContain('line-through')
    expect(struck[1].textContent).toContain('원본')
    expect(struck[1].style.textDecoration).toContain('line-through')
  })

  it('layers 1개는 일반 값만 표시하고 취소선을 만들지 않는다', () => {
    render(<RedlineCell layers={[{ value: '현재값', actorName: null, actorColor: null, changedAt: null }]} />)

    expect(screen.getByTestId('redline-cell-plain').textContent).toBe('현재값')
    expect(screen.queryByTestId('redline-cell-struck')).toBeNull()
  })
})
