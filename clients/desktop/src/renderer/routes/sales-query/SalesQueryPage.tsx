/**
 * 판매관리 (매출 전표) — 출고전표 다중 선택 + 날짜 범위 + 검색 모달 + 50/page pagination.
 *
 * SP-08-6-1 R1/R2 매출 목록·상세 슬라이스.
 * - slipType: 'OUTBOUND' (BE OUTBOUND = 출고 = 매출)
 * - 권한 가드: canQuerySales (SALES / MANAGER / MASTER)
 * - CTA 자리 표시: 출고 전환 / 거래명세서 출력 / 계산서 출력 (실 핸들러는 SP-08-6-4)
 *
 * 컬럼 20개 (슬립 #17 판매관리 명세 + SP-05 상세 진입 + 상태):
 *  1. 체크박스 (다중 선택 + 전체 선택)
 *  2. 순번 (slipDate desc 기준 row index)
 *  3. 판매번호 (slipNo)
 *  4. 거래처 (partnerName)
 *  5. 거래처코드 (businessNumber — 사업자등록번호)
 *  6. 배송주소 (deliveryAddress)
 *  7. 품목 (BE lineSummary 없음 → 임시 "—")
 *  8. 특이사항 (memo)
 *  9. 금액 (totalAmount — 우측, 천 단위 콤마)
 * 10. 출고창고 (sourceWarehouseId → warehousesQuery cache resolve)
 * 11. 출고일자 (slipDate)
 * 12. 인수자 번호 (recipientPhone)
 * 13. 전표수정내역 (editHistoryCount — "0" 또는 "N건")
 * 14. 감리주소 (supervisionAddress)
 * 15. 프로젝트명 (projectName)
 * 16. 담당자명 (salesPersonName)
 * 17. 인쇄 (printed → Badge)
 * 18. 입금예정일 (paymentDueDate)
 * 19. 상태 (status → Badge)
 * 20. 상세 (상세보기 버튼)
 *
 * UUID 비공개 가드: slipNo / businessNumber / partnerCode 만 사용자 노출.
 * id / sourceWarehouseId 는 내부 처리 전용.
 */
import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Modal, Input, FormField, DataGrid, type DataGridColumn } from '@samhan/design-system'
import { querySlips, deleteSalesSlip, type SlipQueryRow } from '../../api/slip'
import { listWarehouses, type Warehouse } from '../../api/inventory'
import { useSessionStore, canQuerySales } from '../../stores/session'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'
import { exportSlips } from '../../api/excelExportApi'
import { useExcelDownload, makeExportFilename } from '../../hooks/useExcelDownload'
import { ExcelDownloadError } from '../../components/ExcelDownloadError'
import axios from 'axios'

const PAGE_SIZE = 50

/** 전표 상태 한국어 라벨 — PurchaseQueryPage 와 동일 맵 */
const SLIP_STATUS_LABEL: Record<string, string> = {
  DRAFT: '임시저장',
  SAVED: '저장완료',
  SENT: '전송',
  ACCEPTED: '수락',
  PROCESSING: '처리중',
  INSPECTING: '검수중',
  COMPLETED: '완료',
  SHIPPING: '배송중',
  DELIVERED: '배송완료',
  CONFIRMED: '확정',
  REJECTED: '반려',
  CANCELED: '취소',
}

/** 전표 상태별 Badge variant 분기 — design-system BadgeVariant: brand | neutral | success | warning | danger */
function statusBadgeVariant(status: string): 'brand' | 'neutral' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'SAVED':      return 'brand'
    case 'SHIPPING':   return 'brand'
    case 'SENT':       return 'warning'
    case 'ACCEPTED':   return 'success'
    case 'COMPLETED':  return 'success'
    case 'CONFIRMED':  return 'success'
    case 'CANCELED':   return 'danger'
    case 'REJECTED':   return 'danger'
    default:           return 'neutral'
  }
}

/** 출고 전환 가능 상태 — SAVED / CONFIRMED */
const SHIPPABLE_STATUSES = ['SAVED', 'CONFIRMED'] as const

/** SP-08-6-2: 매출 직접 수정 가능 상태 — SAVED / DRAFT */
const SALES_EDITABLE_STATUSES = ['SAVED', 'DRAFT'] as const

/** SP-08-6-3: 매출 soft delete 가능 상태 — SAVED / DRAFT */
const SALES_DELETABLE_STATUSES = ['SAVED', 'DRAFT'] as const

function isShippable(row: SlipQueryRow): boolean {
  return SHIPPABLE_STATUSES.includes(row.status as (typeof SHIPPABLE_STATUSES)[number])
}

/** SP-08-6-2: 매출 직접 수정 가능 여부 (SAVED / DRAFT) */
function isSalesEditable(row: SlipQueryRow): boolean {
  return SALES_EDITABLE_STATUSES.includes(row.status as (typeof SALES_EDITABLE_STATUSES)[number])
}

