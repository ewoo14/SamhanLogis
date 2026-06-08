/**
 * 아로로지스 간이 회계 — 현금출납장(cashbook).
 *
 * 단식부기 수입/지출 1건 단위 기록 + 기간 집계. 분개/차변·대변/마감 개념 없음.
 *
 * UUID 비공개: 거래 식별자(UUID)는 수정/삭제 키 한정으로만 사용하고 화면 텍스트에는
 * 일자/유형/계정명/거래처/금액/적요만 노출한다. 계정 식별은 code 를 사용한다.
 *
 * 금액은 천단위 콤마로 표시한다. 양수 검증은 BE 가 담당하나 FE 도 0 초과만 제출한다.
 */
import axios from 'axios'
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataGrid,
  Input,
  Modal,
  Select,
  type DataGridColumn,
} from '@samhan/design-system'
import {
  createCashTxn,
  deleteCashTxn,
  getPeriodSummary,
  listAccounts,
  listCashTxns,
  updateCashTxn,
  type AccountType,
  type CashSummaryView,
  type CashTxnType,
  type CashTxnView,
  type SimpleAccountView,
} from '../../api/arologisAccounting'
import { usePageTitle } from '../../hooks/usePageTitle'
import { canManageHr, useAuthStore } from '../../stores/authStore'

/** 기간 선택 방식 — 월별 또는 직접 지정(from~to). */
type PeriodMode = 'month' | 'range'

type CashTxnModalState =
  | { mode: 'create' }
  | { mode: 'edit'; txn: CashTxnView }
  | { mode: 'delete'; txn: CashTxnView }
  | null

const TXN_TYPE_LABELS: Record<CashTxnType, string> = {
  INCOME: '수입',
  EXPENSE: '지출',
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: '자산',
  LIABILITY: '부채',
  INCOME: '수입',
  EXPENSE: '지출',
}

