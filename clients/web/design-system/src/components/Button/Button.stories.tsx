import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: '확인',
    variant: 'primary',
    size: 'md',
  },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger', 'warning'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    fullWidth: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof Button>

export const Primary: Story = { args: { variant: 'primary' } }
export const Secondary: Story = { args: { variant: 'secondary', children: '취소' } }
export const Ghost: Story = { args: { variant: 'ghost', children: '더 보기' } }
export const Danger: Story = { args: { variant: 'danger', children: '삭제' } }
export const Warning: Story = { args: { variant: 'warning', children: '주의' } }

export const Small: Story = { args: { size: 'sm' } }
export const Medium: Story = { args: { size: 'md' } }
export const Large: Story = { args: { size: 'lg' } }

export const Loading: Story = { args: { loading: true, children: '저장 중…' } }
export const Disabled: Story = { args: { disabled: true } }
export const FullWidth: Story = { args: { fullWidth: true, children: '전체 너비' } }

export const AllVariants: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Button {...args} variant="primary">primary</Button>
      <Button {...args} variant="secondary">secondary</Button>
      <Button {...args} variant="ghost">ghost</Button>
      <Button {...args} variant="danger">danger</Button>
      <Button {...args} variant="warning">warning</Button>
    </div>
  ),
}

export const AllSizes: Story = {
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Button {...args} size="sm">small</Button>
      <Button {...args} size="md">medium</Button>
      <Button {...args} size="lg">large</Button>
    </div>
  ),
}
