/**
 * App.tsx — Mobile v4 entry (회고 #2 정정).
 *
 * 회고 #2 (2026-05-05) — 사용자 명시:
 *   "주문서는 ... 처음 모바일 게이트를 제외한 나머지는 모두 다름을 확인."
 *
 * 정정 결정 (mobile-staff v3 의 `App.tsx` 패턴 1:1 적용):
 *   - 이전 v4 = QueryClientProvider + NavigationContainer + RootNavigator (AuthStack + BottomTab + 7+ screen).
 *   - 신규 v4 = SafeAreaProvider + StatusBar + 단일 MobileOrderWebViewScreen.
 *
 * 인증 / RPC / mobile-mode 활성 / 뒤로가기 모두 MobileOrderWebViewScreen + WebView 안 order-legacy v4
 * 가 처리. RN 측 코드는 wrapper 만.
 */

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MobileOrderWebViewScreen from './src/screens/MobileOrderWebViewScreen';
import { usePretendardFontGuarded } from './src/theme/usePretendardFontGuarded';
import { MobileVersionGate } from './src/version/MobileVersionGate';

export default function App(): JSX.Element {
  // Phase 7 4차 잔여 — Pretendard 통일 폰트 (graceful guard).
  // expo-font 미설치 또는 asset 누락 시 no-op (즉시 ready=true), WebView 안 legacy
  // 가 자체 web font (Pretendard CDN) 로 렌더하므로 RN native UI 폰트 미적용해도 무영향.
  const fontsReady = usePretendardFontGuarded();
  if (!fontsReady) {
    // 폰트 로드 시도 중 — SafeAreaView 만 즉시 렌더 (white background, 스플래시 효과).
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <MobileVersionGate>
        <MobileOrderWebViewScreen />
      </MobileVersionGate>
    </SafeAreaProvider>
  );
}
