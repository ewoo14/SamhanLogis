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
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  AsyncAutocomplete,
  safeActorName,
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
  changeEstimateOwner,
  type EstimateLine,
  type EstimateStatus,
} from '../api/estimateApi'
import { searchApprovalLineUsers, type ApprovalLineUserOption } from '../api/approvalLineConfigApi'
import { extractApiErrorResponseMessage } from '../api/apiError'
import { EstimateCollaborationPanel } from '../components/collab/EstimateCollaborationPanel'
import { MobileActionSheet } from '../components/common/MobileActionSheet'
import { MobileCollapsible } from '../components/common/MobileCollapsible'
import { AuditLockedBanner } from '../components/audit/AuditOverlaySection'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { useIsMobile } from '../hooks/useIsMobile'

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

function DetailGridField({
  label,
  value,
  children,
  testId,
}: {
  label: string
  value: unknown
  children: ReactNode
  testId?: string
}) {
  const isEmpty = value === null || value === undefined || value === ''
  return (
    <div
      className={isEmpty ? 'detail-grid-item-empty' : undefined}
      data-testid={testId}
    >
      <span className="detail-label">{label}</span>
      <span className="detail-value">{children}</span>
    </div>
  )
}

export function EstimateDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const id = params['id']!
  const { canAccess } = usePermissions()
  const isMobile = useIsMobile()

  const query = useQuery({
    queryKey: ['estimate', id],
    queryFn: () => getEstimate(id),
  })

  const ownerDirectoryQuery = useQuery({
    queryKey: ['estimate-owner-directory'],
    queryFn: () => searchApprovalLineUsers('', 100),
    enabled: Boolean(query.data?.requesterId),
    staleTime: 5 * 60 * 1000,
  })

  usePageTitle('견적서 상세', query.data?.estimateNo)

  const [topError, setTopError] = useState<string>('')
  const [collabEditMode, setCollabEditMode] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

  const ownerMutation = useMutation({
    mutationFn: (owner: ApprovalLineUserOption) =>
      changeEstimateOwner(id, { requesterId: owner.id, documentType: 'ESTIMATE' }),
    onSuccess: async () => {
      setTopError('')
      await queryClient.invalidateQueries({ queryKey: ['estimate', id] })
      await queryClient.invalidateQueries({ queryKey: ['estimates'] })
    },
    onError: (error) => {
      setTopError(
        extractApiErrorResponseMessage(error)
          ?? '담당 변경에 실패했습니다. 견적서 계열만 담당을 변경할 수 있습니다.',
      )
    },
  })

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
            '전표 변환 완료!\n\n신규 판매전표가 임시저장 상태로 생성되었습니다. 전표 상세로 이동할까요?',
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
  const canMutate = canAccess('estimates.list', 'update')
  // PR-H4c: 변환/거절 단계 본문 잠금
  const isLocked = e.status === 'QUOTE_CONVERTED' || e.status === 'QUOTE_REJECTED'
  const currentOwner = e.requesterId
    ? ownerDirectoryQuery.data?.find((user) => user.id === e.requesterId) ??
      (e.requesterName ? { id: e.requesterId, displayName: safeActorName(e.requesterName) ?? '변경자 미상' } : null)
    : null

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
        '이 견적을 판매전표로 변환하시겠습니까?\n변환 후 견적은 전환완료 상태로 잠깁니다.',
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

  const handleCollabCommitted = () => {
    void queryClient.invalidateQueries({ queryKey: ['estimate', id] })
    void queryClient.invalidateQueries({ queryKey: ['estimates'] })
    void queryClient.invalidateQueries({ queryKey: ['estimateRevisions', id] })
  }

  const mobilePrimaryAction = isDraft && canMutate
    ? {
        label: sendMutation.isPending ? '발송 중...' : '발송',
        onClick: handleSend,
        disabled: sendMutation.isPending,
      }
    : (isSent || e.status === 'QUOTE_ACCEPTED') && !isLocked && canMutate
      ? {
          label: convertMutation.isPending ? '변환 중...' : '전표 변환',
          onClick: handleConvert,
          disabled: convertMutation.isPending,
        }
      : null

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
      align: 'center',
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

      {topError ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginBottom: 16, padding: 12, color: 'var(--state-danger)' }}
        >
          {topError}
        </div>
      ) : null}

      {isMobile ? (
        <>
          <div className="mobile-summary-card" data-testid="estimate-detail-mobile-summary">
            <div className="mobile-summary-card-header">
              <span className="mobile-summary-doc-no">{e.estimateNo}</span>
              <Badge
                className="mobile-status-badge"
                variant={STATUS_VARIANT[e.status]}
              >
                {ESTIMATE_STATUS_LABEL[e.status]}
              </Badge>
            </div>
            <div className="mobile-summary-partner">{e.partnerName}</div>
            <div className="mobile-summary-divider" />
            <div className="mobile-summary-total-row">
              <span className="mobile-summary-total-amount">
                {fmt(e.totalAmount)}원
              </span>
              <span className="mobile-summary-date">
                작성일 {e.estimateDate}
              </span>
            </div>
          </div>

          <div className="mobile-action-bar" role="toolbar" aria-label="견적서 액션">
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
              aria-label="인쇄"
              onClick={handlePrint}
            >
              인쇄
            </button>
            <button
              type="button"
              className="mobile-action-icon"
              aria-label="더보기"
              onClick={() => setMobileMoreOpen(true)}
            >
              ···
            </button>
            <MobileActionSheet open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)}>
                  {(isDraft || isSent) && canMutate ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        navigate(`/sales/estimates/${e.id}/edit`)
                      }}
                    >
                      편집
                    </button>
                  ) : null}
                  {e.status === 'QUOTE_ACCEPTED' && canMutate && !isLocked ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        setCollabEditMode(true)
                      }}
                    >
                      수정
                    </button>
                  ) : null}
                  {isSent && canMutate ? (
                    <>
                      <button
                        type="button"
                        className="mobile-more-sheet-item"
                        disabled={acceptMutation.isPending}
                        onClick={() => {
                          setMobileMoreOpen(false)
                          handleAccept()
                        }}
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        className="mobile-more-sheet-item danger"
                        disabled={rejectMutation.isPending}
                        onClick={() => {
                          setMobileMoreOpen(false)
                          handleReject()
                        }}
                      >
                        거절
                      </button>
                    </>
                  ) : null}
                  {!isLocked && canMutate && mobilePrimaryAction?.label !== '전표 변환' ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      disabled={convertMutation.isPending}
                      onClick={() => {
                        setMobileMoreOpen(false)
                        handleConvert()
                      }}
                    >
                      전표 변환
                    </button>
                  ) : null}
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
            </MobileActionSheet>
          </div>

          <MobileCollapsible title="견적 상세 정보" className="mobile-section-card">
            {[
              { label: '작성일', value: e.estimateDate },
              { label: '유효기간', value: e.validUntil },
              { label: '사업자번호', value: e.partnerBusinessNo },
              { label: '주소', value: e.partnerAddress },
              { label: '비고', value: e.memo },
            ].map(({ label, value }) => {
              const displayValue = value == null || value === '' ? '-' : String(value)
              return (
                <div key={label} className="mobile-field-row">
                  <span className="mobile-field-label">{label}</span>
                  <span
                    className={`mobile-field-value${displayValue === '-' ? ' mobile-field-value-empty' : ''}`}
                  >
                    {displayValue}
                  </span>
                </div>
              )
            })}
          </MobileCollapsible>
        </>
      ) : null}

      <Card padding={4} shadow="sm">
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
          <div style={{ flex: '1 1 520px', minWidth: 0 }}>
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
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-secondary)' }}>
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
            <div className="detail-grid" style={{ marginTop: 16 }}>
              <DetailGridField label="거래처" value={e.partnerName}>
                {e.partnerName}
                {e.partnerBusinessNo ? ` (${e.partnerBusinessNo})` : ''}
              </DetailGridField>
              <DetailGridField label="작성일" value={e.estimateDate}>
                {e.estimateDate}
              </DetailGridField>
              <DetailGridField label="유효기간" value={e.validUntil}>
                {e.validUntil ?? '-'}
              </DetailGridField>
              <DetailGridField label="주소" value={e.partnerAddress}>
                {e.partnerAddress ?? '-'}
              </DetailGridField>
              <DetailGridField label="비고" value={e.memo} testId="estimate-detail-memo">
                {e.memo || '(빈 값)'}
              </DetailGridField>
              <DetailGridField label="담당" value={currentOwner?.displayName}>
                <div data-testid="estimate-owner-control">
                <AsyncAutocomplete<ApprovalLineUserOption>
                  label="담당"
                  value={currentOwner}
                  onChange={(owner) => {
                    if (owner) ownerMutation.mutate(owner)
                  }}
                  search={(keyword) => searchApprovalLineUsers(keyword, 20)}
                  getKey={(user) => user.id}
                  getInputLabel={(user) => user.displayName}
                  renderOption={(user) => user.displayName}
                  listboxLabel="담당자 검색 결과"
                  inputTestId="estimate-owner-search"
                  placeholder="담당자 이름 검색"
                  disabled={!canMutate || ownerMutation.isPending}
                  ariaLabel="담당자 이름 검색"
                />
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-secondary)' }}>
                  담당 변경은 견적서에만 적용되며 작성 기록은 보존됩니다.
                </div>
                </div>
              </DetailGridField>
            </div>
          </div>

          <div className="detail-action-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(isDraft || isSent) && canMutate ? (
              <Button
                variant="ghost"
                onClick={() => navigate(`/sales/estimates/${e.id}/edit`)}
                data-testid="estimate-detail-edit-button"
              >
                편집
              </Button>
            ) : null}
            {e.status === 'QUOTE_ACCEPTED' && canMutate && !isLocked ? (
              <Button
                variant="ghost"
                onClick={() => setCollabEditMode(true)}
                data-testid="estimate-detail-collab-edit-button"
              >
                수정
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
            {/* 언제든지 전환(2026-06-09 개발책임자): DRAFT/SENT/ACCEPTED 어느 단계서도 전표 변환 가능.
                이미 변환됨/거절됨(isLocked)만 숨김. */}
            {!isLocked && canMutate ? (
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
        ) : null}

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

        <div className="detail-mobile-hide">
          <DataTable
            // 헤더는 모두 가운데 정렬(개발책임자 정렬 지시) — 본문은 컬럼별 align(수량 가운데/금액 우측).
            columns={lineColumns.map((c) => ({ ...c, headerAlign: 'center' as const }))}
            rows={e.lines}
            rowKey={(l) => l.id}
            emptyMessage="라인이 없습니다."
          />
        </div>

        <div className="mobile-item-list" data-testid="estimate-detail-mobile-lines">
          {e.lines.length === 0 ? (
            <div className="mobile-item-card">
              <div className="mobile-item-total-row">
                <span className="mobile-item-total-label">라인</span>
                <span className="mobile-item-total-value">라인이 없습니다.</span>
              </div>
            </div>
          ) : (
            e.lines.map((line) => {
              const unitWithVat = line.unitPriceWithVat ?? line.unitPrice
              return (
                <div key={line.id} className="mobile-item-card">
                  <div className="mobile-item-card-header">
                    <div className="mobile-item-name">{line.productName ?? '—'}</div>
                  </div>
                  {line.modelName ? (
                    <div className="mobile-item-model">{line.modelName}</div>
                  ) : null}
                  <div className="mobile-item-divider" />
                  <div className="mobile-item-metrics">
                    <div className="mobile-item-metric">
                      <span className="mobile-item-metric-label">수량</span>
                      <span className="mobile-item-metric-value">{fmt(line.quantity)}</span>
                    </div>
                    <div className="mobile-item-metric">
                      <span className="mobile-item-metric-label">단가(VAT포함)</span>
                      <span className="mobile-item-metric-value">{fmt(unitWithVat)}</span>
                    </div>
                  </div>
                  <div className="mobile-item-chips">
                    {line.specification ? (
                      <span className="mobile-item-chip">규격 {line.specification}</span>
                    ) : null}
                    <span className="mobile-item-chip">
                      공급 {fmt(line.supplyAmount)}
                    </span>
                    <span className="mobile-item-chip">
                      부가세 {fmt(line.vatAmount)}
                    </span>
                  </div>
                  <div className="mobile-item-total-row">
                    <span className="mobile-item-total-label">합계(VAT포함)</span>
                    <span className="mobile-item-total-value">
                      {fmt(line.lineTotal)}원
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 합계 */}
        <div
          className="estimate-totals"
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: '#F9FAFB',
            borderRadius: 6,
            fontSize: 14,
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

      {isMobile ? (
        <>
          <MobileCollapsible
            title="코멘트"
            defaultOpen
            className="mobile-section-card"
          >
            <EstimateCollaborationPanel
              estimateId={id}
              status={e.status}
              currentValues={{
                memo: e.memo,
                validUntil: e.validUntil,
                lines: e.lines.map((line, index) => ({
                  lineKey: index + 1,
                  productName: line.productName,
                  modelName: line.modelName,
                  quantity: line.quantity,
                  unitPrice: line.unitPriceWithVat ?? line.unitPrice,
                  note: line.note,
                })),
              }}
              editMode={e.status === 'QUOTE_ACCEPTED' && !isLocked && collabEditMode}
              onEditModeChange={setCollabEditMode}
              onCommitted={handleCollabCommitted}
            />
          </MobileCollapsible>
        </>
      ) : (
        <>
          <EstimateCollaborationPanel
            estimateId={id}
            status={e.status}
            currentValues={{
              memo: e.memo,
              validUntil: e.validUntil,
              lines: e.lines.map((line, index) => ({
                lineKey: index + 1,
                productName: line.productName,
                modelName: line.modelName,
                quantity: line.quantity,
                unitPrice: line.unitPriceWithVat ?? line.unitPrice,
                note: line.note,
              })),
            }}
            editMode={e.status === 'QUOTE_ACCEPTED' && !isLocked && collabEditMode}
            onEditModeChange={setCollabEditMode}
            onCommitted={handleCollabCommitted}
          />
        </>
      )}

    </>
  )
}
