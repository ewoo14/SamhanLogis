/**
 * 매출 마감 화면 (`/warehouse/closing`).
 *
 * P2-4 매출 마감 (Phase 10 Step 8 — slice 8).
 * 매뉴얼 출처: `docs/manual/02-창고/04-매출-마감.md`.
 *
 * 화면 구성:
 * - 상단: 일별/월별 toggle + 기간 일자 선택 + [마감 실행] 버튼
 * - 시산표 link (새 탭) + 마감 후 변경 차단 안내
 * - 마감 list table — periodType / periodDate / status / totalSales / closedAt / closedBy
 *   - row 별 [역마감] 버튼 (CLOSED + 역마감 권한 보유 시)
 *
 * 권한 (BE `@RequirePermission` 과 동일):
 * - 마감 실행: 마감 실행 권한
 * - 역마감:    역마감 권한
 *
 * UUID 비공개 가드 (`feedback_uuid_no_user_visibility.md`):
 * - 마감 row 의 `id` 는 reverse 호출 path 에만 사용. 화면 표시는 periodType+periodDate.
 *
 * data-testid:
 * - `closing-list-table`             — 마감 list table
 * - `closing-new-button`             — 마감 실행 버튼
 * - `closing-reverse-button`         — 역마감 버튼 (per row, 역마감 권한 보유 시)
 * - `closing-daily-detail-table`     — 일별 detail 표 (PR-E2 BE-A12)
 * - `closing-daily-detail-row-{seq}` — 일별 detail 표 row (seq = 1-based index)
 * - `closing-daily-detail-csv-button` — 일별 detail CSV 다운로드 버튼
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
  getDailyClosingDetail,
  listClosings,
  PERIOD_STATUS_LABEL,
  PERIOD_TYPE_LABEL,
  reverseClosing,
  type AccountingPeriod,
  type DailyClosingDetail,
  type DailyTaxInvoiceRow,
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
import { AuditVersionHistory } from '../components/audit/AuditVersionHistory'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { today } from '../utils/dateUtils'

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

/** ISO 8601 → "YYYY-MM-DD HH:mm" (Asia/Seoul 가정). */
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

/** CSV 셀 escape — 콤마/줄바꿈/큰따옴표 포함 시 큰따옴표 wrap + 내부 큰따옴표 2배. */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * 일별 detail CSV 다운로드 (UTF-8 BOM — Excel 한글 호환).
 *
 * 컬럼: 순번 / 세금계산서번호 / 거래처명 / 공급가액 / 세액 / 합계
 * 마지막 row 는 합계 (전체 supply / vat / total).
 */
