import Constants from 'expo-constants';

export type ForceLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL';

export interface VersionStatus {
  latestVersion: string;
  minSupportedVersion: string;
  forceLevel: ForceLevel;
  releaseNotes: string;
  releasedAt: string | null;
}

export const VERSION_POLICY_FAILURE_MESSAGE = '버전 정책을 확인하지 못했습니다. 네트워크 연결 후 다시 확인해 주세요.';

export class VersionPolicyError extends Error {
  constructor() {
    super(VERSION_POLICY_FAILURE_MESSAGE);
    this.name = 'VersionPolicyError';
  }
}

interface RawVersionStatus {
  latestVersion?: unknown;
  minSupportedVersion?: unknown;
  forceLevel?: unknown;
  releaseNotes?: unknown;
  releasedAt?: unknown;
}

interface ApiResponseEnvelope {
  data?: unknown;
}

const DEFAULT_DEV_API = 'http://localhost:8080';
const DEFAULT_PROD_API = 'https://api.samhan-air.com';
const VERSION_CHECK_TIMEOUT_MS = 5000;

export interface ExpoVersionConfig {
  version?: string;
  extra?: {
    appVersion?: unknown;
  };
}

/** 빌드 주입 개발 버전을 우선하고, 기존 설치본은 package semver를 호환 사용한다. */
export function resolveCurrentAppVersion(expoConfig: ExpoVersionConfig | null | undefined): string {
  const injectedVersion = expoConfig?.extra?.appVersion;
  if (typeof injectedVersion === 'string' && injectedVersion.trim().length > 0) {
    return injectedVersion.trim();
  }
  const packageVersion = expoConfig?.version?.trim();
  if (packageVersion) return packageVersion;
  throw new Error('앱 버전이 주입되지 않았고 package semver도 없습니다. 빌드를 중단합니다.');
}

export function getCurrentAppVersion(): string {
  return resolveCurrentAppVersion(Constants.expoConfig);
}

export function resolveVersionApiBaseUrl(): string {
  const envUrl = readEnv('EXPO_PUBLIC_API_BASE_URL');
  if (envUrl) return envUrl;
  const extraUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof extraUrl === 'string' && extraUrl.length > 0) return extraUrl;
  return isDevRuntime() ? DEFAULT_DEV_API : DEFAULT_PROD_API;
}

export function buildVersionCheckUrl(apiBaseUrl: string, currentVersion: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    clientType: 'SAMHAN_MOBILE_STAFF',
    currentVersion,
  });
  return `${base}/app/version?${params.toString()}`;
}

export function normalizeVersionStatus(raw: RawVersionStatus): VersionStatus {
  const forceLevel = normalizeForceLevel(raw.forceLevel);
  return {
    latestVersion: typeof raw.latestVersion === 'string' ? raw.latestVersion : '',
    minSupportedVersion: typeof raw.minSupportedVersion === 'string' ? raw.minSupportedVersion : '',
    forceLevel,
    releaseNotes: typeof raw.releaseNotes === 'string' ? raw.releaseNotes : '',
    releasedAt: typeof raw.releasedAt === 'string' ? raw.releasedAt : null,
  };
}

export function isBlockingForceLevel(forceLevel: ForceLevel): boolean {
  return forceLevel === 'CRITICAL';
}

export function getMinorDismissStorageKey(latestVersion: string): string {
  return `samhan.mobile.version.minor.dismissed.${latestVersion}`;
}

export function getMajorSessionDismissKey(latestVersion: string): string {
  return `samhan.mobile.version.major.session-dismissed.${latestVersion}`;
}

export async function fetchMobileVersionStatus(
  currentVersion = getCurrentAppVersion(),
  apiBaseUrl = resolveVersionApiBaseUrl(),
): Promise<VersionStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERSION_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(buildVersionCheckUrl(apiBaseUrl, currentVersion), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new VersionPolicyError();
    }
    const rawStatus = unwrapVersionStatus(await response.json());
    if (!isValidForceLevel(rawStatus.forceLevel)) throw new VersionPolicyError();
    return normalizeVersionStatus(rawStatus);
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapVersionStatus(payload: unknown): RawVersionStatus {
  if (isObjectRecord(payload)) {
    const envelope = payload as ApiResponseEnvelope;
    if (isObjectRecord(envelope.data)) return envelope.data as RawVersionStatus;
  }
  return isObjectRecord(payload) ? (payload as RawVersionStatus) : {};
}

function normalizeForceLevel(forceLevel: unknown): ForceLevel {
  if (forceLevel === 'CRITICAL' || forceLevel === 'MAJOR' || forceLevel === 'MINOR' || forceLevel === 'NONE') {
    return forceLevel;
  }
  return 'NONE';
}

function isValidForceLevel(forceLevel: unknown): forceLevel is ForceLevel {
  return forceLevel === 'CRITICAL' || forceLevel === 'MAJOR' || forceLevel === 'MINOR' || forceLevel === 'NONE';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
  const value = proc?.env?.[name];
  return value && value.length > 0 ? value : undefined;
}

function isDevRuntime(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof (globalThis as any).__DEV__ !== 'undefined' ? Boolean((globalThis as any).__DEV__) : false;
}
