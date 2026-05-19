/**
 * arologis-mobile App.tsx — 아로로지스 기사 어플 진입점.
 *
 * mobile-staff 의 App.tsx 패턴 (SafeAreaProvider + StatusBar) 을 단순화.
 * estimate WebView 분기 제거 (본 어플은 driver 단일 모드).
 *
 * 부팅 시퀀스:
 * 1) Pretendard font load (graceful guard — 미설치 환경에서도 RN UI 차단하지 않음).
 * 2) RootNavigator → 토큰 부재 시 PhoneLoginScreen, 있으면 DispatchListScreen.
 */
import * as React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { usePretendardFontGuarded } from './src/theme/usePretendardFontGuarded';

export default function App(): React.ReactElement {
  // Pretendard self-host (mobile-staff 패턴 일관 — Designer-2 채택 2026-05-07).
  // expo-font 미설치 또는 asset 누락 시 fontsReady=true (graceful guard, RN UI 미차단).
  const fontsReady = usePretendardFontGuarded();

  if (!fontsReady) {
    // 폰트 로딩 중 — SafeAreaProvider 유지, Navigator 미마운트 (SplashScreen 대체).
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
