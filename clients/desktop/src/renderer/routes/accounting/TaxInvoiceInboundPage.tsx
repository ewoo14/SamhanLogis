import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, DataTable, Spinner, type DataTableColumn } from '@samhan/design-system'
import {
  listPurchaseAccountingSlips,
  type PurchaseAccountingSlipResponse,
} from '../../api/purchaseAccountingSlipApi'
import {
  registerInboundTaxInvoice,
  uploadInboundTaxInvoiceAttachment,
  type InboundTaxInvoiceAttachmentResponse,
  type InboundTaxInvoiceResponse,
} from '../../api/taxInvoiceAdminApi'
import {
  listInboundTaxInvoices,
  type InboundTaxInvoiceSummary,
} from '../../api/taxInvoiceInboundApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { firstDayOfMonth, today } from '../../utils/dateUtils'
import { fmtKrw } from '../../utils/currencyUtils'

export function TaxInvoiceInboundPage() {
  usePageTitle('수신 세금계산서')
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(today())
  const [partnerCode, setPartnerCode] = useState('')
  const [issuedDate, setIssuedDate] = useState(today())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<InboundTaxInvoiceResponse | null>(null)
  const [attachment, setAttachment] = useState<InboundTaxInvoiceAttachmentResponse | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const purchaseSlipsQuery = useQuery({
    queryKey: ['purchase-accounting-slips-for-inbound', from, to, partnerCode],
    queryFn: () => listPurchaseAccountingSlips({
      from,
      to,
      partnerCode: partnerCode.trim() || undefined,
      status: 'POSTED',
    }),
  })

  const inboundListQuery = useQuery({
    queryKey: ['inbound-tax-invoices', from, to, partnerCode],
    queryFn: () => listInboundTaxInvoices({
      from,
      to,
      partnerCode: partnerCode.trim() || undefined,
    }),
  })

  const selectedRows = useMemo(
    () => (purchaseSlipsQuery.data ?? []).filter((row) => row.id && selected.has(row.id)),
    [purchaseSlipsQuery.data, selected],
  )

  const registerMutation = useMutation({
    mutationFn: registerInboundTaxInvoice,
    onSuccess: setResult,
  })

  const uploadMutation = useMutation({
    mutationFn: ({ id, uploadFile }: { id: string; uploadFile: File }) =>
      uploadInboundTaxInvoiceAttachment(id, uploadFile),
    onSuccess: setAttachment,
  })

  const columns: DataTableColumn<PurchaseAccountingSlipResponse>[] = [
    { key: 'slipNo', header: '입고전표', width: '160px', mobilePriority: 'primary' },
    {
      key: 'select',
      header: '',
      width: '44px',
      mobilePriority: 'secondary',
      render: (row) => (
        <input
          type="checkbox"
          checked={row.id ? selected.has(row.id) : false}
          disabled={!row.id}
          onChange={(e) => {
            if (!row.id) return
            setSelected((prev) => {
              const next = new Set(prev)
              if (e.target.checked) next.add(row.id!)
              else next.delete(row.id!)
              return next
            })
          }}
          aria-label={`${row.slipNo} 선택`}
        />
      ),
    },
    { key: 'slipDate', header: '일자', width: '110px', mobilePriority: 'hidden' },
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

  const handleRegister = () => {
    registerMutation.mutate({
      issuedDate,
      purchaseSlipIds: selectedRows.map((row) => row.id!).filter(Boolean),
    })
  }

  const inboundColumns: DataTableColumn<InboundTaxInvoiceSummary>[] = [
    { key: 'taxInvoiceNo', header: '세금계산서', width: '160px', mobilePriority: 'primary' },
    { key: 'issueDate', header: '수신일', width: '110px', mobilePriority: 'secondary' },
    { key: 'partnerName', header: '거래처', mobilePriority: 'secondary' },
    {
      key: 'totalAmount',
      header: '합계',
      align: 'right',
      width: '120px',
      mobilePriority: 'secondary',
      render: (row) => fmtKrw(row.totalAmount),
    },
    { key: 'status', header: '상태', width: '90px', mobilePriority: 'hidden' },
  ]

  const handleUpload = () => {
    if (!result || !file) return
    uploadMutation.mutate({ id: result.taxInvoiceId, uploadFile: file })
  }

  return (
    <div data-testid="tax-invoice-inbound-page">
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>수신 세금계산서 등록</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <label>
            수신일&nbsp;
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
            disabled={registerMutation.isPending || selectedRows.length === 0}
            onClick={handleRegister}
          >
            {registerMutation.isPending ? '등록 중' : '수신 등록'}
          </Button>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        {purchaseSlipsQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
            <Spinner size="lg" label="입고전표 조회 중" />
          </div>
        ) : purchaseSlipsQuery.isError ? (
          <div className="error-banner" role="alert">입고전표 목록을 불러오지 못했습니다.</div>
        ) : (
          <DataTable
            columns={columns}
            rows={purchaseSlipsQuery.data ?? []}
            rowKey={(row) => row.slipNo}
            emptyMessage="매칭 가능한 입고전표가 없습니다."
          />
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>수신 세금계산서 목록</h3>
        {inboundListQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
            <Spinner size="lg" label="수신 세금계산서 조회 중" />
          </div>
        ) : inboundListQuery.isError ? (
          <div className="error-banner" role="alert">수신 세금계산서 목록을 불러오지 못했습니다.</div>
        ) : (
          <DataTable
            columns={inboundColumns}
            rows={inboundListQuery.data ?? []}
            rowKey={(row) => row.id ?? row.taxInvoiceNo}
            emptyMessage="수신 세금계산서가 없습니다."
          />
        )}
      </Card>

      {result ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>수신 결과</h3>
          <div>세금계산서 번호: {result.taxInvoiceNo}</div>
          <div>거래처: {result.partnerName}</div>
          <div>연결 전표: {result.linkedPurchaseSlipNos.join(', ')}</div>
          <strong>합계: {fmtKrw(result.totalAmount)}</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button variant="ghost" disabled={!file || uploadMutation.isPending} onClick={handleUpload}>
              첨부 업로드
            </Button>
          </div>
          {attachment ? (
            <p style={{ marginBottom: 0, fontSize: 12 }}>
              첨부 완료: {attachment.filename} ({attachment.sizeBytes.toLocaleString()} bytes)
            </p>
          ) : null}
        </Card>
      ) : null}

      {registerMutation.isError || uploadMutation.isError ? (
        <div className="error-banner" role="alert">수신 세금계산서 처리에 실패했습니다.</div>
      ) : null}
    </div>
  )
}
