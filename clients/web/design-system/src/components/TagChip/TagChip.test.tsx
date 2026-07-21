import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TagChip } from './TagChip'

describe('TagChip', () => {
  it('label 을 전달하면 `키 : 값` 형태로 렌더한다', () => {
    render(<TagChip label="전압" value="220V" />)
    expect(screen.getByText('전압')).toBeTruthy()
    expect(screen.getByText('220V')).toBeTruthy()
    // 구분자 콜론은 aria-hidden 장식이지만 label 이 있을 때 존재한다.
    expect(screen.getByText(':')).toBeTruthy()
  })

  it('label 을 생략하면 값만 렌더하고 구분자를 숨긴다 (spec §1② value-only)', () => {
    render(<TagChip value="연차" />)
    expect(screen.getByText('연차')).toBeTruthy()
    // "항목" 같은 키/구분자 텍스트가 없어야 한다.
    expect(screen.queryByText(':')).toBeNull()
    expect(screen.queryByText('항목')).toBeNull()
  })

  it('빈 문자열 label 도 value-only 로 취급한다', () => {
    render(<TagChip label="" value="반차" />)
    expect(screen.getByText('반차')).toBeTruthy()
    expect(screen.queryByText(':')).toBeNull()
  })

  it('removeLabel 미지정 시 제거 버튼 aria-label 은 value 로 폴백한다 (C4)', () => {
    render(<TagChip value="김기철" onRemove={() => undefined} />)
    expect(screen.getByRole('button', { name: '김기철 제거' })).toBeTruthy()
  })

  it('removeLabel 을 주면 제거 버튼 aria-label 에 사용한다', () => {
    render(<TagChip label="사원" value="1" removeLabel="김기철 (영업2팀)" onRemove={() => undefined} />)
    expect(screen.getByRole('button', { name: '김기철 (영업2팀) 제거' })).toBeTruthy()
  })

  it('onRemove 가 없으면 제거 버튼을 렌더하지 않는다', () => {
    render(<TagChip label="사원" value="김기철" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  // #825 슬5 FABLE5 R1 — 제거 클릭이 chip 자신의 onClick(예: '전체' 재선택)으로 버블링되어
  // 제거 직후 즉시 재선택되던 결함(실서버 라이브 QA d1-f1/d2-f1 로 실증됨)의 회귀 방지 테스트.
  describe('누름 가능(pressable) chip — onClick + role="button"', () => {
    it('제거(X) 클릭은 onRemove 만 호출하고 chip onClick 으로 버블링되지 않는다 (근본원인 회귀 방지)', () => {
      const onClick = vi.fn()
      const onRemove = vi.fn()
      render(
        <TagChip
          label="범위"
          value="전체"
          removeLabel="전체 범위"
          onClick={onClick}
          onRemove={onRemove}
          role="button"
          tabIndex={0}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: '전체 범위 제거' }))

      expect(onRemove).toHaveBeenCalledTimes(1)
      expect(onClick).not.toHaveBeenCalled()
    })

    it('chip 본문 클릭은 onClick 을 호출한다', () => {
      const onClick = vi.fn()
      render(
        <TagChip
          label="범위"
          value="전체"
          onClick={onClick}
          role="button"
          tabIndex={0}
        />,
      )

      fireEvent.click(screen.getByText('전체'))

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('Enter/Space 키로 onClick 을 트리거한다 (키보드 접근성)', () => {
      const onClick = vi.fn()
      render(
        <TagChip
          label="범위"
          value="전체"
          onClick={onClick}
          role="button"
          tabIndex={0}
        />,
      )
      // label + value 조합의 정확한 접근성 이름 문자열(콜론 구분자는 aria-hidden 이라 이름
      // 계산에서 제외됨)에 결합하지 않도록 role 만으로 조회한다 — 이 렌더에는 제거 버튼이
      // 없어 role="button" 요소가 유일하다.
      const pressable = screen.getByRole('button')

      fireEvent.keyDown(pressable, { key: 'Enter' })
      fireEvent.keyDown(pressable, { key: ' ' })

      expect(onClick).toHaveBeenCalledTimes(2)
    })

    it('다른 키 입력은 onClick 을 트리거하지 않는다', () => {
      const onClick = vi.fn()
      render(<TagChip value="전체" onClick={onClick} role="button" tabIndex={0} />)

      fireEvent.keyDown(screen.getByRole('button', { name: '전체' }), { key: 'Tab' })

      expect(onClick).not.toHaveBeenCalled()
    })

    // 이 패키지는 @testing-library/jest-dom 매처(toHaveAttribute 등)를 설정하지 않으므로
    // (다른 테스트 전체가 vanilla DOM API 사용) getAttribute 직접 비교로 통일한다.
    it('aria-pressed 를 누름 가능 영역에 전달한다', () => {
      render(<TagChip value="전체" onClick={() => undefined} role="button" tabIndex={0} aria-pressed />)
      expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('true')
    })

    it('aria-pressed 미전달 시 false 로 기본값을 채운다', () => {
      render(<TagChip value="전체" onClick={() => undefined} role="button" tabIndex={0} />)
      expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('false')
    })

    it('선택 상태를 data-state와 시각 클래스에 함께 반영한다', () => {
      render(<TagChip value="전체" onClick={() => undefined} role="button" tabIndex={0} aria-pressed />)
      const chip = screen.getByText('전체').closest('[data-state]')
      expect(chip?.getAttribute('data-state')).toBe('selected')
      expect(chip?.className).toContain('pressed')
    })

    it('aria-describedby 를 누름 가능 영역까지 전달한다(잠긴 사유 연결)', () => {
      render(
        <TagChip
          value="전체"
          onClick={() => undefined}
          role="button"
          tabIndex={0}
          aria-describedby="scope-hint-id"
        />,
      )
      expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-describedby')).toBe('scope-hint-id')
    })

    it('role="button" 요소 내부에 제거 <button> 이 중첩되지 않는다 (ARIA 위반 해소)', () => {
      render(
        <TagChip
          value="전체"
          removeLabel="전체 범위"
          onClick={() => undefined}
          onRemove={() => undefined}
          role="button"
          tabIndex={0}
        />,
      )
      const pressable = screen.getByRole('button', { name: '전체' })
      const removeButton = screen.getByRole('button', { name: '전체 범위 제거' })
      expect(pressable.contains(removeButton)).toBe(false)
    })
  })

  it('onClick 없이 onRemove 만 있는 read-only 선택 chip 은 종전과 동일하게 렌더한다(회귀 없음)', () => {
    const onRemove = vi.fn()
    render(<TagChip label="계좌" value="국민 123-456" onRemove={onRemove} />)
    // 누름 가능 wrapper 가 없어야 하며, 접근성 트리에는 제거 버튼 하나만 존재한다.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '국민 123-456 제거' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
