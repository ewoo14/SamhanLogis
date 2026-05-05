/**
 * `<RootNavigator>` — 인증 상태 기반 루트 stack.
 *
 * 미인증 → AuthStackNavigator (BizGate / TempPassword / Register)
 * 인증 → BottomTabNavigator v5 (홈 / 주문 / 견적 / 알림 / 프로필)
 *
 * v5 추가:
 *   - hydrate 시 estimate-app v2 URL 환경변수 (`EXPO_PUBLIC_ESTIMATE_APP_URL`) 검증.
 *   - 환경변수 미정의 시 dev/prod default (localhost:5183 / estimate.samhan-air.com) 사용.
 *   - 잘못된 URL 형태 시 console.warn — RN 화면에서는 LegacyEstimateWebViewScreen 의 errorBox 가 노출.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useDcConfigStore } from '@/stores/dcConfigStore';
import { validateEstimateAppUrl } from '@/webview/legacyEstimateSource';
import { AuthStackNavigator } from './AuthStackNavigator';
import { BottomTabNavigator } from './BottomTabNavigator';
import type { RootStackParamList } from './types';

const Root = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const partnerCode = useAuthStore((s) => s.partnerCode);
  const hydrate = useAuthStore((s) => s.hydrate);
  const loadDcForPartner = useDcConfigStore((s) => s.loadForPartner);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // v5 정정 — hydrate 1회 시 estimate-app v2 URL 환경변수 검증 (개발자 가시성).
  useEffect(() => {
    const v = validateEstimateAppUrl();
    if (!v.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[Mobile v5] EXPO_PUBLIC_ESTIMATE_APP_URL 형태 오류: ${v.url}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[Mobile v5] estimate-app v2 source (${v.source}): ${v.url}`);
    }
  }, []);

  // 정정 #12 — 앱 재시작 (hydrate) 후 partnerCode 보존되어 있으면 DC 설정 자동 fetch
  useEffect(() => {
    if (isAuthenticated && partnerCode) {
      void loadDcForPartner(partnerCode);
    }
  }, [isAuthenticated, partnerCode, loadDcForPartner]);

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