export function CashbookPage(): JSX.Element {
  usePageTitle('회계 — 현금출납장')

  const queryClient = useQueryClient()
  const auth = useAuthStore((s) => s.auth)
  const canManage = canManageHr(auth?.role)

  const today = useMemo(() => new Date(), [])
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [from, setFrom] = useState(firstDayOfMonthIso(today))
  const [to, setTo] = useState(todayIso())
  const [typeFilter, setTypeFilter] = useState<CashTxnType | ''>('')
  const [modal, setModal] = useState<CashTxnModalState>(null)

  // 실제 조회에 사용할 기간을 단일 소스로 산출(목록/집계 공유).
  const period = useMemo<{ from: string; to: string }>(() => {
    if (periodMode === 'month') {
      return monthToPeriodSafe(year, month)
    }
    return { from, to }
  }, [periodMode, year, month, from, to])

  const periodValid = period.from <= period.to

  const accountsQuery = useQuery({
    queryKey: ['arologis', 'accounting', 'accounts'],
    queryFn: listAccounts,
  })

  const txnsQuery = useQuery({
    queryKey: ['arologis', 'accounting', 'cash-txns', period.from, period.to, typeFilter],
    queryFn: () =>
      listCashTxns({
        from: period.from,
        to: period.to,
        type: typeFilter || undefined,
      }),
    enabled: periodValid,
  })

  // 집계도 목록과 동일하게 period(from~to) 단일소스로 조회한다. month 모드는 period 가
  // monthToPeriodSafe 환산값이라 극단 year(0/음수/대값) 입력에도 BE 500 이 발생하지 않는다.
  const summaryQuery = useQuery<CashSummaryView>({
    queryKey: ['arologis', 'accounting', 'summary', period.from, period.to],
    queryFn: () => getPeriodSummary(period.from, period.to),
    enabled: periodValid,
  })

  const accounts = accountsQuery.data ?? []
  const txns = txnsQuery.data ?? []

  const refreshAll = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['arologis', 'accounting', 'cash-txns'] }),
      queryClient.invalidateQueries({ queryKey: ['arologis', 'accounting', 'summary'] }),
    ])
  }

  const columns = useMemo<DataGridColumn<CashTxnView>[]>(() => {
    const base: DataGridColumn<CashTxnView>[] = [
      {
        key: 'txnDate',
        label: '일자',
        width: 120,
        format: (v) => formatDate(String(v ?? '')),
      },
      {
        key: 'type',
        label: '유형',
        width: 90,
        filter: 'select',
        format: (v) => txnTypeLabel(v as CashTxnType),
        render: (row) => (
          <Badge variant={row.type === 'INCOME' ? 'success' : 'danger'}>
            {txnTypeLabel(row.type)}
          </Badge>
        ),
      },
      {
        key: 'accountName',
        label: '계정',
        width: 140,
        format: (v) => nullableText(v),
      },
      {
        key: 'partnerName',
        label: '거래처',
        width: 150,
        format: (v) => nullableText(v),
      },
      {
        key: 'amount',
        label: '금액',
        width: 140,
        align: 'right',
        format: (v) => formatAmount(Number(v ?? 0)),
        render: (row) => (
          <span style={row.type === 'INCOME' ? amountIncomeStyle : amountExpenseStyle}>
            {row.type === 'EXPENSE' ? '-' : '+'}
            {formatAmount(row.amount)}
          </span>
        ),
      },
      {
        key: 'description',
        label: '적요',
        format: (v) => nullableText(v),
      },
    ]

    if (!canManage) return base

    return [
      ...base,
      {
        key: 'actions',
        label: '관리',
        width: 160,
        filter: false,
        render: (row) => (
          <div style={actionRowStyle}>
            <Button size="sm" variant="secondary" onClick={() => setModal({ mode: 'edit', txn: row })}>
              수정
            </Button>
            <Button size="sm" variant="danger" onClick={() => setModal({ mode: 'delete', txn: row })}>
              삭제
            </Button>
          </div>
        ),
      },
    ]
  }, [canManage])

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>현금출납장</h1>
          <p style={descStyle}>
            아로로지스 간이 회계 — 현금 수입/지출을 기록하고 기간별 집계를 확인합니다.
          </p>
        </div>
        {canManage ? (
          <Button variant="primary" onClick={() => setModal({ mode: 'create' })}>
            거래 입력
          </Button>
        ) : null}
      </header>

      <div style={filterRowStyle}>
        <Select
          label="기간 방식"
          value={periodMode}
          onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
          selectSize="sm"
          fullWidth={false}
          data-testid="arologis-cashbook-period-mode"
        >
          <option value="month">월별</option>
          <option value="range">기간 지정</option>
        </Select>

        {periodMode === 'month' ? (
          <>
            <Input
              label="연도"
              type="number"
              value={String(year)}
              onChange={(e) => setYear(toIntOr(e.target.value, year))}
              fullWidth={false}
              data-testid="arologis-cashbook-year"
            />
            <Select
              label="월"
              value={String(month)}
              onChange={(e) => setMonth(toIntOr(e.target.value, month))}
              selectSize="sm"
              fullWidth={false}
              data-testid="arologis-cashbook-month"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </Select>
          </>
        ) : (
          <>
            <Input
              label="시작일"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              fullWidth={false}
              data-testid="arologis-cashbook-from"
            />
            <Input
              label="종료일"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              fullWidth={false}
              data-testid="arologis-cashbook-to"
            />
          </>
        )}

        <Select
          label="유형 필터"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CashTxnType | '')}
          selectSize="sm"
          fullWidth={false}
          data-testid="arologis-cashbook-type-filter"
        >
          <option value="">전체</option>
          <option value="INCOME">수입</option>
          <option value="EXPENSE">지출</option>
        </Select>

        <Button
          variant="secondary"
          size="sm"
          loading={txnsQuery.isFetching || summaryQuery.isFetching}
          disabled={!periodValid}
          onClick={() => {
            void txnsQuery.refetch()
            void summaryQuery.refetch()
          }}
        >
          새로고침
        </Button>
      </div>

      {!periodValid ? (
        <ErrorBanner message="시작일은 종료일보다 늦을 수 없습니다." />
      ) : null}

      <SummaryCards summary={summaryQuery.data} loading={summaryQuery.isLoading} error={summaryQuery.error} />

      {txnsQuery.error ? (
        <ErrorBanner message={toErrorMessage(txnsQuery.error, '거래 목록을 불러오지 못했습니다.')} />
      ) : null}

      <DataGrid
        columns={columns}
        rows={txns}
        rowKey={(row) => row.id}
        loading={txnsQuery.isLoading}
        emptyMessage="해당 기간의 거래가 없습니다."
        enableMultiSelect={false}
        enableCopy
        getRowTestId={(row) => `arologis-cash-txn-row-${row.id}`}
        className="arologis-cashbook-grid"
      />

      {canManage && (modal?.mode === 'create' || modal?.mode === 'edit') ? (
        <CashTxnFormModal
          mode={modal.mode}
          txn={modal.mode === 'edit' ? modal.txn : undefined}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            void refreshAll()
          }}
        />
      ) : null}

      {canManage && modal?.mode === 'delete' ? (
        <CashTxnDeleteModal
          txn={modal.txn}
          onClose={() => setModal(null)}
          onDeleted={() => {
            setModal(null)
            void refreshAll()
          }}
        />
      ) : null}
    </section>
  )
}

