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
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Input,
  OrderNumberDisplay,
  Select,
  type DataTableColumn,
} from '@samhan/design-system'
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
import { DocumentNumberLink } from '../components/DocumentNumberLink'
import { restoreScrollAnchorWhenReady, saveScrollAnchor, type ReturnToLocation } from '../utils/returnContract'
import { AuditInfoBanner } from '../components/audit/AuditOverlaySection'
import { usePageTitleStore } from '../stores/pageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { searchPartners } from '../api/partnerApi'
import { MergeConvertDialog } from './components/MergeConvertDialog'
import { IndividualConvertDialog } from './components/IndividualConvertDialog'
import type { IndividualConversionResult } from './components/individualConversion'
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

const ORDER_STATUS_FILTER_OPTIONS: Array<{ value: PartnerOrderStatus | ''; label: string }> = [
  { value: '', label: '전체' },
  { value: 'DRAFT', label: '접수' },
  { value: 'CONVERTED', label: '완료' },
]
const ORDER_STATUS_DISPLAY_LABEL: Record<PartnerOrderStatus, string> = {
  ...PARTNER_ORDER_STATUS_LABEL,
  DRAFT: '접수',
  CONVERTED: '완료',
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

const MERGE_SELECTABLE_STATUSES: ReadonlySet<PartnerOrderStatus> = new Set(['DRAFT', 'ON_HOLD'])

export function SalesPartnerOrderListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const { canAccess } = usePermissions()
  const queryClient = useQueryClient()
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('dateFrom') ?? '')
  const [dateTo, setDateTo] = useState(() => searchParams.get('dateTo') ?? '')
  const [partnerId, setPartnerId] = useState(() => searchParams.get('partnerId') ?? '')
  const [statusFilter, setStatusFilter] = useState<PartnerOrderStatus | ''>(() => searchParams.get('status') as PartnerOrderStatus | '' || 'DRAFT')
  const [slipPublishStatusFilter, setSlipPublishStatusFilter] = useState<'' | 'FAILED' | 'PENDING_RETRY'>(() => searchParams.get('slipPublishStatus') as '' | 'FAILED' | 'PENDING_RETRY' || '')
  const [searchKeyword, setSearchKeyword] = useState(() => searchParams.get('keyword') ?? '')
  const [page, setPage] = useState(0)

  /** Phase 2.6b D2: 병합 전환 모달 open/close. */
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [individualDialogOpen, setIndividualDialogOpen] = useState(false)
  const [selectedMergeOrders, setSelectedMergeOrders] = useState<PartnerOrderSummary[]>([])
  const [mergeSelectionError, setMergeSelectionError] = useState<string | null>(null)
  /** Phase 2.6b D2: 병합 전환 성공 토스트 메시지 — null 이면 비표시. */
  const [convertSuccessMessage, setConvertSuccessMessage] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const returnTo: ReturnToLocation = { pathname: location.pathname, search: location.search }

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    const values: Record<string, string> = { dateFrom, dateTo, partnerId, status: statusFilter, slipPublishStatus: slipPublishStatusFilter, keyword: searchKeyword }
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (page > 0) next.set('page', String(page))
    else next.delete('page')
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [dateFrom, dateTo, partnerId, statusFilter, slipPublishStatusFilter, searchKeyword, page, searchParams, setSearchParams])

  const canCreateMerge = canAccess('sales.partner-order.convert', 'create')
  const canSearchPartners = canAccess('partners.search', 'view')
  const canRestoreDeletedOrder = canAccess('sales.partner-order.list', 'restore')

  // 목록 모집단이 바뀌면 기존 선택을 즉시 폐기한다. 이전 필터의 보이지 않는 주문이
  // 현재 목록의 전환 대상으로 남지 않도록 하며, 검색·기간·상태·전표상태·페이지 이동을
  // 모두 같은 규칙으로 처리한다.
  useEffect(() => {
    setSelectedMergeOrders((current) => current.length === 0 ? current : [])
  }, [dateFrom, dateTo, partnerId, statusFilter, slipPublishStatusFilter, searchKeyword, page])

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
  }, [dateFrom, dateTo, partnerId, statusFilter, slipPublishStatusFilter, searchKeyword])

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
      slipPublishStatusFilter, searchKeyword, page, canSearchPartners,
    ],
    queryFn: async () => {
      const result = await listPartnerOrders(page, 50, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        partnerId: partnerId.trim() || undefined,
        status: statusFilter || undefined,
        slipPublishStatus: slipPublishStatusFilter || undefined,
        searchKeyword: searchKeyword.trim() || undefined,
      })
      if (!canSearchPartners) return result
      const codes = [...new Set(result.content.filter((row) => !row.partnerName).map((row) => row.partnerCode))]
      const names = new Map<string, string>()
      await Promise.all(codes.map(async (code) => {
        const partner = (await searchPartners(code, { activeOnly: true })).find((item) => item.partnerCode === code)
        if (partner?.name) names.set(code, partner.name)
      }))
      return {
        ...result,
        content: result.content.map((row) => ({ ...row, partnerName: row.partnerName ?? names.get(row.partnerCode) ?? null })),
      }
    },
    retry: 1,
  })

  useEffect(() => restoreScrollAnchorWhenReady(location.key, () => query.isFetched), [location.key, query.isFetched])

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
      `출고전표 ${slipNo} 발행 완료 — ${convertedOrderNos.length}개 주문 병합 전환`,
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

  const isMergeSelectable = (order: PartnerOrderSummary) =>
    order.isDeleted !== true && MERGE_SELECTABLE_STATUSES.has(order.status)

  const handleMergeOrderSelection = (order: PartnerOrderSummary, checked: boolean) => {
    if (!isMergeSelectable(order)) return
    setMergeSelectionError(null)
    if (!checked) {
      setSelectedMergeOrders((current) => current.filter((item) => item.orderNumber !== order.orderNumber))
      return
    }
    setSelectedMergeOrders((current) => {
      if (current.some((item) => item.orderNumber === order.orderNumber)) return current
      return [...current, order]
    })
  }

  const handleMergeChoice = () => {
    if (!canSearchPartners) {
      setMergeSelectionError('병합전환에는 거래처 검색 권한이 필요합니다.')
      return
    }
    const partnerCodes = new Set(selectedMergeOrders.map((order) => order.partnerCode))
    if (partnerCodes.size > 1) {
      setMergeSelectionError('병합전환은 같은 거래처 주문만 가능합니다. 개별전환은 다른 거래처 주문도 함께 처리할 수 있습니다.')
      return
    }
    setMergeSelectionError(null)
    setIndividualDialogOpen(false)
    setMergeDialogOpen(true)
  }

  const handleIndividualCompleted = async (results: IndividualConversionResult[]) => {
    const successCount = results.filter((result) => result.status === 'success').length
    const failureCount = results.length - successCount
    setConvertSuccessMessage(`개별 전환 완료: 성공 ${successCount}건 / 실패 ${failureCount}건`)
    await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
    await queryClient.invalidateQueries({ queryKey: ['partner-order-merge-candidates'] })
  }

  const columns: DataTableColumn<PartnerOrderSummary>[] = [
    {
      key: 'mergeSelection',
      header: '선택',
      align: 'center',
      mobilePriority: 'primary',
      render: (o) => {
        const selectable = isMergeSelectable(o)
        const selected = selectedMergeOrders.some((item) => item.orderNumber === o.orderNumber)
        return (
          <span onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              data-testid={`partner-order-select-${o.orderNumber}`}
              aria-label={`${o.orderNumber} 병합 선택`}
              checked={selected}
              disabled={!selectable}
              title={selectable ? '출고전표 병합 대상으로 선택' : 'DRAFT 또는 ON_HOLD 주문만 선택할 수 있습니다'}
              onChange={(event) => handleMergeOrderSelection(o, event.target.checked)}
            />
          </span>
        )
      },
    },
    {
      key: 'orderNumber',
      header: '주문 번호',
      mobilePriority: 'primary',
      render: (o) => {
        const deleted = o.isDeleted === true
        return (
          <span className={styles['partnerOrderNumberCell']}>
            {deleted ? <OrderNumberDisplay orderNumber={o.orderNumber} size="sm" style={DELETED_ROW_TEXT_STYLE} /> : (
              <DocumentNumberLink
                number={o.orderNumber}
                to={`/sales/partner-orders/${encodeURIComponent(toOrderPathId(o.orderNumber))}`}
                detailWindow={{ documentType: 'PARTNER_ORDER', documentId: toOrderPathId(o.orderNumber) }}
                ariaLabel={`${o.orderNumber} 상세 보기`}
              />
            )}
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
            {deleted ? (
              <Badge
                variant="neutral"
                style={DELETED_ROW_TEXT_STYLE}
              >
                {PARTNER_ORDER_STATUS_LABEL[o.status]}
              </Badge>
            ) : (
              <Badge variant={o.status === 'CONVERTED' ? 'success' : 'warning'}>
                {ORDER_STATUS_DISPLAY_LABEL[o.status]}
              </Badge>
            )}
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
    saveScrollAnchor(location.key)
    navigate(`/sales/partner-orders/${encodeURIComponent(toOrderPathId(o.orderNumber))}`, {
      state: { returnTo, returnEntryKey: location.key },
    })
  }

  return (
    <div style={{ color: 'var(--ink-primary)', background: 'var(--surface-card)' }}>
      <div className={styles['wrap']}>
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
          <div className={styles['listFilterGrid']}>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label={isPreConfirmStatus ? '시작일 (발송일 기준)' : '시작일 (확정일 기준)'}
              title={isPreConfirmStatus ? '진행중·보류·확인중 상태는 발송일(createdAt) 기준으로 조회됩니다' : undefined}
              data-testid="partner-order-list-date-from"
              inputSize="sm"
              style={{ width: 150 }}
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label={isPreConfirmStatus ? '종료일 (발송일 기준)' : '종료일 (확정일 기준)'}
              title={isPreConfirmStatus ? '진행중·보류·확인중 상태는 발송일(createdAt) 기준으로 조회됩니다' : undefined}
              data-testid="partner-order-list-date-to"
              inputSize="sm"
              style={{ width: 150 }}
            />
            <Input
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              placeholder="거래처 코드 또는 사업자번호"
              aria-label="거래처 필터"
              data-testid="partner-order-list-partner-filter"
              inputSize="sm"
              style={{ width: '100%' }}
            />
            <Select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value as PartnerOrderStatus | '')}
              aria-label="상태 필터"
              data-testid="partner-order-list-status-filter"
              selectSize="sm"
              style={{ width: '100%' }}
            >
              {ORDER_STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={slipPublishStatusFilter}
              onChange={(e) => handleSlipPublishStatusFilterChange(e.target.value as '' | 'FAILED' | 'PENDING_RETRY')}
              aria-label="전표 발행상태 필터"
              data-testid="partner-order-list-slip-publish-filter"
              selectSize="sm"
              style={{ width: '100%' }}
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
              style={{ width: '100%' }}
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

        {/* 목록 선택 후 개별/병합 경로를 고른다. */}
        <div
            data-testid="merge-convert-action-bar"
            role="region"
            aria-label="선택 주문 출고전표 전환"
            className={styles['mergeConvertActionBar']}
          >
            <span data-testid="merge-convert-selection-guide">
              선택한 주문은 개별전환으로 각각 전표가 되며, 병합전환은 같은 거래처만 가능합니다.
            </span>
            <span data-testid="merge-convert-selection-count">
              목록에서 {selectedMergeOrders.length}건 선택됨
            </span>
            {mergeSelectionError ? (
              <span role="alert" data-testid="merge-convert-selection-error">
                {mergeSelectionError}
              </span>
            ) : null}
            <Button
              type="button"
              variant="primary"
              data-testid="order-convert-open"
              title={!canCreateMerge ? '출고전표 전환 권한이 필요합니다' : !canSearchPartners ? '거래처 검색 권한이 필요합니다' : '선택한 주문을 출고전표로 전환합니다'}
              disabled={!canCreateMerge || !canSearchPartners}
              aria-disabled={!canCreateMerge || !canSearchPartners}
              onClick={() => setIndividualDialogOpen(true)}
            >
              출고전표 전환
            </Button>
            {!canCreateMerge ? (
              <span role="alert" data-testid="merge-convert-permission-hint">
                출고전표 전환 권한이 필요합니다.
              </span>
            ) : !canSearchPartners ? (
              <span role="alert" data-testid="merge-convert-permission-hint">
                거래처 검색 권한이 필요합니다. 관리자에게 partners.search VIEW 권한을 요청해 주세요.
              </span>
            ) : null}
        </div>

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
          selectedOrders={selectedMergeOrders}
          onClose={handleMergeDialogClose}
          onSuccess={(slipNo, convertedOrderNos) => void handleMergeDialogSuccess(slipNo, convertedOrderNos)}
        />
      ) : null}
      {individualDialogOpen ? (
        <IndividualConvertDialog
          selectedOrders={selectedMergeOrders}
          onClose={() => setIndividualDialogOpen(false)}
          onMerge={handleMergeChoice}
          onCompleted={(results) => void handleIndividualCompleted(results)}
          mergeError={mergeSelectionError}
          mergeDisabled={!canSearchPartners}
          mergeDisabledReason="거래처 검색 권한이 필요합니다. 관리자에게 partners.search VIEW 권한을 요청해 주세요."
        />
      ) : null}
    </div>
  )
}
