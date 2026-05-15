/**
 * App.tsx — mobile-staff entry (D-AX-19 기사 모드 은퇴).
 *
 * v1 (PR #63 close, commit `d69a7f7`) 의 RootNavigator + AuthStack + BottomTab 3-tab 전체 폐기.
 * v2 (PR #80, ad313ed) = SafeAreaProvider + StatusBar + 단일 EstimateWebViewScreen.
 * D-AX-19 = AppRootNavigator 에서 기사 모드를 제거하고 estimate WebView 단일 진입 보존.
 * 배송기사 기능은 `clients/arologis-mobile` 이 전담한다.
 *
 * 사용자 명시 (Phase 6 DECISIONS, 2026-04-30):
 *   "앱 버전에서도 현재 견적서의 모바일 뷰를 그대로 사용하는 방안으로 진행".
 *
 * 인증 / RPC / mobile-mode 활성 / 뒤로가기:
 *   - EstimateWebViewScreen + WebView 안 legacy estimate 가 처리 (RN 미관여).
 *
 * Pretendard self-host (Designer-2 채택 2026-05-07):
 *   - jsdelivr CDN 회피 + `assets/fonts/Pretendard-*.otf` 4 weight 운영 배치.
 *   - usePretendardFontGuarded() 가 expo-font 가용성 + asset 등록 graceful guard.
 */

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppRootNavigator from './src/screens/AppRootNavigator';
import { usePretendardFontGuarded } from './src/theme/usePretendardFontGuarded';

export default function App(): JSX.Element {
  // Phase 10 W10-3 — Pretendard self-host 정식 (graceful guard 보존).
  // expo-font 미설치 또는 asset 누락 시 ready=true (RN UI 미차단), WebView 안 legacy 는 자체 web
  // font (Pretendard self-host or CDN fallback) 로 렌더.
  const fontsReady = usePretendardFontGuarded();
  if (!fontsReady) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppRootNavigator />
    </SafeAreaProvider>
  );
}
