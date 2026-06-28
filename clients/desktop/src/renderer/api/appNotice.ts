import { apiClient, type ApiEnvelope } from './client'

export interface AppNoticeImage {
  id: string
  imageKey: string
  imageUrl: string
  displayOrder: number
  caption: string | null
}

export interface AppNoticePayload {
  title: string
  isActive: boolean
  startAt: string
  endAt: string
  displayOrder: number
}

export interface AppNotice extends AppNoticePayload {
  id: string
  images: AppNoticeImage[]
}

export interface UploadAppNoticeImageParams {
  file: File
  displayOrder?: number
  caption?: string
}

export interface AppNoticeImageOrder {
  id: string
  displayOrder: number
}

export async function getActiveAppNotices(): Promise<AppNotice[]> {
  const res = await apiClient.get<ApiEnvelope<AppNotice[]>>('/app/notices/active')
  return res.data.data
}

export async function listAppNotices(): Promise<AppNotice[]> {
  const res = await apiClient.get<ApiEnvelope<AppNotice[]>>('/app/notices')
  return res.data.data
}

export async function createAppNotice(payload: AppNoticePayload): Promise<AppNotice> {
  const res = await apiClient.post<ApiEnvelope<AppNotice>>('/app/notices', payload)
  return res.data.data
}

export async function updateAppNotice(id: string, payload: AppNoticePayload): Promise<AppNotice> {
  const res = await apiClient.put<ApiEnvelope<AppNotice>>(
    `/app/notices/${encodeURIComponent(String(id))}`,
    payload,
  )
  return res.data.data
}

export async function deleteAppNotice(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(`/app/notices/${encodeURIComponent(String(id))}`)
}

export async function uploadAppNoticeImage(
  noticeId: string,
  params: UploadAppNoticeImageParams,
): Promise<AppNoticeImage> {
  const formData = new FormData()
  formData.append('file', params.file)
  if (params.caption !== undefined) formData.append('caption', params.caption)
  if (params.displayOrder !== undefined) formData.append('displayOrder', String(params.displayOrder))

  const res = await apiClient.post<ApiEnvelope<AppNoticeImage>>(
    `/app/notices/${encodeURIComponent(String(noticeId))}/images`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return res.data.data
}

export async function reorderAppNoticeImages(
  noticeId: string,
  orders: AppNoticeImageOrder[],
): Promise<AppNoticeImage[]> {
  const res = await apiClient.put<ApiEnvelope<AppNoticeImage[]>>(
    `/app/notices/${encodeURIComponent(String(noticeId))}/images/order`,
    orders,
  )
  return res.data.data
}

export async function deleteAppNoticeImage(noticeId: string, imageId: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(
    `/app/notices/${encodeURIComponent(String(noticeId))}/images/${encodeURIComponent(String(imageId))}`,
  )
}
