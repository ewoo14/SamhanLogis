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

/**
 * PR #921 chore-B SONNET5 R4 — CODEX SOL 2차 적대검증 A-1 RED-first 회귀 게이트.
 *
 * 결함: R-3 가 `Modal.module.css` `@media print` 에 넣은 `.header,.description,.footer
 * {display:none}` 이 모든 Modal 소비처에 무차별 적용됐다. `SlipDetailModal`(body 에 자체
 * 인쇄 대상 문서 보유)엔 맞지만, `AddVehicleModal` 처럼 크롬이 곧 내용인 일반 모달에선
 * 제목·설명·조작부가 인쇄물에서 통째로 사라진다.
 *
 * fix: `printableBody` opt-in prop → `[role=dialog]` 에 `data-print-document` 속성을
 * 부여하고, CSS 의 크롬 숨김 규칙을 그 속성이 있을 때만 발동하도록 스코프한다. 여기서는
 * (jsdom 이 `@media print` 캐스케이드를 적용하지 않으므로) prop→DOM 속성 배선만 빠르게
 * 검증한다 — 실제 인쇄 CSS 발동 여부는 playwright/choreb-sonnet-r4-real-qa 가 확인한다.
 */
describe('Modal printableBody — PR #921 SOL 2차 A-1', () => {
  it('기본값(미지정)은 문서-모달 표지를 부여하지 않는다 — 크롬이 곧 내용인 일반 모달의 안전한 기본값', () => {
    render(
      <Modal
        open
        onClose={() => undefined}
        title="차량 추가"
        description="배차에 사용할 차종과 톤수를 선택하세요."
        footer={<button type="button">추가</button>}
      >
        <div>본문</div>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.hasAttribute('data-print-document'), '기본값에서 문서-모달 표지가 붙었다(일반 모달 회귀 위험)').toBe(false)
  })

  it('printableBody=true 지정 시 문서-모달 표지 속성이 붙는다 — SlipDetailModal opt-in 계약', () => {
    render(
      <Modal
        open
        onClose={() => undefined}
        title="출고전표 2026/01/01-1"
        description="출고전표 미리보기"
        printableBody
        footer={<button type="button">닫기</button>}
      >
        <div>문서</div>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('data-print-document'), 'printableBody=true 인데 문서-모달 표지가 없다').toBe('true')
  })
})
