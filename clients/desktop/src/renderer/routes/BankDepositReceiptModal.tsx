import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AccountCodeSelect,
  Button,
  Input,
  Modal,
  Spinner,
} from '@samhan/design-system'
import { listAccounts, type BankDepositReceiptRequest, type BankTransactionRow } from '../api/accounting'
import {
  bankDepositReceiptAccountsLabel,
  bankDepositReceiptDefaultFormState,
  bankDepositReceiptSelectionLimitExceeded,
  bankDepositReceiptSelectionSummary,
  buildBankDepositReceiptRequest,
  MAX_BANK_DEPOSIT_RECEIPT_SELECTION,
  type BankDepositReceiptFormState,
} from './BankDepositReceiptModal.model'
import {
  formatCashReceiptAmount as formatKrw,
  truncatePartnerName,
} from './CashReceiptListPage.model'

interface BankDepositReceiptModalProps {
  open: boolean
  rows: BankTransactionRow[]
  submitting: boolean
  onClose: () => void
  onCreate: (request: BankDepositReceiptRequest) => void
}

export function BankDepositReceiptModal({
  open,
  rows,
  submitting,
  onClose,
  onCreate,
}: BankDepositReceiptModalProps) {
  const [form, setForm] = useState<BankDepositReceiptFormState>(() => bankDepositReceiptDefaultFormState(rows))
  const [error, setError] = useState('')
  const rowSignature = rows.map((row) => `${row.bankAccountLabel}|${row.transactedAt}|${row.amount}|${row.externalRef}`).join('\n')

  useEffect(() => {
    if (!open) return
    setForm(bankDepositReceiptDefaultFormState(rows))
    setError('')
  }, [open, rowSignature])

  const accountsQuery = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: listAccounts,
    enabled: open,
  })

  const summary = useMemo(() => bankDepositReceiptSelectionSummary(rows), [rowSignature])
  const accounts = Array.isArray(accountsQuery.data) ? accountsQuery.data : []
  const selectionLimitExceeded = bankDepositReceiptSelectionLimitExceeded(rows)
  const createDisabled = submitting
    || rows.length === 0
    || summary.mixedPartner
    || selectionLimitExceeded
    || !form.transactionDate
    || !form.debitAccountCode
    || !form.creditAccountCode

  const patch = (next: Partial<BankDepositReceiptFormState>) => {
    setForm((prev) => ({ ...prev, ...next }))
    setError('')
  }

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const handleCreate = () => {
    if (summary.mixedPartner) {
      setError(summary.blockingMessage ?? '동일 거래처 거래만 선택하세요.')
      return
    }
    if (selectionLimitExceeded) {
      setError(`입금보고서는 한 번에 최대 ${MAX_BANK_DEPOSIT_RECEIPT_SELECTION.toLocaleString('ko-KR')}건까지 생성할 수 있습니다.`)
      return
    }
    if (!form.transactionDate) {
      setError('집계일자를 입력하세요.')
      return
    }
    onCreate(buildBankDepositReceiptRequest(rows, form))
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="입금보고서 생성"
      size="md"
      closeOnBackdropClick={!submitting}
      closeOnEsc={!submitting}
      hideCloseButton={submitting}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
            취소
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleCreate}
            disabled={createDisabled}
            loading={submitting}
            data-testid="bank-deposit-receipt-confirm"
          >
            입금보고서 생성
          </Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div
          className="mobile-form-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>선택</div>
            <strong>{summary.count.toLocaleString('ko-KR')}건</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>합산액</div>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatKrw(summary.totalAmount)}원</strong>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>거래처</div>
            <strong title={summary.partnerName}>{truncatePartnerName(summary.partnerName)}</strong>
          </div>
          {/* [머지 전 재수렴 S3] 확정 모달이 대상을 특정한다 — 어느 계좌의 입금을
              생성하는지 확정 직전에 모달 자체에서 보인다(요약바에만 있고 모달엔
              없던 계좌를 모달 안으로 옮김). accountLabels 는 이미 계산돼 있었다. */}
          {summary.accountLabels.length > 0 ? (
            <div style={{ gridColumn: '1 / -1' }} data-testid="bank-deposit-receipt-accounts">
              <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>계좌</div>
              <strong title={summary.accountLabels.join(', ')}>
                {bankDepositReceiptAccountsLabel(summary.accountLabels)}
              </strong>
            </div>
          ) : null}
        </div>

        {summary.mixedPartner ? (
          <div className="danger-banner" role="alert" data-testid="bank-deposit-receipt-mixed-warning">
            {summary.blockingMessage}
          </div>
        ) : null}

        {selectionLimitExceeded ? (
          <div className="danger-banner" role="alert" data-testid="bank-deposit-receipt-limit-warning">
            입금보고서는 한 번에 최대 {MAX_BANK_DEPOSIT_RECEIPT_SELECTION.toLocaleString('ko-KR')}건까지 생성할 수 있습니다.
          </div>
        ) : null}

        <div className="warning-banner" role="status">
          생성 즉시 확정되며 수정할 수 없습니다. 잘못 생성한 경우 취소 후 다시 생성하세요.
        </div>

        {accountsQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 80 }}>
            <Spinner size="sm" label="계정과목 불러오는 중" />
          </div>
        ) : (
          <>
            <Input
              label="집계일자"
              type="date"
              value={form.transactionDate}
              onChange={(event) => patch({ transactionDate: event.target.value })}
              required
              data-testid="bank-deposit-receipt-transaction-date"
            />

            <div className="mobile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>차변 계정</label>
                <AccountCodeSelect
                  value={form.debitAccountCode}
                  onChange={(code) => patch({ debitAccountCode: code })}
                  accounts={accounts}
                  ariaLabel="입금보고서 차변 계정"
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>대변 계정</label>
                <AccountCodeSelect
                  value={form.creditAccountCode}
                  onChange={(code) => patch({ creditAccountCode: code })}
                  accounts={accounts}
                  ariaLabel="입금보고서 대변 계정"
                  required
                />
              </div>
            </div>

            <Input
              label="적요"
              value={form.memo}
              onChange={(event) => patch({ memo: event.target.value })}
              maxLength={494}
              data-testid="bank-deposit-receipt-memo"
            />
          </>
        )}

        {error ? (
          <div className="error-banner" role="alert" data-testid="bank-deposit-receipt-error">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
