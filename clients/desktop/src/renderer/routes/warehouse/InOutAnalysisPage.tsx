import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listInOutAnalysis, type InOutAnalysisRow as ApiRow } from '../../api/inventory'
import { InOutModelChipFilter } from './InOutModelChipFilter'
import { filterInOutRows, modelChips, withProfitFields, type InOutAnalysisRow, type ModelChip } from './inoutAnalysisModel'
import { usePageTitle } from '../../hooks/usePageTitle'

function toRow(row: ApiRow): InOutAnalysisRow {
  return withProfitFields({
    modelCode: row.modelCode,
    productName: row.productName,
    productCategory: row.categoryKey,
    chips: modelChips({ name: row.productName, productCategory: row.categoryKey }),
    inboundQuantity: row.inboundQuantity,
    outboundQuantity: row.outboundQuantity,
    purchaseAmount: row.purchaseAmount,
    salesAmount: row.salesAmount,
  })
}

/** 확정 입출고 내역과 매입·판매 차액 이익률을 모델코드별로 표시한다. */
export function InOutAnalysisPage() {
  usePageTitle('입출고 내역·분석')
  const [dateFrom, setDateFrom] = useState('2026-01-01')
  const [dateTo, setDateTo] = useState('2026-12-31')
  const [selected, setSelected] = useState<Set<ModelChip>>(new Set())
  const query = useQuery({ queryKey: ['inout-analysis', dateFrom, dateTo], queryFn: () => listInOutAnalysis(dateFrom, dateTo) })
  const rows = useMemo(() => (query.data ?? []).map(toRow), [query.data])
  const visible = useMemo(() => filterInOutRows(rows, selected), [rows, selected])
  const counts = useMemo(() => {
    const all = Object.fromEntries(['실외기', '실내기', '홈멀티', '싱글중대형', '상업멀티', '판넬'].map((chip) => [chip, filterInOutRows(rows, new Set([chip as ModelChip])).length]))
    return all as Record<ModelChip, number>
  }, [rows])
  return (
    <section style={{ padding: 24 }}>
      <h1>입출고 내역·분석</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 16 }}>
        <label>시작일<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label>종료일<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
      </div>
      <InOutModelChipFilter selected={selected} counts={counts} totalCount={rows.length}
        onToggle={(chip) => setSelected((old) => { const next = new Set(old); if (next.has(chip)) { next.delete(chip) } else { next.add(chip) } return next })}
        onClear={() => setSelected(new Set())} />
      {query.isLoading ? <p>조회 중…</p> : null}
      {query.isError ? <p role="alert">입출고 내역을 불러오지 못했습니다.</p> : null}
      <table style={{ width: '100%', marginTop: 16 }}>
        <thead><tr><th>모델코드</th><th>품목명</th><th>입고수량</th><th>출고수량</th><th>매입금액</th><th>판매금액</th><th>이익금액</th><th>이익률</th></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.modelCode}><td>{row.modelCode}</td><td>{row.productName}</td><td>{row.inboundQuantity.toLocaleString()}</td><td>{row.outboundQuantity.toLocaleString()}</td><td>{row.purchaseAmount === null ? '—' : row.purchaseAmount.toLocaleString()}</td><td>{row.salesAmount.toLocaleString()}</td><td>{row.profitAmount === null ? '—' : row.profitAmount.toLocaleString()}</td><td data-testid={`profit-rate-${row.modelCode}`}>{row.profitRateDisplay}</td></tr>)}</tbody>
      </table>
    </section>
  )
}
