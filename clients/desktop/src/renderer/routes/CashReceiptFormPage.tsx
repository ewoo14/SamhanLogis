import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AccountCodeSelect,
  Button,
  Card,
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
import { usePermissions } from '../hooks/usePermissions'
import { CollaborativeSlipInput } from '../components/collab/CollaborativeSlipInput'
import { createDocCoeditProvider, type DocCoeditProvider } from '../realtime/createCoeditProvider'
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
const CASH_RECEIPT_HEADER_TEXT_FIELDS = new Set<string>(['memo'])

function seedCashReceiptCoeditProvider(provider: DocCoeditProvider, state: CashReceiptFormState) {
  provider.setHeaderValue('partnerName', state.partnerName)
  provider.setHeaderValue('partnerCode', state.partnerCode)
  provider.setHeaderValue('bizNo', state.bizNo)
  provider.setHeaderValue('transactionDate', state.transactionDate)
  provider.setHeaderValue('amount', state.amount)
  provider.setHeaderValue('debitAccountCode', state.debitAccountCode)
  provider.setHeaderValue('creditAccountCode', state.creditAccountCode)
  provider.setHeaderValue('memo', state.memo)
}

function stateFromCashReceiptCoeditProvider(provider: DocCoeditProvider): CashReceiptFormState {
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

export function CashReceiptFormPage() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const receiptId = params['id']
  const isEdit = Boolean(receiptId)

  usePageTitle(isEdit ? '입금보고서 편집' : '입금보고서 작성')

  const [state, setState] = useState<CashReceiptFormState>(() => cashReceiptInitialFormState())
  const [errors, setErrors] = useState<CashReceiptFormErrors>({})
  const [topError, setTopError] = useState('')
  const [coeditProvider, setCoeditProvider] = useState<DocCoeditProvider | null>(null)
  const [coeditPending, setCoeditPending] = useState(false)

  const accountsQuery = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: listAccounts,
  })

  const receiptQuery = useQuery({
    queryKey: ['accounting', 'cash-receipt', receiptId],
    queryFn: () => getCashReceipt(receiptId!),
    enabled: isEdit,
  })

  const receiptDataRef = useRef<typeof receiptQuery.data | null>(null)
  receiptDataRef.current = receiptQuery.data ?? null

  useEffect(() => {
    if (!isEdit || !receiptQuery.data) return
    if (coeditProvider) return
    setState(cashReceiptFormStateFromRow(receiptQuery.data))
  }, [isEdit, receiptQuery.data, coeditProvider])

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

  const receipt = receiptQuery.data
  const bankLinked = receipt?.kind === 'BANK_LINKED'
  // read-only = 통장연계 또는 취소. CONFIRMED 은 편집 가능(역분개 후 재게시, S4b 기결 기능).
  const readOnly = Boolean(isEdit && receipt && (bankLinked || receipt.status === 'CANCELLED'))
  // coedit(실시간 동시편집)은 DRAFT 한정. CONFIRMED 은 비협업 일반편집만.
  const canCollabEdit = Boolean(
    isEdit
      && receiptId
      && receipt
      && receipt.status === 'DRAFT'
      && !bankLinked
      && canAccess(PAGE_CODE, 'update'),
  )
  const coeditActive = Boolean(coeditProvider) || coeditPending

  useEffect(() => {
    const receiptSnapshot = receiptDataRef.current
    if (!isEdit || !receiptId || !receiptSnapshot || !canCollabEdit) {
      setCoeditProvider(null)
      setCoeditPending(false)
      return undefined
    }

    let disposed = false
    let provider: DocCoeditProvider | null = null
    let unsubscribeDoc: (() => void) | null = null
    setCoeditPending(true)

    const applyProviderState = (nextProvider: DocCoeditProvider) => {
      setState(stateFromCashReceiptCoeditProvider(nextProvider))
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
        seedCashReceiptCoeditProvider(nextProvider, cashReceiptFormStateFromRow(receiptSnapshot))
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
    // receiptQuery.data 는 deps 에 넣지 않는다. SSE invalidate/refetch 로 provider 재생성 시 미저장 CRDT 가 유실된다.
  }, [canCollabEdit, isEdit, receiptId])

  const handlePartnerChange = (partner: PartnerOption | null) => {
    const next = {
      partnerCode: partner?.partnerCode ?? '',
      bizNo: partner?.bizNo ?? '',
      partnerName: partner?.name ?? '',
    }
    patch(next)
    if (coeditProvider) {
      coeditProvider.setHeaderValue('partnerCode', next.partnerCode)
      coeditProvider.setHeaderValue('bizNo', next.bizNo)
      coeditProvider.setHeaderValue('partnerName', next.partnerName)
    }
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

      {isEdit && receipt?.status === 'CONFIRMED' && !bankLinked ? (
        <div className="warning-banner" role="status">
          확정된 입금보고서를 수정하면 기존 분개가 역분개되고 새 분개로 재게시됩니다.
        </div>
      ) : null}

      {isEdit && receipt?.status === 'CANCELLED' ? (
        <div className="warning-banner" role="status">
          취소된 입금보고서는 수정할 수 없습니다.
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
            disabled={readOnly || coeditActive}
            required
          />

          <div className="mobile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <CollaborativeSlipInput
              provider={coeditProvider}
              coeditPending={coeditPending}
              fieldPath="header.partnerName"
              label="거래처명"
              value={state.partnerName}
              onValueChange={(value) => patch({ partnerName: value })}
              readOnly={readOnly}
              required
              aria-label="거래처명"
            />
            <CollaborativeSlipInput
              provider={coeditProvider}
              coeditPending={coeditPending}
              fieldPath="header.bizNo"
              label="사업자번호"
              value={state.bizNo}
              onValueChange={(value) => patch({ bizNo: value })}
              readOnly={readOnly}
              aria-label="사업자번호"
            />
            <CollaborativeSlipInput
              provider={coeditProvider}
              coeditPending={coeditPending}
              fieldPath="header.partnerCode"
              label="거래처 코드"
              value={state.partnerCode}
              onValueChange={(value) => patch({ partnerCode: value })}
              readOnly={readOnly}
              aria-label="거래처 코드"
            />
          </div>

          <div className="mobile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <CollaborativeSlipInput
              provider={coeditProvider}
              coeditPending={coeditPending}
              fieldPath="header.amount"
              label="금액"
              inputMode="numeric"
              value={state.amount}
              onValueChange={(value) => patch({ amount: value.replace(/[^\d.]/g, '') })}
              readOnly={readOnly}
              error={errors.amount}
              required
              aria-label="금액"
            />
            <CollaborativeSlipInput
              provider={coeditProvider}
              coeditPending={coeditPending}
              fieldPath="header.transactionDate"
              label="거래일"
              type="date"
              value={state.transactionDate}
              onValueChange={(value) => patch({ transactionDate: value })}
              readOnly={readOnly}
              error={errors.transactionDate}
              required
              aria-label="거래일"
            />
          </div>

          <div className="mobile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>차변 계정</label>
              <AccountCodeSelect
                value={state.debitAccountCode}
                onChange={(code) => {
                  patch({ debitAccountCode: code })
                  coeditProvider?.setHeaderValue('debitAccountCode', code)
                }}
                accounts={accounts}
                ariaLabel="차변 계정"
                required
                disabled={readOnly || coeditPending}
                error={errors.debitAccountCode}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>대변 계정</label>
              <AccountCodeSelect
                value={state.creditAccountCode}
                onChange={(code) => {
                  patch({ creditAccountCode: code })
                  coeditProvider?.setHeaderValue('creditAccountCode', code)
                }}
                accounts={accounts}
                ariaLabel="대변 계정"
                required
                disabled={readOnly || coeditPending}
                error={errors.creditAccountCode}
              />
            </div>
          </div>

          <CollaborativeSlipInput
            provider={coeditProvider}
            coeditPending={coeditPending}
            fieldPath="header.memo"
            label="적요"
            value={state.memo}
            onValueChange={(value) => patch({ memo: value })}
            readOnly={readOnly}
            error={errors.memo}
            maxLength={494}
            aria-label="적요"
          />
        </div>
      </Card>

      {topError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 12, padding: 12, color: 'var(--state-danger)' }}>
          {topError}
        </div>
      ) : null}

      {coeditPending ? (
        <p role="status" data-testid="cash-receipt-form-coedit-pending">
          협업 연결 중…
        </p>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button type="button" variant="ghost" onClick={() => navigate('/accounting/admin/cash-receipts')}>
          취소
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={readOnly || coeditPending || saveMutation.isPending}
        >
          {saveMutation.isPending ? '저장 중...' : '저장'}
        </Button>
      </div>
    </>
  )
}

export { PAGE_CODE as CASH_RECEIPT_PAGE_CODE }
