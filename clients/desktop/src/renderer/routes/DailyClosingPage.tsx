/**
 * 일마감 화면 — `/accounting/daily-closings` (SP-08-6-5 P2).
 *
 * <p>구성:
 * <ul>
 *   <li>상단: 날짜 range 필터 + 거래처 코드 필터 + 조회 버튼</li>
 *   <li>마감 실행 카드: 대상 일자 + 거래처 코드(선택) + 메모 + 마감 실행 버튼</li>
 *   <li>마감 이력 표 — closingDate / 거래처 / 상태 / 매출합계 / 슬립건수 / 마감시각 / 역마감</li>
 * </ul>
 *
 * <p>권한 (BE `@PreAuthorize` 와 동일):
 * <ul>
 *   <li>마감 실행: ACCOUNTANT / MASTER</li>
 *   <li>역마감:    MASTER 만</li>
 *   <li>조회:      ACCOUNTANT / MANAGER / MASTER</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 (`feedback_uuid_no_user_visibility.md`):
 * 마감 row 의 `id` 는 역마감 path param 전용. 화면 표시는 closingDate + partnerCode.
 *
 * data-testid:
 * - `daily-closing-page`                     — 페이지 루트
 * - `daily-closing-filter-from`              — 시작 일자 input
 * - `daily-closing-filter-to`                — 종료 일자 input
 * - `daily-closing-filter-partner`           — 거래처 코드 필터 input
 * - `daily-closing-filter-search`            — 조회 버튼
 * - `daily-closing-exec-date`                — 마감 실행 대상 일자 input
 * - `daily-closing-exec-partner`             — 마감 실행 거래처 코드 input
 * - `daily-closing-exec-description`         — 메모 input
 * - `daily-closing-exec-button`              — 마감 실행 버튼
 * - `daily-closing-list-table`               — 마감 이력 표
 * - `daily-closing-reverse-button-{id}`      — 역마감 버튼 (CLOSED + MASTER)
 * - `daily-closing-reverse-confirm-button`   — 역마감 확인 Modal 확인 버튼
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Modal,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  canExecuteDailyClosing,
  canReverseDailyClosing,
  createDailyClosing,
  DAILY_CLOSING_STATUS_LABEL,
  listDailyClosings,
  reverseDailyClosing,
  type DailyClosing,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'
import { useSessionStore } from '../stores/session'

/** YYYY-MM-DD 오늘 날짜. */
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 7일 전 YYYY-MM-DD. */
function sevenDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** KRW BigDecimal string → "1,234,567" (NaN 시 "—"). */
function fmtKrw(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (n === 0) return '—'
  return Math.round(n).toLocaleString('ko-KR')
}