function SummaryCards({
  summary,
  loading,
  error,
}: {
  summary: CashSummaryView | undefined
  loading: boolean
  error: unknown
}): JSX.Element {
  if (error) {
    return <ErrorBanner message={toErrorMessage(error, '집계를 불러오지 못했습니다.')} />
  }

  const incomeTotal = summary?.incomeTotal ?? 0
  const expenseTotal = summary?.expenseTotal ?? 0
  const balance = summary?.balance ?? 0
  const count = summary?.count ?? 0

  return (
    <div style={cardRowStyle} data-testid="arologis-cashbook-summary">
      <SummaryCard label="수입 합" amount={incomeTotal} tone="income" loading={loading} />
      <SummaryCard label="지출 합" amount={expenseTotal} tone="expense" loading={loading} />
      <SummaryCard label="잔액" amount={balance} tone={balance < 0 ? 'expense' : 'balance'} loading={loading} />
      <div style={cardStyle}>
        <span style={cardLabelStyle}>거래 건수</span>
        <strong style={cardCountStyle}>{loading ? '…' : `${count.toLocaleString('ko-KR')}건`}</strong>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  amount,
  tone,
  loading,
}: {
  label: string
  amount: number
  tone: 'income' | 'expense' | 'balance'
  loading: boolean
}): JSX.Element {
  const amountStyle =
    tone === 'income' ? cardIncomeStyle : tone === 'expense' ? cardExpenseStyle : cardBalanceStyle
  return (
    <div style={cardStyle}>
      <span style={cardLabelStyle}>{label}</span>
      <strong style={amountStyle}>{loading ? '…' : `${formatAmount(amount)}원`}</strong>
    </div>
  )
}

