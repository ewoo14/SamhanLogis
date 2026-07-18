import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