/** SP-08-6-3: 매출 soft delete 가능 여부 (SAVED / DRAFT) */
function isSalesDeletable(row: SlipQueryRow): boolean {
  return SALES_DELETABLE_STATUSES.includes(row.status as (typeof SALES_DELETABLE_STATUSES)[number])
}

/** YYYY-MM-DD 포맷 (Asia/Seoul 로케일 Date API) */
function toSeoulDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

/** 날짜 preset 계산 — Date API 기반 (dayjs 의존성 없이) */
function getPreset(preset: 'thisMonth' | 'lastMonth' | 'thisWeek'): { from: string; to: string } {
  const nowSeoul = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const y = nowSeoul.getFullYear()
  const m = nowSeoul.getMonth()

  if (preset === 'thisMonth') {
    const from = new Date(y, m, 1)
    const to   = new Date(y, m + 1, 0)
    return { from: toSeoulDateStr(from), to: toSeoulDateStr(to) }
  }
  if (preset === 'lastMonth') {
    const from = new Date(y, m - 1, 1)
    const to   = new Date(y, m, 0)
    return { from: toSeoulDateStr(from), to: toSeoulDateStr(to) }
  }
  // thisWeek — 일요일 기준
  const dow  = nowSeoul.getDay()
  const from = new Date(y, m, nowSeoul.getDate() - dow)
  const to   = new Date(y, m, nowSeoul.getDate() + (6 - dow))
  return { from: toSeoulDateStr(from), to: toSeoulDateStr(to) }
}

/** 금액 천 단위 콤마 포맷 */
function fmtAmount(n: number): string {
  return n.toLocaleString('ko-KR')
}

/** 전표수정내역 표시 */
function fmtEditCount(n: number): string {
  return n === 0 ? '0' : `${n}건`
}

/** 창고 UUID → name 해석 */
function resolveWarehouseName(id: string | null, warehouses: Warehouse[]): string {
  if (!id) return '—'
  const found = warehouses.find((w) => w.id === id)
  return found?.name ?? '—'
}

function toPublicTestId(value: string): string {
  return value.replace(/[^a-zA-Z0-9가-힣_-]/g, '-')
}

/** 검색 폼 상태 */
interface SearchForm {
  searchSlipNo: string
  searchPartnerName: string
  searchBusinessNumber: string
  searchDeliveryAddress: string
  searchProjectName: string
}

const EMPTY_SEARCH: SearchForm = {
  searchSlipNo: '',
  searchPartnerName: '',
  searchBusinessNumber: '',
  searchDeliveryAddress: '',
  searchProjectName: '',
}

