/**
 * 관리자 — 거래처 관리 (`/admin/partners`).
 *
 * <p>P0-6 보강:
 * <ul>
 *   <li>복합 필터: 거래처 유형(type) / 상태(status) / 거래액 범위 (미래 슬라이스 준비 — disabled 표시)</li>
 *   <li>[신규 등록] 버튼 → `/admin/partners/new` (PartnerCreatePage) 이동</li>
 *   <li>행 클릭 → PartnerDetailDialog (4탭 상세 + 인라인 편집)</li>
 *   <li>SSE 목록 동기화 — 멀티 워크스테이션 변경 즉시 반영</li>
 * </ul>
 *
 * <p>UUID 비공개 — 모든 식별자는 partnerCode (상호 / 사업자번호 표시 가능).
 *
 * <p>@PreAuthorize — 목록/신규 등록은 SALES / MANAGER / MASTER, Excel/수정은 MANAGER / MASTER.
 *
 * data-testid:
 * - admin-partners-table
 * - admin-partners-search-input
 * - admin-partners-status-filter
 * - admin-partners-type-filter
 * - admin-partners-row-{partnerCode}
 * - admin-partners-realtime-indicator
 * - admin-partners-create-btn
 * - admin-partners-excel-export (P1-6 신규)
 */
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import { exportPartners } from '../../api/excelExportApi'
import { useExcelDownload, makeExportFilename } from '../../hooks/useExcelDownload'
import { ExcelDownloadError } from '../../components/ExcelDownloadError'
import {
  deletePartner,
  listAdminPartners,
  PARTNER_STATUS_LABEL,
  restorePartner,
  type PartnerStatus,
  type PartnerSummary,
} from '../../api/adminApi'
import { extractApiErrorResponseMessage } from '../../api/apiError'
import { PARTNER_TYPE_LABEL, type PartnerType } from '../../api/partnerApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'
import { PartnerListRealtimeClient } from '../../realtime/PartnerListRealtimeClient'
import { importPartnerFile, type PartnerImportResult } from '../../api/partnerImportApi'
import { useCollectionRealtime } from '../../realtime/useCollectionRealtime'
import { PartnerDetailDialog } from './PartnerDetailDialog'
import styles from './PartnersPage.module.css'
import { PartnerImportRejectionPanel } from './PartnerImportRejectionPanel'
import {
  PARTNER_DELETED_ROW_TEXT_STYLE,
  deletedBadgeAriaLabel,
  deletedBadgeLabel,
} from './partnerDeletedRow'

// ---------------------------------------------------------------------------
// 상태 variant 맵
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<
  PartnerStatus,
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'danger',
}

// SSE 목록 동기화용 coarse 무효화 키(안정 참조 — 렌더마다 재구독 방지). 필터/페이지 미포함이라
// 다른 필터/페이지로 캐시된 목록도 prefix 매치로 stale 처리된다(멀티 워크스테이션 반영 목적).
const PARTNER_LIST_REALTIME_KEYS: QueryKey[] = [['admin', 'partners']]

