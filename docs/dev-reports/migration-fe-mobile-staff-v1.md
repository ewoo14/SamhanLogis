# mobile-staff v1 — 영업직원용 견적 RN 앱 신규 (DECISIONS Phase 6 v4 후속 정정)

## 슬라이스 요약

- **목적**: 사용자 명시 (PR #60 회고) — "견적서와 주문서 모바일은 별도 / 견적서 → 삼한 사무실 영업직원용".
- **신규 디렉토리**: `clients/mobile-staff/` (Mobile v4 패턴 1:1, 인증/source/tabs 분리).
- **PR #60 (Mobile v5) close 사유**: 거래처 앱에 영업직원 기능 통합 잘못 → 본 mobile-staff 로 분리.
- **Mobile v4 (clients/mobile, 거래처 partner-order WebView) 보존 + DC 안내 삭제 hotfix PR #61** 별도 진행.

## 핵심 결정

### Mobile v4 (거래처) vs mobile-staff (영업직원)

| 항목 | clients/mobile (Mobile v4) | clients/mobile-staff (v1) |
|---|---|---|
| 사용자 | 외부 거래처 | 삼한 사무실 영업직원 |
| 인증 | BizGate (사업자번호) | StaffLogin (사번 + 비밀번호) |
| 메인 WebView | order.samhan-air.com (legacy partner-order) | estimate.samhan-air.com (estimate-app v2) |
| BottomTab | 홈/주문/알림/프로필 (4 tabs) | 홈/견적/프로필 (3 tabs, 단순) |
| Bundle ID | com.samhanair.mobile | com.samhan.estimate |
| App 이름 | SamhanLogis 주문 | 삼한공조 견적 |
| AsyncStorage namespace | `auth.*` | `staff.auth.*` (충돌 방지) |
| WebView header | X-Samhan-Partner | X-Samhan-Staff |
| DC 표시 | 거래처용 (별도 hotfix PR #61 로 삭제) | n/a — 영업직원은 DC OK |

### Mobile v4 패턴 1:1 + 분기 항목

mobile-staff 가 Mobile v4 / Mobile v5 의 코드 구조 1:1 재사용:

- `App.tsx` + `RootNavigator` + `AuthStackNavigator`
- `BottomTabNavigator` (3 tabs)
- `screens/estimate/LegacyEstimateWebViewScreen.tsx` (Mobile v5 의 LegacyEstimate 패턴 1:1)
- `webview/legacyEstimateShim.ts` (Mobile v5 의 shim 1:1, header 만 partnerCode → employeeCode 분리)
- `webview/legacyEstimateSource.ts` (dev/prod URL — Mobile v5 와 동일)
- `stores/authStore.ts` (영업직원 namespace + employeeCode/employeeName 분리)
- `tokens/tokens.ts` (Mobile v4 token 재사용 + `staffGateBg`/`staffBadgeBg` alias)

## 신규 파일

```
clients/mobile-staff/
├── package.json (Expo SDK 53, name "@samhan/mobile-staff", v0.1.0)
├── app.json (name "삼한공조 견적", slug "samhan-estimate", bundleId "com.samhan.estimate")
├── tsconfig.json
├── babel.config.js
├── App.tsx
├── .env.example
├── README.md
├── src/
│   ├── global.d.ts
│   ├── tokens/tokens.ts
│   ├── api/
│   │   ├── client.ts (axios + 'staff.auth.*' AsyncStorage namespace)
│   │   └── auth.ts (loginStaff + mock fallback S001/1234)
│   ├── stores/authStore.ts (Zustand — token + employeeCode + employeeName)
│   ├── navigation/
│   │   ├── types.ts (AuthStack + EstimateStack + RootTab 3-tab)
│   │   ├── RootNavigator.tsx (auth → app 분기 + URL 검증)
│   │   ├── AuthStackNavigator.tsx (StaffLogin)
│   │   └── BottomTabNavigator.tsx (3 tabs: 홈/견적/프로필)
│   ├── screens/
│   │   ├── auth/StaffLoginScreen.tsx (사번 + 비밀번호 input)
│   │   ├── home/HomeScreen.tsx (영업직원 환영 + 견적 진입 button + 최근 견적 stub)
│   │   ├── estimate/LegacyEstimateWebViewScreen.tsx (estimate-app v2 임베드)
│   │   └── profile/ProfileScreen.tsx (영업직원 정보 + 로그아웃)
│   └── webview/
│       ├── legacyEstimateShim.ts (fetch monkey-patch + Authorization Bearer + X-Samhan-Staff)
│       └── legacyEstimateSource.ts (dev:5183 / prod:estimate.samhan-air.com)
└── scripts/capture-v1.cjs (playwright QA 5 캡처)
```

## 검증 결과

| 검증 | 결과 |
|---|---|
| `npm install --legacy-peer-deps` | OK (722 packages) |
| `npx tsc --noEmit` | PASS (0 error) |
| `npx expo-doctor` | PASS (17/17 checks) |
| `npx expo export --platform web` | PASS (dist/, AppEntry 977 kB) |
| `node scripts/capture-v1.cjs` | PASS (5 PNG 생성) |

## QA 캡처 5장

`docs/qa/migration-fe-mobile-staff-v1/`:

1. `01-staff-login.png` — 사번 (S001) + 비밀번호 (1234) 입력 native, 영업직원 전용 안내 + 거래처 분리 안내
2. `02-staff-home.png` — 환영 (홍길동/S001) + 큰 "견적 작성하기" button + 최근 견적 stub + BottomTab 3 (홈/견적/프로필)
3. `03-staff-estimate-webview.png` — 견적 tab → estimate-app v2 (mobile-mode 활성, 4 카드 1열 stack 검증)
4. `04-staff-estimate-webview-after-add.png` — 라인 3개 추가 후 (신규 라인 highlight + 합계 3,419,000)
5. `05-staff-profile.png` — 영업직원 프로필 (이름/사번/권한 STAFF) + 앱 정보 + 로그아웃 button

## mobile-mode 자동 활성

estimate-app v2 의 views/index.ejs (legacy estimate 18614 라인 그대로) 가 line 7187 의
`document.body.classList.toggle('mobile-mode', isMobile)` 로 viewport 1280px 미만 시 자동 활성.

react-native-webview 의 device width (iPhone 14 Pro = 390, Galaxy S22 = 360) 가 모두 1280 미만 →
**코드 변경 0** 으로 mobile-mode 자동 활성, `.mobile-only` 자동 노출, 4 카드 grid 1열 stack.

## 회고 가드 준수

- **feedback_function_documentation.md** — 모든 신규 파일에 한국어 Javadoc 보유, 본 dev-report 누적.
- **feedback_uuid_no_user_visibility.md** — UUID 노출 0. 영업직원 식별 = 사번 (employeeCode "S001") + 이름.
- **feedback_korean_commits.md** — branch / commit 모두 한국어 (prefix `feat(mobile-staff):` 만 영문).
- **feedback_pr_qa_screenshots.md** — QA 5 캡처 (390x844 모바일 viewport).
- **feedback_pm_integration_build_check.md** — typecheck + expo-doctor + expo export 모두 PASS.

## 모호 항목 (PM 검토 요청)

### 1. 영업직원 인증 endpoint 미구현

iam-service M2 의 `POST /api/v1/auth/staff-login` endpoint 가 아직 구현되지 않음.

본 v1 에서는 `loginStaff()` 가 **404/Network 응답 시 mock fallback** 으로 자동 전환:
- S001 / 1234 → 홍길동
- S002 / 1234 → 김영희

후속 슬라이스 필요:
- `iam-service` 에 `staff-login` endpoint 추가 (Employee 테이블 조회 + Bcrypt 검증 + JWT 발급)
- mock fallback 제거

### 2. SSO vs 사번 (옵션 B)

본 v1 = 사번 + 비밀번호 (단순). SSO (OAuth) 는 후속 (v2):
- SamhanLogis 사내 OAuth provider 구축 시 RN OAuth flow (expo-auth-session) 추가
- StaffLoginScreen 에 "SSO 로그인" 보조 button 추가

### 3. WebView ↔ RN bridge 의 staff token 호환

`legacyEstimateShim.ts` 가 fetch monkey-patch 로 `X-Samhan-Staff: <employeeCode>` header 추가.
estimate-app v2 의 `server.js` / Express middleware 가 본 header 를 인지하여 RPC 권한 분기하도록
별도 BE 슬라이스 필요. 현재는 mock fallback 작동 가능 (estimate-app v2 가 인증 없이도 mock 응답).

### 4. Mobile v4 의 partner-order DC 안내 삭제 hotfix (PR #61)

본 슬라이스 범위 외 — 별도 hotfix PR #61 에서 처리.
mobile-staff 는 영업직원용 → DC 표시 없음 (영업직원은 DC 정보 OK 라는 결정 반영).

### 5. legacy estimate 18614 라인 mobile-mode 검증 — 실 환경

본 v1 의 capture 04 는 mock HTML 로 시각 검증.
실 운영에서는 estimate-app v2 (Node + Express) hosting 후 react-native-webview 로 실 EJS render
검증 필요 (Mobile v5 의 capture-v5.cjs 와 동일 한계).
