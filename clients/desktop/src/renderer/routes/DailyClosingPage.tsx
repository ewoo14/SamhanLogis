import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Modal,
  PartnerAutocomplete,
  Spinner,
  TagChip,
  type DataTableColumn,
  type PartnerOption,
} from '@samhan/design-system'
import {
  createDailyClosing,
  DAILY_CLOSING_STATUS_LABEL,
  deriveDailyClosingStatus,
  listDailyClosings,
  reverseDailyClosing,
  type DailyClosing,
  type DailyClosingKind,
  type DailyClosingSourceKind,
  type DailyClosingScopeMode,
} from '../api/accounting'
import { searchPartners } from '../api/partnerApi'
import {
  getDailyClosingDetail,
  type DailyProductLine,
  type DailyProductRevalidationStatus,
  type DailyTaxInvoiceRow,
} from '../api/closingApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { today } from '../utils/dateUtils'
import { fmtKrw } from '../utils/currencyUtils'

type ClosingKindFilter = 'ALL' | DailyClosingKind

const KIND_LABEL: Record<ClosingKindFilter, string> = {
  ALL: '통합',
  SALES: '매출',
  PURCHASE: '매입',
}

const SOURCE_LABEL: Record<DailyClosingSourceKind, string> = {
  TAX_INVOICE: '세금계산서',
  SALES_SLIP: '매출전표',
  PURCHASE_SLIP: '매입전표',
}

const REVALIDATION_STATUS_LABEL: Record<DailyProductRevalidationStatus, string> = {
  VERIFIED: '확인',
  NOT_FOUND: '미등록',
  AMBIGUOUS: '모호',
  MISSING_REFERENT: '정가결측',
  NOT_MEASURABLE: '측정불가',
  OUT_OF_SCOPE: '대상외',
}

function dailyClosingScopeKey(row: DailyClosing): string {
  return row.partnerCode ?? 'ALL'
}

function dailyClosingScopeLabel(row: DailyClosing): string {
  return row.partnerCode ? `거래처 ${row.partnerCode}` : '전체 마감'
}

function dailyClosingActionTestId(prefix: 'detail' | 'reverse', row: DailyClosing): string {
  return `daily-closing-${prefix}-button-${row.closingDate}-${dailyClosingScopeKey(row)}-${row.closingKind}-${row.sourceKind}`
}

function dailyClosingRowKey(row: DailyClosing): string {
  return `${row.closingDate}-${dailyClosingScopeKey(row)}-${row.closingKind}-${row.sourceKind}`
}

/**
 * [#929 재수렴 T1] 마감 시각 표시 라벨 — 단일 출처.
 *
 * <p>unlock() 은 감사 이력을 위해 lockedAt 을 보존한다(BE 불변, DailyClosing.java:204-213)
 * — 역마감 직후에도 값이 남아 라벨이 상태(isLocked)를 반영하지 않으면 '열림' 배지와
 * 같은 자리에서 자기모순으로 읽힌다. 목록 열과 상세 요약 카드가 각자 이 조건을
 * 계산하면(S6 가 목록 열만 고치며 실제로 그랬다) 한쪽만 갱신되어 같은 행이 한 화면
 * 에서 모순된 라벨을 보일 수 있다 — 두 지점 다 이 함수 하나에서만 값을 얻는다.
 * lockedAt 이 없으면 null(두 지점 모두 렌더하지 않음 — NULL 경계도 단일화).
 */
function dailyClosingLockedAtDisplay(row: DailyClosing): string | null {
  if (!row.lockedAt) return null
  const label = row.isLocked ? '마감 시각' : '이전 마감 시각'
  return `${label} ${fmtTimestamp(row.lockedAt)}`
}

type DailyClosingListColumnKey =
  | 'closingDate'
  | 'kind'
  | 'scope'
  | 'slipCount'
  | 'amountSummary'
  | 'status'
  | 'actions'

interface DailyClosingColumnContext {
  canReverse: boolean
  reversePending: boolean
  onReveal: (row: DailyClosing) => void
  onReverse: (row: DailyClosing) => void
}

interface DailyClosingColumnDefinition {
  key: DailyClosingListColumnKey
  header: string
  width: string
  align?: 'left' | 'right' | 'center'
  mobilePriority?: 'primary' | 'secondary' | 'hidden'
  render: (row: DailyClosing, context: DailyClosingColumnContext) => ReactNode
}

/**
 * #897 일마감 목록 열 정의의 단일 출처.
 *
 * 전체 마감/거래처 마감 범위와 공급가·부가세·마감 시각은 목록에서 보존한다.
 * 열을 추가·제거·순서 변경할 때는 이 배열만 수정하고, 날짜 전체 명세인 별도
 * Daily Detail API는 행 범위 식별의 대체 수단으로 사용하지 않는다.
 */
