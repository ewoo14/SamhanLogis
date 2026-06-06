/**
 * 전표 첨부 사진 감사 API.
 *
 * <p>D-AX-20 FE 계약: gateway
 * {@code GET /api/v1/slips/admin/photo-audit} -> slip-service
 * {@code GET /slips/admin/photo-audit}. 응답은 전표번호 중심이며 내부 UUID 키를 포함하지 않는다.
 */
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'
import { isMockMode } from './mock'

export type SlipPhotoAttachmentType = 'DELIVERY' | 'INSPECTION' | 'ESTIMATE'
export type SlipPhotoAuditFilterType = 'ALL' | SlipPhotoAttachmentType

export interface SlipPhotoAuditItem {
  slipNo: string
  slipDate: string
  partnerName: string | null
  attachmentType: SlipPhotoAttachmentType
  fileName: string
  fileSize: number
  contentType: string
  hasGps: boolean
  capturedAt: string | null
  uploadedBy: string
  uploadedAt: string
}

export interface SlipPhotoAuditParams {
  type?: SlipPhotoAuditFilterType
  from?: string
  to?: string
  slipNo?: string
  page?: number
  size?: number
}

const MOCK_PHOTO_AUDIT_ITEMS: SlipPhotoAuditItem[] = [
  {
    slipNo: '2026/05/15-1',
    slipDate: '2026-05-15',
    partnerName: '주식회사 윌리-정현수',
    attachmentType: 'DELIVERY',
    fileName: 'delivery-front-1.jpg',
    fileSize: 386_210,
    contentType: 'image/jpeg',
    hasGps: true,
    capturedAt: '2026-05-15T08:42:00+09:00',
    uploadedBy: '홍지수',
    uploadedAt: '2026-05-15T08:45:12+09:00',
  },
  {
    slipNo: '2026/05/15-1',
    slipDate: '2026-05-15',
    partnerName: '주식회사 윌리-정현수',
    attachmentType: 'DELIVERY',
    fileName: 'delivery-front-2.jpg',
    fileSize: 412_904,
    contentType: 'image/jpeg',
    hasGps: true,
    capturedAt: '2026-05-15T08:55:00+09:00',
    uploadedBy: '홍지수',
    uploadedAt: '2026-05-15T08:57:31+09:00',
  },
  {
    slipNo: '2026/05/15-2',
    slipDate: '2026-05-15',
    partnerName: '○○종합건설',
    attachmentType: 'INSPECTION',
    fileName: 'inspection-panel.jpg',
    fileSize: 298_112,
    contentType: 'image/jpeg',
    hasGps: false,
    capturedAt: '2026-05-15T10:11:00+09:00',
    uploadedBy: '김기철',
    uploadedAt: '2026-05-15T10:15:04+09:00',
  },
  {
    slipNo: '2026/05/14-7',
    slipDate: '2026-05-14',
    partnerName: '한일냉동기술',
    attachmentType: 'ESTIMATE',
    fileName: 'estimate-site.jpg',
    fileSize: 245_760,
    contentType: 'image/jpeg',
    hasGps: true,
    capturedAt: '2026-05-14T15:20:00+09:00',
    uploadedBy: '박서연',
    uploadedAt: '2026-05-14T15:24:48+09:00',
  },
]

function toPageResponse<T>(
  rows: T[],
  page: number,
  size: number,
): PageResponse<T> {
  const normalizedPage = Math.max(0, page)
  const normalizedSize = Math.max(1, size)
  const start = normalizedPage * normalizedSize
  const content = rows.slice(start, start + normalizedSize)
  const totalPages = Math.ceil(rows.length / normalizedSize)

  return {
    content,
    totalElements: rows.length,
    totalPages,
    number: normalizedPage,
    size: normalizedSize,
    first: normalizedPage === 0,
    last: totalPages === 0 || normalizedPage >= totalPages - 1,
  }
}

function listMockSlipPhotoAudit(
  params: SlipPhotoAuditParams = {},
): PageResponse<SlipPhotoAuditItem> {
  const type = params.type ?? 'ALL'
  const slipNo = params.slipNo?.trim()
  const page = params.page ?? 0
  const size = params.size ?? 50

  const filtered = MOCK_PHOTO_AUDIT_ITEMS.filter((item) => {
    if (type !== 'ALL' && item.attachmentType !== type) return false
    if (params.from && item.slipDate < params.from) return false
    if (params.to && item.slipDate > params.to) return false
    if (slipNo && !item.slipNo.includes(slipNo)) return false
    return true
  })

  return toPageResponse(filtered, page, size)
}

export async function listSlipPhotoAudit(
  params: SlipPhotoAuditParams = {},
): Promise<PageResponse<SlipPhotoAuditItem>> {
  if (isMockMode()) {
    return listMockSlipPhotoAudit(params)
  }

  const queryParams: Record<string, string | number> = {
    page: params.page ?? 0,
    size: params.size ?? 50,
  }
  if (params.type && params.type !== 'ALL') queryParams['type'] = params.type
  if (params.from) queryParams['from'] = params.from
  if (params.to) queryParams['to'] = params.to
  if (params.slipNo?.trim()) queryParams['slipNo'] = params.slipNo.trim()

  const res = await apiClient.get<ApiEnvelope<PageResponse<SlipPhotoAuditItem>>>(
    '/api/v1/slips/admin/photo-audit',
    { params: queryParams },
  )
  return res.data.data
}
