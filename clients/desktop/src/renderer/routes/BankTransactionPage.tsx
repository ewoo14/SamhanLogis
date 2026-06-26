import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  DataTable,
  Input,
  PartnerAutocomplete,
  Select,
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
  importBankTransactionsCsv,
  listBankTransactions,
  matchBankTransactionPartner,
  type BankMatchStatus,
  type BankTransactionImportResult,
  type BankTransactionRow,
  type ImportBankTransactionsMapping,
} from '../api/accounting'
import {
  importCodefTransactions,
  type CodefImportResponse,
  type CodefImportType,
} from '../api/codef'
import { searchPartners } from '../api/partnerApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

type StatusTab = 'ALL' | BankMatchStatus
type SourceTab = 'ALL' | BankTransactionRow['source']

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'UNREFLECTED', label: '미반영' },
  { key: 'REFLECTED', label: '회계반영' },
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

const CODEF_IMPORT_TYPE_LABEL: Record<CodefImportType, string> = {
  BANK: '계좌',
  CARD: '카드',
  LOAN: '대출',
  ALL: '전체',
}

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

function partnerDisplay(row: BankTransactionRow): string {
  // 그룹4 규약: 거래처코드 = 사업자번호(숫자만) + 거래처명.
  const parts = [
    row.matchedBizNo ? row.matchedBizNo.replace(/\D/g, '') : null,
    row.matchedPartnerName,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function initialMapping(): ImportBankTransactionsMapping {
  return {
    bankAccountLabel: '국민 123456-78-901234',
    dateColumn: '거래일시',
    depositColumn: '입금액',
    withdrawalColumn: '출금액',
    balanceColumn: '잔액',
    descriptionColumn: '적요',
    counterpartyColumn: '상대',
    counterpartyAccountColumn: '',
    externalRefColumn: '',
    headerRow: true,
  }
}

function initialCodefImportForm() {
  return {
    from: monthStartIso(),
    to: todayIso(),
    type: 'ALL' as CodefImportType,
    accountRef: '국민 123456-78-901234',
    cardRef: '삼한 물류카드',
    loanRef: '운전자금 대출',
  }
}

function codefSummary(result: CodefImportResponse): string {
  return [
    `조회 ${result.fetchedCount.toLocaleString('ko-KR')}건`,
    `적재 ${result.importedCount.toLocaleString('ko-KR')}건`,
    `중복 skip ${result.duplicateSkippedCount.toLocaleString('ko-KR')}건`,
    `자동매칭 ${result.matchedCount.toLocaleString('ko-KR')}건`,
  ].join(' · ')
}

function hasRequiredCodefRef(form: ReturnType<typeof initialCodefImportForm>): boolean {
  switch (form.type) {
    case 'BANK':
      return Boolean(form.accountRef.trim())
    case 'CARD':
      return Boolean(form.cardRef.trim())
    case 'LOAN':
      return Boolean(form.loanRef.trim())
    case 'ALL':
      return true
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
  const [filters, setFilters] = useState({
    from: monthStartIso(),
    to: todayIso(),
    bankAccountLabel: '',
  })
  const [queryFilters, setQueryFilters] = useState(filters)
  const [mapping, setMapping] = useState<ImportBankTransactionsMapping>(() => initialMapping())
  const [codefForm, setCodefForm] = useState(() => initialCodefImportForm())
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<BankTransactionImportResult | null>(null)
  const [codefResult, setCodefResult] = useState<CodefImportResponse | null>(null)
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const transactionsQuery = useQuery({
    queryKey: [
      'accounting',
      'bank-transactions',
      activeTab,
      queryFilters.from,
      queryFilters.to,
      queryFilters.bankAccountLabel,
    ],
    queryFn: () => listBankTransactions({
      matchStatus: activeTab === 'ALL' ? undefined : activeTab,
      from: queryFilters.from || undefined,
      to: queryFilters.to || undefined,
      bankAccountLabel: queryFilters.bankAccountLabel || undefined,
    }),
  })

  const importMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('CSV 파일을 선택하세요.')
      return importBankTransactionsCsv(file, mapping)
    },
    onSuccess: async (data) => {
      setResult(data)
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions'] })
    },
    onError: () => setToast({ type: 'error', message: '통장 CSV import 중 오류가 발생했습니다.' }),
  })

  const codefImportMutation = useMutation({
    mutationFn: () => importCodefTransactions({
      type: codefForm.type,
      from: codefForm.from,
      to: codefForm.to,
      accountRef: codefForm.type === 'CARD' || codefForm.type === 'LOAN'
        ? undefined
        : codefForm.accountRef.trim(),
      cardRef: codefForm.type === 'BANK' || codefForm.type === 'LOAN'
        ? undefined
        : codefForm.cardRef.trim(),
      loanRef: codefForm.type === 'BANK' || codefForm.type === 'CARD'
        ? undefined
        : codefForm.loanRef.trim(),
      submitMethod: 'DRY_RUN',
    }),
    onSuccess: async (data) => {
      setCodefResult(data)
      setToast({ type: 'success', message: `${CODEF_IMPORT_TYPE_LABEL[codefForm.type]} 거래내역 가져오기 완료 · ${codefSummary(data)}` })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions'] })
    },
    onError: () => setToast({ type: 'error', message: '거래내역 가져오기 중 오류가 발생했습니다.' }),
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
      header: '거래처 매칭',
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
          return <span>{partnerDisplay(row)}</span>
        }
        const matched = partnerValueOf(row)
        const pending = matchPartnerMutation.isPending || clearPartnerMutation.isPending
        return (
          <div style={{ display: 'grid', gridTemplateColumns: matched ? '1fr auto' : '1fr', gap: 8, alignItems: 'end' }}>
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

  const canImport = canCreate
    && Boolean(file)
    && Boolean(mapping.bankAccountLabel.trim())
    && Boolean(mapping.dateColumn.trim())
    && Boolean(mapping.descriptionColumn.trim())
    && (Boolean(mapping.depositColumn?.trim()) || Boolean(mapping.withdrawalColumn?.trim()))
    && !importMutation.isPending

  const canImportCodef = canCreate
    && Boolean(codefForm.from)
    && Boolean(codefForm.to)
    && codefForm.from <= codefForm.to
    && hasRequiredCodefRef(codefForm)
    && !codefImportMutation.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>입출금 내역</h3>
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
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              border: `1px solid ${toast.type === 'error' ? 'var(--state-danger)' : 'var(--state-success)'}`,
              borderRadius: 6,
              background: toast.type === 'error' ? 'var(--state-danger-bg)' : 'var(--state-success-bg)',
              color: toast.type === 'error' ? 'var(--state-danger)' : 'var(--state-success)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {toast.message}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>거래내역 가져오기</h4>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-neutral-500)' }}>
              계좌·카드·대출 거래를 모의 조회로 가져와 입출금 내역 목록에 적재합니다.
            </div>
          </div>
          <div className="mobile-filter-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(130px, 1fr)) repeat(3, minmax(150px, 1.2fr)) auto', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              시작일
              <Input
                type="date"
                value={codefForm.from}
                onChange={(event) => setCodefForm((prev) => ({ ...prev, from: event.target.value }))}
                data-testid="codef-import-from"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              종료일
              <Input
                type="date"
                value={codefForm.to}
                onChange={(event) => setCodefForm((prev) => ({ ...prev, to: event.target.value }))}
                data-testid="codef-import-to"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              유형
              <Select
                value={codefForm.type}
                onChange={(event) => setCodefForm((prev) => ({ ...prev, type: event.target.value as CodefImportType }))}
                data-testid="codef-import-type"
              >
                <option value="BANK">계좌</option>
                <option value="CARD">카드</option>
                <option value="LOAN">대출</option>
                <option value="ALL">전체</option>
              </Select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              계좌 ref
              <Input
                value={codefForm.accountRef}
                onChange={(event) => setCodefForm((prev) => ({ ...prev, accountRef: event.target.value }))}
                disabled={codefForm.type === 'CARD' || codefForm.type === 'LOAN'}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              카드 ref
              <Input
                value={codefForm.cardRef}
                onChange={(event) => setCodefForm((prev) => ({ ...prev, cardRef: event.target.value }))}
                disabled={codefForm.type === 'BANK' || codefForm.type === 'LOAN'}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              대출 ref
              <Input
                value={codefForm.loanRef}
                onChange={(event) => setCodefForm((prev) => ({ ...prev, loanRef: event.target.value }))}
                disabled={codefForm.type === 'BANK' || codefForm.type === 'CARD'}
              />
            </label>
            <Button
              type="button"
              variant="primary"
              disabled={!canImportCodef}
              onClick={() => codefImportMutation.mutate()}
              data-testid="codef-import-button"
            >
              {codefImportMutation.isPending ? '가져오는 중' : '가져오기'}
            </Button>
          </div>
          {codefResult ? (
            <div
              data-testid="codef-import-result"
              role="status"
              style={{
                padding: '10px 12px',
                border: '1px solid var(--color-neutral-200)',
                borderRadius: 6,
                background: 'var(--color-neutral-50)',
                fontSize: 13,
              }}
            >
              {codefSummary(codefResult)}
            </div>
          ) : null}
        </div>

        <div className="mobile-filter-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(4, minmax(118px, 1fr)) auto', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            CSV 파일
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              data-testid="bank-transaction-file"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            은행계좌
            <Input
              value={mapping.bankAccountLabel}
              onChange={(event) => setMapping((prev) => ({ ...prev, bankAccountLabel: event.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            일자 컬럼
            <Input value={mapping.dateColumn} onChange={(event) => setMapping((prev) => ({ ...prev, dateColumn: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            입금 컬럼
            <Input value={mapping.depositColumn ?? ''} onChange={(event) => setMapping((prev) => ({ ...prev, depositColumn: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            출금 컬럼
            <Input value={mapping.withdrawalColumn ?? ''} onChange={(event) => setMapping((prev) => ({ ...prev, withdrawalColumn: event.target.value }))} />
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={!canImport}
            onClick={() => importMutation.mutate()}
            data-testid="bank-transaction-import"
          >
            {importMutation.isPending ? '가져오는 중' : '가져오기'}
          </Button>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            잔액 컬럼
            <Input value={mapping.balanceColumn ?? ''} onChange={(event) => setMapping((prev) => ({ ...prev, balanceColumn: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            적요 컬럼
            <Input value={mapping.descriptionColumn} onChange={(event) => setMapping((prev) => ({ ...prev, descriptionColumn: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            상대 컬럼
            <Input value={mapping.counterpartyColumn ?? ''} onChange={(event) => setMapping((prev) => ({ ...prev, counterpartyColumn: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            상대계좌 컬럼
            <Input value={mapping.counterpartyAccountColumn ?? ''} onChange={(event) => setMapping((prev) => ({ ...prev, counterpartyAccountColumn: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            외부참조 컬럼
            <Input value={mapping.externalRefColumn ?? ''} onChange={(event) => setMapping((prev) => ({ ...prev, externalRefColumn: event.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            헤더
            <Select
              value={mapping.headerRow ? 'true' : 'false'}
              onChange={(event) => setMapping((prev) => ({ ...prev, headerRow: event.target.value === 'true' }))}
            >
              <option value="true">있음</option>
              <option value="false">없음</option>
            </Select>
          </label>
        </div>

        {result ? (
          <div
            data-testid="bank-transaction-import-result"
            style={{
              marginTop: 12,
              padding: '10px 12px',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 6,
              background: 'var(--color-neutral-50)',
              fontSize: 13,
            }}
          >
            전체 {result.totalRows}건 · 적재 {result.importedCount}건 · 중복 skip {result.duplicateSkippedCount}건
          </div>
        ) : null}
      </Card>

      <Card style={{ padding: 16 }}>
        <div className="mobile-filter-stack" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
          <div style={{ display: 'inline-flex', gap: 4, border: '1px solid var(--color-neutral-200)', borderRadius: 6, padding: 3 }}>
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
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, minWidth: 180 }}>
            은행계좌
            <Input value={filters.bankAccountLabel} onChange={(event) => setFilters((prev) => ({ ...prev, bankAccountLabel: event.target.value }))} placeholder="전체" />
          </label>
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
              const reset = { from: monthStartIso(), to: todayIso(), bankAccountLabel: '' }
              setFilters(reset)
              setQueryFilters(reset)
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
                <DataTable<BankTransactionRow>
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => `${row.source}|${row.bankAccountLabel}|${row.transactedAt}|${row.amount}|${row.externalRef}`}
                  emptyMessage={transactionsQuery.isLoading ? '조회 중' : '입출금 거래가 없습니다'}
                />
              ) : null}
            </div>
          ))}
        </Tabs>
      </Card>
    </div>
  )
}
