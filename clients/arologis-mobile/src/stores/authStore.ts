/**
 * arologis-mobile 인증 store — driver token 보관.
 *
 * D-AX-09 (passwordless) — `/auth/driver/login` 응답을 in-memory + 비동기 영속.
 *
 * 단순화 정책 (Phase 10.5 시점):
 * - secure storage 미도입 (Phase 11+ Expo SecureStore 으로 확장 검토).
 * - 본 슬라이스에서는 RN module-level 변수에만 보관 — 어플 재시작 시 재로그인 의무.
 *
 * 정식 zustand 사용은 web/desktop 패턴 일치이지만 RN expo 51+ 에서도 동작 검증됨.
 */
import { useEffect, useState } from 'react';

export interface DriverAuthSnapshot {
  accessToken: string;
  refreshToken: string;
  role: string;
  driverCode: string;
  phoneNumber: string;
  expiresAt: string;
}

let currentAuth: DriverAuthSnapshot | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getAuth(): DriverAuthSnapshot | null {
  return currentAuth;
}

export function setAuth(snapshot: DriverAuthSnapshot): void {
  currentAuth = snapshot;
  notify();
}

export function clearAuth(): void {
  currentAuth = null;
  notify();
}

/**
 * 컴포넌트가 인증 상태 변화를 구독하는 hook.
 *
 * @return 현재 auth 스냅샷 또는 null
 */
export function useAuth(): DriverAuthSnapshot | null {
  const [snapshot, setSnapshot] = useState<DriverAuthSnapshot | null>(currentAuth);
  useEffect(() => {
    const listener = (): void => setSnapshot(currentAuth);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return snapshot;
}
