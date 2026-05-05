/**
 * SamhanLogis Mobile — 루트 진입.
 *
 * - QueryClientProvider (react-query)
 * - SafeAreaProvider (insets)
 * - NavigationContainer (react-navigation v7)
 * - RootNavigator (auth 상태 기반 분기)
 *
 * 출처: 06-frontend-design.md §2.3 clients/mobile.
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
