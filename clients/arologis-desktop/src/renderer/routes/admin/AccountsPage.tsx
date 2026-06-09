/**
 * 아로로지스 간이 회계 — 계정과목 관리.
 *
 * 일반기업회계기준 표준계정과목(자산/부채/자본/수입/지출)을 조회하고, 현금출납장 거래 등록에
 * 노출될 계정의 "활성상태"를 토글한다. 비활성 계정은 거래 등록 드롭다운에서 숨겨지나 과거 거래는
 * 그대로 보존된다(계정 삭제 아님).
 *
 * 권한: 대표실(마스터)·회계팀(회계사원)만 — canManageAccounts. BE page-code
 * `arologis.accounting.accounts` @RequirePermission 이 최종 방어한다.
 *
 * 표기 규칙(개발책임자 2026-06-09): 내부 필드명 'active'를 화면에 노출하지 않고 "활성상태"로 표시한다.
 */
import axios from 'axios'
import { useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DataGrid, Select, type DataGridColumn } from '@samhan/design-system'
import {
  listAllAccounts,
  setAccountActive,
  type AccountType,
  type SimpleAccountView,
} from '../../api/arologisAccounting'
import { usePageTitle } from '../../hooks/usePageTitle'
import { canManageAccounts, useAuthStore } from '../../stores/authStore'

/** 활성상태 필터 — 전체/활성만/비활성만. */
type ActiveFilter = 'all' | 'active' | 'inactive'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: '자산',
  LIABILITY: '부채',
  EQUITY: '자본',
  INCOME: '수입',
  EXPENSE: '지출',
}

/** 유형 필터 표시 순서(표준계정과목 분류 순). */
const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']

const ACCOUNTS_QUERY_KEY = ['arologis', 'accounting', 'accounts', 'all'] as const

