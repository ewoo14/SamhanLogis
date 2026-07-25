import { useMemo, useRef, useState, type CSSProperties } from 'react'
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

/** #897 일마감 목록에서 업무 판단에 필요한 열만 유지하는 단일 기준점. */
export const DAILY_CLOSING_LIST_COLUMN_KEYS = [
  'closingDate',
  'kind',
  'slipCount',
  'totalAmount',
  'isLocked',
  'detailAction',
  'reverseAction',
] as const

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

function fmtTimestamp(iso: string | null | undefined): string {
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
  const detailCardRef = useRef<HTMLDivElement | null>(null)

  const focusAllScopeChip = () => {
    setTimeout(() => {
      allScopeChipRef.current?.querySelector<HTMLElement>('[role="button"]')?.focus()
    }, 0)
  }

  const queryKind = closingKind === 'ALL' ? undefined : closingKind
  const querySourceKind = closingKind === 'ALL' ? undefined : sourceKind

  const listQuery = useQuery({
    queryKey: ['daily-closings', filterDate, partnerCode, queryKind ?? 'ALL', querySourceKind ?? 'ALL'],
    queryFn: () =>
      listDailyClosings({
        from: filterDate,
        to: filterDate,
        partnerCode: partnerCode.trim() || undefined,
        closingKind: queryKind,
        sourceKind: querySourceKind,
      }),
  })

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
    setFilterDate(row.closingDate)
    setClosingKind(row.closingKind)
    setSourceKind(row.sourceKind)
    window.setTimeout(() => {
      detailCardRef.current?.focus()
      detailCardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  const columns: DataTableColumn<DailyClosing>[] = useMemo(
    () => {
      const visibleColumns: DataTableColumn<DailyClosing>[] = [
      {
        key: 'closingDate',
        header: '마감일',
        width: '110px',
        mobilePriority: 'primary',
      },
      {
        key: 'kind',
        header: '구분',
        width: '180px',
        mobilePriority: 'secondary',
        render: (row) => `${KIND_LABEL[row.closingKind ?? 'SALES']} · ${SOURCE_LABEL[row.sourceKind ?? 'TAX_INVOICE']}`,
      },
      {
        key: 'slipCount',
        header: '건수',
        width: '80px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (row) => row.slipCount.toLocaleString(),
      },
      {
        key: 'totalAmount',
        header: '금액 합계',
        width: '140px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (row) => fmtKrw(row.totalAmount),
      },
      {
        key: 'isLocked',
        header: '마감상태',
        width: '90px',
        mobilePriority: 'secondary',
        render: (row) => {
          const status = deriveDailyClosingStatus(row.isLocked)
          return (
            <Badge variant={row.isLocked ? 'danger' : 'success'}>
              {DAILY_CLOSING_STATUS_LABEL[status]}
            </Badge>
          )
        },
      },
      {
        key: 'detailAction',
        header: '상세',
        width: '74px',
        mobilePriority: 'secondary',
        render: (row) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="상세 보기"
            data-testid={`daily-closing-detail-button-${row.closingDate}-${row.closingKind}-${row.sourceKind}`}
            onClick={() => revealDailyClosingDetail(row)}
          >
            상세
          </Button>
        ),
      },
      {
        key: 'reverseAction',
        header: '',
        width: '86px',
        mobilePriority: 'secondary',
        render: (row) =>
          row.isLocked && canReverse ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid={`daily-closing-reverse-button-${row.closingDate}-${row.closingKind}-${row.sourceKind}`}
              onClick={() => setReverseConfirmRow(row)}
              disabled={reverseMutation.isPending}
            >
              역마감
            </Button>
          ) : null,
      },
      ]
      return visibleColumns.filter((column) =>
        (DAILY_CLOSING_LIST_COLUMN_KEYS as readonly (string | number)[]).includes(column.key),
      )
    },
    [canReverse, reverseMutation.isPending],
  )

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
              onChange={(e) => setFilterDate(e.target.value)}
              data-testid="daily-closing-filter-date"
              style={inputStyle}
            />
          </label>
          <label>
            거래처 코드&nbsp;
            <input
              value={partnerCode}
              onChange={(e) => setPartnerCode(e.target.value)}
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
                  onClick={() => setSourceKind(source)}
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
              rowKey={(row) => `${row.closingDate}-${row.partnerCode ?? 'ALL'}-${row.closingKind}-${row.sourceKind}`}
              emptyMessage="해당 일자의 일마감 이력이 없습니다."
            />
          </div>
        )}
      </Card>

      <Card>
        <div
          id="daily-closing-detail"
          ref={detailCardRef}
          tabIndex={-1}
          style={{ outline: 'none' }}
        >
        <h3 style={{ margin: '0 0 12px' }}>일마감 상세</h3>
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
            {reverseConfirmRow.closingDate} {KIND_LABEL[reverseConfirmRow.closingKind]}{' '}
            {SOURCE_LABEL[reverseConfirmRow.sourceKind]} 마감을 해제합니다.
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