export function SalesQueryPage() {
  usePageTitle('매출 전표')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const auth = useSessionStore((s) => s.auth)
  const { canAccess } = usePermissions()
  const canCreate = canAccess('sales.slip.create', 'create')
  const canExport = canAccess('slip.print.export', 'download')
  // [C5 follow-up] BE SlipSalesAccessGuard 는 SALES/MANAGER/MASTER 만 허용 — seed 보다 좁음.
  // role 문자열 fallback 대신 V43 빌트인 role-group UUID 로 판정한다.
  const canQuery = canQuerySales(auth)
  /** SP-08-6-2: 매출 직접 수정 권한 — 동적 권한(canAccess) */
  const canEditSales = canAccess('sales.slip.edit', 'update')
  /** SP-08-6-3: 매출 soft delete 권한 — 동적 권한(canAccess) */
  const canDeleteSales = canAccess('sales.slip.edit', 'delete')

  // ── 날짜 범위 (기본: 오늘 ±15일, Asia/Seoul) ──
  const defaultFrom = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
    d.setDate(d.getDate() - 15)
    return toSeoulDateStr(d)
  })()
  const defaultTo = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
    d.setDate(d.getDate() + 15)
    return toSeoulDateStr(d)
  })()
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo]     = useState(defaultTo)

  // ── 페이지 ──
  const [page, setPage] = useState(0)

  // ── 검색 상태 (확정 파라미터 vs 모달 draft) ──
  const [appliedSearch, setAppliedSearch] = useState<SearchForm>(EMPTY_SEARCH)
  const [draftSearch, setDraftSearch]     = useState<SearchForm>(EMPTY_SEARCH)
  const [searchModalOpen, setSearchModalOpen] = useState(false)

  // ── 다중 선택 ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── SP-08-6-3: 매출 soft delete modal state ──
  const [salesDeleteOpen, setSalesDeleteOpen] = useState(false)
  const [salesDeleteTargetRow, setSalesDeleteTargetRow] = useState<SlipQueryRow | null>(null)
  const [salesDeleteConflict, setSalesDeleteConflict] = useState(false)
  const [salesDeleteShippedAlert, setSalesDeleteShippedAlert] = useState<string | null>(null)
  const [salesDeleteForbiddenAlert, setSalesDeleteForbiddenAlert] = useState<string | null>(null)
  const [salesDeleteErrorAlert, setSalesDeleteErrorAlert] = useState<string | null>(null)

  // ── Excel export ──
  const { downloading, download, error: downloadError } = useExcelDownload()

  // ── 창고 목록 (sourceWarehouseId resolve) ──
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(),
    staleTime: 5 * 60 * 1000,
  })
  const warehouses: Warehouse[] = warehousesQuery.data ?? []

  // ── 판매관리 데이터 ──
  const slipsQuery = useQuery({
    queryKey: ['slips', 'query', 'OUTBOUND', dateFrom, dateTo, page, appliedSearch],
    queryFn: () =>
      querySlips({
        slipType: 'OUTBOUND',
        dateFrom,
        dateTo,
        page,
        size: PAGE_SIZE,
        ...(appliedSearch.searchSlipNo         ? { searchSlipNo:         appliedSearch.searchSlipNo }         : {}),
        ...(appliedSearch.searchPartnerName    ? { searchPartnerName:    appliedSearch.searchPartnerName }    : {}),
        ...(appliedSearch.searchBusinessNumber ? { searchBusinessNumber: appliedSearch.searchBusinessNumber } : {}),
        ...(appliedSearch.searchDeliveryAddress? { searchDeliveryAddress:appliedSearch.searchDeliveryAddress }: {}),
        ...(appliedSearch.searchProjectName    ? { searchProjectName:    appliedSearch.searchProjectName }    : {}),
      }),
  })

  const rows: SlipQueryRow[]  = slipsQuery.data?.content ?? []
  const totalPages             = slipsQuery.data?.totalPages ?? 1
  const totalElements          = slipsQuery.data?.totalElements ?? 0

  // ── SP-08-6-3: 매출 soft delete mutation ──
  const deleteSalesSlipMutation = useMutation({
    mutationFn: () => {
      if (!salesDeleteTargetRow) throw new Error('삭제 대상 전표 없음')
      return deleteSalesSlip(salesDeleteTargetRow.id, salesDeleteTargetRow.updatedAt)
    },
    onSuccess: () => {
      setSalesDeleteOpen(false)
      setSalesDeleteConflict(false)
      setSalesDeleteShippedAlert(null)
      setSalesDeleteForbiddenAlert(null)
      setSalesDeleteErrorAlert(null)
      setSalesDeleteTargetRow(null)
      setSelectedIds(new Set())
      void queryClient.invalidateQueries({ queryKey: ['slips', 'query', 'OUTBOUND'] })
      void queryClient.invalidateQueries({ queryKey: ['slips'] })
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status === 409) {
          setSalesDeleteConflict(true)
          return
        }
        if (status === 422) {
          setSalesDeleteShippedAlert('출고 완료된 매출 전표는 삭제할 수 없습니다')
          return
        }
        if (status === 403) {
          setSalesDeleteForbiddenAlert('매출 전표 삭제 권한이 없습니다.')
          return
        }
      }
      setSalesDeleteErrorAlert('매출 전표 삭제에 실패했습니다.')
    },
  })

  // ── Excel-like DataGrid 보기 모드 토글 ──
  const [gridMode, setGridMode] = useState(false)

  /** DataGrid 열 정의 (행 선택 체크박스 열 제외 — DataGrid 자체 셀 선택 사용) */
  const dataGridColumns: DataGridColumn<SlipQueryRow>[] = useMemo(
    () => [
      { key: 'slipNo',            label: '판매번호',    filter: 'text' },
      { key: 'partnerName',       label: '거래처',      filter: 'text' },
      { key: 'businessNumber',    label: '거래처코드',   filter: 'text' },
      { key: 'deliveryAddress',   label: '배송주소',    filter: 'text' },
      { key: 'memo',              label: '특이사항',    filter: 'text' },
      { key: 'totalAmount',       label: '금액',        align: 'right' as const, filter: false as const,
        format: (v: unknown) => typeof v === 'number' ? v.toLocaleString('ko-KR') : '—' },
      { key: 'sourceWarehouseId', label: '출고창고',    filter: 'select' as const,
        format: (v: unknown) => typeof v === 'string' ? resolveWarehouseName(v, warehouses) : '—' },
      { key: 'recipientPhone',    label: '인수자 번호', filter: 'text' },
      { key: 'editHistoryCount',  label: '전표수정내역', filter: false as const,
        format: (v: unknown) => typeof v === 'number' ? fmtEditCount(v) : '—' },
      { key: 'supervisionAddress', label: '감리주소',   filter: 'text' },
      { key: 'projectName',       label: '프로젝트명',  filter: 'text' },
      { key: 'salesPersonName',   label: '담당자명',    filter: 'text' },
      { key: 'printed',           label: '인쇄',        filter: 'select' as const,
        format: (v: unknown) => v ? '완료' : '미완' },
      { key: 'paymentDueDate',    label: '입금예정일',  filter: 'text' },
      { key: 'slipDate',          label: '출고일자',    filter: 'text' },
      { key: 'status',            label: '상태',        filter: 'select' as const,
        format: (v: unknown) => typeof v === 'string' ? (SLIP_STATUS_LABEL[v] ?? v) : '—' },
      {
        key: 'detailAction',
        label: '상세',
        width: 72,
        align: 'center' as const,
        filter: false as const,
        render: (row: SlipQueryRow) => (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/sales/${row.id}`)
            }}
            aria-label={`${row.slipNo} 상세 보기`}
            data-testid={`sales-query-detail-${toPublicTestId(row.slipNo)}`}
          >
            상세
          </Button>
        ),
      },
    ],
    [navigate, warehouses],
  )
  // 체크박스(1)+순번(2)+판매번호(3)+거래처(4)+거래처코드(5)+배송주소(6)+품목(7)
  // +특이사항(8)+금액(9)+출고창고(10)+출고일자(11)+인수자번호(12)+전표수정내역(13)
  // +감리주소(14)+프로젝트명(15)+담당자명(16)+인쇄(17)+입금예정일(18)+상태(19)+상세(20)
  const tableColumnCount = 20

  // ── 전체선택 (현재 페이지) ──
  const allPageIds   = useMemo(() => rows.map((r) => r.id), [rows])
  const allSelected  = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id))
  const someSelected = allPageIds.some((id) => selectedIds.has(id))

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        allPageIds.forEach((id) => next.delete(id))
      } else {
        allPageIds.forEach((id) => next.add(id))
      }
      return next
    })
  }, [allSelected, allPageIds])

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── 검색 모달 동작 ──
  const openSearchModal = () => {
    setDraftSearch({ ...appliedSearch })
    setSearchModalOpen(true)
  }

  const applySearch = () => {
    setAppliedSearch({ ...draftSearch })
    setPage(0)
    setSelectedIds(new Set())
    setSearchModalOpen(false)
  }

  const resetSearch = () => {
    setDraftSearch(EMPTY_SEARCH)
    setAppliedSearch(EMPTY_SEARCH)
    setPage(0)
    setSelectedIds(new Set())
    setSearchModalOpen(false)
  }

  // ── 날짜 preset ──
  const applyPreset = (preset: 'thisMonth' | 'lastMonth' | 'thisWeek') => {
    const { from, to } = getPreset(preset)
    setDateFrom(from)
    setDateTo(to)
    setPage(0)
    setSelectedIds(new Set())
  }

  // ── 권한 없는 역할 접근 차단 ──
  if (!canQuery) {
    return (
      <div role="alert" style={{ padding: 32, fontSize: 14, color: 'var(--color-danger-600)' }}>
        매출 전표 조회 권한이 없습니다. (SALES / MANAGER / MASTER 역할 필요)
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── 툴바 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* 날짜 범위 */}
        <label style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>기간</label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
          aria-label="시작 날짜"
          inputSize="sm"
          fullWidth={false}
        />
        <span style={{ fontSize: 13 }}>~</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
          aria-label="종료 날짜"
          inputSize="sm"
          fullWidth={false}
        />

        {/* preset 버튼 */}
        <Button variant="ghost" size="sm" onClick={() => applyPreset('thisMonth')}>이번달</Button>
        <Button variant="ghost" size="sm" onClick={() => applyPreset('lastMonth')}>지난달</Button>
        <Button variant="ghost" size="sm" onClick={() => applyPreset('thisWeek')}>이번주</Button>

        <div style={{ flex: 1 }} />

        {/* 선택 행 안내 */}
        {selectedIds.size > 0 ? (
          <span
            data-testid="sales-query-selected-count"
            style={{ fontSize: 13, color: 'var(--color-brand-600)' }}
          >
            {selectedIds.size}행 선택됨
          </span>
        ) : null}

        {/* 일괄 인쇄 (선택 행) */}
        {selectedIds.size > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // 인쇄: 현재 선택 행 slipNo 목록 — 실 구현은 print window 활용
              window.print()
            }}
            data-testid="sales-query-print-selected"
          >
            인쇄
          </Button>
        ) : null}

        {/* ─ 단일 행 선택 시 CTA ─ */}
        {selectedIds.size === 1 ? (
          <>
            {/* SP-08-6-2: 수정 — SAVED/DRAFT 상태 + SALES/MANAGER/MASTER 권한 활성 */}
            {(() => {
              const selectedRow = rows.find((r) => selectedIds.has(r.id))
              return selectedRow && canEditSales && isSalesEditable(selectedRow) ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/sales/${selectedRow.id}`)
                  }}
                  data-testid="sales-slip-edit-button"
                  aria-label={`${selectedRow.slipNo} 수정`}
                >
                  수정
                </Button>
              ) : null
            })()}
            {/* SP-08-6-3: 삭제 — SAVED/DRAFT 상태 + SALES/MANAGER/MASTER 권한 활성 */}
            {(() => {
              const selectedRow = rows.find((r) => selectedIds.has(r.id))
              return selectedRow && canDeleteSales && isSalesDeletable(selectedRow) ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSalesDeleteConflict(false)
                    setSalesDeleteShippedAlert(null)
                    setSalesDeleteTargetRow(selectedRow)
                    setSalesDeleteOpen(true)
                  }}
                  data-testid="sales-slip-delete-button"
                  aria-label={`${selectedRow.slipNo} 삭제`}
                >
                  삭제
                </Button>
              ) : null
            })()}
            {/* 출고 전환 — SAVED / CONFIRMED 상태 전표만 활성 (SP-08-6-4 에서 연결 예정) */}
            {(() => {
              const selectedRow = rows.find((r) => selectedIds.has(r.id))
              return selectedRow && isShippable(selectedRow) ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled
                  title="출고 전환 기능은 SP-08-6-4 에서 연결 예정"
                  data-testid="sales-query-ship-btn"
                >
                  출고 전환
                </Button>
              ) : null
            })()}
            {/* SP-08-6-4: 거래명세서 출력 — /sales/:id/print/statement */}
            {(() => {
              const selectedRow = rows.find((r) => selectedIds.has(r.id))
              const singleSelected = selectedIds.size === 1 && !!selectedRow
              return (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!singleSelected}
                  title={singleSelected ? undefined : '단일 전표를 선택해주세요'}
                  data-testid="sales-query-statement-print-btn"
                  onClick={() => {
                    if (selectedRow) navigate(`/sales/${selectedRow.id}/print/statement`)
                  }}
                >
                  거래명세서 출력
                </Button>
              )
            })()}
            {/* SP-08-6-4: 계산서 출력 — /sales/:id/print/invoice */}
            {(() => {
              const selectedRow = rows.find((r) => selectedIds.has(r.id))
              const singleSelected = selectedIds.size === 1 && !!selectedRow
              return (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!singleSelected}
                  title={singleSelected ? undefined : '단일 전표를 선택해주세요'}
                  data-testid="sales-query-invoice-print-btn"
                  onClick={() => {
                    if (selectedRow) navigate(`/sales/${selectedRow.id}/print/invoice`)
                  }}
                >
                  계산서 출력
                </Button>
              )
            })()}
          </>
        ) : null}

        {/* Excel 다운로드 — BE export endpoint 는 MANAGER/MASTER 전용.
            화면 검색모달(appliedSearch) 을 export 에도 그대로 전달 — 화면에 좁힌 조건이
            파일에도 동일하게 적용되어야 한다(P-1). 누락 시 화면에서 검색해도 파일은 전체가
            나오는 결함(#907 재수렴 R로 발견). */}
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
                    slipType: 'OUTBOUND',
                    from: dateFrom,
                    to: dateTo,
                    ...(appliedSearch.searchSlipNo         ? { searchSlipNo:         appliedSearch.searchSlipNo }         : {}),
                    ...(appliedSearch.searchPartnerName    ? { searchPartnerName:    appliedSearch.searchPartnerName }    : {}),
                    ...(appliedSearch.searchBusinessNumber ? { searchBusinessNumber: appliedSearch.searchBusinessNumber } : {}),
                    ...(appliedSearch.searchDeliveryAddress? { searchDeliveryAddress:appliedSearch.searchDeliveryAddress }: {}),
                    ...(appliedSearch.searchProjectName    ? { searchProjectName:    appliedSearch.searchProjectName }    : {}),
                  }),
                makeExportFilename('판매관리'),
              )
            }
            data-testid="sales-query-excel-download"
          >
            Excel 다운로드
          </Button>
        ) : null}

        {/* 검색 모달 열기 */}
        <Button
          variant="secondary"
          size="sm"
          onClick={openSearchModal}
          data-testid="sales-query-search-btn"
        >
          검색
        </Button>

        {/* [2c 신규 전표 진입점] 권한 보유자만 노출 — SlipFormPage(/sales/new) 로 이동.
            2a 통합 후 SalesQueryPage 가 /sales 정식 진입점이 되었으므로 신규 출고전표
            작성 흐름이 사라지지 않도록 본 버튼이 필수. */}
        {canCreate ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/sales/new')}
            data-testid="sales-query-new-slip-btn"
          >
            신규 판매전표
          </Button>
        ) : null}

        {/* Excel-like DataGrid 보기 토글 */}
        <Button
          variant={gridMode ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setGridMode((v) => !v)}
          data-testid="sales-query-grid-mode-btn"
          title="열헤더 필터 + 다중 셀 선택 + Ctrl+C 복사"
        >
          {gridMode ? '기본 보기' : 'Excel 보기'}
        </Button>
      </div>

      {/* ── 총 건수 ── */}
      <div style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
        총 {totalElements.toLocaleString('ko-KR')}건
        {slipsQuery.isLoading ? ' · 로딩 중...' : ''}
      </div>
      <ExcelDownloadError error={downloadError} testId="sales-query-excel-error" />

      {/* ── DataGrid 보기 (Excel-like: 열헤더 필터 + 다중 셀 선택 + Ctrl+C) ── */}
      {gridMode ? (
        <div style={{ height: 520 }} data-testid="sales-query-datagrid">
          <DataGrid<SlipQueryRow>
            columns={dataGridColumns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={slipsQuery.isLoading}
            emptyMessage="조회된 판매 전표가 없습니다."
            enableMultiSelect
            enableCopy
          />
        </div>
      ) : null}

      {/* ── 테이블 (기본 보기) ── */}
      {!gridMode ? (
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            tableLayout: 'auto',
          }}
          data-testid="sales-query-table"
        >
          <thead>
            <tr style={{ background: 'var(--color-neutral-50)', borderBottom: '2px solid var(--color-neutral-200)' }}>
              <Th width="36px">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                  data-testid="sales-query-select-all"
                />
              </Th>
              <Th width="48px">순번</Th>
              <Th width="130px">판매번호</Th>
              <Th width="130px">거래처</Th>
              <Th width="120px">거래처코드</Th>
              <Th width="180px">배송주소</Th>
              <Th width="120px">품목</Th>
              <Th width="160px">특이사항</Th>
              <Th width="100px" align="right">금액</Th>
              <Th width="100px">출고창고</Th>
              <Th width="100px">출고일자</Th>
              <Th width="120px">인수자번호</Th>
              <Th width="90px">전표수정내역</Th>
              <Th width="160px">감리주소</Th>
              <Th width="140px">프로젝트명</Th>
              <Th width="90px">담당자명</Th>
              <Th width="70px">인쇄</Th>
              <Th width="100px">입금예정일</Th>
              <Th width="86px">상태</Th>
              <Th width="72px" align="center">상세</Th>
            </tr>
          </thead>
          <tbody>
            {slipsQuery.isLoading ? (
              <tr>
                <td colSpan={tableColumnCount} style={{ textAlign: 'center', padding: 32, color: 'var(--color-neutral-400)' }}>
                  로딩 중...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={tableColumnCount} style={{ textAlign: 'center', padding: 32, color: 'var(--color-neutral-400)' }}>
                  조회된 판매 전표가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const isSelected = selectedIds.has(row.id)
                const rowIndex   = page * PAGE_SIZE + idx + 1
                return (
                  <tr
                    key={row.id}
                    onClick={() => toggleRow(row.id)}
                    style={{
                      background: isSelected ? 'var(--color-brand-50, #EFF6FB)' : undefined,
                      borderBottom: '1px solid var(--color-neutral-100)',
                      cursor: 'pointer',
                    }}
                    data-testid={`sales-query-row-${row.slipNo}`}
                  >
                    <Td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${row.slipNo} 선택`}
                      />
                    </Td>
                    {/* 순번 */}
                    <Td align="center">{rowIndex}</Td>
                    {/* 판매번호 — UUID 비공개: slipNo 만 표시 */}
                    <Td>{row.slipNo}</Td>
                    {/* 거래처 */}
                    <Td>{row.partnerName ?? '—'}</Td>
                    {/* 거래처코드 = businessNumber (사업자등록번호) */}
                    <Td>{row.businessNumber ?? '—'}</Td>
                    {/* 배송주소 */}
                    <Td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.deliveryAddress ?? '—'}
                    </Td>
                    {/* 품목 — BE lineSummary 없음 → 임시 "—" */}
                    <Td>—</Td>
                    {/* 특이사항 */}
                    <Td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.memo ?? '—'}
                    </Td>
                    {/* 금액 — 우측 정렬 */}
                    <Td align="right">{fmtAmount(row.displayTotalAmount ?? row.totalAmount)}</Td>
                    {/* 출고창고 — sourceWarehouseId resolve */}
                    <Td>{resolveWarehouseName(row.sourceWarehouseId, warehouses)}</Td>
                    {/* 출고일자 */}
                    <Td>{row.slipDate ?? '—'}</Td>
                    {/* 인수자 번호 */}
                    <Td>{row.recipientPhone ?? '—'}</Td>
                    {/* 전표수정내역 */}
                    <Td align="center">{fmtEditCount(row.editHistoryCount)}</Td>
                    {/* 감리주소 */}
                    <Td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.supervisionAddress ?? '—'}
                    </Td>
                    {/* 프로젝트명 */}
                    <Td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.projectName ?? '—'}
                    </Td>
                    {/* 담당자명 */}
                    <Td>{row.salesPersonName ?? '—'}</Td>
                    {/* 인쇄 Badge */}
                    <Td align="center">
                      {row.printed
                        ? <Badge variant="success">인쇄</Badge>
                        : <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
                      }
                    </Td>
                    {/* 입금예정일 */}
                    <Td>{row.paymentDueDate ?? '—'}</Td>
                    {/* 상태 Badge — 상태별 variant 분기 */}
                    <Td align="center">
                      <Badge
                        variant={statusBadgeVariant(row.status)}
                        data-testid={`sales-query-status-badge-${toPublicTestId(row.slipNo)}`}
                      >
                        {SLIP_STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                    </Td>
                    {/* 상세 + CTA (SP-08-6-4 핸들러 연결 예정) */}
                    <Td align="center">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/sales/${row.id}`)
                          }}
                          aria-label={`${row.slipNo} 상세 보기`}
                          data-testid={`sales-query-detail-${toPublicTestId(row.slipNo)}`}
                        >
                          상세
                        </Button>
                      </div>
                    </Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      ) : null}

      {/* ── 에러 ── */}
      {slipsQuery.isError ? (
        <div role="alert" style={{ color: 'var(--color-danger-600)', fontSize: 13 }}>
          판매 전표 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}

      {/* ── 페이지네이션 ── */}
      {totalPages > 1 && !gridMode ? (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          onPageChange={(p) => { setPage(p); setSelectedIds(new Set()) }}
        />
      ) : null}

      {/* ── 검색 모달 ── */}
      <Modal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        title="판매 검색"
        size="md"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={resetSearch} data-testid="sales-query-search-reset">
              초기화
            </Button>
            <Button variant="secondary" onClick={() => setSearchModalOpen(false)}>
              취소
            </Button>
            <Button variant="primary" onClick={applySearch} data-testid="sales-query-search-apply">
              조회
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormField
            label="판매번호"
            render={({ id }) => (
              <Input
                id={id}
                value={draftSearch.searchSlipNo}
                onChange={(e) => setDraftSearch((d) => ({ ...d, searchSlipNo: e.target.value }))}
                placeholder="예: 2026/05/10-1"
                data-testid="sales-query-search-slipno"
              />
            )}
          />
          <FormField
            label="거래처명"
            render={({ id }) => (
              <Input
                id={id}
                value={draftSearch.searchPartnerName}
                onChange={(e) => setDraftSearch((d) => ({ ...d, searchPartnerName: e.target.value }))}
                placeholder="예: 삼성물산"
                data-testid="sales-query-search-partner-name"
              />
            )}
          />
          <FormField
            label="거래처코드 (사업자번호)"
            render={({ id }) => (
              <Input
                id={id}
                value={draftSearch.searchBusinessNumber}
                onChange={(e) => setDraftSearch((d) => ({ ...d, searchBusinessNumber: e.target.value }))}
                placeholder="예: 123-45-67890"
                data-testid="sales-query-search-business-number"
              />
            )}
          />
          <FormField
            label="배송주소"
            render={({ id }) => (
              <Input
                id={id}
                value={draftSearch.searchDeliveryAddress}
                onChange={(e) => setDraftSearch((d) => ({ ...d, searchDeliveryAddress: e.target.value }))}
                placeholder="예: 서울 강남"
                data-testid="sales-query-search-delivery-address"
              />
            )}
          />
          <FormField
            label="프로젝트명"
            render={({ id }) => (
              <Input
                id={id}
                value={draftSearch.searchProjectName}
                onChange={(e) => setDraftSearch((d) => ({ ...d, searchProjectName: e.target.value }))}
                placeholder="예: 잠실 주상복합"
                data-testid="sales-query-search-project-name"
              />
            )}
          />
        </div>
      </Modal>

      {/*
        SP-08-6-3: 매출 전표 삭제 확인 modal.
        - UUID 비공개 가드: slipNo 만 표시 (id 미노출).
        - 409 충돌 시 "최신 내용 불러오기" 배너 표시.
        - 422 SHIPPED 시 삭제 불가 안내.
      */}
      <Modal
        open={salesDeleteOpen}
        onClose={() => {
          if (!deleteSalesSlipMutation.isPending) {
            setSalesDeleteOpen(false)
            setSalesDeleteConflict(false)
            setSalesDeleteShippedAlert(null)
            setSalesDeleteForbiddenAlert(null)
            setSalesDeleteErrorAlert(null)
            setSalesDeleteTargetRow(null)
          }
        }}
        title="매출 전표 삭제"
        size="sm"
        data-testid="sales-slip-delete-confirm"
        footer={(
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSalesDeleteOpen(false)
                setSalesDeleteConflict(false)
                setSalesDeleteShippedAlert(null)
                setSalesDeleteForbiddenAlert(null)
                setSalesDeleteErrorAlert(null)
                setSalesDeleteTargetRow(null)
              }}
              disabled={deleteSalesSlipMutation.isPending}
              data-testid="sales-slip-delete-confirm-no"
            >
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteSalesSlipMutation.isPending}
              disabled={
                deleteSalesSlipMutation.isPending ||
                salesDeleteShippedAlert !== null ||
                salesDeleteForbiddenAlert !== null
              }
              onClick={() => {
                if (deleteSalesSlipMutation.isPending) return
                setSalesDeleteShippedAlert(null)
                setSalesDeleteConflict(false)
                setSalesDeleteForbiddenAlert(null)
                setSalesDeleteErrorAlert(null)
                deleteSalesSlipMutation.mutate()
              }}
              data-testid="sales-slip-delete-confirm-yes"
            >
              삭제
            </Button>
          </>
        )}
      >
        <Card padding={4} shadow="none">
          <p style={{ margin: 0, marginBottom: 8, fontSize: 15 }}>
            정말 삭제하시겠습니까?
          </p>
          <p
            style={{
              margin: 0,
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--color-neutral-600)',
            }}
          >
            전표번호: <strong>{salesDeleteTargetRow?.slipNo ?? '—'}</strong>
            <br />
            거래처: <strong>{salesDeleteTargetRow?.partnerName ?? '-'}</strong>
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-danger-600)' }}>
            삭제된 전표는 복구할 수 없습니다.
          </p>
          {salesDeleteShippedAlert && (
            <div
              className="danger-banner"
              role="alert"
              data-testid="sales-slip-delete-shipped-banner"
              style={{ marginTop: 12 }}
            >
              <strong>삭제 불가</strong>
              <p style={{ margin: '4px 0 0 0' }}>출고 진행 중이거나 완료된 매출 전표는 삭제할 수 없습니다.</p>
            </div>
          )}
          {salesDeleteForbiddenAlert && (
            <div
              className="danger-banner"
              role="alert"
              data-testid="sales-slip-delete-forbidden-banner"
              style={{ marginTop: 12 }}
            >
              {salesDeleteForbiddenAlert}
            </div>
          )}
          {salesDeleteErrorAlert && (
            <div
              className="danger-banner"
              role="alert"
              data-testid="sales-slip-delete-error-banner"
              style={{ marginTop: 12 }}
            >
              {salesDeleteErrorAlert}
            </div>
          )}
          {salesDeleteConflict ? (
            <div
              className="danger-banner"
              role="alert"
              data-testid="sales-slip-delete-conflict-banner"
              style={{ marginTop: 12 }}
            >
              <strong>다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 시도해 주세요.</strong>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                style={{ marginTop: 8 }}
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: ['slips', 'query', 'OUTBOUND'] })
                  void slipsQuery.refetch()
                  setSalesDeleteConflict(false)
                  setSalesDeleteOpen(false)
                  setSalesDeleteTargetRow(null)
                }}
              >
                최신 내용 불러오기
              </Button>
            </div>
          ) : null}
        </Card>
      </Modal>
    </div>
  )
}

