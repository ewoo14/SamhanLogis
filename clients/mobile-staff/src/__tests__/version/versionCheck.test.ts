import {
  buildVersionCheckUrl,
  getMinorDismissStorageKey,
  isBlockingForceLevel,
  normalizeVersionStatus,
} from '../../version/versionCheck';

describe('mobile version check', () => {
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
});
