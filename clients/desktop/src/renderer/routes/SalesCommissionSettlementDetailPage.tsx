import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Spinner } from '@samhan/design-system'
import { calculateSalesCommissionSettlement, confirmSalesCommissionSettlement, getSalesCommissionSettlement } from '../api/accounting'
import type { CalculateSalesCommissionSettlementRequest, SalesCommissionSettlement } from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { getReturnTo } from '../utils/returnContract'
import { useEffect, useRef, useState } from 'react'

const PAGE_CODE = 'accounting.sales-commission-settlement'
const LIST_PATH = '/accounting/sales-commission-settlements'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '임시저장',
  CONFIRMED: '확정',
}

const amountLabel = (value: string | null): string => {
  if (value === null || value === undefined) return '—'
  const text = String(value).trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return text
  const [rawInteger = '0', rawFraction] = text.split('.')
  const fraction = rawFraction?.replace(/0+$/, '') || undefined
  const sign = rawInteger.startsWith('-') ? '-' : ''
  const integer = rawInteger.replace(/^-/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `₩${sign}${integer}${fraction === undefined ? '' : `.${fraction}`}`
}

const MONEY_KEYS = ['total', 'equipment', 'prepaid', 'install', 'safety'] as const
const MONEY_PATTERN = /^-?\d{1,18}(?:\.\d{1,6})?$/

const normalizeMoney = (value: string): { value: string; error: string | null } => {
  if (value.trim() === '') return { value: '0', error: null }
  if (!MONEY_PATTERN.test(value)) {
    return { value, error: '금액 형식은 숫자만 입력할 수 있으며 정수부는 18자리까지입니다.' }
  }
  return { value, error: null }
}

const displayMoneyValue = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value.trim() === '') return '0'
  const [integer = '0', rawFraction] = value.trim().split('.')
  const fraction = rawFraction?.replace(/0+$/, '')
  return fraction ? `${integer}.${fraction}` : integer
}

const normalizeExpenseRate = (value: string): { value: string; error: string | null } => {
  if (value.trim() === '') return { value: '', error: null }
  if (!/^\d{1,3}(?:\.\d{1,6})?$/.test(value) || Number(value) > 100) {
    return { value, error: '제경비율은 0~100 사이의 숫자(%)로 입력해야 합니다.' }
  }
  return { value: String(Number(value) / 100), error: null }
}