export const DAILY_CLOSING_LIST_COLUMN_DEFINITIONS: readonly DailyClosingColumnDefinition[] = [
  {
    key: 'closingDate',
    header: '마감일',
    width: '12%',
    mobilePriority: 'primary',
    render: (row) => row.closingDate,
  },
  {
    key: 'kind',
    header: '구분',
    width: '18%',
    mobilePriority: 'secondary',
    render: (row) => `${KIND_LABEL[row.closingKind ?? 'SALES']} · ${SOURCE_LABEL[row.sourceKind ?? 'TAX_INVOICE']}`,
  },
  {
    key: 'scope',
    header: '마감범위',
    width: '19%',
    mobilePriority: 'secondary',
    render: (row) => (
      <div style={{ display: 'grid', minWidth: 0, gap: 2, overflowWrap: 'anywhere' }}>
        <strong>{dailyClosingScopeLabel(row)}</strong>
        {row.bizNo ? <span style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>사업자번호 {row.bizNo}</span> : null}
      </div>
    ),
  },
  {
    key: 'slipCount',
    header: '건수',
    width: '9%',
    align: 'right',
    mobilePriority: 'secondary',
    render: (row) => row.slipCount.toLocaleString(),
  },
  {
    key: 'amountSummary',
    header: '금액 합계',
    width: '20%',
    align: 'right',
    mobilePriority: 'secondary',
    render: (row) => (
      <div style={{ display: 'grid', gap: 2, minWidth: 0, overflowWrap: 'anywhere' }}>
        <strong>{fmtKrwUnit(row.totalAmount)}</strong>
        <span style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>
          공급가 {fmtKrwUnit(row.totalSupply)} · 부가세 {fmtKrwUnit(row.totalVat)}
        </span>
      </div>
    ),
  },
  {
    key: 'status',
    header: '마감상태',
    width: '14%',
    mobilePriority: 'secondary',
    render: (row) => {
      const status = deriveDailyClosingStatus(row.isLocked)
      // [머지 전 재수렴 S6 · #929 재수렴 T1] 라벨은 dailyClosingLockedAtDisplay 단일
      // 출처에서 얻는다 — 상세 요약 카드(아래)도 동일 함수를 쓴다(BE 변경 없음).
      const lockedAtDisplay = dailyClosingLockedAtDisplay(row)
      return (
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <Badge variant={row.isLocked ? 'danger' : 'success'}>
            {DAILY_CLOSING_STATUS_LABEL[status]}
          </Badge>
          {lockedAtDisplay ? (
            <span style={{ color: 'var(--ink-secondary)', fontSize: 12, overflowWrap: 'anywhere' }}>
              {lockedAtDisplay}
            </span>
          ) : null}
        </div>
      )
    },
  },
  {
    key: 'actions',
    header: '작업',
    width: '8%',
    mobilePriority: 'secondary',
    render: (row, context) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="상세 보기"
          data-testid={dailyClosingActionTestId('detail', row)}
          onClick={() => context.onReveal(row)}
        >
          상세
        </Button>
        {row.isLocked && context.canReverse ? (
          <Button
            variant="ghost"
            size="sm"
            data-testid={dailyClosingActionTestId('reverse', row)}
            onClick={() => context.onReverse(row)}
            disabled={context.reversePending}
          >
            역마감
          </Button>
        ) : null}
      </div>
    ),
  },
]

/** 목록 순서를 검증·문서화할 때 사용하는 파생 키 목록. 실제 렌더링은 위 정의를 직접 사용한다. */
export const DAILY_CLOSING_LIST_COLUMN_KEYS = DAILY_CLOSING_LIST_COLUMN_DEFINITIONS.map((column) => column.key)

/** 범위 미선택 안내 문구 id — 잠긴 실행 버튼/칩에서 aria-describedby 로 사유를 연결(#825 슬5 R1 item4). */
const SCOPE_HINT_ID = 'daily-closing-scope-hint-text'

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--line-default)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--ink-primary)',
  background: 'var(--surface-card)',
}

const toggleButtonStyle: CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid var(--line-default)',
  background: 'var(--surface-card)',
  cursor: 'pointer',
}

// export: 테스트가 러너 로컬 타임존에 의존한 하드코딩 문자열 대신 동일 함수로 기대값을
// 계산할 수 있도록 노출한다(#897 CI TZ 회귀 — 화면 표시 자체는 무변경, KST PC 에선 항상
// 동일 결과). DailyClosingPage.test.tsx 열 계층화 스펙 참고.
export function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function compatibleSource(kind: DailyClosingKind, source: DailyClosingSourceKind): DailyClosingSourceKind {
  if (kind === 'SALES' && source === 'PURCHASE_SLIP') return 'SALES_SLIP'
  if (kind === 'PURCHASE' && source === 'SALES_SLIP') return 'PURCHASE_SLIP'
  return source
}

function availableSources(kind: ClosingKindFilter): DailyClosingSourceKind[] {
  if (kind === 'ALL') return []
  return kind === 'SALES'
    ? ['TAX_INVOICE', 'SALES_SLIP']
    : ['TAX_INVOICE', 'PURCHASE_SLIP']
}

function fmtNullableKrw(value: number | null): string {
  return value === null ? '—' : fmtKrw(String(value))
}

/**
 * [머지 전 재수렴 S5] fmtKrw 는 0/null 을 '—'(회계 표시 규약 placeholder)로 반환하는데,
 * 목록 금액 합계·상세 요약이 그 뒤에 무조건 '원'을 붙여 '—원'이 됐다 — 자릿수 없는
 * placeholder 가 단위만 있는 값처럼 보이는 자기모순. placeholder 에는 단위를 붙이지
 * 않는다. 매출 0인 날·면세 거래처 등 정상 업무 경로에서 상시 발생한다.
 */
function fmtKrwUnit(value: string): string {
  const formatted = fmtKrw(value)
  return formatted === '—' ? formatted : `${formatted}원`
}

