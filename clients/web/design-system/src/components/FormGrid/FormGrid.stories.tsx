import type { Meta, StoryObj } from '@storybook/react'
import { FormGrid } from './FormGrid'
import { Input } from '../Input/Input'

const meta: Meta<typeof FormGrid> = {
  title: 'Components/FormGrid',
  component: FormGrid,
}
export default meta

type Story = StoryObj<typeof FormGrid>

export const TwoColumns: Story = {
  render: () => (
    <FormGrid>
      <Input label="거래처명" placeholder="(주)삼한공조시스템" />
      <Input label="사업자등록번호" placeholder="123-45-67890" />
      <FormGrid.Full>
        <Input label="사업장 주소" placeholder="서울특별시 서초구 마방로2길 9" />
      </FormGrid.Full>
      <Input label="대표 전화" placeholder="02-3461-0000" />
      <Input label="이메일" placeholder="accounting@example.com" />
    </FormGrid>
  ),
}

export const ThreeColumns: Story = {
  render: () => (
    <FormGrid columns={3}>
      <Input label="예금주" placeholder="김삼한" />
      <Input label="은행명" placeholder="국민은행" />
      <Input label="계좌번호" placeholder="000000-00-000000" />
      <FormGrid.Full>
        <Input label="비고" placeholder="세금계산서 기본 입금계좌" />
      </FormGrid.Full>
    </FormGrid>
  ),
}
