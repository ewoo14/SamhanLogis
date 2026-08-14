/**
 * Excel export API 클라이언트 — P1-6 슬라이스.
 *
 * <p>BE 신규 4개 endpoint 에 대한 blob 다운로드 함수.
 * 모든 함수는 `responseType: 'blob'` 로 이진 스트림을 수신하며,
 * 호출 측 (ExcelDownloadButton) 이 triggerDownload 로 파일 저장을 수행한다.
 *
 * <p>endpoint 목록 (API Gateway no-prefix route → 각 마이크로서비스 controller path):
 * <ul>
 *   <li>GET /admin/partners/export.xlsx        → partner-service @RequestMapping("/admin/partners")</li>
 *   <li>GET /slips/export.xlsx                  → slip-service @RequestMapping("/slips")</li>
 *   <li>GET /accounting/journals/export.xlsx   → accounting-service @RequestMapping("/accounting/journals")</li>
 *   <li>GET /inventory/stocks/export.xlsx      → inventory-service @RequestMapping("/inventory") + @GetMapping("/stocks/export.xlsx")</li>
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
 * 전표 목록 export 파라미터 — BE SlipController.exportXlsx(slipType, status, from, to, partnerCode,
 * deliveryTag, includeDeleted, search*).
 *
 * <p>2026-07 OPUS 재수렴 fix — 화면 검색/필터가 export 에 전량 누락되어 있던 결함 수정
 * (판매관리/구매관리 검색모달 + 출고전표목록 배송태그). BE 가 이미 화면 조회에 쓰는
 * {@code SlipQueryService.listForQuery}(검색 필드) / {@code SlipService.list}(deliveryTag +
 * includeDeleted) 를 export 에도 그대로 위임하므로 신규 SQL/Specification 은 없다.
 *
 * @property slipType              OUTBOUND / INBOUND
 * @property status                DRAFT / SAVED / SENT / ACCEPTED / ... / CONFIRMED / REJECTED / CANCELED
 * @property from                  전표일자 시작 (ISO yyyy-MM-dd, 미지정 시 하한 없음)
 * @property to                    전표일자 종료 (ISO yyyy-MM-dd, 미지정 시 상한 없음)
 * @property partnerCode           거래처코드 정확 일치
 * @property deliveryTag           배송태그 필터 — SlipListPage 배송태그 셀렉트 값
 * @property includeDeleted        soft-delete 포함 여부 — 출고전표 목록(OUTBOUND) 화면 파리티용
 * @property searchPartnerName     거래처명 부분 검색 — 판매/구매관리 검색모달
 * @property searchPartnerCode     거래처코드 부분 검색
 * @property searchBusinessNumber  사업자등록번호 부분 검색
 * @property searchSlipNo          전표번호 부분 검색
 * @property searchProjectName     프로젝트명 부분 검색
 * @property searchDeliveryAddress 배송주소 부분 검색
 */
export interface SlipsExportParams {
  slipType?: SlipType
  status?: string
  from?: string
  to?: string
  partnerCode?: string
  deliveryTag?: string
  includeDeleted?: boolean
  searchPartnerName?: string
  searchPartnerCode?: string
  searchBusinessNumber?: string
  searchSlipNo?: string
  searchProjectName?: string
  searchDeliveryAddress?: string
}

/**
 * 분개장 export 파라미터 — BE JournalController.exportXlsx(from, to, status).
 *
 * <p>2026-07 OPUS 재수렴 fix — from/to 는 이제 BE 가 선택으로 받는다({@code required=false}).
 * 분개장 화면(JournalListPage) 자체에 기간 필터 UI 가 없으므로(상태 필터만 존재), 미지정 시
 * BE `GET /accounting/journals` 목록 조회가 이미 쓰는 개방구간 기본값(1900-01-01~9999-12-31,
 * "기간 미지정 시 전체 조회")과 동일하게 적용되어 화면·파일의 범위가 일치한다.
 *
 * @property from   분개일자 시작 (ISO yyyy-MM-dd, 선택 — 미지정 시 하한 없음)
 * @property to     분개일자 종료 (ISO yyyy-MM-dd, 선택 — 미지정 시 상한 없음)
 * @property status DRAFT / POSTED / REVERSED (선택)
 */
export interface JournalsExportParams {
  from?: string
  to?: string
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
 * `GET /admin/partners/export.xlsx?q&status`
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
    '/admin/partners/export.xlsx',
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
 * `GET /slips/export.xlsx?slipType&status&from&to&partnerCode`
 *
 * @param params 필터.
 * @returns Excel Blob
 */
export async function exportSlips(params?: SlipsExportParams): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_SLIPS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>(
    '/slips/export.xlsx',
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
 * `GET /accounting/journals/export.xlsx?from&to&status`
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
    '/accounting/journals/export.xlsx',
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
 * `GET /inventory/stocks/export.xlsx?warehouseId`
 *
 * @param params warehouseId (선택, 미지정 시 전 창고).
 * @returns Excel Blob
 */
export async function exportStocks(params?: StocksExportParams): Promise<Blob> {
  if (isMockMode()) {
    return csvBlob(MOCK_STOCKS_EXPORT_CSV)
  }
  const res = await apiClient.get<Blob>(
    '/inventory/stocks/export.xlsx',
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
