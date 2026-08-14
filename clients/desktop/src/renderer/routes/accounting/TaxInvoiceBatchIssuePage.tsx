import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, DataTable, Spinner, type DataTableColumn } from '@samhan/design-system'
import {
  createTaxInvoiceFromSalesSlips,
  type TaxInvoiceFromSalesSlipsResponse,
} from '../../api/taxInvoiceAdminApi'
import {
  listTaxInvoiceBatchCandidates,
  type TaxInvoiceBatchCandidateSlip,
} from '../../api/taxInvoiceBatchApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { firstDayOfMonth, today } from '../../utils/dateUtils'
import { fmtKrw } from '../../utils/currencyUtils'

type CandidateRow = TaxInvoiceBatchCandidateSlip & {
  groupKey: string
  partnerCode: string
  partnerName: string
  month: string
}

export function TaxInvoiceBatchIssuePage() {
  usePageTitle('세금계산서 발행 묶음')
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(today())
  const [partnerCode, setPartnerCode] = useState('')
  const [issuedDate, setIssuedDate] = useState(today())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<TaxInvoiceFromSalesSlipsResponse | null>(null)

  const candidatesQuery = useQuery({
    queryKey: ['tax-invoice-batch-candidates', from, to, partnerCode],
    queryFn: () => listTaxInvoiceBatchCandidates({
      from,
      to,
      partnerCode: partnerCode.trim() || undefined,
    }),
  })

  const mutation = useMutation({
    mutationFn: createTaxInvoiceFromSalesSlips,
    onSuccess: setResult,
  })

  const rows = useMemo<CandidateRow[]>(() => {
    return (candidatesQuery.data ?? []).flatMap((candidate) =>
      candidate.salesSlips.map((slip) => ({
        ...slip,
        groupKey: candidate.groupKey,
        partnerCode: candidate.partnerCode,
        partnerName: candidate.partnerName,
        month: candidate.month,
      })),
    )
  }, [candidatesQuery.data])

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.salesSlipId)), [rows, selected])

  const columns: DataTableColumn<CandidateRow>[] = [
    { key: 'slipNo', header: '출고전표', width: '160px', mobilePriority: 'primary' },
    {
      key: 'select',
      header: '',
      width: '44px',
      mobilePriority: 'secondary',
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.salesSlipId)}
          onChange={(e) => {
            setSelected((prev) => {
              const next = new Set(prev)
              if (e.target.checked) next.add(row.salesSlipId)
              else next.delete(row.salesSlipId)
              return next
            })
          }}
          aria-label={`${row.slipNo} 선택`}
        />
      ),
    },
    { key: 'slipDate', header: '일자', width: '110px', mobilePriority: 'hidden' },
    { key: 'month', header: '발행월', width: '100px', mobilePriority: 'hidden' },
    { key: 'partnerName', header: '거래처', mobilePriority: 'secondary' },
    {
      key: 'totalAmount',
      header: '합계',
      align: 'right',
      width: '120px',
      mobilePriority: 'secondary',
      render: (row) => fmtKrw(row.totalAmount),
    },
  ]

  const handleIssue = () => {
    mutation.mutate({
      issuedDate,
      salesSlipIds: selectedRows.map((row) => row.salesSlipId),
    })
  }

  return (
    <div data-testid="tax-invoice-batch-issue-page">
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>출고전표 묶음 발행</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <label>
            발행일&nbsp;
            <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
          </label>
          <label>
            조회 시작&nbsp;
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            조회 종료&nbsp;
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <input
            value={partnerCode}
            onChange={(e) => setPartnerCode(e.target.value)}
            placeholder="거래처 코드"
            style={{ height: 28, padding: '0 8px' }}
          />
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
        {candidatesQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
            <Spinner size="lg" label="발행 후보 조회 중" />
          </div>
        ) : candidatesQuery.isError ? (
          <div className="error-banner" role="alert">발행 후보 출고전표 목록을 불러오지 못했습니다.</div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.salesSlipId}
            emptyMessage="발행 가능한 출고전표가 없습니다."
          />
        )}
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
