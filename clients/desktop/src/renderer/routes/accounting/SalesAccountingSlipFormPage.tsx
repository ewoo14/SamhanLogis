import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button, Card } from '@samhan/design-system'
import {
  getDefaultAllocationRows,
  SlipLineAllocationEditor,
  type AllocationEditorRow,
} from '../../components/SlipLineAllocationEditor'
import {
  createSalesSlipDraft,
  type CreateSalesAccountingSlipRequest,
  type SalesTaxType,
} from '../../api/salesAccountingSlipApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { today } from '../../utils/dateUtils'
import { fmtKrw } from '../../utils/currencyUtils'

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--line-default)',
  background: 'var(--surface-card)',
}

function fallbackUuid(seed: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${seed}-1111-4111-8111-111111111111`
}

export function SalesAccountingSlipFormPage() {
  usePageTitle('매출전표 작성')
  const navigate = useNavigate()
  const [slipDate, setSlipDate] = useState(today())
  const [partnerCode, setPartnerCode] = useState('P-10021')
  const [partnerName, setPartnerName] = useState('삼한물류 안산센터')
  const [taxType, setTaxType] = useState<SalesTaxType>('TAXABLE')
  const [memo, setMemo] = useState('')
  const [allocations, setAllocations] = useState<AllocationEditorRow[]>(
    getDefaultAllocationRows('OUTBOUND'),
  )

  const selectedRows = useMemo(
    () => allocations.filter((row) => row.allocatedAmount > 0),
    [allocations],
  )
  const totalSupply = selectedRows.reduce((sum, row) => sum + row.allocatedAmount, 0)
  const totalVat = taxType === 'TAXABLE' ? Math.round(totalSupply * 0.1) : 0

  const mutation = useMutation({
    mutationFn: createSalesSlipDraft,
    onSuccess: () => navigate('/accounting/sales-slips'),
  })

  const handleSubmit = () => {
    const first = selectedRows[0] ?? allocations[0]
    if (!first) return
    const qty = selectedRows.reduce((sum, row) => sum + row.allocatedQty, 0)
    const request: CreateSalesAccountingSlipRequest = {
      slipDate,
      partnerId: fallbackUuid('sales-partner'),
      partnerCode,
      partnerName,
      taxType,
      memo: memo.trim() || undefined,
      lines: [
        {
          productCode: first.productCode,
          productName: first.productName,
          qty: String(qty || first.sourceQty),
          unitPrice: String(qty > 0 ? Math.round(totalSupply / qty) : first.sourceAmount / first.sourceQty),
          allocations: selectedRows.map((row) => ({
            sourceSlipId: row.sourceSlipId,
            sourceSlipNo: row.sourceSlipNo,
            sourceLineId: row.sourceLineId,
            sourceLineNo: row.sourceLineNo,
            allocatedQty: String(row.allocatedQty),
            allocatedAmount: String(row.allocatedAmount),
          })),
        },
      ],
    }
    mutation.mutate(request)
  }

  return (
    <div data-testid="sales-accounting-slip-form-page">
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>매출전표 작성</h3>
          <Button variant="ghost" onClick={() => navigate('/accounting/sales-slips')}>
            목록
          </Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
          <label>
            <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>전표일자</div>
            <input type="date" value={slipDate} onChange={(e) => setSlipDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>거래처 코드</div>
            <input value={partnerCode} onChange={(e) => setPartnerCode(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>거래처명</div>
            <input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>과세유형</div>
            <select value={taxType} onChange={(e) => setTaxType(e.target.value as SalesTaxType)} style={{ ...inputStyle, width: '100%' }}>
              <option value="TAXABLE">과세</option>
              <option value="ZERO_RATED">영세</option>
              <option value="EXEMPT">면세</option>
            </select>
          </label>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>메모</div>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </label>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SlipLineAllocationEditor
          sourceKind="OUTBOUND"
          from={slipDate}
          to={slipDate}
          rows={allocations}
          onChange={setAllocations}
        />
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div>공급가 {fmtKrw(String(totalSupply))}</div>
            <div>부가세 {fmtKrw(String(totalVat))}</div>
            <strong>합계 {fmtKrw(String(totalSupply + totalVat))}</strong>
          </div>
          <Button
            variant="primary"
            disabled={mutation.isPending || selectedRows.length === 0}
            onClick={handleSubmit}
          >
            {mutation.isPending ? '저장 중' : 'DRAFT 저장'}
          </Button>
        </div>
        {mutation.isError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            매출전표 저장에 실패했습니다.
          </div>
        ) : null}
      </Card>
    </div>
  )
}
