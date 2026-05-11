/**
 * 전표 목록 화면 (출고/입고 공용) — slip-output-format 슬라이스 v2.
 *
 * 변경사항 (PR #18 → 본 슬라이스):
 * - 단일 `/slips` 라우트 폐기, mode prop 으로 OUTBOUND (`/sales`) / INBOUND (`/purchases`) 분리
 * - DataTable 컬럼에서 ID 컬럼 미포함 (UUID 비공개 가드)
 * - 행 클릭 시 alert 가 아닌 상세 페이지로 navigate (`/sales/:id` 또는 `/purchases/:id`)
 *
 * <h2>PR-H4c FE-B 보강 — 실시간 동기화 (입고/출고 통합)</h2>
 * <ul>
 *   <li>30초 polling refetchInterval — 멀티 워크스테이션 동기화 안전망.</li>
 *   <li>BE slip-service 는 PR-H4a 부터 entity 단위 SSE 노출 — list 화면은 단일 entityId 가
 *       없으므로 broadcast endpoint 합류 전까지 polling fallback 유지.</li>
 *   <li>헤더 우측 "실시간 자동 갱신" 안내 — UsersPage (FE-C) / InventoryAuditListPage 패턴.</li>
 * </ul>
 *
 * <h2>P0-9 보강 — INBOUND 모드 "검수" 버튼 (InboundInspectionDialog)</h2>
 * <ul>
 *   <li>INBOUND 모드이고 slip status 가 SAVED/CONFIRMED 인 행에 "검수" 버튼 노출.</li>
 *   <li>클릭 시 InboundInspectionDialog 오픈 — 검수 저장/완료 가능.</li>
 * </ul>
 *
 * <h2>DeliveryTag 필터 보강</h2>
 * <ul>
 *   <li>판매조회(OUTBOUND): 당일/야적/지방/로젠택배/경동택배/경동화물/대여/반납 8종.</li>
 *   <li>구매조회(INBOUND): 회차/반품/차용 3종.</li>
 *   <li>BE 응답에 deliveryTag 포함 시 표 컬럼에 Badge 로 표시.</li>
 * </ul>
 *
 * 사용 컴포넌트:
 * - `DataTable` (rows + columns)
 * - `SlipNumberDisplay` (uuid prop 제거됨 — 비즈니스 식별자만)
 * - `SlipStatusBadge`
 * - `Badge` (구분: 출고/입고, 배송태그)
 *
 * data-testid (PR-H4c FE-B 신규):
 * - slip-list-realtime-indicator
 * - slip-list-delivery-tag-filter
 *
 * <h2>P1-6 보강 — Excel 다운로드</h2>
 * <ul>
 *   <li>헤더 우측 "Excel 다운로드" 버튼 — `GET /api/v1/slips/export`</li>
 *   <li>파라미터: slipType (mode 연동), fromDate/toDate (현재 당월 기본값)</li>
 *   <li>data-testid: slip-list-excel-export</li>
 * </ul>
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  SlipNumberDisplay,
  SlipStatusBadge,
  type DataTableColumn,
  type DeliveryTagCode,
} from '@samhan/design-system'
import { listSlips, type SlipSummary, type SlipType } from '../api/slip'
import { useSessionStore, canCreateSlip } from '../stores/session'
import { usePageTitle } from '../hooks/usePageTitle'
import { InboundInspectionDialog } from './components/InboundInspectionDialog'
import { exportSlips } from '../api/excelExportApi'
import { useExcelDownload, makeExportFilename } from '../hooks/useExcelDownload'

export interface SlipListPageProps {
  /** OUTBOUND (판매조회) 또는 INBOUND (구매조회). */
  mode: SlipType
}

