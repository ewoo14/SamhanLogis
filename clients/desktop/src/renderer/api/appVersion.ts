import { apiClient, type ApiEnvelope, type ApiRequestConfig } from './client'

export type AppClientType =
  | 'DESKTOP'
  | 'SAMHAN_MOBILE'
  | 'SAMHAN_MOBILE_STAFF'
  | 'AROLOGIS_MOBILE'
  | 'SAMHAN_ORDER_WEB'
  | 'SAMHAN_ESTIMATE_WEB'
  | 'SAMHAN_MOBILE_PUBLIC_WEB'
  | 'AROLOGIS_DESKTOP'
  | 'WEB'
  | 'MOBILE'
export type AppForceLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL'

export type CanonicalAppClientType = Exclude<AppClientType, 'WEB' | 'MOBILE'>

/** 관리자가 새 릴리스 등록 시 선택하는 앱 목록. 구버전 호환 식별자는 의도적으로 제외한다. */
export const APP_CLIENT_OPTIONS: ReadonlyArray<{
  value: CanonicalAppClientType
  label: string
}> = [
  { value: 'DESKTOP', label: '삼한 데스크톱' },
  { value: 'SAMHAN_MOBILE', label: '삼한 모바일' },
  { value: 'SAMHAN_MOBILE_STAFF', label: '삼한 직원 모바일' },
  { value: 'AROLOGIS_MOBILE', label: '아로로지스 모바일' },
  { value: 'SAMHAN_ORDER_WEB', label: '삼한 주문 웹' },
  { value: 'SAMHAN_ESTIMATE_WEB', label: '삼한 종합견적 웹' },
  { value: 'SAMHAN_MOBILE_PUBLIC_WEB', label: '삼한 모바일 퍼블릭 웹' },
  { value: 'AROLOGIS_DESKTOP', label: '아로로지스 데스크톱' },
]

const APP_CLIENT_LABEL: Record<AppClientType, string> = {
  DESKTOP: '삼한 데스크톱',
  SAMHAN_MOBILE: '삼한 모바일',
  SAMHAN_MOBILE_STAFF: '삼한 직원 모바일',
  AROLOGIS_MOBILE: '아로로지스 모바일',
  SAMHAN_ORDER_WEB: '삼한 주문 웹',
  SAMHAN_ESTIMATE_WEB: '삼한 종합견적 웹',
  SAMHAN_MOBILE_PUBLIC_WEB: '삼한 모바일 퍼블릭 웹',
  AROLOGIS_DESKTOP: '아로로지스 데스크톱',
  WEB: '기존 웹 클라이언트(호환)',
  MOBILE: '기존 모바일 클라이언트(호환)',
}

/** API 식별자를 사용자 화면에 표시할 한국어 앱 이름으로 변환한다. */
export function appClientTypeLabel(clientType: AppClientType): string {
  return APP_CLIENT_LABEL[clientType]
}

export interface AppVersionInfo {
  latestVersion: string
  minSupportedVersion: string
  forceLevel: AppForceLevel
  releaseNotes: string
  releasedAt: string
}

export interface GetAppVersionParams {
  clientType: AppClientType
  currentVersion: string
}

export interface AppReleasePayload {
  clientType: AppClientType
  version: string
  minSupportedVersion: string
  forceLevel: Exclude<AppForceLevel, 'NONE'>
  releaseNotes: string
  releasedAt: string
}

export interface AppRelease extends AppReleasePayload {
  id: string
  isPublished: boolean
}

export async function getAppVersion(
  params: GetAppVersionParams,
): Promise<AppVersionInfo> {
  const config: ApiRequestConfig = {
    params,
    skipAuth: true,
  }
  const res = await apiClient.get<ApiEnvelope<AppVersionInfo>>(
    '/app/version',
    config,
  )
  return res.data.data
}

export async function listAppReleases(): Promise<AppRelease[]> {
  const res = await apiClient.get<ApiEnvelope<AppRelease[]>>('/app/releases')
  return res.data.data
}

export async function createAppRelease(
  payload: AppReleasePayload,
): Promise<AppRelease> {
  const res = await apiClient.post<ApiEnvelope<AppRelease>>(
    '/app/releases',
    payload,
  )
  return res.data.data
}

export async function updateAppRelease(
  id: string,
  payload: AppReleasePayload,
): Promise<AppRelease> {
  const res = await apiClient.put<ApiEnvelope<AppRelease>>(
    `/app/releases/${encodeURIComponent(String(id))}`,
    payload,
  )
  return res.data.data
}

export async function deleteAppRelease(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(
    `/app/releases/${encodeURIComponent(String(id))}`,
  )
}

export async function publishAppRelease(id: string): Promise<AppRelease> {
  const res = await apiClient.post<ApiEnvelope<AppRelease>>(
    `/app/releases/${encodeURIComponent(String(id))}/publish`,
  )
  return res.data.data
}

export async function unpublishAppRelease(id: string): Promise<AppRelease> {
  const res = await apiClient.post<ApiEnvelope<AppRelease>>(
    `/app/releases/${encodeURIComponent(String(id))}/unpublish`,
  )
  return res.data.data
}
