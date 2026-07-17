import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Modal } from './Modal'
import { Button } from '../Button/Button'
import { Input } from '../Input/Input'

const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
}
export default meta

type Story = StoryObj<typeof Modal>

export const Basic: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>모달 열기</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="삭제 확인"
          description="이 의뢰서를 정말 삭제하시겠습니까?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>취소</Button>
              <Button variant="danger" onClick={() => setOpen(false)}>삭제</Button>
            </>
          }
        >
          <p>삭제된 항목은 복구할 수 없습니다.</p>
        </Modal>
      </>
    )
  },
}

export const WithForm: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>거래처 추가</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="거래처 추가"
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>취소</Button>
              <Button onClick={() => setOpen(false)}>저장</Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="거래처명" required placeholder="(주)삼한물류" />
            <Input label="대표자" placeholder="홍길동" />
            <Input label="이메일" type="email" placeholder="contact@example.com" />
          </div>
        </Modal>
      </>
    )
  },
}

export const Large: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>큰 모달</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="상세 보기" size="lg">
          <p>큰 사이즈 모달 콘텐츠 영역입니다.</p>
        </Modal>
      </>
    )
  },
}

/**
 * [#825 CM3] `initialFocusRef` — open 시 초기 포커스를 지정 요소(첫 입력란)로.
 * 미지정 시 기본은 첫 focusable(닫기 버튼)이다. 소비처 로컬 rAF 경합 패턴 대체.
 */
export const InitialFocus: Story = {
  render: function InitialFocusStory() {
    const [open, setOpen] = useState(false)
    const nameInputRef = useRef<HTMLInputElement>(null)
    return (
      <>
        <Button onClick={() => setOpen(true)}>초기 포커스 모달</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="거래처 검색"
          description="열리면 거래처명 입력란에 바로 포커스됩니다."
          initialFocusRef={nameInputRef}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>취소</Button>
              <Button onClick={() => setOpen(false)}>확인</Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input ref={nameInputRef} label="거래처명" required placeholder="거래처명 또는 코드 검색" />
            <Input label="차단 사유" placeholder="예: 장기 미수금" />
          </div>
        </Modal>
      </>
    )
  },
}
