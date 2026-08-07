/**
 * 주문서 관리 목록 — `/sales/partner-orders` (read-only).
 *
 * <p>거래처가 보낸 주문 목록 (legacy partner-order Code.js 의 ORDER DB 결과 → SamhanLogis
 * partner-order-service M4 통합).
 *
 * <p>Phase 2.6b D2 / #825 슬7: 병합 화면에서 거래처를 먼저 선택하고
 * 해당 거래처의 DRAFT/ON_HOLD 주문만 칩으로 선택한다.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DataTable, Input, Select, type DataTableColumn } from '@samhan/design-system'
import {
  PARTNER_ORDER_STATUS_LABEL,
  SLIP_PUBLISH_STATUS_DISPLAY,
  listPartnerOrders,
  restorePartnerOrder,
  type PartnerOrderStatus,
  type PartnerOrderSummary,
} from '../api/sales'
import { formatSlipDate } from '../api/slipNumber'
import { toOrderPathId } from '../utils/orderNo'
import { AuditInfoBanner } from '../components/audit/AuditOverlaySection'
import { usePageTitleStore } from '../stores/pageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import { MergeConvertDialog } from './components/MergeConvertDialog'
import { useCollectionRealtime } from '../realtime/useCollectionRealtime'
import { PartnerOrderBoardRealtimeClient } from '../realtime/PartnerOrderBoardRealtimeClient'
import {
  DELETED_ROW_TEXT_STYLE,
  deletedAtTooltip,
  deletedBadgeAriaLabel,
  deletedBadgeLabel,
} from '../realtime/deletedRowDisplay'
import { serverErrorMessage } from './dispatch-board/dispatchErrorMessage'
import styles from '../components/sales/sales.module.css'

const STATUS_CLASS: Record<PartnerOrderStatus, string> = {
  DRAFT: styles['statusDraft']!,
  ON_HOLD: styles['statusOnHold']!,
  CONFIRMING: styles['statusSent']!,
  CONFIRMED: styles['statusConfirmed']!,
  CANCELED: styles['statusCanceled']!,
  CONVERTED: styles['statusConverted']!,
}

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)
// v2 §정정 8 — 'YYYY/MM/DD' 통일.
const ymd = (iso: string | null) => (iso ? formatSlipDate(iso) : '-')

/**
 * Phase 2.6b D2: 병합 전환 선택 가능 status (DRAFT/ON_HOLD).
 * CONFIRMED/CANCELED/CONVERTED 행은 체크박스 비활성.
 */
// 비삭제 행은 기존 testid 계약(`partner-order-row-{orderNumber}`)을 보존하고, 삭제 행만 composite
// 접미사를 붙인다(삭제행+동일코드 활성행 공존 시 React key/testid 충돌 방지). 전체 행에 접미사를
// 붙이면 기존 Playwright 하드게이트 exact-match 가 깨진다(#757 R1 BLOCKING).
//
// orderNumber 는 order_no NOT NULL UNIQUE 라 실주문에서 항상 존재하지만, 이론상 누락 행이 유입될 때
// partnerCode 단독 폴백은 같은 거래처 다건에서 React key/testid 충돌을 낳는다. submittedAt 을
// disambiguator 로 부가해 리팩터 전 견고성을 유지한다(#757 STEP4 FE MED). 폴백 경로만 영향받으므로
// 하드게이트(실 orderNumber 행)는 그대로다.
const partnerOrderRowKey = (o: PartnerOrderSummary) => {
  const base = o.orderNumber ?? `row-${o.partnerCode}-${o.submittedAt ?? 'na'}`
  return o.isDeleted === true ? `${base}:deleted` : base
}

function restoreErrorMessage(error: unknown): string {
  // BE 한국어 사유(ApiEnvelope.message)를 우선 노출. Axios 제네릭(영문) 폴백 방지.
  return serverErrorMessage(error) ?? '주문 복원에 실패했습니다. 잠시 후 다시 시도하세요.'
}


