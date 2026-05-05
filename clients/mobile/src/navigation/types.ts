/**
 * navigation 타입 정의 — react-navigation v7 표준 declaration merging.
 *
 * v4 (legacy 임베드):
 *   - Order Stack 의 6 React 화면 (OrderList/OrderForm/OrderDetail/ProductPicker/
 *     BranchCalc/DraftList) 폐기 → 단일 `LegacyOrder` (react-native-webview).
 *   - 모든 견적/주문/조회/저장 동작 = WebView 안 legacy index.html 이 처리.
 *
 * v5 (estimate-app v2 추가):
 *   - 신규 EstimateStack — `LegacyEstimate` (react-native-webview, estimate-app v2 임베드).
 *   - BottomTab 5번째 tab '견적' 추가 (홈/주문/견적/알림/프로필).
 *   - 사용자 명시 — "기존 레거시 코드에는 견적서와 주문서 모두 모바일 버전이 있으므로
 *     이를 참고하여 그대로 구현 / 앱버전으로도 제작 요청".
 *
 * Stack:
 *   - Auth: BizGate / TempPassword / Register (인증 통과 전 — RN native 보존)
 *   - Main: BottomTab (인증 후 진입 — RN native 보존)
 *
 * BottomTab v5:
 *   - Home: HomeScreen (legacy 4 카테고리 진입 버튼 + 추가 메뉴)
 *   - Order: LegacyOrder (WebView — partner-order 9427 라인)
 *   - Estimate: LegacyEstimate (WebView — estimate-app v2 = legacy estimate 18614 라인)
 *   - Notifications: NotificationListScreen (RN native)
 *   - Profile: ProfileScreen → SettingsScreen (RN native)
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

/**
 * v4: 단일 화면 (LegacyOrder) — react-native-webview 로 legacy index.html 임베드.
 *
 * 이전 v3 의 6 화면 (OrderList/OrderForm/OrderDetail/ProductPicker/BranchCalc/DraftList) 모두
 * WebView 가 처리 — RN 측은 navigation routing 만 담당.
 *
 * `initialCategory`: HomeScreen 의 4 카테고리 버튼 클릭 시 legacy `enterMobile(which)` 사전 트리거.
 */
export type OrderStackParamList = {
  LegacyOrder: { initialCategory?: LegacyCategory } | undefined;
};

/**
 * v5: 신규 EstimateStack — estimate-app v2 (Node + Express + EJS, port 5183) 임베드.
 *
 * estimate-app v2 의 views/index.ejs 가 legacy estimate index.html 18614 라인 1:1 보존하므로
 * 단일 화면으로 모든 견적 작성/이력/PDF 미리보기 처리.
 */
export type EstimateStackParamList = {
  LegacyEstimate: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Settings: undefined;
};

export type RootTabParamList = {
  HomeTab: undefined;
  OrderTab: NavigatorScreenParams<OrderStackParamList>;
  EstimateTab: NavigatorScreenParams<EstimateStackParamList>;
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
