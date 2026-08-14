import { createOtaUpdateCoordinator } from '../../version/otaUpdates';

describe('arologis-mobile OTA coordinator', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps a fetched bundle until a driver field task finishes and never refetches it', async () => {
    const api = {
      isEnabled: true,
      checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: true }),
      fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: true }),
      reloadAsync: jest.fn().mockResolvedValue(undefined),
    };
    const coordinator = createOtaUpdateCoordinator({ updates: api, maxDeferralMs: 300_000 });

    coordinator.setActivity(true);
    await expect(coordinator.check()).resolves.toBe('deferred');
    coordinator.setActivity(false);
    await Promise.resolve();

    expect(api.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(api.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('forces a bounded apply after five minutes if a field activity signal never clears', async () => {
    const api = {
      isEnabled: true,
      checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: true }),
      fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: true }),
      reloadAsync: jest.fn().mockResolvedValue(undefined),
    };
    const coordinator = createOtaUpdateCoordinator({ updates: api, maxDeferralMs: 300_000 });

    coordinator.setActivity(true);
    await coordinator.check();
    await jest.advanceTimersByTimeAsync(300_000);

    expect(api.reloadAsync).toHaveBeenCalledTimes(1);
    expect(api.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps the fetched bundle deferred when the tab changes but an upload source remains active', async () => {
    const api = {
      isEnabled: true,
      checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: true }),
      fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: true }),
      reloadAsync: jest.fn().mockResolvedValue(undefined),
    };
    const coordinator = createOtaUpdateCoordinator({ updates: api, noticeDelayMs: 20, maxDeferralMs: 120 });

    coordinator.setActivitySource('driver-tab', true);
    coordinator.setActivitySource('photo-upload', true);
    await coordinator.check();
    coordinator.setActivitySource('driver-tab', false);
    await Promise.resolve();

    expect(api.reloadAsync).not.toHaveBeenCalled();
    coordinator.setActivitySource('photo-upload', false);
    expect(api.reloadAsync).toHaveBeenCalledTimes(1);
  });
});
