import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  DataTable,
  Input,
  Select,
  Spinner,
  type DataTableColumn,
  PartnerAutocomplete,
  type PartnerOption,
} from '@samhan/design-system'
import {
  PLAN_BASIS_LABEL,
  PLAN_STATUS_LABEL,
  getCollectionPlanForecast,
  getCollectionPlanSuggestions,
  listCollectionPlans,
  registerCollectionPlan,
  updateCollectionPlanStatus,
  type CollectionPlanRow,
  type CollectionPlanSuggestion,
  type CreateCollectionPlanPayload,
  type PlanBasis,
  type PlanStatus,
} from '../api/accounting'
import { searchPartners } from '../api/partnerApi'
import { PartnerLookupErrorBanner } from '../components/common/PartnerLookupErrorBanner'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

const PLAN_STATUS_OPTIONS: PlanStatus[] = ['PLANNED', 'COLLECTED', 'OVERDUE']
const PLAN_BASIS_OPTIONS: PlanBasis[] = ['RECEIVABLE_BALANCE', 'NOTE_MATURITY', 'MANUAL']
const TRANSITION_OPTIONS: PlanStatus[] = ['COLLECTED', 'OVERDUE']

function canTransition(current: PlanStatus, target: PlanStatus): boolean {
  if (target === 'COLLECTED') return current === 'PLANNED' || current === 'OVERDUE'
  if (target === 'OVERDUE') return current === 'PLANNED'
  return false
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function yearStartIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-01-01`
}

function yearEndIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-12-31`
}

function nextWeekIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

function formatKrw(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return String(raw)
  if (n === 0) return '—'
  const abs = Math.abs(Math.round(n)).toLocaleString('ko-KR')
  return n < 0 ? `-${abs}` : abs
}

function amountStyle(raw: string | number): React.CSSProperties {
  return {
    color: Number(raw) < 0 ? 'var(--state-danger)' : undefined,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
  }
}

function statusStyle(status: PlanStatus): React.CSSProperties {
  const colors: Record<PlanStatus, { bg: string; fg: string }> = {
    PLANNED: { bg: 'var(--color-primary-50)', fg: 'var(--color-primary-700)' },
    COLLECTED: { bg: 'var(--state-success-bg)', fg: 'var(--state-success)' },
    OVERDUE: { bg: 'var(--state-danger-bg)', fg: 'var(--state-danger)' },
  }
  const color = colors[status]
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: 24,
    padding: '0 8px',
    borderRadius: 6,
    background: color.bg,
    color: color.fg,
    fontSize: 12,
    fontWeight: 700,
  }
}

