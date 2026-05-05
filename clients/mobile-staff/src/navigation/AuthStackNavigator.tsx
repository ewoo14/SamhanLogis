/**
 * `<AuthStackNavigator>` — 영업직원 인증 stack.
 *
 * v1: 단일 StaffLoginScreen (사번 + 비밀번호 또는 SSO).
 * Mobile v4 의 BizGate (사업자번호 — 거래처용) 와 분리.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StaffLoginScreen } from '@/screens/auth/StaffLoginScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStackNavigator(): JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StaffLogin" component={StaffLoginScreen} />
    </Stack.Navigator>
  );
}
