import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { PartnerLookupErrorBanner } from '../components/common/PartnerLookupErrorBanner'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { CollaborativeSlipInput } from '../components/collab/CollaborativeSlipInput'
import { createDocCoeditProvider, type DocCoeditProvider } from '../realtime/createCoeditProvider'
import { getReturnTo, type ReturnNavigationState } from '../utils/returnContract'
import {
  buildCashReceiptRequest,
  cashReceiptFormStateFromRow,
  cashReceiptInitialFormState,
  emptyCashReceiptLine,
  partnerLookupUnavailableOnHydrate,
  partnerOptionFromFormState,
  updateCashReceiptLine,
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
    lines: [{ partnerCode: provider.getHeaderValue('partnerCode'), bizNo: provider.getHeaderValue('bizNo'), partnerName: provider.getHeaderValue('partnerName'), amount: provider.getHeaderValue('amount'), memo: provider.getHeaderValue('memo') }, { partnerCode: '', bizNo: '', partnerName: '', amount: '', memo: '' }],
  }
}

export function CashReceiptFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ id?: string }>()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const receiptId = params['id']
  const isEdit = Boolean(receiptId)
  const returnTo = getReturnTo(location.state, { pathname: '/accounting/admin/cash-receipts', search: '' })
  const returnEntryKey = location.state && typeof location.state === 'object'
    ? (location.state as ReturnNavigationState).returnEntryKey
    : undefined
  const hasReturnEntry = typeof returnEntryKey === 'string' && returnEntryKey.length > 0

  usePageTitle(isEdit ? '입금보고서 편집' : '입금보고서 조회')

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

  // #831-hydrate — receiptQuery.data 하이드레이션을 useEffect 대신 렌더 중 파생으로 처리한다.
  // useEffect 로 하면 "isLoading→false 렌더"(state 는 아직 초기값)와 "state 가 채워지는
  // 렌더"(effect 실행 후) 사이에 실제로 커밋되는 프레임이 존재한다. 그 프레임에서 저장을
  // 누르면 아직 채워지지 않은 초기값(state.amount='')에 대해 검증이 돌아 "금액은 0보다 커야
  // 합니다" 같은 엉뚱한 에러가 실제 하이드레이트 에러(#831 R-3/R-5 거래처 조회 실패 안내)와
  // 함께 뜬다 — alert 가 2개가 되어 R-3/R-5(G2) 가 세운 불변식("조회 실패 원인만 알린다")이
  // 깨진다. 느린 CI 에서만 스케줄러 타이밍이 뒤집혀 노출되는 결함이었다(#831-hydrate).
  // 렌더 중 setState 를 호출하면 React 는 이 프레임을 커밋하지 않고 새 state 로 즉시
  // 재렌더하므로(공식 패턴: "Adjusting state when a prop changes" —
  // https://react.dev/learn/you-might-not-need-an-effect) 이 창 자체가 사라진다 — 스케줄러
  // 타이밍(빠른 로컬 PC vs 부하 걸린 CI)과 무관하게 항상 결정적이다.
  const [hydratedFromReceipt, setHydratedFromReceipt] = useState<typeof receiptQuery.data>(undefined)
  if (isEdit && receiptQuery.data && !coeditProvider && receiptQuery.data !== hydratedFromReceipt) {
    setHydratedFromReceipt(receiptQuery.data)
    setState(cashReceiptFormStateFromRow(receiptQuery.data))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = buildCashReceiptRequest(state)
      return isEdit && receiptId
        ? updateCashReceipt(receiptId, body)
        : createCashReceipt(body)
    },
    onSuccess: async (saved) => {
      // 저장 응답을 단건 캐시에 먼저 반영하고, inactive 목록 query도 재조회한다.
      // invalidate만 하면 편집 중 목록은 inactive라서 낡은 행을 그대로 들고 복귀할 수 있다.
      queryClient.setQueryData(['accounting', 'cash-receipt', saved.id], saved)
      await queryClient.refetchQueries({ queryKey: ['accounting', 'cash-receipts'], type: 'all' })
      if (isEdit && hasReturnEntry) {
        // 목록 → 상세 → 편집의 두 push를 한 번에 되감아 원래 entry의 key/scroll을 보존한다.
        navigate(-2)
        return
      }
      navigate(`/accounting/admin/cash-receipts/${saved.id}`, {
        replace: true,
        ...(isEdit ? { state: { returnTo } } : {}),
      })
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

  const patchLine = (index: number, next: Partial<CashReceiptFormState['lines'][number]>) => {
    setState((prev) => ({ ...prev, lines: updateCashReceiptLine(prev.lines, index, next) }))
  }

  const removeLine = (index: number) => {
    setState((prev) => ({
      ...prev,
      lines: prev.lines.length === 1 ? [emptyCashReceiptLine()] : prev.lines.filter((_, i) => i !== index),
    }))
  }

  const receipt = receiptQuery.data
  const bankLinked = receipt?.kind === 'BANK_LINKED'
  // #831 R-3/R-5 — 영속화된 입금보고서는 항상 거래처가 있다(BE resolvePartner 가 create/
  // update 시 강제). partnerCode/partnerName 이 둘 다 공란으로 hydrate 되면 "원래 거래처가
  // 없다"가 아니라 partner-service 장애로 표시만 비었다는 뜻이다 — 서버 원본값(receipt)
  // 기준으로 판정한다(state 는 사용자가 고치는 중 바뀌므로 판정 기준으로 쓰지 않는다).
  const partnerLookupWasUnavailable = Boolean(
    isEdit && receipt && partnerLookupUnavailableOnHydrate(receipt),
  )
  const partnerStillBlank = !state.partnerCode.trim() && !state.partnerName.trim()
  const canUpdate = canAccess(PAGE_CODE, 'update')
  // read-only = 권한 없음, 통장연계 또는 취소. CONFIRMED 은 편집 가능(역분개 후 재게시, S4b 기결 기능).
  const readOnly = Boolean(isEdit && receipt && (!canUpdate || bankLinked || receipt.status === 'CANCELLED'))
  // coedit(실시간 동시편집)은 DRAFT 한정. CONFIRMED 은 비협업 일반편집만.
  const canCollabEdit = Boolean(
    isEdit
      && receiptId
      && receipt
      && receipt.status === 'DRAFT'
      && !bankLinked
      && canUpdate,
  )
  const coeditActive = Boolean(coeditProvider) || coeditPending
  const editNotice = (() => {
    if (!isEdit || !receipt) return null
    if (receipt.status === 'CANCELLED') {
      return {
        className: 'danger-banner',
        role: 'alert' as const,
        text: '취소된 입금보고서는 수정할 수 없습니다.',
      }
    }
    if (bankLinked) {
      // 위 CANCELLED 분기가 이미 return 하므로 여기 도달 시 status !== 'CANCELLED' 는 항상 참(중복 조건 제거).
      return {
        className: 'warning-banner',
        role: 'status' as const,
        text: '통장연계 입금보고서는 수정할 수 없습니다. 취소 후 다시 생성하세요.',
      }
    }
    if (!canUpdate) {
      return {
        className: 'warning-banner',
        role: 'status' as const,
        text: '입금보고서 수정 권한이 없어 읽기 전용으로 표시됩니다.',
      }
    }
    if (receipt.status === 'CONFIRMED') {
      return {
        className: 'warning-banner',
        role: 'status' as const,
        text: '확정된 입금보고서를 수정하면 기존 분개가 역분개되고 새 분개로 재게시됩니다.',
      }
    }
    return null
  })()

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
    // #831 R-3/R-5 (G2) — 거래처가 비어 있는 이유가 사용자가 안 채워서가 아니라 partner-service
    // 조회 실패인 경우, 일반 "거래처를 선택하거나 거래처명을 입력하세요." 대신 정확한 원인과
    // 다음 행동(재선택)을 알린다. 가드(저장 차단) 자체는 기존과 동일 — 문구만 바뀐다.
    // #831-hydrate 방어 강화 — nextErrors 를 그대로 setErrors 하지 않고 partner 하나만 담은
    // 새 객체를 쓴다. validateCashReceiptForm 이 이 순간 다른 필드(amount 등)에도 우연히
    // 에러를 냈다면(하이드레이션 타이밍이든, 사용자가 실제로 같이 비웠든) "조회 실패 원인만
    // 알린다"(H1)는 이 배너의 목적과 무관한 alert 가 함께 뜨는 것을 막는다 — 그 필드 에러는
    // (재선택 후 다시 저장을 누르면) 다음 handleSave 호출에서 정상적으로 다시 평가된다.
    if (partnerLookupWasUnavailable && partnerStillBlank && nextErrors.partner) {
      setErrors({ partner: '거래처 조회 서비스 장애로 표시가 비었습니다. 거래처를 다시 선택해주세요.' })
      setTopError('거래처 조회 서비스에 일시 장애가 있어 거래처 표시가 비어 있습니다. 거래처를 다시 선택한 뒤 저장하세요.')
      return
    }
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

  if (isEdit && receiptQuery.isError) {
    // #831 신규 발견(PM 라이브QA) — 거래처 검색이 UNAVAILABLE 중 30초+ 매달리면 같은 origin
    // 연결 풀을 점유해 이 화면의 단건 상세 호출(그 자체는 13ms 200)까지 지연/timeout 될 수
    // 있다. 이전엔 재시도 수단이 없어 dead-end 였다.
    return (
      <PartnerLookupErrorBanner
        error={receiptQuery.error}
        onRetry={() => receiptQuery.refetch()}
        subject="입금보고서"
      />
    )
  }

  if (isEdit && !receiptQuery.data) {
    return <div className="error-banner" role="alert">입금보고서를 불러오지 못했습니다.</div>
  }

  const accounts = Array.isArray(accountsQuery.data) ? accountsQuery.data : []

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{isEdit ? '입금보고서 편집' : '입금보고서 조회'}</h3>
        <p style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>
          기존 입금보고서를 조회하고 필요한 경우 입금 행을 편집합니다.
        </p>
      </div>

      {editNotice ? (
        <div className={editNotice.className} role={editNotice.role}>
          {editNotice.text}
        </div>
      ) : null}

      {partnerLookupWasUnavailable && partnerStillBlank ? (
        // #831 R-3/R-5 — 이 receipt 는 실제로 거래처가 없을 수 없다(영속 시 BE 가 강제).
        // 저장을 시도하기 전에 먼저 "왜 비어 보이는지"를 알려 필수입력 오인을 막는다.
        // role="status"(alert 아님) — DepositorMappingPage 의 "거래처 조회 불가(일시)" 표기와
        // 같은 결의 정보성 안내이며 editNotice(role=alert 가능)와 동시 노출돼도 중복 alert 가
        // 되지 않는다.
        <div
          role="status"
          className="warning-banner"
          style={{ marginBottom: 16 }}
        >
          이 입금보고서에는 거래처가 등록되어 있으나, 거래처 조회 서비스 장애로 표시되지 않았습니다. 저장하려면 거래처를 다시 선택하세요.
        </div>
      ) : null}

      <Card>
        <div style={{ display: 'grid', gap: 16 }}>
          <div data-testid="cash-receipt-lines" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>입금 행</h4>
            {state.lines.map((line, index) => (
              <div key={index} data-testid={`cash-receipt-line-${index}`} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1.4fr auto', gap: 8, alignItems: 'end' }}>
                <PartnerAutocomplete
                  label="거래처"
                  placeholder="거래처명 또는 코드"
                  value={line.partnerCode || line.partnerName ? { partnerCode: line.partnerCode, name: line.partnerName, bizNo: line.bizNo || undefined } : null}
                  onChange={(partner) => patchLine(index, { partnerCode: partner?.partnerCode ?? '', bizNo: partner?.bizNo ?? '', partnerName: partner?.name ?? '' })}
                  searchPartners={searchPartners}
                  disabled={readOnly || coeditActive}
                />
                <CollaborativeSlipInput provider={coeditProvider} fieldPath={`items.${index}.amount`} label="금액" inputMode="numeric" value={line.amount} onValueChange={(value) => patchLine(index, { amount: value.replace(/[^\d.]/g, '') })} readOnly={readOnly} aria-label={`입금 행 ${index + 1} 금액`} />
                <CollaborativeSlipInput provider={coeditProvider} fieldPath={`items.${index}.memo`} label="적요" value={line.memo} onValueChange={(value) => patchLine(index, { memo: value })} readOnly={readOnly} aria-label={`입금 행 ${index + 1} 적요`} />
                <span style={{ fontSize: 12, color: '#6B7280' }}>{index === state.lines.length - 1 && !line.amount && !line.partnerName ? '새 빈행' : ''}</span>
                <Button type="button" variant="ghost" onClick={() => removeLine(index)} disabled={readOnly || (state.lines.length === 1 && index === 0)} aria-label={`입금 행 ${index + 1} 삭제`}>삭제</Button>
              </div>
            ))}
            <div style={{ textAlign: 'right', fontWeight: 600 }} data-testid="cash-receipt-lines-total">
              행 합계: {state.lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0).toLocaleString()}원 / 입금 총액 {Number(state.amount || 0).toLocaleString()}원
            </div>
          </div>

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

      {/* editNotice 가 이미 role="alert"(CANCELLED) 인 경우 topError 를 억제해 한 화면에 alert 2개가
          동시 노출(getByRole('alert') strict 위반·AT 중복공지)되지 않게 상호배타 렌더. */}
      {topError && editNotice?.role !== 'alert' ? (
        <div className="error-banner" role="alert" style={{ marginTop: 12, padding: 12, color: 'var(--color-danger-700, #991B1B)' }}>
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
