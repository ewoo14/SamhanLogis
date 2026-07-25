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

/** 빌드 시 주입된 개발 버전을 사용하며, 무주입 실행은 모호한 버전으로 진행하지 않는다. */
export function resolveBuildAppVersion(injectedVersion: string | undefined): string {
  const version = injectedVersion?.trim()
  if (!version) {
    throw new Error('VITE_APP_VERSION에 릴리스 버전을 명시적으로 주입해야 합니다.')
  }
  return version
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
  // Electron·Capacitor·웹은 모두 clients/desktop의 같은 백오피스 앱 산출물이다.
  // 네이티브 셸 종류가 아니라 배포 앱 경계를 식별해야 하므로 모두 DESKTOP 정책을 조회한다.
  if (flags.electron || flags.capacitor) return 'DESKTOP'
  return 'DESKTOP'
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
