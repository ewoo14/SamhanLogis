import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Tabs } from './Tabs'

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
}
export default meta

type Story = StoryObj<typeof Tabs>

const PARTNER_TABS = ['기본정보', '단가/할인 정책', '배송지', '담당자'] as const

export const 거래처4탭: Story = {
  render: () => {
    const [activeIndex, setActiveIndex] = useState(0)
    return (
      <Tabs
        tabs={PARTNER_TABS}
        activeIndex={activeIndex}
        onTabChange={setActiveIndex}
        ariaLabel="거래처 등록 탭"
      >
        <div>기본정보 패널 — 거래처 코드, 상호, 사업자번호, 주소, 유형</div>
        <div>단가/할인 정책 패널 — 기본할인율, 결제기간, 신용한도</div>
        <div>배송지 패널 — 다중 배송지 목록</div>
        <div>담당자 패널 — 다중 담당자 목록</div>
      </Tabs>
    )
  },
}

export const 비활성탭포함: Story = {
  render: () => {
    const [activeIndex, setActiveIndex] = useState(0)
    const tabs = [
      { label: '기본정보' },
      { label: '단가/할인 정책' },
      { label: '배송지', disabled: true },
      { label: '담당자' },
    ]
    return (
      <Tabs
        tabs={tabs}
        activeIndex={activeIndex}
        onTabChange={setActiveIndex}
        ariaLabel="비활성 탭 예시"
      >
        <div>기본정보</div>
        <div>단가/할인</div>
        <div>배송지 (비활성)</div>
        <div>담당자</div>
      </Tabs>
    )
  },
}
