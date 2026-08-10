/**
 * 재고 실사 상세 (`/warehouse/audit/:id`).
 *
 * Phase 10 P2-6 슬라이스 9. BE `GET /inventory/audits/{id}` + transition + 라인 입력.
 *
 * 화면 구성:
 * - 헤더: auditNo / 창고 / 일자 / 상태 / 차이금액
 * - 액션 버튼 (status 별):
 *   - PLANNED      → [시작] / [취소]
 *   - IN_PROGRESS  → [완료] / [취소]
 *   - COMPLETED    → 차이 자동 분개 link 안내
 *   - CANCELLED    → 액션 없음
 * - 바코드 입력 form: productId 입력 + 수량 + scanned flag (모바일=true, 수동=false)
 * - 라인 테이블: productName / expected / actual / diff / 단가 / 차이금액
 *
 * UUID 비공개 — 화면에는 productName 만 노출. productId 는 라인 매칭용 hidden input.
 *
 * data-testid:
 * - audit-detail-header
 * - audit-detail-lines-table
 * - audit-line-barcode-input
 * - audit-line-actual-input
 * - audit-line-record-button
 * - audit-start-button
 * - audit-complete-button
 * - audit-cancel-button
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import axios from 'axios'
import {
  AuditOverlay,
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  type AuditLogEntry,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  AUDIT_STATUS_LABEL,
  cancelAudit,
  completeAudit,
  getAudit,
  recordAuditLine,
  startAudit,
  type AuditDetail,
  type AuditLine,
  type AuditStatus,
} from '../api/auditApi'
import { inventoryAuditAuditApi } from '../api/createAuditApi'
import { InventoryAuditRealtimeClient } from '../realtime/WarehouseRealtimeClient'
import {
  AuditLockedBanner,
  AuditRevisionBadge,
  groupAuditLogsByField,
} from '../components/audit/AuditOverlaySection'
import { AuditVersionHistory } from '../components/audit/AuditVersionHistory'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { useIsMobile } from '../hooks/useIsMobile'
import { MobileActionSheet } from '../components/common/MobileActionSheet'
import { MobileCollapsible } from '../components/common/MobileCollapsible'

const STATUS_VARIANT: Record<
  AuditStatus,
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  PLANNED: 'neutral',
  IN_PROGRESS: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'danger',
}
const AUDIT_CANCEL_BUTTON_TEST_ID = 'audit-cancel-button'

/** KRW 정수 (string) → "₩1,234,567" 표시 (음수 ▼). */
function formatKrw(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '—'
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '₩0'
  const formatted = '₩' + Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `▼ ${formatted}` : formatted
}

function auditStatusBadgeStyle(status: AuditStatus) {
  switch (status) {
    case 'IN_PROGRESS':
      return { background: '#EDE9FE', color: '#5B21B6' }
    case 'COMPLETED':
      return { background: '#D1FAE5', color: '#065F46' }
    case 'CANCELLED':
      return { background: '#FEE2E2', color: '#991B1B' }
    case 'PLANNED':
    default:
      return { background: '#F3F4F6', color: '#4B5563' }
  }
}