/** ISO 8601 → "YYYY-MM-DD HH:mm". */
function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const Y = d.getFullYear()
  const Mo = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${Y}-${Mo}-${D} ${h}:${m}`
}

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--line-default)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--ink-primary)',
  background: 'var(--surface-card)',
}

const noticeStyle: CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  borderRadius: 6,
  background: 'var(--state-warning-bg)',
  color: 'var(--state-warning)',
  fontSize: 'var(--font-size-xs)',
  lineHeight: 1.5,
}

export function DailyClosingPage() {
  const role = useSessionStore((s) => s.auth?.role)
  const canExecute = canExecuteDailyClosing(role)
  const canReverse = canReverseDailyClosing(role)
  const queryClient = useQueryClient()

  usePageTitle('일마감')

  // 필터 상태
  const [filterFrom, setFilterFrom] = useState<string>(sevenDaysAgo())
  const [filterTo, setFilterTo] = useState<string>(today())
  const [filterPartner, setFilterPartner] = useState<string>('')
  // 검색 버튼 클릭 시점의 applied 값으로 query key 갱신
  const [applied, setApplied] = useState<{
    fromDate: string
    toDate: string
    partnerCode: string | undefined
  }>({
    fromDate: sevenDaysAgo(),
    toDate: today(),
    partnerCode: undefined,
  })

  // 마감 실행 폼 상태
  const [execDate, setExecDate] = useState<string>(today())
  const [execPartner, setExecPartner] = useState<string>('')
  const [execDescription, setExecDescription] = useState<string>('')

  // 역마감 확인 Modal 상태
  const [reverseConfirmRow, setReverseConfirmRow] = useState<DailyClosing | null>(null)

  const listQuery = useQuery({
    queryKey: ['daily-closings', applied.fromDate, applied.toDate, applied.partnerCode ?? ''],
    queryFn: () =>
      listDailyClosings({
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        partnerCode: applied.partnerCode,
      }),
  })

  const closeMutation = useMutation({
    mutationFn: () =>
      createDailyClosing({
        closingDate: execDate,
        partnerCode: execPartner.trim() || undefined,
        description: execDescription.trim() || undefined,
      }),
    onSuccess: () => {
      setExecDescription('')
      void queryClient.invalidateQueries({ queryKey: ['daily-closings'] })
    },
  })

  const reverseMutation = useMutation({
    mutationFn: (id: string) => reverseDailyClosing(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily-closings'] })
    },
  })

  const handleSearch = () => {
    if (!filterFrom || !filterTo || filterFrom > filterTo) return
    setApplied({
      fromDate: filterFrom,
      toDate: filterTo,
      partnerCode: filterPartner.trim() || undefined,
    })
  }

  const closeError = closeMutation.error as Error | null
  const reverseError = reverseMutation.error as Error | null

  const columns: DataTableColumn<DailyClosing>[] = useMemo(
    () => [
      {
        key: 'closingDate',
        header: '마감 일자',
        width: '120px',
        render: (r) => r.closingDate,
      },
      {
        key: 'partnerName',
        header: '거래처',
        render: (r) =>
          r.partnerName
            ? `${r.partnerName} (${r.partnerCode ?? ''})`
            : '전체',
      },
      {
        key: 'status',
        header: '상태',
        width: '80px',
        render: (r) => (
          <Badge variant={r.status === 'CLOSED' ? 'danger' : 'success'}>
            {DAILY_CLOSING_STATUS_LABEL[r.status]}
          </Badge>
        ),
      },
      {
        key: 'totalSales',
        header: '매출 합계',
        width: '140px',
        align: 'right',
        render: (r) => fmtKrw(r.totalSales),
      },
      {
        key: 'slipCount',
        header: '전표 건수',
        width: '90px',
        align: 'right',
        render: (r) => r.slipCount.toLocaleString(),
      },
      {
        key: 'closedAt',
        header: '마감 시각',
        width: '140px',
        render: (r) => fmtTimestamp(r.closedAt),
      },
      {
        key: 'closedBy',
        header: '실행자',
        width: '110px',
        render: (r) => r.closedBy ?? '—',
      },
      {
        key: 'reverseAction',
        header: '',
        width: '110px',
        render: (r) =>
          r.status === 'CLOSED' && canReverse ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid={`daily-closing-reverse-button-${r.id}`}
              onClick={() => setReverseConfirmRow(r)}
              disabled={reverseMutation.isPending}
            >
              역마감
            </Button>
          ) : null,
      },
    ],
    [canReverse, reverseMutation.isPending],
  )

  return (
    <div data-testid="daily-closing-page">
      {/* 필터 카드 */}
      <Card style={{ marginBottom: 16 }}>
        <h3
          style={{
            margin: '0 0 12px 0',
            fontSize: 'var(--font-card-title)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          일마감 조회
        </h3>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--ink-secondary)',
              }}
            >
              시작일
            </span>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              data-testid="daily-closing-filter-from"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--ink-secondary)',
              }}
            >
              종료일
            </span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              data-testid="daily-closing-filter-to"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--ink-secondary)',
              }}
            >
              거래처 코드(선택)
            </span>
            <input
              type="text"
              value={filterPartner}
              onChange={(e) => setFilterPartner(e.target.value)}
              placeholder="예: P-00123"
              data-testid="daily-closing-filter-partner"
              style={{ ...inputStyle, width: 160 }}
            />
          </label>
          <Button
            variant="primary"
            data-testid="daily-closing-filter-search"
            onClick={handleSearch}
            disabled={!filterFrom || !filterTo || filterFrom > filterTo}
          >
            조회
          </Button>
        </div>
      </Card>

      {/* 마감 실행 카드 */}
      <Card style={{ marginBottom: 16 }}>
        <h3
          style={{
            margin: '0 0 12px 0',
            fontSize: 'var(--font-card-title)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          일마감 실행
        </h3>
        <p style={noticeStyle}>
          마감 실행 시 해당 일자의 CONFIRMED 전표가 LOCKED 상태로 전환됩니다.
          역마감은 MASTER 권한자만 가능합니다.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            marginTop: 12,
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--ink-primary)',
            }}
          >
            마감 일자:&nbsp;
            <input
              type="date"
              value={execDate}
              onChange={(e) => setExecDate(e.target.value)}
              data-testid="daily-closing-exec-date"
              style={inputStyle}
            />
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--ink-primary)',
            }}
          >
            거래처 코드(선택):&nbsp;
            <input
              type="text"
              value={execPartner}
              onChange={(e) => setExecPartner(e.target.value)}
              placeholder="미입력 시 전체 마감"
              data-testid="daily-closing-exec-partner"
              style={{ ...inputStyle, width: 200 }}
            />
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexGrow: 1,
              minWidth: 200,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--ink-primary)',
            }}
          >
            메모(선택):&nbsp;
            <input
              type="text"
              value={execDescription}
              maxLength={500}
              placeholder="마감 사유 등 (선택)"
              onChange={(e) => setExecDescription(e.target.value)}
              data-testid="daily-closing-exec-description"
              style={{ ...inputStyle, width: '100%', maxWidth: 320 }}
            />
          </label>

          <Button
            variant="primary"
            data-testid="daily-closing-exec-button"
            onClick={() => closeMutation.mutate()}
            disabled={!canExecute || closeMutation.isPending || !execDate}
            title={!canExecute ? 'ACCOUNTANT / MASTER 권한이 필요합니다' : undefined}
          >
            {closeMutation.isPending ? '처리 중...' : '마감 실행'}
          </Button>
        </div>

        {!canExecute ? (
          <p
            style={{
              margin: '8px 0 0 0',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--state-danger)',
            }}
          >
            마감 실행 권한이 없습니다 — ACCOUNTANT / MASTER 권한 보유자만 가능합니다.
          </p>
        ) : null}

        {closeMutation.isSuccess ? (
          <p
            style={{
              margin: '8px 0 0 0',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--state-success)',
            }}
          >
            마감이 완료되었습니다.
          </p>
        ) : null}

        {closeError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            마감 실행 실패: {closeError.message}
          </div>
        ) : null}

        {reverseError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            역마감 실패: {reverseError.message}
          </div>
        ) : null}
      </Card>

      {/* 마감 이력 표 */}
      <Card>
        <h3
          style={{
            margin: '0 0 8px 0',
            fontSize: 'var(--font-card-title)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          마감 이력
        </h3>

        {listQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
            <Spinner size="lg" label="마감 목록 불러오는 중" />
          </div>
        ) : listQuery.isError ? (
          <div className="error-banner" role="alert">
            마감 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
          </div>
        ) : (
          <div data-testid="daily-closing-list-table">
            <DataTable
              columns={columns}
              rows={Array.isArray(listQuery.data) ? listQuery.data : []}
              rowKey={(r) => r.id}
              emptyMessage="해당 기간의 일마감 이력이 없습니다."
            />
          </div>
        )}
      </Card>

      {/* 역마감 확인 Modal */}
      <Modal
        open={reverseConfirmRow !== null}
        onClose={() => setReverseConfirmRow(null)}
        title="역마감 확인"
        size="sm"
        closeOnBackdropClick={false}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReverseConfirmRow(null)}
            >
              취소
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="daily-closing-reverse-confirm-button"
              disabled={reverseMutation.isPending}
              onClick={() => {
                if (reverseConfirmRow) {
                  reverseMutation.mutate(reverseConfirmRow.id)
                  setReverseConfirmRow(null)
                }
              }}
            >
              {reverseMutation.isPending ? '처리 중...' : '역마감'}
            </Button>
          </div>
        }
      >
        {reverseConfirmRow ? (
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
            <strong>{reverseConfirmRow.closingDate}</strong>{' '}
            {reverseConfirmRow.partnerName
              ? `(${reverseConfirmRow.partnerName})`
              : '(전체)'}
            {' '}일마감을 역마감 처리합니다.
            <br />
            역마감 후 전표 변경이 다시 허용됩니다. 진행하시겠습니까?
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
