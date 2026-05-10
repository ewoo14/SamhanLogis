/**
 * Excel export API 클라이언트 — P1-6 슬라이스.
 *
 * <p>BE 신규 4개 endpoint 에 대한 blob 다운로드 함수.
 * 모든 함수는 `responseType: 'blob'` 로 이진 스트림을 수신하며,
 * 호출 측 (ExcelDownloadButton) 이 triggerDownload 로 파일 저장을 수행한다.
 *
 * <p>endpoint 목록 (API Gateway → 각 마이크로서비스):
 * <ul>
 *   <li>GET /api/v1/partners/export?type&amp;status          → partner-service</li>
 *   <li>GET /api/v1/slips/export?fromDate&amp;toDate&amp;slipType → slip-service</li>
 *   <li>GET /api/v1/accounting/journals/export?period       → accounting-service</li>
 *   <li>GET /api/v1/inventory/stocks/export?warehouseCode   → inventory-service</li>
 * </ul>
 *
 * <p>UUID 비공개 가드: 쿼리 파라미터에 UUID 사용 금지.
 * warehouseId 대신 warehouseCode 사용 (inventory-service 가 code→id 내부 변환).
 *
 * <p>mock 모드 (VITE_MOCK_MODE=1): getMockExcelBlob() 로 CSV blob 반환.
 */
import { apiClient } from './client'
import type { PartnerType } from './partnerApi'
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
// 파라미터 타입
// ---------------------------------------------------------------------------

/** 거래처 목록 export 파라미터. */
export interface PartnersExportParams {
  type?: PartnerType
  status?: PartnerStatus
}

/** 전표 목록 export 파라미터. */
export interface SlipsExportParams {
  fromDate?: string  // ISO yyyy-MM-dd
  toDate?: string    // ISO yyyy-MM-dd
  slipType?: SlipType
}

/** 분개장 export 파라미터. */
export interface JournalsExportParams {
  period?: string    // YYYYMM
  status?: JournalStatus
}

/** 재고 현황 export 파라미터. */
export interface StocksExportParams {
  /**
   * 창고 코드 — UUID 대신 코드 사용 (UUID 비공개 가드).
   * 미전달 시 전 창고.
   */
  warehouseCode?: string
}

// ---------------------------------------------------------------------------
// API 함수 — 모두 Blob 반환
// ---------------------------------------------------------------------------

/**
 * 거래처 목록 Excel export.
 *
 * `GET /api/v1/partners/export?type&status`
 *
 * @param params 필터 조건 (type / status). 미전달 시 전체.
 * @returns Excel Blob (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
 */
export async function exportPartners(
  params?: PartnersExportParams,
): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_PARTNERS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>('/api/v1/partners/export', {
    params,
    responseType: 'blob',
  })
  return res.data
}

/**
 * 전표 목록 Excel export.
 *
 * `GET /api/v1/slips/export?fromDate&toDate&slipType`
 *
 * @param params 날짜 범위 + slipType 필터.
 * @returns Excel Blob
 */
export async function exportSlips(params?: SlipsExportParams): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_SLIPS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>('/api/v1/slips/export', {
    params,
    responseType: 'blob',
  })
  return res.data
}

/**
 * 분개장 Excel export.
 *
 * `GET /api/v1/accounting/journals/export?period`
 *
 * @param params period (YYYYMM) + status 필터.
 * @returns Excel Blob
 */
export async function exportJournals(
  params?: JournalsExportParams,
): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_JOURNALS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>('/api/v1/accounting/journals/export', {
    params,
    responseType: 'blob',
  })
  return res.data
}

/**
 * 재고 현황 Excel export.
 *
 * `GET /api/v1/inventory/stocks/export?warehouseCode`
 *
 * @param params warehouseCode (UUID 비공개 가드 — code 전달).
 * @returns Excel Blob
 */
export async function exportStocks(params?: StocksExportParams): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_STOCKS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>('/api/v1/inventory/stocks/export', {
    params,
    responseType: 'blob',
  })
  return res.data
}

// ---------------------------------------------------------------------------
// 내부 유틸
// ---------------------------------------------------------------------------

/** CSV 문자열을 UTF-8 Blob 으로 변환. */
function csvBlob(csv: string): Blob {
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' })
}
