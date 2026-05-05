# dev report — clients/mobile (Phase 6 frontend Sub-team D)

> Phase 6 frontend Sub-team D — clients/mobile React Native (Expo SDK 53) 신규 (Plan §3 Step 1).
> 출처: `migration/analysis/06-frontend-design.md` §2.3.

## 1. 결정 사항 (Sub-team D 핵심 게이트 답변)

| 게이트 | 결정 | 근거 |
|---|---|---|
| F1 | (a) legacy 100% 보존 | partner-order index.html 의 layout/색감/spacing 을 RN 컴포넌트 (View/Text/Pressable) 로 1:1 변환. BizGate 어두운 게이트 (`#020617` + `#0b1120`) 그대로 보존. |
| F2 | (a) Expo (managed) SDK 53 | EAS Build 가능, push notification 통합 가능, 한글 폰트 link 단순. |
| F4 | (b) FCM push notification 후속 | 본 작업은 코어 주문 기능 집중. expo-notifications 통합은 별도 PR. |
| F8 | 분기계산 본 작업 보류 | gesture-handler + reanimated 복잡도 → 코어 주문 우선. |

## 2. 산출물

### 2.1 신규 디렉토리

```
clients/mobile/
├── package.json              (Expo SDK 53 + react-navigation v7 + zustand + react-query + axios)
├── app.json                  (Expo config — bundleIdentifier, package, newArchEnabled)
├── babel.config.js           (babel-preset-expo)
├── tsconfig.json             (strict, paths @/*)
├── App.tsx                   (NavigationContainer + QueryClient + SafeAreaProvider)
├── src/
│   ├── global.d.ts           (React 19 JSX namespace 글로벌 shim)
│   ├── tokens/tokens.ts      (DS tokens.css/index.ts → RN 호환 변환)
│   ├── components/           (RN 별도 — RNButton/RNCard/RNFormField/RNBadge/ScreenContainer)
│   ├── stores/               (Zustand — authStore + orderDraftStore)
│   ├── api/                  (axios + react-query — client, auth, partnerOrder, product)
│   ├── navigation/           (RootNavigator + AuthStackNavigator + BottomTabNavigator)
│   └── screens/
│       ├── auth/             (BizGate / TempPassword / Register)
│       ├── order/            (OrderList / OrderForm / OrderDetail / ProductPicker)
│       ├── home/             (Home)
│       ├── notifications/    (NotificationList)
│       └── profile/          (Profile / Settings)
├── scripts/capture.cjs       (Playwright Edge channel — QA 캡처 자동화)
├── README.md
└── .gitignore
```

### 2.2 화면 11개

| 영역 | 화면 | 비고 |
|---|---|---|
| 인증 | BizGate / TempPassword / Register | 어두운 게이트 (legacy 보존) |
| 주문 | OrderList / OrderForm / OrderDetail / ProductPicker (modal) | F8 분기계산 보류 |
| 홈 | Home | 환영 카드 + 빠른 액션 |
| 알림 | NotificationList | F4(b) FCM 후속 — 시드 데이터 |
| 프로필 | Profile / Settings | 로그아웃 + 푸시 토글 (disabled) |

## 3. DS tokens 변환 정책

`src/tokens/tokens.ts` 가 단일 진실 원천.

DS `tokens.css` / `index.ts` 의 색상값을 hard-code 하여 export. `import '@samhan/design-system/tokens.css'` 는 RN 환경에서 불가.

추가로 legacy partner-order 의 `--c-bg / --c-line / --c-accent / #020617 / #0b1120 / #3b82f6` 를 별도 alias 로 노출 (`legacyBg`, `legacyLine`, `legacyAccent`, `gateBg`, `bizBoxBg`, `bizButton`).

DS 와 동기화 책임: DS 토큰값 변경 시 `tokens.ts` 동시 업데이트.

## 4. UUID 미노출 (`feedback_uuid_no_user_visibility.md`)

화면 노출 식별자:
- `orderNumber` (PO-YYYYMMDD-NNNN)
- `partnerCode` (사업자번호 10자리)
- `partnerName` (거래처명)
- `modelCode` (품목코드)

UUID (`id`) 는 navigation params 와 react-query key 의 내부 전달 만.
`AsyncStorage` 에는 token + partnerCode + partnerName 만 저장 (partnerId 비저장).

## 5. 한국어 Javadoc / JSDoc 의무 (`feedback_function_documentation.md`)

모든 RN 컴포넌트 / store / api 함수에 한국어 JSDoc 작성:
- 출처 (legacy 매핑 + spec md 인용)
- F-게이트 결정 인용 (F1/F2/F4/F8)
- 사용처 + props 의미
- 회고 가드 인용 (UUID 미노출 등)

## 6. 검증

```sh
cd clients/mobile
npm install --legacy-peer-deps
npx tsc --noEmit          # ✅ 0 error
npx expo-doctor           # ✅ 17/17 passed
npx expo export --platform web   # ✅ 941KB bundle
```

## 7. QA 캡처 (5장)

`docs/qa/migration-fe-mobile/` 5장 (Playwright Edge channel + Expo web export, 390×844 viewport).

| # | 화면 |
|---|---|
| 01 | BizGate 사업자번호 로그인 (어두운 게이트) |
| 02 | 홈 (Bottom Tab 4 탭) |
| 03 | 주문 작성 (라인 1건) |
| 04 | Bottom Tab Navigator |
| 05 | 품목 선택 모달 |

## 8. 후속 (별도 PR 예정)

| 항목 | 내용 |
|---|---|
| F4 (b) FCM | expo-notifications 통합 + partner-service ActionLog 연동 |
| F8 분기계산 | react-native-gesture-handler + reanimated DnD (별도 sub-team) |
| 인쇄 양식 | expo-print 통합 (legacy partner-order 인쇄 모듈 마이그) |
| 튜토리얼 | 첫 사용자 onboarding (`saveTutorialState` RPC 마이그) |
| EAS Build | iOS/Android 빌드 파이프라인 + 인증서 (DEVOPS) |

## 9. 회고

| 항목 | 내용 |
|---|---|
| Expo SDK 53 + RN 0.79 + React 19 peer 충돌 | `--legacy-peer-deps` 의무 — `expo install --fix` 자동으로 모든 peerDeps 정렬 안 됨 |
| React 19 JSX namespace 제거 | `src/global.d.ts` 글로벌 shim 으로 `JSX.Element` 호환 유지 |
| Expo web export `import.meta` 오류 | 빌드 후 `index.html` 의 `<script>` 에 `type="module"` 추가 patch 필요 |
| Bottom Tab 한국어 라벨 clipping | `tabBarIconStyle: { display: 'none' }` + `lineHeight: 22` 로 해결 (icon 영역이 라벨 baseline 침범) |
| QA 캡처 | Playwright Edge channel 사용 — chromium 다운로드 회피 (이미 OS 설치된 Edge 활용) |
