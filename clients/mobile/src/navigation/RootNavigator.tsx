/**
 * `<RootNavigator>` — 인증 상태 기반 루트 stack.
 *
 * 미인증 → AuthStackNavigator (BizGate / TempPassword / Register)
 * 인증 → BottomTabNavigator (홈 / 주문 / 알림 / 프로필)
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { AuthStackNavigator } from './AuthStackNavigator';
import { BottomTabNavigator } from './BottomTabNavigator';
import type { RootStackParamList } from './types';

const Root = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <Root.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Root.Screen name="Main" component={BottomTabNavigator} />
      ) : (
        <Root.Screen name="Auth" component={AuthStackNavigator} />
      )}
    </Root.Navigator>
  );
}