export function InventoryAuditDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const isMobile = useIsMobile()
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [auditHistoryOpen, setAuditHistoryOpen] = useState(false)

  const detailQuery = useQuery({
    queryKey: ['inventory', 'audit', id],
    queryFn: () => getAudit(id),
    enabled: !!id,
  })

  // PR-H4c FE-B: audit log 백필 — BE 미구현 시 빈 배열 fallback
  const auditQuery = useQuery({
    queryKey: ['inventory', 'audit', id, 'audit-logs'],
    queryFn: () => inventoryAuditAuditApi.listAuditLogs(id).catch(() => []),
    enabled: !!id,
  })

  // PR-H4c FE-B: SSE 구독 — inventory:edit 수신 시 본문 + audit cache invalidate
  useEffect(() => {
    if (!id) return
    const ctrl = InventoryAuditRealtimeClient.subscribe(id, (evt) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'audit', id] })
      if (evt.event === 'inventory:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({
          queryKey: ['inventory', 'audit', id, 'audit-logs'],
        })
      }
    })
    return () => ctrl.abort()
  }, [id, queryClient])

  usePageTitle('재고 실사 상세', detailQuery.data?.auditNo)

  const startMutation = useMutation({
    mutationFn: () => startAudit(id),
    onSuccess: invalidate,
  })

  const completeMutation = useMutation({
    mutationFn: () => completeAudit(id),
    onSuccess: invalidate,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelAudit(id),
    onSuccess: invalidate,
  })

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: ['inventory', 'audit', id],
    })
    void queryClient.invalidateQueries({
      queryKey: ['inventory', 'audits'],
    })
  }

  if (detailQuery.isLoading) {
    return <p style={{ padding: 24 }}>불러오는 중...</p>
  }

  const audit = detailQuery.data
  if (!audit) {
    return (
      <div style={{ padding: 24 }}>
        <p>실사 정보를 찾을 수 없습니다.</p>
        <Button variant="ghost" onClick={() => navigate('/warehouse/audit')}>
          목록으로
        </Button>
      </div>
    )
  }

  // PR-H4c FE-B: COMPLETED/CANCELLED 단계는 본문 변경 차단 — banner 노출
  const isLocked = audit.status === 'COMPLETED' || audit.status === 'CANCELLED'
  // start/complete/cancel 은 InventoryAuditController 의 inventory.adjust UPDATE 계약과 일치한다.
  const canTransitionAudit = canAccess('inventory.adjust', 'update')
  const canCreateAuditLine = canAccess('inventory.stock-balance', 'create')
  const auditLogs = Array.isArray(auditQuery.data) ? auditQuery.data : []
  const auditByField = groupAuditLogsByField(auditLogs)
  const mobilePrimaryAction = audit.status === 'PLANNED' && canTransitionAudit
    ? {
        label: startMutation.isPending ? '시작 중...' : '시작',
        disabled: startMutation.isPending,
        onClick: () => startMutation.mutate(),
      }
    : audit.status === 'IN_PROGRESS' && canTransitionAudit
      ? {
          label: completeMutation.isPending ? '완료 중...' : '완료',
          disabled: completeMutation.isPending,
          onClick: () => {
            if (
              window.confirm(
                '실사를 완료합니다. 차이 분개가 자동 생성되고 재고가 조정됩니다.',
              )
            ) {
              completeMutation.mutate()
            }
          },
        }
      : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isMobile ? (
        <>
          <div className="mobile-summary-card" data-testid="audit-mobile-summary">
            <div className="mobile-summary-card-header">
              <span className="mobile-summary-doc-no">{audit.auditNo}</span>
              <span className="mobile-status-badge" style={auditStatusBadgeStyle(audit.status)}>
                {AUDIT_STATUS_LABEL[audit.status]}
              </span>
            </div>
            <div className="mobile-summary-partner">
              {audit.warehouseCode} · {audit.warehouseName}
            </div>
            <div className="mobile-summary-divider" />
            <div className="mobile-summary-total-row">
              <span className="mobile-summary-total-amount">{formatKrw(audit.totalDiffAmount)}</span>
              <span className="mobile-summary-date">실사일자 {audit.auditDate}</span>
            </div>
          </div>

          <div className="mobile-action-bar" role="toolbar" aria-label="재고실사 액션">
            {mobilePrimaryAction ? (
              <button
                type="button"
                className="mobile-action-primary"
                disabled={mobilePrimaryAction.disabled}
                onClick={mobilePrimaryAction.onClick}
              >
                {mobilePrimaryAction.label}
              </button>
            ) : null}
            <button
              type="button"
              className="mobile-action-icon"
              aria-label="더보기"
              onClick={() => setMobileMoreOpen(true)}
            >
              ···
            </button>
            <MobileActionSheet open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)}>
                  {(audit.status === 'PLANNED' || audit.status === 'IN_PROGRESS') && canTransitionAudit ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item danger"
                      disabled={cancelMutation.isPending}
                      onClick={() => {
                        setMobileMoreOpen(false)
                        if (window.confirm('실사를 취소합니다.')) {
                          cancelMutation.mutate()
                        }
                      }}
                    >
                      취소
                    </button>
                  ) : null}
                  {audit.status === 'COMPLETED' ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        navigate('/accounting/journals')
                      }}
                    >
                      차이 자동 분개 보기
                    </button>
                  ) : null}
            </MobileActionSheet>
          </div>

          <MobileCollapsible title="실사 상세 정보" className="mobile-section-card">
            <DetailGrid audit={audit} auditByField={auditByField} />
          </MobileCollapsible>
        </>
      ) : null}

      {!isMobile ? (
      <Card>
        <div data-testid="audit-detail-header">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{audit.auditNo}</h3>
              <Badge variant={STATUS_VARIANT[audit.status]}>
                {AUDIT_STATUS_LABEL[audit.status]}
              </Badge>
              {/* PR-H4c FE-B: 수정 횟수 badge (revert 미지원 — BE 정책상 차이 분개 후 변경 불가) */}
              <AuditRevisionBadge
                logs={auditLogs}
                isError={auditQuery.isError}
                testIdPrefix="audit-detail"
              />
              <AuditVersionHistory
                logs={auditLogs}
                isLoading={auditQuery.isLoading}
                isError={auditQuery.isError}
                open={auditHistoryOpen}
                onOpenChange={setAuditHistoryOpen}
                testIdPrefix="audit-detail"
              />
            </div>
          </div>
          {isLocked ? (
            <AuditLockedBanner
              statusLabel={AUDIT_STATUS_LABEL[audit.status]}
              testId="audit-detail-locked-banner"
              message="차이 분개가 확정되어 본문 변경이 잠금 처리됩니다. 변경 필요 시 수정 요청을 사용하세요."
            />
          ) : null}
          <DetailGrid audit={audit} auditByField={auditByField} />
        </div>

        <div
          className="detail-action-bar"
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            flexWrap: 'wrap',
          }}
        >
          {audit.status === 'PLANNED' && canTransitionAudit ? (
            <>
              <Button
                variant="primary"
                data-testid="audit-start-button"
                loading={startMutation.isPending}
                onClick={() => startMutation.mutate()}
              >
                시작
              </Button>
              <Button
                variant="ghost"
                data-testid={!isMobile ? AUDIT_CANCEL_BUTTON_TEST_ID : undefined}
                loading={cancelMutation.isPending}
                onClick={() => {
                  if (window.confirm('실사를 취소합니다.')) {
                    cancelMutation.mutate()
                  }
                }}
              >
                취소
              </Button>
            </>
          ) : null}
          {audit.status === 'IN_PROGRESS' && canTransitionAudit ? (
            <>
              <Button
                variant="primary"
                data-testid="audit-complete-button"
                loading={completeMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      '실사를 완료합니다. 차이 분개가 자동 생성되고 재고가 조정됩니다.',
                    )
                  ) {
                    completeMutation.mutate()
                  }
                }}
              >
                완료
              </Button>
              <Button
                variant="ghost"
                data-testid={!isMobile ? AUDIT_CANCEL_BUTTON_TEST_ID : undefined}
                loading={cancelMutation.isPending}
                onClick={() => {
                  if (window.confirm('진행 중인 실사를 취소합니다.')) {
                    cancelMutation.mutate()
                  }
                }}
              >
                취소
              </Button>
            </>
          ) : null}
          {audit.status === 'COMPLETED' ? (
            <a
              href="#/accounting/journals"
              style={{
                fontSize: 13,
                color: 'var(--color-brand-700)',
                textDecoration: 'underline',
              }}
              data-testid="audit-journal-link"
            >
              차이 자동 분개 보기 →
            </a>
          ) : null}
        </div>

        {startMutation.isError || completeMutation.isError || cancelMutation.isError ? (
          <div
            className="error-banner"
            role="alert"
            style={{ marginTop: 12 }}
          >
            상태 변경에 실패했습니다.
          </div>
        ) : null}
      </Card>
      ) : null}

      {audit.status === 'IN_PROGRESS' && canCreateAuditLine ? (
        <BarcodeInput audit={audit} onRecorded={invalidate} />
      ) : null}

      <Card>
        <h4 className="detail-mobile-hide" style={{ margin: '0 0 12px' }}>실사 라인</h4>
        <LinesTable audit={audit} />
      </Card>
    </div>
  )
}

