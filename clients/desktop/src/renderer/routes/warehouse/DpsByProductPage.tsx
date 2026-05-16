/**
 * 품목별 DPS 분석 페이지 (`/warehouse/dps-compare/by-product`) — P0-B GAS 보강.
 *
 * <p>Samhan Public GAS cross-check 보강 — legacy GAS 16번 (품목별 DPS 입고내역 비교)
 * 의 native pivot 이식. BE agent 신규 endpoint 호출.
 *
 * <h2>UX</h2>
 * <ol>
 *   <li>상단 toolbar: 날짜 from/to picker (기본 Asia/Seoul 이번달) + 창고 dropdown (전체 기본) + "조회" 버튼</li>
 *   <li>본문: DataGrid 8 컬럼 — 상품코드/상품명/입고대기/완료/품질검사/반품/합계/DPS차이</li>
 *   <li>수량 컬럼 우측 정렬 + 천 단위 콤마 포맷</li>
 *   <li>음수 값 (반품/차이) 빨강 표시</li>
 *   <li>하단: 총 품목 수 요약 + 생성 시각</li>
 * </ol>
 *
 * <h2>UUID 비공개</h2>
 * <p>사용자 노출 식별자 = productCode / productName 만.
 * warehouseId 는 내부 API 파라미터 전용. (feedback_uuid_no_user_visibility)
 *
 * <h2>DataGrid</h2>
 * <p>design-system DataGrid (PR #162) 활용.
 * enableMultiSelect / enableCopy 활성 — Excel 보기 동등 UX.
 * 열헤더 필터: productName text / warehouseCode select.
 *
 * <h2>RoleGuard</h2>
 * <p>WAREHOUSE / MANAGER / MASTER (BE @PreAuthorize 와 일치).
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code dps-by-product-from} / {@code dps-by-product-to} — 날짜 picker</li>
 *   <li>{@code dps-by-product-warehouse-select} — 창고 dropdown</li>
 *   <li>{@code dps-by-product-query-button} — 조회 버튼</li>
 *   <li>{@code dps-by-product-grid} — DataGrid wrapper</li>
 *   <li>{@code dps-by-product-summary} — 하단 요약 행</li>
 * </ul>
 */
import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, DataGrid, Tabs, type DataGridColumn } from '@samhan/design-system'
import {
  getDpsByProduct,
  type DpsByProductRow,
  type DpsByProductResponse,
} from '../../api/dpsByProductApi'
import {
  getLatestDpsHistory,
  saveDpsHistory,
  type DpsSaveHistoryDetailResponse,
} from '../../api/dpsSaveHistoryApi'
import { DpsHistoryTab } from '../../components/DpsHistoryTab'
import { DpsRestoredBanner } from '../../components/DpsRestoredBanner'
import { DpsSaveDialog } from '../../components/DpsSaveDialog'
import { usePageTitle } from '../../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// 날짜 헬퍼 — Asia/Seoul 이번달 (첫날/오늘)
// ---------------------------------------------------------------------------

