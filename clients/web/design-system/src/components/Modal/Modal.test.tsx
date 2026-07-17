import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Modal } from './Modal'

/**
 * [#825 CM3] initialFocusRef 계약 — open 시 초기 포커스 대상.
 *
 * <p>배경: 소비처(BlockedPartnersPage)가 자체 rAF 로 입력란 포커스를 시도했으나
 * Modal 내부의 "첫 focusable 포커스" rAF 와 경합했다 (승자가 React passive effect
 * 순서 + rAF FIFO 라는 구현 세부에 의존 — 환경별 관측 상이). 결정적 계약으로 대체한다.
 */
describe('Modal initialFocusRef', () => {
  function Harness({ useInitialFocus }: { useInitialFocus: boolean }) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          열기
        </button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="테스트 모달"
          {...(useInitialFocus ? { initialFocusRef: inputRef } : {})}
        >
          <input ref={inputRef} aria-label="이름" />
        </Modal>
      </>
    )
  }

  it('기본(미지정)은 기존 동작 유지 — 포커스가 다이얼로그로 이동하고 본문 입력이 아니다', async () => {
    render(<Harness useInitialFocus={false} />)
    fireEvent.click(screen.getByRole('button', { name: '열기' }))

    // jsdom 은 layout 이 없어 offsetParent 가 항상 null → getFocusable 이 빈 배열이 되고
    // 기본 경로는 다이얼로그 컨테이너(tabIndex=-1) 자체를 포커스한다 (실브라우저는 닫기
    // 버튼). 환경 무관 계약: "다이얼로그 내부로 이동 + initialFocus 대상(입력)은 아님".
    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog.contains(document.activeElement)).toBe(true)
      expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: '이름' }))
    })
  })

  it('initialFocusRef 지정 시 해당 요소에 결정적으로 포커스한다', async () => {
    render(<Harness useInitialFocus={true} />)
    fireEvent.click(screen.getByRole('button', { name: '열기' }))

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '이름' }))
    })
  })

  it('다이얼로그 외부 요소 ref 는 무시하고 기본 동작으로 폴백한다 (focus trap 무결성)', async () => {
    function OutsideHarness() {
      const outsideRef = useRef<HTMLButtonElement>(null)
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" ref={outsideRef} onClick={() => setOpen(true)}>
            열기
          </button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="테스트 모달"
            initialFocusRef={outsideRef}
          >
            <input aria-label="이름" />
          </Modal>
        </>
      )
    }

    render(<OutsideHarness />)
    fireEvent.click(screen.getByRole('button', { name: '열기' }))

    // 외부 요소는 무시 → 기본 폴백(다이얼로그 내부). 열기 버튼(외부 ref 대상)에
    // 포커스가 남거나 이동하면 focus trap 위반 = RED.
    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog.contains(document.activeElement)).toBe(true)
      expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '열기' }))
    })
  })
})