interface DetailGridProps {
  audit: AuditDetail
  /** PR-H4c FE-B: field 별 audit log group — totalDiffAmount overlay 표시. */
  auditByField: Record<string, AuditLogEntry[]>
}

function DetailGrid({ audit, auditByField }: DetailGridProps) {
  return (
    <dl className="audit-detail-meta">
      <dt style={dtStyle}>창고</dt>
      <dd style={ddStyle}>
        {audit.warehouseCode} · {audit.warehouseName}
      </dd>
      <dt style={dtStyle}>실사일자</dt>
      <dd style={ddStyle}>{audit.auditDate}</dd>
      <dt style={dtStyle}>차이금액</dt>
      <dd style={ddStyle} data-testid="audit-detail-audit-overlay-totalDiffAmount">
        <AuditOverlay
          field="totalDiffAmount"
          currentValue={formatKrw(audit.totalDiffAmount)}
          history={auditByField['totalDiffAmount'] ?? []}
        />
      </dd>
      <dt style={dtStyle}>시작</dt>
      <dd style={ddStyle}>
        {audit.startedAt ? audit.startedAt.replace('T', ' ').slice(0, 19) : '—'}
      </dd>
      <dt style={dtStyle}>완료</dt>
      <dd style={ddStyle}>
        {audit.completedAt
          ? audit.completedAt.replace('T', ' ').slice(0, 19)
          : '—'}
      </dd>
      <dt style={dtStyle}>취소</dt>
      <dd style={ddStyle}>
        {audit.cancelledAt
          ? audit.cancelledAt.replace('T', ' ').slice(0, 19)
          : '—'}
      </dd>
    </dl>
  )
}

