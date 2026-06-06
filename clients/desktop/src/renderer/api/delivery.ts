/**
 * 배송 묶음 (delivery batch) 도메인 API 클라이언트 — link-dispatch-slice.
 *
 * 노출 endpoint (BE slip-service DeliveryBatchController, gateway StripPrefix=1):
 * - `GET    /api/delivery-batches?date=&sent=`        — 날짜 + sent 필터 목록
 * - `GET    /api/delivery-batches/{id}`               — 배치 상세 (포함 전표 N건)
 * - `POST   /api/delivery-batches/auto-group?date=`   — 같은 기사+같은 날짜 자동 그룹
 * - `POST   /api/delivery-batches/{id}/slips`         — 배치에 전표 추가
 * - `DELETE /api/delivery-batches/{id}/slips/{slipId}` — 배치에서 전표 제거
 * - `POST   /api/delivery-batches/{id}/send-sms`      — 배치 SMS 일괄 발송 (e-sign URL 포함)
 * - `POST   /api/delivery-batches/{id}/regenerate-token` — 토큰 재발행 (URL 새로고침)
 *
 * UUID 비공개 가드: batch.id / slip.id 는 path/body 에서만 사용. 화면 표시 영역에서
 * 는 driverName / slipNo / 날짜 등 비즈니스 라벨만 사용한다 (memo
 * `feedback_uuid_no_user_visibility.md`).
 *
 * 권한: FE 진입은 {@code slip.delivery-batch} VIEW, mutation 은 BE {@code @RequirePermission}
 * action 기준.
 */
import { apiClient, type ApiEnvelope } from './client'

/** 배치 목록의 한 row — Designer wireframes.md § 1 인용 (LinkDispatchListPage 표 6 컬럼). */
export interface DeliveryBatchSummary {
  /** UUID — path param 에만 사용, 화면 미노출. */
  id: string
  /** 배송일자 (YYYY-MM-DD) — 표 1열 표시. */
  deliveryDate: string
  /** 기사 이름 — 표 2열 표시 (사용자 식별자 X, 직원/외주 모두 이름). */
  driverName: string
  /** 기사 휴대폰 — 표 3열 표시 (010-XXXX-XXXX). */
  driverPhone: string
  /** 묶인 전표 수 — 표 4열 표시. */
  slipCount: number
  /** e-sign 단일 URL (전 전표 묶음). */
  signUrl: string
  /** SMS 발송 시각 (ISO) — null 이면 미발송. 표 6열 ☑/[발송] 분기 키. */
  smsSentAt: string | null
}

/** 배치 상세에 포함되는 전표 요약 — Designer wireframes.md § 2 인용. */
export interface DeliveryBatchSlip {
  /** 전표 UUID — 추가/제거 path 에만 사용, 화면 미노출. */
  slipId: string
  /** 사용자 노출 식별자 (예: "2026/05/04-1"). */
  slipNo: string
  /** 거래처명. */
  partnerName: string | null
  /** 배송지 — 모달에서 14pt 본문 표시. */
  shippingAddress: string | null
  /** 라인 수 (요약). */
  lineCount: number
}

/** 배치 상세 응답 — BE `DeliveryBatchDetailResponse`. */
export interface DeliveryBatchDetail extends DeliveryBatchSummary {
  /** 묶인 전표 N건 — 모달에서 리스트 표시. */
  slips: DeliveryBatchSlip[]
  /** 토큰 발행 시각 (ISO). */
  tokenIssuedAt: string
  /** 유효기간 시각 (ISO) — null 이면 무제한 (정책에 따라). */
  tokenExpiresAt: string | null
}

/** 목록 조회 옵션 — date / sent 필터. */
export interface ListBatchesOptions {
  /** YYYY-MM-DD — 미지정 시 BE 가 전체. */
  date?: string
  /** true 시 SMS 발송 완료만, false 시 미발송만, undefined 시 전체. */
  sent?: boolean
}

