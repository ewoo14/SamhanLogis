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
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';

export default function App(): JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
