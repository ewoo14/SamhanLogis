/**
 * 구매관리 — 입고전표 다중 선택 + 날짜 범위 + 검색 모달 + 50/page pagination.
 *
 * 컬럼 12개 (슬립 #17 구매관리 명세 + SP-03 입고 검수 CTA):
 *  1. 체크박스 (다중 선택 + 전체 선택)
 *  2. 순번 (slipDate desc 기준 row index)
 *  3. 구매번호 (slipNo)
 *  4. 거래처 (partnerName)
 *  5. 거래처코드 (businessNumber — 사업자등록번호)
 *  6. 품목 (BE lineSummary 없음 → 임시 "—")
 *  7. 금액 (totalAmount — 우측, 천 단위 콤마)
 *  8. 수량합계 (totalQuantity — 우측, 콤마)
 *  9. 입고창고 (destinationWarehouseId → warehousesQuery cache resolve)
 * 10. 적요 (memo)
 * 11. 비고 (memo — BE 분리 컬럼 추가 시 후속 갱신)
 * 12. 검수 (SAVED/CONFIRMED 행만 InboundInspectionDialog 진입)
 *
 * UUID 비공개 가드: slipNo / businessNumber / partnerCode 만 사용자 노출.
 * id / destinationWarehouseId 는 내부 처리 전용.
 */
import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Modal, Input, FormField, DataGrid, type DataGridColumn } from '@samhan/design-system'
import { querySlips, type SlipQueryRow } from '../../api/slip'
import { listWarehouses, type Warehouse } from '../../api/inventory'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'
import { canQueryPurchases, useSessionStore } from '../../stores/session'
import { exportSlips } from '../../api/excelExportApi'
import { useExcelDownload, makeExportFilename } from '../../hooks/useExcelDownload'
import { ExcelDownloadError } from '../../components/ExcelDownloadError'
import { InboundInspectionDialog } from '../components/InboundInspectionDialog'
import { DocumentNumberLink } from '../../components/DocumentNumberLink'

const PAGE_SIZE = 50
const INSPECTABLE_STATUSES = ['SAVED', 'CONFIRMED'] as const
const SLIP_STATUS_LABEL: Record<string, string> = {
  DRAFT: '임시저장',
  SAVED: '저장',
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
  const dow  = nowSeoul.getDay()
  const from = new Date(y, m, nowSeoul.getDate() - dow)
  const to   = new Date(y, m, nowSeoul.getDate() + (6 - dow))
  return { from: toSeoulDateStr(from), to: toSeoulDateStr(to) }
}