/** 판매조회(OUTBOUND) 배송태그 옵션 — BE DeliveryTagCode 8종 */
const OUTBOUND_DELIVERY_TAG_OPTIONS: { value: DeliveryTagCode; label: string }[] = [
  { value: 'DAY',                label: '당일' },
  { value: 'STACK',              label: '야적' },
  { value: 'REGION',             label: '지방' },
  { value: 'LOGEN',              label: '로젠택배' },
  { value: 'GYEONGDONG_PARCEL',  label: '경동택배' },
  { value: 'GYEONGDONG_FREIGHT', label: '경동화물' },
  { value: 'RENTAL',             label: '대여' },
  { value: 'RETURN_RENTAL',      label: '반납' },
]

/** 구매조회(INBOUND) 배송태그 옵션 — BE DeliveryTagCode 3종 */
const INBOUND_DELIVERY_TAG_OPTIONS: { value: DeliveryTagCode; label: string }[] = [
  { value: 'RETURN_TRIP', label: '회차' },
  { value: 'RETURN',      label: '반품' },
  { value: 'BORROW',      label: '차용' },
]

/**
 * deliveryTag 코드 → 한국어 라벨 변환 맵 (클라이언트 정적 fallback).
 * BE 가 deliveryTagLabel 을 별도 응답할 경우 해당 값을 우선 사용.
 */
const DELIVERY_TAG_LABEL_MAP: Record<DeliveryTagCode, string> = {
  DAY:                '당일',
  STACK:              '야적',
  REGION:             '지방',
  LOGEN:              '로젠택배',
  GYEONGDONG_PARCEL:  '경동택배',
  GYEONGDONG_FREIGHT: '경동화물',
  RENTAL:             '대여',
  RETURN_RENTAL:      '반납',
  RETURN_TRIP:        '회차',
  RETURN:             '반품',
  BORROW:             '차용',
}

