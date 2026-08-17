/**
 * sales 변형의 인증 경계.
 *
 * 현재 mobile-staff에는 native 로그인 화면이 없으므로 실행 환경이 주입한
 * access token만 이 경계에서 읽는다. 이후 native 로그인 도입 시 이 함수만
 * secure storage 기반 구현으로 교체하면 sales 화면/API 계약은 유지된다.
 */
export function getSalesAccessToken(): string | null {
  const token = process.env.EXPO_PUBLIC_SALES_ACCESS_TOKEN?.trim();
  return token || null;
}
