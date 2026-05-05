/**
 * SamhanLogis mobile-staff (영업직원 견적) — 루트 진입.
 *
 * - QueryClientProvider (react-query)
 * - SafeAreaProvider (insets)
 * - NavigationContainer (react-navigation v7)
 * - RootNavigator (영업직원 인증 상태 기반 분기)
 *
 * Mobile v4 (clients/mobile, 거래처용) 의 App.tsx 와 동일 구조 — 분기는 RootNavigator 내부에서 처리.
 */

import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '@/navigation/RootNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App(): JSX.Element {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <RootNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
