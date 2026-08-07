/**
 * 알리고 주소록 자동 동기화 API 클라이언트 — Phase 10 PR-F1 FE-1.
 *
 * <p>BE 출처:
 * <ul>
 *   <li>partner-service commit f3b313a {@code PartnerAdminController#exportAligoCsv}
 *       — GET {@code /admin/partners/export/aligo-csv} (binary CSV, UTF-8 BOM)</li>
 *   <li>notification-service commit f3b313a {@code AligoAddressBookController#sync}
 *       — POST {@code /admin/notification/aligo/address-book/sync} → 4 카테고리
 *       응답 {@code {added, updated, skipped, failed: [...]}}</li>
 * </ul>
 *
 * <p>legacy GAS 9번 ("알리고 자동 업로드") 1단계 자동화. 운영자가 알리고 콘솔에 직접
 * 업로드하던 SF벤더 그룹 CSV 를 partner-service 에서 자동 생성 (Part A) + native API sync
 * (Part B, 현 단계 외부 미전달 mock — 알리고 실 spec 후 실 전달 상태로 전환).
 *
 * <h2>권한</h2>
 * <p>FE 진입은 {@code aligo.address-book} VIEW, sync 호출은 BE {@code @RequirePermission}
 * UPDATE 기준.
 *
 * <h2>UUID 비공개</h2>
 * <p>본 도메인은 partnerCode / partnerName / phone / group 등 비즈니스 식별자만 다룸.
 * partner-service 의 CSV 응답도 UUID 미포함 (PartnerAligoExportService 가 생략).
 */
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// Sync 응답 타입 (BE wire-format 과 1:1)
// ---------------------------------------------------------------------------

/**
 * 알리고 주소록 sync 응답 — BE {@code AligoAddressBookSyncResponse} 와 1:1.
 *
 * @property added 실제 외부 전달 후 알리고가 신규 추가한 contact 수
 * @property updated 실제 외부 전달 후 알리고가 갱신한 contact 수
 * @property skipped 알리고 측 중복 / 잘못된 형식으로 skip 된 수
 * @property failed 실패 chunk 메시지 리스트 (sample memo + HTTP status 포함)
 * @property deliveryStatus 외부 알리고 전달 상태
 */
export type AligoAddressBookDeliveryStatus =
  | 'NOT_DELIVERED'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'

export interface AligoAddressBookSyncResponse {
  added: number
  updated: number
  skipped: number
  failed: string[]
  deliveryStatus: AligoAddressBookDeliveryStatus
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

/**
 * 알리고 SF벤더 그룹 CSV (UTF-8 BOM 포함) 다운로드.
 *
 * <p>partner-service 가 활성 거래처 + 차단 제외 + 휴대폰 정규화한 CSV 를 binary 로
 * 응답한다. 호출자는 Blob 을 createObjectURL → anchor click 으로 사용자 다운로드를
 * 트리거한다 (한국어 파일명은 {@link buildAligoCsvFilename} 사용).
 *
 * @return .csv Blob (Content-Type {@code text/csv; charset=UTF-8}, UTF-8 BOM 포함)
 */
export async function exportAligoCsv(): Promise<Blob> {
  const res = await apiClient.get<Blob>(
    '/admin/partners/export/aligo-csv',
    {
      responseType: 'blob',
      // 거래처 fetch + CSV 직렬화 → 기본 10s 보다 여유.
      timeout: 60_000,
    },
  )
  return res.data
}

/**
 * 알리고 주소록 sync 실행.
 *
 * <p>현 단계 BE 구현 = 외부 미전달 mock (MockAligoAddressBookClient). 알리고 실 API spec
 * 사용자 결정 후 RestClient 구현체 교체 — {@code deliveryStatus} 가 자동으로 실 전달 상태가 된다.
 *
 * <p>현 시점은 BE 가 항상 외부 미전달 mock 으로 동작하므로 group 파라미터는 미사용
 * (BE controller 가 받지 않음).
 * 후속 슬라이스에서 group 필터 BE 추가 시 본 wrapper 시그니처 확장.
 *
 * @return 4 카테고리 누적 결과 ({@link AligoAddressBookSyncResponse})
 */
export async function syncAligoAddressBook(): Promise<AligoAddressBookSyncResponse> {
  const res = await apiClient.post<ApiEnvelope<AligoAddressBookSyncResponse>>(
    '/admin/notification/aligo/address-book/sync',
    null,
    {
      // chunk 50 + 429 backoff → 기본 10s 보다 여유.
      timeout: 60_000,
    },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 한국어 파일명 빌더 (사용자 노출)
// ---------------------------------------------------------------------------

/**
 * 한국어 파일명 빌더 — `알리고_주소록_YYYY-MM-DD.csv`.
 *
 * <p>피드백 — 한국어 파일명 의무 (사용자 노출 파일명).
 *
 * @param date ISO YYYY-MM-DD (기본 오늘)
 */
export function buildAligoCsvFilename(date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10)
  return `알리고_주소록_${d}.csv`
}
