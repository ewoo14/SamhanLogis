import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
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
  clearBankTransactionMatchAndDeleteMapping,
  listBankTransactionFilterLabels,
  listBankTransactions,
  loadBankTransactionFilterPreferences,
  matchBankTransactionPartner,
  saveBankTransactionFilterPreferences,
  createBankDepositReceipt,
  type BankMatchStatus,
  type BankDepositReceiptRequest,
  type BankTransactionRow,
} from '../api/accounting'
import { searchPartners } from '../api/partnerApi'
import { PartnerLookupErrorBanner } from '../components/common/PartnerLookupErrorBanner'
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
import { BankDepositReceiptModal } from './BankDepositReceiptModal'
import {
  bankDepositReceiptAccountsLabel,
  bankDepositReceiptPrunedSelectedRowKeys,
  bankDepositReceiptSelectionDisabledReason,
  bankDepositReceiptSelectionLimitExceeded,
  bankDepositReceiptSelectionSummary,
  bankDepositReceiptSelectedRows,
  bankDepositReceiptSelectableRows,
  bankTransactionRowKey,
  isBankDepositReceiptSelectable,
  MAX_BANK_DEPOSIT_RECEIPT_SELECTION,
} from './BankDepositReceiptModal.model'
import { CodefImportScopeForm } from './components/CodefImportScopeForm'
import {
  formatCashReceiptAmount,
  formatCashReceiptAmountUnit,
  truncatePartnerName,
} from './CashReceiptListPage.model'
import { localMonthStartIso, localTodayIso } from './localDate'

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

