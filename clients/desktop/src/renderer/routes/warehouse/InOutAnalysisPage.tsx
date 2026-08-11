import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Card } from '@samhan/design-system'
import { listInOutAnalysis, type InOutAnalysisRow as ApiRow } from '../../api/inventory'
import { InOutModelChipFilter } from './InOutModelChipFilter'
import { deriveLegacyAnalysis, filterInOutRows, modelChips, withProfitFields, type InOutAnalysisRow, type ModelChip } from './inoutAnalysisModel'
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
    monthly: row.monthly,
  })
}

const cardStyle = { padding: 16, marginTop: 16 } as const
const number = (value: number | null) => value === null ? '—' : value.toLocaleString('ko-KR')

/** 확정 입출고 내역과 매입·판매 차액 이익률을 모델코드별로 표시한다. */
export function InOutAnalysisPage() {
  usePageTitle('입출고 내역·분석')
  const [dateFrom, setDateFrom] = useState('2025-01-01')
  const [dateTo, setDateTo] = useState('2026-12-31')
  const [selected, setSelected] = useState<Set<ModelChip>>(new Set())
  const query = useQuery({ queryKey: ['inout-analysis', dateFrom, dateTo], queryFn: () => listInOutAnalysis(dateFrom, dateTo) })
  const rows = useMemo(() => (query.data ?? []).map(toRow), [query.data])
  const visible = useMemo(() => filterInOutRows(rows, selected), [rows, selected])
  const legacyAnalysis = useMemo(() => deriveLegacyAnalysis(visible), [visible])
  const monthlyPointCount = useMemo(() => visible.reduce((total, row) => total + (row.monthly?.length ?? 0), 0), [visible])
  const counts = useMemo(() => {
    const all = Object.fromEntries(['실외기', '실내기', '홈멀티', '싱글중대형', '상업멀티', '판넬', '미분류'].map((chip) => [chip, filterInOutRows(rows, new Set([chip as ModelChip])).length]))
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
      <Card style={cardStyle} data-testid="inout-month-dimension">
        <h2 style={{ margin: 0, fontSize: 16 }}>월 차원</h2>
        <p data-testid="inout-month-point-count" style={{ marginBottom: 0 }}>
          화면 표현 월 점수 <strong>{number(monthlyPointCount)}</strong> / 시드 기준 확인값 79
        </p>
        <small>조회 결과의 모델·연·월 실측 수량을 집계한 값입니다. 원본 XLSX는 현재 워크트리에 없어 실 원본 판정은 보류입니다.</small>
      </Card>
      {!query.isLoading && !query.isError ? <>
        <Card style={cardStyle} data-testid="inout-legacy-trend">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>전년·당년 출고 추이</h2>
            <Badge variant="brand">{legacyAnalysis.trend.length}개월</Badge>
          </div>
          <table style={{ width: '100%', marginTop: 12 }}><thead><tr><th>월</th><th>전년 출고</th><th>당년 출고</th></tr></thead>
            <tbody>{legacyAnalysis.trend.map((point) => <tr key={point.month}><td>{point.month}월</td><td>{number(point.previousYearOutbound)}</td><td>{number(point.currentYearOutbound)}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card style={cardStyle} data-testid="inout-legacy-forecast">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h2 style={{ margin: 0, fontSize: 16 }}>수요예측</h2><Badge variant="warning">{legacyAnalysis.forecast.length}건</Badge></div>
          <p>전년 {legacyAnalysis.previousYear ?? '—'} → 당년 {legacyAnalysis.currentYear ?? '—'} 증감률 {legacyAnalysis.forecastRate.toFixed(2)}배</p>
          {legacyAnalysis.forecast.length > 0 ? <table style={{ width: '100%' }}><thead><tr><th>예측월</th><th>예측 출고량</th></tr></thead><tbody>{legacyAnalysis.forecast.map((point) => <tr key={point.month}><td>{point.month}월</td><td>{number(point.quantity)}</td></tr>)}</tbody></table> : <p>산출 대상 월 없음</p>}
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card style={cardStyle} data-testid="inout-legacy-top3"><div style={{ display: 'flex', justifyContent: 'space-between' }}><h2 style={{ margin: 0, fontSize: 16 }}>Top 3</h2><Badge variant="success">{legacyAnalysis.top3.length}건</Badge></div><ol>{legacyAnalysis.top3.map((item) => <li key={item.modelCode}>{item.productName} <strong>{number(item.outboundQuantity)}</strong></li>)}</ol></Card>
          <Card style={cardStyle} data-testid="inout-legacy-bottom3"><div style={{ display: 'flex', justifyContent: 'space-between' }}><h2 style={{ margin: 0, fontSize: 16 }}>Bottom 3</h2><Badge variant="neutral">{legacyAnalysis.bottom3.length}건</Badge></div><ol>{legacyAnalysis.bottom3.map((item) => <li key={item.modelCode}>{item.productName} <strong>{number(item.outboundQuantity)}</strong></li>)}</ol></Card>
        </div>
        <Card style={cardStyle} data-testid="inout-legacy-recommendations"><div style={{ display: 'flex', justifyContent: 'space-between' }}><h2 style={{ margin: 0, fontSize: 16 }}>추천·알림</h2><Badge variant="danger">{legacyAnalysis.recommendations.length}건</Badge></div>{legacyAnalysis.recommendations.map((item) => <p key={item.text}><strong>{item.text}</strong><br /><small>{item.detail}</small></p>)}</Card>
      </> : null}
      {query.isLoading ? <p>조회 중…</p> : null}
      {query.isError ? <p role="alert">입출고 내역을 불러오지 못했습니다.</p> : null}
      <table style={{ width: '100%', marginTop: 16 }}>
        <thead><tr><th>모델코드</th><th>품목명</th><th>입고수량</th><th>출고수량</th><th>매입금액</th><th>판매금액</th><th>이익금액</th><th>이익률</th></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.modelCode}><td>{row.modelCode}</td><td>{row.productName}</td><td>{row.inboundQuantity.toLocaleString()}</td><td>{row.outboundQuantity.toLocaleString()}</td><td>{row.purchaseAmount === null ? '—' : row.purchaseAmount.toLocaleString()}</td><td>{row.salesAmount.toLocaleString()}</td><td>{row.profitAmount === null ? '—' : row.profitAmount.toLocaleString()}</td><td data-testid={`profit-rate-${row.modelCode}`}>{row.profitRateDisplay}</td></tr>)}</tbody>
      </table>
    </section>
  )
}
