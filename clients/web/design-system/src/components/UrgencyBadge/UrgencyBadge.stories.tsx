import type { Meta, StoryObj } from '@storybook/react'
import { UrgencyBadge, calcUrgencyLevel } from './UrgencyBadge'

const meta: Meta<typeof UrgencyBadge> = {
  title: 'Components/UrgencyBadge',
  component: UrgencyBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    level: {
      control: 'select',
      options: ['CRITICAL', 'DANGER', 'WARNING', 'NOTICE'],
      description: '안전재고 긴급도 단계',
    },
  },
}

export default meta

type Story = StoryObj<typeof UrgencyBadge>

export const Critical: Story = {
  args: { level: 'CRITICAL' },
}

export const Danger: Story = {
  args: { level: 'DANGER' },
}

export const Warning: Story = {
  args: { level: 'WARNING' },
}

export const Notice: Story = {
  args: { level: 'NOTICE' },
}

/** 4단계 전체 나란히 표시 */
export const AllLevels: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <UrgencyBadge level="CRITICAL" />
      <UrgencyBadge level="DANGER" />
      <UrgencyBadge level="WARNING" />
      <UrgencyBadge level="NOTICE" />
    </div>
  ),
}

/**
 * calcUrgencyLevel 함수 예시 — 재고 충족률 기준 단계 자동 산출.
 * - currentQty=0,  threshold=100  → CRITICAL (0%)
 * - currentQty=30, threshold=100  → DANGER   (30%)
 * - currentQty=60, threshold=100  → WARNING  (60%)
 * - currentQty=90, threshold=100  → NOTICE   (90%)
 */
export const CalcExample: Story = {
  render: () => {
    const cases: Array<{ cur: number; thr: number }> = [
      { cur: 0,  thr: 100 },
      { cur: 30, thr: 100 },
      { cur: 60, thr: 100 },
      { cur: 90, thr: 100 },
    ]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cases.map(({ cur, thr }) => {
          const level = calcUrgencyLevel(cur, thr)
          return (
            <div key={`${cur}-${thr}`} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: '#666', minWidth: 140 }}>
                재고 {cur} / 임계 {thr} ({Math.round((cur / thr) * 100)}%)
              </span>
              <UrgencyBadge level={level} />
            </div>
          )
        })}
      </div>
    )
  },
}
