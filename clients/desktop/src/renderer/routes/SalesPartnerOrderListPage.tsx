/**
 * 주문서 관리 목록 — `/sales/partner-orders` (read-only).
 *
 * <p>거래처가 보낸 주문 목록 (legacy partner-order Code.js 의 ORDER DB 결과 → SamhanLogis
 * partner-order-service M4 통합).
 *
 * <p>Phase 2.6b D2: 체크박스 다중선택 + 병합 전환 버튼 추가.
 * DRAFT/ON_HOLD 행만 선택 가능. 선택 주문 partnerCode 동일할 때만 버튼 활성.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Input, Select, type DataTableColumn } from '@samhan/design-system'
import {
  PARTNER_ORDER_STATUS_LABEL,
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
const MERGE_SELECTABLE_STATUS: ReadonlySet<PartnerOrderStatus> = new Set(['DRAFT', 'ON_HOLD'])

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
  const [searchKeyword, setSearchKeyword] = useState('')

  /** Phase 2.6b D2: 다중선택 상태 — orderNumber Set. */
  const [selectedOrderNumbers, setSelectedOrderNumbers] = useState<Set<string>>(new Set())
  /** Phase 2.6b D2: 병합 전환 모달 open/close. */
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  /** Phase 2.6b D2: 병합 전환 성공 토스트 메시지 — null 이면 비표시. */
  const [convertSuccessMessage, setConvertSuccessMessage] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const canMergeConvert = canAccess('sales.partner-order.convert', 'create')
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
    // 필터 변경 시 선택 초기화
    setSelectedOrderNumbers(new Set())
    // 복원 실패 배너는 다른 필터로 이동하면 맥락이 사라지므로 함께 소거(#757 STEP4 FE LOW).
    setRestoreError(null)
  }

  const isPreConfirmStatus =
    statusFilter !== '' && PRE_CONFIRM_STATUSES.has(statusFilter as PartnerOrderStatus)

  useEffect(() => {
    setPageTitle({ title: '주문서 관리', meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  useCollectionRealtime(PartnerOrderBoardRealtimeClient, 'board', [['partner-orders']])

  const query = useQuery({
    queryKey: ['partner-orders', dateFrom, dateTo, partnerId, statusFilter, searchKeyword, 0],
    queryFn: () => listPartnerOrders(0, 50, {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      partnerId: partnerId.trim() || undefined,
      status: statusFilter || undefined,
      searchKeyword: searchKeyword.trim() || undefined,
      // 내부 관리자 목록 전용 opt-in — E2 취소선/복원 표시용 삭제행 포함(#757 R2 HIGH:
      // BE 기본값은 활성만이며 파트너 호출은 값과 무관하게 활성 행만 반환).
      includeDeleted: true,
    }),
    retry: 1,
  })

  const restoreMutation = useMutation({
    mutationFn: restorePartnerOrder,
    onSuccess: async (restored) => {
      setRestoreError(null)
      await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
      if (restored.orderNumber) {
        await queryClient.invalidateQueries({ queryKey: ['partner-order', restored.orderNumber] })
      }
    },
    onError: (error) => {
      setRestoreError(restoreErrorMessage(error))
    },
  })

  /**
   * Phase 2.6b D2: 현재 선택된 주문 객체 배열 (목록에서 orderNumber 매칭).
   * 병합 가능 조건: 2건 이상 + 모두 같은 partnerCode.
   */
  const selectedOrders: PartnerOrderSummary[] = (query.data?.content ?? []).filter(
    (o) => o.orderNumber && o.isDeleted !== true && selectedOrderNumbers.has(o.orderNumber),
  )

  const selectedCount = selectedOrders.length

  /**
   * 선택 주문들의 partnerCode 가 모두 동일하면 true.
   * 0~1건이면 병기 판정 불필요이므로 false 반환 (버튼 비활성).
   */
  const allSamePartner =
    selectedCount >= 2 &&
    new Set(selectedOrders.map((o) => o.partnerCode)).size === 1

  const mergeButtonEnabled = canMergeConvert && selectedCount >= 2 && allSamePartner

  const handleRowCheckboxChange = (orderNumber: string, checked: boolean) => {
    setSelectedOrderNumbers((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(orderNumber)
      } else {
        next.delete(orderNumber)
      }
      return next
    })
  }

  const handleMergeDialogClose = () => {
    setMergeDialogOpen(false)
  }

  const handleMergeDialogSuccess = async (slipNo: string, convertedOrderNos: string[]) => {
    setMergeDialogOpen(false)
    // FE P2: 토스트 카피 — N개 주문 병합 전환 + 4초 소멸 (가이드 §2.7)
    setConvertSuccessMessage(
      `판매전표 ${slipNo} 발행 완료 — ${convertedOrderNos.length}개 주문 병합 전환`,
    )
    setSelectedOrderNumbers(new Set())
    // 4초 후 토스트 자동 소멸
    setTimeout(() => setConvertSuccessMessage(null), 4000)
    // FE P1-4: 목록 캐시 + 전환된 각 주문 단건 캐시 무효화
    await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
    await Promise.all(
      convertedOrderNos.map((orderNo) =>
        queryClient.invalidateQueries({ queryKey: ['partner-order', orderNo] }),
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
    ...(canMergeConvert
      ? ([
          {
            key: 'mergeSelect',
            header: '',
            width: '32px',
            align: 'center',
            mobilePriority: 'secondary',
            render: (o) => {
              const isSelectable =
                !!o.orderNumber &&
                o.isDeleted !== true &&
                MERGE_SELECTABLE_STATUS.has(o.status as PartnerOrderStatus)
              const isSelected = !!o.orderNumber && selectedOrderNumbers.has(o.orderNumber)
              return (
                <span data-merge-checkbox="1" onClick={(e) => e.stopPropagation()}>
                  {isSelectable ? (
                    <input
                      type="checkbox"
                      aria-label={`${o.orderNumber} 선택`}
                      data-testid={`merge-checkbox-${o.orderNumber}`}
                      checked={isSelected}
                      onChange={(e) => {
                        if (o.orderNumber) {
                          handleRowCheckboxChange(o.orderNumber, e.target.checked)
                        }
                      }}
                    />
                  ) : null}
                </span>
              )
            },
          },
        ] as DataTableColumn<PartnerOrderSummary>[])
      : []),
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
        return (
          <span
            className={`${styles['statusBadge']} ${deleted ? styles['statusDeletedNeutral'] : STATUS_CLASS[o.status]}`}
            style={deleted ? DELETED_ROW_TEXT_STYLE : undefined}
          >
            {PARTNER_ORDER_STATUS_LABEL[o.status]}
          </span>
        )
      },
    },
    {
      key: 'linkedSlipNo',
      header: '연결 전표',
      mobilePriority: 'hidden',
      render: (o) => (
        <span style={o.isDeleted === true ? DELETED_ROW_TEXT_STYLE : undefined}>
          {o.linkedSlipNo ?? '-'}
        </span>
      ),
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
              // 생략한다(mergeSelect 컬럼과 동일 관례로 빈 헤더 잔존 방지, #757 STEP4 FE LOW).
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

        {/* Phase 2.6b D2: 병합 전환 액션 바 — 2건 이상 선택 시 표시 */}
        {canMergeConvert && selectedCount >= 1 ? (
          <div
            data-testid="merge-convert-action-bar"
            role="region"
            aria-label="선택 주문 병합 전환"
            className={styles['mergeConvertActionBar']}
          >
            <span data-testid="merge-convert-selected-count">
              {selectedCount}건 선택됨
            </span>
            {!allSamePartner && selectedCount >= 2 ? (
              <span
                data-testid="merge-convert-mixed-partner-warn"
                style={{ color: '#B45309', fontSize: 12 }}
              >
                (같은 거래처만 병합 가능합니다)
              </span>
            ) : null}
            {/* UI-OBS-1 수정: 혼합 거래처 선택 시 disabled + aria-disabled 모두 설정.
                Playwright toBeDisabled() 는 HTML disabled 속성을 확인하므로 충분하나,
                스크린리더 / ARIA 접근성을 위해 aria-disabled 도 명시적으로 동기화한다. */}
            <Button
              type="button"
              variant="primary"
              data-testid="merge-convert-open"
              disabled={!mergeButtonEnabled}
              aria-disabled={!mergeButtonEnabled}
              title={
                !allSamePartner && selectedCount >= 2
                  ? '같은 거래처 주문만 병합 가능합니다'
                  : selectedCount < 2
                    ? '2건 이상 선택하세요'
                    : undefined
              }
              onClick={() => setMergeDialogOpen(true)}
            >
              판매전표로 병합 전환
            </Button>
            <Button
              type="button"
              variant="secondary"
              data-testid="merge-convert-deselect-all"
              onClick={() => setSelectedOrderNumbers(new Set())}
            >
              선택 해제
            </Button>
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
        )}
      </div>

      {/* Phase 2.6b D2: 병합 전환 모달 */}
      {mergeDialogOpen ? (
        <MergeConvertDialog
          selectedOrders={selectedOrders}
          onClose={handleMergeDialogClose}
          onSuccess={(slipNo, convertedOrderNos) => void handleMergeDialogSuccess(slipNo, convertedOrderNos)}
        />
      ) : null}
    </div>
  )
}