function CashTxnFormModal({
  mode,
  txn,
  accounts,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  txn?: CashTxnView
  accounts: SimpleAccountView[]
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [type, setType] = useState<CashTxnType>(txn?.type ?? 'INCOME')
  const [txnDate, setTxnDate] = useState(txn?.txnDate ?? todayIso())
  const [accountCode, setAccountCode] = useState(txn?.accountCode ?? '')
  // edit 금액 초기화 — txn.amount 는 정수 원단위 가정(BE BigDecimal scale 0). 천단위 콤마로 표시한다.
  const [amount, setAmount] = useState(txn ? formatAmount(txn.amount) : '')
  const [partnerName, setPartnerName] = useState(txn?.partnerName ?? '')
  const [description, setDescription] = useState(txn?.description ?? '')
  const [error, setError] = useState<string | null>(null)

  // 거래 유형과 명백히 불일치하는 계정만 제외(수입↔EXPENSE, 지출↔INCOME) — BE assertTypeMatches 일치.
  const accountOptions = useMemo(
    () => buildAccountOptions(accounts, type, txn?.accountCode),
    [accounts, type, txn?.accountCode],
  )
  const selectedAccountIsStale = accountOptions.some(
    (account) => account.code === accountCode && account.disabled,
  )

  const buildBody = () => ({
    txnDate,
    type,
    partnerName: blankToNull(partnerName),
    amount: parseAmount(amount),
    accountCode,
    description: blankToNull(description),
  })

  const createMutation = useMutation({
    mutationFn: () => createCashTxn(buildBody()),
    onSuccess: onSaved,
    onError: (err) => setError(toErrorMessage(err, '거래 등록에 실패했습니다.')),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      // edit 모드에서는 txn 이 항상 존재한다(아래 호출부에서 mode==='edit' && txn 보장).
      if (!txn) throw new Error('수정할 거래가 없습니다.')
      return updateCashTxn(txn.id, buildBody())
    },
    onSuccess: onSaved,
    onError: (err) => setError(toErrorMessage(err, '거래 수정에 실패했습니다.')),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const amountValue = parseAmount(amount)
  const amountValid = amount.trim().length > 0 && Number.isFinite(amountValue) && amountValue > 0
  const canSubmit =
    amountValid
    && txnDate.length > 0
    && accountCode.length > 0
    && !selectedAccountIsStale

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!canSubmit || isPending) return
    setError(null)
    if (mode === 'create') createMutation.mutate()
    else updateMutation.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? '거래 입력' : '거래 수정'}
      size="lg"
      footer={
        <div style={modalFooterStyle}>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button variant="primary" loading={isPending} disabled={!canSubmit} onClick={() => submitForm('cash-txn-form')}>
            저장
          </Button>
        </div>
      }
    >
      <form id="cash-txn-form" onSubmit={handleSubmit} style={formColStyle}>
        {error ? <FormError message={error} /> : null}

        <div style={typeToggleRowStyle} role="group" aria-label="거래 유형">
          <Button
            type="button"
            variant={type === 'INCOME' ? 'primary' : 'secondary'}
            onClick={() => setType('INCOME')}
            data-testid="arologis-cash-txn-type-income"
          >
            수입
          </Button>
          <Button
            type="button"
            variant={type === 'EXPENSE' ? 'danger' : 'secondary'}
            onClick={() => setType('EXPENSE')}
            data-testid="arologis-cash-txn-type-expense"
          >
            지출
          </Button>
        </div>

        <div style={formGridStyle}>
          <Input
            label="일자"
            type="date"
            value={txnDate}
            onChange={(e) => setTxnDate(e.target.value)}
            required
          />
          <Select
            label="계정과목"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            required
            hint={selectedAccountIsStale ? '현재 거래 유형에 사용할 수 없는 계정입니다. 다른 계정을 선택하세요.' : undefined}
          >
            <option value="" disabled>계정 선택</option>
            {accountOptions.map((account) => (
              <option key={account.code} value={account.code} disabled={account.disabled}>
                {account.name} ({accountTypeLabel(account.type)})
              </option>
            ))}
          </Select>
          <Input
            label="금액"
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatAmountInput(e.target.value))}
            required
            hint={amount.trim().length > 0 && amountValid ? `${formatAmount(amountValue)}원` : '0보다 큰 금액을 입력하세요.'}
          />
          <Input
            label="거래처"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            maxLength={100}
          />
        </div>

        <label style={textareaLabelStyle}>
          <span>적요</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={255}
            rows={3}
            style={textareaStyle}
            placeholder="거래 내용을 입력하세요."
          />
        </label>
      </form>
    </Modal>
  )
}