function formatDateTime(value: string): string {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

function amountStyle(row: BankTransactionRow): React.CSSProperties {
  return {
    color: row.txnType === 'WITHDRAWAL' ? 'var(--state-danger)' : undefined,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
    display: 'inline-block',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
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

const PARTNER_MATCH_SOURCE_META = {
  MANUAL: { label: '수동', variant: 'neutral' as const },
  DEPOSITOR_MAPPING: { label: '자동·입금자명', variant: 'brand' as const },
  PARTNER_CODE_EXACT: { label: '자동·코드일치', variant: 'nts' as const },
} as const

export function partnerMatchEvidence(row: BankTransactionRow) {
  const source = row.partnerMatchSource
  if (!source) return null
  const meta = PARTNER_MATCH_SOURCE_META[source]
  if (!meta) return null
  const title = row.appliedMappingRawName
    ? `입금자명 '${row.appliedMappingRawName}' 규칙 적용`
    : undefined
  return (
    <span title={title} style={{ display: 'inline-flex', marginLeft: 6 }}>
      <Badge variant={meta.variant}>{meta.label}</Badge>
    </span>
  )
}

function matchedPartnerDisplay(row: BankTransactionRow) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap' }}>
      <span>{bankTransactionPartnerDisplay(row)}</span>
      {partnerMatchEvidence(row)}
    </span>
  )
}

function transactionAmount(row: BankTransactionRow, type: 'DEPOSIT' | 'WITHDRAWAL'): string {
  return row.txnType === type ? formatCashReceiptAmount(row.amount) : '—'
}

function BankTransactionDetailToggle({
  row,
  expanded,
  onToggle,
}: {
  row: BankTransactionRow
  expanded: boolean
  onToggle: (button: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      data-testid={`bank-transaction-detail-toggle-${row.externalRef}`}
      // [#929 재수렴 3차 V2] data-testid 는 externalRef 단독이라 CARD/LOAN 소스처럼
      // (날짜, 순번) 참조를 계좌마다 재사용하는 행에서 중복된다(리뷰 실측: 기본 화면
      // 28행 중 10그룹 24행). data-row-key 는 bankTransactionRowKey(개방·선택·강조가
      // 이미 쓰는 유일 복합키)를 그대로 담아 findDetailToggleButton 재탐색이 정확히
      // 그 행으로 복귀하게 한다 — data-testid/aria-controls 는 기존 테스트 호환을 위해
      // 그대로 둔다.
      data-row-key={bankTransactionRowKey(row)}
      aria-expanded={expanded}
      aria-controls={`bank-transaction-detail-${row.externalRef}`}
      onClick={(event) => onToggle(event.currentTarget)}
      style={{
        display: 'block',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        padding: '4px 0',
        border: 0,
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        fontWeight: 600,
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        textAlign: 'left',
      }}
    >
      {expanded ? '▼' : '▶'} 상세 보기
    </button>
  )
}

/**
 * [머지 전 재수렴 S1·S2] 패널은 표 밖 전폭에 렌더돼 클릭한 행에서 물리적으로 멀어질 수
 * 있다(316행이면 24,231px). 어느 거래의 상세인지 패널 "안"에서만 보고도 알 수 있도록
 * 거래일·적요·거래처·금액을 머리글에 낸다(DailyClosingPage.selected-scope 선례와
 * 동일 역할) — 계좌·카드·대출 등 나머지 필드가 같은 거래끼리도 이 머리글로 구별된다.
 * onClose 는 원래 클릭했던 토글 버튼으로 돌아가는 닫기 컨트롤(S2) — 패널 안에서
 * 접을 수 있어 원행까지 스크롤해 올라가지 않아도 된다.
 */
function BankTransactionDetailPanel({ row, onClose }: { row: BankTransactionRow; onClose: () => void }) {
  return (
    <section
      id={`bank-transaction-detail-${row.externalRef}`}
      data-testid={`bank-transaction-detail-${row.externalRef}`}
      role="region"
      aria-label={`${row.description} 상세`}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        marginTop: 8,
        padding: '12px 16px',
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 6,
        background: 'var(--color-neutral-50)',
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div data-testid={`bank-transaction-detail-scope-${row.externalRef}`} style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <strong style={{ overflowWrap: 'anywhere' }}>{formatDateTime(row.transactedAt)} · {row.description}</strong>
          <span style={{ color: 'var(--color-neutral-500)', fontSize: 12, overflowWrap: 'anywhere' }}>
            {/* [#929 재수렴 T3] formatCashReceiptAmount 는 0/null 을 '—' 로 반환 — 단위는
                formatCashReceiptAmountUnit 하나로만 붙인다(placeholder 에 '원' 금지). */}
            {row.counterpartyName || row.matchedPartnerName || '거래처 미상'} · {row.txnType === 'DEPOSIT' ? '입금' : '출금'} {formatCashReceiptAmountUnit(row.amount)}
          </span>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          닫기
        </Button>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '4px 12px', margin: 0, fontSize: 12 }}>
        <dt>거래 유형</dt><dd style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{BANK_TXN_TYPE_LABEL[row.txnType]}</dd>
        <dt>계좌·카드·대출</dt><dd style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{row.bankAccountLabel || '—'}</dd>
        <dt>상대 계좌</dt><dd style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{row.counterpartyAccount || '—'}</dd>
        <dt>소스</dt><dd style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{BANK_TXN_SOURCE_LABEL[row.source]}</dd>
        <dt>법인카드</dt><dd style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{row.cardName || '—'}</dd>
        <dt>승인번호</dt><dd style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{row.approvalId || '—'}</dd>
        <dt>대출명</dt><dd style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{row.loanName || '—'}</dd>
        <dt>입금보고서 전표</dt><dd data-testid={`bank-transaction-detail-cash-receipt-slip-${row.externalRef}`} style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{row.cashReceiptSlipNo || '—'}</dd>
        <dt>매칭 근거</dt><dd style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{row.partnerMatchSource ? PARTNER_MATCH_SOURCE_META[row.partnerMatchSource]?.label ?? '—' : '—'}</dd>
        <dt>입금자명 원문</dt><dd style={{ minWidth: 0, margin: 0, overflowWrap: 'anywhere' }}>{row.appliedMappingRawName || '—'}</dd>
      </dl>
    </section>
  )
}

type BankTransactionListColumnKey =
  | 'depositReceiptSelection'
  | 'transactedAt'
  | 'description'
  | 'matchedPartnerCode'
  | 'depositAmount'
  | 'withdrawalAmount'
  | 'balanceAfter'
  | 'source'
  | 'matchStatus'
  | 'detail'

interface BankTransactionColumnContext {
  activeTab: StatusTab
  activeSourceTab: SourceTab
  canCreateBankDepositReceipt: boolean
  canDeleteAppliedMapping: boolean
  canUpdate: boolean
  pending: boolean
  selectedRowKeys: Set<string>
  expandedRowKey: string | null
  toggleReceiptRow: (row: BankTransactionRow, checked: boolean) => void
  onMatch: (row: BankTransactionRow, partner: PartnerOption) => void
  onClear: (row: BankTransactionRow) => void
  onDeleteMapping: (row: BankTransactionRow) => void
  onToggleDetail: (row: BankTransactionRow, button: HTMLButtonElement) => void
}

interface BankTransactionColumnDefinition {
  key: BankTransactionListColumnKey
  header: string
  width: string
  align?: 'left' | 'right' | 'center'
  mobilePriority?: 'primary' | 'secondary' | 'hidden'
  visible?: (context: BankTransactionColumnContext) => boolean
  render: (row: BankTransactionRow, context: BankTransactionColumnContext) => React.ReactNode
}

