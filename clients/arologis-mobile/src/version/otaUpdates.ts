import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export type OtaUpdateResult = 'skipped' | 'not-available' | 'deferred' | 'reloaded' | 'failed';
export type OtaUpdatePhase = 'idle' | 'checking' | 'downloading' | 'available' | 'applying' | 'failed';
export interface OtaUpdatesApi { isEnabled: boolean; checkForUpdateAsync: () => Promise<{ isAvailable: boolean }>; fetchUpdateAsync: () => Promise<{ isNew: boolean }>; reloadAsync: () => Promise<void>; }
export interface OtaUpdateSnapshot { phase: OtaUpdatePhase; result?: OtaUpdateResult; activity: boolean; }
export interface OtaUpdateCoordinator { check: () => Promise<OtaUpdateResult>; setActivity: (active: boolean) => void; applyNow: () => Promise<void>; flush: () => Promise<void>; subscribe: (listener: (snapshot: OtaUpdateSnapshot) => void) => () => void; }

const MAX_DEFERRAL_MS = 5 * 60 * 1000;
const NOTICE_DELAY_MS = 1_500;
const expoUpdatesApi: OtaUpdatesApi = { isEnabled: Updates.isEnabled, checkForUpdateAsync: Updates.checkForUpdateAsync, fetchUpdateAsync: Updates.fetchUpdateAsync, reloadAsync: Updates.reloadAsync };

export function createOtaUpdateCoordinator({ updates = expoUpdatesApi, maxDeferralMs = MAX_DEFERRAL_MS, noticeDelayMs = NOTICE_DELAY_MS }: { updates?: OtaUpdatesApi; maxDeferralMs?: number; noticeDelayMs?: number } = {}): OtaUpdateCoordinator {
  let activity = false;
  let fetched = false;
  let checking: Promise<OtaUpdateResult> | null = null;
  let applying: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let snapshot: OtaUpdateSnapshot = { phase: 'idle', activity: false };
  const listeners = new Set<(next: OtaUpdateSnapshot) => void>();
  const notify = (next: OtaUpdateSnapshot) => { snapshot = { ...next, activity }; listeners.forEach((listener) => listener(snapshot)); };
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const apply = async (force = false): Promise<void> => {
    if (!fetched || (!force && activity) || applying) return applying ?? Promise.resolve();
    fetched = false; clearTimer();
    applying = (async () => { notify({ phase: 'applying', activity }); try { await updates.reloadAsync(); } finally { applying = null; } })();
    return applying;
  };
  const schedule = () => { clearTimer(); timer = setTimeout(() => { if (activity) void apply(true); else void apply(); }, activity ? maxDeferralMs : noticeDelayMs); };
  const check = async (): Promise<OtaUpdateResult> => {
    if (checking) return checking;
    if (updates === expoUpdatesApi && shouldSkipOtaUpdateCheck()) { notify({ phase: 'idle', result: 'skipped', activity }); return 'skipped'; }
    checking = (async () => {
      notify({ phase: 'checking', activity });
      try {
        const update = await updates.checkForUpdateAsync();
        if (!update.isAvailable) { notify({ phase: 'idle', result: 'not-available', activity }); return 'not-available'; }
        notify({ phase: 'downloading', activity }); await updates.fetchUpdateAsync();
        fetched = true; notify({ phase: 'available', result: 'deferred', activity }); schedule(); return 'deferred';
      } catch { fetched = false; clearTimer(); notify({ phase: 'failed', result: 'failed', activity }); return 'failed'; }
      finally { checking = null; }
    })();
    return checking;
  };
  return { check, setActivity(next) { activity = next; notify({ ...snapshot, activity }); if (!activity && fetched) void apply(); }, applyNow: () => apply(), async flush() { await checking; await applying; }, subscribe(listener) { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); } };
}
function shouldSkipOtaUpdateCheck(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== 'undefined' ? Boolean((globalThis as any).__DEV__) : false;
  return isDev || Constants.appOwnership === 'expo' || !Updates.isEnabled;
}
export const otaUpdateCoordinator = createOtaUpdateCoordinator();
export function checkForOtaUpdate(): Promise<OtaUpdateResult> { return otaUpdateCoordinator.check(); }
export function setOtaActivity(active: boolean): void { otaUpdateCoordinator.setActivity(active); }
export function subscribeToOtaUpdates(listener: (snapshot: OtaUpdateSnapshot) => void): () => void { return otaUpdateCoordinator.subscribe(listener); }
