import { Modal } from '@samhan/design-system'
import { useEffect, useState } from 'react'
import type { StockLedgerResponse, StockLedgerRow } from '../../api/inventory'

export function StockLedgerModal({
  open,
  data,
  onClose,
  onRangeChange,
  onOpenSlip,
}: {
  open: boolean
  data: StockLedgerResponse | undefined
  onClose: () => void
  onRangeChange: (startDate: string, endDate: string) => void
  onOpenSlip?: (slipNo: string, slipType: 'INBOUND' | 'OUTBOUND') => void
}) {
  const [startDate, setStartDate] = useState(data?.startDate ?? '')
  const [endDate, setEndDate] = useState(data?.endDate ?? '')
  useEffect(() => {
    if (data) {
      setStartDate(data.startDate)
      setEndDate(data.endDate)
    }
  }, [data?.startDate, data?.endDate])
  if (!data) {
    return <Modal open={open} onClose={onClose} title="재고수불부" ><p>내역을 불러오는 중입니다.</p></Modal>
  }

  const rows: StockLedgerRow[] = [
    {
      date: data.startDate,
      productName: data.productName,
      productCode: data.productCode,
      warehouseName: '',
      partnerName: '',
      description: '전일재고',
      locationTag: null,
      inboundQuantity: 0,
      outboundQuantity: 0,
      balance: data.openingBalance,
      opening: true,
    },
    ...data.rows,
  ]

  const submitRange = () => onRangeChange(startDate, endDate)
  const renderDescription = (row: StockLedgerRow) => {
    return <>{row.locationTag ? <strong>{row.locationTag}</strong> : null}{row.locationTag ? ' ' : ''}{row.description}</>
  }
  const renderSlipNo = (row: StockLedgerRow) => {
    if (!row.slipNo || !row.slipType || !onOpenSlip) return null
    return <button type="button" aria-label={`전표 ${row.slipNo} 열기`} onClick={() => onOpenSlip(row.slipNo!, row.slipType!)} style={slipLinkStyle}>{row.slipNo}</button>
  }

  return (
    <Modal open={open} onClose={onClose} title="재고수불부" size="xxl">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>{data.companyName} / {data.startDate} ~ {data.endDate} / 재고수불부 I / {data.productName} ({data.productCode})</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-label="수불부 기간">
          <input aria-label="시작일" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span>~</span>
          <input aria-label="종료일" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button type="button" onClick={submitRange}>조회</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{['일자', '품목명', '품목코드', '창고명', '거래처명', '적요', '전표번호', '입고수량', '출고수량', '재고수량'].map((label) => <th key={label} style={cellHeaderStyle}>{label}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => <tr key={`${row.date}-${index}`}>
              <td style={cellStyle}>{row.opening ? '' : row.date.split('-').join('/')}</td>
              <td style={cellStyle}>{row.opening ? '' : row.productName}</td>
              <td style={cellStyle}>{row.opening ? '' : row.productCode}</td>
              <td style={cellStyle}>{row.warehouseName}</td>
              <td style={cellStyle}>{row.partnerName}</td>
              <td style={cellStyle}>{row.opening ? '전일재고' : renderDescription(row)}</td>
              <td style={cellStyle}>{row.opening ? '' : renderSlipNo(row)}</td>
              <td style={cellStyle}>{row.inboundQuantity || ''}</td>
              <td style={cellStyle}>{row.outboundQuantity || ''}</td>
              <td style={cellStyle}>{row.balance}</td>
            </tr>)}
            <tr><td style={cellStyle} colSpan={7}>{data.endDate.slice(0, 7).replace('-', '/')} 계</td><td style={cellStyle}>{data.totalInbound}</td><td style={cellStyle}>{data.totalOutbound}</td><td style={cellStyle}>{data.closingBalance}</td></tr>
            <tr><td style={cellStyle} colSpan={7}>합계</td><td style={cellStyle}>{data.totalInbound}</td><td style={cellStyle}>{data.totalOutbound}</td><td style={cellStyle}>{data.closingBalance}</td></tr>
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

const cellStyle = { borderBottom: '1px solid #E5E7EB', padding: '6px 8px', textAlign: 'left' as const, whiteSpace: 'nowrap' as const }
const cellHeaderStyle = { ...cellStyle, background: '#F7F8FA', fontWeight: 600 }
const slipLinkStyle = { border: 0, padding: 0, background: 'transparent', color: '#185B86', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }
