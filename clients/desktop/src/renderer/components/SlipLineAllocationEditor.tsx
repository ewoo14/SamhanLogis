import { useMemo, type CSSProperties } from 'react'
import { Badge, Button, DataTable, type DataTableColumn } from '@samhan/design-system'

export type AllocationSourceKind = 'OUTBOUND' | 'INBOUND'

export interface AllocationEditorRow {
  sourceSlipId: string
  sourceSlipNo: string
  sourceLineId: string
  sourceLineNo: number
  productCode: string
  productName: string
  sourceQty: number
  sourceAmount: number
  allocatedQty: number
  allocatedAmount: number
}

export interface SlipLineAllocationEditorProps {
  sourceKind: AllocationSourceKind
  rows: AllocationEditorRow[]
  onChange: (rows: AllocationEditorRow[]) => void
}

const numberFormatter = new Intl.NumberFormat('ko-KR')

const MOCK_OUTBOUND_LINES: AllocationEditorRow[] = [
  {
    sourceSlipId: '11111111-1111-4111-8111-111111111111',
    sourceSlipNo: 'OUT-20260520-014',
    sourceLineId: '21111111-1111-4111-8111-111111111111',
    sourceLineNo: 1,
    productCode: 'SKU-A100',
    productName: '표준 팔레트 A',
    sourceQty: 6,
    sourceAmount: 750000,
    allocatedQty: 0,
    allocatedAmount: 0,
  },
  {
    sourceSlipId: '11111111-1111-4111-8111-111111111112',
    sourceSlipNo: 'OUT-20260520-018',
    sourceLineId: '21111111-1111-4111-8111-111111111112',
    sourceLineNo: 1,
    productCode: 'SKU-A100',
    productName: '표준 팔레트 A',
    sourceQty: 4,
    sourceAmount: 500000,
    allocatedQty: 0,
    allocatedAmount: 0,
  },
]

const MOCK_INBOUND_LINES: AllocationEditorRow[] = [
  {
    sourceSlipId: '31111111-1111-4111-8111-111111111111',
    sourceSlipNo: 'IN-20260520-006',
    sourceLineId: '41111111-1111-4111-8111-111111111111',
    sourceLineNo: 1,
    productCode: 'PKG-B200',
    productName: '완충 포장재 B',
    sourceQty: 12,
    sourceAmount: 516000,
    allocatedQty: 0,
    allocatedAmount: 0,
  },
  {
    sourceSlipId: '31111111-1111-4111-8111-111111111112',
    sourceSlipNo: 'IN-20260520-011',
    sourceLineId: '41111111-1111-4111-8111-111111111112',
    sourceLineNo: 1,
    productCode: 'PKG-B200',
    productName: '완충 포장재 B',
    sourceQty: 8,
    sourceAmount: 344000,
    allocatedQty: 0,
    allocatedAmount: 0,
  },
]

const inputStyle: CSSProperties = {
  width: '100%',
}

export function getDefaultAllocationRows(sourceKind: AllocationSourceKind): AllocationEditorRow[] {
  return (sourceKind === 'OUTBOUND' ? MOCK_OUTBOUND_LINES : MOCK_INBOUND_LINES).map((row) => ({
    ...row,
  }))
}

function updateRow(
  rows: AllocationEditorRow[],
  sourceLineId: string,
  ratio: number,
): AllocationEditorRow[] {
  return rows.map((row) => {
    if (row.sourceLineId !== sourceLineId) return row
    const normalized = Math.max(0, Math.min(1.25, ratio))
    return {
      ...row,
      allocatedQty: Number((row.sourceQty * normalized).toFixed(2)),
      allocatedAmount: Math.round(row.sourceAmount * normalized),
    }
  })
}

export function SlipLineAllocationEditor({
  sourceKind,
  rows,
  onChange,
}: SlipLineAllocationEditorProps) {
  const totals = useMemo(() => {
    const allocated = rows.reduce((sum, row) => sum + row.allocatedAmount, 0)
    const source = rows.reduce((sum, row) => sum + row.sourceAmount, 0)
    return { allocated, source, remaining: source - allocated }
  }, [rows])

  const hasOverAllocation = totals.remaining < 0

  const columns: DataTableColumn<AllocationEditorRow>[] = [
    { key: 'sourceSlipNo', header: sourceKind === 'OUTBOUND' ? '출고전표' : '입고전표', width: '150px' },
    { key: 'productName', header: '품목' },
    {
      key: 'sourceQty',
      header: '원천 수량',
      align: 'right',
      width: '90px',
      render: (row) => numberFormatter.format(row.sourceQty),
    },
    {
      key: 'allocatedQty',
      header: '배분 수량',
      align: 'right',
      width: '90px',
      render: (row) => numberFormatter.format(row.allocatedQty),
    },
    {
      key: 'slider',
      header: '배분',
      width: '220px',
      render: (row) => (
        <input
          type="range"
          min={0}
          max={125}
          value={row.sourceAmount > 0 ? Math.round((row.allocatedAmount / row.sourceAmount) * 100) : 0}
          onChange={(e) => onChange(updateRow(rows, row.sourceLineId, Number(e.target.value) / 100))}
          style={inputStyle}
          aria-label={`${row.sourceSlipNo} 배분율`}
        />
      ),
    },
    {
      key: 'allocatedAmount',
      header: '배분 금액',
      align: 'right',
      width: '120px',
      render: (row) => `${numberFormatter.format(row.allocatedAmount)}원`,
    },
  ]

  return (
    <div data-testid="slip-line-allocation-editor">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong>{sourceKind === 'OUTBOUND' ? '출고전표 배분' : '입고전표 배분'}</strong>
          <Badge variant={hasOverAllocation ? 'danger' : 'success'}>
            잔여 {numberFormatter.format(totals.remaining)}원
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(getDefaultAllocationRows(sourceKind))}
        >
          검색 결과 초기화
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.sourceLineId}
        emptyMessage="배분 가능한 전표 라인이 없습니다."
      />
      {hasOverAllocation ? (
        <p style={{ margin: '8px 0 0', color: 'var(--state-danger)', fontSize: 12 }}>
          원천 금액보다 많이 배분되었습니다. 배분율을 낮춰 주세요.
        </p>
      ) : null}
    </div>
  )
}
