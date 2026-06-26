import {
  buildVersionCheckUrl,
  fetchMobileVersionStatus,
  getMinorDismissStorageKey,
  isBlockingForceLevel,
  normalizeVersionStatus,
} from '../../version/versionCheck';

describe('mobile version check', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('builds the public MOBILE version endpoint with currentVersion', () => {
    expect(buildVersionCheckUrl('https://api.samhan-air.com/', '0.4.0')).toBe(
      'https://api.samhan-air.com/app/version?clientType=MOBILE&currentVersion=0.4.0',
    );
  });

  it('treats CRITICAL and MAJOR as blocking force levels', () => {
    expect(isBlockingForceLevel('CRITICAL')).toBe(true);
    expect(isBlockingForceLevel('MAJOR')).toBe(true);
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
