# D-AX-15 arologis-mobile dashboard/GPS 이식 Dev Report

## Result

`clients/arologis-mobile` 로그인 후 화면을 placeholder `DispatchListScreen` 에서 전용 `DriverTabNavigator` 로 변경했다.
이번 PR 범위는 사용자 승인 추천안 B에 따라 dashboard + GPS 두 탭이다.

## Changed

- `src/screens/driver/DriverDashboardScreen.tsx`
- `src/screens/driver/DriverLocationTrackingScreen.tsx`
- `src/screens/driver/DriverTabNavigator.tsx`
- `src/api/arologis.ts`
- `src/utils/userColorHash.ts`
- `src/theme/tokens.ts`
- `src/hooks/useGpsPermission.ts`
- `src/navigation/RootNavigator.tsx`

## Validation

- `cd clients/arologis-mobile && npm install`
- `cd clients/arologis-mobile && npm run typecheck`
- `rg -n 'clients/mobile-staff|mobile-staff|../../../mobile-staff' clients/arologis-mobile/src`
- `.\scripts\generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1`

## Notes

- `npm install` 은 기존 `package.json` 에 있던 D-AX-14 의 `expo-secure-store`, `react-native-device-info` 를 `package-lock.json` 에 동기화했다.
- 이번 PR에서 서명/사진 native dependency 는 추가하지 않았다.
- `.codex/config.toml` 은 기존 untracked 로 남겨두며 stage 하지 않는다.

## Follow-up

- 다음 PR 후보 1: signature / sign-and-send-copy 이식.
- 다음 PR 후보 2: 배송사진 / 검수사진 이식.
- 다음 PR 후보 3: auth schema `/auth/me` 정합 검증.
- 운영 검증 후 `mobile-staff` driver mode 제거는 별도 PR로 진행한다.