/** 금액 / 수량 천 단위 콤마 포맷 */
function fmtNumber(n: number): string {
  return n.toLocaleString('ko-KR')
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

function isInspectableInbound(row: SlipQueryRow, canInspect: boolean): boolean {
  return canInspect && INSPECTABLE_STATUSES.includes(row.status as (typeof INSPECTABLE_STATUSES)[number])
}

/** 검색 폼 상태 */
interface SearchForm {
  searchSlipNo: string
  searchPartnerName: string
  searchBusinessNumber: string
}

const EMPTY_SEARCH: SearchForm = {
  searchSlipNo: '',
  searchPartnerName: '',
  searchBusinessNumber: '',
}

export function PurchaseQueryPage() {
  usePageTitle('구매관리')
  const navigate = useNavigate()
  const auth = useSessionStore((s) => s.auth)
  const { canAccess } = usePermissions()
  const canQuery = canQueryPurchases(auth)
  // [C5-2b] canCreateSlip(role) → canAccess('sales.slip.create')
  const canCreate = canAccess('sales.slip.create', 'create')
  // [C5-2b] canInspectInbound(role) → canAccess('inbound.inspection')
  const canInspect = canAccess('inbound.inspection')
  const canExport = canAccess('slip.print.export', 'download')

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

  // ── 검색 상태 ──
  const [appliedSearch, setAppliedSearch] = useState<SearchForm>(EMPTY_SEARCH)
  const [draftSearch, setDraftSearch]     = useState<SearchForm>(EMPTY_SEARCH)
  const [searchModalOpen, setSearchModalOpen] = useState(false)

  // ── 다중 선택 ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [inspectionSlipId, setInspectionSlipId] = useState<string | null>(null)

  // ── Excel export ──
  const { downloading, download, error: downloadError } = useExcelDownload()

  // ── 창고 목록 (destinationWarehouseId resolve) ──
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    enabled: canQuery,
    queryFn: () => listWarehouses(),
    staleTime: 5 * 60 * 1000,
  })
  const warehouses = useMemo<Warehouse[]>(
    () => warehousesQuery.data ?? [],
    [warehousesQuery.data],
  )

  // ── 구매관리 데이터 ──
  const slipsQuery = useQuery({
    queryKey: ['slips', 'query', 'INBOUND', dateFrom, dateTo, page, appliedSearch],
    enabled: canQuery,
    queryFn: () =>
      querySlips({
        slipType: 'INBOUND',
        dateFrom,
        dateTo,
        page,
        size: PAGE_SIZE,
        ...(appliedSearch.searchSlipNo         ? { searchSlipNo:         appliedSearch.searchSlipNo }         : {}),
        ...(appliedSearch.searchPartnerName    ? { searchPartnerName:    appliedSearch.searchPartnerName }    : {}),
        ...(appliedSearch.searchBusinessNumber ? { searchBusinessNumber: appliedSearch.searchBusinessNumber } : {}),
      }),
  })

  const rows: SlipQueryRow[]  = slipsQuery.data?.content ?? []
  const totalPages             = slipsQuery.data?.totalPages ?? 1
  const totalElements          = slipsQuery.data?.totalElements ?? 0

  // ── Excel-like DataGrid 보기 모드 토글 ──
  const [gridMode, setGridMode] = useState(false)

  /** DataGrid 열 정의 (입고전표 사용자 노출 컬럼 + 검수 action) */
  const dataGridColumns: DataGridColumn<SlipQueryRow>[] = useMemo(
    () => [
      { key: 'slipNo',                 label: '구매번호',    filter: 'text',
        render: (row: SlipQueryRow) => <DocumentNumberLink number={row.slipNo} to={row.id ? `/purchases/${row.id}` : ''} /> },
      { key: 'partnerName',            label: '거래처',      filter: 'text' },
      { key: 'businessNumber',         label: '거래처코드',   filter: 'text' },
      { key: 'totalAmount',            label: '금액',        align: 'right' as const, filter: false as const,
        format: (v: unknown) => typeof v === 'number' ? v.toLocaleString('ko-KR') : '—' },
      { key: 'totalQuantity',          label: '수량합계',    align: 'right' as const, filter: false as const,
        format: (v: unknown) => typeof v === 'number' ? v.toLocaleString('ko-KR') : '—' },
      { key: 'destinationWarehouseId', label: '입고창고',    filter: 'select' as const,
        format: (v: unknown) => typeof v === 'string' ? resolveWarehouseName(v, warehouses) : '—' },
      { key: 'memo',                   label: '적요',        filter: 'text' },
      { key: 'salesPersonName',        label: '담당자명',    filter: 'text' },
      { key: 'paymentDueDate',         label: '지급예정일',  filter: 'text' },
      { key: 'status',                 label: '상태',        filter: 'select' as const,
        format: (v: unknown) => typeof v === 'string' ? (SLIP_STATUS_LABEL[v] ?? v) : '—' },
      { key: 'printed',                label: '인쇄',        filter: 'select' as const,
        format: (v: unknown) => v ? '완료' : '미완' },
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
              navigate(`/purchases/${row.id}`)
            }}
            aria-label={`${row.slipNo} 상세 보기`}
            data-testid={`purchase-query-detail-${toPublicTestId(row.slipNo)}`}
          >
            상세
          </Button>
        ),
      },
      ...(canInspect
        ? [{
            key: 'inspectionAction',
            label: '검수',
            width: 86,
            align: 'center' as const,
            filter: false as const,
            render: (row: SlipQueryRow) =>
              isInspectableInbound(row, canInspect) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setInspectionSlipId(row.id)
                  }}
                  aria-label={`${row.slipNo} 입고 검수`}
                  data-testid={`purchase-query-inspect-${toPublicTestId(row.slipNo)}`}
                >
                  검수
                </Button>
              ) : '—',
          } satisfies DataGridColumn<SlipQueryRow>]
        : []),
    ],
    [canInspect, navigate, warehouses],
  )
  const tableColumnCount = canInspect ? 13 : 12

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

  if (!canQuery) {
    return (
      <div role="alert" style={{ padding: 32, fontSize: 14, color: 'var(--color-danger-600)' }}>
        구매 전표 조회 권한이 없습니다. (WAREHOUSE / MANAGER / MASTER 역할 필요)
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
            data-testid="purchase-query-selected-count"
            style={{ fontSize: 13, color: 'var(--color-brand-600)' }}
          >
            {selectedIds.size}행 선택됨
          </span>
        ) : null}

        {/* 일괄 인쇄 */}
        {selectedIds.size > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { window.print() }}
            data-testid="purchase-query-print-selected"
          >
            인쇄
          </Button>
        ) : null}

        {/* Excel 다운로드 — BE export endpoint 는 MANAGER/MASTER 전용.
            화면 검색모달(appliedSearch) 을 export 에도 그대로 전달 — SalesQueryPage 와 동일
            패턴의 결함(계열 전수 sweep, #907 재수렴 R). */}
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
                    slipType: 'INBOUND',
                    from: dateFrom,
                    to: dateTo,
                    ...(appliedSearch.searchSlipNo         ? { searchSlipNo:         appliedSearch.searchSlipNo }         : {}),
                    ...(appliedSearch.searchPartnerName    ? { searchPartnerName:    appliedSearch.searchPartnerName }    : {}),
                    ...(appliedSearch.searchBusinessNumber ? { searchBusinessNumber: appliedSearch.searchBusinessNumber } : {}),
                  }),
                makeExportFilename('구매관리'),
              )
            }
            data-testid="purchase-query-excel-download"
          >
            Excel 다운로드
          </Button>
        ) : null}

        {/* 검색 모달 열기 */}
        <Button
          variant="secondary"
          size="sm"
          onClick={openSearchModal}
          data-testid="purchase-query-search-btn"
        >
          검색
        </Button>

        {/* [2c 신규 전표 진입점] 권한 보유자만 노출 — SlipFormPage(/purchases/new) 로 이동.
            2a 통합 후 PurchaseQueryPage 가 /purchases 정식 진입점이 되었으므로 신규 입고전표
            작성 흐름이 사라지지 않도록 본 버튼이 필수. */}
        {canCreate ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/purchases/new')}
            data-testid="purchase-query-new-slip-btn"
          >
            신규 입고전표
          </Button>
        ) : null}

        {/* Excel-like DataGrid 보기 토글 */}
        <Button
          variant={gridMode ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setGridMode((v) => !v)}
          data-testid="purchase-query-grid-mode-btn"
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
      <ExcelDownloadError error={downloadError} testId="purchase-query-excel-error" />

      {/* ── DataGrid 보기 (Excel-like: 열헤더 필터 + 다중 셀 선택 + Ctrl+C) ── */}
      {gridMode ? (
        <div style={{ height: 520 }} data-testid="purchase-query-datagrid">
          <DataGrid<SlipQueryRow>
            columns={dataGridColumns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={slipsQuery.isLoading}
            emptyMessage="조회된 구매 전표가 없습니다."
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
          data-testid="purchase-query-table"
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
                  data-testid="purchase-query-select-all"
                />
              </Th>
              <Th width="48px">순번</Th>
              <Th width="130px">구매번호</Th>
              <Th width="130px">거래처</Th>
              <Th width="120px">거래처코드</Th>
              <Th width="140px">품목</Th>
              <Th width="100px" align="right">금액</Th>
              <Th width="80px" align="right">수량합계</Th>
              <Th width="100px">입고창고</Th>
              <Th width="160px">적요</Th>
              <Th width="160px">비고</Th>
              <Th width="86px">상태</Th>
              <Th width="72px" align="center">상세</Th>
              {canInspect ? <Th width="86px" align="center">검수</Th> : null}
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
                  조회된 구매 전표가 없습니다.
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
                      background: isSelected ? 'var(--color-brand-50, #EFF6FF)' : undefined,
                      borderBottom: '1px solid var(--color-neutral-100)',
                      cursor: 'pointer',
                    }}
                    data-testid={`purchase-query-row-${row.slipNo}`}
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
                    {/* 구매번호 — UUID 비공개: slipNo 만 표시 */}
                    <Td><DocumentNumberLink number={row.slipNo} to={row.id ? `/purchases/${row.id}` : ''} /></Td>
                    {/* 거래처 */}
                    <Td>{row.partnerName ?? '—'}</Td>
                    {/* 거래처코드 = businessNumber (사업자등록번호) */}
                    <Td>{row.businessNumber ?? '—'}</Td>
                    {/* 품목 — BE lineSummary 없음 → 임시 "—" */}
                    <Td>—</Td>
                    {/* 금액 — 우측 정렬 */}
                    <Td align="right">{fmtNumber(row.displayTotalAmount ?? row.totalAmount)}</Td>
                    {/* 수량합계 — 우측 정렬 */}
                    <Td align="right">{fmtNumber(row.totalQuantity)}</Td>
                    {/* 입고창고 — destinationWarehouseId resolve */}
                    <Td>{resolveWarehouseName(row.destinationWarehouseId, warehouses)}</Td>
                    {/* 적요 — memo */}
                    <Td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.memo ?? '—'}
                    </Td>
                    {/* 비고 — 현재 memo 와 동일 (BE 분리 컬럼 추가 시 후속 갱신) */}
                    <Td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.memo ?? '—'}
                    </Td>
                    <Td>
                      <Badge variant="neutral">{SLIP_STATUS_LABEL[row.status] ?? row.status}</Badge>
                    </Td>
                    <Td align="center">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/purchases/${row.id}`)
                        }}
                        aria-label={`${row.slipNo} 상세 보기`}
                        data-testid={`purchase-query-detail-${toPublicTestId(row.slipNo)}`}
                      >
                        상세
                      </Button>
                    </Td>
                    {canInspect ? (
                      <Td align="center">
                        {isInspectableInbound(row, canInspect) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setInspectionSlipId(row.id)
                            }}
                            aria-label={`${row.slipNo} 입고 검수`}
                            data-testid={`purchase-query-inspect-${toPublicTestId(row.slipNo)}`}
                          >
                            검수
                          </Button>
                        ) : '—'}
                      </Td>
                    ) : null}
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
          구매 전표 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
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
        title="구매 검색"
        size="md"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={resetSearch} data-testid="purchase-query-search-reset">
              초기화
            </Button>
            <Button variant="secondary" onClick={() => setSearchModalOpen(false)}>
              취소
            </Button>
            <Button variant="primary" onClick={applySearch} data-testid="purchase-query-search-apply">
              조회
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormField
            label="구매번호"
            render={({ id }) => (
              <Input
                id={id}
                value={draftSearch.searchSlipNo}
                onChange={(e) => setDraftSearch((d) => ({ ...d, searchSlipNo: e.target.value }))}
                placeholder="예: 2026/05/10-1"
                data-testid="purchase-query-search-slipno"
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
                placeholder="예: 삼성전자"
                data-testid="purchase-query-search-partner-name"
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
                placeholder="예: 101-81-25508"
                data-testid="purchase-query-search-business-number"
              />
            )}
          />
        </div>
      </Modal>

      {inspectionSlipId ? (
        <InboundInspectionDialog
          slipId={inspectionSlipId}
          open={inspectionSlipId !== null}
          onClose={() => setInspectionSlipId(null)}
          onSuccess={() => {
            setInspectionSlipId(null)
          }}
        />
      ) : null}
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
      data-testid="purchase-query-pagination"
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
