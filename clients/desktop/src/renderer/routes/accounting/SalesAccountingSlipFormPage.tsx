import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card } from '@samhan/design-system'
import {
  getDefaultAllocationRows,
  resolveAllocationPartner,
  SlipLineAllocationEditor,
  type AllocationEditorRow,
} from '../../components/SlipLineAllocationEditor'
import {
  createSalesSlipDraft,
  type CreateSalesAccountingSlipRequest,
  type SalesTaxType,
} from '../../api/salesAccountingSlipApi'
import { extractSalesSlipUserReason } from '../../api/apiError'
import { usePageTitle } from '../../hooks/usePageTitle'
import { today } from '../../utils/dateUtils'
import { splitVatInclusiveFromQtyUnitPrice } from '../../utils/vatRounding'
import { fmtKrw } from '../../utils/currencyUtils'

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--line-default)',
  background: 'var(--surface-card)',
}

export function SalesAccountingSlipFormPage() {
  usePageTitle('출고전표 작성')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  const sourcePartner = useMemo(() => resolveAllocationPartner(selectedRows), [selectedRows])
  const vatInclusiveTotal = selectedRows.reduce((sum, row) => sum + row.allocatedAmount, 0)
  const allocatedQty = selectedRows.reduce((sum, row) => sum + row.allocatedQty, 0)
  const first = selectedRows[0] ?? allocations[0]
  const submittedQty = allocatedQty || first?.sourceQty || 0
  const submittedUnitPrice = allocatedQty > 0
    ? Math.round(vatInclusiveTotal / allocatedQty)
    : (first ? first.sourceAmount / first.sourceQty : 0)
  const { supply: totalSupply, vat: totalVat, total: totalAmount } = splitVatInclusiveFromQtyUnitPrice(
    String(submittedQty),
    String(submittedUnitPrice),
    taxType === 'TAXABLE',
  )

  const mutation = useMutation({
    mutationFn: createSalesSlipDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales-accounting-slips'] })
      navigate('/accounting/sales-slips')
    },
  })

  const handleSubmit = () => {
    if (sourcePartner.status !== 'valid') return
    if (!first) return
    const request: CreateSalesAccountingSlipRequest = {
      slipDate,
      partnerId: sourcePartner.partner.partnerId,
      partnerCode: sourcePartner.partner.partnerCode,
      partnerName: sourcePartner.partner.partnerName,
      taxType,
      memo: memo.trim() || undefined,
      lines: [
        {
          productCode: first.productCode,
          productName: first.productName,
          qty: String(submittedQty),
          unitPrice: String(submittedUnitPrice),
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
          <h3 style={{ margin: 0 }}>출고전표 작성</h3>
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
            <input
              value={sourcePartner.status === 'valid' ? sourcePartner.partner.partnerCode : partnerCode}
              readOnly={sourcePartner.status === 'valid'}
              onChange={(e) => setPartnerCode(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
          </label>
          <label>
            <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>거래처명</div>
            <input
              value={sourcePartner.status === 'valid' ? sourcePartner.partner.partnerName : partnerName}
              readOnly={sourcePartner.status === 'valid'}
              onChange={(e) => setPartnerName(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
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
            <strong>합계 {fmtKrw(String(totalAmount))}</strong>
          </div>
          <Button
            variant="primary"
            disabled={mutation.isPending || sourcePartner.status !== 'valid'}
            onClick={handleSubmit}
          >
            {mutation.isPending ? '저장 중' : '임시저장'}
          </Button>
        </div>
        {mutation.isError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            {extractSalesSlipUserReason(mutation.error) ?? '매출전표 저장에 실패했습니다.'}
          </div>
        ) : null}
        {sourcePartner.status !== 'valid' ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            {sourcePartner.message}
          </div>
        ) : null}
      </Card>
    </div>
  )
}
