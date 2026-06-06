/**
 * 운송사 실배차 비교 API 클라이언트 — Phase 10 PR-F1 FE-2.
 *
 * <p>BE 출처: arologis-service commit bb30725
 * {@code DispatchReconcileController#reconcile} —
 * POST {@code /admin/arologis/dispatch/reconcile} (multipart 다중 vendor 엑셀).
 *
 * <p>legacy GAS 11번 ("운송사-실배차내역 비교") 이식. 운송사가 발행한 vendor 엑셀
 * (CJ대한통운 / 롯데 / 한진 등) 을 다중 업로드 + 자체 dispatch 자동 조회 기간 (from/to)
 * → (날짜 + 슬립번호) left-join → TRUE / FALSE_LEFT / FALSE_RIGHT 분류.
 *
 * <h2>권한</h2>
 * <p>[C5 후속] FE 화면 진입은 라우트 PermissionGuard {@code arologis.dispatch.ops} (view) —
 * BE @RequirePermission 과 1:1. 구 role 헬퍼/ROLES 상수는 제거.
 *
 * <h2>UUID 비공개</h2>
 * <p>응답 wire-format 에서 UUID 가 제거된 상태 (dispatchId / vehicleId / stopId 미노출).
 * 사용자 노출 식별자 = slipNo / dispatchDate / vendorName / partnerName 만.
 *
 * <h2>사용자 명시 가드</h2>
 * <p>"운송사 엑셀 자동 수집 X — 사용자가 .xlsx 직접 업로드". 자체 dispatch 만 자동 조회
 * (DispatchRepository.findAllByDispatchDateBetween).
 */
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// 타입 (BE wire-format 과 1:1)
// ---------------------------------------------------------------------------

/**
 * mismatch 1행 분류 — BE {@code MismatchedRow.Status} enum 과 1:1.
 *
 * <ul>
 *   <li>{@code TRUE} — 양쪽 모두 존재 (matchedCount 로만 카운트, 응답 미포함)</li>
 *   <li>{@code FALSE_LEFT} — 우리 dispatch 만 존재, 운송사 엑셀 누락</li>
 *   <li>{@code FALSE_RIGHT} — 운송사 엑셀만 존재, 우리 dispatch 누락</li>
 * </ul>
 */
export type ReconcileStatus = 'TRUE' | 'FALSE_LEFT' | 'FALSE_RIGHT'

/**
 * mismatch 1행 — BE {@code MismatchedRow} record 와 1:1.
 *
 * @property status        분류 (FALSE_LEFT / FALSE_RIGHT). TRUE 행은 응답 미포함.
 * @property slipNo        슬립/운송장 번호 (매칭 키 1, 사용자 노출 식별자)
 * @property dispatchDate  배차/접수 일자 (매칭 키 2, ISO YYYY-MM-DD)
 * @property vendorName    운송사 식별자 (FALSE_RIGHT = 엑셀 vendor / FALSE_LEFT = null 가능)
 * @property expectedTime  운송사 기록 접수/발송 시각 (FALSE_RIGHT 시만, ISO HH:mm[:ss])
 * @property actualTime    우리 dispatch 의 실제 도착 시각 (FALSE_LEFT 시만, ISO HH:mm[:ss])
 * @property partnerName   업체명 (양쪽 중 알 수 있는 값)
 * @property reason        한국어 사유 ("운송사 엑셀 누락" / "자체 dispatch 누락")
 */
export interface MismatchedRow {
  status: ReconcileStatus
  slipNo: string
  dispatchDate: string
  vendorName: string | null
  expectedTime: string | null
  actualTime: string | null
  partnerName: string | null
  reason: string
}

/**
 * 비교 응답 — BE {@code DispatchReconcileResponse} record 와 1:1.
 *
 * @property from           조회 시작일 echo (ISO YYYY-MM-DD)
 * @property to             조회 종료일 echo
 * @property vendorCount    업로드된 운송사 엑셀 파일 수 (parse 성공 vendor 만 카운트)
 * @property dispatchCount  자체 자동 조회된 dispatch 라인 수
 * @property vendorRowCount 운송사 엑셀 라인 합계 (전 vendor 총합)
 * @property matchedCount   양쪽 매칭 성공 행수 (Status.TRUE)
 * @property mismatchedRows FALSE_LEFT + FALSE_RIGHT 행 목록
 */
export interface DispatchReconcileResponse {
  from: string
  to: string
  vendorCount: number
  dispatchCount: number
  vendorRowCount: number
  matchedCount: number
  mismatchedRows: MismatchedRow[]
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

/**
 * 운송사 실배차 비교 — multipart 다중 vendor 엑셀 + 자체 dispatch 자동 조회.
 *
 * <p>각 파일은 {@code files} multipart 파트에 동일 이름으로 다중 첨부 (Spring
 * {@code @RequestParam("files") List<MultipartFile>} 규약).
 *
 * @param files 운송사 엑셀 (.xlsx) 다중 (최소 1개, 파일당 최대 50MB)
 * @param from  자체 dispatch 자동 조회 시작일 (ISO YYYY-MM-DD)
 * @param to    자체 dispatch 자동 조회 종료일 (ISO YYYY-MM-DD, from 이후)
 * @return 매칭 통계 + mismatch 행 상세
 */
export async function reconcileDispatch(
  files: File[],
  from: string,
  to: string,
): Promise<DispatchReconcileResponse> {
  const form = new FormData()
  for (const f of files) {
    // 동일 키로 다중 append → Spring List<MultipartFile> 매핑.
    form.append('files', f)
  }
  form.append('from', from)
  form.append('to', to)
  const res = await apiClient.post<ApiEnvelope<DispatchReconcileResponse>>(
    '/admin/arologis/dispatch/reconcile',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      // 엑셀 파싱 (POI) + slip-service 자동 조회 → 기본 10s 보다 여유.
      timeout: 120_000,
    },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 권한 헬퍼 (BE @PreAuthorize 와 일치 — feedback_role_naming_full.md 풀네임)
// ---------------------------------------------------------------------------

// [C5 후속 사이클1] canAccessDispatchReconcile / ARO_DISPATCH_RECONCILE_ROLES 제거 —
// 진입 판정은 라우트 PermissionGuard + 사이드바 dynamicCanAccess('arologis.dispatch.ops','view') 단일 소스.

// ---------------------------------------------------------------------------
// 표시용 헬퍼 (status 한국어 라벨 / 색상 — Designer mock 보존)
// ---------------------------------------------------------------------------

/** mismatch 분류 → 한국어 라벨. Designer mock 일관 (TRUE 는 매칭만, 응답 행 미포함). */
export const RECONCILE_STATUS_LABEL: Record<ReconcileStatus, string> = {
  TRUE: '일치',
  FALSE_LEFT: '운송사 누락',
  FALSE_RIGHT: '우리 누락',
}
