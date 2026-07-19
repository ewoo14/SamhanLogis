import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Badge, Button, DataTable, type DataTableColumn } from '@samhan/design-system'
import {
  listSlipAllocationSources,
  type SlipAllocationSourceSummary,
} from '../api/slipAllocationSourceApi'

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
  partnerId: string | null
  partnerCode: string | null
  partnerName: string | null
}

export interface AllocationPartner {
  partnerId: string
  partnerCode: string
  partnerName: string
}

export type AllocationPartnerResolution =
  | { status: 'valid'; partner: AllocationPartner }
  | { status: 'missing'; message: string }
  | { status: 'multiple'; message: string }

export interface SlipLineAllocationEditorProps {
  sourceKind: AllocationSourceKind
  from: string
  to: string
  partnerId?: string
  rows: AllocationEditorRow[]
  onChange: (rows: AllocationEditorRow[]) => void
}

const numberFormatter = new Intl.NumberFormat('ko-KR')

const inputStyle: CSSProperties = {
  width: '100%',
}

function isNonBlank(value: string | null | undefined): value is string {
  return value != null && value.trim().length > 0
}

export function getDefaultAllocationRows(sourceKind: AllocationSourceKind): AllocationEditorRow[] {
  void sourceKind
  return []
}

export function resolveAllocationPartner(rows: AllocationEditorRow[]): AllocationPartnerResolution {
  if (rows.length === 0) {
    return { status: 'missing', message: '배분할 원천 거래처를 확인할 수 없습니다.' }
  }

  const first = rows[0]
  if (!first) {
    return { status: 'missing', message: '원천 거래처를 확인할 수 없습니다.' }
  }

  if (rows.some((row) => !row.partnerId || !isNonBlank(row.partnerCode) || !isNonBlank(row.partnerName))) {
    return { status: 'missing', message: '원천 전표의 거래처 정보가 없어 저장할 수 없습니다.' }
  }

  const partnerIds = new Set(rows.map((row) => row.partnerId).filter((id): id is string => Boolean(id)))
  if (partnerIds.size > 1) {
    return { status: 'multiple', message: '서로 다른 거래처의 원천은 한 전표에 함께 배분할 수 없습니다.' }
  }

  if (!first.partnerId || !isNonBlank(first.partnerCode) || !isNonBlank(first.partnerName) || partnerIds.size === 0) {
    return { status: 'missing', message: '원천 전표의 거래처 정보가 없어 저장할 수 없습니다.' }
  }

  return {
    status: 'valid',
    partner: {
      partnerId: first.partnerId,
      partnerCode: first.partnerCode,
      partnerName: first.partnerName,
    },
  }
}

function toEditorRows(summaries: SlipAllocationSourceSummary[]): AllocationEditorRow[] {
  return summaries.flatMap((slip) =>
    slip.lines.map((line) => ({
      sourceSlipId: slip.slipId,
      sourceSlipNo: slip.slipNo,
      sourceLineId: line.lineId,
      sourceLineNo: line.lineNo,
      productCode: line.productCode,
      productName: line.productName,
      sourceQty: line.quantity,
      sourceAmount: Number(line.lineTotal),
      allocatedQty: 0,
      allocatedAmount: 0,
      partnerId: slip.partnerId,
      partnerCode: slip.partnerCode,
      partnerName: slip.partnerName,
    })),
  )
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
  from,
  to,
  partnerId,
  rows,
  onChange,
}: SlipLineAllocationEditorProps) {
  const [isLoadingSources, setIsLoadingSources] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadSources = useCallback(async () => {
    setIsLoadingSources(true)
    setLoadError(null)
    try {
      const sources = await listSlipAllocationSources({
        type: sourceKind,
        from,
        to,
        partnerId,
      })
      onChange(toEditorRows(sources))
    } catch (error) {
      console.error('[SlipLineAllocationEditor] source slip search failed', error)
      setLoadError('배분 가능한 전표 라인을 불러오지 못했습니다.')
    } finally {
      setIsLoadingSources(false)
    }
  }, [from, onChange, partnerId, sourceKind, to])

  useEffect(() => {
    void loadSources()
  }, [loadSources])

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
          disabled={isLoadingSources}
          onClick={() => void loadSources()}
        >
          {isLoadingSources ? '검색 중' : '전표 검색'}
        </Button>
      </div>
      {loadError ? (
        <p style={{ margin: '0 0 8px', color: 'var(--state-danger)', fontSize: 12 }}>
          {loadError}
        </p>
      ) : null}
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
