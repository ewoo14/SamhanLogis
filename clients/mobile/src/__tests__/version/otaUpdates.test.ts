import { createOtaUpdateCoordinator, type OtaUpdatesApi } from '../../version/otaUpdates';

function api(): jest.Mocked<OtaUpdatesApi> {
  return {
    isEnabled: true,
    checkForUpdateAsync: jest.fn(),
    fetchUpdateAsync: jest.fn(),
    reloadAsync: jest.fn(),
  };
}

describe('OTA 업데이트 적용 경계', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('업데이트가 없으면 reload하지 않는다', async () => {
    const updates = api();
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const coordinator = createOtaUpdateCoordinator({ updates });

    await expect(coordinator.check()).resolves.toBe('not-available');
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('작업 중에는 받은 번들을 재사용하고 idle 전환 때 한 번만 reload한다', async () => {
    const updates = api();
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    updates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
    updates.reloadAsync.mockResolvedValue(undefined);
    const coordinator = createOtaUpdateCoordinator({ updates });
    coordinator.setActivity(true);

    await expect(coordinator.check()).resolves.toBe('deferred');
    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(updates.reloadAsync).not.toHaveBeenCalled();

    coordinator.setActivity(false);
    await coordinator.flush();
    await coordinator.applyNow();
    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('idle 상태에서도 준비 완료 상태를 잠시 보여 준 뒤 reload한다', async () => {
    jest.useFakeTimers();
    const updates = api();
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    updates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
    updates.reloadAsync.mockResolvedValue(undefined);
    const snapshots: string[] = [];
    const coordinator = createOtaUpdateCoordinator({ updates, noticeDelayMs: 1_000 });
    coordinator.subscribe((snapshot) => snapshots.push(snapshot.phase));

    const check = coordinator.check();
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots).toContain('available');
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1_000);
    await expect(check).resolves.toBe('deferred');
    await coordinator.flush();
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('활동 신호가 끝나지 않아도 최대 지연 시간이 지나면 reload한다', async () => {
    jest.useFakeTimers();
    const updates = api();
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    updates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
    updates.reloadAsync.mockResolvedValue(undefined);
    const coordinator = createOtaUpdateCoordinator({ updates, maxDeferralMs: 5_000 });
    coordinator.setActivity(true);

    await expect(coordinator.check()).resolves.toBe('deferred');
    await jest.advanceTimersByTimeAsync(5_000);
    await coordinator.flush();
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });
});