/** Asia/Seoul 기준 이번달 첫날 (YYYY-MM-01). */
function thisMonthFirst(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}-01`
}

/** 오늘 날짜 (YYYY-MM-DD) — date input 기본 종료일. */
function todayIso(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ---------------------------------------------------------------------------
// 창고 목록 (mock 고정 — warehouseId 는 내부 전송용)
// ---------------------------------------------------------------------------

interface WarehouseOption {
  /** warehouseId — API 파라미터 전송용, 사용자 미노출 */
  id: string
  /** 창고명 — 사용자 노출 */
  name: string
}

const WAREHOUSE_OPTIONS: WarehouseOption[] = [
  { id: '11111111-1111-1111-1111-000000000001', name: '본사창고' },
  { id: '11111111-1111-1111-1111-000000000002', name: '1호차 차량재고' },
  { id: '11111111-1111-1111-1111-000000000003', name: '거래처 위탁창고' },
  { id: '11111111-1111-1111-1111-000000000004', name: '가상창고' },
]

// ---------------------------------------------------------------------------
// 수량 포맷 헬퍼
// ---------------------------------------------------------------------------

/** 수량 → 천 단위 콤마 문자열. */
function fmtQty(v: unknown): string {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('ko-KR')
}

/** 음수 여부 — 반품/차이 컬럼 빨강 적용 기준. */
function isNegative(v: unknown): boolean {
  return typeof v === 'number' && v < 0
}

// ---------------------------------------------------------------------------
// DataGrid 컬럼 정의 (8 컬럼)
// ---------------------------------------------------------------------------

const COLUMNS: DataGridColumn<DpsByProductRow>[] = [
  {
    key: 'productCode',
    label: '상품코드',
    width: 110,
    filter: 'text',
    align: 'left',
  },
  {
    key: 'productName',
    label: '상품명',
    width: 200,
    filter: 'text',
    align: 'left',
  },
  {
    key: 'pendingQty',
    label: '입고대기',
    width: 90,
    filter: false,
    align: 'right',
    format: fmtQty,
  },
  {
    key: 'completedQty',
    label: '완료',
    width: 90,
    filter: false,
    align: 'right',
    format: fmtQty,
  },
  {
    key: 'qcQty',
    label: '품질검사',
    width: 90,
    filter: false,
    align: 'right',
    format: fmtQty,
  },
  {
    key: 'returnQty',
    label: '반품',
    width: 90,
    filter: false,
    align: 'right',
    render: (row) => (
      <span style={{ color: isNegative(row.returnQty) ? '#B91C1C' : undefined }}>
        {fmtQty(row.returnQty)}
      </span>
    ),
  },
  {
    key: 'totalQty',
    label: '합계',
    width: 90,
    filter: false,
    align: 'right',
    format: fmtQty,
  },
  {
    key: 'diffFromDps',
    label: 'DPS차이',
    width: 90,
    filter: false,
    align: 'right',
    render: (row) => (
      <span
        style={{
          color: isNegative(row.diffFromDps) ? '#B91C1C' : undefined,
          fontWeight: row.diffFromDps !== 0 ? 600 : undefined,
        }}
      >
        {fmtQty(row.diffFromDps)}
      </span>
    ),
  },
]

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

/** 에러 메시지 추출 헬퍼. */
function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return '조회 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

/** 생성 시각 ISO → 한국어 표시. */
function fmtGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function DpsByProductPage() {
  usePageTitle('품목별 DPS 분석')

  // ── 폼 상태 ──────────────────────────────────────────────
  const [fromDate, setFromDate] = useState(thisMonthFirst)
  const [toDate, setToDate] = useState(todayIso)
  /** 선택된 창고 option (null = 전체). */
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseOption | null>(null)
  /** 실제 조회에 사용할 파라미터 스냅샷 — "조회" 버튼 클릭 시 갱신. */
  const [queryKey, setQueryKey] = useState<{
    fromDate: string
    toDate: string
    warehouseId?: string
  } | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [restoredData, setRestoredData] = useState<DpsByProductResponse | null>(null)
  const [restoreBanner, setRestoreBanner] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const lastAutoSaveKeyRef = useRef<string | null>(null)

  // ── 조회 ─────────────────────────────────────────────────
  const {
    data,
    isFetching,
    isError,
    error,
  } = useQuery<DpsByProductResponse>({
    queryKey: ['dps-by-product', queryKey],
    queryFn: () => {
      if (!queryKey) throw new Error('조회 파라미터가 없습니다.')
      return getDpsByProduct(queryKey)
    },
    enabled: queryKey !== null,
  })

  const handleQuery = useCallback(() => {
    if (!fromDate || !toDate) {
      setValidationError('조회 기간을 입력해 주세요.')
      return
    }
    if (fromDate > toDate) {
      setValidationError('시작일이 종료일보다 늦을 수 없습니다.')
      return
    }
    setValidationError(null)
    setRestoreBanner(null)
    setRestoredData(null)
    setQueryKey({
      fromDate,
      toDate,
      warehouseId: selectedWarehouse?.id,
    })
  }, [fromDate, toDate, selectedWarehouse])

  // ── 표시 rows ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void getLatestDpsHistory('DPS_BY_PRODUCT')
      .then((detail) => {
        if (cancelled || !detail) return
        setRestoredData(detail.responsePayload as DpsByProductResponse)
        setRestoreBanner(`이전 결과 복원됨 · ${fmtGeneratedAt(detail.createdAt)}`)
      })
      .catch(() => {
        // latest 없음/조회 실패는 첫 방문 UX 를 막지 않는다.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!data || !queryKey) return
    const autoSaveKey = `${queryKey.fromDate}|${queryKey.toDate}|${queryKey.warehouseId ?? ''}|${data.generatedAt}`
    if (lastAutoSaveKeyRef.current === autoSaveKey) return
    lastAutoSaveKeyRef.current = autoSaveKey
    void saveDpsHistory({
      programType: 'DPS_BY_PRODUCT',
      saveMode: 'AUTO_LATEST',
      requestParams: {
        from: queryKey.fromDate,
        to: queryKey.toDate,
        warehouseId: queryKey.warehouseId ?? null,
        rowCount: data.rows.length,
        mismatchCount: data.rows.filter((row) => row.diffFromDps !== 0).length,
      },
      responsePayload: data,
    }).catch(() => {
      // 자동 저장 실패는 조회 UX 를 막지 않는다.
    })
  }, [data, queryKey])

  const displayData = data ?? restoredData
  const rows = useMemo(() => displayData?.rows ?? [], [displayData])

  const handleRestore = useCallback((detail: DpsSaveHistoryDetailResponse) => {
    setRestoredData(detail.responsePayload as DpsByProductResponse)
    setActiveTab(0)
    setRestoreBanner(`복원: ${fmtGeneratedAt(detail.createdAt)} ${detail.createdBy} '${detail.topic}'`)
  }, [])

  const handleManualSave = useCallback((topic: string) => {
    const payload = displayData
    if (!payload) return
    void saveDpsHistory({
      programType: 'DPS_BY_PRODUCT',
      saveMode: 'MANUAL_NAMED',
      topic,
      requestParams: {
        from: payload.fromDate,
        to: payload.toDate,
        warehouseId: payload.warehouseId,
        rowCount: payload.rows.length,
        mismatchCount: payload.rows.filter((row) => row.diffFromDps !== 0).length,
      },
      responsePayload: payload,
    }).then(() => {
      setSaveDialogOpen(false)
      setActiveTab(1)
    })
  }, [displayData])

  return (
    <div style={pageStyle}>
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <div style={headerRowStyle}>
        <h3 style={{ margin: 0 }}>품목별 DPS 분석</h3>
        <span style={subtitleStyle}>
          DPS 입고 단계별 pivot — P0-B GAS 보강
        </span>
      </div>

      <Tabs
        tabs={[
          { label: '실행', testId: 'dps-history-tab-run' },
          { label: '저장내역', testId: 'dps-history-tab-list' },
        ]}
        activeIndex={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="품목별 DPS 저장내역 탭"
      >
        <div style={pageStyle}>
          {restoreBanner ? (
            <DpsRestoredBanner
              message={restoreBanner}
              onClose={() => setRestoreBanner(null)}
            />
          ) : null}

          {/* ── Toolbar ─────────────────────────────────────── */}
          <section style={toolbarStyle} aria-label="조회 조건">
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>조회 시작일</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            data-testid="dps-by-product-from"
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>조회 종료일</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            data-testid="dps-by-product-to"
            style={inputStyle}
          />
        </label>
        <div style={fieldStyle}>
          <span style={fieldLabelStyle}>창고</span>
          <select
            value={selectedWarehouse?.id ?? ''}
            onChange={(e) => {
              const opt = WAREHOUSE_OPTIONS.find((w) => w.id === e.target.value) ?? null
              setSelectedWarehouse(opt)
            }}
            data-testid="dps-by-product-warehouse-select"
            style={{ ...inputStyle, minWidth: 140 }}
          >
            <option value="">전체</option>
            {WAREHOUSE_OPTIONS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <Button
            variant="primary"
            onClick={handleQuery}
            loading={isFetching}
            disabled={isFetching}
            data-testid="dps-by-product-query-button"
          >
            조회
          </Button>
          {validationError ? (
            <span role="alert" style={errorBannerStyle}>{validationError}</span>
          ) : null}
          {isError ? (
            <span role="alert" style={errorBannerStyle}>{errorMsg(error)}</span>
          ) : null}
        </div>
      </section>

          {/* ── DataGrid 본문 ─────────────────────────────────── */}
          <section style={gridSectionStyle} data-testid="dps-by-product-grid">
        <DataGrid<DpsByProductRow>
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row.productCode}
          loading={isFetching}
          emptyMessage={
            queryKey === null
              ? '조회 조건을 입력 후 "조회" 버튼을 눌러 주세요.'
              : '조회 결과가 없습니다.'
          }
          enableMultiSelect={true}
          enableCopy={true}
          className={undefined}
        />
      </section>

          {/* ── 하단 요약 ─────────────────────────────────────── */}
          {displayData ? (
        <div style={summaryStyle} data-testid="dps-by-product-summary">
          <span>총 품목 수: <strong>{displayData.totalProductCount.toLocaleString('ko-KR')}</strong>건</span>
          {displayData.warehouseName ? (
            <span style={{ marginLeft: 16 }}>
              창고: <strong>{displayData.warehouseName}</strong>
            </span>
          ) : null}
          <span style={{ marginLeft: 16, color: '#6B7280' }}>
            기준: {fmtGeneratedAt(displayData.generatedAt)}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
            data-testid="dps-history-save-button"
            style={{ marginLeft: 16 }}
          >
            내역으로 저장
          </Button>
        </div>
          ) : null}
        </div>
        <DpsHistoryTab programType="DPS_BY_PRODUCT" onRestore={handleRestore} />
      </Tabs>
      <DpsSaveDialog
        open={saveDialogOpen}
        saving={false}
        onClose={() => setSaveDialogOpen(false)}
        onSave={handleManualSave}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 스타일
// ---------------------------------------------------------------------------

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  height: '100%',
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  flexWrap: 'wrap',
}

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: '#6B7280',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  padding: '12px 16px',
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  color: '#374151',
  fontWeight: 500,
}

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
  outline: 'none',
}

const errorBannerStyle: CSSProperties = {
  fontSize: 12,
  color: '#B91C1C',
  background: '#FEF2F2',
  border: '1px solid #FECACA',
  borderRadius: 4,
  padding: '4px 8px',
}

const gridSectionStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
}

const summaryStyle: CSSProperties = {
  padding: '8px 12px',
  background: '#F9FAFB',
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  fontSize: 13,
  color: '#374151',
}
