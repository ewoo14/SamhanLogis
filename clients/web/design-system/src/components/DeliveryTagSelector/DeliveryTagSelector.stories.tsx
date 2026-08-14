import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  DeliveryTagSelector,
  type DeliveryTagCode,
  type DeliveryTagOption,
} from './DeliveryTagSelector'

/**
 * Storybook 시나리오용 12개 배송태그 옵션 mock.
 * BE `DeliveryTagCode` enum 매핑과 동일하다.
 */
const ALL_OPTIONS: DeliveryTagOption[] = [
  { code: 'DAY', displayName: '당일', direction: 'OUTBOUND', autoMemo: false },
  { code: 'STACK', displayName: '야적', direction: 'OUTBOUND', autoMemo: true },
  { code: 'REGION', displayName: '지방', direction: 'OUTBOUND', autoMemo: true },
  { code: 'LOGEN', displayName: '로젠택배', direction: 'OUTBOUND', autoMemo: false },
  {
    code: 'GYEONGDONG_PARCEL',
    displayName: '경동택배',
    direction: 'OUTBOUND',
    autoMemo: false,
  },
  {
    code: 'GYEONGDONG_FREIGHT',
    displayName: '경동화물',
    direction: 'OUTBOUND',
    autoMemo: false,
  },
  { code: 'RENTAL', displayName: '대여', direction: 'OUTBOUND', autoMemo: false },
  {
    code: 'RETURN_RENTAL',
    displayName: '반납',
    direction: 'OUTBOUND',
    autoMemo: false,
  },
  {
    code: 'PURCHASE',
    displayName: '구매',
    direction: 'INBOUND',
    autoMemo: false,
  },
  {
    code: 'RETURN_TRIP',
    displayName: '회차',
    direction: 'INBOUND',
    autoMemo: false,
  },
  { code: 'RETURN', displayName: '반품', direction: 'INBOUND', autoMemo: false },
  { code: 'BORROW', displayName: '차용', direction: 'INBOUND', autoMemo: false },
]

const meta: Meta<typeof DeliveryTagSelector> = {
  title: 'Components/DeliveryTagSelector',
  component: DeliveryTagSelector,
}
export default meta

type Story = StoryObj<typeof DeliveryTagSelector>

/**
 * direction=OUTBOUND — 출고 전용 8개 옵션이 노출된다.
 * (DAY/STACK/REGION/LOGEN/GYEONGDONG_PARCEL/GYEONGDONG_FREIGHT/RENTAL/RETURN_RENTAL)
 */
export const OutboundOptions: Story = {
  name: '출고 옵션 (8종)',
  render: () => {
    const [value, setValue] = useState<DeliveryTagCode | null>(null)
    return (
      <DeliveryTagSelector
        options={ALL_OPTIONS}
        value={value}
        onChange={(code) => setValue(code)}
        direction="OUTBOUND"
        label="출고 배송태그"
      />
    )
  },
}

/**
 * direction=INBOUND — 입고 전용 3개 옵션만 노출.
 * (PURCHASE/RETURN_TRIP/RETURN/BORROW)
 */
export const InboundOptions: Story = {
  name: '입고 옵션 (4종)',
  render: () => {
    const [value, setValue] = useState<DeliveryTagCode | null>(null)
    return (
      <DeliveryTagSelector
        options={ALL_OPTIONS}
        value={value}
        onChange={(code) => setValue(code)}
        direction="INBOUND"
        label="입고 배송태그"
      />
    )
  },
}

/**
 * 야적(STACK) 미리 선택 + slipDate 제공.
 * autoMemo 미리보기 chip 이 inline 으로 노출되어 실제 일자 메모를 보여준다.
 */
export const StackSelected_AutoMemoPreview: Story = {
  name: '야적 선택 — 자동 메모 미리보기',
  render: () => {
    const [value, setValue] = useState<DeliveryTagCode | null>('STACK')
    return (
      <DeliveryTagSelector
        options={ALL_OPTIONS}
        value={value}
        onChange={(code) => setValue(code)}
        direction="OUTBOUND"
        slipDate="2026-05-04"
        label="출고 배송태그"
      />
    )
  },
}

/**
 * 에러 상태 — FormField 의 빨간 outline + 에러 텍스트.
 */
export const WithError: Story = {
  name: '에러 메시지',
  render: () => {
    const [value, setValue] = useState<DeliveryTagCode | null>(null)
    return (
      <DeliveryTagSelector
        options={ALL_OPTIONS}
        value={value}
        onChange={(code) => setValue(code)}
        direction="OUTBOUND"
        error="배송태그를 선택해야 합니다"
      />
    )
  },
}

/**
 * 비활성 상태 — 수락 이후 단계에서 잠금된 시나리오 시뮬레이션.
 * 이미 선택된 값(GYEONGDONG_FREIGHT)은 표시되며 변경 불가.
 */
export const Disabled: Story = {
  name: '비활성 (수락 후 잠금)',
  render: () => (
    <DeliveryTagSelector
      options={ALL_OPTIONS}
      value="GYEONGDONG_FREIGHT"
      onChange={() => undefined}
      direction="OUTBOUND"
      disabled
    />
  ),
}

/**
 * 지방(REGION) — slipDate 미제공 시 placeholder 형태 메모 표시.
 */
export const RegionWithoutDate: Story = {
  name: '지방 선택 — 일자 미제공 (placeholder 메모)',
  render: () => {
    const [value, setValue] = useState<DeliveryTagCode | null>('REGION')
    return (
      <DeliveryTagSelector
        options={ALL_OPTIONS}
        value={value}
        onChange={(code) => setValue(code)}
        direction="OUTBOUND"
      />
    )
  },
}
