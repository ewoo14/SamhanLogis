/**
 * RootNavigator — 어플 최상위 navigation.
 *
 * 사용자 결정 (2026-05-14) — react-navigation 정식 도입 전 minimal state-machine:
 *   - 비로그인 → PhoneLoginScreen (휴대번호 passwordless)
 *   - 로그인 → DispatchListScreen (본인 배차 목록)
 *
 * 부팅 시퀀스:
 * 1) PhoneLoginScreen 진입 직후 GpsPermissionScreen hook 으로 권한 요청.
 * 2) 거부 시 GpsPermissionScreen 차단 화면 (어플 사용 불가).
 * 3) 허용 시 PhoneLoginScreen 의 휴대번호 입력 노출.
 *
 * 후속 슬라이스 (F6 / F7) 에서 본 navigator 의 분기 / 화면 콘텐츠 구체화.
 */
import { useAuth } from '../stores/authStore';
import PhoneLoginScreen from '../screens/PhoneLoginScreen';
import DispatchListScreen from '../screens/DispatchListScreen';

export default function RootNavigator(): JSX.Element {
  const auth = useAuth();
  if (!auth) {
    return <PhoneLoginScreen />;
  }
  return <DispatchListScreen />;
}
