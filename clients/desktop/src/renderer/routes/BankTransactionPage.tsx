import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  PartnerAutocomplete,
  Spinner,
  Tabs,
  type DataTableColumn,
  type PartnerOption,
  type TabItem,
} from '@samhan/design-system'
import {
  BANK_MATCH_STATUS_LABEL,
  BANK_TXN_SOURCE_LABEL,
  BANK_TXN_TYPE_LABEL,
  clearBankTransactionMatch,
  listBankTransactionFilterLabels,
  listBankTransactions,
  loadBankTransactionFilterPreferences,
  matchBankTransactionPartner,
  saveBankTransactionFilterPreferences,
  type BankMatchStatus,
  type BankTransactionRow,
} from '../api/accounting'
import { searchPartners } from '../api/partnerApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import {
  bankTransactionPartnerDisplay,
  bankTransactionFilterOptions,
  effectiveBankTransactionLabels,
  filterButtonLabel,
  filterLabelsForQuery,
  normalizeBankTransactionLabels,
} from './BankTransactionFilterModalModel'
import { CodefImportScopeForm } from './components/CodefImportScopeForm'

type StatusTab = 'ALL' | BankMatchStatus
type SourceTab = 'ALL' | BankTransactionRow['source']
type FilterModalKind = 'account' | 'card'

interface LabelFilters {
  from: string
  to: string
  accountLabels: string[]
  cardLabels: string[]
}

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'UNREFLECTED', label: '미반영' },
  { key: 'REFLECTED', label: '반영' },
  { key: 'FORCED', label: '강제' },
]

const SOURCE_TABS: Array<{ key: SourceTab; label: string; testId: string }> = [
  { key: 'ALL', label: '전체', testId: 'codef-tab-ALL' },
  { key: 'CODEF_BANK', label: '계좌', testId: 'codef-tab-CODEF_BANK' },
  { key: 'CODEF_CARD', label: '카드', testId: 'codef-tab-CODEF_CARD' },
  { key: 'CODEF_LOAN', label: '대출', testId: 'codef-tab-CODEF_LOAN' },
]