// ─── 공통 테이블 셀 컴포넌트 ─────────────────────────────────────────────────

function Th({
  children,
  width,
  align = 'left',
}: {
  children: React.ReactNode
  width?: string
  align?: 'left' | 'center' | 'right'
}) {
  return (
    <th
      style={{
        width,
        padding: '8px 10px',
        textAlign: align,
        fontWeight: 600,
        fontSize: 12,
        color: 'var(--color-neutral-700)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  style,
}: {
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
  style?: React.CSSProperties
}) {
  return (
    <td
      style={{
        padding: '7px 10px',
        textAlign: align,
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {children}
    </td>
  )
}

// ─── 페이지네이션 바 ─────────────────────────────────────────────────────────

function PaginationBar({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
}) {
  const windowSize = 5
  const half = Math.floor(windowSize / 2)
  const start = Math.max(0, Math.min(page - half, totalPages - windowSize))
  const end   = Math.min(totalPages, start + windowSize)
  const pages = Array.from({ length: end - start }, (_, i) => start + i)

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 8 }}
      data-testid="sales-query-pagination"
    >
      <PageBtn disabled={page === 0} onClick={() => onPageChange(0)} label="처음">
        «
      </PageBtn>
      <PageBtn disabled={page === 0} onClick={() => onPageChange(page - 1)} label="이전">
        ‹
      </PageBtn>
      {pages.map((p) => (
        <PageBtn
          key={p}
          active={p === page}
          onClick={() => onPageChange(p)}
          label={`${p + 1}페이지`}
        >
          {p + 1}
        </PageBtn>
      ))}
      <PageBtn disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} label="다음">
        ›
      </PageBtn>
      <PageBtn disabled={page >= totalPages - 1} onClick={() => onPageChange(totalPages - 1)} label="마지막">
        »
      </PageBtn>
    </div>
  )
}

function PageBtn({
  children,
  disabled = false,
  active = false,
  onClick,
  label,
}: {
  children: React.ReactNode
  disabled?: boolean
  active?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        minWidth: 32,
        height: 32,
        padding: '0 8px',
        border: active
          ? '1px solid var(--color-brand-500)'
          : '1px solid var(--color-neutral-200)',
        borderRadius: 4,
        background: active ? 'var(--color-brand-500)' : 'var(--color-neutral-0)',
        color: active ? 'var(--color-neutral-0)' : 'var(--color-neutral-700)',
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}
