/**
 * 세금계산서 상세 화면 — `/accounting/tax-invoices/:id` (P0-4 #3).
 *
 * <p>표시:
 * <ul>
 *   <li>헤더: taxInvoiceNo + 거래처 + 작성일 + 상태</li>
 *   <li>거래처 snapshot (사업자번호 / 주소)</li>
 *   <li>라인 표 (read-only) — 품명 / 규격 / 수량 / 단가 / 공급가액 / 부가세</li>
 *   <li>합계 박스 — 공급가액 / 부가세 / 총합</li>
 *   <li>자동 분개 link — journalId 가 있으면 새 탭으로 분개 상세 link</li>
 * </ul>
 *
 * <p>액션:
 * <ul>
 *   <li>DRAFT — "편집" → FormPage 로 이동</li>
 *   <li>DRAFT — "발행" → ISSUED 전이 (자동 분개 알림)</li>
 *   <li>ISSUED — "취소" → CANCELLED 전이 (역분개 알림)</li>
 *   <li>ISSUED / CANCELLED — "인쇄" → window.open(`/sales/:id/print/tax-invoice`) 새 창
 *       (Designer commit 5dcbbef 의 print view 재사용 — window.print() 자동)</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — id 표시 X, taxInvoiceNo / partnerName 만 노출.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  TAX_INVOICE_STATUS_LABEL,
  cancelTaxInvoice,
  canAccessTaxInvoice,
  getTaxInvoice,
  issueTaxInvoice,
  type TaxInvoiceLine,
  type TaxInvoiceStatus,
} from '../api/taxInvoiceApi'
import { taxInvoiceAuditApi } from '../api/createAuditApi'
import { TaxInvoiceRealtimeClient } from '../realtime/AccountingRealtimeClient'
import {
  AuditLockedBanner,
  AuditRevisionBadge,
  groupAuditLogsByField,
} from '../components/audit/AuditOverlaySection'
import { useSessionStore } from '../stores/session'
import { usePageTitle } from '../hooks/usePageTitle'

const STATUS_VARIANT: Record<TaxInvoiceStatus, 'neutral' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  ISSUED: 'success',
  CANCELLED: 'danger',
}

/** KRW string → 천단위 콤마. */
const fmt = (raw: string): string => {
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return raw
  return Math.trunc(n).toLocaleString('ko-KR')
}

