import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Spinner } from '@samhan/design-system'
import {
  cancelCashReceipt,
  confirmCashReceipt,
  deleteCashReceipt,
  getCashReceipt,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { CollaborativeSlipInput } from '../components/collab/CollaborativeSlipInput'
import { createDocCoeditProvider, type DocCoeditProvider } from '../realtime/createCoeditProvider'
import {
  KIND_TONE,
  cashReceiptKindLabel,
  formatCashReceiptAmount,
  formatCashReceiptDate,
} from './CashReceiptListPage.model'

const PAGE_CODE = 'accounting.cash-receipts'
const CASH_RECEIPT_HEADER_TEXT_FIELDS = new Set<string>(['memo'])

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '임시저장',
  CONFIRMED: '확정',
  CANCELLED: '취소',
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{value || '-'}</div>
    </div>
  )
}

interface CashReceiptCoeditState {
  partnerName: string
  partnerCode: string
  bizNo: string
  transactionDate: string
  amount: string
  debitAccountCode: string
  creditAccountCode: string
  memo: string
}

function coeditStateFromReceipt(receipt: NonNullable<Awaited<ReturnType<typeof getCashReceipt>>>): CashReceiptCoeditState {
  return {
    partnerName: receipt.partnerName ?? '',
    partnerCode: receipt.partnerCode ?? '',
    bizNo: receipt.bizNo ?? '',
    transactionDate: receipt.transactionDate ?? '',
    amount: receipt.amount == null ? '' : String(receipt.amount),
    debitAccountCode: receipt.debitAccountCode ?? '',
    creditAccountCode: receipt.creditAccountCode ?? '',
    memo: receipt.memo ?? '',
  }
}

function seedCashReceiptDetailProvider(provider: DocCoeditProvider, state: CashReceiptCoeditState) {
  provider.setHeaderValue('partnerName', state.partnerName)
  provider.setHeaderValue('partnerCode', state.partnerCode)
  provider.setHeaderValue('bizNo', state.bizNo)
  provider.setHeaderValue('transactionDate', state.transactionDate)
  provider.setHeaderValue('amount', state.amount)
  provider.setHeaderValue('debitAccountCode', state.debitAccountCode)
  provider.setHeaderValue('creditAccountCode', state.creditAccountCode)
  provider.setHeaderValue('memo', state.memo)
}

function coeditStateFromProvider(provider: DocCoeditProvider): CashReceiptCoeditState {
  return {
    partnerName: provider.getHeaderValue('partnerName'),
    partnerCode: provider.getHeaderValue('partnerCode'),
    bizNo: provider.getHeaderValue('bizNo'),
    transactionDate: provider.getHeaderValue('transactionDate'),
    amount: provider.getHeaderValue('amount'),
    debitAccountCode: provider.getHeaderValue('debitAccountCode'),
    creditAccountCode: provider.getHeaderValue('creditAccountCode'),
    memo: provider.getHeaderValue('memo'),
  }
}

