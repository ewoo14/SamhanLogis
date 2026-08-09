/**
 * 홈택스 일괄 등록 양식 화면 — `/accounting/hometax-export` (PR-E2 FE-9 + PR #161 4탭 흡수).
 *
 * <p>매뉴얼 출처: legacy GAS B 카테고리 — 세금계산서 홈택스 일괄 업로드 양식.
 * BE: {@code accounting-service} — BE cleanup agent 신규 endpoint.
 *
 * <p>탭 구성 (5탭):
 * <ol>
 *   <li>Tab 0 단순 다운로드 (legacy) — 기존 {@code GET /tax-invoice/hometax-export?from&to} 호출 + 단일 .xlsx</li>
 *   <li>Tab 1 미리보기 생성 — {@code POST /hometax-export/preview} (59컬럼 + 100건 분할 + 제외 거래처)</li>
 *   <li>Tab 2 결과 페이지 — DataGrid + 페이지 navigation + "Excel 다운로드" → {@code GET /hometax-export/{id}/split?fileIndex=N}</li>
 *   <li>Tab 3 제외 거래처 — {@code GET/POST/DELETE /hometax-export/exclusions}</li>
 *   <li>Tab 4 저장 내역 — {@code GET /hometax-export/history} + 행 클릭 → Tab 2 복원</li>
 * </ol>
 *
 * <p>UUID 비공개 가드 (feedback_uuid_no_user_visibility.md) — 사용자 노출은
 * batchNo / partnerCode / slipNo 만. batchId 는 path 전용.
 *
 * <p>권한 — RoleGuard 가 ACCOUNTANT / MANAGER / MASTER 만 통과 (라우팅 단계).
 *
 * <p>data-testid:
 * <ul>
 *   <li>{@code hometax-export-tab-{id}} — 각 탭 버튼</li>
 *   <li>{@code hometax-export-from}, {@code hometax-export-to} — Tab 0 날짜 input</li>
 *   <li>{@code hometax-export-download-button} — Tab 0 엑셀 다운로드 버튼</li>
 *   <li>{@code hometax-export-count} — Tab 0 미리보기 건수 영역</li>
 *   <li>{@code batch-preview-from}, {@code batch-preview-to} — Tab 1 날짜 input</li>
 *   <li>{@code batch-preview-execute} — Tab 1 처리 실행 버튼</li>
 *   <li>{@code batch-result-download-{N}} — Tab 2 Excel 다운로드 버튼</li>
 *   <li>{@code exclusion-add-code}, {@code exclusion-add-name}, {@code exclusion-add-reason} — Tab 3 추가 폼</li>
 *   <li>{@code exclusion-delete-{partnerCode}} — Tab 3 삭제 버튼</li>
 *   <li>{@code history-row-{batchNo}} — Tab 4 이력 행</li>
 * </ul>
 */
import { useCallback, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, DataGrid, type DataGridColumn } from '@samhan/design-system'
import {
  buildHometaxExportFilename,
  downloadHometaxExport,
  previewHometax,
  downloadHometaxSplit,
  listHometaxExclusions,
  addHometaxExclusion,
  deleteHometaxExclusion,
  listHometaxHistory,
  getHometaxHistory,
  type HometaxPreviewResponse,
  type HometaxResultRow,
  toHometaxResultRow,
  type HometaxExclusion,
  type HometaxBatchHistory,
  type AddHometaxExclusionRequest,
} from '../api/hometaxExportApi'
import { listTaxInvoices } from '../api/taxInvoiceApi'
import { AuditInfoBanner } from '../components/audit/AuditOverlaySection'
import { usePageTitle } from '../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

