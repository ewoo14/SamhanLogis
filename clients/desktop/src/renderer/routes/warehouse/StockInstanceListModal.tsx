import { Modal } from '@samhan/design-system'
import type { StockInstanceListRow, StockInstanceQuality } from '../../api/inventory'

const QUALITY_LABEL: Record<StockInstanceQuality, string> = {
  NORMAL: '정상',
  USED: '중고',
  DAMAGED: '파손',
  REPACKAGED: '재포장',
  BOX_DEFECT: '박스불량',
}

const QUALITY_VALUES = Object.keys(QUALITY_LABEL) as StockInstanceQuality[]

function barcodePattern(value: string): string[] {
  return Array.from(value).flatMap((char) => {
    const bits = char.charCodeAt(0).toString(2).padStart(7, '0')
    return bits.split('').map((bit) => bit === '1' ? '3px' : '1px')
  })
}

function SerialBarcode({ value }: { value: string }) {
  return (
    <span
      data-testid={`serial-barcode-${value}`}
      aria-label={`${value} 바코드`}
      style={{ display: 'inline-flex', height: 24, gap: 1, alignItems: 'stretch', padding: '0 2px' }}
    >
      {barcodePattern(value).map((width, index) => (
        <span key={`${value}-${index}`} style={{ width, background: '#111827' }} />
      ))}
    </span>
  )
}

export function StockInstanceListModal({
  open,
  productCode,
  rows,
  onClose,
  onQualityChange,
}: {
  open: boolean
  productCode: string
  rows: StockInstanceListRow[]
  onClose: () => void
  onQualityChange: (serialKey: string, quality: StockInstanceQuality) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={`품목리스트 · ${productCode}`}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['시리얼키', '창고', '재고 상태', '품목 상태'].map((label) => (
                <th key={label} style={cellHeaderStyle}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const locked = row.status === 'SHIPPED'
              return (
                <tr key={row.serialKey}>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{row.serialKey}</span>
                      <SerialBarcode value={row.barcode} />
                    </div>
                  </td>
                  <td style={cellStyle}>{row.warehouseName} ({row.warehouseCode})</td>
                  <td style={cellStyle}>{row.status}</td>
                  <td style={cellStyle}>
                    <select
                      aria-label={`${row.serialKey} 품목 상태`}
                      value={row.quality}
                      disabled={locked}
                      onChange={(event) => onQualityChange(row.serialKey, event.target.value as StockInstanceQuality)}
                    >
                      {QUALITY_VALUES.map((quality) => (
                        <option key={quality} value={quality}>{QUALITY_LABEL[quality]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

const cellStyle = { borderBottom: '1px solid #E5E7EB', padding: '8px 10px', textAlign: 'left' as const }
const cellHeaderStyle = { ...cellStyle, background: '#F7F8FA', fontWeight: 600 }
