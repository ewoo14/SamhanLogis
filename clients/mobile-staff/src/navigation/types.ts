/**
 * navigation 타입 정의 — react-navigation v7 표준 declaration merging.
 *
 * mobile-staff v1 (영업직원 견적 — 사용자 명시 PR #60 회고):
 *   - "견적서와 주문서 모바일은 별도 / 견적서 → 삼한 사무실 영업직원용"
 *   - Mobile v4 (clients/mobile, 거래처용) 와 분리.
 *
 * Stack:
 *   - Auth: StaffLogin (사번 + 비밀번호 native — Mobile v4 의 BizGate 와 분리)
 *   - Main: BottomTab 3 tabs (단순 — 거래처용 5 tabs 대비)
 *
 * BottomTab v1:
 *   - Home: HomeScreen (영업직원 환영 + 견적 진입 button + 최근 견적 stub)
 *   - Estimate: LegacyEstimate (WebView — estimate-app v2 = legacy estimate 18614 라인)
 *   - Profile: ProfileScreen (영업직원 프로필 + 로그아웃)
 *
 * DC 안내 / 거래처 메뉴 (legacy partner-order 의 5 추가 메뉴) 모두 X — 영업직원 전용.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  StaffLogin: undefined;
};

/**
 * v1: 단일 화면 (LegacyEstimate) — react-native-webview 로 estimate-app v2 임베드.
 *
 * estimate-app v2 (Node + Express + EJS, port 5183 / estimate.samhan-air.com) 의 views/index.ejs 가
 * legacy estimate index.html 18614 라인 1:1 보존하므로 단일 화면으로 모든 견적 작성/이력/PDF 처리.
 */
export type EstimateStackParamList = {
  LegacyEstimate: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
};

export type RootTabParamList = {
  HomeTab: undefined;
  EstimateTab: NavigatorScreenParams<EstimateStackParamList>;
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
