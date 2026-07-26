export type WebAppForceLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL'

export interface WebVersionInfo {
  latestVersion: string
  minSupportedVersion: string
  forceLevel: WebAppForceLevel
  releaseNotes: string
  releasedAt: string | null
}

export type VersionPromptState =
  | { kind: 'none' }
  | { kind: 'minor'; latestVersion: string; versionInfo: WebVersionInfo; dismissKey: string }
  | { kind: 'recommend'; latestVersion: string; versionInfo: WebVersionInfo; dismissKey: string }
  | { kind: 'blocking'; latestVersion: string; versionInfo: WebVersionInfo }

export interface FormControlSnapshot {
  tagName: string
  type?: string
  value?: string
  defaultValue?: string
  checked?: boolean
  defaultChecked?: boolean
}

export interface FetchVersionOptions {
  apiBaseUrl: string
  currentVersion: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const VERSION_API_CLIENT_TYPE = 'SAMHAN_ORDER_WEB'
const DEVELOPMENT_SENTINEL = '0.1.0-dev'
const VERSION_CHECK_TIMEOUT_MS = 5_000

/** 빌드 주입값을 기존 #910 sentinel 계약으로 정규화한다. */
export function resolveBuildAppVersion(injectedVersion: string | undefined): string {
  const version = injectedVersion?.trim()
  return version || DEVELOPMENT_SENTINEL
}

/** 관리 릴리스와 앱 경계를 섞지 않도록 주문 웹 식별자만 URL에 넣는다. */
export function buildVersionCheckUrl(apiBaseUrl: string, currentVersion: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({
    clientType: VERSION_API_CLIENT_TYPE,
    currentVersion,
  })
  return `${base}/app/version?${params.toString()}`
}

/** 공개 버전 API는 실패 시 null을 반환해 주문서 사용을 계속 허용한다. */
export async function fetchWebVersionStatus({
  apiBaseUrl,
  currentVersion,
  fetchImpl = fetch,
  timeoutMs = VERSION_CHECK_TIMEOUT_MS,
}: FetchVersionOptions): Promise<WebVersionInfo | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(buildVersionCheckUrl(apiBaseUrl, currentVersion), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return normalizeVersionInfo(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** 응답 envelope가 깨져도 사용자 화면을 막지 않도록 보수적으로 정상 상태를 만든다. */
function normalizeVersionInfo(payload: unknown): WebVersionInfo | null {
  const record = asRecord(payload)
  const data = asRecord(record?.data) ?? record
  if (!data) return null
  const forceLevel = data.forceLevel
  if (forceLevel !== 'NONE' && forceLevel !== 'MINOR' && forceLevel !== 'MAJOR' && forceLevel !== 'CRITICAL') {
    return null
  }
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

function readStorage(storage: Map<string, string>, key: string): string | undefined {
  return storage.get(key)
}

/** 데스크톱 게이트와 동일한 MINOR 영구·MAJOR 세션 dismiss 판정을 제공한다. */
export function resolveVersionPromptState(
  versionInfo: WebVersionInfo,
  storage: Map<string, string>,
): VersionPromptState {
  if (versionInfo.forceLevel === 'CRITICAL') {
    return { kind: 'blocking', latestVersion: versionInfo.latestVersion, versionInfo }
  }
  if (versionInfo.forceLevel === 'MAJOR') {
    const dismissKey = `samhan.app-version.session-dismissed.${VERSION_API_CLIENT_TYPE}.${versionInfo.latestVersion}`
    if (readStorage(storage, dismissKey) === 'true') return { kind: 'none' }
    return { kind: 'recommend', latestVersion: versionInfo.latestVersion, versionInfo, dismissKey }
  }
  if (versionInfo.forceLevel === 'MINOR') {
    const dismissKey = `samhan.app-version.dismissed.${VERSION_API_CLIENT_TYPE}.${versionInfo.latestVersion}`
    if (readStorage(storage, dismissKey) === 'true') return { kind: 'none' }
    return { kind: 'minor', latestVersion: versionInfo.latestVersion, versionInfo, dismissKey }
  }
  return { kind: 'none' }
}

/** 초기값과 다른 실제 입력만 dirty로 보며 검색 필터 등은 호출자가 제외한다. */
export function hasUnsavedFormInput(controls: readonly FormControlSnapshot[]): boolean {
  return controls.some((control) => {
    if (control.type === 'checkbox' || control.type === 'radio') {
      return control.checked !== control.defaultChecked
    }
    return String(control.value ?? '') !== String(control.defaultValue ?? '')
  })
}