export function CollectionPlanPage() {
  usePageTitle('수금계획', '등록/목록')

  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canCreateReceivable = canAccess('accounting.receivables', 'create')
  const canUpdateReceivable = canAccess('accounting.receivables', 'update')
  const [formPartner, setFormPartner] = useState<PartnerOption | null>(null)
  const [filterPartner, setFilterPartner] = useState<PartnerOption | null>(null)
  const [statusFilter, setStatusFilter] = useState<PlanStatus | ''>('')
  const [suggestions, setSuggestions] = useState<CollectionPlanSuggestion[]>([])
  const [toast, setToast] = useState<{ type: 'error'; message: string } | null>(null)
  const [forecastRange, setForecastRange] = useState({ from: yearStartIso(), to: yearEndIso() })
  const [queryFilters, setQueryFilters] = useState<{
    status?: PlanStatus
    partnerCode?: string
  }>({})
  const [form, setForm] = useState({
    plannedDate: nextWeekIso(),
    plannedAmount: '',
    basis: 'MANUAL' as PlanBasis,
    sourceReference: '',
    memo: '',
  })

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const plansQuery = useQuery({
    queryKey: ['accounting', 'collection-plans', queryFilters.status ?? '', queryFilters.partnerCode ?? ''],
    queryFn: () => listCollectionPlans(queryFilters),
  })

  const forecastQuery = useQuery({
    queryKey: ['accounting', 'collection-plans', 'forecast', forecastRange.from, forecastRange.to],
    queryFn: () => getCollectionPlanForecast(forecastRange.from, forecastRange.to),
  })

  const registerMutation = useMutation({
    mutationFn: (payload: CreateCollectionPlanPayload) => registerCollectionPlan(payload),
    onSuccess: async () => {
      setForm({
        plannedDate: nextWeekIso(),
        plannedAmount: '',
        basis: 'MANUAL',
        sourceReference: '',
        memo: '',
      })
      setFormPartner(null)
      setSuggestions([])
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'collection-plans'] })
    },
    onError: () => setToast({ type: 'error', message: '수금계획 등록 중 오류가 발생했습니다.' }),
  })

  const suggestionMutation = useMutation({
    mutationFn: (partnerCode: string) => getCollectionPlanSuggestions(partnerCode),
    onSuccess: (rows) => {
      setSuggestions(rows)
      const first = rows[0]
      if (first) applySuggestion(first)
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ planNo, status }: { planNo: string; status: PlanStatus }) =>
      updateCollectionPlanStatus(planNo, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'collection-plans'] })
    },
    onError: () => setToast({ type: 'error', message: '수금계획 상태 변경 중 오류가 발생했습니다.' }),
  })

  const applySuggestion = (suggestion: CollectionPlanSuggestion) => {
    setForm((prev) => ({
      ...prev,
      plannedDate: suggestion.plannedDate,
      plannedAmount: String(suggestion.plannedAmount),
      basis: suggestion.basis,
      sourceReference: suggestion.sourceReference,
      memo: suggestion.memo ?? prev.memo,
    }))
  }

  const columns = useMemo<DataTableColumn<CollectionPlanRow>[]>(() => [
    { key: 'planNo', header: '계획번호', width: '150px', mobilePriority: 'primary', render: (row) => <strong>{row.planNo}</strong> },
    {
      key: 'bizNo',
      header: '거래처코드',
      width: '128px',
      mobilePriority: 'hidden',
      render: (row) => row.bizNo || '-',
    },
    {
      key: 'partnerName',
      header: '거래처명',
      width: '180px',
      mobilePriority: 'secondary',
      render: (row) => row.partnerName,
    },
    { key: 'plannedDate', header: '예정일', width: '110px', mobilePriority: 'secondary' },
    {
      key: 'plannedAmount',
      header: '예정금액',
      width: '130px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (row) => <span style={amountStyle(row.plannedAmount)}>{formatKrw(row.plannedAmount)}</span>,
    },
    {
      key: 'basis',
      header: '근거',
      width: '126px',
      mobilePriority: 'hidden',
      render: (row) => PLAN_BASIS_LABEL[row.basis],
    },
    {
      key: 'status',
      header: '상태',
      width: '100px',
      mobilePriority: 'secondary',
      render: (row) => <span style={statusStyle(row.status)}>{PLAN_STATUS_LABEL[row.status]}</span>,
    },
    {
      key: 'memo',
      header: '비고',
      mobilePriority: 'hidden',
      render: (row) => row.memo || '-',
    },
    {
      key: 'actions',
      header: '상태전이',
      width: '170px',
      mobilePriority: 'secondary',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {TRANSITION_OPTIONS.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={row.status === status ? 'primary' : 'ghost'}
              disabled={!canUpdateReceivable || !canTransition(row.status, status) || statusMutation.isPending}
              onClick={() => {
                if (!canUpdateReceivable) return
                statusMutation.mutate({ planNo: row.planNo, status })
              }}
            >
              {PLAN_STATUS_LABEL[status]}
            </Button>
          ))}
        </div>
      ),
    },
  ], [canUpdateReceivable, statusMutation])

  const handleSearch = () => {
    setQueryFilters({
      status: statusFilter || undefined,
      partnerCode: filterPartner?.partnerCode || undefined,
    })
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const plannedAmount = Number(form.plannedAmount)
    if (!canCreateReceivable || !formPartner || !Number.isFinite(plannedAmount) || plannedAmount <= 0) return
    registerMutation.mutate({
      partnerCode: formPartner.partnerCode,
      plannedDate: form.plannedDate,
      plannedAmount: form.plannedAmount,
      basis: form.basis,
      sourceReference: form.sourceReference.trim() || undefined,
      memo: form.memo.trim() || undefined,
    })
  }

  const plannedAmountValue = Number(form.plannedAmount)
  const canSubmit = canCreateReceivable
    && Boolean(formPartner)
    && Number.isFinite(plannedAmountValue)
    && plannedAmountValue > 0
    && !registerMutation.isPending
  // 502(PARTNER_IDENTITY_LOOKUP_UNAVAILABLE) 시 plansQuery.data 는 undefined 이므로 이 합계는
  // 0이 되지만, 그 값을 화면에 그대로 노출하면 "미수 없음"으로 오인된다(#831 R-1) — 아래 요약
  // 문구는 plansQuery.isError 일 때 렌더하지 않는다.
  const totalAmount = (plansQuery.data ?? []).reduce((sum, row) => sum + Number(row.plannedAmount || 0), 0)
  const forecast = forecastQuery.data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>수금계획</h3>
          {!plansQuery.isError ? (
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-neutral-500)' }}>
              목록 합계 {formatKrw(totalAmount)} · 예측 합계 {formatKrw(forecast?.totalAmount)}
            </div>
          ) : null}
        </div>
        {plansQuery.isFetching || forecastQuery.isFetching ? <Spinner size="sm" /> : null}
      </div>

      <Card style={{ padding: 16 }}>
        {toast ? (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              border: '1px solid var(--state-danger)',
              borderRadius: 6,
              background: 'var(--state-danger-bg)',
              color: 'var(--state-danger)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {toast.message}
          </div>
        ) : null}
        <form className="mobile-filter-grid" onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, minmax(130px, 1fr)) auto auto', gap: 10, alignItems: 'end' }}>
          <PartnerAutocomplete
            value={formPartner}
            onChange={(partner) => {
              setFormPartner(partner)
              setSuggestions([])
            }}
            searchPartners={(query) => searchPartners(query, { activeOnly: true })}
            label="거래처"
            placeholder="거래처명 또는 코드"
            inputTestId="collection-plan-partner"
            minChars={1}
          />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            예정일
            <Input type="date" value={form.plannedDate} onChange={(event) => setForm((prev) => ({ ...prev, plannedDate: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            금액
            <Input type="number" min="0.01" step="0.01" value={form.plannedAmount} onChange={(event) => setForm((prev) => ({ ...prev, plannedAmount: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            근거
            <Select value={form.basis} onChange={(event) => setForm((prev) => ({ ...prev, basis: event.target.value as PlanBasis }))}>
              {PLAN_BASIS_OPTIONS.map((basis) => (
                <option key={basis} value={basis}>{PLAN_BASIS_LABEL[basis]}</option>
              ))}
            </Select>
          </label>
          <Button
            type="button"
            variant="ghost"
            disabled={!formPartner || suggestionMutation.isPending}
            onClick={() => formPartner && suggestionMutation.mutate(formPartner.partnerCode)}
          >
            자동 제안
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
          >
            등록
          </Button>
          <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            비고
            <Input value={form.memo} onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))} />
          </label>
        </form>

        {suggestions.length > 0 ? (
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {suggestions.map((suggestion) => (
              <Button
                key={`${suggestion.basis}-${suggestion.sourceReference}-${suggestion.plannedDate}`}
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => applySuggestion(suggestion)}
              >
                {PLAN_BASIS_LABEL[suggestion.basis]} · {suggestion.plannedDate} · {formatKrw(suggestion.plannedAmount)}
              </Button>
            ))}
          </div>
        ) : null}
      </Card>

      <Card style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              예측 시작
              <Input type="date" value={forecastRange.from} onChange={(event) => setForecastRange((prev) => ({ ...prev, from: event.target.value || todayIso() }))} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              예측 종료
              <Input type="date" value={forecastRange.to} onChange={(event) => setForecastRange((prev) => ({ ...prev, to: event.target.value || todayIso() }))} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {(forecast?.months ?? []).map((month) => (
              <div
                key={month.month}
                style={{
                  minWidth: 96,
                  padding: '8px 10px',
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: 6,
                  background: 'var(--color-neutral-0)',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{month.month}</div>
                <div style={{ marginTop: 2, fontSize: 14, fontWeight: 700, textAlign: 'right' }}>
                  {formatKrw(month.plannedAmount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <div className="mobile-filter-stack" style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="mobile-filter-field" style={{ minWidth: 220 }}>
            <PartnerAutocomplete
              value={filterPartner}
              onChange={setFilterPartner}
              searchPartners={searchPartners}
              label="거래처"
              placeholder="전체"
              inputTestId="collection-plan-partner-filter"
              minChars={1}
            />
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            상태
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PlanStatus | '')}>
              <option value="">전체</option>
              {PLAN_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{PLAN_STATUS_LABEL[status]}</option>
              ))}
            </Select>
          </label>
          <Button size="sm" variant="primary" onClick={handleSearch} disabled={plansQuery.isFetching}>
            조회
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setStatusFilter('')
              setFilterPartner(null)
              setQueryFilters({})
            }}
          >
            초기화
          </Button>
        </div>

        {plansQuery.isError ? (
          <PartnerLookupErrorBanner
            error={plansQuery.error}
            onRetry={() => plansQuery.refetch()}
            subject="수금계획"
            testId="collection-plan-error"
          />
        ) : (
          <DataTable<CollectionPlanRow>
            columns={columns}
            rows={plansQuery.data ?? []}
            rowKey={(row) => row.planNo}
            emptyMessage={plansQuery.isLoading ? '조회 중' : '등록된 수금계획이 없습니다'}
          />
        )}
      </Card>
    </div>
  )
}