const SOURCE_TAB_ITEMS: TabItem[] = SOURCE_TABS.map((tab) => ({
  label: tab.label,
  testId: tab.testId,
}))

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthStartIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function formatDateTime(value: string): string {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

function formatKrw(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return String(raw)
  if (n === 0) return '—'
  const abs = Math.abs(Math.round(n)).toLocaleString('ko-KR')
  return n < 0 ? `-${abs}` : abs
}

function amountStyle(row: BankTransactionRow): React.CSSProperties {
  return {
    color: row.txnType === 'WITHDRAWAL' ? 'var(--state-danger)' : undefined,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  }
}

function statusStyle(status: BankMatchStatus): React.CSSProperties {
  const colors: Record<BankMatchStatus, { bg: string; fg: string }> = {
    UNREFLECTED: { bg: 'var(--state-warning-bg)', fg: 'var(--state-warning)' },
    REFLECTED: { bg: 'var(--state-success-bg)', fg: 'var(--state-success)' },
    FORCED: { bg: 'var(--state-info-bg)', fg: 'var(--state-info)' },
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

function partnerValueOf(row: BankTransactionRow): PartnerOption | null {
  if (!row.matchedPartnerCode && !row.matchedPartnerName) return null
  return {
    partnerCode: row.matchedPartnerCode ?? row.matchedBizNo ?? '',
    name: row.matchedPartnerName ?? row.matchedPartnerCode ?? '',
    bizNo: row.matchedBizNo ?? undefined,
  }
}

export function BankTransactionPage() {
  usePageTitle('입출금 내역', '거래내역 가져오기')

  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canCreate = canAccess('accounting.bank-matching', 'create')
  const canUpdate = canAccess('accounting.bank-matching', 'update')
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL')
  const [activeSourceTab, setActiveSourceTab] = useState<SourceTab>('ALL')
  const [filters, setFilters] = useState<LabelFilters>({
    from: monthStartIso(),
    to: todayIso(),
    accountLabels: [],
    cardLabels: [],
  })
  const [queryFilters, setQueryFilters] = useState(filters)
  const [filterModal, setFilterModal] = useState<FilterModalKind | null>(null)
  const [draftLabels, setDraftLabels] = useState<string[]>([])
  const [filterSelectionTouched, setFilterSelectionTouched] = useState(false)
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const filterLabelsQuery = useQuery({
    queryKey: ['accounting', 'bank-transactions', 'filter-labels'],
    queryFn: listBankTransactionFilterLabels,
  })

  const filterPreferencesQuery = useQuery({
    queryKey: ['accounting', 'bank-transactions', 'filter-preferences'],
    queryFn: loadBankTransactionFilterPreferences,
  })

  const accountFilterOptions = useMemo(
    () => bankTransactionFilterOptions(filterLabelsQuery.data?.accountLabels),
    [filterLabelsQuery.data?.accountLabels],
  )

  const cardFilterOptions = useMemo(
    () => bankTransactionFilterOptions(filterLabelsQuery.data?.cardLabels),
    [filterLabelsQuery.data?.cardLabels],
  )

  useEffect(() => {
    const saved = filterPreferencesQuery.data
    if (!saved || filterSelectionTouched) return
    const restored: LabelFilters = {
      from: filters.from,
      to: filters.to,
      accountLabels: effectiveBankTransactionLabels(saved.accountLabels),
      cardLabels: effectiveBankTransactionLabels(saved.cardLabels),
    }
    setFilters(restored)
    setQueryFilters(restored)
  }, [
    filterPreferencesQuery.data,
    filterSelectionTouched,
    filters.from,
    filters.to,
  ])

  const queryAccountLabels = useMemo(
    () => filterLabelsForQuery(queryFilters.accountLabels, accountFilterOptions),
    [accountFilterOptions, queryFilters.accountLabels],
  )
  const queryCardLabels = useMemo(
    () => filterLabelsForQuery(queryFilters.cardLabels, cardFilterOptions),
    [cardFilterOptions, queryFilters.cardLabels],
  )

  const saveFilterPreferencesMutation = useMutation({
    mutationFn: saveBankTransactionFilterPreferences,
    onSuccess: async (saved) => {
      const next = {
        ...filters,
        accountLabels: effectiveBankTransactionLabels(saved.accountLabels),
        cardLabels: effectiveBankTransactionLabels(saved.cardLabels),
      }
      setFilters(next)
      setQueryFilters(next)
      setFilterSelectionTouched(true)
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions', 'filter-preferences'] })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions'] })
    },
    onError: () => setToast({ type: 'error', message: '필터 설정 저장 중 오류가 발생했습니다.' }),
  })

  const transactionsQuery = useQuery({
    queryKey: [
      'accounting',
      'bank-transactions',
      activeTab,
      queryFilters.from,
      queryFilters.to,
      queryAccountLabels.join('|'),
      queryCardLabels.join('|'),
    ],
    queryFn: () => listBankTransactions({
      matchStatus: activeTab === 'ALL' ? undefined : activeTab,
      from: queryFilters.from || undefined,
      to: queryFilters.to || undefined,
      accountLabels: queryAccountLabels.length > 0 ? queryAccountLabels : undefined,
      cardLabels: queryCardLabels.length > 0 ? queryCardLabels : undefined,
    }),
  })

  const matchPartnerMutation = useMutation({
    mutationFn: matchBankTransactionPartner,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions'] })
    },
    onError: () => setToast({ type: 'error', message: '거래처 매칭 중 오류가 발생했습니다.' }),
  })

  const clearPartnerMutation = useMutation({
    mutationFn: clearBankTransactionMatch,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions'] })
    },
    onError: () => setToast({ type: 'error', message: '거래처 매칭 해제 중 오류가 발생했습니다.' }),
  })

  const rawRows = transactionsQuery.data ?? []
  const rows = rawRows.filter((row) => activeSourceTab === 'ALL' || row.source === activeSourceTab)
  const totalDeposit = rows
    .filter((row) => row.txnType === 'DEPOSIT')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalWithdrawal = rows
    .filter((row) => row.txnType === 'WITHDRAWAL')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0)

  const currentModalOptions = filterModal === 'account' ? accountFilterOptions : cardFilterOptions
  const currentModalTitle = filterModal === 'account' ? '계좌 선택' : '카드 선택'
  const currentAllLabels = useMemo(
    () => normalizeBankTransactionLabels(currentModalOptions.map((option) => option.label)),
    [currentModalOptions],
  )
  const modalAllChecked = currentAllLabels.length > 0
    && currentAllLabels.every((label) => draftLabels.includes(label))

  function openFilterModal(kind: FilterModalKind) {
    const selected = kind === 'account' ? filters.accountLabels : filters.cardLabels
    const options = kind === 'account' ? accountFilterOptions : cardFilterOptions
    setFilterModal(kind)
    setDraftLabels(selected.length === 0
      ? normalizeBankTransactionLabels(options.map((option) => option.label))
      : normalizeBankTransactionLabels(selected))
  }

  function toggleDraftLabel(label: string, checked: boolean) {
    setDraftLabels((prev) => {
      const next = new Set(prev)
      if (checked) next.add(label)
      else next.delete(label)
      return normalizeBankTransactionLabels(Array.from(next))
    })
  }

  function persistFilterModal() {
    if (!filterModal) return
    const allSelected = currentAllLabels.length > 0
      && currentAllLabels.every((label) => draftLabels.includes(label))
    const persistedLabels = allSelected ? [] : normalizeBankTransactionLabels(draftLabels)
    const nextFilters: LabelFilters = {
      ...filters,
      accountLabels: filterModal === 'account' ? persistedLabels : filters.accountLabels,
      cardLabels: filterModal === 'card' ? persistedLabels : filters.cardLabels,
    }
    setFilterModal(null)
    setFilters(nextFilters)
    setQueryFilters(nextFilters)
    setFilterSelectionTouched(true)
    // 필터는 즉시 로컬 적용하되, 서버 저장(PUT=UPDATE 권한)은 UPDATE 보유자만 시도한다.
    if (canUpdate) {
      saveFilterPreferencesMutation.mutate({
        accountLabels: nextFilters.accountLabels,
        cardLabels: nextFilters.cardLabels,
      })
    }
  }

  const columns = useMemo<DataTableColumn<BankTransactionRow>[]>(() => {
    const baseColumns: DataTableColumn<BankTransactionRow>[] = [
    {
      key: 'transactedAt',
      header: '거래일시',
      width: '150px',
      mobilePriority: 'primary',
      render: (row) => formatDateTime(row.transactedAt),
    },
    {
      key: 'txnType',
      header: '입출',
      width: '72px',
      mobilePriority: 'hidden',
      render: (row) => BANK_TXN_TYPE_LABEL[row.txnType],
    },
    {
      key: 'amount',
      header: '금액',
      align: 'right',
      width: '130px',
      mobilePriority: 'secondary',
      render: (row) => <span style={amountStyle(row)}>{formatKrw(row.amount)}</span>,
    },
    {
      key: 'description',
      header: '적요',
      width: '240px',
      mobilePriority: 'hidden',
      render: (row) => <strong>{row.description}</strong>,
    },
    {
      key: 'counterpartyName',
      header: '상대',
      width: '160px',
      mobilePriority: 'secondary',
      render: (row) => row.counterpartyName || '—',
    },
    {
      key: 'matchedPartnerCode',
      header: '거래처',
      width: '320px',
      mobilePriority: 'secondary',
      render: (row) => {
        if (row.source === 'CODEF_LOAN') {
          return (
            <span style={{ color: 'var(--color-neutral-500)', fontSize: 12, fontWeight: 600 }}>
              대출 거래는 거래처 매칭 대상이 아닙니다
            </span>
          )
        }
        if (row.matchStatus !== 'UNREFLECTED') {
          return <span>{bankTransactionPartnerDisplay(row)}</span>
        }
        const matched = partnerValueOf(row)
        const pending = matchPartnerMutation.isPending || clearPartnerMutation.isPending
        return (
          <div className="bank-transaction-partner-match" style={{ display: 'grid', gridTemplateColumns: matched ? '1fr auto' : '1fr', gap: 8, alignItems: 'end' }}>
            <div data-testid={`bank-transaction-partner-search-${row.source}-${row.externalRef}`}>
              <PartnerAutocomplete
                label=""
                ariaLabel={`${row.counterpartyName ?? '통장 거래'} 거래처 검색`}
                placeholder="거래처명/코드"
                value={matched}
                onChange={(partner) => {
                  // 해제는 명시 '해제' 버튼으로만 처리(AsyncAutocomplete 는 onChange(null) 을 발화하지 않음).
                  if (partner) {
                    matchPartnerMutation.mutate({
                      bankAccountLabel: row.bankAccountLabel,
                      transactedAt: row.transactedAt,
                      amount: row.amount,
                      externalRef: row.externalRef,
                      partnerCode: partner.partnerCode,
                    })
                  }
                }}
                searchPartners={searchPartners}
                disabled={!canUpdate || pending}
                minChars={1}
                debounceMs={200}
              />
            </div>
            {matched ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!canUpdate || pending}
                onClick={() => clearPartnerMutation.mutate({
                  bankAccountLabel: row.bankAccountLabel,
                  transactedAt: row.transactedAt,
                  amount: row.amount,
                  externalRef: row.externalRef,
                })}
              >
                해제
              </Button>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'bankAccountLabel',
      header: '계좌/카드/대출',
      width: '180px',
      mobilePriority: 'hidden',
    },
    ]

    const sourceSpecificColumns: DataTableColumn<BankTransactionRow>[] = [
      ...(activeSourceTab === 'CODEF_CARD' ? [
        {
          key: 'cardName',
          header: '법인카드',
          width: '150px',
          mobilePriority: 'secondary' as const,
          render: (row: BankTransactionRow) => row.cardName || '—',
        },
        {
          key: 'approvalId',
          header: '승인번호',
          width: '150px',
          mobilePriority: 'hidden' as const,
          render: (row: BankTransactionRow) => row.approvalId || '—',
        },
      ] : []),
      ...(activeSourceTab === 'CODEF_LOAN' ? [
        {
          key: 'loanName',
          header: '대출명',
          width: '150px',
          mobilePriority: 'secondary' as const,
          render: (row: BankTransactionRow) => row.loanName || '—',
        },
      ] : []),
    ]

    const trailingColumns: DataTableColumn<BankTransactionRow>[] = [
    {
      key: 'balanceAfter',
      header: '거래후잔액',
      align: 'right',
      width: '130px',
      mobilePriority: 'hidden',
      render: (row) => formatKrw(row.balanceAfter),
    },
    {
      key: 'source',
      header: '소스',
      width: '80px',
      mobilePriority: 'hidden',
      render: (row) => BANK_TXN_SOURCE_LABEL[row.source],
    },
    {
      key: 'matchStatus',
      header: '매칭상태',
      width: '100px',
      mobilePriority: 'hidden',
      render: (row) => (
        <span style={statusStyle(row.matchStatus)}>
          {BANK_MATCH_STATUS_LABEL[row.matchStatus]}
        </span>
      ),
    },
    ]

    return [...baseColumns, ...sourceSpecificColumns, ...trailingColumns]
  }, [activeSourceTab, canUpdate, clearPartnerMutation, matchPartnerMutation])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>입출금 내역</h3>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            입금 {formatKrw(totalDeposit)} · 출금 {formatKrw(totalWithdrawal)} · {rows.length}건
          </div>
        </div>
        {transactionsQuery.isFetching ? <Spinner size="sm" /> : null}
      </div>

      <Card style={{ padding: 16 }}>
        {toast ? (
          <div
            role={toast.type === 'error' ? 'alert' : 'status'}
            data-testid="bank-transaction-toast"
            className={`bank-transaction-toast bank-transaction-toast--${toast.type}`}
          >
            {toast.message}
          </div>
        ) : null}

        <CodefImportScopeForm
          canCreate={canCreate}
          canUpdate={canUpdate}
          initialFrom={monthStartIso()}
          initialTo={todayIso()}
          onToast={setToast}
          onImported={() => queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions'] })}
        />

      </Card>

      <Card style={{ padding: 16 }}>
        <div className="mobile-filter-stack" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', gap: 4, border: '1px solid var(--color-neutral-200)', borderRadius: 6, padding: 3 }}>
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.key}
                size="sm"
                variant={activeTab === tab.key ? 'primary' : 'ghost'}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            시작일
            <Input type="date" value={filters.from} onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            종료일
            <Input type="date" value={filters.to} onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))} />
          </label>
          <Button
            type="button"
            size="sm"
            variant={filters.accountLabels.length === 0 ? 'ghost' : 'secondary'}
            onClick={() => openFilterModal('account')}
            data-testid="bank-transaction-account-filter-button"
          >
            {filterButtonLabel('계좌', filters.accountLabels)}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filters.cardLabels.length === 0 ? 'ghost' : 'secondary'}
            onClick={() => openFilterModal('card')}
            data-testid="bank-transaction-card-filter-button"
          >
            {filterButtonLabel('카드', filters.cardLabels)}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={transactionsQuery.isFetching}
            onClick={() => setQueryFilters(filters)}
          >
            조회
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const reset = { from: monthStartIso(), to: todayIso(), accountLabels: [], cardLabels: [] }
              setFilters(reset)
              setQueryFilters(reset)
              setFilterSelectionTouched(true)
              setActiveTab('ALL')
            }}
          >
            초기화
          </Button>
        </div>

        <Tabs
          tabs={SOURCE_TAB_ITEMS}
          activeIndex={SOURCE_TABS.findIndex((tab) => tab.key === activeSourceTab)}
          onTabChange={(index) => setActiveSourceTab(SOURCE_TABS[index]?.key ?? 'ALL')}
          ariaLabel="거래 원천"
        >
          {SOURCE_TABS.map((tab) => (
            <div key={tab.key} style={{ paddingTop: 12 }}>
              {tab.key === activeSourceTab && tab.key === 'CODEF_LOAN' ? (
                <div
                  role="note"
                  style={{
                    marginBottom: 10,
                    padding: '10px 12px',
                    border: '1px solid var(--color-neutral-200)',
                    borderRadius: 6,
                    background: 'var(--color-neutral-50)',
                    color: 'var(--color-neutral-600)',
                    fontSize: 13,
                  }}
                >
                  대출 거래는 거래처 매칭 대상이 아닙니다. 채권자 은행명과 대출명만 확인하세요.
                </div>
              ) : null}
              {tab.key === activeSourceTab ? (
                <div className="bank-transaction-table">
                  <DataTable<BankTransactionRow>
                    columns={columns}
                    rows={rows}
                    rowKey={(row) => `${row.source}|${row.bankAccountLabel}|${row.transactedAt}|${row.amount}|${row.externalRef}`}
                    emptyMessage={transactionsQuery.isLoading ? '조회 중' : '입출금 거래가 없습니다'}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </Tabs>
      </Card>

      <Modal
        open={filterModal !== null}
        onClose={() => setFilterModal(null)}
        title={currentModalTitle}
        size="sm"
        footer={(
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFilterModal(null)}
              disabled={saveFilterPreferencesMutation.isPending}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={persistFilterModal}
              loading={saveFilterPreferencesMutation.isPending}
              data-testid="bank-transaction-filter-confirm"
            >
              확인
            </Button>
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="codef-checkbox-row">
            <input
              type="checkbox"
              checked={modalAllChecked}
              disabled={currentAllLabels.length === 0}
              onChange={(event) => setDraftLabels(event.target.checked ? currentAllLabels : [])}
              data-testid="bank-transaction-filter-select-all"
            />
            <span>전체 선택</span>
          </label>
          <div className="codef-checkbox-list" data-testid="bank-transaction-filter-options">
            {currentModalOptions.length === 0 ? (
              <div className="codef-import-hint">표시할 항목이 없습니다.</div>
            ) : null}
            {currentModalOptions.map((option, index) => (
              <label key={option.label} className="codef-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftLabels.includes(option.label)}
                  onChange={(event) => toggleDraftLabel(option.label, event.target.checked)}
                  data-testid={`bank-transaction-filter-option-${index}`}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
