import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormGrid } from './FormGrid'

describe('FormGrid', () => {
  it('children을 렌더링하고 grid 클래스를 적용한다', () => {
    render(
      <FormGrid>
        <span>필드 A</span>
      </FormGrid>,
    )

    const child = screen.getByText('필드 A')
    const grid = child.parentElement as HTMLElement

    expect(child).toBeTruthy()
    expect(grid.className).toContain('grid')
  })

  it('columns는 --fg-cols CSS 변수로만 주입하고 grid-template-columns 인라인 스타일은 만들지 않는다', () => {
    render(
      <FormGrid columns={3}>
        <span>필드 A</span>
      </FormGrid>,
    )

    const grid = screen.getByText('필드 A').parentElement as HTMLElement

    expect(grid.style.getPropertyValue('--fg-cols')).toBe('3')
    expect(grid.style.gridTemplateColumns).toBe('')
  })

  it('columns 미지정 시 --fg-cols를 설정하지 않아 CSS 기본값 2열을 사용한다', () => {
    render(
      <FormGrid>
        <span>필드 A</span>
      </FormGrid>,
    )

    const grid = screen.getByText('필드 A').parentElement as HTMLElement

    expect(grid.style.getPropertyValue('--fg-cols')).toBe('')
  })

  it('FormGrid.Full은 full 클래스를 적용한다', () => {
    render(
      <FormGrid>
        <FormGrid.Full>
          <span>전폭 필드</span>
        </FormGrid.Full>
      </FormGrid>,
    )

    const full = screen.getByText('전폭 필드').parentElement as HTMLElement

    expect(full.className).toContain('full')
  })

  it('gap prop을 컨테이너 인라인 스타일에 반영한다', () => {
    render(
      <FormGrid gap="8px">
        <span>필드 A</span>
      </FormGrid>,
    )

    const grid = screen.getByText('필드 A').parentElement as HTMLElement

    expect(grid.style.gap).toBe('8px')
  })

  it('className을 grid 클래스와 병합한다', () => {
    render(
      <FormGrid className="custom-grid">
        <span>필드 A</span>
      </FormGrid>,
    )

    const grid = screen.getByText('필드 A').parentElement as HTMLElement

    expect(grid.className).toContain('grid')
    expect(grid.className).toContain('custom-grid')
  })

  // jsdom은 CSS @media 레이아웃 계산을 검증하지 못하므로, 모바일 1열 전환은 라이브 QA에서 확인한다.
})
