import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Card, DataTable, type DataTableColumn } from '@samhan/design-system'
import {
  MOCK_SALES_ACCOUNTING_SLIPS,
  type SalesAccountingSlipResponse,
} from '../../api/salesAccountingSlipApi'
import {
  createTaxInvoiceFromSalesSlips,
  type TaxInvoiceFromSalesSlipsResponse,
} from '../../api/taxInvoiceAdminApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { today } from '../../utils/dateUtils'
import { fmtKrw } from '../../utils/currencyUtils'

const SALES_SLIP_ID_BY_NO: Record<string, string> = {
  'SAS-20260520-001': '51111111-1111-4111-8111-111111111111',
  'SAS-20260519-004': '51111111-1111-4111-8111-111111111112',
}

export function TaxInvoiceBatchIssuePage() {
  usePageTitle('세금계산서 발행 묶음')
  const [issuedDate, setIssuedDate] = useState(today())
  const [selected, setSelected] = useState<Set<string>>(new Set(['SAS-20260520-001']))
  const [result, setResult] = useState<TaxInvoiceFromSalesSlipsResponse | null>(null)

  const mutation = useMutation({
    mutationFn: createTaxInvoiceFromSalesSlips,
    onSuccess: setResult,
  })

  const selectedRows = useMemo(
    () => MOCK_SALES_ACCOUNTING_SLIPS.filter((row) => selected.has(row.slipNo)),
    [selected],
  )

  const columns: DataTableColumn<SalesAccountingSlipResponse>[] = [
    {
      key: 'select',
      header: '',
      width: '44px',
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.slipNo)}
          onChange={(e) => {
            setSelected((prev) => {
              const next = new Set(prev)
              if (e.target.checked) next.add(row.slipNo)
              else next.delete(row.slipNo)
              return next
            })
          }}
          aria-label={`${row.slipNo} 선택`}
        />
      ),
    },
    { key: 'slipNo', header: '매출전표', width: '160px' },
    { key: 'slipDate', header: '일자', width: '110px' },
    { key: 'partnerName', header: '거래처' },
    {
      key: 'totalAmount',
      header: '합계',
      align: 'right',
      width: '120px',
      render: (row) => fmtKrw(row.totalAmount),
    },
  ]

  const handleIssue = () => {
    mutation.mutate({
      issuedDate,
      salesSlipIds: selectedRows.map((row) => SALES_SLIP_ID_BY_NO[row.slipNo] ?? row.slipNo),
    })
  }

  return (
    <div data-testid="tax-invoice-batch-issue-page">
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>매출전표 묶음 발행</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <label>
            발행일&nbsp;
            <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
          </label>
          <Button
            variant="primary"
            disabled={mutation.isPending || selectedRows.length === 0}
            onClick={handleIssue}
          >
            {mutation.isPending ? '발행 중' : '선택 전표 발행'}
          </Button>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <DataTable
          columns={columns}
          rows={MOCK_SALES_ACCOUNTING_SLIPS.filter((row) => row.status === 'POSTED')}
          rowKey={(row) => row.slipNo}
          emptyMessage="발행 가능한 매출전표가 없습니다."
        />
      </Card>

      {result ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>발행 결과</h3>
          <div>세금계산서 번호: {result.taxInvoiceNo}</div>
          <div>거래처: {result.partnerName}</div>
          <div>연결 전표: {result.linkedSalesSlipNos.join(', ')}</div>
          <strong>합계: {fmtKrw(result.totalAmount)}</strong>
        </Card>
      ) : null}

      {mutation.isError ? (
        <div className="error-banner" role="alert">세금계산서 묶음 발행에 실패했습니다.</div>
      ) : null}
    </div>
  )
}
