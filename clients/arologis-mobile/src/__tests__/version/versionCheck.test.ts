import {
  buildVersionCheckUrl,
  getMinorDismissStorageKey,
  isBlockingForceLevel,
  normalizeVersionStatus,
} from '../../version/versionCheck';

describe('arologis mobile version check', () => {
  it('builds the public MOBILE version endpoint with currentVersion', () => {
    expect(buildVersionCheckUrl('https://api.arologis.samhan-air.com/', '1.0.0')).toBe(
      'https://api.arologis.samhan-air.com/app/version?clientType=MOBILE&currentVersion=1.0.0',
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
        latestVersion: '1.1.0',
        minSupportedVersion: '1.0.0',
        forceLevel: 'MINOR',
      }),
    ).toEqual({
      latestVersion: '1.1.0',
      minSupportedVersion: '1.0.0',
      forceLevel: 'MINOR',
      releaseNotes: '',
      releasedAt: null,
    });
  });

  it('uses version-specific AsyncStorage keys for MINOR dismissals', () => {
    expect(getMinorDismissStorageKey('1.1.0')).toBe('samhan.mobile.version.minor.dismissed.1.1.0');
  });
});