function downloadDailyDetailCsv(detail: DailyClosingDetail): void {
  const header = ['순번', '세금계산서번호', '거래처명', '공급가액', '세액', '합계']
  const rows = detail.taxInvoices.map((r, idx) =>
    [idx + 1, r.taxInvoiceNo, r.partnerName, r.supplyAmount, r.vatAmount, r.totalAmount]
      .map(csvCell)
      .join(','),
  )
  const totalRow = [
    '합계',
    '',
    '',
    detail.totalSupply,
    detail.totalVat,
    detail.totalAmount,
  ]
    .map(csvCell)
    .join(',')
  const body = [header.map(csvCell).join(','), ...rows, totalRow].join('\r\n')
  const blob = new Blob(['﻿', body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `closing-daily-detail_${detail.date}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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

export function MonthEndClosingPage() {
  // [C5 후속 사이클1 D-005] role 문자열 직접 판정 제거 — BE @RequirePermission 과 1:1 page-code 판정.
  const { canAccess } = usePermissions()
  const canExecute = canAccess('accounting.period-close', 'create')
  const canReverse = canAccess('accounting.period-close.reverse', 'update')
  const queryClient = useQueryClient()

  const [periodType, setPeriodType] = useState<PeriodType>('MONTHLY')
  const [periodDate, setPeriodDate] = useState<string>(today())
  const [description, setDescription] = useState<string>('')
  // PR-H4c: row 클릭으로 audit overlay panel 표시.
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(null)
  const [auditHistoryOpen, setAuditHistoryOpen] = useState(false)

  /** 역마감 확인 Modal 상태 */
  const [reverseConfirmRow, setReverseConfirmRow] = useState<AccountingPeriod | null>(null)

  usePageTitle('매출 마감')

  const listQuery = useQuery({
    queryKey: ['closings', periodType],
    queryFn: () => listClosings({ periodType }),
  })

  // PR-H4c: 선택 마감 audit log + SSE.
  const auditQuery = useQuery({
    queryKey: ['closings', selectedClosingId, 'audit-logs'],
    queryFn: () => closingAuditApi.listAuditLogs(selectedClosingId!),
    enabled: !!selectedClosingId && auditHistoryOpen,
    retry: false,
  })

  useEffect(() => {
    if (!selectedClosingId) return
    const ctrl = ClosingRealtimeClient.subscribe(selectedClosingId, (evt) => {
      void queryClient.invalidateQueries({ queryKey: ['closings'] })
      if (evt.event === 'accounting:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({
          queryKey: ['closings', selectedClosingId, 'audit-logs'],
        })
      }
    })
    return () => ctrl.abort()
  }, [selectedClosingId, queryClient])

  const selectedClosing = useMemo(
    () =>
      (Array.isArray(listQuery.data) ? listQuery.data : []).find((c) => c.id === selectedClosingId) ?? null,
    [listQuery.data, selectedClosingId],
  )

  const closeMutation = useMutation({
    mutationFn: () =>
      createClosing({
        periodType,
        periodDate:
          periodType === 'MONTHLY' ? monthToFirstDay(toMonth(periodDate)) : periodDate,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      setDescription('')
      void queryClient.invalidateQueries({ queryKey: ['closings'] })
    },
  })

  const reverseMutation = useMutation({
    mutationFn: (id: string) => reverseClosing(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['closings'] })
    },
  })

  /**
   * 일별 detail (PR-E2 BE-A12) — DAILY 탭 + 유효 일자일 때만 호출.
   *
   * legacy GAS 12번 "일마감 프로그램" — 발행된 세금계산서 + 모델별 매출 detail.
   * read-only 이므로 마감 OPEN/CLOSED 무관 호출.
   */
  const dailyDetailQuery = useQuery({
    queryKey: ['closings', 'daily-detail', periodDate],
    queryFn: () => getDailyClosingDetail(periodDate),
    enabled:
      periodType === 'DAILY' && /^\d{4}-\d{2}-\d{2}$/.test(periodDate) && canExecute,
  })

  const closeError = closeMutation.error as Error | null
  const reverseError = reverseMutation.error as Error | null
  const dailyDetailError = dailyDetailQuery.error as Error | null

  const columns: DataTableColumn<AccountingPeriod>[] = useMemo(
    () => [
      {
        key: 'periodType',
        header: '구분',
        width: '70px',
        mobilePriority: 'hidden',
        render: (r) => PERIOD_TYPE_LABEL[r.periodType],
      },
      {
        key: 'periodDate',
        header: '기간 일자',
        width: '130px',
        mobilePriority: 'primary',
        render: (r) =>
          r.periodType === 'MONTHLY' ? r.periodDate.slice(0, 7) : r.periodDate,
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
        width: '140px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (r) => fmtKrw(r.totalSales),
      },
      {
        key: 'totalPurchase',
        header: '매입 합계',
        width: '140px',
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
        width: '120px',
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
              data-testid="closing-reverse-button"
              onClick={() => setReverseConfirmRow(r)}
              disabled={reverseMutation.isPending}
            >
              역마감
            </Button>
          ) : null,
      },
      // PR-H4c: row 클릭으로 audit overlay panel 표시.
      {
        key: 'auditAction',
        header: '이력',
        width: '70px',
        mobilePriority: 'hidden',
        render: (r) => (
          <Button
            variant="ghost"
            size="sm"
            data-testid={`closing-audit-button-${r.id}`}
            onClick={() => setSelectedClosingId(r.id)}
          >
            보기
          </Button>
        ),
      },
    ],
    [canReverse, reverseMutation],
  )

  /**
   * 일별 detail 표 column — seq / 세금계산서번호 / 거래처 / 공급/세액/합계.
   *
   * UUID 비공개 가드: 식별자는 `taxInvoiceNo` (발행번호) + `partnerName`.
   * row key 는 (taxInvoiceNo + idx) — BE 미보장 unique 회피.
   */
  type DailyDetailRow = DailyTaxInvoiceRow & { seq: number }

  const detailRows: DailyDetailRow[] = useMemo(
    () =>
      (dailyDetailQuery.data?.taxInvoices ?? []).map((r, idx) => ({
        ...r,
        seq: idx + 1,
      })),
    [dailyDetailQuery.data],
  )

  const detailColumns: DataTableColumn<DailyDetailRow>[] = useMemo(
    () => [
      {
        key: 'seq',
        header: '순번',
        width: '60px',
        align: 'right',
        mobilePriority: 'hidden',
        // testid 는 row 의 seq cell 에 부여 — DataTable 이 rowProps 미지원.
        render: (r) => (
          <span data-testid={`closing-daily-detail-row-${r.seq}`}>{r.seq}</span>
        ),
      },
      {
        key: 'taxInvoiceNo',
        header: '세금계산서번호',
        width: '160px',
        mobilePriority: 'primary',
        render: (r) => r.taxInvoiceNo,
      },
      {
        key: 'partnerName',
        header: '거래처명',
        mobilePriority: 'secondary',
        render: (r) => r.partnerName,
      },
      {
        key: 'supplyAmount',
        header: '공급가액',
        width: '140px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (r) => fmtKrw(r.supplyAmount),
      },
      {
        key: 'vatAmount',
        header: '세액',
        width: '120px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (r) => fmtKrw(r.vatAmount),
      },
      {
        key: 'totalAmount',
        header: '합계',
        width: '140px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (r) => fmtKrw(r.totalAmount),
      },
    ],
    [],
  )

  return (
    <>
      {/* 상단: 마감 실행 카드 */}
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px 0' }}>마감 실행</h3>
        <p style={noticeStyle}>
          ⚠ 마감 실행 시 해당 기간의 모든 CONFIRMED 전표가 LOCKED 상태로 전환되며,
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
          {/* 일별/월별 toggle */}
          <div role="tablist" aria-label="마감 유형" style={{ display: 'inline-flex', gap: 4 }}>
            {(['DAILY', 'MONTHLY'] as const).map((t) => (
              <Button
                key={t}
                variant={periodType === t ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setPeriodType(t)}
                role="tab"
                aria-selected={periodType === t}
              >
                {PERIOD_TYPE_LABEL[t]}
              </Button>
            ))}
          </div>

          {/* 기간 일자 input — 일별/월별 분기 */}
          <label style={{ fontSize: 13, color: 'var(--ink-primary)' }}>
            기간 일자:&nbsp;
            {periodType === 'MONTHLY' ? (
              <input
                type="month"
                value={toMonth(periodDate)}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^\d{4}-\d{2}$/.test(v)) setPeriodDate(monthToFirstDay(v))
                }}
                style={inputStyle}
              />
            ) : (
              <input
                type="date"
                value={periodDate}
                onChange={(e) => setPeriodDate(e.target.value)}
                style={inputStyle}
              />
            )}
          </label>

          {/* 메모 (옵션) */}
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

          {/* 마감 실행 버튼 */}
          <Button
            variant="primary"
            data-testid="closing-new-button"
            onClick={() => closeMutation.mutate()}
            disabled={!canExecute || closeMutation.isPending}
            title={!canExecute ? '마감 실행 권한 필요' : undefined}
          >
            {closeMutation.isPending ? '처리 중...' : '마감 실행'}
          </Button>

          {/* 시산표 link (새 탭) */}
          <a
            href={`#/accounting/balances`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              color: 'var(--color-brand-600)',
              textDecoration: 'underline',
            }}
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

      {/* 일별 detail (PR-E2 BE-A12) — DAILY 탭 + 권한 보유 시 노출 */}
      {periodType === 'DAILY' && canExecute ? (
        <Card style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h3 style={{ margin: 0 }}>
              일별 세금계산서 detail — {periodDate}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              data-testid="closing-daily-detail-csv-button"
              disabled={!dailyDetailQuery.data || detailRows.length === 0}
              onClick={() => {
                if (dailyDetailQuery.data) {
                  downloadDailyDetailCsv(dailyDetailQuery.data)
                }
              }}
              title={
                detailRows.length === 0
                  ? '내려받을 detail 데이터가 없습니다'
                  : 'UTF-8 BOM CSV — Excel 한글 호환'
              }
            >
              CSV 다운로드
            </Button>
          </div>

          {dailyDetailQuery.isLoading ? (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
              <Spinner size="md" label="일별 detail 불러오는 중" />
            </div>
          ) : dailyDetailError ? (
            <div className="error-banner" role="alert">
              일별 detail 을 불러오지 못했습니다: {dailyDetailError.message}
            </div>
          ) : (
            <>
              <div data-testid="closing-daily-detail-table">
                <DataTable
                  columns={detailColumns}
                  rows={detailRows}
                  rowKey={(r) => `${r.seq}-${r.taxInvoiceNo}`}
                  emptyMessage="해당 일자에 발행된 세금계산서가 없습니다."
                />
              </div>

              {/* 합계 row — 표 footer */}
              {dailyDetailQuery.data && detailRows.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 24,
                    marginTop: 12,
                    paddingTop: 8,
                    borderTop: '1px solid var(--line-default)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  data-testid="closing-daily-detail-totals"
                >
                  <span>건수: {dailyDetailQuery.data.totalTaxInvoiceCount}</span>
                  <span>공급가액: {fmtKrw(dailyDetailQuery.data.totalSupply)}</span>
                  <span>세액: {fmtKrw(dailyDetailQuery.data.totalVat)}</span>
                  <span>합계: {fmtKrw(dailyDetailQuery.data.totalAmount)}</span>
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      {/* 마감 list */}
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0 }}>
            마감 이력 — {PERIOD_TYPE_LABEL[periodType]}
          </h3>
        </div>

        {listQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
            <Spinner size="lg" label="마감 목록 불러오는 중" />
          </div>
        ) : listQuery.isError ? (
          <div className="error-banner" role="alert">
            마감 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
          </div>
        ) : (
          <div data-testid="closing-list-table">
            <DataTable
              columns={columns}
              rows={Array.isArray(listQuery.data) ? listQuery.data : []}
              rowKey={(r) => r.id}
              emptyMessage="해당 유형의 마감 이력이 없습니다."
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
              data-testid="closing-reverse-confirm-button"
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
            <strong>
              {PERIOD_TYPE_LABEL[reverseConfirmRow.periodType]}{' '}
              {reverseConfirmRow.periodDate.slice(
                0,
                reverseConfirmRow.periodType === 'MONTHLY' ? 7 : 10,
              )}
            </strong>{' '}
            마감을 역마감 처리합니다.
            <br />
            역마감 후 전표/분개 변경이 다시 허용됩니다. 진행하시겠습니까?
          </p>
        ) : null}
      </Modal>

      {/* PR-H4c: 선택 마감 audit overlay panel — SlipDetailPage 패턴 1:1 */}
      {selectedClosing ? (
        <Card style={{ marginTop: 16 }} data-testid="closing-audit-panel">
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
              {selectedClosing.periodType === 'MONTHLY'
                ? selectedClosing.periodDate.slice(0, 7)
                : selectedClosing.periodDate}
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <AuditRevisionBadge
                logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
                isError={auditQuery.isError}
                testIdPrefix="closing-audit"
              />
              <AuditVersionHistory
                logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
                isLoading={auditQuery.isLoading}
                isError={auditQuery.isError}
                error={auditQuery.error}
                open={auditHistoryOpen}
                onOpenChange={setAuditHistoryOpen}
                testIdPrefix="closing-audit"
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
          {/* 마감 후 본문 잠금 — banner */}
          {selectedClosing.status === 'CLOSED' ? (
            <AuditLockedBanner
              statusLabel={PERIOD_STATUS_LABEL[selectedClosing.status]}
              testId="closing-audit-locked-banner"
              message="마감된 기간은 역마감 후에만 변경 가능합니다."
            />
          ) : null}
          <div data-testid="closing-audit-overlay-description">
            <strong style={{ fontSize: 13 }}>메모</strong>:{' '}
            <AuditOverlay
              field="description"
              currentValue={selectedClosing.description ?? null}
              history={groupAuditLogsByField(Array.isArray(auditQuery.data) ? auditQuery.data : [])['description'] ?? []}
              isError={auditQuery.isError}
            />
          </div>
        </Card>
      ) : null}
    </>
  )
}