/**
 * P1-3: confirmedAt 없는 status(DRAFT/ON_HOLD/CONFIRMING) 는 BE 가 createdAt 기준으로
 * 기간필터를 적용한다. 기간 입력 영역에 컨텍스트 힌트를 제공하여 사용자 혼란 방지.
 */
const PRE_CONFIRM_STATUSES: ReadonlySet<PartnerOrderStatus> = new Set([
  'DRAFT',
  'ON_HOLD',
  'CONFIRMING',
])

export function SalesPartnerOrderListPage() {
  const navigate = useNavigate()
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const { canAccess } = usePermissions()
  const queryClient = useQueryClient()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [statusFilter, setStatusFilter] = useState<PartnerOrderStatus | ''>('DRAFT')
  const [slipPublishStatusFilter, setSlipPublishStatusFilter] = useState<'' | 'FAILED' | 'PENDING_RETRY'>('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [page, setPage] = useState(0)

  /** Phase 2.6b D2: 병합 전환 모달 open/close. */
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  /** Phase 2.6b D2: 병합 전환 성공 토스트 메시지 — null 이면 비표시. */
  const [convertSuccessMessage, setConvertSuccessMessage] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const canCreateMerge = canAccess('sales.partner-order.convert', 'create')
  const canSearchPartners = canAccess('partners.search', 'view')
  const canMergeConvert = canCreateMerge && canSearchPartners
  const canRestoreDeletedOrder = canAccess('sales.partner-order.list', 'restore')

  /**
   * P1-3: status 변경 시 기간 필터 초기화 + 컨텍스트 힌트 표시.
   * DRAFT/ON_HOLD/CONFIRMING → confirmedAt NULL, 기간 기본 미설정(전체 조회) 으로 유도.
   */
  const handleStatusFilterChange = (next: PartnerOrderStatus | '') => {
    setStatusFilter(next)
    // 확정(CONFIRMED)→미확정(DRAFT/ON_HOLD/CONFIRMING) 또는 반대 전환 시 기간 초기화.
    // 기간 의미(confirmedAt vs createdAt)가 달라지므로 기존 값을 유지하면 결과가 달라질 수 있음.
    setDateFrom('')
    setDateTo('')
    setSlipPublishStatusFilter('')
    // 복원 실패 배너는 다른 필터로 이동하면 맥락이 사라지므로 함께 소거(#757 STEP4 FE LOW).
    setRestoreError(null)
  }

  const handleSlipPublishStatusFilterChange = (next: '' | 'FAILED' | 'PENDING_RETRY') => {
    setSlipPublishStatusFilter(next)
    // 발행상태 필터는 기본 DRAFT 흐름과 독립적으로 실패/재시도 주문을 보여준다.
    if (next) setStatusFilter('')
    setDateFrom('')
    setDateTo('')
    setRestoreError(null)
  }

  /**
   * #863 R1 H-6: 발행실패 배너 클릭 전용 핸들러. `failedCountQuery` 는 거래처/검색어 필터와
   * 무관하게 전역 집계인데, 클릭 후 목록은 기존 partnerId/searchKeyword 를 그대로 물고 있어
   * "발행 실패 N건" 배너 바로 아래 "등록된 주문이 없습니다"가 뜨는 모집단 불일치가 있었다.
   * 배너는 "전체에서 실패한 N건"을 약속하므로, 클릭 시 그 약속과 같은 모집단(거래처/검색어
   * 필터 없음)을 보여주도록 두 필터를 함께 초기화한다. 드롭다운(전표 발행상태 필터)에서
   * 수동으로 FAILED/PENDING_RETRY 를 선택하는 경로는 사용자가 의도적으로 필터를 조합하는
   * 것이므로 partnerId/searchKeyword 를 건드리지 않는다 — 이 핸들러는 배너 전용이다.
   */
  const handleFailureBannerClick = () => {
    setPartnerId('')
    setSearchKeyword('')
    handleSlipPublishStatusFilterChange('FAILED')
  }

  const isPreConfirmStatus =
    statusFilter !== '' && PRE_CONFIRM_STATUSES.has(statusFilter as PartnerOrderStatus)

  useEffect(() => {
    setPageTitle({ title: '주문서 관리', meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  useEffect(() => {
    setPage(0)
  }, [dateFrom, dateTo, partnerId, statusFilter, slipPublishStatusFilter, searchKeyword, includeDeleted])

  useCollectionRealtime(PartnerOrderBoardRealtimeClient, 'board', [['partner-orders']])

  const failedCountQuery = useQuery({
    queryKey: ['partner-orders', 'slip-publish-failed-count'],
    queryFn: () => listPartnerOrders(0, 1, {
      slipPublishStatus: 'FAILED',
    }),
    staleTime: 30_000,
    retry: 1,
  })

  const query = useQuery({
    queryKey: [
      'partner-orders', dateFrom, dateTo, partnerId, statusFilter,
      slipPublishStatusFilter, searchKeyword, includeDeleted, page,
    ],
    queryFn: () => listPartnerOrders(page, 50, {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      partnerId: partnerId.trim() || undefined,
      status: statusFilter || undefined,
      slipPublishStatus: slipPublishStatusFilter || undefined,
      searchKeyword: searchKeyword.trim() || undefined,
      ...(includeDeleted ? { includeDeleted: true } : {}),
    }),
    retry: 1,
  })

  const restoreMutation = useMutation({
    mutationFn: restorePartnerOrder,
    onSuccess: async (restored) => {
      setRestoreError(null)
      await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
      if (restored.orderNumber) {
        await queryClient.invalidateQueries({ queryKey: ['partner-order', toOrderPathId(restored.orderNumber)] })
      }
    },
    onError: (error) => {
      setRestoreError(restoreErrorMessage(error))
    },
  })

  const handleMergeDialogClose = () => {
    setMergeDialogOpen(false)
  }

  const handleMergeDialogSuccess = async (slipNo: string, convertedOrderNos: string[]) => {
    setMergeDialogOpen(false)
    // FE P2: 토스트 카피 — N개 주문 병합 전환 + 4초 소멸 (가이드 §2.7)
    setConvertSuccessMessage(
      `판매전표 ${slipNo} 발행 완료 — ${convertedOrderNos.length}개 주문 병합 전환`,
    )
    // 4초 후 토스트 자동 소멸
    setTimeout(() => setConvertSuccessMessage(null), 4000)
    // FE P1-4: 목록 캐시 + 전환된 각 주문 단건 캐시 무효화
    await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
    await queryClient.invalidateQueries({ queryKey: ['partner-order-merge-candidates'] })
    await Promise.all(
      convertedOrderNos.map((orderNo) =>
        queryClient.invalidateQueries({ queryKey: ['partner-order', toOrderPathId(orderNo)] }),
      ),
    )
  }

  const columns: DataTableColumn<PartnerOrderSummary>[] = [
    {
      key: 'orderNumber',
      header: '주문 번호',
      mobilePriority: 'primary',
      render: (o) => {
        const deleted = o.isDeleted === true
        return (
          <span className={styles['partnerOrderNumberCell']}>
            <span style={deleted ? DELETED_ROW_TEXT_STYLE : undefined}>
              {o.orderNumber}
            </span>
            {deleted ? (
              <span
                className={styles['partnerOrderDeletedBadge']}
                title={deletedAtTooltip(o.deletedAt)}
                aria-label={deletedBadgeAriaLabel(o.deletedByName, o.deletedAt)}
              >
                {deletedBadgeLabel(o.deletedByName)}
              </span>
            ) : null}
          </span>
        )
      },
    },
    {
      key: 'partnerCode',
      header: '거래처 코드',
      mobilePriority: 'secondary',
      render: (o) => (
        <span style={o.isDeleted === true ? DELETED_ROW_TEXT_STYLE : undefined}>
          {o.partnerCode}
        </span>
      ),
    },
    {
      key: 'partnerName',
      header: '거래처명',
      mobilePriority: 'secondary',
      render: (o) => (
        <span style={o.isDeleted === true ? DELETED_ROW_TEXT_STYLE : undefined}>
          {o.partnerName ?? o.partnerCode}
        </span>
      ),
    },
    {
      key: 'submittedAt',
      header: '발송일',
      mobilePriority: 'secondary',
      render: (o) => (
        <span style={o.isDeleted === true ? DELETED_ROW_TEXT_STYLE : undefined}>
          {ymd(o.submittedAt)}
        </span>
      ),
    },
    {
      key: 'totalAmount',
      header: '합계',
      align: 'right',
      mobilePriority: 'secondary',
      render: (o) => (
        <span style={o.isDeleted === true ? DELETED_ROW_TEXT_STYLE : undefined}>
          {krw(o.totalAmount)}원
        </span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      mobilePriority: 'secondary',
      render: (o) => {
        const deleted = o.isDeleted === true
        // 삭제행 배지는 원래 의미색(예: 완료=초록)을 유지하면 "삭제됐는데 정상 완료" 혼합
        // 신호가 되므로 중립색으로 통일한다(#757 R2 Design F-1). 상태 텍스트는 보존.
        const publishMeta = SLIP_PUBLISH_STATUS_DISPLAY[o.slipPublishStatus]
        return (
          <span className={styles['partnerOrderNumberCell']}>
            <span
              className={`${styles['statusBadge']} ${deleted ? styles['statusDeletedNeutral'] : STATUS_CLASS[o.status]}`}
              style={deleted ? DELETED_ROW_TEXT_STYLE : undefined}
            >
              {PARTNER_ORDER_STATUS_LABEL[o.status]}
            </span>
            {publishMeta ? (
              <Badge
                variant={publishMeta.variant}
                data-testid={`partner-order-row-slip-publish-status-${o.orderNumber ?? 'na'}`}
              >
                {publishMeta.label}
              </Badge>
            ) : null}
          </span>
        )
      },
    },
    {
      key: 'linkedSlipNo',
      header: '연결 전표',
      mobilePriority: 'hidden',
      render: (o) => {
        return (
          <span className={styles['partnerOrderNumberCell']}>
            <span style={o.isDeleted === true ? DELETED_ROW_TEXT_STYLE : undefined}>
              {o.linkedSlipNo ?? '-'}
            </span>
          </span>
        )
      },
    },
    ...(canRestoreDeletedOrder
      ? ([
          {
            key: 'restore',
            header: '복원',
            align: 'center',
            mobilePriority: 'secondary',
            render: (o) => {
              // 삭제행에만 복원 버튼 노출. 복원 권한(RESTORE)이 없는 사용자에게는 컬럼 자체를
              // 생략한다(선택 전용 컬럼과 동일 관례로 빈 헤더 잔존 방지, #757 STEP4 FE LOW).
              // BE @RequirePermission(RESTORE) 이중 방어는 유지된다.
              if (o.isDeleted !== true) {
                return null
              }
              const key = partnerOrderRowKey(o)
              return (
                <span onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-testid={`partner-order-restore-${key}`}
                    disabled={!o.orderNumber || restoreMutation.isPending}
                    onClick={() => {
                      if (!o.orderNumber) return
                      setRestoreError(null)
                      restoreMutation.mutate(o.orderNumber)
                    }}
                  >
                    복원
                  </Button>
                </span>
              )
            },
          },
        ] as DataTableColumn<PartnerOrderSummary>[])
      : []),
  ]

  const handleRowClick = (o: PartnerOrderSummary) => {
    if (!o.orderNumber) {
      console.warn('[SalesPartnerOrderListPage] orderNumber 누락 row 무시', o)
      return
    }
    if (o.isDeleted === true) {
      return
    }
    navigate(`/sales/partner-orders/${encodeURIComponent(toOrderPathId(o.orderNumber))}`)
  }

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        {/* [3a 데스크탑 ↔ 웹 분리] 본 화면은 내부 영업/관리자가 거래처가 보낸 주문을 조회·승인하는
            화면. 거래처(파트너) 가 주문서를 직접 작성·발송하는 흐름은 외부 PWA (sub-nav 우측 "웹 주문서 ↗"). */}
        <div
          data-testid="partner-order-audience-banner"
          role="note"
          style={{
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            color: '#1E3A8A',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <strong>내부 영업·관리자용 화면입니다.</strong>{' '}
          거래처(파트너) 가 주문서를 직접 작성·발송하는 PWA 는 상단 우측{' '}
          <em>「웹 주문서 ↗」</em> 외부 웹앱을 사용합니다.
        </div>
        {/* PR-H4c FE-A: list 화면 audit 안내 — 상세 변경 이력은 row 클릭 후 상세에서 확인 */}
        <AuditInfoBanner
          message="주문 row 를 클릭하면 상세 화면에서 변경 이력 (수정 횟수 / 복원) 을 확인할 수 있습니다. 본 목록은 주문 변경 시 자동 갱신됩니다."
          testId="partner-order-list-audit-info-banner"
        />
        {restoreError ? (
          <div
            role="alert"
            data-testid="partner-order-restore-error"
            className={styles['partnerOrderRestoreError']}
          >
            {restoreError}
            <button
              type="button"
              aria-label="복원 오류 알림 닫기"
              data-testid="partner-order-restore-error-dismiss"
              onClick={() => setRestoreError(null)}
              style={{
                marginLeft: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                color: 'inherit',
              }}
            >
              &times;
            </button>
          </div>
        ) : null}
        {/* Phase 2.6b D2: 병합 전환 성공 토스트 */}
        {convertSuccessMessage ? (
          <div
            data-testid="merge-convert-success-toast"
            role="status"
            aria-live="polite"
            className={styles['mergeConvertSuccessToast']}
          >
            <span style={{ fontSize: 16 }}>&#10003;</span>
            {convertSuccessMessage}
          </div>
        ) : null}
        <div className={styles['top']}>
          <div className={styles['title']}>
            주문서 관리
            <span className={styles['badge']}>전체 {query.data?.totalElements ?? 0}건</span>
          </div>
          <div className={styles['topActions']}>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label={isPreConfirmStatus ? '시작일 (발송일 기준)' : '시작일 (확정일 기준)'}
              title={isPreConfirmStatus ? '진행중·보류·확인중 상태는 발송일(createdAt) 기준으로 조회됩니다' : undefined}
              data-testid="partner-order-list-date-from"
              inputSize="sm"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
                data-testid="partner-order-list-include-deleted"
              />
              삭제 문서 포함
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label={isPreConfirmStatus ? '종료일 (발송일 기준)' : '종료일 (확정일 기준)'}
              title={isPreConfirmStatus ? '진행중·보류·확인중 상태는 발송일(createdAt) 기준으로 조회됩니다' : undefined}
              data-testid="partner-order-list-date-to"
              inputSize="sm"
            />
            <Input
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              placeholder="거래처 코드 또는 사업자번호"
              aria-label="거래처 필터"
              data-testid="partner-order-list-partner-filter"
              inputSize="sm"
            />
            <Select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value as PartnerOrderStatus | '')}
              aria-label="상태 필터"
              data-testid="partner-order-list-status-filter"
              selectSize="sm"
            >
              <option value="">전체 상태</option>
              {(Object.keys(PARTNER_ORDER_STATUS_LABEL) as PartnerOrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PARTNER_ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select
              value={slipPublishStatusFilter}
              onChange={(e) => handleSlipPublishStatusFilterChange(e.target.value as '' | 'FAILED' | 'PENDING_RETRY')}
              aria-label="전표 발행상태 필터"
              data-testid="partner-order-list-slip-publish-filter"
              selectSize="sm"
            >
              <option value="">전표 발행상태 전체</option>
              <option value="FAILED">발행실패</option>
              <option value="PENDING_RETRY">재시도 중</option>
            </Select>
            <Input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="주문번호·품목명·모델명"
              aria-label="검색어"
              data-testid="partner-order-list-keyword-filter"
              inputSize="sm"
            />
          </div>
        </div>

        {failedCountQuery.isError ? (
          // #863 R1 MED: failedCountQuery 실패를 무음(totalElements ?? 0 === 0)으로 삼키면
          // "발행 실패 0건"처럼 보여 이 슬라이스가 없애려던 false-negative 를 재현한다. 조회
          // 자체가 실패했다는 것을 정직하게 보여준다.
          <div
            role="alert"
            data-testid="partner-order-slip-publish-failure-count-error"
            className={styles['partnerOrderRestoreError']}
          >
            발행 실패 건수를 확인하지 못했습니다. 새로고침 후 다시 확인하세요.
          </div>
        ) : (failedCountQuery.data?.totalElements ?? 0) > 0 ? (
          <button
            type="button"
            data-testid="partner-order-slip-publish-failure-banner"
            className={styles['statusLongPending']}
            onClick={handleFailureBannerClick}
          >
            발행 실패 {failedCountQuery.data?.totalElements}건 — 실패 주문 보기
          </button>
        ) : null}

        {/* #825 슬7: 목록에서 혼합 선택을 시작하지 않고, 모달에서 거래처를 먼저 선택한다. */}
        {canCreateMerge ? (
          <div
            data-testid="merge-convert-action-bar"
            role="region"
            aria-label="선택 주문 병합 전환"
            className={styles['mergeConvertActionBar']}
          >
            <span data-testid="merge-convert-selection-guide">
              거래처를 먼저 선택하면 같은 거래처 주문만 병합 후보로 표시됩니다.
            </span>
            <Button
              type="button"
              variant="primary"
              data-testid="merge-convert-open"
              title={canMergeConvert
                ? '거래처를 선택하고 병합할 주문을 고릅니다'
                : '거래처 검색 권한이 필요합니다'}
              disabled={!canMergeConvert}
              aria-disabled={!canMergeConvert}
              onClick={() => setMergeDialogOpen(true)}
            >
              판매전표로 병합 전환
            </Button>
            {!canSearchPartners ? (
              <span role="alert" data-testid="merge-convert-permission-hint">
                거래처 검색 권한이 필요합니다. 관리자에게 partners.search VIEW 권한을 요청해 주세요.
              </span>
            ) : null}
          </div>
        ) : null}

        {query.isLoading ? (
          <div className={styles['emptyState']}>주문 목록을 불러오는 중…</div>
        ) : query.isError ? (
          <div className={styles['emptyState']}>
            <h3>주문 목록을 불러오지 못했습니다</h3>
            <p>잠시 후 다시 조회하거나 관리자에게 문의하세요.</p>
          </div>
        ) : (query.data?.content ?? []).length === 0 ? (
          <div className={styles['emptyState']}>
            <h3>등록된 주문이 없습니다</h3>
            <p>거래처가 주문서를 발송하면 본 목록에 표시됩니다.</p>
          </div>
        ) : (
          <>
            <DataTable
            columns={columns}
            rows={query.data?.content ?? []}
            rowKey={partnerOrderRowKey}
            rowTestId={(o) => `partner-order-row-${partnerOrderRowKey(o)}`}
            rowClassName={(o) => {
              if (o.isDeleted === true) return styles['partnerOrderRowDeleted']
              return !o.orderNumber ? styles['partnerOrderRowDisabled'] : undefined
            }}
            onRowClick={handleRowClick}
            rowClickable={(o) => o.isDeleted !== true && !!o.orderNumber}
            emptyMessage="등록된 주문이 없습니다"
            />
            {query.data && query.data.totalPages > 1 ? (
            <div data-testid="partner-order-list-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="partner-order-list-previous-page"
                disabled={page === 0 || query.isFetching}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                이전
              </Button>
              <span data-testid="partner-order-list-page-indicator">{page + 1} / {query.data.totalPages}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="partner-order-list-next-page"
                disabled={page + 1 >= query.data.totalPages || query.isFetching}
                onClick={() => setPage((current) => Math.min(query.data!.totalPages - 1, current + 1))}
              >
                다음
              </Button>
            </div>
            ) : null}
          </>
        )}
      </div>

      {/* Phase 2.6b D2: 병합 전환 모달 */}
      {mergeDialogOpen ? (
        <MergeConvertDialog
          onClose={handleMergeDialogClose}
          onSuccess={(slipNo, convertedOrderNos) => void handleMergeDialogSuccess(slipNo, convertedOrderNos)}
        />
      ) : null}
    </div>
  )
}
