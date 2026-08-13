export type DesktopForceLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL'

export interface DesktopVersionInfo {
  latestVersion: string
  minSupportedVersion: string
  forceLevel: DesktopForceLevel
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
  | { kind: 'minor'; versionInfo: DesktopVersionInfo; dismissKey: string }
  | { kind: 'recommend'; versionInfo: DesktopVersionInfo; dismissKey: string }
  | { kind: 'blocking'; versionInfo: DesktopVersionInfo }

export interface FetchDesktopVersionOptions {
  apiBaseUrl: string
  currentVersion: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const VERSION_API_CLIENT_TYPE = 'AROLOGIS_DESKTOP'
const DEVELOPMENT_SENTINEL = '0.1.0-dev'
const VERSION_CHECK_TIMEOUT_MS = 5_000

/** 공통 #910 정책과 같이 릴리스 주입값을 사용하고 개발 실행은 sentinel로 표시한다. */
export function resolveBuildAppVersion(injectedVersion: string | undefined): string {
  return injectedVersion?.trim() || DEVELOPMENT_SENTINEL
}

/** 다른 Electron 앱과 섞이지 않도록 아로로지스 전용 식별자를 사용한다. */
export function buildVersionCheckUrl(apiBaseUrl: string, currentVersion: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({
    clientType: VERSION_API_CLIENT_TYPE,
    currentVersion,
  })
  return `${base}/app/version?${params.toString()}`
}

/** 버전 API 실패는 호출자가 사용자 안내로 표시할 수 있도록 예외를 유지한다. */
export async function fetchDesktopVersionStatus({
  apiBaseUrl,
  currentVersion,
  fetchImpl = fetch,
  timeoutMs = VERSION_CHECK_TIMEOUT_MS,
}: FetchDesktopVersionOptions): Promise<DesktopVersionInfo> {
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

function normalizeVersionInfo(payload: unknown): DesktopVersionInfo | null {
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

function readStorage(storage: Pick<Storage, 'getItem'> | Map<string, string>, key: string): string | null | undefined {
  return storage instanceof Map ? storage.get(key) : storage.getItem(key)
}

/** 기존 데스크톱과 같은 MINOR 영구·MAJOR 세션 dismiss 정책을 적용한다. */
export function resolveVersionPromptState(
  versionInfo: DesktopVersionInfo,
  storage: Pick<Storage, 'getItem'> | Map<string, string>,
): VersionPromptState {
  if (versionInfo.forceLevel === 'CRITICAL') return { kind: 'blocking', versionInfo }
  if (versionInfo.forceLevel === 'MAJOR') {
    const dismissKey = `samhan.app-version.session-dismissed.${VERSION_API_CLIENT_TYPE}.${versionInfo.latestVersion}`
    if (readStorage(storage, dismissKey) === 'true') return { kind: 'none' }
    return { kind: 'recommend', versionInfo, dismissKey }
  }
  if (versionInfo.forceLevel === 'MINOR') {
    const dismissKey = `samhan.app-version.dismissed.${VERSION_API_CLIENT_TYPE}.${versionInfo.latestVersion}`
    if (readStorage(storage, dismissKey) === 'true') return { kind: 'none' }
    return { kind: 'minor', versionInfo, dismissKey }
  }
  return { kind: 'none' }
}
