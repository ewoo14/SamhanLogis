import { useState } from 'react'
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
import {
  KIND_TONE,
  cashReceiptKindLabel,
  formatCashReceiptAmount,
  formatCashReceiptDate,
} from './CashReceiptListPage.model'

const PAGE_CODE = 'accounting.cash-receipts'

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

export function CashReceiptDetailPage() {
  const params = useParams<{ id: string }>()
  const receiptId = params['id']!
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [topError, setTopError] = useState('')

  const query = useQuery({
    queryKey: ['accounting', 'cash-receipt', receiptId],
    queryFn: () => getCashReceipt(receiptId),
  })

  usePageTitle('입금보고서 상세', query.data?.slipNo)

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

  if (query.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="입금보고서 불러오는 중" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return <div className="error-banner" role="alert">입금보고서를 불러오지 못했습니다.</div>
  }

  const receipt = query.data
  const isDraft = receipt.status === 'DRAFT'
  const isConfirmed = receipt.status === 'CONFIRMED'
  const isBankLinked = receipt.kind === 'BANK_LINKED'
  const isCancelled = receipt.status === 'CANCELLED'
  const canUpdate = canAccess(PAGE_CODE, 'update')
  const canDelete = canAccess(PAGE_CODE, 'delete')
  const canEdit = canUpdate && !isBankLinked && !isCancelled

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
          <Field label="거래처" value={receipt.partnerName} />
          <Field label="거래처 코드" value={receipt.partnerCode ?? null} />
          <Field label="사업자번호" value={receipt.bizNo ?? null} />
          <Field label="거래일" value={formatCashReceiptDate(receipt.transactionDate)} />
          <Field label="금액" value={formatCashReceiptAmount(receipt.amount)} />
          <Field label="차변 계정" value={receipt.debitAccountCode ?? null} />
          <Field label="대변 계정" value={receipt.creditAccountCode ?? null} />
          <Field label="연결 분개번호" value={receipt.journalNo ?? null} />
          <Field label="역분개번호" value={receipt.reverseJournalNo ?? null} />
          <Field label="외부 참조" value={receipt.externalRef ?? null} />
          <Field label="적요" value={receipt.memo ?? null} />
        </div>

        {/* S4d coedit panel mount point: DRAFT 영속 협업은 후속 슬라이스에서 배선한다. */}
      </Card>

      {topError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16, padding: 12, color: '#DC2626' }}>
          {topError}
        </div>
      ) : null}
    </>
  )
}
