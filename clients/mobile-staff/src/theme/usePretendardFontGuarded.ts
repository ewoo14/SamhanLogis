/**
 * usePretendardFontGuarded — Phase 10 W10-3 정식 활성 (Designer-2 채택).
 *
 * 사용자 결정 (2026-05-07) — Pretendard self-host 정식 도입:
 *   - jsdelivr CDN 회피 (Phase 7 패턴 일관)
 *   - `clients/mobile-staff/assets/fonts/Pretendard-*.otf` 4 weight 운영 배치
 *   - `expo-font` 의존성 정식 추가
 *
 * 동작:
 *   - `expo-font` 가용 + asset 등록 OK → useFonts 결과 반환 (loading 동안 false).
 *   - `expo-font` 미설치 또는 asset 누락 → 항상 `true` 반환 (graceful guard, RN UI 미차단).
 *
 * 호환성:
 *   - WebView 안 estimate-app v2 는 자체 web font (Pretendard CDN) 로 렌더하므로 RN native UI 폰트
 *     미적용해도 무영향.
 *   - D-AX-19 이후 WebView 외부 RN 화면은 등록된 `Pretendard` family 적용 —
 *     `theme/tokens.ts` 의 `typography.fontFamily.sans = 'Pretendard'`.
 *
 * Hooks Rules — 조건부 hook 호출 X (try/catch 후 항상 useState/useEffect 1회 호출).
 */

import { useEffect, useState } from 'react';

/**
 * Pretendard 4 weight 파일명 매핑 — 사용자 결정 5 (W3+W4+W5+post-W5+W10-1 토큰 1:1 복제) 일관.
 *
 * self-host:
 *   - `clients/mobile-staff/assets/fonts/Pretendard-Regular.otf` (400)
 *   - `clients/mobile-staff/assets/fonts/Pretendard-Medium.otf`  (500)
 *   - `clients/mobile-staff/assets/fonts/Pretendard-SemiBold.otf` (600)
 *   - `clients/mobile-staff/assets/fonts/Pretendard-Bold.otf`     (700)
 *
 * RN family 이름 = `Pretendard` (단일 family, weight 는 fontWeight prop 으로 분기).
 * OTF 미배치 가능성 (asset bundle 부담) → graceful guard 우선.
 */
export function usePretendardFontGuarded(): boolean {
  const [ready, setReady] = useState<boolean>(true); // graceful default = ready (RN UI 미차단)

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // graceful require — expo-font 미설치 시 throw → catch 에서 ready=true 유지.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ExpoFont = require('expo-font') as typeof import('expo-font');

        // require 시점에 asset 미존재 → throw → catch.
        const fontMap = {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          'Pretendard': require('../../assets/fonts/Pretendard-Regular.otf'),
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          'Pretendard-Medium': require('../../assets/fonts/Pretendard-Medium.otf'),
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.otf'),
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.otf'),
        };

        await ExpoFont.loadAsync(fontMap);
        if (cancelled) return;
        setReady(true);
      } catch {
        if (cancelled) return;
        // expo-font 미설치 또는 asset 누락 → ready=true 유지 (graceful guard).
        // WebView 안 legacy estimate 는 자체 web font 사용하므로 RN font 미적용해도 무영향.
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