const dtStyle: React.CSSProperties = {
  color: 'var(--color-neutral-500)',
  fontWeight: 600,
  margin: 0,
}

const ddStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--color-neutral-900)',
}

interface BarcodeInputProps {
  audit: AuditDetail
  onRecorded: () => void
}

function BarcodeInput({ audit, onRecorded }: BarcodeInputProps) {
  const [productId, setProductId] = useState('')
  const [actualQty, setActualQty] = useState('')
  const [scanned, setScanned] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      recordAuditLine(audit.id, {
        productId: productId.trim(),
        actualQty: Number.parseInt(actualQty, 10),
        scanned,
      }),
    onSuccess: () => {
      setProductId('')
      setActualQty('')
      setScanned(false)
      onRecorded()
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending) return
    if (!productId.trim()) return
    const qty = Number.parseInt(actualQty, 10)
    if (!Number.isFinite(qty) || qty < 0) return
    mutation.mutate()
  }

  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '라인 입력에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  return (
    <Card>
      <h4 style={{ margin: '0 0 12px' }}>바코드 / 수동 입력</h4>
      <form
        onSubmit={handleSubmit}
        className="audit-barcode-form"
      >
        <FormField
          label="품목코드 / 바코드"
          required
          render={({ id }) => (
            <input
              id={id}
              type="text"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              data-testid="audit-line-barcode-input"
              autoFocus
              style={inputStyle}
              placeholder="바코드 스캔 값 또는 품목코드"
            />
          )}
        />
        <FormField
          label="실물 수량"
          required
          render={({ id }) => (
            <input
              id={id}
              type="number"
              min={0}
              value={actualQty}
              onChange={(e) => setActualQty(e.target.value)}
              data-testid="audit-line-actual-input"
              style={inputStyle}
            />
          )}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            paddingBottom: 8,
          }}
        >
          <input
            type="checkbox"
            checked={scanned}
            onChange={(e) => setScanned(e.target.checked)}
          />
          스캔
        </label>
        <Button
          type="submit"
          variant="primary"
          data-testid="audit-line-record-button"
          loading={mutation.isPending}
          disabled={!productId.trim() || !actualQty}
        >
          입력
        </Button>
      </form>
      {errorMessage ? (
        <div className="error-banner" role="alert" style={{ marginTop: 12 }}>
          {errorMessage}
        </div>
      ) : null}
    </Card>
  )
}

