# D-AX-15 arologis-mobile driver runtime 이식 설계

> 작성일: 2026-05-15  
> 상태: 사용자 승인 후 구현 진행  
> 범위: `clients/mobile-staff` 에 남아 있던 driver dashboard / GPS 런타임을 `clients/arologis-mobile` 안으로 먼저 이식한다. signature / photo 는 후속 PR로 남긴다.

## 1. 배경

D-AX-12 에서 `mobile-staff` driver tab 의 Samhan Public `SlipDetailScreen` 직접 import 를 `DriverSlipDetailEntry` 경계로 끊었다. 다음 단계는 문서에 남긴 후속 항목 그대로 `arologis-mobile` 이 실제 기사 앱 화면을 자체 보유하도록 만드는 것이다.

현재 `clients/arologis-mobile` 은 passwordless phone login, GPS permission gate, dispatch list placeholder 만 있다. 이 상태에서는 독립 앱은 존재하지만 기사 운영의 첫 화면과 GPS 보고 흐름이 아직 `mobile-staff` 에 남아 있다.

## 2. 목표

- 로그인 성공 후 `arologis-mobile` 이 placeholder 목록 대신 전용 `DriverTabNavigator` 로 진입한다.
- 이번 PR에서는 `DriverDashboardScreen`, `DriverLocationTrackingScreen`, `DriverTabNavigator` 만 `arologis-mobile` 내부 소스 트리로 이식한다.
- driver dashboard / GPS 화면이 필요한 API helper, user color hash, RN token helper 를 `arologis-mobile` 안에 둬 cross-package import 를 만들지 않는다.
- `mobile-staff` driver mode 는 이번 PR에서 삭제하지 않는다. 실제 운영 전환 확인 뒤 별도 제거 PR로 처리한다.
- PR에는 여러 테스트를 진행한 뒤 큰 한국어 QA 캡처를 인라인 첨부한다.

## 3. 비목표

- `clients/mobile-staff/src/screens/driver` 삭제 또는 AppRootNavigator 단순화는 하지 않는다.
- 배차 API 응답 schema 를 변경하지 않는다.
- 서명, 배송사진, 검수사진, 실제 slipId bridge 를 새로 설계하지 않는다.
- `react-navigation` 을 새로 도입하지 않는다. 기존 minimal tab state-machine 을 그대로 사용한다.

## 4. 채택 접근

| 접근 | 장점 | 단점 | 판단 |
|---|---|---|---|
| A. dashboard + GPS 만 먼저 이식 | 독립 앱의 첫 운영 흐름 확보, 변경 범위 작음, 추가 native 의존성 없음 | 서명/사진은 다음 PR 필요 | 채택 |
| B. monorepo shared RN package 생성 | 장기 중복 감소 | Metro/Vite/Expo 경계 설계가 커져 이번 PR 범위 초과 | 보류 |
| C. mobile-staff driver mode 를 동시에 제거 | 중복 즉시 제거 | 앱 전환 회귀 위험 큼, 운영 확인 전 위험 | 폐기 |

채택안은 A다. D-AX-15 는 독립 앱에 dashboard + GPS 를 먼저 붙이는 작은 PR이고, signature / photo / mobile-staff 제거는 검증 후 후속으로 넘긴다.

## 5. 구현 설계

### 5.1 파일 경계

`clients/arologis-mobile/src/screens/driver/` 아래에 driver 화면을 배치한다. 화면은 `../../api/arologis`, `../../hooks/useGpsPermission`, `../../theme/tokens`, `../../utils/userColorHash` 만 참조한다.

### 5.2 API base

`arologis-mobile` driver API helper 는 기존 앱의 `EXPO_PUBLIC_AROLOGIS_API_BASE` 를 사용한다. local default 는 `http://localhost:8097` 로 유지해 arologis-service 직접 호출과 일치시킨다.

### 5.3 RootNavigator

GPS gate 와 phone login 은 그대로 유지한다. 인증 snapshot 이 있으면 `DispatchListScreen` placeholder 대신 `DriverTabNavigator` 로 들어간다. `accessToken`, `driverCode`, `backgroundGranted` 는 props 로 넘기고, 사용자 화면에는 UUID 를 노출하지 않는다.

### 5.4 의존성

dashboard + GPS 범위는 기존 `expo-location` 만 사용한다. 이번 PR에서 `package.json` 신규 의존성을 추가하지 않는다.

### 5.5 QA 캡처

`docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/` 에 큰 PNG 8장을 생성한다. 캡처는 mock render 이지만 실제 구현 흐름과 동일한 화면 상태를 한국어로 보여준다.

필수 상태:

- 로그인 후 driver tab 진입
- 배차 dashboard
- GPS tracking
- dashboard empty state
- dashboard error state
- GPS permission block
- typecheck 결과
- import boundary search 결과

## 6. 검증

로컬 검증:

- `cd clients/arologis-mobile && npm run typecheck`
- `.\scripts\generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1`
- `rg -n "clients/mobile-staff|\\.\\./\\.\\./\\.\\./mobile-staff" clients/arologis-mobile/src` 결과 없음

문서 검증:

- `clients/arologis-mobile/README.md`
- `clients/mobile-staff/README.md`
- `docs/dev-reports/d-ax-15-arologis-mobile-driver-runtime.md`
- `docs/qa/d-ax-15-arologis-mobile-driver-runtime/scenarios.md`
- `docs/handoff/CURRENT-WORK.md`
- `migration/decisions/DECISIONS.md`

## 7. 후속

- 다음 PR에서 signature / delivery photo / inspection photo 를 별도 이식한다.
- 실제 dispatch response 에 slip 연결값이 들어오면 아로로지스 전용 상세 bridge 를 설계한다.
- `arologis-mobile` 실기기 QA 후 `mobile-staff` driver mode 제거 PR을 별도로 진행한다.
- 운영 gateway domain 확정 시 `EXPO_PUBLIC_AROLOGIS_API_BASE` 배포 값을 문서화한다.

## 8. Self Review

- Placeholder / TBD 없음.
- D-AX-12 후속 범위 중 dashboard + GPS 만 단일 PR로 제한했다.
- `mobile-staff` 삭제를 비목표로 명시해 운영 전환 회귀를 막았다.
- UUID 비공개, PR 캡처 상세 첨부 요구, cross-import 금지 조건을 검증 항목에 포함했다.
