/**
 * 월말 마감 화면 — `/accounting/period-close` (P2-3).
 *
 * <p>구성:
 * <ul>
 *   <li>상단: 마감 실행 카드 (월별 기간 선택 + 메모 + 마감 실행 버튼)</li>
 *   <li>경고 안내: 마감 후 분개/슬립 변경 차단</li>
 *   <li>마감 이력 표: periodType / periodDate / status / 매출 / 매입 / 실행자 / 마감시각 / [역마감]</li>
 *   <li>선택 행 감사 이력 패널 (PR-H4c 패턴 일치)</li>
 * </ul>
 *
 * <p>권한 (BE `@RequirePermission` 과 동일):
 * <ul>
 *   <li>마감 실행: 마감 실행 권한</li>
 *   <li>역마감:    역마감 권한</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 (`feedback_uuid_no_user_visibility.md`):
 * 마감 row 의 `id` 는 역마감 path param 전용. 화면 표시는 periodType + periodDate 조합.
 *
 * 매뉴얼 출처: {@code docs/manual/03-회계/04-월말-마감.md}.
 *
 * data-testid:
 * - `period-close-list-table`     — 마감 이력 표
 * - `period-close-new-button`     — 마감 실행 버튼
 * - `period-close-reverse-button` — 역마감 버튼 (역마감 권한 보유 시)
 * - `period-close-audit-panel`    — 감사 이력 패널
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AuditOverlay,
  Badge,
  Button,
  Card,
  DataTable,
  Modal,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  createClosing,
  listClosings,
  PERIOD_STATUS_LABEL,
  PERIOD_TYPE_LABEL,
  reverseClosing,
  type AccountingPeriod,
  type PeriodType,
} from '../api/closingApi'
import { extractApiErrorMessage } from '../api/apiError'
import { closingAuditApi } from '../api/createAuditApi'
import { ClosingRealtimeClient } from '../realtime/AccountingRealtimeClient'
import {
  AuditLockedBanner,
  AuditRevisionBadge,
  groupAuditLogsByField,
} from '../components/audit/AuditOverlaySection'
import {
  AuditVersionHistory,
  isAuditHistoryEndpointUnavailable,
} from '../components/audit/AuditVersionHistory'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

/** YYYY-MM-DD 오늘 날짜. */
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** YYYY-MM-DD → "YYYY-MM" (월별 input value). */
function toMonth(iso: string): string {
  return iso.slice(0, 7)
}