function fmtRate(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

function rateStyle(value: number | null): CSSProperties {
  if (value === null || value >= 0) return {}
  return { color: 'var(--state-danger)' }
}

/**
 * [#825 재수렴 #4] 실행 시점 draft-확정선택 불일치 안내문 (3 변형).
 *
 * <p>'입력을 비운 뒤 실행' 안내 금지 — AsyncAutocomplete 는 입력을 비워도(재포커스 시
 * draft 자동 초기화 포함) 확정 선택이 해제되지 않으므로(blur 게이트), 그 안내는
 * "빈 입력 = 전체 마감" 오인을 유도해 이전 선택(P1) 범위로 오마감시킨다. 선택 해제
 * 경로는 명시 '해제' 버튼뿐이다.
 *
 * <ul>
 *   <li>빈 draft + 확정 선택 잔존 — 잔존 선택을 드러내고 '해제' 버튼을 안내한다.</li>
 *   <li>draft 타이핑 + 확정 선택 없음 — '해제' 버튼 미노출 상태라 목록 선택만 안내한다.</li>
 *   <li>draft 타이핑 + 이전 확정 선택 잔존 — 목록 선택(교체) 또는 '해제'(전체 마감) 안내.</li>
 * </ul>
 */
function execPartnerDraftGuardMessage(typedDraft: string, confirmedLabel: string): string {
  if (typedDraft === '') {
    return `입력을 비워도 선택한 거래처(${confirmedLabel})가 해제되지 않습니다. 전체 마감하려면 '해제' 버튼으로 거래처 선택을 지운 뒤 다시 실행하세요.`
  }
  if (confirmedLabel === '') {
    return '입력한 거래처가 아직 선택되지 않았습니다. 거래처를 목록에서 선택한 뒤 다시 실행하세요.'
  }
  return "입력한 거래처가 아직 선택되지 않았습니다. 거래처를 목록에서 선택하거나 '해제' 버튼으로 거래처 선택을 지운 뒤 다시 실행하세요."
}

export function DailyClosingPage() {
  // [C5 후속 사이클2 D2-FE-001] role 문자열 직접 판정 제거 — BE @RequirePermission 과 1:1 page-code 판정.
  // 실행 = accounting.daily-closing.run CREATE / 잠금 해제(역마감) = accounting.daily-closing.unlock UPDATE.
  const { canAccess } = usePermissions()
  const canExecute = canAccess('accounting.daily-closing.run', 'create')
  const canReverse = canAccess('accounting.daily-closing.unlock', 'update')
  const queryClient = useQueryClient()

  usePageTitle('일마감')

  const [filterDate, setFilterDate] = useState(today())
  const [partnerCode, setPartnerCode] = useState('')
  const [closingKind, setClosingKind] = useState<ClosingKindFilter>('SALES')
  const [sourceKind, setSourceKind] = useState<DailyClosingSourceKind>('TAX_INVOICE')
  const [execDate, setExecDate] = useState(today())
  const [execPartner, setExecPartner] = useState<PartnerOption | null>(null)
  const [execScopeMode, setExecScopeMode] = useState<DailyClosingScopeMode | null>(null)
  const [execPartnerCommitted, setExecPartnerCommitted] = useState(true)
  /**
   * [#825 재수렴 CM-b·#4] 실행 거래처 입력의 미확정 draft 가드.
   *
   * <p>AsyncAutocomplete 는 목록 선택(pick) 전까지 onChange 를 발화하지 않아, 거래처명을
   * 타이핑만 한 채 '마감 실행'을 누르면 draft 가 무시되고 execPartner(null 또는 이전 선택)
   * 범위로 마감된다 — 화면(타이핑 중 텍스트)과 상태(실제 마감 범위)가 어긋나는 오범위.
   * [#4] 역방향도 동일 — 선택(P1) 후 재포커스로 표시가 비워져도(draft='') 선택은 잔존해,
   * 빈 입력을 보고 실행하면 전체 마감 의도가 P1 마감으로 뒤집힌다. 실행 시점에 입력
   * 표시값(ref)을 확정 선택과 대조해 (빈 draft 포함) 불일치면 차단하고 안내한다.
   */
  const execPartnerInputRef = useRef<HTMLInputElement | null>(null)
  const allScopeChipRef = useRef<HTMLSpanElement | null>(null)
  const [execPartnerDraftError, setExecPartnerDraftError] = useState('')
  const [execDescription, setExecDescription] = useState('')
  const [execKind, setExecKind] = useState<DailyClosingKind>('SALES')
  const [execSourceKind, setExecSourceKind] = useState<DailyClosingSourceKind>('TAX_INVOICE')
  const [reverseConfirmRow, setReverseConfirmRow] = useState<DailyClosing | null>(null)
  /**
   * [머지 전 재수렴 S4 · #929 재수렴 T2] 상세 요약은 클릭 시점 행을 스냅샷으로 보관하되
   * 매 렌더 우선 현재 listQuery.data 에서 재도출을 시도한다(BankTransactionPage.
   * expandedRow 선례와 동일 방향). 재도출(live)이 성공하면(대부분의 경우) 그 값을
   * 써 신선도를 유지한다 — 재마감/역마감으로 invalidate 되면 클릭 없이도 요약이
   * 갱신된다(S4 무훼손).
   *
   * <p>[T2] revealDailyClosingDetail 이 그 행에 맞춰 filterDate/closingKind/sourceKind
   * 를 바꾸면 S7 페이지 리셋 이펙트가 page 를 0 으로 되돌리는데, 그 행이 새 필터의
   * 첫 페이지에 없으면(예: 같은 날짜에 21건 이상) live 재도출이 실패해 "상세를
   * 눌렀는데 상세가 사라진다"가 됐다 — 클릭 대상 행인데도. live 가 실패하면 이
   * 스냅샷으로 폴백한다. 사용자가 필터를 직접 조작하면(clearSelectedDetail) 스냅샷도
   * 함께 지워지므로, filterDate/closingKind/sourceKind/partnerCode 가 사용자 의도로
   * 바뀔 때 stale 요약이 남지 않는다는 S4 의 원래 보장은 그대로 유지된다.
   */
  const [selectedDetailSnapshot, setSelectedDetailSnapshot] = useState<DailyClosing | null>(null)
  const detailCardRef = useRef<HTMLDivElement | null>(null)
  /** [머지 전 재수렴 S7] 21건 이상이면 21번째부터 상세/역마감이 화면에서 도달 불가했다. */
  const [page, setPage] = useState(0)

  const focusAllScopeChip = () => {
    setTimeout(() => {
      allScopeChipRef.current?.querySelector<HTMLElement>('[role="button"]')?.focus()
    }, 0)
  }

  const queryKind = closingKind === 'ALL' ? undefined : closingKind
  const querySourceKind = closingKind === 'ALL' ? undefined : sourceKind

  // [머지 전 재수렴 S7] 필터가 바뀌면 이전 필터 기준 페이지 번호가 새 결과 범위를
  // 벗어날 수 있다(예: 2페이지에서 필터를 좁혀 1페이지만 남는 경우) — 1페이지로 되돌린다.
  useEffect(() => {
    setPage(0)
  }, [filterDate, partnerCode, queryKind, querySourceKind])

  const listQuery = useQuery({
    queryKey: ['daily-closings', filterDate, partnerCode, queryKind ?? 'ALL', querySourceKind ?? 'ALL', page],
    queryFn: () =>
      listDailyClosings({
        from: filterDate,
        to: filterDate,
        partnerCode: partnerCode.trim() || undefined,
        closingKind: queryKind,
        sourceKind: querySourceKind,
        page,
      }),
  })

  const selectedDetailRow = useMemo(() => {
    if (!selectedDetailSnapshot) return null
    const key = dailyClosingRowKey(selectedDetailSnapshot)
    const live = (listQuery.data?.content ?? []).find((row) => dailyClosingRowKey(row) === key)
    return live ?? selectedDetailSnapshot
  }, [selectedDetailSnapshot, listQuery.data])

  /**
   * [#929 재수렴 T2 · S4 무훼손] 사용자가 필터를 직접 조작하면 이전 상세 선택(스냅샷
   * 포함)을 지운다 — revealDailyClosingDetail 이 같은 필터 state 를 프로그램적으로
   * 바꾸는 경로와 달리, 이 경로는 "다른 범위를 보겠다"는 명시적 의도이므로 stale
   * 요약이 남으면 안 된다(S4 원래 보장).
   */
  function clearSelectedDetail() {
    setSelectedDetailSnapshot(null)
  }

  const detailQuery = useQuery({
    queryKey: ['daily-closing-detail', filterDate, queryKind, querySourceKind],
    enabled: closingKind !== 'ALL',
    queryFn: () =>
      getDailyClosingDetail(
        filterDate,
        queryKind ?? 'SALES',
        querySourceKind ?? 'TAX_INVOICE',
      ),
  })

  const closeMutation = useMutation({
    mutationFn: () => {
      if (execScopeMode === null) {
        // 방어적 가드 — 실행 버튼이 이미 execScopeMode!==null 을 강제하므로 정상 경로로는
        // 도달하지 않는다. 도달 시에도 '전체'로 무음 폴백하지 않고 명시적으로 거부한다
        // (#825 슬5 R1 item10 — 회계 무결성 도메인은 방어 방향이 reject 여야 한다).
        throw new Error('범위를 선택하지 않아 마감을 실행할 수 없습니다. 전체 또는 거래처를 선택하세요.')
      }
      return createDailyClosing({
        closingDate: execDate,
        partnerCode: execPartner?.partnerCode || undefined,
        scopeMode: execScopeMode,
        description: execDescription.trim() || undefined,
        closingKind: execKind,
        sourceKind: compatibleSource(execKind, execSourceKind),
      })
    },
    onSuccess: () => {
      setExecDescription('')
      void queryClient.invalidateQueries({ queryKey: ['daily-closings'] })
      void queryClient.invalidateQueries({ queryKey: ['daily-closing-detail'] })
    },
  })

  /**
   * 마감 실행 — [#825 재수렴 CM-b·#4] 미확정 draft 사전 차단.
   *
   * <p>실행 클릭 시점의 입력이 거래처 업무키(partnerCode) 기준으로 확정되지 않았으면
   * 화면과 상태(실제 마감 범위)가 어긋난 상태다 — draft 는 무시되고 전체(null) 또는
   * 이전 선택 범위로 마감되므로 실행을 차단하고 재선택/'해제'를 유도한다.
   *
   * <p>[#4] 빈 draft 도 차단 대상 — 재포커스 시 AsyncAutocomplete 가 draft 를 ''로
   * 초기화해 표시가 비워지지만 확정 선택(P1)은 잔존한다. 이때 사용자는 빈 입력을 보고
   * 전체 마감을 의도하므로, 빈 draft 통과(구 가드 {@code typedDraft !== ''} 선행 조건)는
   * P1 오범위 마감이 된다. 확정 선택 없음 + 빈 draft(둘 다 '')만 전체 마감으로 통과한다.
   * blur 후에는 컴포넌트가 draft 를 표시에서 폐기(선택 라벨 복원)하므로 화면=상태
   * 정합이 회복되어 가드에 걸리지 않는다.
   */
  const handleExecuteClosing = () => {
    if (execScopeMode === null) {
      setExecPartnerDraftError("전체 마감하려면 '전체' 칩을 선택하거나 거래처를 선택하세요.")
      return
    }
    const typedDraft = (execPartnerInputRef.current?.value ?? '').trim()
    const confirmedLabel = (execPartner?.name ?? '').trim()
    // 이름 문자열은 동명이 가능하므로 업무키를 기준으로 계산된 출력 계약만 신뢰한다.
    if (!execPartnerCommitted || (execPartner && !execPartner.partnerCode)) {
      setExecPartnerDraftError(execPartnerDraftGuardMessage(typedDraft, confirmedLabel))
      return
    }
    setExecPartnerDraftError('')
    closeMutation.mutate()
  }

  const reverseMutation = useMutation({
    mutationFn: (row: DailyClosing) =>
      reverseDailyClosing(row.closingDate, row.partnerCode, row.closingKind, row.sourceKind),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily-closings'] })
      void queryClient.invalidateQueries({ queryKey: ['daily-closing-detail'] })
    },
  })

  function revealDailyClosingDetail(row: DailyClosing) {
    setSelectedDetailSnapshot(row)
    setFilterDate(row.closingDate)
    setClosingKind(row.closingKind)
    setSourceKind(row.sourceKind)
    window.setTimeout(() => {
      // preventScroll:true — focus() 기본값(false)이 scrollIntoView 보다 먼저 즉시
      // 스크롤을 일으켜 뒤이은 smooth 애니메이션을 무의미하게 만드는 동일 결함이
      // BankTransactionPage 쪽 표에서 더 크게(24,231px 표) 드러났다(S1·S2) — 같은
      // 코드 모양을 양쪽 다 고쳐 미래 회귀를 막는다.
      detailCardRef.current?.focus({ preventScroll: true })
      detailCardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  const columns: DataTableColumn<DailyClosing>[] = useMemo(() => {
    const context: DailyClosingColumnContext = {
      canReverse,
      reversePending: reverseMutation.isPending,
      onReveal: revealDailyClosingDetail,
      onReverse: setReverseConfirmRow,
    }
    return DAILY_CLOSING_LIST_COLUMN_DEFINITIONS.map((definition) => ({
      key: definition.key,
      header: definition.header,
      width: definition.width,
      align: definition.align,
      mobilePriority: definition.mobilePriority,
      render: (row: DailyClosing) => definition.render(row, context),
    }))
  }, [canReverse, reverseMutation.isPending])

  const detailColumns: DataTableColumn<DailyTaxInvoiceRow>[] = [
    {
      key: 'taxInvoiceNo',
      header: '세금계산서',
      width: '150px',
      render: (row) => row.taxInvoiceNo || '-',
    },
    {
      key: 'salesSlipNo',
      header: '매출전표',
      width: '150px',
      render: (row) => row.salesSlipNo || '-',
    },
    {
      key: 'sourceSlipNo',
      header: '원천전표',
      width: '150px',
      render: (row) => row.sourceSlipNo || '-',
    },
    {
      key: 'bizNo',
      header: '거래처코드',
      width: '130px',
      render: (row) => row.bizNo?.replace(/\D/g, '') || '-',
    },
    { key: 'partnerName', header: '거래처' },
    {
      key: 'supplyAmount',
      header: '공급가',
      width: '120px',
      align: 'right',
      render: (row) => fmtKrw(row.supplyAmount),
    },
    {
      key: 'totalAmount',
      header: '합계',
      width: '120px',
      align: 'right',
      render: (row) => fmtKrw(row.totalAmount),
    },
  ]

  const productRows = useMemo(
    () => (detailQuery.data?.productSummaries ?? []).map((row, index) => ({ ...row, rowIndex: index })),
    [detailQuery.data?.productSummaries],
  )

  const productColumns: DataTableColumn<DailyProductLine>[] = [
    {
      key: 'productName',
      header: '품명',
      align: 'left',
      render: (row) => row.productName,
    },
    {
      key: 'modelName',
      header: '모델',
      align: 'left',
      render: (row) => row.modelName ?? '—',
    },
    {
      key: 'quantity',
      header: '수량',
      width: '90px',
      align: 'right',
      render: (row) => row.quantity.toLocaleString(),
    },
    {
      key: 'supplyAmount',
      header: '공급가',
      width: '120px',
      align: 'right',
      render: (row) => fmtKrw(String(row.supplyAmount)),
    },
    {
      key: 'releasePrice',
      header: '출고가',
      width: '120px',
      align: 'right',
      render: (row) => fmtNullableKrw(row.releasePrice),
    },
    {
      key: 'deliveryPrice',
      header: '납품가',
      width: '120px',
      align: 'right',
      render: (row) => fmtNullableKrw(row.deliveryPrice),
    },
    {
      key: 'expectedRate',
      header: '기대율',
      width: '90px',
      align: 'right',
      render: (row) => fmtRate(row.expectedRate),
    },
    {
      key: 'actualRate',
      header: '할인율',
      width: '90px',
      align: 'right',
      render: (row) => (
        <span style={rateStyle(row.actualRate)}>
          {fmtRate(row.actualRate)}
        </span>
      ),
    },
    {
      key: 'verified',
      header: '확인',
      width: '116px',
      align: 'center',
      render: (row) => {
        const badge =
          row.verified === true ? (
            <Badge variant="success">확인</Badge>
          ) : row.verified === false ? (
            <Badge variant="danger">불일치</Badge>
          ) : (
            <Badge variant="neutral">판정불가</Badge>
          )

        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            {badge}
            {closingKind === 'PURCHASE' ? (
              <span
                aria-label="판매(출고) 기준 참고값"
                title="판매(출고) 기준 참고값"
                style={{ fontSize: 11, color: 'var(--ink-secondary, #5C6773)' }}
              >
                참고
              </span>
            ) : null}
          </span>
        )
      },
    },
    {
      key: 'revalidationStatus',
      header: '사유',
      width: '100px',
      align: 'center',
      // VERIFIED(확인/불일치 판정완료)는 확인 컬럼 배지가 판정을 전달하므로 사유는 '—'.
      // 사유 컬럼은 판정불가(verified=null) 상태의 사유 구분 전용(NOT_FOUND/AMBIGUOUS 등).
      render: (row) =>
        row.revalidationStatus && row.revalidationStatus !== 'VERIFIED'
          ? REVALIDATION_STATUS_LABEL[row.revalidationStatus]
          : '—',
    },
  ]

  const sourceButtons = availableSources(closingKind)
  const execSourceButtons = availableSources(execKind)
  const showProductRevalidation = closingKind !== 'ALL'

  return (
    <div data-testid="daily-closing-page">
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>일마감 조회</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>
            대상일&nbsp;
            <input
              type="date"
              value={filterDate}
              // [#929 재수렴 T2 무훼손] 사용자가 직접 날짜를 바꾸는 것은 "다른 범위를
              // 보겠다"는 명시적 의도 — 이전 상세 선택(스냅샷 포함)을 지운다(S4 원래
              // 보장: stale 요약이 남지 않는다).
              onChange={(e) => { setFilterDate(e.target.value); clearSelectedDetail() }}
              data-testid="daily-closing-filter-date"
              style={inputStyle}
            />
          </label>
          <label>
            거래처 코드&nbsp;
            <input
              value={partnerCode}
              onChange={(e) => { setPartnerCode(e.target.value); clearSelectedDetail() }}
              placeholder="선택"
              data-testid="daily-closing-filter-partner"
              style={{ ...inputStyle, width: 140 }}
            />
          </label>
          <div data-testid="closing-kind-toggle" role="radiogroup" aria-label="마감 종류">
            {(['ALL', 'SALES', 'PURCHASE'] as ClosingKindFilter[]).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={closingKind === kind}
                onClick={() => {
                  setClosingKind(kind)
                  if (kind !== 'ALL') setSourceKind((prev) => compatibleSource(kind, prev))
                  // [#929 재수렴 T2 무훼손·T5] '매출'/'매입'은 결과를 좁혀 다른 kind 의
                  // 이전 선택을 구조적으로 배제한다 — 스냅샷 폴백이 그 배제된 선택을
                  // 계속 보여주면 stale 요약 회귀가 된다(S4 무훼손 위반), 그래서 지운다.
                  // '통합'은 반대로 결과를 넓힐 뿐이라(이전 선택도 여전히 유효한 범위)
                  // 지우지 않는다 — 요약 카드는 남고, 표를 가리키는 문구만 별도로
                  // 조건화한다(T5, 아래 selectedDetailRow 블록).
                  if (kind !== 'ALL') clearSelectedDetail()
                }}
                style={{
                  ...toggleButtonStyle,
                  background: closingKind === kind ? 'var(--surface-selected)' : toggleButtonStyle.background,
                }}
              >
                {KIND_LABEL[kind]}
              </button>
            ))}
          </div>
          {sourceButtons.length > 0 ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {sourceButtons.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => { setSourceKind(source); clearSelectedDetail() }}
                  style={{
                    ...toggleButtonStyle,
                    background: sourceKind === source ? 'var(--surface-selected)' : toggleButtonStyle.background,
                  }}
                >
                  {SOURCE_LABEL[source]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>일마감 실행</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="date"
            value={execDate}
            onChange={(e) => setExecDate(e.target.value)}
            data-testid="daily-closing-exec-date"
            style={inputStyle}
          />
          <select
            value={execKind}
            onChange={(e) => {
              const next = e.target.value as DailyClosingKind
              setExecKind(next)
              setExecSourceKind((prev) => compatibleSource(next, prev))
            }}
            style={inputStyle}
          >
            <option value="SALES">매출</option>
            <option value="PURCHASE">매입</option>
          </select>
          <select
            value={compatibleSource(execKind, execSourceKind)}
            onChange={(e) => setExecSourceKind(e.target.value as DailyClosingSourceKind)}
            style={inputStyle}
          >
            {execSourceButtons.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </select>
          {/* [#825 CM4] 공용 wrapper 가 width:100% 라 인라인 flex 행에서 단독 행으로
              감겨 실행 조건 행 정렬이 붕괴 — 폭 제약 래퍼(flex:0 0 220px)로 인라인 복원.
              [#825 CM6] AsyncAutocomplete 는 onChange(null) 을 발화하지 않아(blur 게이트)
              입력을 지워도 execPartner 가 남는다 — BankTransactionPage 선례대로 명시
              '해제' 버튼으로만 선택을 해제한다 (미해제 시 이전 거래처로 오범위 마감). */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ width: 220, flex: '0 0 220px' }}>
              <PartnerAutocomplete
                ref={execPartnerInputRef}
                value={execPartner}
                onChange={(option) => {
                  setExecPartner(option)
                  setExecScopeMode(option ? 'SELECTED' : null)
                  setExecPartnerCommitted(true)
                  // [#825 재수렴 CM-b] 선택 확정/해제 즉시 draft 안내 소거 — 화면=상태 정합 회복.
                  setExecPartnerDraftError('')
                }}
                onInputCommitChange={setExecPartnerCommitted}
                searchPartners={(query) => searchPartners(query, { activeOnly: true })}
                // [#825 R1 L1] 인라인 실행 행은 라벨-less 컨트롤 정렬 — visible label 대신
                // ariaLabel (BankTransactionPage 인라인 매칭 행 선례).
                label=""
                ariaLabel="거래처"
                placeholder="거래처명 또는 코드 선택"
                inputTestId="daily-closing-exec-partner"
                disabled={!canExecute || execScopeMode === 'ALL'}
              />
            </div>
            <div
              role="group"
              aria-label="일마감 거래처 범위"
              data-testid="daily-closing-scope-chips"
              style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <TagChip
                label="범위"
                value="전체"
                removeLabel="전체 범위"
                onClick={canExecute ? () => {
                  setExecScopeMode('ALL')
                  setExecPartner(null)
                  setExecPartnerCommitted(true)
                  setExecPartnerDraftError('')
                } : undefined}
                ref={allScopeChipRef}
                onRemove={canExecute && execScopeMode === 'ALL' ? () => { setExecScopeMode(null); focusAllScopeChip() } : undefined}
                data-testid="daily-closing-all-chip"
                className={!canExecute ? 'scope-chip--disabled' : undefined}
                role={canExecute ? 'button' : undefined}
                tabIndex={canExecute ? 0 : undefined}
                aria-pressed={canExecute ? execScopeMode === 'ALL' : undefined}
                aria-describedby={canExecute && execScopeMode === null ? SCOPE_HINT_ID : undefined}
              />
              {execScopeMode === 'SELECTED' && execPartner ? (
                <TagChip
                  label="거래처"
                  value={execPartner.name}
                  removeLabel={execPartner.name}
                  onRemove={canExecute ? () => {
                    setExecPartner(null)
                    setExecScopeMode(null)
                    setExecPartnerCommitted(true)
                    setExecPartnerDraftError('')
                    focusAllScopeChip()
                  } : undefined}
                  data-testid="daily-closing-selected-chip"
                />
              ) : null}
            </div>
            {execPartner ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="거래처 선택 해제"
                data-testid="daily-closing-exec-partner-clear"
                onClick={() => {
                  setExecPartner(null)
                  setExecScopeMode(null)
                  setExecPartnerCommitted(true)
                  setExecPartnerDraftError('')
                }}
              >
                해제
              </Button>
            ) : null}
          </div>
          <input
            type="text"
            value={execDescription}
            onChange={(e) => setExecDescription(e.target.value)}
            placeholder="메모"
            data-testid="daily-closing-exec-description"
            style={{ ...inputStyle, width: 220 }}
          />
          <Button
            variant="primary"
            data-testid="daily-closing-exec-button"
            onClick={handleExecuteClosing}
            disabled={!canExecute || closeMutation.isPending || !execDate || execScopeMode === null}
            aria-describedby={execScopeMode === null ? SCOPE_HINT_ID : undefined}
          >
            {closeMutation.isPending ? '처리 중' : '마감 실행'}
          </Button>
        </div>
        {execScopeMode === null ? (
          // #825 슬5 R1 item12 — 상시 표시 안내는 role="alert"(긴급/동적 공지 전용) 대신
          // role="status"(polite)로 통일. 색도 대비 2.15:1(AA 미달)이던 --state-warning 대신
          // --ink-secondary(5.77:1)로 세 화면 통일.
          // item13 — "전체" 칩만 안내하면 거래처 지정 의도 사용자를 전체 마감으로 유도하므로
          // 양쪽 경로(전체/거래처)를 모두 안내한다.
          <p
            role="status"
            id={SCOPE_HINT_ID}
            data-testid="daily-closing-scope-hint"
            style={{ margin: '8px 0 0', color: 'var(--ink-secondary, #5C6773)', fontSize: 12 }}
          >
            {canExecute
              ? "전체로 처리하려면 '전체' 칩을 선택하세요. 특정 거래처만 처리하려면 거래처를 선택하세요."
              : '일마감 실행 권한이 없어 범위를 선택하거나 실행할 수 없습니다. 권한 보유자에게 요청하세요.'}
          </p>
        ) : null}
        {execPartnerDraftError ? (
          <p
            role="alert"
            data-testid="daily-closing-exec-partner-draft-error"
            style={{ margin: '8px 0 0', color: 'var(--color-danger-700)', fontSize: 12 }}
          >
            {execPartnerDraftError}
          </p>
        ) : null}
        {!canExecute ? (
          <p style={{ margin: '8px 0 0', color: 'var(--color-danger-700)', fontSize: 12 }}>
            일마감 실행 권한이 없습니다 — 일마감 실행 권한 보유자만 가능합니다.
          </p>
        ) : null}
        {closeMutation.isError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            일마감 실행에 실패했습니다.
          </div>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>마감 이력</h3>
        {listQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 140 }}>
            <Spinner size="lg" label="마감 이력 로딩 중" />
          </div>
        ) : listQuery.isError ? (
          <div className="error-banner" role="alert">마감 이력을 불러오지 못했습니다.</div>
        ) : (
          <div data-testid="daily-closing-list-table">
            <DataTable
              columns={columns}
              rows={listQuery.data?.content ?? []}
              rowKey={dailyClosingRowKey}
              emptyMessage="해당 일자의 일마감 이력이 없습니다."
            />
          </div>
        )}
        {/* [머지 전 재수렴 S7] 한 날짜의 마감이 21건 이상이면 21번째부터 상세·역마감
            버튼이 화면에서 도달 불가했다(size=20 고정, page 미전달, 페이저 UI 없음).
            BlockedPartnersPage 페이저 선례와 동일 형태로 이전/다음을 추가한다. */}
        {listQuery.data && listQuery.data.totalPages > 1 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 13 }}>
            <button
              type="button"
              data-testid="daily-closing-page-prev"
              disabled={page <= 0}
              onClick={() => setPage((p) => p - 1)}
              style={toggleButtonStyle}
            >
              이전
            </button>
            <span data-testid="daily-closing-page-indicator">
              {listQuery.data.number + 1} / {listQuery.data.totalPages}
            </span>
            <button
              type="button"
              data-testid="daily-closing-page-next"
              disabled={page + 1 >= listQuery.data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={toggleButtonStyle}
            >
              다음
            </button>
          </div>
        ) : null}
      </Card>

      <Card>
        <div
          id="daily-closing-detail"
          ref={detailCardRef}
          tabIndex={-1}
          style={{ outline: 'none' }}
        >
        <h3 style={{ margin: '0 0 12px' }}>일마감 상세</h3>
        {selectedDetailRow ? (
          <div
            data-testid="daily-closing-selected-scope"
            style={{
              display: 'grid',
              gap: 4,
              marginBottom: 12,
              padding: '10px 12px',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 6,
              background: 'var(--color-neutral-50)',
              fontSize: 13,
            }}
          >
            <strong>선택한 마감 범위: {dailyClosingScopeLabel(selectedDetailRow)}</strong>
            {selectedDetailRow.bizNo ? <span>사업자번호 {selectedDetailRow.bizNo}</span> : null}
            <span>
              공급가 {fmtKrwUnit(selectedDetailRow.totalSupply)} · 부가세 {fmtKrwUnit(selectedDetailRow.totalVat)} · 합계 {fmtKrwUnit(selectedDetailRow.totalAmount)}
            </span>
            {/* [#929 재수렴 T1] 목록 열과 동일한 dailyClosingLockedAtDisplay 단일 출처 —
                무조건 '마감 시각' 이면 열림 상태에서 목록('이전 마감 시각')과 모순됐다. */}
            {dailyClosingLockedAtDisplay(selectedDetailRow) ? (
              <span>{dailyClosingLockedAtDisplay(selectedDetailRow)}</span>
            ) : null}
            {/* [#929 재수렴 T5] 통합(ALL)에서는 아래 DataTable 이 렌더되지 않는다("통합
                조회에서는 이력만 표시합니다") — 그 표를 가리키는 문구는 표가 실제로
                렌더되는 조건(closingKind !== 'ALL')과 함께 다닌다. */}
            {closingKind !== 'ALL' ? (
              <span style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>
                아래 전표 명세는 선택한 날짜·구분의 통합 조회입니다. 선택한 마감 범위의 합계는 위 값을 확인하세요.
              </span>
            ) : null}
          </div>
        ) : null}
        {closingKind === 'ALL' ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-secondary)' }}>
            통합 조회에서는 이력만 표시합니다. 상세는 매출 또는 매입을 선택해 확인하세요.
          </p>
        ) : detailQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
            <Spinner size="lg" label="상세 로딩 중" />
          </div>
        ) : detailQuery.isError ? (
          <div className="error-banner" role="alert">Daily Detail을 불러오지 못했습니다.</div>
        ) : (
          <>
            <DataTable
              columns={detailColumns}
              rows={detailQuery.data?.taxInvoices ?? []}
              rowKey={(row) => `${row.taxInvoiceNo ?? ''}-${row.salesSlipNo ?? ''}-${row.sourceSlipNo ?? ''}-${row.partnerName}`}
              emptyMessage="상세 전표가 없습니다."
            />
            {showProductRevalidation ? (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>모델별 재검증</h4>
                {closingKind === 'PURCHASE' ? (
                  <div
                    role="note"
                    style={{
                      margin: '0 0 8px',
                      padding: '8px 12px',
                      fontSize: 12,
                      background: 'var(--color-warning-50, #FEF6E7)',
                      color: 'var(--color-warning-800, #8C5C13)',
                      border: '1px solid var(--color-warning-300, #F1C268)',
                      borderRadius: 6,
                    }}
                  >
                    매입 재검증은 <b>판매(출고) 기준 참고용</b>입니다. 정식 매입단가 감사가 아닙니다.
                    모델·일 합계 평균 기준 새니티 체크이며 개별 라인 단위 판정이 아닙니다.
                  </div>
                ) : (
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink-secondary, #5C6773)' }}>
                    모델·일 합계 평균 기준 새니티 체크입니다. 개별 라인 단위 판정이 아닙니다.
                  </p>
                )}
                <DataTable
                  columns={productColumns}
                  rows={productRows}
                  rowKey={(row) => `${row.productName}-${row.rowIndex}`}
                  emptyMessage="모델별 재검증 결과가 없습니다."
                />
              </div>
            ) : null}
          </>
        )}
        </div>
      </Card>

      <Modal
        open={reverseConfirmRow !== null}
        onClose={() => setReverseConfirmRow(null)}
        title="역마감 확인"
        size="sm"
        closeOnBackdropClick={false}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setReverseConfirmRow(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="daily-closing-reverse-confirm-button"
              disabled={reverseMutation.isPending}
              onClick={() => {
                if (reverseConfirmRow) {
                  reverseMutation.mutate(reverseConfirmRow)
                  setReverseConfirmRow(null)
                }
              }}
            >
              {reverseMutation.isPending ? '처리 중' : '역마감'}
            </Button>
          </div>
        }
      >
        {reverseConfirmRow ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            {/* [머지 전 재수렴 S3] 같은 날짜·구분·원천이면서 마감범위(전체/거래처)만 다른
                두 행의 역마감 확인 문구가 100% 동일해 대상을 특정하지 못했다 — 목록의
                '마감범위' 열과 동일한 dailyClosingScopeLabel 을 확인 문구 맨 앞에 낸다. */}
            <strong>{dailyClosingScopeLabel(reverseConfirmRow)}</strong> · {reverseConfirmRow.closingDate}{' '}
            {KIND_LABEL[reverseConfirmRow.closingKind]}{' '}
            {SOURCE_LABEL[reverseConfirmRow.sourceKind]} 마감을 해제합니다.
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
