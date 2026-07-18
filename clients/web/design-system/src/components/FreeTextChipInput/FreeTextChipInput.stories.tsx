import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { FreeTextChipInput } from './FreeTextChipInput'

const meta: Meta<typeof FreeTextChipInput> = {
  title: 'Components/FreeTextChipInput',
  component: FreeTextChipInput,
  args: {
    value: ['연차', '반차'],
    ariaLabel: '선택 옵션',
    placeholder: '옵션 입력 후 Enter',
  },
}

export default meta

type Story = StoryObj<typeof meta>

function StatefulFreeTextStory({ args }: { args: Partial<ComponentProps<typeof FreeTextChipInput>> }) {
  const [value, setValue] = useState(args.value ?? [])
  return <FreeTextChipInput {...args} value={value} onChange={setValue} />
}

export const 기본: Story = {}

export const 편집가능: Story = {
  render: (args) => <StatefulFreeTextStory args={args} />,
}

export const 최대길이: Story = {
  ...편집가능,
  args: { ...기본.args, value: [], maxLength: 12 },
}