export function AccountsPage(): JSX.Element {
  usePageTitle('회계 — 계정과목 관리')

  const queryClient = useQueryClient()
  const auth = useAuthStore((s) => s.auth)
  const canManage = canManageAccounts(auth?.role)

  const [typeFilter, setTypeFilter] = useState<AccountType | ''>('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [rowError, setRowError] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: listAllAccounts,
  })

  const accounts = accountsQuery.data ?? []

  const filtered = useMemo(() => {
    return accounts.filter((account) => {
      if (typeFilter && account.type !== typeFilter) return false
      if (activeFilter === 'active' && !account.active) return false
      if (activeFilter === 'inactive' && account.active) return false
      return true
    })
  }, [accounts, typeFilter, activeFilter])

  const counts = useMemo(() => {
    const total = accounts.length
    const active = accounts.filter((a) => a.active).length
    return { total, active, inactive: total - active }
  }, [accounts])

  // 활성상태 토글 — 낙관적 갱신 후 실패 시 롤백. BE 가 최종 권한·정합성 검증.
  const toggleMutation = useMutation({
    mutationFn: ({ code, active }: { code: string; active: boolean }) =>
      setAccountActive(code, active),
    onMutate: async ({ code, active }) => {
      setRowError(null)
      await queryClient.cancelQueries({ queryKey: ACCOUNTS_QUERY_KEY })
      const previous = queryClient.getQueryData<SimpleAccountView[]>(ACCOUNTS_QUERY_KEY)
      queryClient.setQueryData<SimpleAccountView[]>(ACCOUNTS_QUERY_KEY, (old) =>
        (old ?? []).map((account) =>
          account.code === code ? { ...account, active } : account,
        ),
      )
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ACCOUNTS_QUERY_KEY, context.previous)
      }
      setRowError(toErrorMessage(err, '활성상태 변경에 실패했습니다.'))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY })
    },
  })

  const columns = useMemo<DataGridColumn<SimpleAccountView>[]>(() => {
    const base: DataGridColumn<SimpleAccountView>[] = [
      { key: 'code', label: '코드', width: 90 },
      { key: 'name', label: '계정과목' },
      {
        key: 'type',
        label: '유형',
        width: 100,
        filter: 'select',
        format: (v) => accountTypeLabel(v as AccountType),
        render: (row) => <Badge variant="neutral">{accountTypeLabel(row.type)}</Badge>,
      },
      {
        key: 'active',
        label: '활성상태',
        width: 160,
        filter: false,
        render: (row) => (
          <ActiveToggle
            account={row}
            disabled={!canManage || toggleMutation.isPending}
            onToggle={(next) => toggleMutation.mutate({ code: row.code, active: next })}
          />
        ),
      },
    ]
    return base
  }, [canManage, toggleMutation.isPending])

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>계정과목 관리</h1>
          <p style={descStyle}>
            일반기업회계기준 표준계정과목입니다. 활성상태를 끄면 현금출납장 거래 등록 목록에서
            숨겨지며, 이미 기록된 거래는 그대로 유지됩니다.
          </p>
        </div>
      </header>

      <div style={cardRowStyle}>
        <CountCard label="전체 계정" value={counts.total} />
        <CountCard label="활성" value={counts.active} tone="active" />
        <CountCard label="비활성" value={counts.inactive} tone="inactive" />
      </div>

      {!canManage ? (
        <div role="note" style={noticeStyle}>
          활성상태 변경은 대표실·회계팀(마스터·회계사원)만 가능합니다. 현재 계정은 조회만 됩니다.
        </div>
      ) : null}

      <div style={filterRowStyle}>
        <Select
          label="유형"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AccountType | '')}
          selectSize="sm"
          fullWidth={false}
          data-testid="arologis-accounts-type-filter"
        >
          <option value="">전체 유형</option>
          {TYPE_ORDER.map((type) => (
            <option key={type} value={type}>
              {ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <Select
          label="활성상태"
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
          selectSize="sm"
          fullWidth={false}
          data-testid="arologis-accounts-active-filter"
        >
          <option value="all">전체</option>
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </Select>
        <Button
          variant="secondary"
          size="sm"
          loading={accountsQuery.isFetching}
          onClick={() => void accountsQuery.refetch()}
        >
          새로고침
        </Button>
      </div>

      {accountsQuery.error ? (
        <ErrorBanner message={toErrorMessage(accountsQuery.error, '계정과목을 불러오지 못했습니다.')} />
      ) : null}
      {rowError ? <ErrorBanner message={rowError} /> : null}

      <DataGrid
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.code}
        loading={accountsQuery.isLoading}
        emptyMessage="해당 조건의 계정과목이 없습니다."
        enableMultiSelect={false}
        enableCopy
        getRowTestId={(row) => `arologis-account-row-${row.code}`}
        className="arologis-accounts-grid"
      />
    </section>
  )
}

/** 활성상태 토글 버튼 — 'active' 문자열 미노출, "활성/비활성" 한국어 라벨. */
function ActiveToggle({
  account,
  disabled,
  onToggle,
}: {
  account: SimpleAccountView
  disabled: boolean
  onToggle: (next: boolean) => void
}): JSX.Element {
  return (
    <div style={toggleRowStyle}>
      <Badge variant={account.active ? 'success' : 'neutral'}>
        {account.active ? '활성' : '비활성'}
      </Badge>
      <Button
        size="sm"
        variant={account.active ? 'secondary' : 'primary'}
        disabled={disabled}
        onClick={() => onToggle(!account.active)}
        data-testid={`arologis-account-toggle-${account.code}`}
      >
        {account.active ? '비활성화' : '활성화'}
      </Button>
    </div>
  )
}

function CountCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'active' | 'inactive'
}): JSX.Element {
  const valueStyle =
    tone === 'active' ? countActiveStyle : tone === 'inactive' ? countInactiveStyle : countBaseStyle
  return (
    <div style={cardStyle}>
      <span style={cardLabelStyle}>{label}</span>
      <strong style={valueStyle}>{value.toLocaleString('ko-KR')}</strong>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }): JSX.Element {
  return <div role="alert" style={errorStyle}>{message}</div>
}

function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPE_LABELS[type] ?? type
}

function toErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as { message?: unknown } | undefined
    const message = typeof data?.message === 'string' ? data.message : undefined
    if (status === 403) return message ?? '해당 작업 권한이 없습니다.'
    if (status === 404) return message ?? '대상을 찾을 수 없습니다.'
    if (message) return message
  }
  return fallback
}

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const headerStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }
const titleStyle: CSSProperties = { fontSize: 'var(--font-size-xl)', margin: 0 }
const descStyle: CSSProperties = { color: 'var(--color-text-muted)', margin: '6px 0 0', maxWidth: 720 }
const filterRowStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }
const toggleRowStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' }
const cardRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
}
const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '14px 18px',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-surface, #fff)',
}
const cardLabelStyle: CSSProperties = { color: 'var(--color-text-muted)', fontSize: 13 }
const countBaseStyle: CSSProperties = { fontSize: 'var(--font-size-lg, 20px)', fontWeight: 700, color: 'var(--color-text, #111827)' }
const countActiveStyle: CSSProperties = { ...countBaseStyle, color: 'var(--state-success, #15803d)' }
const countInactiveStyle: CSSProperties = { ...countBaseStyle, color: 'var(--color-text-muted, #6b7280)' }
const noticeStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  background: 'var(--color-surface-muted, #f9fafb)',
  color: 'var(--color-text-muted)',
  fontSize: 13,
}
const errorStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--state-danger, #dc2626)',
  borderRadius: 4,
  background: 'var(--state-danger-bg, #fee2e2)',
  color: 'var(--state-danger, #b91c1c)',
}
