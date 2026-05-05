/**
 * `<BottomTabNavigator>` mobile-staff v1 — 3 탭 (홈 / 견적 / 프로필).
 *
 * 사용자 명시 (PR #60 회고):
 *   - "견적서 → 삼한 사무실 영업직원용 / 주문서 → 외부 거래처용"
 *   - mobile-staff = 영업직원 전용 → Mobile v4 (거래처용) 의 5 tabs (홈/주문/견적/알림/프로필) 와 분리.
 *
 * 3 tabs 단순화:
 *   - 홈: 영업직원 환영 + 견적 진입 button + 최근 견적 stub
 *   - 견적: LegacyEstimate (WebView — estimate-app v2)
 *   - 프로필: 영업직원 정보 + 로그아웃
 *
 * 알림 / 주문 / DC 안내 / 거래처 메뉴 모두 X — 영업직원 전용 단순 UX.
 *
 * 각 탭은 독립 Stack.Navigator 보유 (탭 전환 시 stack 보존).
 */

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { LegacyEstimateWebViewScreen } from '@/screens/estimate/LegacyEstimateWebViewScreen';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { colors, fontSize, fontWeight } from '@/tokens/tokens';
import type {
  EstimateStackParamList,
  ProfileStackParamList,
  RootTabParamList,
} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const EstimateStack = createNativeStackNavigator<EstimateStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

const SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: colors.neutral0 },
  headerTitleStyle: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  headerTintColor: colors.brand500,
} as const;

/**
 * Estimate Stack v1 — 단일 LegacyEstimateWebViewScreen (react-native-webview).
 *
 * estimate-app v2 (Node + Express + EJS, port 5183) 임베드.
 * 모든 견적 작성/이력/PDF 미리보기 동작은 WebView 안 legacy estimate index.html (18614 라인) 이 처리.
 */
function EstimateStackNav(): JSX.Element {
  return (
    <EstimateStack.Navigator screenOptions={{ ...SCREEN_OPTIONS, headerShown: false }}>
      <EstimateStack.Screen name="LegacyEstimate" component={LegacyEstimateWebViewScreen} />
    </EstimateStack.Navigator>
  );
}

function ProfileStackNav(): JSX.Element {
  return (
    <ProfileStack.Navigator screenOptions={{ ...SCREEN_OPTIONS, headerShown: false }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
    </ProfileStack.Navigator>
  );
}

/**
 * 탭 아이콘 — 외부 icon 라이브러리 의존 없이 단순 dot 표시.
 * Mobile v4 와 동일.
 */
function TabIcon({ focused }: { focused: boolean }): JSX.Element {
  return (
    <View style={styles.tabIconWrap}>
      <View style={[styles.tabDot, focused && styles.tabDotActive]} />
    </View>
  );
}

export function BottomTabNavigator(): JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand500,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarIconStyle: { display: 'none' },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: '홈',
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="EstimateTab"
        component={EstimateStackNav}
        options={{
          title: '견적',
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNav}
        options={{
          title: '프로필',
          tabBarIcon: () => null,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.neutral0,
    borderTopColor: colors.border,
    height: 64,
  },
  tabBarItem: {
    paddingVertical: 8,
    justifyContent: 'center',
  },
  tabBarLabel: {
    fontSize: fontSize.sm,
    lineHeight: 22,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  tabIconWrap: {
    height: 24,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neutral300,
  },
  tabDotActive: {
    backgroundColor: colors.brand500,
  },
});
