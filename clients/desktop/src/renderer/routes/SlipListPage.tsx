/**
 * 전표 목록 화면 (출고/입고 공용) — slip-output-format 슬라이스 v2.
 *
 * <h2>[2a 영업·구매 메뉴 통합] 라우팅 변경</h2>
 * <ul>
 *   <li>기존 `/sales`, `/purchases` 진입점 → SalesQueryPage / PurchaseQueryPage 로 이전.</li>
 *   <li>본 화면은 `/sales/slips` (OUTBOUND), `/purchases/slips` (INBOUND) 로 유지 — 2c
 *       전표 작성 plumbing 합류 시 재진입점으로 활용.</li>
 *   <li>사이드바에서는 미노출 (직접 URL 진입). 모드 prop 은 그대로 OUTBOUND/INBOUND.</li>
 * </ul>
 *
 * 변경사항 (PR #18 → 본 슬라이스):
 * - 단일 `/slips` 라우트 폐기, mode prop 으로 OUTBOUND / INBOUND 분리
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
 *   <li>판매관리 legacy(OUTBOUND): 당일/야적/지방/로젠택배/경동택배/경동화물/대여/반납 8종.</li>
 *   <li>구매관리 legacy(INBOUND): 회차/반품/차용 3종.</li>
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
 *   <li>파라미터: slipType (mode 연동) + deliveryTag (화면 배송태그 필터 연동) +
 *       includeDeleted (OUTBOUND 전용, listSlips 호출과 동일). from/to 는 화면에 기간
 *       필터 UI 가 없으므로 보내지 않는다(#907 재수렴 R 에서 당월 하드코딩이 P-2 위반으로
 *       지적됨 — 화면 2,249건 vs 당월 export 224건)</li>
 *   <li>data-testid: slip-list-excel-export</li>
 * </ul>
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  SlipNumberDisplay,
  SlipStatusBadge,
  type DataTableColumn,
  type DeliveryTagCode,
} from '@samhan/design-system'
import { listSlips, restoreSlip, type SlipSummary, type SlipType } from '../api/slip'
import { extractApiErrorResponseMessage } from '../api/apiError'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { InboundInspectionDialog } from './components/InboundInspectionDialog'
import { exportSlips } from '../api/excelExportApi'
import { useExcelDownload, makeExportFilename } from '../hooks/useExcelDownload'
import { ExcelDownloadError } from '../components/ExcelDownloadError'
import { SlipListRealtimeClient } from '../realtime/SlipListRealtimeClient'
import { useCollectionRealtime } from '../realtime/useCollectionRealtime'
import './SlipListPage.css'
import {
  SLIP_DELETED_ROW_TEXT_STYLE,
  deletedSlipBadgeAriaLabel,
  deletedSlipBadgeLabel,
} from './slipDeletedRow'

export interface SlipListPageProps {
  /** OUTBOUND (판매관리 legacy) 또는 INBOUND (구매관리 legacy). */
  mode: SlipType
}

/** 판매관리 legacy(OUTBOUND) 배송태그 옵션 — BE DeliveryTagCode 8종 */
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

/** 구매관리 legacy(INBOUND) 배송태그 옵션 — BE DeliveryTagCode 4종 */
const INBOUND_DELIVERY_TAG_OPTIONS: { value: DeliveryTagCode; label: string }[] = [
  { value: 'PURCHASE',    label: '구매' },
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
  PURCHASE:           '구매',
}

// SSE 목록 동기화용 coarse 무효화 키(안정 참조 — 렌더마다 재구독 방지).
const SLIP_LIST_REALTIME_KEYS: QueryKey[] = [['slips', 'list']]

/** 삭제행 status 컬럼 aria-label 용 한국어 라벨 (SlipStatusBadge 표기 정합 — 스크린리더에 영문 enum 미노출). */
const SLIP_STATUS_KO: Record<string, string> = {
  DRAFT: '작성중',
  SAVED: '저장완료',
  SENT: '전송',
  RECEIVED: '수령',
  ACCEPTED: '수락',
  REJECTED: '반려',
  SHIPPING: '배송중',
  DELIVERED: '배송완료',
  CONFIRMED: '확정',
  CANCELED: '취소',
  CANCELLED: '취소',
}

