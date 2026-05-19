import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Card, DataTable, type DataTableColumn } from '@samhan/design-system'
import {
  MOCK_PURCHASE_ACCOUNTING_SLIPS,
  type PurchaseAccountingSlipResponse,
} from '../../api/purchaseAccountingSlipApi'
import {
  registerInboundTaxInvoice,
  uploadInboundTaxInvoiceAttachment,
  type InboundTaxInvoiceAttachmentResponse,
  type InboundTaxInvoiceResponse,
} from '../../api/taxInvoiceAdminApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { today } from '../../utils/dateUtils'
import { fmtKrw } from '../../utils/currencyUtils'

const PURCHASE_SLIP_ID_BY_NO: Record<string, string> = {
  'PAS-20260520-001': '61111111-1111-4111-8111-111111111111',
  'PAS-20260519-003': '61111111-1111-4111-8111-111111111112',
}

export function TaxInvoiceInboundPage() {
  usePageTitle('수신 세금계산서')
  const [issuedDate, setIssuedDate] = useState(today())
  const [selected, setSelected] = useState<Set<string>>(new Set(['PAS-20260520-001']))
  const [result, setResult] = useState<InboundTaxInvoiceResponse | null>(null)
  const [attachment, setAttachment] = useState<InboundTaxInvoiceAttachmentResponse | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const selectedRows = useMemo(
    () => MOCK_PURCHASE_ACCOUNTING_SLIPS.filter((row) => selected.has(row.slipNo)),
    [selected],
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
    { key: 'slipNo', header: '매입전표', width: '160px' },
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

  const handleRegister = () => {
    registerMutation.mutate({
      issuedDate,
      purchaseSlipIds: selectedRows.map((row) => PURCHASE_SLIP_ID_BY_NO[row.slipNo] ?? row.slipNo),
    })
  }

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
        <DataTable
          columns={columns}
          rows={MOCK_PURCHASE_ACCOUNTING_SLIPS.filter((row) => row.status === 'POSTED')}
          rowKey={(row) => row.slipNo}
          emptyMessage="매칭 가능한 매입전표가 없습니다."
        />
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
