import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Spinner } from '@samhan/design-system'
import { calculateSalesCommissionSettlement, confirmSalesCommissionSettlement, getSalesCommissionSettlement } from '../api/accounting'
import type { CalculateSalesCommissionSettlementRequest, SalesCommissionSettlement } from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { getReturnTo } from '../utils/returnContract'
import { useEffect, useState } from 'react'

const PAGE_CODE = 'accounting.sales-commission-settlement'
const LIST_PATH = '/accounting/sales-commission-settlements'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '임시저장',
  CONFIRMED: '확정',
}

const amountLabel = (value: string | null): string => {
  if (value === null || value === undefined) return '—'
  const number = Number(value)
  return Number.isFinite(number) ? `₩${number.toLocaleString('ko-KR')}` : value
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
    paymentMethod: 'CARD', withholdingApplied: true, manualExpenseRate: null, rateContractVersion: 1,
  })
  const [settlementState, setSettlement] = useState<SalesCommissionSettlement | null>(null)
  useEffect(() => {
    if (!loadedSettlement) return
    setSettlement(loadedSettlement)
    setForm({
      total: loadedSettlement.totalAmount ?? '0', equipment: loadedSettlement.equipmentAmount ?? '0',
      prepaid: loadedSettlement.prepaidAmount ?? '0', install: loadedSettlement.installInputAmount ?? '0',
      safety: loadedSettlement.safetyInputAmount ?? '0', paymentMethod: loadedSettlement.paymentMethod === 'CASH' ? 'CASH' : 'CARD',
      withholdingApplied: loadedSettlement.withholdingApplied ?? true,
      manualExpenseRate: loadedSettlement.manualExpenseRate ?? null, rateContractVersion: loadedSettlement.rateContractVersion ?? 1,
    })
  }, [loadedSettlement])
  const calculateMutation = useMutation({
    mutationFn: () => calculateSalesCommissionSettlement(id, form),
    onSuccess: async (saved) => {
      setSettlement(saved)
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'sales-commission-settlement', id] })
    },
  })
  const setField = (key: keyof CalculateSalesCommissionSettlementRequest, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }))

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
            <label key={key} style={{ display: 'grid', gap: 4 }}><span>{{ total: '총 결제금액', equipment: '장비대', prepaid: '선지급', install: '설치비', safety: '안전관리비' }[key]}</span><input value={form[key]} onChange={(e) => setField(key, e.target.value)} inputMode="decimal" /></label>
          ))}
          <label style={{ display: 'grid', gap: 4 }}><span>결제방식</span><select value={form.paymentMethod} onChange={(e) => setField('paymentMethod', e.target.value)}><option value="CARD">카드결제</option><option value="CASH">현금결제</option></select></label>
          <label style={{ display: 'grid', gap: 4 }}><span>원천징수</span><select value={String(form.withholdingApplied)} onChange={(e) => setField('withholdingApplied', e.target.value === 'true')}><option value="true">적용</option><option value="false">미적용</option></select></label>
        </div>
        <Button type="button" variant="primary" onClick={() => calculateMutation.mutate()} loading={calculateMutation.isPending} disabled={!isDraft} data-testid="sales-commission-settlement-calculate">계산 및 저장</Button>
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
