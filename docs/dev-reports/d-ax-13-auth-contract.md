# D-AX-13 auth contract 정합 리포트

## 목표

`/auth/me`의 BE `MeResponse`와 FE `AuthMeResponse` 불일치를 해소하고, login/refresh 응답까지 같은 공개 식별자 계약으로 정렬한다.

## 결정

- UUID는 인증/내부 저장용으로 유지하되 화면 식별자로 확장하지 않는다.
- admin 공개 식별자는 `loginId/fullName`이다.
- driver 공개 식별자는 `driverCode/phoneNumber`이다.
- `/auth/me`, login, refresh 응답 모두 role별 공개 식별자를 제공한다.

## 구현

- BE
  - `AuthTokenResponse`에 `loginId/fullName/driverCode/phoneNumber` nullable field 추가.
  - `MeResponse`에 동일한 공개 식별자 field 추가.
  - `AuthIdentityService` 추가: JWT header의 `userId/role` 기준으로 AdminUser 또는 Driver를 재조회.
  - Admin/Driver login 및 refresh rotation 응답에 role별 공개 식별자 포함.
- Desktop
  - `AuthLoginResponse`/`AuthMeResponse` 타입 확장.
  - `LoginPage`에서 `fullName` undefined 저장 방지 fallback 적용.
  - refresh interceptor에서 `loginId/fullName`을 반영 또는 기존 값 보존.
- Mobile
  - auth API 타입에 `/auth/me` 응답 타입 추가.
  - refresh helper에서 `driverCode/phoneNumber`을 반영 또는 기존 값 보존.

## 검증

- RED: 새 필드 테스트 추가 후 `compileTestJava`가 method 없음으로 실패.
- PASS: `AdminLoginServiceTest`, `DriverLoginServiceTest`, `RefreshTokenServiceTest`.
- PASS: `ArologisAdminAuthIT`, `ArologisDriverAuthIT`.
- PASS: `clients/arologis-desktop` typecheck.
- PASS: `clients/arologis-mobile` typecheck.

## QA 산출물

- 시나리오: `docs/qa/d-ax-13-auth-contract/scenarios.md`
- 캡처: `docs/qa/d-ax-13-auth-contract/screenshots/01-contract-overview.png` ~ `08-verification-matrix.png`
