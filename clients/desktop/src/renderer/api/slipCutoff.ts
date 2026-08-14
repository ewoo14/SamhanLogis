/**
 * 출고전표 마감시간 설정 API 클라이언트.
 *
 * <p>UUID(id)는 수정/삭제 path key 전용이며 사용자 노출 식별자는 deliveryTag/deliveryTagLabel이다.
 *
 * <p>게이트웨이 라우트: /admin/slip-cutoffs (no-strip, slip-service 직접 라우팅).
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * OUTBOUND DeliveryTag 코드 — 기존 slip-service DeliveryTag enum OUTBOUND 방향 8종.
 * 인바운드 태그(RETURN_TRIP/BORROW/RETURN/RENTAL_RETURN/DELIVERY_RETURN/REENTRY)는 마감 설정 대상 아님.
 */
export type OutboundDeliveryTag =
  | 'SALE'
  | 'STACK'
  | 'REGION'
  | 'LOGEN'
  | 'GYEONGDONG_PARCEL'
  | 'GYEONGDONG_FREIGHT'
  | 'RENTAL'
  | 'BORROW_RETURN'
  | 'DEFECT_RETURN'
  | 'DIRECT_DELIVERY'
  | 'PREEMPTIVE_ACTION'

/** OUTBOUND 태그 한국어 라벨 맵 (UUID 비공개 — 라벨만 노출). */
export const OUTBOUND_DELIVERY_TAG_LABELS: Record<OutboundDeliveryTag, string> = {
  SALE: '판매',
  STACK: '야적',
  REGION: '지방',
  LOGEN: '로젠택배',
  GYEONGDONG_PARCEL: '경동택배',
  GYEONGDONG_FREIGHT: '경동화물',
  RENTAL: '대여',
  BORROW_RETURN: '차용반납',
  DEFECT_RETURN: '불량반납',
  DIRECT_DELIVERY: '직배',
  PREEMPTIVE_ACTION: '착하선조치',
}

/**
 * 출고전표 마감시간 항목 — BE CutoffResponse DTO 와 1:1.
 *
 * <p>UUID(id)는 mutation 경로용으로만 사용. 사용자 노출은 deliveryTagLabel 만.
 */
export interface SlipCutoff {
  /** UUID — 수정/삭제 경로 key 전용. 화면 미노출. */
  id: string
  /** 배송태그 enum name (예: 'REGION'). */
  deliveryTag: OutboundDeliveryTag
  /** 배송태그 한국어 라벨 (예: '지방'). */
  deliveryTagLabel: string
  /** 마감시각 (HH:mm). */
  cutoffTime: string
  /** 활성 여부. */
  active: boolean
  /** 생성 일시 ISO 8601. */
  createdAt: string
  /** 수정 일시 ISO 8601 — 미수정 시 null. */
  modifiedAt: string | null
}

/** 배송태그 옵션 — GET /admin/slip-cutoffs/delivery-tags 응답 항목. */
export interface DeliveryTagOption {
  /** enum name (예: 'REGION'). */
  tag: OutboundDeliveryTag
  /** 한국어 라벨 (예: '지방'). */
  label: string
}

/** 마감시간 등록 요청 — deliveryTag / cutoffTime(HH:mm) / active. */
export interface SlipCutoffCreateRequest {
  deliveryTag: OutboundDeliveryTag
  /** 마감시각 (HH:mm). */
  cutoffTime: string
  /** 활성 여부 — 미지정 시 BE 기본값 true. */
  active?: boolean
}

/** 마감시간 수정 요청 — cutoffTime / active (deliveryTag 수정 불가). */
export interface SlipCutoffUpdateRequest {
  /** 마감시각 (HH:mm). 미지정 시 유지. */
  cutoffTime?: string
  /** 활성 여부. 미지정 시 유지. */
  active?: boolean
}

/** 마감시간 전체 목록 조회. */
export async function listSlipCutoffs(): Promise<SlipCutoff[]> {
  const res = await apiClient.get<ApiEnvelope<SlipCutoff[]>>('/admin/slip-cutoffs')
  return res.data.data
}

/**
 * OUTBOUND 배송태그 전체 옵션 조회.
 *
 * <p>등록화면에서 "아직 설정되지 않은 태그" 를 필터링하는 데 사용한다.
 */
export async function listDeliveryTagOptions(): Promise<DeliveryTagOption[]> {
  const res = await apiClient.get<ApiEnvelope<DeliveryTagOption[]>>(
    '/admin/slip-cutoffs/delivery-tags',
  )
  return res.data.data
}

/** 마감시간 등록. */
export async function createSlipCutoff(req: SlipCutoffCreateRequest): Promise<SlipCutoff> {
  const res = await apiClient.post<ApiEnvelope<SlipCutoff>>('/admin/slip-cutoffs', req)
  return res.data.data
}

/** 마감시간 수정. */
export async function updateSlipCutoff(
  id: string,
  req: SlipCutoffUpdateRequest,
): Promise<SlipCutoff> {
  const res = await apiClient.patch<ApiEnvelope<SlipCutoff>>(
    `/admin/slip-cutoffs/${encodeURIComponent(id)}`,
    req,
  )
  return res.data.data
}

/** Soft Delete. */
export async function removeSlipCutoff(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(
    `/admin/slip-cutoffs/${encodeURIComponent(id)}`,
  )
}