export function TaxInvoiceDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const id = params['id']!
  const role = useSessionStore((s) => s.auth?.role)

  const query = useQuery({
    queryKey: ['accounting', 'tax-invoice', id],
    queryFn: () => getTaxInvoice(id),
  })

  // PR-H4c: audit log 백필 — BE 미구현 시 빈 배열 fallback (catch).
  const auditQuery = useQuery({
    queryKey: ['accounting', 'tax-invoice', id, 'audit-logs'],
    queryFn: () => taxInvoiceAuditApi.listAuditLogs(id).catch(() => []),
    enabled: !!id,
  })

  // PR-H4c: SSE 구독 — accounting:edit 수신 시 본문 + audit cache invalidate.
  useEffect(() => {
    if (!id) return
    const ctrl = TaxInvoiceRealtimeClient.subscribe(id, (evt) => {
      void queryClient.invalidateQueries({ queryKey: ['accounting', 'tax-invoice', id] })
      if (evt.event === 'accounting:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({
          queryKey: ['accounting', 'tax-invoice', id, 'audit-logs'],
        })
      }
    })
    return () => ctrl.abort()
  }, [id, queryClient])

  // PR-H4c: revert mutation — ISSUED/CANCELLED 등 잠금 단계에서는 BE 가 거부.
  const revertMutation = useMutation({
    mutationFn: (revisionNo: number) =>
      taxInvoiceAuditApi.revertToRevision(id, revisionNo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounting', 'tax-invoice', id] })
      void queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoice', id, 'audit-logs'],
      })
    },
    onError: () => alert('복원에 실패했습니다.'),
  })

  usePageTitle('세금계산서 상세', query.data?.taxInvoiceNo ?? undefined)

  const [topError, setTopError] = useState<string>('')
  /** 취소 사유 dialog 표시 여부. */
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false)
  const [cancelReason, setCancelReason] = useState<string>('')
  const cancelReasonRef = useRef<HTMLTextAreaElement>(null)

  const issueMutation = useMutation({
    mutationFn: () => issueTaxInvoice(id),
    onSuccess: (issued) => {
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoices'],
      })
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoice', id],
      })
      alert(
        `발행 완료: ${issued.taxInvoiceNo}\n\n자동 분개가 생성되었습니다.\n분개장 메뉴에서 확인할 수 있습니다.`,
      )
    },
    onError: (err: Error) => setTopError(`발행 실패: ${err.message}`),
  })

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelTaxInvoice(id, { reason }),
    onSuccess: () => {
      setShowCancelModal(false)
      setCancelReason('')
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoices'],
      })
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoice', id],
      })
      alert('취소 완료\n\n자동 역분개가 생성되었습니다.')
    },
    onError: (err: Error) => {
      setShowCancelModal(false)
      setTopError(`취소 실패: ${err.message}`)
    },
  })

  if (query.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="세금계산서 불러오는 중" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="error-banner" role="alert">
        세금계산서 상세를 불러오지 못했습니다.
      </div>
    )
  }

  const t = query.data
  const isDraft = t.status === 'DRAFT'
  const isIssued = t.status === 'ISSUED'
  const canMutate = canAccessTaxInvoice(role)
  // PR-H4c: ISSUED/CANCELLED 단계는 본문 변경 차단 — banner 노출.
  const isLocked = t.status === 'ISSUED' || t.status === 'CANCELLED'
  const auditLogs = auditQuery.data ?? []
  const auditByField = groupAuditLogsByField(auditLogs)

  const handleIssue = () => {
    setTopError('')
    if (
      !confirm(
        '이 세금계산서를 발행하시겠습니까?\n발행 시 자동 분개 (110/255/400) 가 생성되고 더 이상 수정할 수 없습니다.',
      )
    )
      return
    issueMutation.mutate()
  }

  const handleCancelOpen = () => {
    setTopError('')
    setCancelReason('')
    setShowCancelModal(true)
    // 모달 열리면 textarea 포커스 (접근성)
    setTimeout(() => cancelReasonRef.current?.focus(), 50)
  }

  const handleCancelSubmit = () => {
    const trimmed = cancelReason.trim()
    if (trimmed.length < 5) {
      alert('취소 사유는 5자 이상 입력해야 합니다.')
      return
    }
    cancelMutation.mutate(trimmed)
  }

  const handlePrint = () => {
    // Designer commit 5dcbbef — TaxInvoiceView 는 `/sales/:id/print/tax-invoice` path 에 mount.
    // 본 mock 시점에 아직 해당 print view 가 slip-id 기반이라 견적 id 와 다름.
    // 후속 iteration 에서 `/accounting/tax-invoices/:id/print` 신규 라우트 추가 예정.
    // 현재는 새 창에서 print view 를 열고 사용자가 window.print() 호출.
    const url = `${window.location.origin}/#/accounting/tax-invoices/${id}/print`
    window.open(url, '_blank', 'width=900,height=1200')
  }

  const lineColumns: DataTableColumn<TaxInvoiceLine>[] = [
    {
      key: 'lineNo',
      header: '#',
      width: '40px',
      align: 'center',
      render: (l) => l.lineNo + 1,
    },
    {
      key: 'itemName',
      header: '품명',
    },
    {
      key: 'specification',
      header: '규격',
      width: '120px',
      render: (l) => l.specification ?? '—',
    },
    {
      key: 'unit',
      header: '단위',
      width: '60px',
      align: 'center',
      render: (l) => l.unit ?? '—',
    },
    {
      key: 'quantity',
      header: '수량',
      width: '100px',
      align: 'right',
      render: (l) => fmt(l.quantity),
    },
    {
      key: 'unitPrice',
      header: '단가',
      width: '120px',
      align: 'right',
      render: (l) => fmt(l.unitPrice),
    },
    {
      key: 'supplyAmount',
      header: '공급가액',
      width: '140px',
      align: 'right',
      render: (l) => fmt(l.supplyAmount),
    },
    {
      key: 'vatAmount',
      header: '부가세',
      width: '120px',
      align: 'right',
      render: (l) => fmt(l.vatAmount),
    },
  ]

  return (
    <>
      {/* PR-H4c: 잠금 단계 안내 banner — ISSUED/CANCELLED */}
      {isLocked ? (
        <AuditLockedBanner
          statusLabel={TAX_INVOICE_STATUS_LABEL[t.status]}
          testId="tax-invoice-detail-locked-banner"
          message="발행/취소 후에는 본문 수정이 불가합니다."
        />
      ) : null}

      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3
                style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}
                data-testid="tax-invoice-detail-no"
              >
                {t.taxInvoiceNo ?? '(미발행)'}
              </h3>
              <Badge variant={STATUS_VARIANT[t.status]}>
                {TAX_INVOICE_STATUS_LABEL[t.status]}
              </Badge>
              {/* PR-H4c: 수정 횟수 + 복원 dropdown (DRAFT 만 revert 활성) */}
              <AuditRevisionBadge
                logs={auditLogs}
                isError={auditQuery.isError}
                reverting={revertMutation.isPending}
                onRevert={isDraft ? (rev) => revertMutation.mutate(rev) : undefined}
                testIdPrefix="tax-invoice-detail"
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: '#6B7280' }}>
              공급일자: {t.supplyDate}
              {t.issuedAt
                ? ` · 발행: ${new Date(t.issuedAt).toLocaleString('ko-KR')}`
                : ''}
              {t.issuedBy ? ` (${t.issuedBy})` : ''}
              {t.cancelledAt
                ? ` · 취소: ${new Date(t.cancelledAt).toLocaleString('ko-KR')}`
                : ''}
            </div>
            {t.status === 'CANCELLED' && t.cancelReason ? (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 6,
                  fontSize: 13,
                  color: '#991B1B',
                }}
                data-testid="tax-invoice-detail-cancel-reason"
              >
                <strong>취소 사유</strong>: {t.cancelReason}
              </div>
            ) : null}
            <div style={{ marginTop: 12, fontSize: 14 }}>
              <div>
                <strong>거래처</strong>: {t.partnerName}
                {t.partnerBusinessNo ? (
                  <span
                    style={{
                      marginLeft: 8,
                      color: '#6B7280',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ({t.partnerBusinessNo})
                  </span>
                ) : null}
              </div>
              {t.partnerAddress ? (
                <div style={{ marginTop: 4, color: '#374151' }}>
                  <strong>주소</strong>: {t.partnerAddress}
                </div>
              ) : null}
              {/* PR-H4c: 비고 audit overlay — 수정 가능 필드 */}
              <div
                style={{ marginTop: 4, color: '#374151' }}
                data-testid="tax-invoice-detail-audit-overlay-description"
              >
                <strong>비고</strong>:{' '}
                <AuditOverlay
                  field="description"
                  currentValue={t.description}
                  history={auditByField['description'] ?? []}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isDraft && canMutate ? (
              <Button
                variant="ghost"
                onClick={() =>
                  navigate(`/accounting/tax-invoices/${t.id}/edit`)
                }
                data-testid="tax-invoice-detail-edit-button"
              >
                편집
              </Button>
            ) : null}
            {isDraft && canMutate ? (
              <Button
                variant="primary"
                onClick={handleIssue}
                disabled={issueMutation.isPending}
                data-testid="tax-invoice-detail-issue-button"
              >
                {issueMutation.isPending ? '발행 중...' : '발행'}
              </Button>
            ) : null}
            {isIssued && canMutate ? (
              <Button
                variant="ghost"
                onClick={handleCancelOpen}
                disabled={cancelMutation.isPending}
                data-testid="tax-invoice-detail-cancel-button"
              >
                취소
              </Button>
            ) : null}
            {(isIssued || t.status === 'CANCELLED') ? (
              <Button
                variant="ghost"
                onClick={handlePrint}
                data-testid="tax-invoice-detail-print-button"
              >
                인쇄
              </Button>
            ) : null}
          </div>
        </div>

        {/* 자동 분개 link */}
        {t.journalId || t.reverseJournalId ? (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 6,
              fontSize: 13,
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <strong style={{ color: '#1E40AF' }}>자동 분개</strong>
            {t.journalId ? (
              <a
                href={`${window.location.origin}/#/accounting/journals/${t.journalId}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#1D4ED8', textDecoration: 'underline' }}
                data-testid="tax-invoice-detail-journal-link"
              >
                매출 분개 보기 →
              </a>
            ) : null}
            {t.reverseJournalId ? (
              <a
                href={`${window.location.origin}/#/accounting/journals/${t.reverseJournalId}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#B91C1C', textDecoration: 'underline' }}
                data-testid="tax-invoice-detail-reverse-journal-link"
              >
                역분개 보기 →
              </a>
            ) : null}
          </div>
        ) : null}

        <DataTable
          columns={lineColumns}
          rows={t.lines}
          rowKey={(l) => l.lineId}
          emptyMessage="라인이 없습니다."
        />

        {/* 합계 */}
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: '#F9FAFB',
            borderRadius: 6,
            display: 'grid',
            gridTemplateColumns: '1fr 160px 160px 200px',
            gap: 16,
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
          }}
          data-testid="tax-invoice-detail-totals"
        >
          <div style={{ fontWeight: 600 }}>합계</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>공급가액</div>
            <strong>{fmt(t.supplyAmount)}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>부가세</div>
            <strong>{fmt(t.vatAmount)}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>총합</div>
            <strong style={{ fontSize: 18 }}>{fmt(t.totalAmount)}</strong>
          </div>
        </div>
      </Card>

      {topError ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginTop: 16, padding: 12, color: '#DC2626' }}
        >
          {topError}
        </div>
      ) : null}

      {/* 취소 사유 입력 Modal */}
      <Modal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="세금계산서 취소"
        data-testid="tax-invoice-cancel-modal"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowCancelModal(false)}
              disabled={cancelMutation.isPending}
            >
              닫기
            </Button>
            <Button
              variant="primary"
              onClick={handleCancelSubmit}
              disabled={cancelMutation.isPending || cancelReason.trim().length < 5}
              data-testid="tax-invoice-cancel-modal-submit"
            >
              {cancelMutation.isPending ? '취소 처리 중...' : '취소 확인'}
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0, fontSize: 13, color: '#374151' }}>
          이 세금계산서를 취소하면 자동 역분개가 생성됩니다. 원본 분개는 보존됩니다.
        </p>
        <label
          htmlFor="tax-invoice-cancel-reason"
          style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
        >
          취소 사유 <span style={{ color: '#DC2626' }}>*</span>
        </label>
        <textarea
          id="tax-invoice-cancel-reason"
          ref={cancelReasonRef}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="취소 사유를 입력하세요 (5자 이상 필수)"
          rows={4}
          maxLength={1000}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid #D1D5DB',
            borderRadius: 6,
            fontSize: 13,
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          data-testid="tax-invoice-cancel-reason-input"
        />
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: cancelReason.trim().length > 0 && cancelReason.trim().length < 5
              ? '#DC2626'
              : '#6B7280',
            textAlign: 'right',
          }}
        >
          {cancelReason.trim().length > 0 && cancelReason.trim().length < 5
            ? `최소 5자 이상 입력 — 현재 ${cancelReason.trim().length}자`
            : `${cancelReason.length} / 1000`}
        </div>
      </Modal>
    </>
  )
}
