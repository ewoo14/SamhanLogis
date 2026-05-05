/**
 * navigation 타입 정의 — react-navigation v7 표준 declaration merging.
 *
 * Stack:
 *   - Auth: BizGate / TempPassword / Register (인증 통과 전)
 *   - Main: BottomTab (인증 후 진입)
 *
 * BottomTab:
 *   - Home: HomeScreen
 *   - Order: OrderListScreen → OrderForm / OrderDetail / ProductPicker (modal)
 *   - Notifications: NotificationListScreen
 *   - Profile: ProfileScreen → SettingsScreen
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  BizGate: undefined;
  TempPassword: { partnerCode: string; partnerName: string };
  Register: { partnerCode?: string };
};

/**
 * legacy `enterMobile(which)` 카테고리 키 (line 4467~4469).
 * - home : 홈멀티
 * - single : 싱글 세트
 * - comm : 상업멀티
 * - old : 구형
 */
export type LegacyCategory = 'home' | 'single' | 'comm' | 'old';

export type OrderStackParamList = {
  OrderList: undefined;
  /** 정정 #16 — HomeScreen 의 mobile-gate 4 카테고리에서 사전 선택된 카테고리 전달 */
  OrderForm: { initialCategory?: LegacyCategory } | undefined;
  OrderDetail: { orderId: string; orderNumber: string };
  ProductPicker: {
    onPick: (modelCode: string, modelName: string, defaultUnitPrice?: number) => void;
    /** 사전 선택된 legacy 카테고리 (없으면 사용자가 탭에서 선택) */
    initialCategory?: LegacyCategory;
  };
};

export type ProfileStackParamList = {
  Profile: undefined;
  Settings: undefined;
};

export type RootTabParamList = {
  HomeTab: undefined;
  OrderTab: NavigatorScreenParams<OrderStackParamList>;
  NotificationsTab: undefined;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<RootTabParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