/** KRW 정수 (string 또는 number) → "₩1,234,567" 표시. */
function formatKrw(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '—'
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  if (!Number.isFinite(n)) return '—'
  return '₩' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 거래처 admin 목록 + 4탭 상세 다이얼로그.
 */
export function PartnersPage() {
  usePageTitle('거래처 관리')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canExport = canAccess('partners.edit', 'download')
  const canImport = canAccess('partners.edit', 'create')
  const canDelete = canAccess('partners.delete', 'delete')
  const canRestore = canAccess('partners.delete', 'restore')
  const canCreateFourTab = canAccess('partners.4tab', 'create')
  const canViewFourTab = canAccess('partners.4tab', 'view')

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<PartnerStatus | ''>('')
  const [typeFilter, setTypeFilter] = useState<PartnerType | ''>('')
  const [page, setPage] = useState(0)

  // P1-6: Excel export
  const { downloading, download, error: downloadError } = useExcelDownload()

  // 4탭 상세 다이얼로그 상태
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    null,
  )
  const [selectedPartnerName, setSelectedPartnerName] = useState<string | null>(
    null,
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<PartnerImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  async function handlePartnerFile(file: File | undefined) {
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      const result = await importPartnerFile(file)
      setImportResult(result)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] })
    } catch {
      setImportError('거래처 파일 적재에 실패했습니다. 파일 형식과 권한을 확인하세요.')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const partnerListQueryKey = useMemo<QueryKey>(
    () => ['admin', 'partners', q, statusFilter, typeFilter, page],
    [q, statusFilter, typeFilter, page],
  )
  // ⚠️ 무효화 키는 coarse(위 상수) — 현재 화면의 필터+페이지 tuple 을 넘기면 그 조합만 무효화되고
  // 다른 캐시 페이지는 stale 처리조차 안 된다(라이브싱크 훼손). 안정 참조라 검색 키입력마다 SSE 재접속도 없음.
  useCollectionRealtime(PartnerListRealtimeClient, 'list', PARTNER_LIST_REALTIME_KEYS)

  const query = useQuery({
    queryKey: partnerListQueryKey,
    queryFn: () =>
      listAdminPartners({
        q: q || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        includeDeleted: true,
        page,
        size: 20,
      }),
  })

  const [actionError, setActionError] = useState<string | null>(null)
  const restoreMutation = useMutation({
    mutationFn: restorePartner,
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] })
    },
    onError: (error) =>
      setActionError(
        extractApiErrorResponseMessage(error)
          ?? '복원에 실패했습니다. 거래처 상태 또는 권한(임원실 부서)을 확인하세요.',
      ),
  })
  const deleteMutation = useMutation({
    mutationFn: deletePartner,
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] })
    },
    onError: (error) =>
      setActionError(
        extractApiErrorResponseMessage(error)
          ?? '삭제에 실패했습니다. 거래처 상태 또는 권한(임원실 부서)을 확인하세요.',
      ),
  })

  // partnerCode 재사용으로 동일 코드에 삭제행이 2건 이상이면, 복원 요청은 partnerCode 만으로 특정 행을
  // 지목할 수 없어 BE 가 "가장 최근 삭제행"(ORDER BY deleted_at DESC LIMIT 1)을 복원 → 사용자가 클릭한
  // 행과 다른 거래처가 조용히 복원되는 오복원 위험. 그 코드의 복원 버튼을 비활성화해 원천 차단한다
  // (개별 복원은 후속 deletedAt 기반 restore API 로 확장 예정 — dev-report 백로그).
  const deletedCountByCode = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of query.data?.items ?? []) {
      if (p.isDeleted) counts[p.partnerCode] = (counts[p.partnerCode] ?? 0) + 1
    }
    return counts
  }, [query.data])

  const totalPages = query.data
    ? Math.max(1, Math.ceil(query.data.total / query.data.size))
    : 1

  function openDetail(partner: PartnerSummary) {
    if (partner.isDeleted === true) return
    // BE Partner4TabController 의 path variable 은 partnerCode (UUID 아님).
    // TM PR #141 cross-check 로 정정 — UUID 비공개 가드 + BE 와 1:1 정렬.
    setSelectedPartnerId(partner.partnerCode)
    setSelectedPartnerName(partner.name)
    setDialogOpen(true)
  }

  const columns: DataTableColumn<PartnerSummary>[] = [
    {
      key: 'name',
      header: '상호',
      mobilePriority: 'primary',
      render: (p) => (
        // 이름 span + 삭제배지를 단일 inline-flex 래퍼로 묶어 셀(td)의 자식을 1개로 유지한다.
        // (Fragment 로 형제 2개를 두면 좁은 폭 카드뷰의 justify-content:space-between 이 배지를 우측 끝으로 밀어냄.)
        // 취소선(text-decoration)은 이름 텍스트 span 에만 적용해 배지로 번지지 않게 한다.
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%', minWidth: 0 }}>
          <span
            data-testid={`admin-partners-row-${p.partnerCode}`}
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              ...(p.isDeleted ? PARTNER_DELETED_ROW_TEXT_STYLE : {}),
            }}
          >
            {p.name}
          </span>
          {p.isDeleted ? (
            <Badge
              variant="neutral"
              title={deletedBadgeAriaLabel(p.deletedByName, p.deletedAt)}
              aria-label={deletedBadgeAriaLabel(p.deletedByName, p.deletedAt)}
              data-testid={`admin-partners-row-${p.partnerCode}-deleted-badge`}
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
              {deletedBadgeLabel(p.deletedByName)}
            </Badge>
          ) : null}
        </span>
      ),
    },
    { key: 'partnerCode', header: '거래처 코드', width: '140px', mobilePriority: 'secondary' },
    { key: 'bizNo', header: '사업자번호', width: '140px', mobilePriority: 'hidden' },
    {
      key: 'phone',
      header: '전화',
      width: '140px',
      mobilePriority: 'hidden',
      render: (p) => p.phone ?? '—',
    },
    {
      key: 'status',
      header: '상태',
      width: '110px',
      mobilePriority: 'secondary',
      render: (p) => (
        <Badge
          variant={p.isDeleted ? 'neutral' : STATUS_VARIANT[p.status]}
          aria-label={p.isDeleted ? `삭제됨, 기존 거래 상태 ${PARTNER_STATUS_LABEL[p.status]}` : undefined}
        >
          {p.isDeleted ? '삭제됨' : PARTNER_STATUS_LABEL[p.status]}
        </Badge>
      ),
    },
    {
      key: 'creditLimit',
      header: '신용한도',
      width: '140px',
      align: 'right',
      mobilePriority: 'hidden',
      render: (p) => formatKrw(p.creditLimit),
    },
    {
      key: 'outstandingBalance',
      header: '미수금',
      width: '140px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (p) => formatKrw(p.outstandingBalance),
    },
    {
      key: 'actions',
      header: '',
      width: '96px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (p) => {
        if (p.isDeleted && canRestore) {
          const ambiguousRestore = (deletedCountByCode[p.partnerCode] ?? 0) >= 2
          return (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={restoreMutation.isPending && restoreMutation.variables === p.partnerCode}
              disabled={restoreMutation.isPending || deleteMutation.isPending || ambiguousRestore}
              title={ambiguousRestore
                ? '동일 거래처 코드에 삭제 기록이 여러 건이라 개별 복원이 불가합니다. 관리자에게 문의하세요.'
                : undefined}
              onClick={(event) => {
                event.stopPropagation()
                restoreMutation.mutate(p.partnerCode)
              }}
              data-testid={`admin-partners-row-${p.partnerCode}-restore`}
              aria-label={`${p.name} 거래처 복원`}
            >
              복원
            </Button>
          )
        }
        if (!p.isDeleted && canDelete) {
          return (
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={deleteMutation.isPending && deleteMutation.variables === p.partnerCode}
              disabled={deleteMutation.isPending || restoreMutation.isPending}
              onClick={(event) => {
                event.stopPropagation()
                if (!window.confirm(`${p.name} 거래처를 삭제하시겠습니까?`)) return
                deleteMutation.mutate(p.partnerCode)
              }}
              data-testid={`admin-partners-row-${p.partnerCode}-delete`}
              aria-label={`${p.name} 거래처 삭제`}
            >
              삭제
            </Button>
          )
        }
        return null
      },
    },
  ]

  return (
    <>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>거래처 관리</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            data-testid="admin-partners-realtime-indicator"
            style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}
          >
            실시간 자동 갱신
          </span>
          {/* P1-6: Excel 다운로드 — 현재 검색어(q) + 상태 필터 BE 시그니처와 일치
              (BE PartnerAdminController.exportXlsx(q, status) 는 type 미지원 — TM PR #146 cross-check) */}
          {canExport ? (
            <Button
              variant="secondary"
              size="sm"
              loading={downloading}
              disabled={downloading}
              onClick={() =>
                download(
                  () =>
                    exportPartners({
                      q: q.trim() || undefined,
                      status: statusFilter || undefined,
                    }),
                  makeExportFilename('거래처목록'),
                )
              }
              data-testid="admin-partners-excel-export"
            >
              Excel 다운로드
            </Button>
          ) : null}
          {canImport ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                hidden
                data-testid="admin-partners-import-input"
                onChange={(event) => void handlePartnerFile(event.target.files?.[0])}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={importing}
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
                data-testid="admin-partners-import-btn"
              >
                거래처 파일 적재
              </Button>
            </>
          ) : null}
          {canCreateFourTab ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/admin/partners/new')}
              data-testid="admin-partners-create-btn"
            >
              신규 등록
            </Button>
          ) : null}
        </div>
      </div>

      {/* 필터 바 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="search"
          placeholder="코드 / 상호 / 사업자번호 / 전화 검색"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(0)
          }}
          data-testid="admin-partners-search-input"
          style={filterInputStyle}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as PartnerStatus | '')
            setPage(0)
          }}
          data-testid="admin-partners-status-filter"
          style={filterSelectStyle}
        >
          <option value="">상태 전체</option>
          <option value="ACTIVE">{PARTNER_STATUS_LABEL.ACTIVE}</option>
          <option value="SUSPENDED">{PARTNER_STATUS_LABEL.SUSPENDED}</option>
          <option value="TERMINATED">{PARTNER_STATUS_LABEL.TERMINATED}</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as PartnerType | '')
            setPage(0)
          }}
          disabled
          data-testid="admin-partners-type-filter"
          style={filterSelectStyle}
        >
          <option value="">유형 전체</option>
          {(Object.keys(PARTNER_TYPE_LABEL) as PartnerType[]).map((t) => (
            <option key={t} value={t}>
              {PARTNER_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {actionError ? (
        <div
          className="error-banner"
          role="alert"
          data-testid="admin-partners-action-error"
          style={{ marginBottom: 12, padding: 12, color: 'var(--color-danger-700)' }}
        >
          {actionError}
        </div>
      ) : null}
      <ExcelDownloadError error={downloadError} testId="admin-partners-excel-error" />
      {importError ? <div role="alert" data-testid="admin-partners-import-error">{importError}</div> : null}
      {importResult ? (
        <section aria-label="거래처 적재 결과" data-testid="admin-partners-import-result">
          <h4>거래처 적재 결과</h4>
          <p>
            전체 {importResult.totalRows.toLocaleString()}건 · 신규 {importResult.imported.toLocaleString()}건 · 갱신 {importResult.updated.toLocaleString()}건
          </p>
          {importResult.heldParseFailureRows + importResult.rejectedNullName + importResult.skippedPlaceholder > 0 ? (
            <PartnerImportRejectionPanel sourceFileHash={importResult.sourceFileHash} />
          ) : <p>보류·거부 행이 없습니다.</p>}
        </section>
      ) : null}

      {/* 테이블 */}
      <div data-testid="admin-partners-table">
        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          loading={query.isLoading}
          rowKey={(p) => `${p.partnerCode}:${p.isDeleted ? `D:${p.deletedAt ?? 'unknown'}` : 'A'}`}
          rowClickable={(p) => canViewFourTab && p.isDeleted !== true}
          rowClassName={(p) => (p.isDeleted ? styles.deletedRow : undefined)}
          emptyMessage="조건에 맞는 거래처가 없습니다."
          onRowClick={canViewFourTab ? openDetail : undefined}
        />
      </div>

      {/* 페이지네이션 */}
      {query.data && totalPages > 1 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            marginTop: 16,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => p - 1)}
            style={pagerBtnStyle}
          >
            이전
          </button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={pagerBtnStyle}
          >
            다음
          </button>
        </div>
      ) : null}

      {/* 4탭 상세 다이얼로그 */}
      <PartnerDetailDialog
        partnerId={selectedPartnerId}
        partnerName={selectedPartnerName}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setSelectedPartnerId(null)
          setSelectedPartnerName(null)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// 공통 스타일
// ---------------------------------------------------------------------------

const filterInputStyle: React.CSSProperties = {
  flex: '1 1 280px',
  minWidth: 240,
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  fontSize: 13,
}

const filterSelectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  fontSize: 13,
}

const pagerBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  border: '1px solid var(--line-default)',
  borderRadius: 4,
  background: 'var(--surface-card)',
  cursor: 'pointer',
  fontSize: 13,
}
