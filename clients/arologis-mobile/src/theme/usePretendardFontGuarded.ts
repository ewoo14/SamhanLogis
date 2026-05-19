/**
 * usePretendardFontGuarded — 아로로지스 기사 어플 Pretendard self-host.
 *
 * mobile-staff 의 동명 hook (Phase 10 W10-3 Designer-2 채택) 과 동일 패턴.
 *
 * 동작:
 *   - `expo-font` 가용 + asset 등록 OK → useFonts 결과 반환 (loading 동안 false).
 *   - `expo-font` 미설치 또는 asset 누락 → 항상 `true` 반환 (graceful guard, RN UI 미차단).
 *
 * 폰트 파일 위치:
 *   - `clients/arologis-mobile/assets/fonts/Pretendard-Regular.otf`  (400)
 *   - `clients/arologis-mobile/assets/fonts/Pretendard-Medium.otf`   (500)
 *   - `clients/arologis-mobile/assets/fonts/Pretendard-SemiBold.otf` (600)
 *   - `clients/arologis-mobile/assets/fonts/Pretendard-Bold.otf`     (700)
 *
 * RN family 이름 = `Pretendard` (단일 family, weight 는 fontWeight prop 으로 분기).
 *
 * Hooks Rules — 조건부 hook 호출 X (try/catch 후 항상 useState/useEffect 1회 호출).
 */

import { useEffect, useState } from 'react';

export function usePretendardFontGuarded(): boolean {
  // graceful default = ready (RN UI 미차단)
  const [ready, setReady] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // graceful require — expo-font 미설치 시 throw → catch 에서 ready=true 유지.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ExpoFont = require('expo-font') as typeof import('expo-font');

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
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
