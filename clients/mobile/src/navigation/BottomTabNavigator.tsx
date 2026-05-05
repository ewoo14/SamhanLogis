/**
 * `<BottomTabNavigator>` — 4 탭 (홈 / 주문 / 알림 / 프로필).
 *
 * 각 탭은 독립 Stack.Navigator 보유 (탭 전환 시 stack 보존).
 *
 * 출처: 06-frontend-design.md §2.3.2 화면 구조.
 */

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { NotificationListScreen } from '@/screens/notifications/NotificationListScreen';
import { BranchCalcScreen } from '@/screens/order/BranchCalcScreen';
import { DraftListScreen } from '@/screens/order/DraftListScreen';
import { OrderDetailScreen } from '@/screens/order/OrderDetailScreen';
import { OrderFormScreen } from '@/screens/order/OrderFormScreen';
import { OrderListScreen } from '@/screens/order/OrderListScreen';
import { ProductPickerScreen } from '@/screens/order/ProductPickerScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { SettingsScreen } from '@/screens/profile/SettingsScreen';
import { colors, fontSize, fontWeight } from '@/tokens/tokens';
import type { OrderStackParamList, ProfileStackParamList, RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const OrderStack = createNativeStackNavigator<OrderStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

const SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: colors.neutral0 },
  headerTitleStyle: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  headerTintColor: colors.brand500,
} as const;

function OrderStackNav(): JSX.Element {
  return (
    <OrderStack.Navigator screenOptions={SCREEN_OPTIONS}>
      <OrderStack.Screen name="OrderList" component={OrderListScreen} options={{ title: '주문 목록' }} />
      <OrderStack.Screen name="OrderForm" component={OrderFormScreen} options={{ title: '주문 작성' }} />
      <OrderStack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: '주문 상세' }} />
      <OrderStack.Screen
        name="ProductPicker"
        component={ProductPickerScreen}
        options={{ title: '품목 선택', presentation: 'modal' }}
      />
      {/* 정정 #17 — legacy `#btnOpenBranch` (line 668) placeholder */}
      <OrderStack.Screen
        name="BranchCalc"
        component={BranchCalcScreen}
        options={{ title: '임의 분기계산' }}
      />
      {/* 정정 #17 — legacy `#btnDraftList` (mobile) 저장내역 */}
      <OrderStack.Screen
        name="DraftList"
        component={DraftListScreen}
        options={{ title: '저장내역' }}
      />
    </OrderStack.Navigator>
  );
}

function ProfileStackNav(): JSX.Element {
  return (
    <ProfileStack.Navigator screenOptions={SCREEN_OPTIONS}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ title: '내 정보' }} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />
    </ProfileStack.Navigator>
  );
}

/**
 * 탭 아이콘 — 외부 icon 라이브러리 의존 없이 단순 dot 표시.
 * 라벨은 react-navigation tabBarLabel 가 별도 렌더하므로 dot 만 노출.
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
        name="OrderTab"
        component={OrderStackNav}
        options={{
          title: '주문',
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="NotificationsTab"
        component={NotificationListScreen}
        options={{
          title: '알림',
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
