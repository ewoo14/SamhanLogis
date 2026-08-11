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

  it('공백 문자열은 빈 값으로 표시하고 actor/value 의미를 aria-label 에 보존한다', () => {
    render(
      <RedlineCell
        layers={[
          { value: ' ', actorName: null, actorColor: null, changedAt: null },
          { value: '수정', actorName: '김영업', actorColor: '#DB2777', changedAt: '2026-06-30T09:15:00' },
        ]}
      />,
    )

    expect(screen.getByTestId('redline-cell-current').getAttribute('aria-label')).toBe('현재값: 김영업, 수정')
    expect(screen.getByTestId('redline-cell-struck').getAttribute('aria-label')).toBe('기준값: 비움')
    expect(screen.getByTestId('redline-cell-struck').textContent).toContain('비움')
  })

  it('BE identity guard가 보존한 UUID-shaped actorName을 aria-label에도 표시한다', () => {
    const actorName = 'cafebabecafebabecafebabecafebabe'
    render(
      <RedlineCell
        layers={[
          { value: '원본', actorName: null, actorColor: null, changedAt: null },
          { value: '수정', actorName, actorColor: '#DB2777', changedAt: '2026-08-10T09:01:00' },
        ]}
      />,
    )

    expect(screen.getByTestId('redline-cell-current').getAttribute('aria-label'))
      .toBe(`현재값: ${actorName}, 수정`)
    expect(screen.getByTestId('redline-cell-current').textContent).toContain(actorName)
  })

  it('format prop으로 각 layer 값을 포맷한다(수량 천단위)', () => {
    render(
      <RedlineCell
        format={(value) => Number(value).toLocaleString()}
        layers={[
          { value: '1000', actorName: null, actorColor: null, changedAt: null },
          { value: '12000', actorName: '김영업', actorColor: '#DB2777', changedAt: '2026-06-30T09:15:00' },
        ]}
      />,
    )

    expect(screen.getByTestId('redline-cell-current').textContent).toContain('12,000')
    expect(screen.getByTestId('redline-cell-struck').textContent).toContain('1,000')
  })
})
