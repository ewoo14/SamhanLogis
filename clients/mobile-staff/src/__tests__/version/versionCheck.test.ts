import {
  buildVersionCheckUrl,
  fetchMobileVersionStatus,
  getMinorDismissStorageKey,
  resolveCurrentAppVersion,
  isBlockingForceLevel,
  normalizeVersionStatus,
} from '../../version/versionCheck';

describe('mobile version check', () => {
  it('삼한 직원 모바일는 빌드 주입 개발 버전을 package semver보다 우선 사용한다', () => {
    expect(resolveCurrentAppVersion({
      version: '0.5.0',
      extra: { appVersion: '2026/07/25-1' },
    })).toBe('2026/07/25-1');
    expect(resolveCurrentAppVersion({ version: '0.5.0', extra: {} })).toBe('0.5.0');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('삼한 직원 모바일 전용 version endpoint에 앱 식별자와 currentVersion을 보낸다', () => {
    expect(buildVersionCheckUrl('https://api.samhan-air.com/', '0.4.0')).toBe(
      'https://api.samhan-air.com/app/version?clientType=SAMHAN_MOBILE_STAFF&currentVersion=0.4.0',
    );
  });

  it('treats only CRITICAL as a blocking force level', () => {
    expect(isBlockingForceLevel('CRITICAL')).toBe(true);
    expect(isBlockingForceLevel('MAJOR')).toBe(false);
    expect(isBlockingForceLevel('MINOR')).toBe(false);
    expect(isBlockingForceLevel('NONE')).toBe(false);
  });

  it('normalizes missing release notes to an empty string and preserves versions', () => {
    expect(
      normalizeVersionStatus({
        latestVersion: '0.5.0',
        minSupportedVersion: '0.4.0',
        forceLevel: 'MINOR',
      }),
    ).toEqual({
      latestVersion: '0.5.0',
      minSupportedVersion: '0.4.0',
      forceLevel: 'MINOR',
      releaseNotes: '',
      releasedAt: null,
    });
  });

  it('uses version-specific AsyncStorage keys for MINOR dismissals', () => {
    expect(getMinorDismissStorageKey('0.5.0')).toBe('samhan.mobile.version.minor.dismissed.0.5.0');
  });

  it('unwraps the ApiResponse data envelope from the version endpoint', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        code: 'OK',
        data: {
          latestVersion: '0.5.0',
          minSupportedVersion: '0.4.0',
          forceLevel: 'CRITICAL',
          releaseNotes: '필수 업데이트',
          releasedAt: '2026-06-27T00:00:00Z',
        },
        timestamp: '2026-06-27T00:00:01Z',
      }),
    } as Response);

    await expect(fetchMobileVersionStatus('0.4.0', 'https://api.samhan-air.com')).resolves.toEqual({
      latestVersion: '0.5.0',
      minSupportedVersion: '0.4.0',
      forceLevel: 'CRITICAL',
      releaseNotes: '필수 업데이트',
      releasedAt: '2026-06-27T00:00:00Z',
    });
  });

  it('aborts the version check fetch after the boot timeout', async () => {
    jest.useFakeTimers();
    const abortPromise = new Promise<never>((_, reject) => {
      jest.spyOn(globalThis, 'fetch').mockImplementation(((_url: RequestInfo | URL, init?: RequestInit) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        return abortPromise;
      }) as typeof fetch);
    });

    const request = fetchMobileVersionStatus('0.4.0', 'https://api.samhan-air.com');
    const assertion = expect(request).rejects.toThrow('aborted');
    await jest.advanceTimersByTimeAsync(5000);

    await assertion;
  });
});
