/**
 * 재고이동 관리 화면 — `/transfers`.
 *
 * BE `GET /inventory/transfers` (status 필터 옵션) 호출. 행 클릭 시 상세로.
 *
 * UUID 비공개: transferNo / source code / destination code / status / 사유
 * 만 컬럼에 노출. id 는 navigate 의 path param 으로만 사용.
 *
 * <h2>P1-6 보강 — Excel 다운로드</h2>
 * <ul>
 *   <li>헤더 우측 "Excel 다운로드" 버튼 — `GET /api/v1/inventory/stocks/export`</li>
 *   <li>전 창고 현황 export (warehouseCode 미지정 → BE 가 전 창고 집계)</li>
 *   <li>data-testid: transfer-list-stocks-excel-export</li>
 * </ul>
 */
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  listTransfers,
  TRANSFER_STATUS_LABEL,
  TRANSFER_REASON_LABEL,
  type TransferStatus,
  type TransferSummary,
} from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { exportStocks } from '../api/excelExportApi'
import { useExcelDownload, makeExportFilename } from '../hooks/useExcelDownload'
import { ExcelDownloadError } from '../components/ExcelDownloadError'
import { DocumentNumberLink } from '../components/DocumentNumberLink'

const STATUS_VARIANT: Record<
  TransferStatus,
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  REQUESTED: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'brand',
  SHIPPED: 'brand',
  IN_TRANSIT: 'brand',
  RECEIVED: 'success',
  CONFIRMED: 'success',
  REJECTED: 'danger',
  CANCELED: 'neutral',
}

export function TransferListPage() {
  usePageTitle('재고이동 관리')
  const navigate = useNavigate()
  const { canAccess } = usePermissions()
  const { downloading, download, error: downloadError } = useExcelDownload()

  const query = useQuery({
    queryKey: ['transfers', 'list'],
    queryFn: () => listTransfers({ page: 0, size: 20 }),
  })

  const columns: DataTableColumn<TransferSummary>[] = [
    {
      key: 'transferNo', header: '이동번호', width: '180px', mobilePriority: 'primary',
      render: (row) => <DocumentNumberLink number={row.transferNo} to={row.id ? `/transfers/${row.id}` : ''} />,
    },
    {
      key: 'sourceWarehouseCode',
      header: '출발 창고',
      width: '120px',
      mobilePriority: 'secondary',
      render: (r) => r.sourceWarehouseCode,
    },
    {
      key: 'destinationWarehouseCode',
      header: '도착 창고',
      width: '120px',
      mobilePriority: 'secondary',
      render: (r) => r.destinationWarehouseCode,
    },
    {
      key: 'reason',
      header: '사유',
      width: '120px',
      mobilePriority: 'hidden',
      render: (r) => TRANSFER_REASON_LABEL[r.reason],
    },
    {
      key: 'status',
      header: '상태',
      width: '120px',
      mobilePriority: 'secondary',
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status]}>
          {TRANSFER_STATUS_LABEL[r.status]}
        </Badge>
      ),
    },
    { key: 'reasonDetail', header: '상세', mobilePriority: 'hidden', render: (r) => r.reasonDetail ?? '-' },
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
        <h3 style={{ margin: 0 }}>재고이동 관리</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* P1-6: 전 창고 재고 현황 export */}
          <Button
            variant="secondary"
            size="sm"
            loading={downloading}
            disabled={downloading}
            onClick={() => download(() => exportStocks(), makeExportFilename('재고현황'))}
            data-testid="transfer-list-stocks-excel-export"
          >
            Excel 다운로드
          </Button>
          {/* [P1-A] BE StockTransferController @RequirePermission(page="inventory.transfer") — stock-transfer 코드 불일치 수정 */}
          {canAccess('inventory.transfer', 'create') ? (
            <Button
              variant="primary"
              onClick={() => navigate('/transfers/new')}
              data-testid="transfer-list-add-button"
            >
              새 이동전표
            </Button>
          ) : null}
        </div>
      </div>

      <ExcelDownloadError error={downloadError} testId="transfer-list-stocks-excel-error" />

      <div data-testid="transfer-list-table">
        <DataTable
          columns={columns}
          rows={query.data?.content ?? []}
          loading={query.isLoading}
          rowKey={(t) => t.id}
          onRowClick={(t) => navigate(`/transfers/${t.id}`)}
          emptyMessage="등록된 이동전표가 없습니다."
        />
      </div>

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          이동전표 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}
    </>
  )
}