/** 이번 달 1일 (YYYY-MM-DD). */
function firstOfMonth(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}-01`
}

/** 이번 달 말일 (YYYY-MM-DD). */
function lastOfMonth(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

/** 오늘 (YYYY-MM-DD). */
function todayIso(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** KRW BigDecimal string → 천단위 콤마 + ₩ prefix. */
function fmtKrw(raw: string | number | null | undefined): string {
  if (!raw) return '—'
  const rawText = String(raw)
  const n = Number.parseFloat(rawText)
  if (!Number.isFinite(n)) return rawText
  return '₩' + Math.trunc(n).toLocaleString('ko-KR')
}

function fmtGridAmount(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '—'
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString('ko-KR') : '—'
}

/** 날짜 표시 — YYYY-MM-DD 입력 그대로 표시. */
const fmtDate = (raw: string | null | undefined): string => raw ?? '—'

/** Blob 을 사용자 다운로드로 트리거 (filename 지정). */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 한국어 fallback error 메시지. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return '처리 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

// ---------------------------------------------------------------------------
// 탭 ID 정의
// ---------------------------------------------------------------------------

type TabId = 'download' | 'preview' | 'result' | 'exclusions' | 'history'

const TAB_LABELS: Record<TabId, string> = {
  download: '단순 다운로드',
  preview: '미리보기 생성',
  result: '결과 페이지',
  exclusions: '거래처 필터링',
  history: '저장 내역',
}

const TAB_ORDER: TabId[] = ['download', 'preview', 'result', 'exclusions', 'history']

// ---------------------------------------------------------------------------
// 탭 Nav
// ---------------------------------------------------------------------------

function TabNav({
  active,
  onSelect,
  resultDisabled,
}: {
  active: TabId
  onSelect: (t: TabId) => void
  resultDisabled: boolean
}) {
  return (
    <nav
      style={{
        display: 'flex',
        borderBottom: '2px solid var(--color-neutral-200)',
        marginBottom: 24,
        gap: 0,
        overflowX: 'auto',
      }}
      aria-label="홈택스 일괄 양식 탭"
    >
      {TAB_ORDER.map((id) => {
        const isActive = id === active
        const disabled = id === 'result' && resultDisabled
        return (
          <button
            key={id}
            type="button"
            onClick={() => { if (!disabled) onSelect(id) }}
            disabled={disabled}
            aria-selected={isActive}
            data-testid={`hometax-export-tab-${id}`}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: isActive ? 700 : 400,
              color: disabled
                ? 'var(--color-neutral-400)'
                : isActive
                  ? 'var(--color-primary-600)'
                  : 'var(--color-neutral-700)',
              background: 'transparent',
              border: 'none',
              borderBottom: isActive
                ? '2px solid var(--color-primary-600)'
                : '2px solid transparent',
              marginBottom: -2,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {TAB_LABELS[id]}
          </button>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Tab 0: 단순 다운로드 (legacy — PR-E2 회귀 보존)
// ---------------------------------------------------------------------------

function Tab0Download() {
  const defaultFrom = useMemo(firstOfMonth, [])
  const defaultTo = useMemo(todayIso, [])
  const [from, setFrom] = useState<string>(defaultFrom)
  const [to, setTo] = useState<string>(defaultTo)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const previewQuery = useQuery({
    queryKey: ['accounting', 'hometax-export', 'legacy-preview', from, to],
    queryFn: () =>
      listTaxInvoices({ status: 'ISSUED', from, to, page: 0, size: 200 }),
    enabled: Boolean(from && to),
  })

  const previewRows = previewQuery.data?.content ?? []
  const totalElements = previewQuery.data?.totalElements ?? 0
  const sumSupply = useMemo(
    () => previewRows.reduce((acc, r) => acc + (Number.parseFloat(r.supplyAmount) || 0), 0),
    [previewRows],
  )
  const sumVat = useMemo(
    () => previewRows.reduce((acc, r) => acc + (Number.parseFloat(r.vatAmount) || 0), 0),
    [previewRows],
  )
  const sumTotal = useMemo(
    () => previewRows.reduce((acc, r) => acc + (Number.parseFloat(r.totalAmount) || 0), 0),
    [previewRows],
  )
  const hasMoreThanCap = totalElements > previewRows.length

  const handleDownload = useCallback(async () => {
    setDownloadError(null)
    if (!from || !to) { setDownloadError('기간 (시작/종료) 을 모두 입력해 주세요.'); return }
    if (from > to) { setDownloadError('시작일이 종료일보다 늦을 수 없습니다.'); return }
    setDownloading(true)
    try {
      const blob = await downloadHometaxExport(from, to)
      triggerDownload(blob, buildHometaxExportFilename(from, to))
    } catch (err) {
      setDownloadError(errorMessage(err))
    } finally {
      setDownloading(false)
    }
  }, [from, to])

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <Input
            label="기간 (시작)"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            fullWidth={false}
            data-testid="hometax-export-from"
          />
          <Input
            label="기간 (종료)"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            fullWidth={false}
            data-testid="hometax-export-to"
          />
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={downloading || !from || !to}
            data-testid="hometax-export-download-button"
          >
            {downloading ? '다운로드 중...' : '엑셀 다운로드'}
          </Button>
        </div>
      </Card>

      {/* 미리보기 — 건수 + 합계 (UUID 비공개) */}
      <Card style={{ marginBottom: 16 }}>
        <div data-testid="hometax-export-count">
          {previewQuery.isLoading ? (
            <div style={{ color: '#6B7280', fontSize: 13 }}>미리보기 조회 중...</div>
          ) : previewQuery.isError ? (
            <div className="error-banner" role="alert">
              미리보기 조회 실패. 백엔드 연결을 확인하세요.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: 24,
                flexWrap: 'wrap',
                alignItems: 'baseline',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>발행 건수</div>
                <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {totalElements.toLocaleString('ko-KR')} 건
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>공급가액 합계</div>
                <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtKrw(String(sumSupply))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>세액 합계</div>
                <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtKrw(String(sumVat))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>총합계</div>
                <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtKrw(String(sumTotal))}
                </div>
              </div>
            </div>
          )}
          {hasMoreThanCap ? (
            <div style={{ marginTop: 12, fontSize: 12, color: '#B45309' }}>
              ※ 미리보기 합계는 최근 200건 기준입니다. 전체{' '}
              {totalElements.toLocaleString('ko-KR')}건은 다운로드 .xlsx 에 모두 포함됩니다.
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
          <strong>안내</strong>
          <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
            <li>홈택스 표준 양식 .xlsx 파일이 다운로드됩니다.</li>
            <li>100건 초과 시 sheet 가 분할됩니다.</li>
            <li>발행 (ISSUED) 상태의 세금계산서만 포함됩니다 (DRAFT / CANCELLED 제외).</li>
            <li>파일명: <code>홈택스_일괄등록_시작일_종료일.xlsx</code></li>
          </ul>
        </div>
      </Card>

      {downloadError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          엑셀 다운로드 실패: {downloadError}
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Tab 1: 미리보기 생성
// ---------------------------------------------------------------------------

function Tab1Preview({
  onSuccess,
}: {
  onSuccess: (data: HometaxPreviewResponse) => void
}) {
  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(lastOfMonth)
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      previewHometax({ fromDate, toDate, includeUnconfirmed }),
    onSuccess: (data) => {
      onSuccess(data)
    },
  })

  const isDisabled = !fromDate || !toDate || fromDate > toDate || mutation.isPending

  return (
    <div style={{ maxWidth: 520 }}>
      <h4 style={{ margin: '0 0 20px' }}>미리보기 생성</h4>
      <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', marginBottom: 24 }}>
        날짜 범위와 필터 옵션을 지정하면 홈택스 일괄등록 양식 rows 를 생성합니다.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Input
          label="기간 (시작)"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          fullWidth={false}
          data-testid="batch-preview-from"
        />
        <Input
          label="기간 (종료)"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          fullWidth={false}
          data-testid="batch-preview-to"
        />
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 24,
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--color-neutral-800)',
          userSelect: 'none',
        }}
      >
        <input
          type="checkbox"
          checked={includeUnconfirmed}
          onChange={(e) => setIncludeUnconfirmed(e.target.checked)}
          data-testid="batch-preview-include-unconfirmed"
          style={{ width: 16, height: 16, accentColor: 'var(--color-primary-600)' }}
        />
        모든 전표 포함 (회계반영일자 미전표 포함)
        <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
          체크 해제 시 회계반영일자 확정 전표만
        </span>
      </label>

      {fromDate > toDate && (
        <div role="alert" style={{ color: 'var(--color-danger-600)', fontSize: 13, marginBottom: 12 }}>
          종료일이 시작일보다 이전입니다.
        </div>
      )}

      {mutation.isError && (
        <div role="alert" style={{ color: 'var(--color-danger-600)', fontSize: 13, marginBottom: 12 }}>
          미리보기 생성 실패. 백엔드 연결을 확인하세요.
        </div>
      )}

      <Button
        variant="primary"
        onClick={() => mutation.mutate()}
        disabled={isDisabled}
        data-testid="batch-preview-execute"
      >
        {mutation.isPending ? '처리 중...' : '처리 실행'}
      </Button>

      {mutation.isSuccess && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: 'var(--color-success-50, #f0fdf4)',
            border: '1px solid var(--color-success-200, #bbf7d0)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--color-success-800, #166534)',
          }}
        >
          배치번호 <strong>{mutation.data.batchNo}</strong> 생성 완료 —
          전체 {mutation.data.totalRowCount.toLocaleString('ko-KR')}건 /
          분할 파일 {mutation.data.splitFileCount}개.
          결과 페이지로 이동합니다.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2: 결과 페이지
// ---------------------------------------------------------------------------

const PAGE_SIZE = 100

const HOMETAX_GRID_COLUMNS: DataGridColumn<HometaxResultRow>[] = [
  { key: 'rowNo',               label: '번호',        filter: false, align: 'right' as const },
  { key: 'slipNo',              label: '전표번호',     filter: 'text' as const },
  { key: 'writeDate',           label: '작성일자',     filter: 'text' as const },
  { key: 'supplierName',        label: '공급자',       filter: 'text' as const },
  { key: 'supplierRegNo',       label: '공급자사업자',  filter: 'text' as const },
  { key: 'buyerName',           label: '공급받는자',   filter: 'text' as const },
  { key: 'buyerRegNo',          label: '사업자번호',   filter: 'text' as const },
  { key: 'buyerEmail1',         label: '이메일',       filter: 'text' as const },
  { key: 'supplyAmount',        label: '공급가액',     filter: false, align: 'right' as const,
    format: fmtGridAmount },
  { key: 'vatAmount',           label: '세액',         filter: false, align: 'right' as const,
    format: fmtGridAmount },
  { key: 'totalAmount',         label: '합계금액',     filter: false, align: 'right' as const,
    format: fmtGridAmount },
  { key: 'itemName1',           label: '품목',         filter: 'text' as const },
  { key: 'itemSpec1',           label: '규격',         filter: 'text' as const },
  { key: 'itemQty1',            label: '수량',         filter: false, align: 'right' as const },
  { key: 'itemPrice1',          label: '단가',         filter: false, align: 'right' as const,
    format: fmtGridAmount },
  { key: 'partnerCode',         label: '거래처코드',    filter: 'text' as const },
  { key: 'remark',              label: '비고',         filter: 'text' as const },
]

function Tab2Result({ data }: { data: HometaxPreviewResponse | null }) {
  const [fileIndex, setFileIndex] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [dlError, setDlError] = useState<string | null>(null)
  const [gridMode, setGridMode] = useState(false)

  if (!data) {
    return (
      <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
        Tab 1 에서 처리 실행 후 결과가 표시됩니다.
      </div>
    )
  }

  const { batchNo, batchId, totalRowCount, splitFileCount, rows } = data

  const pageRows: HometaxResultRow[] = rows.map((row, index) => toHometaxResultRow(row, index + 1)).slice(
    fileIndex * PAGE_SIZE,
    (fileIndex + 1) * PAGE_SIZE,
  )

  const handleDownload = async () => {
    setDlError(null)
    setDownloading(true)
    try {
      const blob = await downloadHometaxSplit(batchId, fileIndex)
      triggerDownload(
        blob,
        `홈택스일괄발행_${batchNo}_${fileIndex + 1}of${splitFileCount}.xlsx`,
      )
    } catch {
      setDlError('Excel 다운로드 실패. 다시 시도해 주세요.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 14, color: 'var(--color-neutral-700)' }}>
          배치번호 <strong>{batchNo}</strong> —
          전체 <strong>{totalRowCount.toLocaleString('ko-KR')}</strong>건 /
          파일 {splitFileCount}개 (100건 단위)
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {splitFileCount > 1 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setFileIndex((v) => Math.max(0, v - 1))}
                disabled={fileIndex === 0}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: '1px solid var(--color-neutral-300)',
                  background: 'transparent',
                  cursor: fileIndex === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                }}
                aria-label="이전 파일"
              >
                &#8249;
              </button>
              <span style={{ fontSize: 13 }}>
                {fileIndex + 1} / {splitFileCount}
              </span>
              <button
                type="button"
                onClick={() => setFileIndex((v) => Math.min(splitFileCount - 1, v + 1))}
                disabled={fileIndex === splitFileCount - 1}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: '1px solid var(--color-neutral-300)',
                  background: 'transparent',
                  cursor: fileIndex === splitFileCount - 1 ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                }}
                aria-label="다음 파일"
              >
                &#8250;
              </button>
            </div>
          )}

          <Button
            variant="secondary"
            onClick={() => { void handleDownload() }}
            disabled={downloading}
            data-testid={`batch-result-download-${fileIndex}`}
          >
            {downloading ? '다운로드 중...' : `Excel 다운로드 (${fileIndex + 1}번)`}
          </Button>

          <Button
            variant={gridMode ? 'secondary' : 'ghost'}
            onClick={() => setGridMode((v) => !v)}
            data-testid="batch-result-grid-mode-btn"
            title="열헤더 필터 + 다중 셀 선택 + Ctrl+C 복사"
          >
            {gridMode ? '기본 보기' : 'Excel 보기'}
          </Button>
        </div>
      </div>

      {dlError && (
        <div role="alert" style={{ color: 'var(--color-danger-600)', fontSize: 13, marginBottom: 8 }}>
          {dlError}
        </div>
      )}

      {gridMode ? (
        <div style={{ height: 540 }} data-testid="batch-result-datagrid">
          <DataGrid<HometaxResultRow>
            columns={HOMETAX_GRID_COLUMNS}
            rows={pageRows}
            rowKey={(r) => String(r.rowNo)}
            enableMultiSelect
            enableCopy
            emptyMessage="결과 데이터가 없습니다."
          />
        </div>
      ) : null}

      {!gridMode ? (
        <div style={{ overflowX: 'auto', border: '1px solid var(--color-neutral-200)', borderRadius: 8 }}>
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: 12,
              whiteSpace: 'nowrap',
              minWidth: 1400,
              width: '100%',
            }}
            data-testid="batch-result-table"
          >
            <thead>
              <tr style={{ background: 'var(--color-neutral-50)' }}>
                {(
                  [
                    ['#', '40px'],
                    ['전표번호', '120px'],
                    ['작성일자', '100px'],
                    ['공급자 상호', '140px'],
                    ['공급자 사업자번호', '130px'],
                    ['공급받는자 상호', '140px'],
                    ['공급받는자 사업자번호', '130px'],
                    ['공급받는자 이메일', '160px'],
                    ['공급가액', '110px'],
                    ['세액', '100px'],
                    ['합계', '110px'],
                    ['품목명', '120px'],
                    ['규격', '100px'],
                    ['수량', '70px'],
                    ['단가', '100px'],
                    ['거래처 코드', '100px'],
                    ['비고', '120px'],
                  ] as [string, string][]
                ).map(([label, width]) => (
                  <th
                    key={label}
                    style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--color-neutral-700)',
                      borderBottom: '1px solid var(--color-neutral-200)',
                      minWidth: width,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={17} style={{ padding: 32, textAlign: 'center', color: 'var(--color-neutral-500)' }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={`${row.slipNo}-${row.rowNo}`}
                    style={{ borderBottom: '1px solid var(--color-neutral-100)' }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-neutral-50)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.background = ''
                    }}
                  >
                    <td style={{ padding: '6px 10px', color: 'var(--color-neutral-500)', textAlign: 'right' }}>
                      {row.rowNo}
                    </td>
                    <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>{row.slipNo}</td>
                    <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtDate(row.writeDate)}
                    </td>
                    <td style={{ padding: '6px 10px' }}>{row.supplierName}</td>
                    <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>
                      {row.supplierRegNo}
                    </td>
                    <td style={{ padding: '6px 10px' }}>{row.buyerName}</td>
                    <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>
                      {row.buyerRegNo}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--color-neutral-600)' }}>
                      {row.buyerEmail1 || '—'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtKrw(row.supplyAmount)}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtKrw(row.vatAmount)}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtKrw(row.totalAmount)}
                    </td>
                    <td style={{ padding: '6px 10px' }}>{row.itemName1 || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{row.itemSpec1 || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{row.itemQty1 ?? '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {row.itemPrice1 != null ? fmtKrw(row.itemPrice1) : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>
                      {row.partnerCode}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--color-neutral-600)' }}>
                      {row.remark ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-neutral-500)' }}>
        현재 {fileIndex + 1}번 파일 — {pageRows.length}건 표시
        {splitFileCount > 1 && ` (전체 ${splitFileCount}개 파일)`}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3: 제외 거래처 필터링
// ---------------------------------------------------------------------------

function Tab3Exclusions() {
  const qc = useQueryClient()
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newReason, setNewReason] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['hometax-export', 'exclusions'],
    queryFn: listHometaxExclusions,
  })

  const addMutation = useMutation({
    mutationFn: (req: AddHometaxExclusionRequest) => addHometaxExclusion(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hometax-export', 'exclusions'] })
      setNewCode('')
      setNewName('')
      setNewReason('')
      setAddError(null)
    },
    onError: () => {
      setAddError('추가 실패. 이미 등록된 거래처 코드이거나 서버 오류입니다.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (partnerCode: string) => deleteHometaxExclusion(partnerCode),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hometax-export', 'exclusions'] })
    },
  })

  const handleAdd = () => {
    setAddError(null)
    const code = newCode.trim()
    const name = newName.trim()
    const reason = newReason.trim()
    if (!code) { setAddError('거래처 코드를 입력하세요.'); return }
    if (!name) { setAddError('거래처명을 입력하세요.'); return }
    if (!reason) { setAddError('제외 사유를 입력하세요.'); return }
    addMutation.mutate({ partnerCode: code, partnerName: name, reason })
  }

  const exclusions: HometaxExclusion[] = query.data ?? []

  return (
    <div>
      <h4 style={{ margin: '0 0 20px' }}>제외 거래처 코드 마스터</h4>
      <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', marginBottom: 20 }}>
        여기에 등록된 거래처 코드는 미리보기 생성 시 자동으로 제외됩니다.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 24,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          padding: '16px',
          background: 'var(--color-neutral-50)',
          borderRadius: 8,
          border: '1px solid var(--color-neutral-200)',
        }}
      >
        <Input
          label="거래처 코드"
          placeholder="예: P-001"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          fullWidth={false}
          data-testid="exclusion-add-code"
        />
        <Input
          label="거래처명"
          placeholder="예: 삼성건설(주)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          fullWidth={false}
          data-testid="exclusion-add-name"
        />
        <Input
          label="제외 사유"
          placeholder="예: 자체 발행 처리"
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
          fullWidth={false}
          data-testid="exclusion-add-reason"
        />
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={addMutation.isPending}
          data-testid="exclusion-add-submit"
        >
          추가
        </Button>
      </div>

      {addError && (
        <div role="alert" style={{ color: 'var(--color-danger-600)', fontSize: 13, marginBottom: 12 }}>
          {addError}
        </div>
      )}

      {query.isLoading ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>목록 불러오는 중...</div>
      ) : query.isError ? (
        <div role="alert" style={{ color: 'var(--color-danger-600)', fontSize: 13 }}>
          목록 조회 실패. 다시 시도해 주세요.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--color-neutral-200)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-neutral-50)' }}>
                {['거래처 코드', '거래처명', '제외 사유', '등록일시', '등록자', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--color-neutral-700)',
                      borderBottom: '1px solid var(--color-neutral-200)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exclusions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-neutral-500)' }}>
                    등록된 제외 거래처가 없습니다.
                  </td>
                </tr>
              ) : (
                exclusions.map((ex) => (
                  <tr
                    key={ex.partnerCode}
                    style={{ borderBottom: '1px solid var(--color-neutral-100)' }}
                  >
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                      {ex.partnerCode}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{ex.partnerName}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--color-neutral-600)' }}>
                      {ex.reason}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-neutral-500)', fontVariantNumeric: 'tabular-nums' }}>
                      {ex.createdAt.replace('T', ' ').slice(0, 16)}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12 }}>{ex.createdBy}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <Button
                        variant="danger"
                        onClick={() => deleteMutation.mutate(ex.partnerCode)}
                        disabled={deleteMutation.isPending}
                        data-testid={`exclusion-delete-${ex.partnerCode}`}
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 4: 저장 내역
// ---------------------------------------------------------------------------

function Tab4History({
  onRestore,
}: {
  onRestore: (data: HometaxPreviewResponse) => void
}) {
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['hometax-export', 'history'],
    queryFn: () => listHometaxHistory({ page: 0, size: 20 }),
  })

  const handleRestore = async (batchId: string) => {
    setRestoreError(null)
    setRestoring(batchId)
    try {
      const detail = await getHometaxHistory(batchId)
      onRestore(detail)
    } catch {
      setRestoreError('이력 조회 실패. 다시 시도해 주세요.')
    } finally {
      setRestoring(null)
    }
  }

  const histories: HometaxBatchHistory[] = query.data?.content ?? []

  return (
    <div>
      <h4 style={{ margin: '0 0 20px' }}>저장 내역</h4>
      <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', marginBottom: 20 }}>
        과거 일괄발행 이력입니다. 행 클릭 시 결과 페이지로 복원합니다.
      </p>

      {restoreError && (
        <div role="alert" style={{ color: 'var(--color-danger-600)', fontSize: 13, marginBottom: 12 }}>
          {restoreError}
        </div>
      )}

      {query.isLoading ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>이력 불러오는 중...</div>
      ) : query.isError ? (
        <div role="alert" style={{ color: 'var(--color-danger-600)', fontSize: 13 }}>
          이력 조회 실패. 다시 시도해 주세요.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--color-neutral-200)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-neutral-50)' }}>
                {['배치번호', '처리 기간', '처리일시', '작업자', '총 행 수', '파일 수', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--color-neutral-700)',
                      borderBottom: '1px solid var(--color-neutral-200)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {histories.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--color-neutral-500)' }}>
                    저장된 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                histories.map((h) => (
                  <tr
                    key={h.batchId}
                    style={{ borderBottom: '1px solid var(--color-neutral-100)', cursor: 'pointer' }}
                    onClick={() => { void handleRestore(h.batchId) }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-neutral-50)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.background = ''
                    }}
                    title="클릭하면 결과 페이지로 복원"
                    data-testid={`history-row-${h.batchNo}`}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{h.batchNo}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {h.fromDate} ~ {h.toDate}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {h.processedAt.replace('T', ' ').slice(0, 16)}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{h.processedBy}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {h.totalRowCount.toLocaleString('ko-KR')}건
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {h.splitFileCount}개
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {restoring === h.batchId ? (
                        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>복원 중...</span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--color-primary-600)' }}>결과 보기</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 메인 페이지
// ---------------------------------------------------------------------------

export function HometaxExportPage() {
  usePageTitle('홈택스 일괄 양식')

  const [activeTab, setActiveTab] = useState<TabId>('download')
  const [previewData, setPreviewData] = useState<HometaxPreviewResponse | null>(null)

  /** Tab 1 처리 성공 → previewData 저장 + Tab 2 자동 이동. */
  const handlePreviewSuccess = (data: HometaxPreviewResponse) => {
    setPreviewData(data)
    setActiveTab('result')
  }

  /** Tab 4 행 클릭 → previewData 복원 + Tab 2 이동. */
  const handleHistoryRestore = (data: HometaxPreviewResponse) => {
    setPreviewData(data)
    setActiveTab('result')
  }

  return (
    <>
      {/* PR-H4c FE-A: read-only export 화면 — 변경 이력은 원본 세금계산서 상세에서 확인 */}
      <AuditInfoBanner
        message="이 양식은 ISSUED 세금계산서를 기반으로 생성됩니다. 변경 이력은 각 세금계산서 상세 화면에서 확인할 수 있습니다."
        testId="hometax-export-audit-info-banner"
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>계산서 일괄 등록 양식 (홈택스)</h3>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
            발행 완료 (ISSUED) 세금계산서를 홈택스 표준 컬럼 .xlsx 로 일괄 export 합니다.
          </div>
        </div>
      </div>

      <TabNav
        active={activeTab}
        onSelect={setActiveTab}
        resultDisabled={previewData === null}
      />

      <div data-testid="hometax-export-tab-content">
        {activeTab === 'download' && <Tab0Download />}
        {activeTab === 'preview' && (
          <Tab1Preview onSuccess={handlePreviewSuccess} />
        )}
        {activeTab === 'result' && (
          <Tab2Result data={previewData} />
        )}
        {activeTab === 'exclusions' && <Tab3Exclusions />}
        {activeTab === 'history' && (
          <Tab4History onRestore={handleHistoryRestore} />
        )}
      </div>
    </>
  )
}
