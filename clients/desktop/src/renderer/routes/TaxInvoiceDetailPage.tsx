/**
 * 세금계산서 상세 화면 — `/accounting/tax-invoices/:id` (P0-4 #3 / SP-09-1).
 *
 * <p>표시:
 * <ul>
 *   <li>헤더: taxInvoiceNo + 거래처 + 작성일 + 상태</li>
 *   <li>거래처 snapshot (사업자번호 / 주소)</li>
 *   <li>라인 표 (read-only) — 품명 / 규격 / 수량 / 단가 / 공급가액 / 부가세</li>
 *   <li>합계 박스 — 공급가액 / 부가세 / 총합</li>
 *   <li>자동 분개 link — journalId 가 있으면 새 탭으로 분개 상세 link</li>
 *   <li>전자세금계산서 발행 결과 — eTaxExternalId 표시 (SP-09-1).
 *       eTaxExternalId = 홈택스 접수번호 (비즈니스 식별자, 사용자 노출 가능).
 *       운영 응답 계약 확정 후 UUID-like raw ID 반환 여부 재검토 필요.
 *   </li>
 * </ul>
 *
 * <p>액션:
 * <ul>
 *   <li>DRAFT — "편집" → FormPage 로 이동</li>
 *   <li>DRAFT — "발행" → ISSUED 전이 (자동 분개 알림)</li>
 *   <li>ISSUED — "세금계산서 발행" → 국세청 전자세금계산서 발행 confirm 모달 → emit-nts 호출.
 *       운영 전환 시 제출 방식 선택 UI 추가 예정.
 *       ACCOUNTANT / MASTER 권한 + ISSUED 상태일 때만 활성 (SP-09-1).</li>
 *   <li>ISSUED — "취소" → CANCELLED 전이 (역분개 알림)</li>
 *   <li>ISSUED / CANCELLED — "인쇄" → window.open(`/accounting/tax-invoices/:id/print`) 새 창</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — id / partnerId / journalId 는 path param 전용 (사용자 미노출).
 * taxInvoiceNo / partnerName / eTaxExternalId (홈택스 접수번호) 만 화면 표시.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import styles from './TaxInvoiceDetailPage.module.css'
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
  DEFAULT_TAX_INVOICE_SUBMIT_METHOD,
  cancelTaxInvoice,
  emitTaxInvoiceToNts,
  getTaxInvoice,
  issueTaxInvoice,
  type TaxInvoiceLine,
  type TaxInvoiceStatus,
} from '../api/taxInvoiceApi'
import {
  extractApiErrorMessage as extractErrorMessage,
  getApiErrorInfo,
} from '../api/apiError'
import { taxInvoiceAuditApi } from '../api/createAuditApi'
import { TaxInvoiceRealtimeClient } from '../realtime/AccountingRealtimeClient'
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

function statusBadgeStyle(status: TaxInvoiceStatus) {
  switch (status) {
    case 'ISSUED':
      return { background: '#D1FAE5', color: '#065F46' }
    case 'CANCELLED':
      return { background: '#FEE2E2', color: '#991B1B' }
    case 'DRAFT':
    default:
      return { background: '#F3F4F6', color: '#4B5563' }
  }
}

function lineTotal(line: TaxInvoiceLine): number {
  return Number(line.supplyAmount) + Number(line.vatAmount)
}

export function TaxInvoiceDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const id = params['id']!
  const { canAccess } = usePermissions()
  const isMobile = useIsMobile()

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
  /** 세금계산서 발행 confirm modal 표시 여부 (SP-09-1). */
  const [showEmitNtsModal, setShowEmitNtsModal] = useState<boolean>(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [auditHistoryOpen, setAuditHistoryOpen] = useState(false)

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
    // fix H-02 계열 sweep: BE 한국어 message(마감 가드 등) 우선 노출, 불가 시 err.message 폴백.
    onError: (err: unknown) => setTopError(`발행 실패: ${extractErrorMessage(err)}`),
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
    // fix H-02 계열 sweep: autoReverse 마감 가드(409) 등 BE 한국어 message 우선 노출,
    // 불가 시 기존 err.message(axios 원문) 폴백 — emitNtsMutation과 동일 패턴.
    onError: (err: unknown) => {
      setShowCancelModal(false)
      setTopError(`취소 실패: ${extractErrorMessage(err)}`)
    },
  })

  /** SP-09-1: 국세청 전자세금계산서 발행 mutation. */
  const emitNtsMutation = useMutation({
    mutationFn: () => emitTaxInvoiceToNts(id, DEFAULT_TAX_INVOICE_SUBMIT_METHOD),
    onSuccess: (result) => {
      setShowEmitNtsModal(false)
      void queryClient.invalidateQueries({ queryKey: ['accounting', 'tax-invoices'] })
      // emit 결과의 eTaxExternalId 를 상세 캐시에 낙관적 반영(홈택스 접수번호 즉시 표시 — SP-09-1 T3).
      // detail invalidate refetch 는 임시 응답 식별자를 덮어써 값이 사라질 수 있으므로, 결과 기반으로 캐시를 갱신한다.
      // 캐시가 비어있는 경우(레이스)엔 undefined 반환=캐시 삭제 시맨틱을 피하기 위해 invalidate 로 refetch 한다(리뷰 P0).
      const cachedDetail = queryClient.getQueryData<typeof query.data>(['accounting', 'tax-invoice', id])
      if (cachedDetail) {
        queryClient.setQueryData(['accounting', 'tax-invoice', id], {
          ...cachedDetail,
          eTaxExternalId: result.eTaxExternalId ?? cachedDetail.eTaxExternalId,
        })
      } else {
        void queryClient.invalidateQueries({ queryKey: ['accounting', 'tax-invoice', id] })
      }
      void queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoice', id, 'audit-logs'],
      })
      alert(
        `전자세금계산서 국세청 발행 완료\n\n` +
        `발행 번호: ${result.taxInvoiceNo ?? '—'}\n` +
        `국세청 접수번호: ${result.eTaxExternalId ?? '—'}\n\n` +
        `실 발행은 관리자 설정 후 가능합니다.`,
      )
    },
    // fix H-02 계열 sweep: getApiErrorInfo 공통 헬퍼로 axios.isAxiosError + cast 중복 제거.
    // status 별 세분화 폴백 문구는 기존과 동일(무변경) — non-axios/응답없음 시 status/data 모두
    // undefined 이므로 아래 else 분기가 기존 "else { 세금계산서 발행에 실패했습니다. }" 와 동일하게 귀결.
    onError: (err: unknown) => {
      setShowEmitNtsModal(false)
      const { status, data } = getApiErrorInfo(err)
      if (status === 409) {
        setTopError(data?.message ?? '이미 국세청에 발행된 세금계산서입니다.')
      } else if (status === 422) {
        setTopError(data?.message ?? '발행 완료 상태의 세금계산서만 전송할 수 있습니다.')
      } else if (status === 502) {
        setTopError('국세청 서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.')
      } else {
        setTopError(data?.message ?? '세금계산서 발행에 실패했습니다.')
      }
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
  // DRAFT 수정 저장과 발행(issue)은 모두 TaxInvoiceController accounting.tax-invoice.list UPDATE 계약이다.
  const canUpdateTaxInvoice = canAccess('accounting.tax-invoice.list', 'update')
  const canCancelTaxInvoice = canAccess('accounting.tax-invoice.cancel', 'update')
  const canEmitTaxInvoiceNts = canAccess('accounting.tax-invoice.emit-nts', 'update')
  /**
   * SP-09-1: 세금계산서 발행 버튼 활성 조건.
   * - ISSUED 상태 + ACCOUNTANT / MASTER 권한 + 아직 eTaxExternalId 미등록 시.
   */
  const canEmitNts = isIssued && canEmitTaxInvoiceNts && !t.eTaxExternalId
  // PR-H4c: ISSUED/CANCELLED 단계는 본문 변경 차단 — banner 노출.
  const isLocked = t.status === 'ISSUED' || t.status === 'CANCELLED'
  const auditLogs = Array.isArray(auditQuery.data) ? auditQuery.data : []
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
    // 세금계산서 전용 인쇄 라우트를 새 창으로 열고 사용자가 window.print() 를 호출한다.
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

  const mobilePrimaryAction = isDraft && canUpdateTaxInvoice
    ? {
        label: issueMutation.isPending ? '발행 중...' : '발행',
        onClick: handleIssue,
        disabled: issueMutation.isPending,
      }
    : canEmitNts
      ? {
          label: emitNtsMutation.isPending ? '발행 중...' : '세금계산서 발행',
          onClick: () => setShowEmitNtsModal(true),
          disabled: emitNtsMutation.isPending,
        }
      : null

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

      {isMobile ? (
        <>
          <div className="mobile-summary-card" data-testid="tax-invoice-mobile-summary">
            <div className="mobile-summary-card-header">
              <span className="mobile-summary-doc-no">{t.taxInvoiceNo ?? '(미발행)'}</span>
              <span className="mobile-status-badge" style={statusBadgeStyle(t.status)}>
                {TAX_INVOICE_STATUS_LABEL[t.status]}
              </span>
            </div>
            <div className="mobile-summary-partner">{t.partnerName}</div>
            <div className="mobile-summary-divider" />
            <div className="mobile-summary-total-row">
              <span className="mobile-summary-total-amount">{fmt(t.totalAmount)}원</span>
              <span className="mobile-summary-date">공급일자 {t.supplyDate}</span>
            </div>
          </div>

          <div className="mobile-action-bar" role="toolbar" aria-label="세금계산서 액션">
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
            {(isIssued || t.status === 'CANCELLED') ? (
              <button
                type="button"
                className="mobile-action-icon"
                aria-label="인쇄"
                onClick={handlePrint}
              >
                인쇄
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
                  {isDraft && canUpdateTaxInvoice ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        navigate(`/accounting/tax-invoices/${t.id}/edit`)
                      }}
                    >
                      편집
                    </button>
                  ) : null}
                  {isIssued && canCancelTaxInvoice ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item danger"
                      disabled={cancelMutation.isPending}
                      onClick={() => {
                        setMobileMoreOpen(false)
                        handleCancelOpen()
                      }}
                    >
                      취소
                    </button>
                  ) : null}
                  {(isIssued || t.status === 'CANCELLED') ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        handlePrint()
                      }}
                    >
                      인쇄
                    </button>
                  ) : null}
            </MobileActionSheet>
          </div>

          <MobileCollapsible title="계산서 상세 정보" className="mobile-section-card">
            {[
              { label: '거래처', value: t.partnerName },
              { label: '사업자번호', value: t.partnerBusinessNo },
              { label: '주소', value: t.partnerAddress },
              { label: '비고', value: t.description },
              { label: '국세청 접수번호', value: t.eTaxExternalId },
            ].map(({ label, value }) => {
              const displayValue = value == null || value === '' ? '-' : String(value)
              return (
                <div key={label} className="mobile-field-row">
                  <span className="mobile-field-label">{label}</span>
                  <span className={`mobile-field-value${displayValue === '-' ? ' mobile-field-value-empty' : ''}`}>
                    {displayValue}
                  </span>
                </div>
              )
            })}
          </MobileCollapsible>
        </>
      ) : null}

      <Card>
        {!isMobile ? (
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
              {/* SP-09-1 D2: 전자세금계산서 발행 완료 전용 Badge — eTaxExternalId 등록 후 병렬 표시 */}
              {t.eTaxExternalId ? (
                <Badge variant="nts" data-testid="tax-invoice-detail-nts-emitted-badge">
                  세금계산서 발행 완료
                </Badge>
              ) : null}
              {/* PR-H4c: 수정 횟수 + 복원 dropdown (DRAFT 만 revert 활성) */}
              <AuditRevisionBadge
                logs={auditLogs}
                isError={auditQuery.isError}
                reverting={revertMutation.isPending}
                onRevert={isDraft ? (rev) => revertMutation.mutate(rev) : undefined}
                testIdPrefix="tax-invoice-detail"
              />
              <AuditVersionHistory
                logs={auditLogs}
                isLoading={auditQuery.isLoading}
                isError={auditQuery.isError}
                open={auditHistoryOpen}
                onOpenChange={setAuditHistoryOpen}
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

          <div className="detail-action-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isDraft && canUpdateTaxInvoice ? (
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
            {isDraft && canUpdateTaxInvoice ? (
              <Button
                variant="primary"
                onClick={handleIssue}
                disabled={issueMutation.isPending}
                data-testid="tax-invoice-detail-issue-button"
              >
                {issueMutation.isPending ? '발행 중...' : '발행'}
              </Button>
            ) : null}
            {/* SP-09-1: 세금계산서 발행 — ISSUED + ACCOUNTANT/MASTER + eTaxExternalId 미등록 시만. */}
            {canEmitNts ? (
              <Button
                variant="primary"
                onClick={() => setShowEmitNtsModal(true)}
                disabled={emitNtsMutation.isPending}
                data-testid="tax-invoice-detail-emit-nts-button"
                className={styles['btnNts']}
              >
                {emitNtsMutation.isPending ? '발행 중...' : '세금계산서 발행'}
              </Button>
            ) : null}
            {isIssued && canCancelTaxInvoice ? (
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
        ) : null}

        {/* SP-09-1: 세금계산서 발행 결과 — eTaxExternalId 등록 후 표시.
            D3: eTaxExternalId 값 monospace 처리.
            CANCELLED 시 미표시 — 취소된 세금계산서에 발행이 유효한 것으로 오해 방지(리뷰 P1). */}
        {t.eTaxExternalId && t.status !== 'CANCELLED' ? (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              background: 'var(--color-nts-bg)',
              border: '1px solid var(--color-nts-border)',
              borderRadius: 6,
              fontSize: 13,
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
            data-testid="tax-invoice-detail-etax-external-id"
          >
            <strong style={{ color: 'var(--color-nts-primary)' }}>전자세금계산서 국세청 발행</strong>
            <span style={{ color: 'var(--color-nts-text)' }}>
              국세청 접수번호:{' '}
              {/* D3: 코드형 식별자 monospace — 이카운트 번호 필드 표준 */}
              <span
                style={{
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: 'var(--font-size-sm)',
                  letterSpacing: '0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.eTaxExternalId}
              </span>
            </span>
          </div>
        ) : null}

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

        <div className="detail-mobile-hide">
          <DataTable
            columns={lineColumns}
            rows={t.lines}
            rowKey={(l) => l.lineId}
            emptyMessage="라인이 없습니다."
          />
        </div>

        <div className="mobile-item-list" data-testid="tax-invoice-mobile-lines">
          {t.lines.length === 0 ? (
            <div className="mobile-item-card">
              <div className="mobile-item-total-row">
                <span className="mobile-item-total-label">라인</span>
                <span className="mobile-item-total-value">라인이 없습니다.</span>
              </div>
            </div>
          ) : (
            t.lines.map((line) => (
              <div key={line.lineId} className="mobile-item-card">
                <div className="mobile-item-card-header">
                  <div className="mobile-item-name">{line.itemName}</div>
                </div>
                <div className="mobile-item-chips">
                  {line.specification ? <span className="mobile-item-chip">규격 {line.specification}</span> : null}
                  {line.unit ? <span className="mobile-item-chip">단위 {line.unit}</span> : null}
                </div>
                <div className="mobile-item-divider" />
                <div className="mobile-item-metrics">
                  <div className="mobile-item-metric">
                    <span className="mobile-item-metric-label">수량</span>
                    <span className="mobile-item-metric-value">{fmt(line.quantity)}</span>
                  </div>
                  <div className="mobile-item-metric">
                    <span className="mobile-item-metric-label">단가</span>
                    <span className="mobile-item-metric-value">{fmt(line.unitPrice)}</span>
                  </div>
                </div>
                <div className="mobile-item-chips">
                  <span className="mobile-item-chip">공급 {fmt(line.supplyAmount)}</span>
                  <span className="mobile-item-chip">부가세 {fmt(line.vatAmount)}</span>
                </div>
                <div className="mobile-item-total-row">
                  <span className="mobile-item-total-label">합계</span>
                  <span className="mobile-item-total-value">{lineTotal(line).toLocaleString('ko-KR')}원</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 합계 */}
        <div
          className="tax-invoice-totals"
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: '#F9FAFB',
            borderRadius: 6,
            fontSize: 14,
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
          data-testid="tax-invoice-detail-top-error"
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

      {/* SP-09-1: 세금계산서 발행 confirm Modal */}
      <Modal
        open={showEmitNtsModal}
        onClose={() => setShowEmitNtsModal(false)}
        title="세금계산서 발행"
        data-testid="tax-invoice-emit-nts-modal"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowEmitNtsModal(false)}
              disabled={emitNtsMutation.isPending}
            >
              닫기
            </Button>
            <Button
              variant="primary"
              onClick={() => emitNtsMutation.mutate()}
              disabled={emitNtsMutation.isPending}
              data-testid="tax-invoice-emit-nts-modal-confirm"
              style={{
                background: 'var(--color-nts-primary)',
                borderColor: 'var(--color-nts-primary)',
                color: '#FFFFFF',
              }}
            >
              {emitNtsMutation.isPending ? '발행 중...' : '발행 확인'}
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0, fontSize: 13, color: '#374151' }}>
          이 세금계산서를 국세청 전자세금계산서 시스템에 발행하시겠습니까?
        </p>
        {/* D4: 비가역성 강조 — danger 토큰. 이카운트 참조 "발행 후 수정/취소 불가" 패턴 */}
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--color-danger-50)',
            border: '1px solid var(--color-danger-200)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--color-danger-700)',
            lineHeight: 1.6,
          }}
          role="alert"
        >
          <strong>주의</strong>: 발행 후에는 홈택스에서 직접 취소해야 하며, 본 시스템에서는 되돌릴 수 없습니다.
        </div>
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--color-warning-50)',
            border: '1px solid var(--color-warning-200)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--color-warning-800)',
            lineHeight: 1.6,
          }}
        >
          <strong>발행번호:</strong> {t.taxInvoiceNo ?? '—'}<br />
          <strong>거래처:</strong> {t.partnerName}<br />
          <strong>공급일자:</strong> {t.supplyDate}<br />
          <strong>총합계:</strong> {fmt(t.totalAmount)} 원<br />
          <br />
          실 발행은 관리자 설정 후 가능합니다.<br />
          <span style={{ color: 'var(--color-nts-text)', fontWeight: 500 }}>
            운영 전환 후 국세청 전송이 활성화됩니다.
          </span>
        </div>
      </Modal>
    </>
  )
}
