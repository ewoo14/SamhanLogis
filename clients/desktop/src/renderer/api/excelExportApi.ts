/**
 * Excel export API 클라이언트 — P1-6 슬라이스.
 *
 * <p>BE 신규 4개 endpoint 에 대한 blob 다운로드 함수.
 * 모든 함수는 `responseType: 'blob'` 로 이진 스트림을 수신하며,
 * 호출 측 (ExcelDownloadButton) 이 triggerDownload 로 파일 저장을 수행한다.
 *
 * <p>endpoint 목록 (API Gateway StripPrefix=2 → 각 마이크로서비스 controller path):
 * <ul>
 *   <li>GET /api/v1/partners/admin/partners/export.xlsx        → partner-service @RequestMapping("/admin/partners")</li>
 *   <li>GET /api/v1/slips/slips/export.xlsx                    → slip-service @RequestMapping("/slips")</li>
 *   <li>GET /api/v1/accounting/accounting/journals/export.xlsx → accounting-service @RequestMapping("/accounting/journals")</li>
 *   <li>GET /api/v1/inventory/inventory/stocks/export.xlsx     → inventory-service @RequestMapping("/inventory") + @GetMapping("/stocks/export.xlsx")</li>
 * </ul>
 *
 * <p>TM PR #146 cross-check fix — 본 4 endpoint 의 path / query param 을 BE controller 와 1:1 정렬.
 *
 * <p>UUID 비공개 가드 (memory feedback_uuid_no_user_visibility):
 * 본 슬라이스 FE 사용처 (TransferListPage) 는 warehouseId 인자를 보내지 않으므로 (전 창고 export 만)
 * BE 가 받는 UUID warehouseId 가 사용자 화면에 노출되지 않는다.
 *
 * <p>mock 모드 (VITE_MOCK_MODE=1): getMockExcelBlob() 로 CSV blob 반환.
 */
import { apiClient } from './client'
import type { PartnerStatus } from './adminApi'
import type { SlipType } from './slip'
import type { JournalStatus } from '@samhan/design-system'
import { isMockMode } from './mock'
import {
  MOCK_PARTNERS_EXPORT_CSV,
  MOCK_SLIPS_EXPORT_CSV,
  MOCK_JOURNALS_EXPORT_CSV,
  MOCK_STOCKS_EXPORT_CSV,
} from './excelExportMock'

// ---------------------------------------------------------------------------
// 파라미터 타입 — BE controller 시그니처와 1:1
// ---------------------------------------------------------------------------

/**
 * 거래처 목록 export 파라미터 — BE PartnerAdminController.exportXlsx(q, status).
 *
 * @property q       partnerCode/name/bizNo/phone LIKE 검색어 (BE PartnerRepository.searchAdmin)
 * @property status  거래 상태 enum
 */
export interface PartnersExportParams {
  q?: string
  status?: PartnerStatus
}

/**
 * 전표 목록 export 파라미터 — BE SlipController.exportXlsx(slipType, status, from, to, partnerCode).
 *
 * @property slipType    OUTBOUND / INBOUND
 * @property status      DRAFT / SAVED / SENT / ACCEPTED / ... / CONFIRMED / REJECTED / CANCELED
 * @property from        전표일자 시작 (ISO yyyy-MM-dd)
 * @property to          전표일자 종료 (ISO yyyy-MM-dd)
 * @property partnerCode 거래처코드 정확 일치
 */
export interface SlipsExportParams {
  slipType?: SlipType
  status?: string
  from?: string
  to?: string
  partnerCode?: string
}

/**
 * 분개장 export 파라미터 — BE JournalController.exportXlsx(from, to, status).
 *
 * <p>from/to 는 BE 가 필수로 받음 (@RequestParam without required=false). FE 호출 측에서 항상 전달.
 *
 * @property from   분개일자 시작 (ISO yyyy-MM-dd, 필수)
 * @property to     분개일자 종료 (ISO yyyy-MM-dd, 필수)
 * @property status DRAFT / POSTED / REVERSED (선택)
 */
export interface JournalsExportParams {
  from: string
  to: string
  status?: JournalStatus
}

/**
 * 재고 현황 export 파라미터 — BE StockController.exportXlsx(warehouseId).
 *
 * <p>BE 는 UUID warehouseId 를 받지만, FE 사용처 (TransferListPage) 는 전 창고 export 만 수행하므로
 * 본 슬라이스에서는 인자를 비워 호출 (UUID 노출 0). 향후 창고별 export 도입 시 별도 슬라이스에서
 * BE 가 warehouseCode → id 변환 endpoint 를 추가하는 것이 바람직.
 */
export interface StocksExportParams {
  warehouseId?: string
}

// ---------------------------------------------------------------------------
// API 함수 — 모두 Blob 반환
// ---------------------------------------------------------------------------

/**
 * 거래처 목록 Excel export.
 *
 * `GET /api/v1/partners/admin/partners/export.xlsx?q&status`
 *
 * @param params 필터 조건 (q / status). 미전달 시 전체.
 * @returns Excel Blob (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
 */
export async function exportPartners(
  params?: PartnersExportParams,
): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_PARTNERS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>(
    '/api/v1/partners/admin/partners/export.xlsx',
    {
      params,
      responseType: 'blob',
    },
  )
  return res.data
}

/**
 * 전표 목록 Excel export.
 *
 * `GET /api/v1/slips/slips/export.xlsx?slipType&status&from&to&partnerCode`
 *
 * @param params 필터.
 * @returns Excel Blob
 */
export async function exportSlips(params?: SlipsExportParams): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_SLIPS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>(
    '/api/v1/slips/slips/export.xlsx',
    {
      params,
      responseType: 'blob',
    },
  )
  return res.data
}

/**
 * 분개장 Excel export.
 *
 * `GET /api/v1/accounting/accounting/journals/export.xlsx?from&to&status`
 *
 * @param params from/to (필수) + status 필터.
 * @returns Excel Blob
 */
export async function exportJournals(
  params: JournalsExportParams,
): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_JOURNALS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>(
    '/api/v1/accounting/accounting/journals/export.xlsx',
    {
      params,
      responseType: 'blob',
    },
  )
  return res.data
}

/**
 * 재고 현황 Excel export.
 *
 * `GET /api/v1/inventory/inventory/stocks/export.xlsx?warehouseId`
 *
 * @param params warehouseId (선택, 미지정 시 전 창고).
 * @returns Excel Blob
 */
export async function exportStocks(params?: StocksExportParams): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_STOCKS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>(
    '/api/v1/inventory/inventory/stocks/export.xlsx',
    {
      params,
      responseType: 'blob',
    },
  )
  return res.data
}

// ---------------------------------------------------------------------------
// 내부 유틸
// ---------------------------------------------------------------------------

/** CSV 문자열을 UTF-8 Blob 으로 변환. */
function csvBlob(csv: string): Blob {
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' })
}
