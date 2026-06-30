/**
 * 전표 셀 인라인 레드라인 API 클라이언트 — S2d-1.
 *
 * UUID 비공개: 응답에는 actorId/productId/partnerId 등 raw UUID 를 포함하지 않는다.
 */
import { apiClient, type ApiEnvelope } from './client'

export interface SlipRedlineLayer {
  value: string | null
  actorName: string | null
  actorColor: string | null
  changedAt: string | null
}

export interface SlipFieldRedline {
  fieldPath: string
  label: string
  layers: SlipRedlineLayer[]
}

export interface SlipRedline {
  anchored: boolean
  fields: SlipFieldRedline[]
}

/** 전표 anchor 이후 저장 revision 기반 레드라인 조회. */
export async function getRedline(slipId: string): Promise<SlipRedline> {
  const res = await apiClient.get<ApiEnvelope<SlipRedline>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/redline`,
  )
  return res.data.data
}