export function SalesCommissionSettlementDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()

  const query = useQuery({
    queryKey: ['accounting', 'sales-commission-settlement', id],
    queryFn: () => getSalesCommissionSettlement(id),
    enabled: Boolean(id),
  })

  usePageTitle('영업수수료 정산 상세', query.data?.documentNo ?? '임시저장')

  const confirmMutation = useMutation({
    mutationFn: () => confirmSalesCommissionSettlement(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'sales-commission-settlement', id] })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'sales-commission-settlements'] })
    },
  })

  const loadedSettlement = query.data
  const [form, setForm] = useState<CalculateSalesCommissionSettlementRequest>({
    total: '0', equipment: '0', prepaid: '0', install: '0', safety: '0',
    paymentMethod: 'CARD', withholdingApplied: true, manualExpenseRate: null, rateContractVersion: 1, requestSequence: 0,
  })
  const [expenseMode, setExpenseMode] = useState<'default' | 'manual'>('default')
  const [inputError, setInputError] = useState<string | null>(null)
  const [settlementState, setSettlement] = useState<SalesCommissionSettlement | null>(null)
  // 서버에 저장된 sequence보다 항상 높은 값을 시작해 새로고침 뒤 입력도 저장한다.
  const calculationRequestSequence = useRef(Date.now())
  const editingFields = useRef(new Set<keyof CalculateSalesCommissionSettlementRequest>())
  const queryKey = ['accounting', 'sales-commission-settlement', id] as const
  useEffect(() => {
    if (!loadedSettlement) return
    setSettlement(loadedSettlement)
    setForm((current) => {
      const next = { ...current }
      if (!editingFields.current.has('total')) next.total = displayMoneyValue(loadedSettlement.totalAmount)
      if (!editingFields.current.has('equipment')) next.equipment = displayMoneyValue(loadedSettlement.equipmentAmount)
      if (!editingFields.current.has('prepaid')) next.prepaid = displayMoneyValue(loadedSettlement.prepaidAmount)
      if (!editingFields.current.has('install')) next.install = displayMoneyValue(loadedSettlement.installInputAmount)
      if (!editingFields.current.has('safety')) next.safety = displayMoneyValue(loadedSettlement.safetyInputAmount)
      if (!editingFields.current.has('paymentMethod')) next.paymentMethod = loadedSettlement.paymentMethod === 'CASH' ? 'CASH' : 'CARD'
      if (!editingFields.current.has('withholdingApplied')) next.withholdingApplied = loadedSettlement.withholdingApplied ?? true
      if (!editingFields.current.has('manualExpenseRate')) next.manualExpenseRate = loadedSettlement.manualExpenseRate ?? null
      if (!editingFields.current.has('rateContractVersion')) next.rateContractVersion = loadedSettlement.rateContractVersion ?? 1
      return next
    })
    if (!editingFields.current.has('manualExpenseRate')) setExpenseMode(loadedSettlement.manualExpenseRate == null ? 'default' : 'manual')
  }, [loadedSettlement])
  type CalculationMutationVariables = {
    next: CalculateSalesCommissionSettlementRequest
    sequence: number
  }
  const calculateMutation = useMutation({
    mutationFn: ({ next }: CalculationMutationVariables) => calculateSalesCommissionSettlement(id, next),
    onSuccess: async (saved, variables) => {
      if (variables.sequence !== calculationRequestSequence.current) return
      setSettlement(saved)
      const responseValues: Partial<Record<keyof CalculateSalesCommissionSettlementRequest, string | boolean | number | null>> = {
        total: displayMoneyValue(saved.totalAmount), equipment: displayMoneyValue(saved.equipmentAmount),
        prepaid: displayMoneyValue(saved.prepaidAmount), install: displayMoneyValue(saved.installInputAmount),
        safety: displayMoneyValue(saved.safetyInputAmount), paymentMethod: saved.paymentMethod === 'CASH' ? 'CASH' : 'CARD',
        withholdingApplied: saved.withholdingApplied ?? true, manualExpenseRate: saved.manualExpenseRate ?? null,
        rateContractVersion: saved.rateContractVersion ?? 1,
      }
      for (const key of Object.keys(responseValues) as Array<keyof CalculateSalesCommissionSettlementRequest>) {
        if (editingFields.current.has(key) && responseValues[key] === variables.next[key]) editingFields.current.delete(key)
      }
      queryClient.setQueryData(queryKey, saved)
      await queryClient.invalidateQueries({ queryKey, refetchType: 'none' })
    },
  })
  const submitCalculation = (next: CalculateSalesCommissionSettlementRequest) => {
    const sequence = ++calculationRequestSequence.current
    calculateMutation.mutate({ next: { ...next, requestSequence: sequence }, sequence })
  }
  const setField = (key: keyof CalculateSalesCommissionSettlementRequest, value: string | boolean) => {
    const next = { ...form, [key]: value } as CalculateSalesCommissionSettlementRequest
    let normalizedError: string | null = null
    if ((MONEY_KEYS as readonly string[]).includes(key) && typeof value === 'string') {
      const normalized = normalizeMoney(value)
      normalizedError = normalized.error
      setInputError(normalizedError)
      next[key as typeof MONEY_KEYS[number]] = normalized.value
    }
    if (key === 'manualExpenseRate' && typeof value === 'string') {
      const normalized = normalizeExpenseRate(value)
      normalizedError = normalized.error
      setInputError(normalizedError)
      next.manualExpenseRate = normalized.value
    }
    setForm(next)
    editingFields.current.add(key)
    if (!normalizedError && isDraft && id) submitCalculation(next)
  }

  const setExpenseModeAndCalculate = (mode: 'default' | 'manual') => {
    editingFields.current.add('manualExpenseRate')
    setExpenseMode(mode)
    const next = { ...form, manualExpenseRate: mode === 'default' ? null : (form.manualExpenseRate ?? '') }
    setForm(next)
    if (isDraft) submitCalculation(next)
  }

  const calculate = () => {
    const normalized: Partial<CalculateSalesCommissionSettlementRequest> = {}
    for (const key of MONEY_KEYS) {
      const result = normalizeMoney(form[key])
      if (result.error) { setInputError(result.error); return }
      normalized[key] = result.value
    }
    const next = { ...form, ...normalized } as CalculateSalesCommissionSettlementRequest
    setForm(next)
    setInputError(null)
    submitCalculation(next)
  }

  if (query.isLoading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}><Spinner size="lg" label="정산서 불러오는 중" /></div>
  }

  if (query.isError || !query.data) {
    return <div className="error-banner" role="alert">영업수수료 정산서를 불러오지 못했습니다.</div>
  }

  const settlement = (settlementState ?? loadedSettlement)!
  const isDraft = settlement.status === 'DRAFT'
  const returnTo = getReturnTo(location.state, { pathname: LIST_PATH, search: '' })
  const returnEntryKey = location.state && typeof location.state === 'object'
    ? (location.state as { returnEntryKey?: unknown }).returnEntryKey
    : undefined
  const hasReturnEntry = typeof returnEntryKey === 'string' && returnEntryKey.length > 0

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{settlement.documentNo ?? '문서번호 없음'}</h3>
            <Badge variant={isDraft ? 'neutral' : 'success'}>{STATUS_LABEL[settlement.status]}</Badge>
          </div>
          <p style={{ margin: '8px 0 0', color: 'var(--color-neutral-600, #4B5563)', fontSize: 13 }}>
            확정 시 정산 기준일로 문서번호가 채번됩니다.
          </p>
        </div>
        <div className="detail-action-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => hasReturnEntry ? navigate(-1) : navigate(returnTo, { replace: true })}
            data-testid="sales-commission-settlement-back"
          >
            뒤로 가기
          </Button>
          {isDraft && canAccess(PAGE_CODE, 'update') ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              data-testid="sales-commission-settlement-confirm"
            >
              정산서 확정
            </Button>
          ) : null}
        </div>
      </div>

      {confirmMutation.isError ? <div role="alert" className="error-banner" style={{ marginTop: 16 }}>정산서 확정에 실패했습니다.</div> : null}

      <section aria-label="영업수수료 계산 입력" style={{ marginTop: 24 }}>
        <h4>정산 계산</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {(['total', 'equipment', 'prepaid', 'install', 'safety'] as const).map((key) => (
            <label key={key} style={{ display: 'grid', gap: 4 }}><span>{{ total: '총 결제금액', equipment: '장비대', prepaid: '선지급', install: '설치비', safety: '안전관리비' }[key]}</span><input aria-label={{ total: '총 결제금액', equipment: '장비대', prepaid: '선지급', install: '설치비', safety: '안전관리비' }[key]} value={form[key]} onChange={(e) => setField(key, e.target.value)} inputMode="decimal" /></label>
          ))}
          <label style={{ display: 'grid', gap: 4 }}><span>제경비율</span><div><Button type="button" variant={expenseMode === 'default' ? 'primary' : 'ghost'} onClick={() => setExpenseModeAndCalculate('default')}>8%</Button><Button type="button" variant={expenseMode === 'manual' ? 'primary' : 'ghost'} onClick={() => setExpenseModeAndCalculate('manual')}>수기</Button></div></label>
          {expenseMode === 'manual' ? <label style={{ display: 'grid', gap: 4 }}><span>수기 제경비율</span><input aria-label="수기 제경비율" value={form.manualExpenseRate == null || form.manualExpenseRate === '' ? '' : String(Number(form.manualExpenseRate) * 100)} onChange={(e) => setField('manualExpenseRate', e.target.value)} inputMode="decimal" placeholder="%" /></label> : null}
          <label style={{ display: 'grid', gap: 4 }}><span>결제방식</span><select value={form.paymentMethod} onChange={(e) => setField('paymentMethod', e.target.value)}><option value="CARD">카드결제</option><option value="CASH">현금결제</option></select></label>
          <label style={{ display: 'grid', gap: 4 }}><span>원천징수</span><select value={String(form.withholdingApplied)} onChange={(e) => setField('withholdingApplied', e.target.value === 'true')}><option value="true">적용</option><option value="false">미적용</option></select></label>
        </div>
        <Button type="button" variant="primary" onClick={calculate} loading={calculateMutation.isPending} disabled={!isDraft} data-testid="sales-commission-settlement-calculate">계산 및 저장</Button>
        {inputError ? <div role="alert" className="error-banner">{inputError}</div> : null}
        {calculateMutation.isError ? <div role="alert" className="error-banner">정산 계산 저장에 실패했습니다.</div> : null}
      </section>

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18, margin: '28px 0 0' }}>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>정산 기준일</dt><dd style={{ margin: '4px 0 0' }}>{settlement.settlementDate}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>총액</dt><dd style={{ margin: '4px 0 0' }}>{amountLabel(settlement.totalAmount)}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>지급액</dt><dd style={{ margin: '4px 0 0' }}>{amountLabel(settlement.payoutAmount)}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>공급가액</dt><dd style={{ margin: '4px 0 0' }}>{amountLabel(settlement.supplyAmount)}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>부가세</dt><dd style={{ margin: '4px 0 0' }}>{amountLabel(settlement.vatAmount)}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>원천징수</dt><dd style={{ margin: '4px 0 0' }}>{amountLabel(settlement.withholdingAmount ?? null)}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>적용 요율 계약</dt><dd style={{ margin: '4px 0 0' }}>{settlement.rateContractVersion === null ? '—' : `v${settlement.rateContractVersion}`}</dd></div>
      </dl>
    </Card>
  )
}
