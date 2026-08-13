export type WebAppForceLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL'

export interface WebVersionInfo {
  latestVersion: string
  minSupportedVersion: string
  forceLevel: WebAppForceLevel
  releaseNotes: string
  releasedAt: string | null
}

export const VERSION_POLICY_FAILURE_MESSAGE = '버전 정책을 확인하지 못했습니다. 네트워크 연결 후 다시 확인해 주세요.'

export class VersionPolicyError extends Error {
  constructor() {
    super(VERSION_POLICY_FAILURE_MESSAGE)
    this.name = 'VersionPolicyError'
  }
}

export type VersionPromptState =
  | { kind: 'none' }
  | { kind: 'minor'; latestVersion: string; versionInfo: WebVersionInfo; dismissKey: string }
  | { kind: 'recommend'; latestVersion: string; versionInfo: WebVersionInfo; dismissKey: string }
  | { kind: 'blocking'; latestVersion: string; versionInfo: WebVersionInfo }

export interface FetchVersionOptions {
  apiBaseUrl: string
  currentVersion: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const VERSION_API_CLIENT_TYPE = 'SAMHAN_MOBILE_PUBLIC_WEB'
const DEVELOPMENT_SENTINEL = '0.1.0-dev'
const VERSION_CHECK_TIMEOUT_MS = 5_000

/** 모바일 공개 웹도 #910의 개발 sentinel을 동일하게 사용한다. */
export function resolveBuildAppVersion(injectedVersion: string | undefined): string {
  const version = injectedVersion?.trim()
  return version || DEVELOPMENT_SENTINEL
}

/** 공개 버전 조회는 모바일 퍼블릭 웹 식별자로만 분리한다. */
export function buildVersionCheckUrl(apiBaseUrl: string, currentVersion: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({
    clientType: VERSION_API_CLIENT_TYPE,
    currentVersion,
  })
  return `${base}/app/version?${params.toString()}`
}

/** 버전 API 실패는 호출자가 사용자 안내로 표시할 수 있도록 예외를 유지한다. */
export async function fetchWebVersionStatus({
  apiBaseUrl,
  currentVersion,
  fetchImpl = fetch,
  timeoutMs = VERSION_CHECK_TIMEOUT_MS,
}: FetchVersionOptions): Promise<WebVersionInfo> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(buildVersionCheckUrl(apiBaseUrl, currentVersion), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new VersionPolicyError()
    const versionInfo = normalizeVersionInfo(await response.json())
    if (!versionInfo) throw new VersionPolicyError()
    return versionInfo
  } catch (error) {
    if (error instanceof VersionPolicyError) throw error
    throw new VersionPolicyError()
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeVersionInfo(payload: unknown): WebVersionInfo | null {
  const record = asRecord(payload)
  const data = asRecord(record?.data) ?? record
  if (!data) return null
  const forceLevel = data.forceLevel
  if (forceLevel !== 'NONE' && forceLevel !== 'MINOR' && forceLevel !== 'MAJOR' && forceLevel !== 'CRITICAL') return null
  return {
    latestVersion: typeof data.latestVersion === 'string' ? data.latestVersion : '',
    minSupportedVersion: typeof data.minSupportedVersion === 'string' ? data.minSupportedVersion : '',
    forceLevel,
    releaseNotes: typeof data.releaseNotes === 'string' ? data.releaseNotes : '',
    releasedAt: typeof data.releasedAt === 'string' ? data.releasedAt : null,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** 데스크톱과 같은 MINOR 영구·MAJOR 세션 dismiss 키를 사용한다. */
export function resolveVersionPromptState(
  versionInfo: WebVersionInfo,
  storage: Pick<Storage, 'getItem'> | Map<string, string>,
): VersionPromptState {
  const get = (key: string): string | null | undefined => storage instanceof Map ? storage.get(key) : storage.getItem(key)
  if (versionInfo.forceLevel === 'CRITICAL') return { kind: 'blocking', latestVersion: versionInfo.latestVersion, versionInfo }
  if (versionInfo.forceLevel === 'MAJOR') {
    const dismissKey = `samhan.app-version.session-dismissed.${VERSION_API_CLIENT_TYPE}.${versionInfo.latestVersion}`
    if (get(dismissKey) === 'true') return { kind: 'none' }
    return { kind: 'recommend', latestVersion: versionInfo.latestVersion, versionInfo, dismissKey }
  }
  if (versionInfo.forceLevel === 'MINOR') {
    const dismissKey = `samhan.app-version.dismissed.${VERSION_API_CLIENT_TYPE}.${versionInfo.latestVersion}`
    if (get(dismissKey) === 'true') return { kind: 'none' }
    return { kind: 'minor', latestVersion: versionInfo.latestVersion, versionInfo, dismissKey }
  }
  return { kind: 'none' }
}