interface LinesTableProps {
  audit: AuditDetail
}

function LinesTable({ audit }: LinesTableProps) {
  const columns: DataTableColumn<AuditLine>[] = [
    {
      key: 'productName',
      header: '제품',
      render: (l) => l.productName,
    },
    {
      key: 'expectedQty',
      header: '장부수량',
      width: '100px',
      align: 'right',
      render: (l) => l.expectedQty.toLocaleString(),
    },
    {
      key: 'actualQty',
      header: '실물수량',
      width: '100px',
      align: 'right',
      render: (l) => (l.actualQty === null ? '—' : l.actualQty.toLocaleString()),
    },
    {
      key: 'diffQty',
      header: '차이수량',
      width: '100px',
      align: 'right',
      render: (l) => {
        if (l.actualQty === null) return '—'
        if (l.diffQty === 0) return '0'
        return l.diffQty > 0 ? `+${l.diffQty}` : String(l.diffQty)
      },
    },
    {
      key: 'unitCost',
      header: '단가',
      width: '120px',
      align: 'right',
      render: (l) => formatKrw(l.unitCost),
    },
    {
      key: 'diffAmount',
      header: '차이금액',
      width: '140px',
      align: 'right',
      render: (l) => (l.actualQty === null ? '—' : formatKrw(l.diffAmount)),
    },
    {
      key: 'barcodeScanned',
      header: '입력',
      width: '90px',
      render: (l) =>
        l.actualQty === null ? (
          <Badge variant="neutral">대기</Badge>
        ) : l.barcodeScanned ? (
          <Badge variant="brand">스캔</Badge>
        ) : (
          <Badge variant="success">수동</Badge>
        ),
    },
  ]

  return (
    <div data-testid="audit-detail-lines-table">
      <div className="detail-mobile-hide">
        <DataTable
          columns={columns}
          rows={audit.lines}
          rowKey={(l) => l.id}
          emptyMessage="snapshot 라인이 없습니다."
        />
      </div>
      <div className="mobile-item-list" data-testid="audit-mobile-lines">
        {audit.lines.length === 0 ? (
          <div className="mobile-item-card">
            <div className="mobile-item-total-row">
              <span className="mobile-item-total-label">라인</span>
              <span className="mobile-item-total-value">snapshot 라인이 없습니다.</span>
            </div>
          </div>
        ) : (
          audit.lines.map((line) => (
            <div key={line.id} className="mobile-item-card">
              <div className="mobile-item-card-header">
                <div className="mobile-item-name">{line.productName}</div>
                <span className="mobile-item-chip">
                  {line.actualQty === null ? '대기' : line.barcodeScanned ? '스캔' : '수동'}
                </span>
              </div>
              <div className="mobile-item-divider" />
              <div className="mobile-item-metrics">
                <div className="mobile-item-metric">
                  <span className="mobile-item-metric-label">장부</span>
                  <span className="mobile-item-metric-value">{line.expectedQty.toLocaleString()}</span>
                </div>
                <div className="mobile-item-metric">
                  <span className="mobile-item-metric-label">실사</span>
                  <span className="mobile-item-metric-value">
                    {line.actualQty === null ? '—' : line.actualQty.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="mobile-item-total-row">
                <span className="mobile-item-total-label">차이</span>
                <span className="mobile-item-total-value">
                  {line.actualQty === null ? '—' : `${line.diffQty > 0 ? '+' : ''}${line.diffQty.toLocaleString()}`}
                </span>
              </div>
              <div className="mobile-item-chips">
                <span className="mobile-item-chip">단가 {formatKrw(line.unitCost)}</span>
                <span className="mobile-item-chip">차이금액 {line.actualQty === null ? '—' : formatKrw(line.diffAmount)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 6,
  fontSize: 14,
  width: '100%',
}