/** "YYYY-MM" → "YYYY-MM-01". */
function monthToFirstDay(month: string): string {
  return `${month}-01`
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
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}`
}

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 13,
}

const noticeStyle: CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  borderRadius: 6,
  background: 'var(--state-warning-bg)',
  color: 'var(--state-warning)',
  fontSize: 12,
  lineHeight: 1.5,
}

export function PeriodCloseListPage() {
  // [C5 후속 사이클1 D-005] role 문자열 직접 판정 제거 — BE @RequirePermission 과 1:1 page-code 판정.
  const { canAccess } = usePermissions()
  const canExecute = canAccess('accounting.period-close', 'create')
  const canReverse = canAccess('accounting.period-close.reverse', 'update')
  const queryClient = useQueryClient()

  /** 월말 마감은 MONTHLY 기본 고정. */
  const periodType: PeriodType = 'MONTHLY'
  const [periodDate, setPeriodDate] = useState<string>(today())
  const [description, setDescription] = useState<string>('')
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(null)
  const [auditHistoryOpen, setAuditHistoryOpen] = useState(false)
  const [auditEndpointUnavailableFor, setAuditEndpointUnavailableFor] = useState<string | null>(null)

  /** 역마감 확인 Modal 상태 */
  const [reverseConfirmRow, setReverseConfirmRow] = useState<AccountingPeriod | null>(null)

  usePageTitle('월말 마감')

  const listQuery = useQuery({
    queryKey: ['period-closings', periodType],
    queryFn: () => listClosings({ periodType }),
  })

  const auditQuery = useQuery({
    queryKey: ['period-closings', selectedClosingId, 'audit-logs'],
    queryFn: () => closingAuditApi.listAuditLogs(selectedClosingId!),
    enabled:
      !!selectedClosingId
      && auditHistoryOpen
      && auditEndpointUnavailableFor !== selectedClosingId,
    retry: false,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!selectedClosingId
      || !auditQuery.isError
      || !isAuditHistoryEndpointUnavailable(auditQuery.error)) return
    setAuditEndpointUnavailableFor((current) =>
      current === selectedClosingId ? current : selectedClosingId,
    )
  }, [selectedClosingId, auditQuery.error, auditQuery.isError])

  useEffect(() => {
    if (!selectedClosingId) return
    const ctrl = ClosingRealtimeClient.subscribe(selectedClosingId, (evt) => {
      void queryClient.invalidateQueries({ queryKey: ['period-closings'] })
      if (evt.event === 'accounting:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({
          queryKey: ['period-closings', selectedClosingId, 'audit-logs'],
        })
      }
    })
    return () => ctrl.abort()
  }, [selectedClosingId, queryClient])

  const selectedClosing = useMemo(
    () => (Array.isArray(listQuery.data) ? listQuery.data : []).find((c) => c.id === selectedClosingId) ?? null,
    [listQuery.data, selectedClosingId],
  )

  const closeMutation = useMutation({
    mutationFn: () =>
      createClosing({
        periodType,
        periodDate: monthToFirstDay(toMonth(periodDate)),
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      setDescription('')
      void queryClient.invalidateQueries({ queryKey: ['period-closings'] })
    },
  })

  const reverseMutation = useMutation({
    mutationFn: (id: string) => reverseClosing(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['period-closings'] })
    },
  })

  const closeError = closeMutation.error as Error | null
  const reverseError = reverseMutation.error as Error | null

  const columns: DataTableColumn<AccountingPeriod>[] = useMemo(
    () => [
      {
        key: 'periodDate',
        header: '기간 (월)',
        width: '130px',
        mobilePriority: 'primary',
        render: (r) => r.periodDate.slice(0, 7),
      },
      {
        key: 'status',
        header: '상태',
        width: '70px',
        mobilePriority: 'secondary',
        render: (r) => (
          <Badge variant={r.status === 'CLOSED' ? 'danger' : 'success'}>
            {PERIOD_STATUS_LABEL[r.status]}
          </Badge>
        ),
      },
      {
        key: 'totalSales',
        header: '매출 합계',
        width: '150px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (r) => fmtKrw(r.totalSales),
      },
      {
        key: 'totalPurchase',
        header: '매입 합계',
        width: '150px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (r) => fmtKrw(r.totalPurchase),
      },
      {
        key: 'totalExpense',
        header: '판관비',
        width: '120px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (r) => fmtKrw(r.totalExpense),
      },
      {
        key: 'lockedSlipCount',
        header: '잠금 전표',
        width: '90px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (r) => r.lockedSlipCount.toLocaleString(),
      },
      {
        key: 'closedAt',
        header: '마감 시각',
        width: '140px',
        mobilePriority: 'secondary',
        render: (r) => fmtTimestamp(r.closedAt),
      },
      {
        key: 'closedBy',
        header: '실행자',
        width: '110px',
        mobilePriority: 'secondary',
        render: (r) => r.closedBy ?? '—',
      },
      {
        key: 'reverseAction',
        header: '',
        width: '110px',
        mobilePriority: 'hidden',
        render: (r) =>
          r.status === 'CLOSED' && canReverse ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="period-close-reverse-button"
              onClick={() => setReverseConfirmRow(r)}
              disabled={reverseMutation.isPending}
            >
              역마감
            </Button>
          ) : null,
      },
      {
        key: 'auditAction',
        header: '이력',
        width: '70px',
        mobilePriority: 'hidden',
        render: (r) => (
          <Button
            variant="ghost"
            size="sm"
            data-testid={`period-close-audit-button-${r.id}`}
            onClick={() => setSelectedClosingId(r.id)}
          >
            보기
          </Button>
        ),
      },
    ],
    [canReverse, reverseMutation],
  )

  return (
    <>
      {/* 마감 실행 카드 */}
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px 0' }}>월말 마감 실행</h3>
        <p style={noticeStyle}>
          마감 실행 시 해당 월의 모든 CONFIRMED 전표가 LOCKED 상태로 전환되며,
          이후 분개/전표 입력이 차단됩니다. 변경이 필요하면 역마감 권한 보유자에게 역마감을
          요청하십시오.
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
          <label style={{ fontSize: 13, color: 'var(--ink-primary)' }}>
            마감 월:&nbsp;
            <input
              type="month"
              value={toMonth(periodDate)}
              onChange={(e) => {
                const v = e.target.value
                if (/^\d{4}-\d{2}$/.test(v)) setPeriodDate(monthToFirstDay(v))
              }}
              style={inputStyle}
            />
          </label>

          <label style={{ fontSize: 13, color: 'var(--ink-primary)', flexGrow: 1, minWidth: 200 }}>
            메모(옵션):&nbsp;
            <input
              type="text"
              value={description}
              maxLength={500}
              placeholder="마감 사유 등 (선택)"
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...inputStyle, width: '100%', maxWidth: 320 }}
            />
          </label>

          <Button
            variant="primary"
            data-testid="period-close-new-button"
            onClick={() => closeMutation.mutate()}
            disabled={!canExecute || closeMutation.isPending}
            title={!canExecute ? '마감 실행 권한 필요' : undefined}
          >
            {closeMutation.isPending ? '처리 중...' : '마감 실행'}
          </Button>

          <a
            href="#/accounting/balances"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: 'var(--color-brand-600)', textDecoration: 'underline' }}
          >
            시산표 열기 ↗
          </a>
        </div>

        {!canExecute ? (
          <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--state-danger)' }}>
            마감 실행 권한이 없습니다 — 마감 실행 권한 보유자만 가능합니다.
          </p>
        ) : null}

        {closeMutation.isSuccess ? (
          <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--state-success)' }}>
            마감이 완료되었습니다.
          </p>
        ) : null}

        {closeError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            마감 실행 실패: {extractApiErrorMessage(closeError)}
          </div>
        ) : null}

        {reverseError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            역마감 실패: {extractApiErrorMessage(reverseError)}
          </div>
        ) : null}
      </Card>

      {/* 마감 이력 표 */}
      <Card>
        <h3 style={{ margin: '0 0 8px 0' }}>월말 마감 이력</h3>

        {listQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
            <Spinner size="lg" label="마감 목록 불러오는 중" />
          </div>
        ) : listQuery.isError ? (
          <div className="error-banner" role="alert">
            마감 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
          </div>
        ) : (
          <div data-testid="period-close-list-table">
            <DataTable
              columns={columns}
              rows={Array.isArray(listQuery.data) ? listQuery.data : []}
              rowKey={(r) => r.id}
              emptyMessage="월말 마감 이력이 없습니다."
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
              data-testid="period-close-reverse-confirm-button"
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
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{reverseConfirmRow.periodDate.slice(0, 7)}</strong> 월말 마감을 역마감
            처리합니다.
            <br />
            역마감 후 전표/분개 변경이 다시 허용됩니다. 진행하시겠습니까?
          </p>
        ) : null}
      </Modal>

      {/* 감사 이력 패널 */}
      {selectedClosing ? (
        <Card style={{ marginTop: 16 }} data-testid="period-close-audit-panel">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h3 style={{ margin: 0 }}>
              마감 변경 이력 — {PERIOD_TYPE_LABEL[selectedClosing.periodType]}{' '}
              {selectedClosing.periodDate.slice(0, 7)}
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <AuditRevisionBadge
                logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
                isError={auditQuery.isError}
                isFetched={auditQuery.isFetched}
                isLoading={auditQuery.isLoading}
                testIdPrefix="period-close-audit"
              />
              <AuditVersionHistory
                logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
                isLoading={auditQuery.isLoading}
                isError={auditQuery.isError}
                isFetched={auditQuery.isFetched}
                error={auditQuery.error}
                open={auditHistoryOpen}
                onOpenChange={setAuditHistoryOpen}
                testIdPrefix="period-close-audit"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedClosingId(null)}
              >
                닫기
              </Button>
            </div>
          </div>

          {selectedClosing.status === 'CLOSED' ? (
            <AuditLockedBanner
              statusLabel={PERIOD_STATUS_LABEL[selectedClosing.status]}
              testId="period-close-audit-locked-banner"
              message="마감된 기간은 역마감 후에만 변경 가능합니다."
            />
          ) : null}

          <div data-testid="period-close-audit-overlay-description">
            <strong style={{ fontSize: 13 }}>메모</strong>:{' '}
            <AuditOverlay
              field="description"
              currentValue={selectedClosing.description ?? null}
              history={groupAuditLogsByField(Array.isArray(auditQuery.data) ? auditQuery.data : [])['description'] ?? []}
              isError={auditQuery.isError}
              isFetched={auditQuery.isFetched}
              isLoading={auditQuery.isLoading}
            />
          </div>
        </Card>
      ) : null}
    </>
  )
}
