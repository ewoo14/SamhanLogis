/**
 * App.tsx — mobile-staff v2 entry.
 *
 * v1 (PR #63 close, commit `d69a7f7`) 의 RootNavigator + AuthStack + BottomTab 3-tab 전체 폐기.
 * v2 = SafeAreaProvider + StatusBar + 단일 EstimateWebViewScreen.
 *
 * 사용자 명시:
 *   "앱 버전에서도 현재 견적서의 모바일 뷰를 그대로 사용하는 방안으로 진행" — DECISIONS Phase 6 §.
 *
 * 인증 / RPC / mobile-mode 활성 / 뒤로가기 모두 EstimateWebViewScreen + WebView 안 legacy estimate
 * 가 처리. RN 측 코드는 wrapper 만.
 */

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import EstimateWebViewScreen from './src/screens/EstimateWebViewScreen';

export default function App(): JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <EstimateWebViewScreen />
    </SafeAreaProvider>
  );
}
