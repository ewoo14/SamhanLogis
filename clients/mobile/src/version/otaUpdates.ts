import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export type OtaUpdateResult = 'skipped' | 'not-available' | 'deferred' | 'reloaded' | 'failed';
export type OtaUpdatePhase = 'idle' | 'checking' | 'downloading' | 'available' | 'applying' | 'failed';

export interface OtaUpdatesApi {
  isEnabled: boolean;
  checkForUpdateAsync: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync: () => Promise<{ isNew: boolean }>;
  reloadAsync: () => Promise<void>;
}

export interface OtaUpdateSnapshot {
  phase: OtaUpdatePhase;
  result?: OtaUpdateResult;
  activity: boolean;
}

export interface OtaUpdateCoordinator {
  check: () => Promise<OtaUpdateResult>;
  setActivity: (active: boolean) => void;
  applyNow: () => Promise<void>;
  flush: () => Promise<void>;
  subscribe: (listener: (snapshot: OtaUpdateSnapshot) => void) => () => void;
}

const MAX_DEFERRAL_MS = 5 * 60 * 1000;
const NOTICE_DELAY_MS = 1_500;

const expoUpdatesApi: OtaUpdatesApi = {
  isEnabled: Updates.isEnabled,
  checkForUpdateAsync: Updates.checkForUpdateAsync,
  fetchUpdateAsync: Updates.fetchUpdateAsync,
  reloadAsync: Updates.reloadAsync,
};

/**
 * OTA bundle은 먼저 받고, 실제 reload는 WebView의 미저장 입력·진행 중 요청이 끝난 뒤 수행한다.
 * 이미 받은 bundle은 coordinator가 보관하므로 idle 전환 때 재다운로드하지 않는다.
 */
export function createOtaUpdateCoordinator({
  updates = expoUpdatesApi,
  maxDeferralMs = MAX_DEFERRAL_MS,
  noticeDelayMs = NOTICE_DELAY_MS,
}: {
  updates?: OtaUpdatesApi;
  maxDeferralMs?: number;
  noticeDelayMs?: number;
} = {}): OtaUpdateCoordinator {
  let activity = false;
  let fetched = false;
  let checking: Promise<OtaUpdateResult> | null = null;
  let applying: Promise<void> | null = null;
  let deferralTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot: OtaUpdateSnapshot = { phase: 'idle', activity: false };
  const listeners = new Set<(next: OtaUpdateSnapshot) => void>();

  const notify = (next: OtaUpdateSnapshot) => {
    snapshot = { ...next, activity };
    listeners.forEach((listener) => listener(snapshot));
  };

  const clearDeferralTimer = () => {
    if (deferralTimer !== null) clearTimeout(deferralTimer);
    deferralTimer = null;
  };

  const applyNow = async (force = false): Promise<void> => {
    if (!fetched || (!force && activity) || applying) return applying ?? Promise.resolve();
    fetched = false;
    clearDeferralTimer();
    applying = (async () => {
      notify({ phase: 'applying', activity });
      try {
        await updates.reloadAsync();
      } finally {
        applying = null;
      }
    })();
    return applying;
  };

  const scheduleApply = (initialNotice = false) => {
    clearDeferralTimer();
    if (!activity) {
      if (!initialNotice) {
        void applyNow();
        return;
      }
      deferralTimer = setTimeout(() => {
        if (activity) scheduleApply();
        else void applyNow();
      }, noticeDelayMs);
      return;
    }
    deferralTimer = setTimeout(() => {
      // Activity가 오래 지속되는 경우에도 받은 bundle을 버리거나 재다운로드하지 않는다.
      void applyNow(true);
    }, maxDeferralMs);
  };

  const check = async (): Promise<OtaUpdateResult> => {
    if (checking) return checking;
    if (updates === expoUpdatesApi && shouldSkipOtaUpdateCheck(updates)) {
      notify({ phase: 'idle', result: 'skipped', activity });
      return 'skipped';
    }

    checking = (async () => {
      notify({ phase: 'checking', activity });
      try {
        const update = await updates.checkForUpdateAsync();
        if (!update.isAvailable) {
          notify({ phase: 'idle', result: 'not-available', activity });
          return 'not-available';
        }
        notify({ phase: 'downloading', activity });
        await updates.fetchUpdateAsync();
        fetched = true;
        notify({ phase: 'available', result: activity ? 'deferred' : undefined, activity });
        scheduleApply(true);
        // idle 상태도 안내 배너가 그려질 시간을 보장한 뒤 timer가 적용한다.
        return 'deferred';
      } catch {
        fetched = false;
        clearDeferralTimer();
        notify({ phase: 'failed', result: 'failed', activity });
        return 'failed';
      } finally {
        checking = null;
      }
    })();
    return checking;
  };

  return {
    check,
    setActivity(nextActive) {
      activity = nextActive;
      notify({ ...snapshot, activity });
      if (!activity && fetched) void applyNow();
    },
    applyNow,
    async flush() {
      await checking;
      await applying;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * EAS Update publish는 EAS 계정/projectId 연동 후 활성화한다.
 */
export async function checkForOtaUpdate(): Promise<OtaUpdateResult> {
  return otaUpdateCoordinator.check();
}

function shouldSkipOtaUpdateCheck(updates: OtaUpdatesApi): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== 'undefined' ? Boolean((globalThis as any).__DEV__) : false;
  return isDev || Constants.appOwnership === 'expo' || !updates.isEnabled;
}

export const otaUpdateCoordinator = createOtaUpdateCoordinator();

export function setOtaActivity(active: boolean): void {
  otaUpdateCoordinator.setActivity(active);
}

export function subscribeToOtaUpdates(listener: (snapshot: OtaUpdateSnapshot) => void): () => void {
  return otaUpdateCoordinator.subscribe(listener);
}
