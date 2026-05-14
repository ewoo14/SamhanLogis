/**
 * useGpsPermission — 아로로지스 GPS 권한 hook.
 *
 * mobile-staff/src/hooks/useGpsPermission.ts 의 패턴 복제 (Phase 10 W10-3 결정 일치).
 *
 * 사용자 결정 4 GPS 하이브리드 (2026-05-07):
 * - foreground 권한 = 의무 (배송 도중 위치 추적)
 * - background 권한 = 선택 (운영 시점 결정)
 * - 거부 fallback = 어플 사용 불가 (차단 화면 표시)
 *
 * graceful guard — expo-location 미설치 환경 (Expo Go 일부 platform) → unavailable.
 */
import { useEffect, useState } from 'react';

export type GpsPermissionStatus = 'unknown' | 'granted' | 'denied' | 'unavailable';

export interface GpsPermissionState {
  status: GpsPermissionStatus;
  /** foreground 권한 OK 여부 (사용자 명시 — 의무). */
  foregroundGranted: boolean;
  /** background 권한 OK 여부 (선택 — 운영 시점 결정). */
  backgroundGranted: boolean;
  /** 차단 화면 표시 신호. status === 'denied' || 'unavailable' 시 true. */
  blocked: boolean;
  /** 사용자가 "다시 시도" 버튼을 눌렀을 때 재요청. */
  retry: () => void;
}

export function useGpsPermission(): GpsPermissionState {
  const [state, setState] = useState<Omit<GpsPermissionState, 'retry'>>({
    status: 'unknown',
    foregroundGranted: false,
    backgroundGranted: false,
    blocked: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // graceful require — expo-location 미설치 환경에서 throw 대신 unavailable.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Location = require('expo-location') as typeof import('expo-location');

        const fg = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (fg.status !== 'granted') {
          setState({
            status: 'denied',
            foregroundGranted: false,
            backgroundGranted: false,
            blocked: true,
          });
          return;
        }

        let bgGranted = false;
        try {
          const bg = await Location.requestBackgroundPermissionsAsync();
          if (cancelled) return;
          bgGranted = bg.status === 'granted';
        } catch {
          bgGranted = false;
        }

        setState({
          status: 'granted',
          foregroundGranted: true,
          backgroundGranted: bgGranted,
          blocked: false,
        });
      } catch {
        if (cancelled) return;
        setState({
          status: 'unavailable',
          foregroundGranted: false,
          backgroundGranted: false,
          blocked: true,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
