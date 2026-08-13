'use strict';

const { resolveBuildAppVersion: resolveSharedBuildAppVersion } = require('../../../../scripts/app-build-version.cjs');

const VERSION_API_CLIENT_TYPE = 'SAMHAN_ESTIMATE_WEB';
const DEVELOPMENT_SENTINEL = '0.1.0-dev';
const VERSION_CHECK_TIMEOUT_MS = 5000;
const VERSION_POLICY_FAILURE_MESSAGE = '버전 정책을 확인하지 못했습니다. 네트워크 연결 후 다시 확인해 주세요.';

class VersionPolicyError extends Error {
  constructor() {
    super(VERSION_POLICY_FAILURE_MESSAGE);
    this.name = 'VersionPolicyError';
  }
}

/** 견적 웹도 #910 공통 버전 resolver와 고정 개발 sentinel을 사용한다. */
function resolveBuildAppVersion(injectedVersion, env = process.env) {
  const nextEnv = { ...env };
  const normalized = typeof injectedVersion === 'string' ? injectedVersion.trim() : '';
  const buildEnv = String(nextEnv.BUILD_ENV || '').trim().toLowerCase();
  const releaseMode = ['1', 'true', 'yes'].includes(String(nextEnv.SAMHAN_RELEASE_BUILD || '').trim().toLowerCase())
    || buildEnv === 'production' || buildEnv === 'preview';
  if (normalized === DEVELOPMENT_SENTINEL && !releaseMode) return DEVELOPMENT_SENTINEL;
  if (injectedVersion !== undefined) nextEnv.VITE_APP_VERSION = injectedVersion;
  return resolveSharedBuildAppVersion({ env: nextEnv, variable: 'VITE_APP_VERSION' });
}

/** 견적 웹 전용 식별자만 공개 버전 조회 URL에 포함한다. */
function buildVersionCheckUrl(apiBaseUrl, currentVersion) {
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  const params = new URLSearchParams({
    clientType: VERSION_API_CLIENT_TYPE,
    currentVersion,
  });
  return `${base}/app/version?${params.toString()}`;
}

/** 조회 실패는 호출자가 사용자 안내로 표시할 수 있도록 예외를 유지한다. */
async function fetchWebVersionStatus({ apiBaseUrl, currentVersion, fetchImpl = fetch, timeoutMs = VERSION_CHECK_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(buildVersionCheckUrl(apiBaseUrl, currentVersion), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new VersionPolicyError();
    const versionInfo = normalizeVersionInfo(await response.json());
    if (!versionInfo) throw new VersionPolicyError();
    return versionInfo;
  } catch (error) {
    if (error instanceof VersionPolicyError) throw error;
    throw new VersionPolicyError();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeVersionInfo(payload) {
  const record = asRecord(payload);
  const data = asRecord(record && record.data) || record;
  if (!data) return null;
  if (!['NONE', 'MINOR', 'MAJOR', 'CRITICAL'].includes(data.forceLevel)) return null;
  return {
    latestVersion: typeof data.latestVersion === 'string' ? data.latestVersion : '',
    minSupportedVersion: typeof data.minSupportedVersion === 'string' ? data.minSupportedVersion : '',
    forceLevel: data.forceLevel,
    releaseNotes: typeof data.releaseNotes === 'string' ? data.releaseNotes : '',
    releasedAt: typeof data.releasedAt === 'string' ? data.releasedAt : null,
  };
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** 데스크톱 게이트와 동일한 MINOR 영구·MAJOR 세션 dismiss 정책을 반환한다. */
function resolveVersionPromptState(versionInfo, storage) {
  const get = (key) => storage.get(key);
  if (versionInfo.forceLevel === 'CRITICAL') return { kind: 'blocking', latestVersion: versionInfo.latestVersion, versionInfo };
  if (versionInfo.forceLevel === 'MAJOR') {
    const dismissKey = `samhan.app-version.session-dismissed.${VERSION_API_CLIENT_TYPE}.${versionInfo.latestVersion}`;
    if (get(dismissKey) === 'true') return { kind: 'none' };
    return { kind: 'recommend', latestVersion: versionInfo.latestVersion, versionInfo, dismissKey };
  }
  if (versionInfo.forceLevel === 'MINOR') {
    const dismissKey = `samhan.app-version.dismissed.${VERSION_API_CLIENT_TYPE}.${versionInfo.latestVersion}`;
    if (get(dismissKey) === 'true') return { kind: 'none' };
    return { kind: 'minor', latestVersion: versionInfo.latestVersion, versionInfo, dismissKey };
  }
  return { kind: 'none' };
}

/** 현재값과 초기값이 다른 입력만 작성 중으로 판정한다. */
function hasUnsavedFormInput(controls) {
  return controls.some((control) => {
    if (control.type === 'checkbox' || control.type === 'radio') return control.checked !== control.defaultChecked;
    return String(control.value || '') !== String(control.defaultValue || '');
  });
}

module.exports = {
  DEVELOPMENT_SENTINEL,
  VERSION_POLICY_FAILURE_MESSAGE,
  VersionPolicyError,
  buildVersionCheckUrl,
  fetchWebVersionStatus,
  hasUnsavedFormInput,
  resolveBuildAppVersion,
  resolveVersionPromptState,
};