/**
 * 배치 목록 조회 — 날짜 + sent 필터.
 *
 * @param options date / sent 필터 (모두 옵션)
 */
export async function listBatches(
  options: ListBatchesOptions = {},
): Promise<DeliveryBatchSummary[]> {
  const params: Record<string, string> = {}
  if (options.date) params['date'] = options.date
  if (options.sent !== undefined) params['sent'] = String(options.sent)

  const res = await apiClient.get<ApiEnvelope<DeliveryBatchSummary[]>>(
    '/api/delivery-batches',
    { params },
  )
  return res.data.data
}

/**
 * 배치 단건 상세 (포함 전표 N건).
 *
 * @param batchId 배치 UUID (path param 으로만 사용, 화면 표시 X)
 */
export async function getBatch(batchId: string): Promise<DeliveryBatchDetail> {
  const res = await apiClient.get<ApiEnvelope<DeliveryBatchDetail>>(
    `/api/delivery-batches/${batchId}`,
  )
  return res.data.data
}

/**
 * 자동 그룹 — 같은 기사 + 같은 배송일자의 전표을 묶어 신규 배치 N건 생성.
 *
 * BE 가 이미 그룹된 전표은 skip, 신규 그룹만 응답에 포함.
 * 응답은 생성된 배치 N건의 요약 list.
 *
 * @param date 그룹 대상 배송일자 (YYYY-MM-DD)
 */
export async function autoGroup(date: string): Promise<DeliveryBatchSummary[]> {
  const res = await apiClient.post<ApiEnvelope<DeliveryBatchSummary[]>>(
    '/api/delivery-batches/auto-group',
    null,
    { params: { date } },
  )
  return res.data.data
}

/**
 * 배치에 전표 추가 — DRAFT/SAVED 단계의 전표만 BE 가 허용.
 *
 * @param batchId 배치 UUID
 * @param slipId 추가할 전표 UUID
 */
export async function addSlipToBatch(
  batchId: string,
  slipId: string,
): Promise<DeliveryBatchDetail> {
  const res = await apiClient.post<ApiEnvelope<DeliveryBatchDetail>>(
    `/api/delivery-batches/${batchId}/slips`,
    { slipId },
  )
  return res.data.data
}

/**
 * 배치에서 전표 제거 — SMS 미발송 상태에서만 BE 가 허용.
 *
 * @param batchId 배치 UUID
 * @param slipId 제거할 전표 UUID
 */
export async function removeSlipFromBatch(
  batchId: string,
  slipId: string,
): Promise<void> {
  await apiClient.delete(`/api/delivery-batches/${batchId}/slips/${slipId}`)
}

/**
 * 배치 SMS 일괄 발송 — driverPhone 으로 e-sign URL 포함 SMS 1건 발송.
 *
 * 성공 시 응답의 smsSentAt 가 갱신된다.
 *
 * @param batchId 배치 UUID
 */
export async function sendBatchSms(batchId: string): Promise<DeliveryBatchSummary> {
  const res = await apiClient.post<ApiEnvelope<DeliveryBatchSummary>>(
    `/api/delivery-batches/${batchId}/send-sms`,
    {},
  )
  return res.data.data
}

/**
 * 배치 토큰 재발행 — 기존 e-sign URL 만료, 신규 token 으로 URL 갱신.
 *
 * 사용 사례: 기사가 URL 분실 / 외부 노출 우려 / 정책 변경.
 * 응답의 signUrl 이 새로운 URL.
 *
 * @param batchId 배치 UUID
 */
export async function regenerateBatchToken(
  batchId: string,
): Promise<DeliveryBatchDetail> {
  const res = await apiClient.post<ApiEnvelope<DeliveryBatchDetail>>(
    `/api/delivery-batches/${batchId}/regenerate-token`,
    {},
  )
  return res.data.data
}
