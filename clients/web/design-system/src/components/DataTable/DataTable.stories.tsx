import type { Meta, StoryObj } from '@storybook/react'
import { DataTable, type DataTableColumn } from './DataTable'
import { Badge, type BadgeVariant } from '../Badge/Badge'

interface ProductRow {
  id: string
  name: string
  modelName: string
  sellingPrice: number
  status: 'ACTIVE' | 'DISCONTINUED' | 'RECALL'
}

const productRows: ProductRow[] = [
  {
    id: 'p-001',
    name: '시스템 에어컨 4-way',
    modelName: 'AC180RXADKG',
    sellingPrice: 2890000,
    status: 'ACTIVE',
  },
  {
    id: 'p-002',
    name: '스탠드형 에어컨 18평',
    modelName: 'AF18BX878',
    sellingPrice: 1990000,
    status: 'ACTIVE',
  },
  {
    id: 'p-003',
    name: '벽걸이 에어컨 7평 (구형)',
    modelName: 'AR07T9170HA',
    sellingPrice: 690000,
    status: 'DISCONTINUED',
  },
]

const statusVariant: Record<ProductRow['status'], BadgeVariant> = {
  ACTIVE: 'success',
  DISCONTINUED: 'neutral',
  RECALL: 'danger',
}

const productColumns: DataTableColumn<ProductRow>[] = [
  { key: 'id', header: 'ID', width: '90px' },
  { key: 'name', header: '제품명' },
  { key: 'modelName', header: '모델명', width: '160px' },
  {
    key: 'sellingPrice',
    header: '판매가',
    align: 'right',
    width: '140px',
    render: (row) => `₩${row.sellingPrice.toLocaleString('ko-KR')}`,
  },
  {
    key: 'status',
    header: '상태',
    align: 'center',
    width: '120px',
    render: (row) => (
      <Badge variant={statusVariant[row.status]}>{row.status}</Badge>
    ),
  },
]

const mobilePriorityColumns: DataTableColumn<ProductRow>[] = [
  { key: 'id', header: 'ID', width: '90px', mobilePriority: 'hidden' },
  { key: 'name', header: '제품명', mobilePriority: 'primary' },
  { key: 'modelName', header: '모델명', width: '160px', mobilePriority: 'secondary' },
  {
    key: 'sellingPrice',
    header: '판매가',
    align: 'right',
    width: '140px',
    mobilePriority: 'secondary',
    render: (row) => `₩${row.sellingPrice.toLocaleString('ko-KR')}`,
  },
  {
    key: 'status',
    header: '상태',
    align: 'center',
    width: '120px',
    mobilePriority: 'secondary',
    render: (row) => (
      <Badge variant={statusVariant[row.status]}>{row.status}</Badge>
    ),
  },
]

const meta: Meta<typeof DataTable<ProductRow>> = {
  title: 'Components/DataTable',
  component: DataTable<ProductRow>,
}
export default meta

type Story = StoryObj<typeof DataTable<ProductRow>>

export const Empty: Story = {
  render: () => (
    <DataTable<ProductRow>
      columns={productColumns}
      rows={[]}
      rowKey={(r) => r.id}
      emptyMessage="등록된 제품이 없습니다."
    />
  ),
}

export const WithProducts: Story = {
  name: '제품 행 + Badge 렌더',
  render: () => (
    <DataTable<ProductRow>
      columns={productColumns}
      rows={productRows}
      rowKey={(r) => r.id}
      onRowClick={(r) => alert(`clicked: ${r.id}`)}
    />
  ),
}

export const MobilePriorityCards: Story = {
  name: '모바일 카드 우선순위',
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  render: () => (
    <DataTable<ProductRow>
      columns={mobilePriorityColumns}
      rows={productRows}
      rowKey={(r) => r.id}
      onRowClick={(r) => alert(`clicked: ${r.id}`)}
    />
  ),
}

export const Loading: Story = {
  render: () => (
    <DataTable<ProductRow>
      columns={productColumns}
      rows={productRows}
      rowKey={(r) => r.id}
      loading
    />
  ),
}

export const LoadingEmpty: Story = {
  name: '로딩 중 (행 없음)',
  render: () => (
    <DataTable<ProductRow>
      columns={productColumns}
      rows={[]}
      rowKey={(r) => r.id}
      loading
    />
  ),
}
