import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AccountCodeSelect,
  Button,
  Card,
  Input,
  PartnerAutocomplete,
  Spinner,
  type PartnerOption,
} from '@samhan/design-system'
import {
  createCashReceipt,
  getCashReceipt,
  listAccounts,
  updateCashReceipt,
} from '../api/accounting'
import { searchPartners } from '../api/partnerApi'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  buildCashReceiptRequest,
  cashReceiptFormStateFromRow,
  cashReceiptInitialFormState,
  partnerOptionFromFormState,
  validateCashReceiptForm,
  type CashReceiptFormErrors,
  type CashReceiptFormState,
} from './CashReceiptFormPage.model'

const PAGE_CODE = 'accounting.cash-receipts'

export function CashReceiptFormPage() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const queryClient = useQueryClient()
  const receiptId = params['id']
  const isEdit = Boolean(receiptId)

  usePageTitle(isEdit ? '입금보고서 편집' : '입금보고서 작성')

  const [state, setState] = useState<CashReceiptFormState>(() => cashReceiptInitialFormState())
  const [errors, setErrors] = useState<CashReceiptFormErrors>({})
  const [topError, setTopError] = useState('')

  const accountsQuery = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: listAccounts,
  })

  const receiptQuery = useQuery({
    queryKey: ['accounting', 'cash-receipt', receiptId],
    queryFn: () => getCashReceipt(receiptId!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (!isEdit || !receiptQuery.data) return
    setState(cashReceiptFormStateFromRow(receiptQuery.data))
  }, [isEdit, receiptQuery.data])

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = buildCashReceiptRequest(state)
      return isEdit && receiptId
        ? updateCashReceipt(receiptId, body)
        : createCashReceipt(body)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['accounting', 'cash-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['accounting', 'cash-receipt', saved.id] })
      navigate(`/accounting/admin/cash-receipts/${saved.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`저장 실패: ${err.message}`),
  })

  const patch = (next: Partial<CashReceiptFormState>) => {
    setState((prev) => ({ ...prev, ...next }))
    setErrors((prev) => {
      const copy = { ...prev }
      for (const key of Object.keys(next) as Array<keyof CashReceiptFormState>) {
        delete copy[key]
      }
      if ('partnerCode' in next || 'partnerName' in next) delete copy.partner
      return copy
    })
  }

  const handlePartnerChange = (partner: PartnerOption | null) => {
    patch({
      partnerCode: partner?.partnerCode ?? '',
      bizNo: partner?.bizNo ?? '',
      partnerName: partner?.name ?? '',
    })
  }

  const handleSave = () => {
    setTopError('')
    const nextErrors = validateCashReceiptForm(state)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    saveMutation.mutate()
  }

  if (accountsQuery.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="계정과목 불러오는 중" />
      </div>
    )
  }

  if (isEdit && receiptQuery.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="입금보고서 불러오는 중" />
      </div>
    )
  }

  if (isEdit && (receiptQuery.isError || !receiptQuery.data)) {
    return <div className="error-banner" role="alert">입금보고서를 불러오지 못했습니다.</div>
  }

  const receipt = receiptQuery.data
  const bankLinked = receipt?.kind === 'BANK_LINKED'
  const isDraft = !isEdit || receipt?.status === 'DRAFT'
  const readOnly = bankLinked || !isDraft
  const accounts = Array.isArray(accountsQuery.data) ? accountsQuery.data : []

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{isEdit ? '입금보고서 편집' : '입금보고서 작성'}</h3>
        <p style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>
          수기 입금은 DRAFT로 저장되며 확정 시 분개가 자동 게시됩니다.
        </p>
      </div>

      {bankLinked ? (
        <div className="error-banner" role="alert" style={{ marginBottom: 16, padding: 12 }}>
          통장연계 입금보고서는 수정할 수 없습니다. 취소 후 다시 생성하세요.
        </div>
      ) : null}

      <Card>
        <div style={{ display: 'grid', gap: 16 }}>
          <PartnerAutocomplete
            label="거래처"
            placeholder="거래처명 또는 사업자번호"
            value={partnerOptionFromFormState(state)}
            onChange={handlePartnerChange}
            searchPartners={searchPartners}
            error={errors.partner}
            disabled={readOnly}
            required
          />

          <div className="mobile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Input
              label="거래처명"
              value={state.partnerName}
              onChange={(event) => patch({ partnerName: event.target.value })}
              disabled={readOnly}
              required
            />
            <Input
              label="사업자번호"
              value={state.bizNo}
              onChange={(event) => patch({ bizNo: event.target.value })}
              disabled={readOnly}
            />
            <Input
              label="거래처 코드"
              value={state.partnerCode}
              onChange={(event) => patch({ partnerCode: event.target.value })}
              disabled={readOnly}
            />
          </div>

          <div className="mobile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input
              label="금액"
              inputMode="numeric"
              value={state.amount}
              onChange={(event) => patch({ amount: event.target.value.replace(/[^\d.]/g, '') })}
              disabled={readOnly}
              error={errors.amount}
              required
            />
            <Input
              label="거래일"
              type="date"
              value={state.transactionDate}
              onChange={(event) => patch({ transactionDate: event.target.value })}
              disabled={readOnly}
              error={errors.transactionDate}
              required
            />
          </div>

          <div className="mobile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>차변 계정</label>
              <AccountCodeSelect
                value={state.debitAccountCode}
                onChange={(code) => patch({ debitAccountCode: code })}
                accounts={accounts}
                ariaLabel="차변 계정"
                required
                disabled={readOnly}
                error={errors.debitAccountCode}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>대변 계정</label>
              <AccountCodeSelect
                value={state.creditAccountCode}
                onChange={(code) => patch({ creditAccountCode: code })}
                accounts={accounts}
                ariaLabel="대변 계정"
                required
                disabled={readOnly}
                error={errors.creditAccountCode}
              />
            </div>
          </div>

          <Input
            label="적요"
            value={state.memo}
            onChange={(event) => patch({ memo: event.target.value })}
            disabled={readOnly}
            error={errors.memo}
            maxLength={494}
          />
        </div>
      </Card>

      {topError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 12, padding: 12, color: '#DC2626' }}>
          {topError}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button type="button" variant="ghost" onClick={() => navigate('/accounting/admin/cash-receipts')}>
          취소
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={readOnly || saveMutation.isPending}
        >
          {saveMutation.isPending ? '저장 중...' : '저장'}
        </Button>
      </div>
    </>
  )
}

export { PAGE_CODE as CASH_RECEIPT_PAGE_CODE }