export function SlipListPage({ mode }: SlipListPageProps) {
  const navigate = useNavigate()
  const role = useSessionStore((s) => s.auth?.role)
  const isOutbound = mode === 'OUTBOUND'
  const basePath = isOutbound ? '/sales' : '/purchases'
  const titleLabel = isOutbound ? '판매조회 (출고전표)' : '구매조회 (입고전표)'
  const newButtonLabel = isOutbound ? '새 출고전표' : '새 입고전표'

  // P0-9: INBOUND 모드 검수 Dialog 상태
  const [inspectionSlipId, setInspectionSlipId] = useState<string | null>(null)

  // DeliveryTag 필터 상태
  const [deliveryTagFilter, setDeliveryTagFilter] = useState<DeliveryTagCode | null>(null)

  // P1-6: Excel export
  const { downloading, download } = useExcelDownload()

  // Slice A: AppHeader 동적 화면명 (Designer wireframes.md § 1.3)
  usePageTitle(isOutbound ? '판매조회' : '구매조회')

  const query = useQuery({
    queryKey: ['slips', 'list', mode, deliveryTagFilter],
    queryFn: () =>
      listSlips({ slipType: mode, deliveryTag: deliveryTagFilter, page: 0, size: 20 }),
    // PR-H4c FE-B: 30초 polling — 멀티 워크스테이션 동기화 안전망
    refetchInterval: 30_000,
  })

  /** P0-9: INBOUND 전표에서 검수 버튼 표시 조건 — SAVED / CONFIRMED 상태. */
  const INSPECTABLE_STATUSES: readonly string[] = ['SAVED', 'CONFIRMED']

  /** mode 에 따른 배송태그 필터 옵션 목록. */
  const deliveryTagOptions = isOutbound
    ? OUTBOUND_DELIVERY_TAG_OPTIONS
    : INBOUND_DELIVERY_TAG_OPTIONS

  const columns: DataTableColumn<SlipSummary>[] = [
    {
      key: 'slipNo',
      header: '전표번호',
      width: '180px',
      render: (row) => (
        <SlipNumberDisplay
          slipDate={row.slipDate}
          seqNo={row.seqNo}
          size="sm"
        />
      ),
    },
    {
      key: 'slipType',
      header: '구분',
      width: '90px',
      render: (row) => (
        <Badge variant={row.slipType === 'OUTBOUND' ? 'brand' : 'success'}>
          {row.slipType === 'OUTBOUND' ? '출고' : '입고'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: '상태',
      width: '120px',
      render: (row) => <SlipStatusBadge status={row.status} />,
    },
    { key: 'partnerName', header: '거래처' },
    {
      key: 'deliveryTag',
      header: '배송태그',
      width: '110px',
      render: (row) => {
        if (!row.deliveryTag) return null
        const label = DELIVERY_TAG_LABEL_MAP[row.deliveryTag] ?? row.deliveryTag
        return <Badge variant="neutral">{label}</Badge>
      },
    },
    // P0-9: INBOUND 모드에서만 "검수" 액션 컬럼 표시
    ...(!isOutbound
      ? ([
          {
            key: 'id',
            header: '',
            width: '80px',
            render: (row) =>
              INSPECTABLE_STATUSES.includes(row.status) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setInspectionSlipId(row.id)
                  }}
                >
                  검수
                </Button>
              ) : null,
          },
        ] as DataTableColumn<SlipSummary>[])
      : []),
  ]

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 style={{ margin: 0 }}>{titleLabel}</h3>
          {/* PR-H4c FE-B: 실시간 자동 갱신 안내 (입고/출고 SlipListPage 통합 적용) */}
          <span
            data-testid="slip-list-realtime-indicator"
            style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            실시간 자동 갱신 · 30초
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* P1-6: 현재 mode 의 전표 전체를 당월 기준으로 export
              BE SlipController.exportXlsx(slipType, status, from, to, partnerCode) 시그니처 정렬
              — TM PR #146 cross-check (fromDate/toDate → from/to). */}
          <Button
            variant="secondary"
            size="sm"
            loading={downloading}
            disabled={downloading}
            onClick={() => {
              const now = new Date()
              const yyyy = now.getFullYear()
              const mm = String(now.getMonth() + 1).padStart(2, '0')
              download(
                () =>
                  exportSlips({
                    slipType: mode,
                    from: `${yyyy}-${mm}-01`,
                    to: `${yyyy}-${mm}-${String(new Date(yyyy, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`,
                  }),
                makeExportFilename(isOutbound ? '출고전표목록' : '입고전표목록'),
              )
            }}
            data-testid="slip-list-excel-export"
          >
            Excel 다운로드
          </Button>
          {canCreateSlip(role) ? (
            <Button variant="primary" onClick={() => navigate(`${basePath}/new`)}>
              {newButtonLabel}
            </Button>
          ) : null}
        </div>
      </div>

      {/* 배송태그 필터 — mode 별 옵션 분리 */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}
        data-testid="slip-list-delivery-tag-filter"
      >
        <span style={{ fontSize: 13, color: 'var(--color-neutral-600)', whiteSpace: 'nowrap' }}>
          배송태그
        </span>
        <select
          style={{
            fontSize: 13,
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid var(--color-neutral-300)',
            background: 'var(--color-white)',
            cursor: 'pointer',
          }}
          value={deliveryTagFilter ?? ''}
          onChange={(e) => {
            const val = e.target.value as DeliveryTagCode | ''
            setDeliveryTagFilter(val === '' ? null : val)
          }}
          aria-label="배송태그 필터"
        >
          <option value="">전체</option>
          {deliveryTagOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {deliveryTagFilter !== null ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeliveryTagFilter(null)}
          >
            초기화
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.content ?? []}
        loading={query.isLoading}
        rowKey={(slip) => slip.id}
        onRowClick={(slip) => navigate(`${basePath}/${slip.id}`)}
        emptyMessage="등록된 전표가 없습니다."
      />

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          전표 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}

      {/* P0-9: 입고 검수 Dialog (INBOUND 모드 전용) */}
      {!isOutbound && inspectionSlipId ? (
        <InboundInspectionDialog
          slipId={inspectionSlipId}
          open={!!inspectionSlipId}
          onClose={() => setInspectionSlipId(null)}
          onSuccess={() => {
            setInspectionSlipId(null)
            void query.refetch()
          }}
        />
      ) : null}
    </>
  )
}
