import { apiClient, type ApiEnvelope, type ApiRequestConfig } from './client'

export type AppClientType = 'DESKTOP' | 'WEB' | 'MOBILE'
export type AppForceLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL'

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