function CashTxnDeleteModal({
  txn,
  onClose,
  onDeleted,
}: {
  txn: CashTxnView
  onClose: () => void
  onDeleted: () => void
}): JSX.Element {
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => deleteCashTxn(txn.id),
    onSuccess: onDeleted,
    onError: (err) => setError(toErrorMessage(err, '거래 삭제에 실패했습니다.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="거래 삭제"
      description={`${formatDate(txn.txnDate)} · ${txnTypeLabel(txn.type)}`}
      footer={
        <div style={modalFooterStyle}>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button
            variant="danger"
            loading={mutation.isPending}
            onClick={() => {
              setError(null)
              mutation.mutate()
            }}
          >
            삭제
          </Button>
        </div>
      }
    >
      <div style={formColStyle}>
        {error ? <FormError message={error} /> : null}
        <p style={{ margin: 0 }}>
          이 거래를 삭제하면 집계에서 제외됩니다. 계속하시겠습니까?
        </p>
        <dl style={detailListStyle}>
          <div style={detailRowStyle}>
            <dt style={detailLabelStyle}>금액</dt>
            <dd style={detailValueStyle}>
              {/* 표 행과 동일한 +/- 부호·색(수입 초록/지출 빨강)으로 통일. */}
              <span style={txn.type === 'INCOME' ? amountIncomeStyle : amountExpenseStyle}>
                {txn.type === 'EXPENSE' ? '-' : '+'}
                {formatAmount(txn.amount)}원
              </span>
            </dd>
          </div>
          <DetailRow label="계정" value={nullableText(txn.accountName)} />
          <DetailRow label="거래처" value={nullableText(txn.partnerName)} />
          <DetailRow label="적요" value={nullableText(txn.description)} />
        </dl>
      </div>
    </Modal>
  )
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={detailRowStyle}>
      <dt style={detailLabelStyle}>{label}</dt>
      <dd style={detailValueStyle}>{value}</dd>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }): JSX.Element {
  return <div role="alert" style={errorStyle}>{message}</div>
}

function FormError({ message }: { message: string }): JSX.Element {
  return <div role="alert" style={errorStyle}>{message}</div>
}

function submitForm(formId: string): void {
  const form = document.getElementById(formId) as HTMLFormElement | null
  form?.requestSubmit()
}

interface AccountOption extends SimpleAccountView {
  disabled?: boolean
}

/**
 * 거래 유형에 맞는 계정과목 옵션을 구성한다.
 *
 * 수입 거래는 EXPENSE 계정, 지출 거래는 INCOME 계정만 명백히 제외(disabled)한다 — BE
 * assertTypeMatches 와 동일. 현재 거래의 기존 계정이 목록에 없으면(비활성 등) "사용 불가" 표시로
 * 보존하여 수정 화면에서 사라지지 않게 한다.
 */
function buildAccountOptions(
  accounts: SimpleAccountView[],
  type: CashTxnType,
  currentCode?: string,
): AccountOption[] {
  const options: AccountOption[] = accounts.map((account) => ({
    ...account,
    disabled: isAccountDisabledForType(account.type, type),
  }))
  if (currentCode && !options.some((account) => account.code === currentCode)) {
    options.push({
      code: currentCode,
      name: `${currentCode} (사용 불가 계정)`,
      type: 'ASSET',
      displayOrder: Number.MAX_SAFE_INTEGER,
      disabled: true,
    })
  }
  return options
}

function isAccountDisabledForType(accountType: AccountType, txnType: CashTxnType): boolean {
  if (txnType === 'INCOME' && accountType === 'EXPENSE') return true
  if (txnType === 'EXPENSE' && accountType === 'INCOME') return true
  return false
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function nullableText(value: unknown): string {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

function txnTypeLabel(type: CashTxnType): string {
  return TXN_TYPE_LABELS[type] ?? type
}

function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPE_LABELS[type] ?? type
}

/** 천단위 콤마 금액 포맷(원화, 소수점 반올림). */
function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString('ko-KR')
}

