/**
 * `<AuthStackNavigator>` — 인증 전 화면 stack.
 *
 * BizGate (entry) → TempPassword 또는 Register 분기.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BizGateScreen } from '@/screens/auth/BizGateScreen';
import { RegisterScreen } from '@/screens/auth/RegisterScreen';
import { TempPasswordScreen } from '@/screens/auth/TempPasswordScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStackNavigator(): JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BizGate" component={BizGateScreen} />
      <Stack.Screen name="TempPassword" component={TempPasswordScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}
