/**
 * 외부기사/배송사 마스터 API 클라이언트.
 *
 * <p>UUID(id)는 admin path key 전용이며 화면 식별자는 name/phone 이다.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

export interface ExternalCarrier {
  id: string
  name: string
  phone: string
  email?: string | null
  defaultVehicleType?: string | null
  memo?: string | null
  active: boolean
  createdAt: string
  modifiedAt: string | null
}

export interface ExternalCarrierCreateRequest {
  name: string
  phone: string
  email?: string | null
  defaultVehicleType?: string | null
  memo?: string | null
  active?: boolean
}

export type ExternalCarrierUpdateRequest = Partial<ExternalCarrierCreateRequest>

export interface ExternalCarrierListParams {
  q?: string
  page?: number
  size?: number
}

/** 목록/검색 조회. */
export async function listExternalCarriers(
  params: ExternalCarrierListParams = {},
): Promise<PageResponse<ExternalCarrier>> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<ExternalCarrier>>>(
    '/admin/external-carriers',
    { params },
  )
  return res.data.data
}

/** 신규 등록. */
export async function createExternalCarrier(
  req: ExternalCarrierCreateRequest,
): Promise<ExternalCarrier> {
  const res = await apiClient.post<ApiEnvelope<ExternalCarrier>>(
    '/admin/external-carriers',
    req,
  )
  return res.data.data
}

/** 부분 수정. */
export async function updateExternalCarrier(
  id: string,
  req: ExternalCarrierUpdateRequest,
): Promise<ExternalCarrier> {
  const res = await apiClient.patch<ApiEnvelope<ExternalCarrier>>(
    `/admin/external-carriers/${encodeURIComponent(id)}`,
    req,
  )
  return res.data.data
}

/** Soft Delete. */
export async function removeExternalCarrier(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(
    `/admin/external-carriers/${encodeURIComponent(id)}`,
  )
}

/** Soft-deleted row 복구. */
export async function restoreExternalCarrier(id: string): Promise<ExternalCarrier> {
  const res = await apiClient.post<ApiEnvelope<ExternalCarrier>>(
    `/admin/external-carriers/${encodeURIComponent(id)}/restore`,
  )
  return res.data.data
}