/** 콤마 입력 문자열을 숫자로 환산(콤마 strip 후 파싱). 빈 값/비정상 입력은 NaN. */
function parseAmount(value: string): number {
  const digits = value.replace(/,/g, '').trim()
  if (digits.length === 0) return Number.NaN
  return Number(digits)
}

/**
 * 금액 입력 정규화 — 콤마/숫자 외 문자는 제거하고 천단위 콤마를 다시 부여한다.
 * 음수 입력은 부호 문자가 제거되어 자연히 차단된다(BE @Positive 정합).
 */
function formatAmountInput(value: string): string {
  const digits = value.replace(/[^\d]/g, '')
  if (digits.length === 0) return ''
  return Number(digits).toLocaleString('ko-KR')
}

function toIntOr(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 연-월을 해당 월 1일~말일 ISO 기간으로 환산(목록 조회용 — 집계는 BE year/month 사용). */
function monthToPeriodSafe(year: number, month: number): { from: string; to: string } {
  const safeMonth = Math.min(Math.max(month, 1), 12)
  const first = new Date(year, safeMonth - 1, 1)
  const last = new Date(year, safeMonth, 0)
  return { from: toIso(first), to: toIso(last) }
}

function firstDayOfMonthIso(d: Date): string {
  return toIso(new Date(d.getFullYear(), d.getMonth(), 1))
}

function todayIso(): string {
  return toIso(new Date())
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(value: string): string {
  if (!value) return '-'
  return value
}

function toErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as { message?: unknown } | undefined
    const message = typeof data?.message === 'string' ? data.message : undefined
    if (status === 403) return message ?? '해당 작업 권한이 없습니다.'
    if (status === 404) return message ?? '대상을 찾을 수 없습니다.'
    if (status === 409) return message ?? '거래 유형과 계정과목이 일치하지 않습니다.'
    if (message) return message
  }
  return fallback
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const headerStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }
const titleStyle: CSSProperties = { fontSize: 'var(--font-size-xl)', margin: 0 }
const descStyle: CSSProperties = { color: 'var(--color-text-muted)', margin: '6px 0 0' }
const filterRowStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }
const actionRowStyle: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' }
const modalFooterStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 }
const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }
const formColStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 }
const typeToggleRowStyle: CSSProperties = { display: 'flex', gap: 8 }
const textareaLabelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }
const textareaStyle: CSSProperties = {
  minHeight: 72,
  resize: 'vertical',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  padding: 10,
  font: 'inherit',
}
const cardRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
}
const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '16px 18px',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-surface, #fff)',
}
const cardLabelStyle: CSSProperties = { color: 'var(--color-text-muted)', fontSize: 13 }
const cardAmountBase: CSSProperties = { fontSize: 'var(--font-size-lg, 20px)', fontWeight: 700 }
const cardIncomeStyle: CSSProperties = { ...cardAmountBase, color: 'var(--state-success, #15803d)' }
const cardExpenseStyle: CSSProperties = { ...cardAmountBase, color: 'var(--state-danger, #b91c1c)' }
const cardBalanceStyle: CSSProperties = { ...cardAmountBase, color: 'var(--color-text, #111827)' }
const cardCountStyle: CSSProperties = { ...cardAmountBase, color: 'var(--color-text, #111827)' }
const amountBase: CSSProperties = { fontWeight: 600 }
const amountIncomeStyle: CSSProperties = { ...amountBase, color: 'var(--state-success, #15803d)' }
const amountExpenseStyle: CSSProperties = { ...amountBase, color: 'var(--state-danger, #b91c1c)' }
const detailListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, margin: 0 }
const detailRowStyle: CSSProperties = { display: 'flex', gap: 12 }
const detailLabelStyle: CSSProperties = { width: 64, color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }
const detailValueStyle: CSSProperties = { margin: 0 }
const errorStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--state-danger, #dc2626)',
  borderRadius: 4,
  background: 'var(--state-danger-bg, #fee2e2)',
  color: 'var(--state-danger, #b91c1c)',
}
