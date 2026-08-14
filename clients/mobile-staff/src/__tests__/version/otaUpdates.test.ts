import { createOtaUpdateCoordinator } from '../../version/otaUpdates';

describe('mobile-staff OTA coordinator', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not reload while a quote edit is active, then applies the fetched bundle when idle', async () => {
    const api = {
      isEnabled: true,
      checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: true }),
      fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: true }),
      reloadAsync: jest.fn().mockResolvedValue(undefined),
    };
    const coordinator = createOtaUpdateCoordinator({ updates: api, maxDeferralMs: 300_000 });

    coordinator.setActivity(true);
    await expect(coordinator.check()).resolves.toBe('deferred');
    expect(api.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(api.reloadAsync).not.toHaveBeenCalled();

    coordinator.setActivity(false);
    await Promise.resolve();
    expect(api.reloadAsync).toHaveBeenCalledTimes(1);
    expect(api.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('shows an available state before applying an idle quote update', async () => {
    const api = {
      isEnabled: true,
      checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: true }),
      fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: true }),
      reloadAsync: jest.fn().mockResolvedValue(undefined),
    };
    const coordinator = createOtaUpdateCoordinator({ updates: api, noticeDelayMs: 1_500 });
    const states: string[] = [];
    coordinator.subscribe((snapshot) => states.push(snapshot.phase));

    await expect(coordinator.check()).resolves.toBe('deferred');
    expect(states).toContain('available');
    expect(api.reloadAsync).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_500);
    expect(api.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('moves an idle notice timer to the maximum deferral when quote work starts', async () => {
    const api = {
      isEnabled: true,
      checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: true }),
      fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: true }),
      reloadAsync: jest.fn().mockResolvedValue(undefined),
    };
    const coordinator = createOtaUpdateCoordinator({ updates: api, noticeDelayMs: 20, maxDeferralMs: 120 });

    await coordinator.check();
    await jest.advanceTimersByTimeAsync(10);
    coordinator.setActivity(true);
    await jest.advanceTimersByTimeAsync(20);
    expect(api.reloadAsync).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(100);
    expect(api.reloadAsync).toHaveBeenCalledTimes(1);
  });
});
