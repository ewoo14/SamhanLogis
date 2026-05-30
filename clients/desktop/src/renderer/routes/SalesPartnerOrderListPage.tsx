/**
 * 주문서 관리 목록 — `/sales/partner-orders` (read-only).
 *
 * <p>거래처가 보낸 주문 목록 (legacy partner-order Code.js 의 ORDER DB 결과 → SamhanLogis
 * partner-order-service M4 통합).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Input, Select } from '@samhan/design-system'
import {
  PARTNER_ORDER_STATUS_LABEL,
  listPartnerOrders,
  type PartnerOrderStatus,
} from '../api/sales'
import { formatSlipDate } from '../api/slipNumber'
import { AuditInfoBanner } from '../components/audit/AuditOverlaySection'
import { usePageTitleStore } from '../stores/pageTitle'
import { SalesSubNav } from '../components/sales/SalesSubNav'
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
const toOrderPathId = (orderNumber: string) => orderNumber.replace(/\//g, '-')

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
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [statusFilter, setStatusFilter] = useState<PartnerOrderStatus | ''>('DRAFT')
  const [searchKeyword, setSearchKeyword] = useState('')

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
  }

  const isPreConfirmStatus =
    statusFilter !== '' && PRE_CONFIRM_STATUSES.has(statusFilter as PartnerOrderStatus)

  useEffect(() => {
    setPageTitle({ title: '주문서 관리', meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  // PR-H4c: list page entity-unbound — 30s polling 으로 SSE invalidate 효과를 흉내
  // (단건 row SSE 는 SalesPartnerOrderDetailPage 진입 시 활성화).
  const query = useQuery({
    queryKey: ['partner-orders', dateFrom, dateTo, partnerId, statusFilter, searchKeyword, 0],
    queryFn: () => listPartnerOrders(0, 50, {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      partnerId: partnerId.trim() || undefined,
      status: statusFilter || undefined,
      searchKeyword: searchKeyword.trim() || undefined,
    }),
    retry: 1,
    refetchInterval: 30_000,
  })

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
          message="주문 row 를 클릭하면 상세 화면에서 변경 이력 (수정 횟수 / 복원) 을 확인할 수 있습니다. 본 목록은 30초마다 자동 갱신됩니다."
          testId="partner-order-list-audit-info-banner"
        />
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
          <table className={styles['listTable']}>
            <thead>
              <tr>
                <th>주문 번호</th>
                <th>거래처 코드</th>
                <th>거래처명</th>
                <th>발송일</th>
                <th style={{ textAlign: 'right' }}>합계</th>
                <th>상태</th>
                <th>연결 전표</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.content ?? []).map((o) => (
                <tr
                  key={o.orderNumber ?? `row-${o.partnerCode}-${o.submittedAt}`}
                  style={!o.orderNumber ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  onClick={() => {
                    if (!o.orderNumber) {
                      console.warn('[SalesPartnerOrderListPage] orderNumber 누락 row 무시', o)
                      return
                    }
                    navigate(`/sales/partner-orders/${encodeURIComponent(toOrderPathId(o.orderNumber))}`)
                  }}
                >
                  <td>{o.orderNumber}</td>
                  <td>{o.partnerCode}</td>
                  <td>{o.partnerName ?? o.partnerCode}</td>
                  <td>{ymd(o.submittedAt)}</td>
                  <td className="numeric">{krw(o.totalAmount)}원</td>
                  <td>
                    <span className={`${styles['statusBadge']} ${STATUS_CLASS[o.status]}`}>
                      {PARTNER_ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td>{o.linkedSlipNo ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
