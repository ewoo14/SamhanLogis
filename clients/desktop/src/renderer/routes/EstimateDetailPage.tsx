/**
 * 견적서 상세 화면 — `/sales/estimates/:id` (P2-1 #7).
 *
 * <p>표시:
 * <ul>
 *   <li>헤더: estimateNo + 거래처 + 작성일 + 유효기간 + 상태</li>
 *   <li>거래처 snapshot</li>
 *   <li>라인 표 (read-only) — 모델명 / 품목명 / 규격 / 수량 / 단가 / 공급가액 / 부가세 / 소계</li>
 *   <li>합계 박스 — 공급가액 / 부가세 / 총합</li>
 *   <li>변환 전표 link — convertedSlipId 가 있으면 `/sales/:slipId` 로 link</li>
 * </ul>
 *
 * <p>액션:
 * <ul>
 *   <li>QUOTE_DRAFT — 편집 / 발송</li>
 *   <li>QUOTE_SENT  — 편집 / 수락 / 거절</li>
 *   <li>QUOTE_ACCEPTED — 전표 변환 (Slip OUTBOUND DRAFT 자동 발행)</li>
 *   <li>모든 상태 — 인쇄 (`/sales/estimates/:estimateNumber/print` 새 창)</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — id 표시 X. estimateNo / partnerName / modelName 만 노출.
 * 매뉴얼 출처: {@code docs/manual/01-영업/06-견적서.md}.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AuditOverlay,
  Badge,
  Button,
  Card,
  DataTable,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  ESTIMATE_STATUS_LABEL,
  acceptEstimate,
  convertEstimate,
  getEstimate,
  rejectEstimate,
  sendEstimate,
  type EstimateLine,
  type EstimateStatus,
} from '../api/estimateApi'
import { estimateAuditApi } from '../api/createAuditApi'
import { EstimateRealtimeClient } from '../realtime/EstimateRealtimeClient'
import { EstimateVersionHistoryPanel } from '../components/audit/EstimateVersionHistoryPanel'
import {
  AuditLockedBanner,
  AuditRevisionBadge,
  groupAuditLogsByField,
} from '../components/audit/AuditOverlaySection'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

const STATUS_VARIANT: Record<EstimateStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  QUOTE_DRAFT: 'neutral',
  QUOTE_SENT: 'brand',
  QUOTE_ACCEPTED: 'success',
  QUOTE_REJECTED: 'danger',
  QUOTE_CONVERTED: 'warning',
}

const fmt = (raw: string | number): string => {
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  if (!Number.isFinite(n)) return String(raw)
  return Math.trunc(n).toLocaleString('ko-KR')
}

export function EstimateDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const id = params['id']!
  const { canAccess } = usePermissions()

  const query = useQuery({
    queryKey: ['estimate', id],
    queryFn: () => getEstimate(id),
  })

  // PR-H4c: audit log 백필 — BE 미구현 시 빈 배열 fallback.
  const auditQuery = useQuery({
    queryKey: ['estimate', id, 'audit-logs'],
    queryFn: () => estimateAuditApi.listAuditLogs(id).catch(() => []),
    enabled: !!id,
  })

  // PR-H4c: SSE 구독 — estimate:edit 수신 시 본문 + audit cache invalidate.
  useEffect(() => {
    if (!id) return
    const ctrl = EstimateRealtimeClient.subscribe(id, (evt) => {
      void queryClient.invalidateQueries({ queryKey: ['estimate', id] })
      if (evt.event === 'estimate:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({ queryKey: ['estimate', id, 'audit-logs'] })
      }
    })
    return () => ctrl.abort()
  }, [id, queryClient])

  // PR-H4c: revert mutation.
  const revertMutation = useMutation({
    mutationFn: (revisionNo: number) =>
      estimateAuditApi.revertToRevision(id, revisionNo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['estimate', id] })
      void queryClient.invalidateQueries({ queryKey: ['estimate', id, 'audit-logs'] })
    },
    onError: () => alert('복원에 실패했습니다.'),
  })

  usePageTitle('견적서 상세', query.data?.estimateNo)

  const [topError, setTopError] = useState<string>('')

  const sendMutation = useMutation({
    mutationFn: () => sendEstimate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', id] })
      alert('발송 완료')
    },
    onError: (err: Error) => setTopError(`발송 실패: ${err.message}`),
  })
  const acceptMutation = useMutation({
    mutationFn: () => acceptEstimate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', id] })
      alert('수락 처리 완료\n\n이제 전표로 변환할 수 있습니다.')
    },
    onError: (err: Error) => setTopError(`수락 실패: ${err.message}`),
  })
  const rejectMutation = useMutation({
    mutationFn: () => rejectEstimate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', id] })
      alert('거절 처리 완료')
    },
    onError: (err: Error) => setTopError(`거절 실패: ${err.message}`),
  })
  const convertMutation = useMutation({
    mutationFn: () => convertEstimate(id),
    onSuccess: (converted) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', id] })
      if (converted.convertedSlipId) {
        if (
          confirm(
            '전표 변환 완료!\n\n신규 출고전표 (DRAFT) 가 생성되었습니다. 전표 상세로 이동할까요?',
          )
        ) {
          navigate(`/sales/${converted.convertedSlipId}`)
        }
      } else {
        alert('전표 변환 완료')
      }
    },
    onError: (err: Error) => setTopError(`변환 실패: ${err.message}`),
  })

  if (query.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="견적서 불러오는 중" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="error-banner" role="alert">
        견적서 상세를 불러오지 못했습니다.
      </div>
    )
  }

  const e = query.data
  const isDraft = e.status === 'QUOTE_DRAFT'
  const isSent = e.status === 'QUOTE_SENT'
  const isAccepted = e.status === 'QUOTE_ACCEPTED'
  const canMutate = canAccess('estimates.list', 'update')
  // PR-H4c: 변환/거절 단계 본문 잠금
  const isLocked = e.status === 'QUOTE_CONVERTED' || e.status === 'QUOTE_REJECTED'
  const auditLogs = Array.isArray(auditQuery.data) ? auditQuery.data : []
  const auditByField = groupAuditLogsByField(auditLogs)

  const handleSend = () => {
    setTopError('')
    if (!confirm('이 견적서를 발송하시겠습니까?')) return
    sendMutation.mutate()
  }
  const handleAccept = () => {
    setTopError('')
    if (!confirm('거래처가 이 견적을 수락한 것으로 처리하시겠습니까?')) return
    acceptMutation.mutate()
  }
  const handleReject = () => {
    setTopError('')
    if (!confirm('이 견적을 거절 처리하시겠습니까?')) return
    rejectMutation.mutate()
  }
  const handleConvert = () => {
    setTopError('')
    if (
      !confirm(
        '이 견적을 전표 (출고전표 DRAFT) 로 변환하시겠습니까?\n변환 후 견적은 CONVERTED 상태로 잠깁니다.',
      )
    )
      return
    convertMutation.mutate()
  }
  const handlePrint = () => {
    // Designer commit 5dcbbef 의 QuoteView (`/sales/estimates/:estimateNumber/print`).
    // Print view 는 estimateNumber path param 사용 (legacy `getEstimate` API). 본 mock
    // 에서는 동일 estimateNo 를 path 로 전달 — 후속 iteration 에서 print view 가
    // 신규 estimate-service API 로 마이그레이션 시 path 변경.
    const url = `${window.location.origin}/#/sales/estimates/${encodeURIComponent(
      e.estimateNo,
    )}/print`
    window.open(url, '_blank', 'width=900,height=1200')
  }

  const lineColumns: DataTableColumn<EstimateLine>[] = [
    {
      key: 'lineNo',
      header: '#',
      width: '40px',
      align: 'center',
      render: (l) => l.lineNo + 1,
    },
    {
      key: 'modelName',
      header: '모델명',
      width: '160px',
      render: (l) => l.modelName ?? '—',
    },
    {
      key: 'productName',
      header: '품목명',
      render: (l) => l.productName ?? '—',
    },
    {
      key: 'specification',
      header: '규격',
      width: '100px',
      render: (l) => l.specification ?? '—',
    },
    {
      key: 'quantity',
      header: '수량',
      width: '80px',
      align: 'right',
      render: (l) => fmt(l.quantity),
    },
    {
      key: 'unitPrice',
      header: '단가(VAT포함)',
      width: '120px',
      align: 'right',
      // 단가 부가세포함 전환: unitPriceWithVat 있으면 VAT 포함 단가 표시(legacy 는 unitPrice).
      render: (l) => fmt(l.unitPriceWithVat ?? l.unitPrice),
    },
    {
      key: 'supplyAmount',
      header: '공급가액',
      width: '130px',
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
    {
      key: 'lineTotal',
      header: '소계',
      width: '130px',
      align: 'right',
      render: (l) => (
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmt(l.lineTotal)}
        </strong>
      ),
    },
  ]

  return (
    <>
      {/* PR-H4c: 잠금 단계 안내 banner — CONVERTED/REJECTED */}
      {isLocked ? (
        <AuditLockedBanner
          statusLabel={ESTIMATE_STATUS_LABEL[e.status]}
          testId="estimate-detail-locked-banner"
          message="변환/거절 후에는 본문 수정이 불가합니다."
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
                data-testid="estimate-detail-no"
              >
                {e.estimateNo}
              </h3>
              <Badge variant={STATUS_VARIANT[e.status]}>
                {ESTIMATE_STATUS_LABEL[e.status]}
              </Badge>
              {/* PR-H4c: 수정 횟수 + 복원 dropdown (DRAFT/SENT 만 revert 활성) */}
              <AuditRevisionBadge
                logs={auditLogs}
                isError={auditQuery.isError}
                reverting={revertMutation.isPending}
                onRevert={
                  isDraft || isSent ? (rev) => revertMutation.mutate(rev) : undefined
                }
                testIdPrefix="estimate-detail"
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: '#6B7280' }}>
              작성일: {e.estimateDate}
              {e.validUntil ? ` · 유효기간: ${e.validUntil}` : ''}
              {e.sentAt
                ? ` · 발송: ${new Date(e.sentAt).toLocaleString('ko-KR')}`
                : ''}
              {e.acceptedAt
                ? ` · 수락: ${new Date(e.acceptedAt).toLocaleString('ko-KR')}`
                : ''}
              {e.rejectedAt
                ? ` · 거절: ${new Date(e.rejectedAt).toLocaleString('ko-KR')}`
                : ''}
              {e.convertedAt
                ? ` · 변환: ${new Date(e.convertedAt).toLocaleString('ko-KR')}`
                : ''}
            </div>
            <div style={{ marginTop: 12, fontSize: 14 }}>
              <div>
                <strong>거래처</strong>: {e.partnerName}
                {e.partnerBusinessNo ? (
                  <span
                    style={{
                      marginLeft: 8,
                      color: '#6B7280',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ({e.partnerBusinessNo})
                  </span>
                ) : null}
              </div>
              {e.partnerAddress ? (
                <div style={{ marginTop: 4, color: 'var(--ink-primary)' }}>
                  <strong>주소</strong>: {e.partnerAddress}
                </div>
              ) : null}
              {/* PR-H4c: 비고 audit overlay — 수정 가능 필드 */}
              <div
                style={{ marginTop: 4, color: 'var(--ink-primary)' }}
                data-testid="estimate-detail-audit-overlay-memo"
              >
                <strong>비고</strong>:{' '}
                <AuditOverlay
                  field="memo"
                  currentValue={e.memo}
                  history={auditByField['memo'] ?? []}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(isDraft || isSent) && canMutate ? (
              <Button
                variant="ghost"
                onClick={() => navigate(`/sales/estimates/${e.id}/edit`)}
                data-testid="estimate-detail-edit-button"
              >
                편집
              </Button>
            ) : null}
            {isDraft && canMutate ? (
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={sendMutation.isPending}
                data-testid="estimate-detail-send-button"
              >
                {sendMutation.isPending ? '발송 중...' : '발송'}
              </Button>
            ) : null}
            {isSent && canMutate ? (
              <>
                <Button
                  variant="primary"
                  onClick={handleAccept}
                  disabled={acceptMutation.isPending}
                  data-testid="estimate-detail-accept-button"
                >
                  {acceptMutation.isPending ? '처리 중...' : '수락'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleReject}
                  disabled={rejectMutation.isPending}
                  data-testid="estimate-detail-reject-button"
                >
                  {rejectMutation.isPending ? '처리 중...' : '거절'}
                </Button>
              </>
            ) : null}
            {isAccepted && canMutate ? (
              <Button
                variant="primary"
                onClick={handleConvert}
                disabled={convertMutation.isPending}
                data-testid="estimate-detail-convert-button"
              >
                {convertMutation.isPending ? '변환 중...' : '전표 변환'}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={handlePrint}
              data-testid="estimate-detail-print-button"
            >
              인쇄
            </Button>
          </div>
        </div>

        {/* 변환 전표 link */}
        {e.convertedSlipId ? (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              background: 'var(--state-warning-bg)',
              border: '1px solid #FDE68A',
              borderRadius: 6,
              fontSize: 13,
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <strong style={{ color: 'var(--state-warning)' }}>전표 변환 완료</strong>
            <a
              href={`${window.location.origin}/#/sales/${e.convertedSlipId}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#B45309', textDecoration: 'underline' }}
              data-testid="estimate-detail-converted-slip-link"
            >
              변환 전표 보기 →
            </a>
          </div>
        ) : null}

        <DataTable
          columns={lineColumns}
          rows={e.lines}
          rowKey={(l) => l.id}
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
          data-testid="estimate-detail-totals"
        >
          <div style={{ fontWeight: 600 }}>합계</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>공급가액</div>
            <strong>{fmt(e.totalSupply)}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>부가세</div>
            <strong>{fmt(e.totalVat)}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>총합</div>
            <strong style={{ fontSize: 18 }}>{fmt(e.totalAmount)}</strong>
          </div>
        </div>
      </Card>

      {/* Phase 2.2 Task 6: 버전이력 패널 + 복원 (편집 불가 상태면 복원 버튼 비활성) */}
      <EstimateVersionHistoryPanel estimateId={id} status={e.status} />

      {topError ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginTop: 16, padding: 12, color: 'var(--state-danger)' }}
        >
          {topError}
        </div>
      ) : null}
    </>
  )
}
