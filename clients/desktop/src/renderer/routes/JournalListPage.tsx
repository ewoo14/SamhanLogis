/**
 * 분개장 목록 화면 (`/accounting/journals`).
 *
 * 분개 페이지 조회 + 상태 필터. 행 클릭 시 분개 상세로 이동.
 *
 * 권한:
 * - 진입: ACCOUNTANT / MASTER (RouteGuard)
 * - "새 분개" 버튼: ACCOUNTANT / MASTER
 *
 * UUID 비공개 가드: 컬럼에 ID 미포함. 사용자에게는 `journalNo` (예: `2026/05/08-1`)
 * 만 노출. 라우팅 path 만 UUID 사용.
 *
 * <h2>P1-6 보강 — Excel 다운로드</h2>
 * <ul>
 *   <li>헤더 우측 "Excel 다운로드" 버튼 — `GET /api/v1/accounting/journals/export`</li>
 *   <li>파라미터: status 필터만 연동 — 화면에 기간 필터 UI 가 없으므로 from/to 는 보내지
 *       않는다(전체 기간, #907 재수렴 R 에서 당월 하드코딩이 P-2 위반으로 지적됨)</li>
 *   <li>data-testid: journal-list-excel-export</li>
 * </ul>
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  JournalStatusBadge,
  safeActorName,
  type DataTableColumn,
  type JournalStatus,
} from '@samhan/design-system'
import {
  listJournals,
  type JournalSummary,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'
import { exportJournals } from '../api/excelExportApi'
import { useExcelDownload, makeExportFilename } from '../hooks/useExcelDownload'
import { ExcelDownloadError } from '../components/ExcelDownloadError'
import { usePermissions } from '../hooks/usePermissions'

/** 상태 필터 옵션 (검색 셀렉트). */
const STATUS_OPTIONS: Array<{
  value: JournalStatus | ''
  label: string
}> = [
  { value: '', label: '전체' },
  { value: 'DRAFT', label: '임시저장' },
  { value: 'POSTED', label: '확정' },
  { value: 'REVERSED', label: '역분개' },
]

/** KRW 정수 string → "₩1,234,567" 표시. */
const formatKrw = (raw: string): string => {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return raw
  return '₩' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function JournalListPage() {
  const navigate = useNavigate()
  const { canAccess } = usePermissions()
  const [statusFilter, setStatusFilter] = useState<JournalStatus | ''>('')

  // P1-6: Excel export
  const { downloading, download, error: downloadError } = useExcelDownload()

  usePageTitle('분개장')

  const query = useQuery({
    queryKey: ['accounting', 'journals', 'list', statusFilter],
    queryFn: () =>
      listJournals({
        page: 0,
        size: 20,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
  })

  const columns: DataTableColumn<JournalSummary>[] = [
    {
      key: 'journalNo',
      header: '분개번호',
      width: '160px',
      mobilePriority: 'primary',
    },
    {
      key: 'status',
      header: '상태',
      width: '110px',
      mobilePriority: 'secondary',
      render: (row) => <JournalStatusBadge status={row.status} />,
    },
    {
      key: 'description',
      header: '적요',
      mobilePriority: 'hidden',
      render: (row) => row.description ?? '—',
    },
    {
      key: 'totalDebit',
      header: '차변 합계',
      width: '140px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (row) => formatKrw(row.totalDebit),
    },
    {
      key: 'totalCredit',
      header: '대변 합계',
      width: '140px',
      align: 'right',
      mobilePriority: 'hidden',
      render: (row) => formatKrw(row.totalCredit),
    },
    {
      key: 'createdByName',
      header: '작성자',
      width: '100px',
      mobilePriority: 'hidden',
      render: (row) => safeActorName(row.createdByName) ?? '—',
    },
  ]

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0 }}>분개장</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: '#374151' }}>
            상태:&nbsp;
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as JournalStatus | '')
              }
              style={{
                height: 32,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid #D1D5DB',
                fontSize: 13,
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {/* P1-6: 현재 상태 필터 기준 export. 분개장 화면 자체에 기간 필터 UI 가 없으므로
              (상태 필터만 존재, 전체 기간 조회) from/to 를 보내지 않는다 — 당월로 임의로
              좁히면 화면에 없는 조건을 파일이 만드는 것(P-2 위반, #907 재수렴 R 에서 발견:
              화면은 전체 115건인데 당월 export 는 그 중 일부만 포함). BE 는 from/to 미지정 시
              GET /accounting/journals 목록 조회와 동일한 개방구간 기본값("전체 조회")을 적용한다. */}
          <Button
            variant="secondary"
            size="sm"
            loading={downloading}
            disabled={downloading}
            onClick={() =>
              download(
                () =>
                  exportJournals({
                    status: statusFilter || undefined,
                  }),
                makeExportFilename('분개장'),
              )
            }
            data-testid="journal-list-excel-export"
          >
            Excel 다운로드
          </Button>
          {canAccess('accounting.journals', 'create') ? (
            <Button
              variant="primary"
              onClick={() => navigate('/accounting/journals/new')}
            >
              새 분개
            </Button>
          ) : null}
        </div>
      </div>

      <ExcelDownloadError error={downloadError} testId="journal-list-excel-error" />

      <DataTable
        columns={columns}
        rows={query.data?.content ?? []}
        loading={query.isLoading}
        rowKey={(j) => j.id}
        onRowClick={(j) => navigate(`/accounting/journals/${j.id}`)}
        emptyMessage="등록된 분개가 없습니다."
      />

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          분개장을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}
    </>
  )
}