/**
 * #897 입출금 목록 열 정의의 단일 출처.
 *
 * API 원문·계좌 식별·카드 승인·대출명·입금보고서 전표는 상세 패널에서 유지한다.
 * 목록에 열을 추가·제거·순서 변경할 때는 이 배열만 수정하고, export/인쇄 데이터는
 * API 원본 행을 그대로 사용하므로 이 화면 집합의 영향을 받지 않는다.
 */
export const BANK_TRANSACTION_LIST_COLUMN_DEFINITIONS: readonly BankTransactionColumnDefinition[] = [
  {
    key: 'depositReceiptSelection',
    header: '선택',
    width: '7%',
    mobilePriority: 'secondary',
    visible: ({ canCreateBankDepositReceipt }) => canCreateBankDepositReceipt,
    render: (row, context) => {
      const selectable = isBankDepositReceiptSelectable(row)
      const disabledReason = bankDepositReceiptSelectionDisabledReason(row)
      const key = bankTransactionRowKey(row)
      return (
        <label className="bank-transaction-select-cell" title={disabledReason || undefined}>
          <input
            type="checkbox"
            checked={selectable && context.selectedRowKeys.has(key)}
            disabled={!selectable}
            onChange={(event) => context.toggleReceiptRow(row, event.target.checked)}
            aria-label={`${formatDateTime(row.transactedAt)} ${row.description} 선택`}
            data-testid={`bank-transaction-select-${row.externalRef}`}
          />
        </label>
      )
    },
  },
  {
    key: 'transactedAt',
    header: '거래일',
    width: '10%',
    mobilePriority: 'primary',
    render: (row) => formatDateTime(row.transactedAt),
  },
  {
    key: 'description',
    header: '적요',
    width: '14%',
    mobilePriority: 'secondary',
    // [머지 전 재수렴 R2] 계좌/카드/대출 라벨이 상세로만 옮겨간 뒤 날짜·적요·거래처·금액이
    // 같은 서로 다른 계좌 거래가 목록에서 구별되지 않았다(316행 중 288행, 91%). 열을
    // 복원하지 않고 이 칸의 정보 밀도를 높여 C5(목록만으로 서로 다른 거래는 구별된다)를
    // 충족한다 — 상세를 열지 않아도 계좌·카드·대출 라벨이 3번째 줄로 보인다.
    render: (row) => (
      <span style={{ display: 'grid', minWidth: 0, gap: 2, overflowWrap: 'anywhere' }}>
        <strong>{row.description}</strong>
        <span style={{ color: 'var(--color-neutral-500)', fontSize: 12 }}>{row.counterpartyName || '거래처 미상'}</span>
        <span
          style={{ color: 'var(--color-neutral-500)', fontSize: 11 }}
          data-testid={`bank-transaction-account-label-${row.externalRef}`}
        >
          {row.bankAccountLabel || '—'}
        </span>
      </span>
    ),
  },
  {
    key: 'matchedPartnerCode',
    header: '거래처',
    width: '17%',
    mobilePriority: 'secondary',
    render: (row, context) => {
      if (row.source === 'CODEF_LOAN') {
        return (
          <span style={{ color: 'var(--color-neutral-500)', fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' }}>
            대출 거래는 거래처 매칭 대상이 아닙니다
          </span>
        )
      }
      if (row.matchStatus !== 'UNREFLECTED') return matchedPartnerDisplay(row)
      const matched = partnerValueOf(row)
      return (
        <div className="bank-transaction-partner-match" style={{ display: 'grid', gridTemplateColumns: matched ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)', gap: 8, alignItems: 'end', minWidth: 0 }}>
          <div data-testid={`bank-transaction-partner-search-${row.source}-${row.externalRef}`} style={{ minWidth: 0 }}>
            <PartnerAutocomplete
              label=""
              ariaLabel={`${row.counterpartyName ?? '통장 거래'} 거래처 검색`}
              placeholder="거래처명/코드"
              value={matched}
              onChange={(partner) => {
                if (partner) context.onMatch(row, partner)
              }}
              searchPartners={searchPartners}
              disabled={!context.canUpdate || context.pending}
              minChars={1}
              debounceMs={200}
            />
            {matched ? partnerMatchEvidence(row) : null}
          </div>
          {matched ? (
            <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!context.canUpdate || context.pending}
                onClick={() => context.onClear(row)}
              >
                이 거래만 해제
              </Button>
              {row.partnerMatchSource === 'DEPOSITOR_MAPPING' && context.canDeleteAppliedMapping ? (
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={!context.canUpdate || context.pending}
                  onClick={() => context.onDeleteMapping(row)}
                  data-testid={`bank-transaction-delete-mapping-${row.externalRef}`}
                >
                  매핑도 삭제
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )
    },
  },
  {
    key: 'depositAmount',
    header: '입금',
    width: '9%',
    align: 'right',
    mobilePriority: 'secondary',
    render: (row) => <span style={amountStyle(row)}>{transactionAmount(row, 'DEPOSIT')}</span>,
  },
  {
    key: 'withdrawalAmount',
    header: '출금',
    width: '9%',
    align: 'right',
    mobilePriority: 'secondary',
    render: (row) => <span style={amountStyle(row)}>{transactionAmount(row, 'WITHDRAWAL')}</span>,
  },
  {
    key: 'balanceAfter',
    header: '잔액',
    width: '10%',
    align: 'right',
    mobilePriority: 'secondary',
    render: (row) => (
      <span style={{ display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere' }}>
        {formatCashReceiptAmount(row.balanceAfter)}
      </span>
    ),
  },
  {
    key: 'source',
    header: '소스',
    width: '8%',
    mobilePriority: 'secondary',
    visible: ({ activeSourceTab }) => activeSourceTab === 'ALL',
    render: (row) => BANK_TXN_SOURCE_LABEL[row.source],
  },
  {
    key: 'matchStatus',
    header: '매칭상태',
    width: '8%',
    mobilePriority: 'secondary',
    visible: ({ activeTab }) => activeTab === 'ALL',
    render: (row) => (
      <span style={statusStyle(row.matchStatus)}>
        {BANK_MATCH_STATUS_LABEL[row.matchStatus]}
      </span>
    ),
  },
  {
    key: 'detail',
    header: '상세',
    width: '8%',
    mobilePriority: 'secondary',
    render: (row, context) => (
      <BankTransactionDetailToggle
        row={row}
        expanded={context.expandedRowKey === bankTransactionRowKey(row)}
        onToggle={(button) => context.onToggleDetail(row, button)}
      />
    ),
  },
]

/** 목록 순서를 검증·문서화할 때 사용하는 파생 키 목록. 실제 렌더링은 위 정의를 직접 사용한다. */
export const BANK_TRANSACTION_LIST_COLUMN_KEYS = BANK_TRANSACTION_LIST_COLUMN_DEFINITIONS.map((column) => column.key)

export function BankTransactionPage() {
  usePageTitle('입출금 내역', '거래내역 가져오기')

  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canCreate = canAccess('accounting.bank-matching', 'create')
  const canUpdate = canAccess('accounting.bank-matching', 'update')
  // BE 계약(#810): clear-and-delete-mapping 은 bank-matching:UPDATE + deposit-mapping:DELETE 를 모두 강제한다.
  // 버튼 가시성은 deposit-mapping:DELETE, 활성화는 bank-matching:UPDATE(canUpdate) 로 게이트한다.
  const canDeleteAppliedMapping = canAccess('accounting.deposit-mapping', 'delete')
  const canCreateBankDepositReceipt = canAccess('accounting.cash-receipts', 'update')
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL')
  const [activeSourceTab, setActiveSourceTab] = useState<SourceTab>('ALL')
  const [filters, setFilters] = useState<LabelFilters>({
    from: localMonthStartIso(),
    to: localTodayIso(),
    accountLabels: [],
    cardLabels: [],
  })
  const [queryFilters, setQueryFilters] = useState(filters)
  const [filterModal, setFilterModal] = useState<FilterModalKind | null>(null)
  const [draftLabels, setDraftLabels] = useState<string[]>([])
  const [filterSelectionTouched, setFilterSelectionTouched] = useState(false)
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set())
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [mappingDeleteRow, setMappingDeleteRow] = useState<BankTransactionRow | null>(null)
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null)
  /**
   * [머지 전 재수렴 R1] 상세 패널은 항상 표 전체 아래에 렌더된다(316행이면 22,984px 아래).
   * DailyClosingPage.revealDailyClosingDetail 선례와 동일하게, 펼침 시 패널을 뷰포트로
   * scrollIntoView 하고 focus 를 옮겨 "클릭 시점에 값이 눈에 들어온다"(C2')를 보장한다.
   * 패널은 expandedRow 유무와 무관하게 이 wrapper 가 항상 마운트돼 있어야 ref 가 안정적이다.
   */
  const detailPanelRef = useRef<HTMLDivElement | null>(null)
  /**
   * [머지 전 재수렴 S2 · #929 재수렴 T4 · #929 재수렴 3차 V2] 패널의 "닫기" 컨트롤이
   * 원래 클릭했던 토글 버튼으로 돌아가기 위한 식별자 — 원행이 몇천 px 떨어져 있어도
   * 그 자리로 되돌아갈 수 있다(관계가 화면에서 유지된다).
   *
   * <p>원래는 클릭 시점의 DOM 노드 자체(HTMLButtonElement)를 ref 에 담았으나,
   * transactionsQuery 의 queryKey(activeTab 등)가 바뀌면 로딩 중 rows=[] 를 거쳐
   * 행 DOM 이 전부 언마운트되고 새 노드로 재생성된다 — 담아둔 노드는 detached 상태가
   * 되어 focus()/scrollIntoView() 가 무동작이었다(포커스가 body 로 소실). 대신
   * bankTransactionRowKey(안정적 복합 자연키)만 보관하고, 닫을 때마다 현재 라이브
   * DOM 에서 그 키로 버튼을 다시 찾는다 — DailyClosingPage.selectedDetailRow 가
   * 스냅샷 대신 listQuery.data 에서 매 렌더 재도출하는 것과 같은 방향(단일 소스를
   * 항상 "현재" 상태에서 다시 얻는다).
   *
   * <p>[#929 재수렴 3차 V2] 이전에는 externalRef 단독을 보관했다 — CARD/LOAN 소스가
   * (날짜, 순번) 참조를 계좌마다 재사용해 externalRef 가 중복되면(리뷰 실측: 기본
   * 화면 28행 중 10그룹 24행) document 순서상 첫 매치로 복귀해 클릭한 행과 어긋났다.
   * 개방·선택·강조 축은 이미 bankTransactionRowKey(복합키)를 쓴다 — 복귀 축도 같은
   * 키로 맞춰 두 축을 일치시킨다.
   */
  const lastToggledRowKeyRef = useRef<string | null>(null)

  /** data-row-key(복합키)로 현재 라이브 DOM 에서 특정 행의 상세 토글 버튼을 다시 찾는다. */
  function findDetailToggleButton(rowKey: string): HTMLButtonElement | null {
    for (const el of document.querySelectorAll<HTMLButtonElement>('button[data-row-key]')) {
      if (el.dataset.rowKey === rowKey) return el
    }
    return null
  }

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
      // 수동 매칭은 입금자명 매핑 학습(upsert)을 동반하므로 매핑 목록 캐시도 무효화한다.
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'deposit-mappings'] })
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

  const clearAndDeleteMappingMutation = useMutation({
    mutationFn: clearBankTransactionMatchAndDeleteMapping,
    onSuccess: async () => {
      setMappingDeleteRow(null)
      setToast({ type: 'success', message: '거래를 해제하고 입금자명 매핑을 삭제했습니다.' })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions'] })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'deposit-mappings'] })
    },
    onError: (err: Error) => setToast({ type: 'error', message: `매핑 삭제 실패: ${err.message}` }),
  })

  const createBankDepositReceiptMutation = useMutation({
    mutationFn: (request: BankDepositReceiptRequest) => createBankDepositReceipt(request),
    onSuccess: async (created) => {
      setReceiptModalOpen(false)
      setSelectedRowKeys(new Set())
      setToast({ type: 'success', message: `${created.slipNo} 입금보고서를 생성했습니다.` })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions'] })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'cash-receipts'] })
    },
    onError: async (err: Error) => {
      setToast({ type: 'error', message: `입금보고서 생성 실패: ${err.message}` })
      // 409 race: stale selected rows must be dropped after the server says they are no longer creatable.
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-transactions'] })
    },
  })

  const rawRows = transactionsQuery.data ?? []
  const rows = useMemo(
    () => rawRows.filter((row) => activeSourceTab === 'ALL' || row.source === activeSourceTab),
    [activeSourceTab, rawRows],
  )
  useEffect(() => {
    if (!canCreateBankDepositReceipt) return
    setSelectedRowKeys((prev) => {
      const next = bankDepositReceiptPrunedSelectedRowKeys(rows, prev)
      const unchanged = next.size === prev.size && Array.from(next).every((key) => prev.has(key))
      return unchanged ? prev : next
    })
  }, [canCreateBankDepositReceipt, rows])

  useEffect(() => {
    if (!canCreateBankDepositReceipt) {
      setSelectedRowKeys((prev) => prev.size === 0 ? prev : new Set())
    }
  }, [canCreateBankDepositReceipt])

  const selectableRows = useMemo(
    () => canCreateBankDepositReceipt ? bankDepositReceiptSelectableRows(rows) : [],
    [canCreateBankDepositReceipt, rows],
  )
  const selectedRows = useMemo(
    () => canCreateBankDepositReceipt ? bankDepositReceiptSelectedRows(rows, selectedRowKeys) : [],
    [canCreateBankDepositReceipt, rows, selectedRowKeys],
  )
  const selectedSummary = useMemo(
    () => bankDepositReceiptSelectionSummary(selectedRows),
    [selectedRows],
  )
  const selectableAllSelected = selectableRows.length > 0
    && selectableRows.every((row) => selectedRowKeys.has(bankTransactionRowKey(row)))
  const selectableSomeSelected = selectedRows.length > 0
  const selectionLimitExceeded = bankDepositReceiptSelectionLimitExceeded(selectedRows)

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = selectableSomeSelected && !selectableAllSelected
    }
  }, [selectableAllSelected, selectableSomeSelected])
  const totalDeposit = rows
    .filter((row) => row.txnType === 'DEPOSIT')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalWithdrawal = rows
    .filter((row) => row.txnType === 'WITHDRAWAL')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const expandedRow = expandedRowKey
    ? rows.find((row) => bankTransactionRowKey(row) === expandedRowKey) ?? null
    : null

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

  function toggleReceiptRow(row: BankTransactionRow, checked: boolean) {
    if (!canCreateBankDepositReceipt) return
    if (!isBankDepositReceiptSelectable(row)) return
    const key = bankTransactionRowKey(row)
    setSelectedRowKeys((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function toggleAllReceiptRows() {
    if (!canCreateBankDepositReceipt) return
    setSelectedRowKeys((prev) => {
      const next = new Set(prev)
      if (selectableAllSelected) {
        for (const row of selectableRows) next.delete(bankTransactionRowKey(row))
      } else {
        for (const row of selectableRows) next.add(bankTransactionRowKey(row))
      }
      return next
    })
  }

  const columns = useMemo<DataTableColumn<BankTransactionRow>[]>(() => {
    const context: BankTransactionColumnContext = {
      activeTab,
      activeSourceTab,
      canCreateBankDepositReceipt,
      canDeleteAppliedMapping,
      canUpdate,
      pending: matchPartnerMutation.isPending || clearPartnerMutation.isPending || clearAndDeleteMappingMutation.isPending,
      selectedRowKeys,
      expandedRowKey,
      toggleReceiptRow,
      onMatch: (row, partner) => matchPartnerMutation.mutate({
        bankAccountLabel: row.bankAccountLabel,
        transactedAt: row.transactedAt,
        amount: row.amount,
        externalRef: row.externalRef,
        partnerCode: partner.partnerCode,
      }),
      onClear: (row) => clearPartnerMutation.mutate({
        bankAccountLabel: row.bankAccountLabel,
        transactedAt: row.transactedAt,
        amount: row.amount,
        externalRef: row.externalRef,
      }),
      onDeleteMapping: setMappingDeleteRow,
      onToggleDetail: (row, button) => {
        const key = bankTransactionRowKey(row)
        const next = expandedRowKey === key ? null : key
        setExpandedRowKey(next)
        if (next !== null) {
          lastToggledRowKeyRef.current = key
          // [머지 전 재수렴 R1·S1·S2] 펼치는 동작일 때만 스크롤·포커스 이동 — 접을 때는
          // 대상이 없다. focus() 의 preventScroll 기본값은 false 라 scrollIntoView 보다
          // 먼저 즉시(비-smooth) 스크롤을 일으켜 뒤따르는 smooth 스크롤을 무의미하게
          // 만든다(1프레임 순간이동 — 리뷰 실측 scrollY [0,535,24504], 중간 프레임 0개).
          // preventScroll:true 로 focus 자체의 암묵적 스크롤을 끄고 scrollIntoView 의
          // smooth 애니메이션만 실제로 재생되게 한다.
          window.setTimeout(() => {
            detailPanelRef.current?.focus({ preventScroll: true })
            detailPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
          }, 0)
        }
      },
    }
    return BANK_TRANSACTION_LIST_COLUMN_DEFINITIONS
      .filter((definition) => definition.visible?.(context) ?? true)
      .map((definition) => ({
        key: definition.key,
        header: definition.header,
        width: definition.width,
        align: definition.align,
        mobilePriority: definition.mobilePriority,
        render: (row: BankTransactionRow) => definition.render(row, context),
      }))
  }, [activeSourceTab, activeTab, canCreateBankDepositReceipt, canDeleteAppliedMapping, canUpdate, clearAndDeleteMappingMutation.isPending, clearPartnerMutation.isPending, expandedRowKey, matchPartnerMutation.isPending, selectedRowKeys])

  /**
   * [머지 전 재수렴 S2] 패널 안의 "닫기" — 접은 뒤 마지막으로 클릭했던 토글 버튼으로
   * 되돌아간다(포커스+스크롤). 원행이 패널에서 몇천 px 떨어져 있어도 사용자가 그
   * 자리로 복귀할 수 있어 "클릭한 행과 패널의 관계가 화면에서 유지된다."
   */
  function closeDetailPanel() {
    const rowKey = lastToggledRowKeyRef.current
    setExpandedRowKey(null)
    if (rowKey) {
      window.setTimeout(() => {
        // [#929 재수렴 T4 · #929 재수렴 3차 V2] 여기서 다시 찾는다 — 패널이 열려 있던
        // 동안 재조회로 행이 재생성됐을 수 있어(위 ref 주석) 클릭 시점에 담아둔 노드가
        // 아니라 지금 라이브 DOM 의 노드를 대상으로 focus/scroll 해야 한다. rowKey(복합
        // 키)로 찾아 externalRef 중복 행에서도 클릭한 바로 그 행으로 복귀한다.
        const button = findDetailToggleButton(rowKey)
        button?.focus({ preventScroll: true })
        button?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      }, 0)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>입출금 내역</h3>
          {/* 502(PARTNER_IDENTITY_LOOKUP_UNAVAILABLE) 시 rows 는 빈 배열이라 이 요약이 "입금 —·
              출금 —·0건"으로 보이면 "거래가 없다"로 오인된다(#831 R-1, PM 라이브QA: 316행 중 4건
              매칭 실패로 312행까지 함께 사라짐) — isError 시 렌더하지 않는다. */}
          {!transactionsQuery.isError ? (
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-neutral-500)' }}>
              입금 {formatCashReceiptAmount(totalDeposit)} · 출금 {formatCashReceiptAmount(totalWithdrawal)} · {rows.length}건
            </div>
          ) : null}
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
          initialFrom={localMonthStartIso()}
          initialTo={localTodayIso()}
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
              const reset = { from: localMonthStartIso(), to: localTodayIso(), accountLabels: [], cardLabels: [] }
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
                  {transactionsQuery.isError ? (
                    // #831 R-1(PM 라이브QA 확증): 316행 중 4건만 거래처 매칭돼도 배치 조회가
                    // 502 가 되면 나머지 312행까지 함께 사라져 "거래가 없다"로 오인된다.
                    // 빈 표/불러그 대신 장애 안내 + 재시도를 렌더한다.
                    <PartnerLookupErrorBanner
                      error={transactionsQuery.error}
                      onRetry={() => transactionsQuery.refetch()}
                      subject="입출금 내역"
                      testId="bank-transaction-error"
                    />
                  ) : (
                    <>
                      <div
                        className="bank-transaction-bulk-bar"
                        data-testid="bank-transaction-bulk-bar"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap',
                          marginBottom: 12,
                          padding: '10px 12px',
                          border: '1px solid var(--color-neutral-200)',
                          borderRadius: 6,
                          background: 'var(--color-neutral-50)',
                          fontSize: 13,
                        }}
                      >
                        {canCreateBankDepositReceipt ? (
                          <label className="bank-transaction-select-cell">
                            <input
                              ref={selectAllCheckboxRef}
                              type="checkbox"
                              checked={selectableAllSelected}
                              disabled={selectableRows.length === 0}
                              onChange={toggleAllReceiptRows}
                              aria-label="전체 선택"
                              data-testid="bank-transaction-select-all"
                            />
                            <span>전체 선택</span>
                          </label>
                        ) : null}
                        <span>
                          선택 <strong>{selectedSummary.count.toLocaleString('ko-KR')}</strong>건
                        </span>
                        <span>
                          {/* [#929 재수렴 T3] 선택 0건이면 totalAmount=0 → formatCashReceiptAmount
                              가 '—' 를 반환한다 — Unit 래퍼로 placeholder 에 '원' 을 붙이지 않는다. */}
                          합산 <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCashReceiptAmountUnit(selectedSummary.totalAmount)}</strong>
                        </span>
                        <span>
                          거래처 <strong title={selectedSummary.partnerName}>{truncatePartnerName(selectedSummary.partnerName)}</strong>
                        </span>
                        {selectedSummary.accountLabels.length > 0 ? (
                          // [머지 전 재수렴 R2] 목록에서 계좌가 상세로 옮겨간 뒤 "어느 계좌의
                          // 입금을 체크했는지 모른 채 전표를 생성한다"는 업무 차단을 닫는다.
                          <span data-testid="bank-transaction-selection-accounts">
                            계좌{' '}
                            <strong title={selectedSummary.accountLabels.join(', ')}>
                              {bankDepositReceiptAccountsLabel(selectedSummary.accountLabels)}
                            </strong>
                          </span>
                        ) : null}
                        {selectedSummary.mixedPartner ? (
                          <span className="bank-transaction-blocking-warning" role="alert" data-testid="bank-transaction-mixed-partner-warning">
                            동일 거래처만 선택하세요
                          </span>
                        ) : null}
                        {selectionLimitExceeded ? (
                          <span className="bank-transaction-blocking-warning" role="alert" data-testid="bank-transaction-limit-warning">
                            최대 {MAX_BANK_DEPOSIT_RECEIPT_SELECTION.toLocaleString('ko-KR')}건까지 생성할 수 있습니다
                          </span>
                        ) : null}
                        {!canCreateBankDepositReceipt ? (
                          <span role="note" style={{ color: 'var(--color-neutral-500)', fontWeight: 600 }}>
                            입금보고서 생성 권한이 없습니다
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          style={{ marginLeft: 'auto' }}
                          disabled={
                            !canCreateBankDepositReceipt
                            || selectedRows.length === 0
                            || selectedSummary.mixedPartner
                            || selectionLimitExceeded
                            || createBankDepositReceiptMutation.isPending
                          }
                          onClick={() => setReceiptModalOpen(true)}
                          data-testid="bank-transaction-create-receipt"
                        >
                          입금보고서 생성
                        </Button>
                      </div>
                      <DataTable<BankTransactionRow>
                        columns={columns}
                        rows={rows}
                        rowKey={bankTransactionRowKey}
                        // [머지 전 재수렴 S2] 펼친 행에 시각적 표식을 남겨, 패널이 화면
                        // 밖으로 멀리 스크롤돼도 사용자가 되돌아왔을 때 어느 행이었는지
                        // 알 수 있게 한다(리뷰 실측: 14행 전수 bg 무변화·표식 없음).
                        rowClassName={(row) => expandedRowKey === bankTransactionRowKey(row) ? 'bank-transaction-row-expanded' : undefined}
                        emptyMessage={transactionsQuery.isLoading ? '조회 중' : '입출금 거래가 없습니다'}
                        tableLayout="fixed"
                      />
                      <div ref={detailPanelRef} tabIndex={-1} style={{ outline: 'none' }}>
                        {expandedRow ? <BankTransactionDetailPanel row={expandedRow} onClose={closeDetailPanel} /> : null}
                      </div>
                    </>
                  )}
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

      <BankDepositReceiptModal
        open={receiptModalOpen}
        rows={selectedRows}
        submitting={createBankDepositReceiptMutation.isPending}
        onClose={() => setReceiptModalOpen(false)}
        onCreate={(request) => createBankDepositReceiptMutation.mutate(request)}
      />

      <Modal
        open={mappingDeleteRow !== null}
        onClose={() => {
          if (clearAndDeleteMappingMutation.isPending) return
          setMappingDeleteRow(null)
        }}
        title="입금자명 매핑 삭제"
        size="sm"
        footer={(
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMappingDeleteRow(null)}
              disabled={clearAndDeleteMappingMutation.isPending}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              // 진입 버튼과 동일 가드(BE 계약 #810) — 모달이 열린 채 권한이 바뀌어도 fail-closed.
              disabled={!canUpdate || !canDeleteAppliedMapping}
              loading={clearAndDeleteMappingMutation.isPending}
              onClick={() => {
                if (!mappingDeleteRow) return
                clearAndDeleteMappingMutation.mutate({
                  bankAccountLabel: mappingDeleteRow.bankAccountLabel,
                  transactedAt: mappingDeleteRow.transactedAt,
                  amount: mappingDeleteRow.amount,
                  externalRef: mappingDeleteRow.externalRef,
                })
              }}
              data-testid="bank-transaction-delete-mapping-confirm"
            >
              매핑도 삭제
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="warning-banner" role="alert">
            이 거래를 해제하고 입금자명 매핑도 삭제합니다. 이후 동일 입금자명은 자동매칭되지 않습니다.
          </div>
          {mappingDeleteRow?.appliedMappingRawName ? (
            <div style={{ fontSize: 13 }}>
              삭제할 규칙: <strong>{mappingDeleteRow.appliedMappingRawName}</strong>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
