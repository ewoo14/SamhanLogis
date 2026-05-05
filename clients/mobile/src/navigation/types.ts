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

export type OrderStackParamList = {
  OrderList: undefined;
  OrderForm: undefined;
  OrderDetail: { orderId: string; orderNumber: string };
  ProductPicker: { onPick: (modelCode: string, modelName: string) => void };
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