export function SlipListPage({ mode }: SlipListPageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const isOutbound = mode === 'OUTBOUND'
  const basePath = isOutbound ? '/sales' : '/purchases'
  const titleLabel = isOutbound ? '판매전표 목록' : '입고전표 목록'
  const newButtonLabel = isOutbound ? '새 판매전표' : '새 입고전표'
  const canExport = canAccess('slip.print.export', 'download')
  // [C5-2b] canCreateSlip(role) → canAccess('sales.slip.create', 'create')
  const canCreate = canAccess('sales.slip.create', 'create')
  const canRestore = isOutbound && canAccess('sales.slip.list', 'restore')

  // P0-9: INBOUND 모드 검수 Dialog 상태
  const [inspectionSlipId, setInspectionSlipId] = useState<string | null>(null)

  // DeliveryTag 필터 상태
  const [deliveryTagFilter, setDeliveryTagFilter] = useState<DeliveryTagCode | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [page, setPage] = useState(0)

  // P1-6: Excel export
  const { downloading, download, error: downloadError } = useExcelDownload()

  // Slice A: AppHeader 동적 화면명 (Designer wireframes.md § 1.3)
  usePageTitle(isOutbound ? '판매전표 목록' : '입고전표 목록')

  // E2: 판매전표 목록 삭제/복원/수정 이벤트 수신 시 coarse key 무효화.
  useCollectionRealtime(SlipListRealtimeClient, 'list', SLIP_LIST_REALTIME_KEYS)

  useEffect(() => {
    setPage(0)
  }, [mode, deliveryTagFilter, includeDeleted])

  const query = useQuery({
    queryKey: ['slips', 'list', mode, deliveryTagFilter, includeDeleted, page],
    queryFn: () =>
      listSlips({ slipType: mode, deliveryTag: deliveryTagFilter, includeDeleted: isOutbound && includeDeleted, page, size: 20 }),
    // PR-H4c FE-B: 30초 polling — 멀티 워크스테이션 동기화 안전망
    refetchInterval: 30_000,
  })

  const [restoreError, setRestoreError] = useState<string | null>(null)
  const restoreMutation = useMutation({
    mutationFn: restoreSlip,
    onSuccess: async () => {
      setRestoreError(null)
      await queryClient.invalidateQueries({ queryKey: ['slips', 'list'] })
    },
    onError: (error) =>
      setRestoreError(
        extractApiErrorResponseMessage(error)
          ?? '복원에 실패했습니다. 전표 상태 또는 권한을 확인하세요.',
      ),
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
      mobilePriority: 'primary',
      render: (row) => (
        // 취소선은 SlipNumberDisplay(inline-flex atomic box) 자신에 직접 지정 — 조상 span 의
        // line-through 는 atomic 자손에 전파되지 않아 전표번호가 취소선 없이 렌더되던 회귀 해소.
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
          <SlipNumberDisplay
            slipDate={row.slipDate}
            seqNo={row.seqNo}
            size="sm"
            style={row.isDeleted ? SLIP_DELETED_ROW_TEXT_STYLE : undefined}
          />
          {row.isDeleted ? (
            <Badge
              variant="neutral"
              title={deletedSlipBadgeAriaLabel(row.deletedByName, row.deletedAt)}
              aria-label={deletedSlipBadgeAriaLabel(row.deletedByName, row.deletedAt)}
              data-testid={`slip-list-row-${row.slipNo}-deleted-badge`}
              style={{
                flexShrink: 0,
                maxWidth: 160,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle',
              }}
            >
              {deletedSlipBadgeLabel(row.deletedByName)}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'slipType',
      header: '구분',
      width: '90px',
      mobilePriority: 'hidden',
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
      mobilePriority: 'secondary',
      render: (row) =>
        row.isDeleted ? (
          <Badge variant="neutral" aria-label={`삭제됨 (기존 상태 ${SLIP_STATUS_KO[row.status] ?? row.status})`}>삭제됨</Badge>
        ) : (
          <SlipStatusBadge status={row.status} />
        ),
    },
    {
      key: 'partnerName',
      header: '거래처',
      mobilePriority: 'secondary',
      render: (row) => (
        <span style={row.isDeleted ? SLIP_DELETED_ROW_TEXT_STYLE : undefined}>
          {row.partnerName ?? '—'}
        </span>
      ),
    },
    {
      key: 'deliveryTag',
      header: '배송태그',
      width: '110px',
      mobilePriority: 'secondary',
      render: (row) => {
        if (!row.deliveryTag) return null
        const label = row.deliveryTagLabel ?? DELIVERY_TAG_LABEL_MAP[row.deliveryTag] ?? row.deliveryTag
        return <Badge variant="neutral">{label}</Badge>
      },
    },
    ...(isOutbound
      ? ([
          {
            key: 'id',
            header: '',
            width: '86px',
            align: 'right',
            mobilePriority: 'secondary',
            render: (row) =>
              row.isDeleted && canRestore ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={restoreMutation.isPending && restoreMutation.variables === row.id}
                  disabled={restoreMutation.isPending}
                  onClick={(event) => {
                    event.stopPropagation()
                    restoreMutation.mutate(row.id)
                  }}
                  data-testid={`slip-list-row-${row.slipNo}-restore`}
                  aria-label={`${row.slipNo} 전표 복원`}
                >
                  복원
                </Button>
              ) : null,
          },
        ] as DataTableColumn<SlipSummary>[])
      : []),
    // P0-9: INBOUND 모드에서만 "검수" 액션 컬럼 표시
    ...(!isOutbound
      ? ([
          {
            key: 'id',
            header: '',
            width: '80px',
            mobilePriority: 'secondary',
            render: (row) =>
              row.isDeleted !== true && INSPECTABLE_STATUSES.includes(row.status) ? (
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
            style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}
          >
            실시간 자동 갱신 · 30초
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* P1-6: 현재 mode 의 전표를 화면과 동일한 조건(배송태그 필터 + soft-delete 정책)으로 export.
              화면에 기간 필터 UI 가 없으므로(전량 표시, 30초 polling) from/to 는 보내지 않는다 —
              당월로 임의로 좁히면 화면에 없는 조건을 파일이 만드는 것(P-2 위반, #907 재수렴 R 에서
              발견: 화면 2,249 / 당월 export 224). BE 는 from/to 미지정 시 하한/상한 없이 조회하고
              MAX_ROWS(10,000)로 안전장치를 이미 갖는다. includeDeleted 는 화면의 listSlips 호출과
              동일하게 OUTBOUND 목록에서만 true — 삭제행(취소선) 노출 파리티. */}
          {canExport ? (
            <Button
              variant="secondary"
              size="sm"
              loading={downloading}
              disabled={downloading}
              onClick={() =>
                download(
                  () =>
                    exportSlips({
                      slipType: mode,
                      ...(deliveryTagFilter ? { deliveryTag: deliveryTagFilter } : {}),
              includeDeleted: isOutbound && includeDeleted,
                    }),
                  makeExportFilename(isOutbound ? '판매전표목록' : '입고전표목록'),
                )
              }
              data-testid="slip-list-excel-export"
            >
              Excel 다운로드
            </Button>
          ) : null}
          {canCreate ? (
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
        {isOutbound ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              data-testid="slip-list-include-deleted"
            />
            삭제 문서 포함
          </label>
        ) : null}
      </div>

      {restoreError ? (
        <div
          className="error-banner"
          role="alert"
          data-testid="slip-list-restore-error"
          style={{ marginBottom: 12, padding: 12, color: 'var(--color-danger-700)' }}
        >
          {restoreError}
        </div>
      ) : null}
      <ExcelDownloadError error={downloadError} testId="slip-list-excel-error" />

      <DataTable
        columns={columns}
        rows={query.data?.content ?? []}
        loading={query.isLoading}
        rowKey={(slip) => `${slip.id}:${slip.isDeleted ? 'D' : 'A'}`}
        rowClickable={(slip) => slip.isDeleted !== true}
        rowClassName={(slip) => (slip.isDeleted ? 'slip-list-deleted-row' : undefined)}
        onRowClick={(slip) => {
          if (slip.isDeleted === true) return
          navigate(`${basePath}/${slip.id}`)
        }}
        emptyMessage="등록된 전표가 없습니다."
      />

      {query.data && query.data.totalPages > 1 ? (
        <div data-testid="slip-list-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <Button
            variant="secondary"
            size="sm"
            data-testid="slip-list-previous-page"
            disabled={page === 0 || query.isFetching}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            이전
          </Button>
          <span data-testid="slip-list-page-indicator">{page + 1} / {query.data.totalPages}</span>
          <Button
            variant="secondary"
            size="sm"
            data-testid="slip-list-next-page"
            disabled={page + 1 >= query.data.totalPages || query.isFetching}
            onClick={() => setPage((current) => Math.min(query.data!.totalPages - 1, current + 1))}
          >
            다음
          </Button>
        </div>
      ) : null}

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
