import type {
  AppClientType,
  AppVersionInfo,
} from '../api/appVersion'

export interface RuntimePlatformFlags {
  electron: boolean
  capacitor: boolean
}

export type VersionPromptState =
  | { kind: 'none' }
  | { kind: 'minor'; versionInfo: AppVersionInfo; dismissKey: string }
  | { kind: 'recommend'; versionInfo: AppVersionInfo; dismissKey: string }
  | { kind: 'blocking'; versionInfo: AppVersionInfo }

export interface VersionPromptInput {
  versionInfo: AppVersionInfo
  clientType: AppClientType
  storage: Pick<Storage, 'getItem'> | Map<string, string>
  sessionStorage?: Pick<Storage, 'getItem'> | Map<string, string>
}

/** 빌드 시 주입된 개발 버전을 사용하고, 주입 전 로컬 실행은 안전한 호환값을 사용한다. */
export function resolveBuildAppVersion(injectedVersion: string | undefined): string {
  return injectedVersion?.trim() || '0.0.0'
}

function readStorageValue(
  storage: Pick<Storage, 'getItem'> | Map<string, string>,
  key: string,
): string | null | undefined {
  if (storage instanceof Map) {
    return storage.get(key)
  }
  return storage.getItem(key)
}

export function resolveAppClientType(
  flags: RuntimePlatformFlags,
): AppClientType {
  if (flags.electron) return 'DESKTOP'
  if (flags.capacitor) return 'MOBILE'
  return 'WEB'
}

export function appVersionDismissKey(
  clientType: AppClientType,
  latestVersion: string,
): string {
  return `samhan.app-version.dismissed.${clientType}.${latestVersion}`
}

export function appVersionSessionDismissKey(
  clientType: AppClientType,
  latestVersion: string,
): string {
  return `samhan.app-version.session-dismissed.${clientType}.${latestVersion}`
}

export function resolveVersionPromptState({
  versionInfo,
  clientType,
  storage,
  sessionStorage,
}: VersionPromptInput): VersionPromptState {
  if (versionInfo.forceLevel === 'CRITICAL') {
    return { kind: 'blocking', versionInfo }
  }

  if (versionInfo.forceLevel === 'MAJOR') {
    const dismissKey = appVersionSessionDismissKey(clientType, versionInfo.latestVersion)
    const sessionStore = sessionStorage ?? storage
    if (readStorageValue(sessionStore, dismissKey) === 'true') {
      return { kind: 'none' }
    }
    return { kind: 'recommend', versionInfo, dismissKey }
  }

  if (versionInfo.forceLevel === 'MINOR') {
    const dismissKey = appVersionDismissKey(clientType, versionInfo.latestVersion)
    if (readStorageValue(storage, dismissKey) === 'true') {
      return { kind: 'none' }
    }
    return { kind: 'minor', versionInfo, dismissKey }
  }

  return { kind: 'none' }
}
