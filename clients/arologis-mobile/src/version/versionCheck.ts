import Constants from 'expo-constants';

export type ForceLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL';

export interface VersionStatus {
  latestVersion: string;
  minSupportedVersion: string;
  forceLevel: ForceLevel;
  releaseNotes: string;
  releasedAt: string | null;
}

interface RawVersionStatus {
  latestVersion?: unknown;
  minSupportedVersion?: unknown;
  forceLevel?: unknown;
  releaseNotes?: unknown;
  releasedAt?: unknown;
}

const DEFAULT_DEV_API = 'http://localhost:8097';
const DEFAULT_PROD_API = 'https://api.arologis.samhan-air.com';
const VERSION_CHECK_TIMEOUT_MS = 5000;

export function getCurrentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

export function resolveVersionApiBaseUrl(): string {
  const envUrl = readEnv('EXPO_PUBLIC_API_BASE_URL') ?? readEnv('EXPO_PUBLIC_AROLOGIS_API_BASE');
  if (envUrl) return envUrl;
  const extraUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof extraUrl === 'string' && extraUrl.length > 0) return extraUrl;
  return isDevRuntime() ? DEFAULT_DEV_API : DEFAULT_PROD_API;
}

export function buildVersionCheckUrl(apiBaseUrl: string, currentVersion: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    clientType: 'MOBILE',
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
  return forceLevel === 'CRITICAL' || forceLevel === 'MAJOR';
}

export function getMinorDismissStorageKey(latestVersion: string): string {
  return `samhan.mobile.version.minor.dismissed.${latestVersion}`;
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
      throw new Error(`Version check failed with HTTP ${response.status}`);
    }
    return normalizeVersionStatus((await response.json()) as RawVersionStatus);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeForceLevel(forceLevel: unknown): ForceLevel {
  if (forceLevel === 'CRITICAL' || forceLevel === 'MAJOR' || forceLevel === 'MINOR' || forceLevel === 'NONE') {
    return forceLevel;
  }
  return 'NONE';
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
