import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export type OtaUpdateResult = 'skipped' | 'not-available' | 'reloaded' | 'failed';

/**
 * EAS Update publish는 EAS 계정/projectId 연동 후 활성화한다.
 * 현재 코드는 런타임 준비만 수행하며, Expo Go/dev에서는 안전하게 건너뛴다.
 */
export async function checkForOtaUpdate(): Promise<OtaUpdateResult> {
  if (shouldSkipOtaUpdateCheck()) return 'skipped';

  try {
    const update = await Updates.checkForUpdateAsync();
    if (!update.isAvailable) return 'not-available';
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return 'reloaded';
  } catch {
    return 'failed';
  }
}

function shouldSkipOtaUpdateCheck(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== 'undefined' ? Boolean((globalThis as any).__DEV__) : false;
  return isDev || Constants.appOwnership === 'expo' || !Updates.isEnabled;
}