export function CashReceiptDetailPage() {
  const params = useParams<{ id: string }>()
  const receiptId = params['id']!
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [topError, setTopError] = useState('')
  const [coeditState, setCoeditState] = useState<CashReceiptCoeditState | null>(null)
  const [coeditProvider, setCoeditProvider] = useState<DocCoeditProvider | null>(null)
  const [coeditPending, setCoeditPending] = useState(false)

  const query = useQuery({
    queryKey: ['accounting', 'cash-receipt', receiptId],
    queryFn: () => getCashReceipt(receiptId),
  })

  usePageTitle('입금보고서 상세', query.data?.slipNo)
  const receiptDataRef = useRef<typeof query.data | null>(null)
  receiptDataRef.current = query.data ?? null

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['accounting', 'cash-receipt', receiptId] })
    queryClient.invalidateQueries({ queryKey: ['accounting', 'cash-receipts'] })
  }

  const confirmMutation = useMutation({
    mutationFn: () => confirmCashReceipt(receiptId),
    onSuccess: invalidate,
    onError: (err: Error) => setTopError(`확정 실패: ${err.message}`),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelCashReceipt(receiptId),
    onSuccess: invalidate,
    onError: (err: Error) => setTopError(`취소 실패: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCashReceipt(receiptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting', 'cash-receipts'] })
      navigate('/accounting/admin/cash-receipts', { replace: true })
    },
    onError: (err: Error) => setTopError(`삭제 실패: ${err.message}`),
  })
  const receipt = query.data
  const isDraft = receipt?.status === 'DRAFT'
  const isConfirmed = receipt?.status === 'CONFIRMED'
  const isBankLinked = receipt?.kind === 'BANK_LINKED'
  const isCancelled = receipt?.status === 'CANCELLED'
  const canUpdate = canAccess(PAGE_CODE, 'update')
  const canDelete = canAccess(PAGE_CODE, 'delete')
  const canEdit = canUpdate && isDraft && !isBankLinked && !isCancelled
  const canCollabEdit = canEdit

  useEffect(() => {
    if (!query.data) return
    if (coeditProvider) return
    setCoeditState(coeditStateFromReceipt(query.data))
  }, [coeditProvider, query.data])

  useEffect(() => {
    const receiptSnapshot = receiptDataRef.current
    if (!receiptSnapshot || !canCollabEdit) {
      setCoeditProvider(null)
      setCoeditPending(false)
      return undefined
    }

    let disposed = false
    let provider: DocCoeditProvider | null = null
    let unsubscribeDoc: (() => void) | null = null
    setCoeditPending(true)

    const applyProviderState = (nextProvider: DocCoeditProvider) => {
      setCoeditState(coeditStateFromProvider(nextProvider))
    }

    void createDocCoeditProvider({
      documentId: receiptId,
      basePath: `/accounting/cash-receipts/${receiptId}`,
      headerTextFields: CASH_RECEIPT_HEADER_TEXT_FIELDS,
    }).then((nextProvider) => {
      if (disposed) {
        nextProvider.destroy()
        return
      }
      provider = nextProvider
      if (nextProvider.isEmpty()) {
        seedCashReceiptDetailProvider(nextProvider, coeditStateFromReceipt(receiptSnapshot))
      }
      applyProviderState(nextProvider)
      unsubscribeDoc = nextProvider.subscribeDoc(() => applyProviderState(nextProvider))
      setCoeditProvider(nextProvider)
      setCoeditPending(false)
    }).catch(() => {
      if (disposed) return
      setCoeditProvider(null)
      setCoeditPending(false)
    })

    return () => {
      disposed = true
      unsubscribeDoc?.()
      if (provider) provider.destroy()
      setCoeditProvider(null)
      setCoeditPending(false)
    }
    // query.data 는 deps 에 넣지 않는다. SSE invalidate/refetch 로 provider 재생성 시 미저장 CRDT 가 유실된다.
  }, [canCollabEdit, receiptId])

  if (query.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="입금보고서 불러오는 중" />
      </div>
    )
  }

  if (query.isError || !receipt) {
    return <div className="error-banner" role="alert">입금보고서를 불러오지 못했습니다.</div>
  }

  const handleConfirm = () => {
    setTopError('')
    if (window.confirm('이 입금보고서를 확정하시겠습니까?')) confirmMutation.mutate()
  }

  const handleCancel = () => {
    setTopError('')
    if (window.confirm('이 입금보고서를 취소하시겠습니까?')) cancelMutation.mutate()
  }

  const handleDelete = () => {
    setTopError('')
    if (window.confirm('DRAFT 입금보고서를 삭제하시겠습니까?')) deleteMutation.mutate()
  }

  const showCoeditFields = Boolean(canCollabEdit && coeditState && (coeditProvider || coeditPending))

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{receipt.slipNo}</h3>
              <Badge variant={KIND_TONE[String(receipt.kind)] ?? 'neutral'}>{cashReceiptKindLabel(String(receipt.kind))}</Badge>
              <Badge variant={receipt.status === 'CONFIRMED' ? 'success' : receipt.status === 'CANCELLED' ? 'danger' : 'neutral'}>
                {STATUS_LABEL[String(receipt.status)] ?? receipt.status}
              </Badge>
            </div>
          </div>
          <div className="detail-action-bar">
            <Button type="button" variant="ghost" onClick={() => navigate('/accounting/admin/cash-receipts')}>
              목록
            </Button>
            {canEdit ? (
              <Button type="button" variant="ghost" onClick={() => navigate(`/accounting/admin/cash-receipts/${receiptId}/edit`)}>
                편집
              </Button>
            ) : isBankLinked && canUpdate ? (
              <Button type="button" variant="ghost" disabled title="통장연계 입금보고서는 수정할 수 없습니다.">
                편집 불가
              </Button>
            ) : null}
            {isDraft && canUpdate ? (
              <Button type="button" variant="primary" onClick={handleConfirm} disabled={confirmMutation.isPending}>
                {confirmMutation.isPending ? '확정 중...' : '확정'}
              </Button>
            ) : null}
            {isConfirmed && canUpdate ? (
              <Button type="button" variant="ghost" onClick={handleCancel} disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? '취소 중...' : '취소'}
              </Button>
            ) : null}
            {isDraft && canDelete ? (
              <Button type="button" variant="danger" onClick={handleDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </Button>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 24 }}>
          {showCoeditFields && coeditState ? (
            <>
              <CollaborativeSlipInput
                provider={coeditProvider}
                coeditPending={coeditPending}
                fieldPath="header.partnerName"
                label="거래처"
                value={coeditState.partnerName}
                onValueChange={(value) => setCoeditState((prev) => ({ ...(prev ?? coeditState), partnerName: value }))}
                readOnly={false}
                aria-label="거래처"
              />
              <CollaborativeSlipInput
                provider={coeditProvider}
                coeditPending={coeditPending}
                fieldPath="header.partnerCode"
                label="거래처 코드"
                value={coeditState.partnerCode}
                onValueChange={(value) => setCoeditState((prev) => ({ ...(prev ?? coeditState), partnerCode: value }))}
                readOnly={false}
                aria-label="거래처 코드"
              />
              <CollaborativeSlipInput
                provider={coeditProvider}
                coeditPending={coeditPending}
                fieldPath="header.bizNo"
                label="사업자번호"
                value={coeditState.bizNo}
                onValueChange={(value) => setCoeditState((prev) => ({ ...(prev ?? coeditState), bizNo: value }))}
                readOnly={false}
                aria-label="사업자번호"
              />
              <CollaborativeSlipInput
                provider={coeditProvider}
                coeditPending={coeditPending}
                fieldPath="header.transactionDate"
                label="거래일"
                type="date"
                value={coeditState.transactionDate}
                onValueChange={(value) => setCoeditState((prev) => ({ ...(prev ?? coeditState), transactionDate: value }))}
                readOnly={false}
                aria-label="거래일"
              />
              <CollaborativeSlipInput
                provider={coeditProvider}
                coeditPending={coeditPending}
                fieldPath="header.amount"
                label="금액"
                inputMode="numeric"
                value={coeditState.amount}
                onValueChange={(value) => setCoeditState((prev) => ({ ...(prev ?? coeditState), amount: value.replace(/[^\d.]/g, '') }))}
                readOnly={false}
                aria-label="금액"
              />
              <CollaborativeSlipInput
                provider={coeditProvider}
                coeditPending={coeditPending}
                fieldPath="header.debitAccountCode"
                label="차변 계정"
                value={coeditState.debitAccountCode}
                onValueChange={(value) => setCoeditState((prev) => ({ ...(prev ?? coeditState), debitAccountCode: value }))}
                readOnly={false}
                aria-label="차변 계정"
              />
              <CollaborativeSlipInput
                provider={coeditProvider}
                coeditPending={coeditPending}
                fieldPath="header.creditAccountCode"
                label="대변 계정"
                value={coeditState.creditAccountCode}
                onValueChange={(value) => setCoeditState((prev) => ({ ...(prev ?? coeditState), creditAccountCode: value }))}
                readOnly={false}
                aria-label="대변 계정"
              />
            </>
          ) : (
            <>
              <Field label="거래처" value={receipt.partnerName} />
              <Field label="거래처 코드" value={receipt.partnerCode ?? null} />
              <Field label="사업자번호" value={receipt.bizNo ?? null} />
              <Field label="거래일" value={formatCashReceiptDate(receipt.transactionDate)} />
              <Field label="금액" value={formatCashReceiptAmount(receipt.amount)} />
              <Field label="차변 계정" value={receipt.debitAccountCode ?? null} />
              <Field label="대변 계정" value={receipt.creditAccountCode ?? null} />
            </>
          )}
          <Field label="연결 분개번호" value={receipt.journalNo ?? null} />
          <Field label="역분개번호" value={receipt.reverseJournalNo ?? null} />
          <Field label="외부 참조" value={receipt.externalRef ?? null} />
          {showCoeditFields && coeditState ? (
            <CollaborativeSlipInput
              provider={coeditProvider}
              coeditPending={coeditPending}
              fieldPath="header.memo"
              label="적요"
              value={coeditState.memo}
              onValueChange={(value) => setCoeditState((prev) => ({ ...(prev ?? coeditState), memo: value }))}
              readOnly={false}
              aria-label="적요"
            />
          ) : (
            <Field label="적요" value={receipt.memo ?? null} />
          )}
        </div>

        {coeditPending ? (
          <p role="status" data-testid="cash-receipt-detail-coedit-pending">
            협업 연결 중…
          </p>
        ) : null}
      </Card>

      {topError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16, padding: 12, color: '#DC2626' }}>
          {topError}
        </div>
      ) : null}
    </>
  )
}
