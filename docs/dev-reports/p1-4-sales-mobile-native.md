# P1-4 영업 native 앱 — Expo 빌드 설정 보강 dev-report

| 항목       | 값                                      |
| --------- | --------------------------------------- |
| 작성일     | 2026-05-11                              |
| 담당       | DevOps agent                            |
| PR 대상    | feature/p1-4-expo-build-config          |
| 대상 클라이언트 | clients/mobile-staff (RN Expo SDK 53)  |
| 관련 Phase | Phase 11+1개월 — P1-4 영업 native 앱 준비 |
| 선행 PR    | #134~#143 (Phase 12 시리즈)             |

---

## 1. 배경 및 목적

Phase 12 PR #134~#143 완료 시점에서 `clients/mobile-staff` 는 다음 상태였다.

- estimate mode = react-native-webview 기반 legacy estimate-app v2 임베드 (WebView only).
- driver mode = arologis-service 3 endpoint native (Phase 10 W10-3).
- 영업 native 앱 (P1-4) = 미구현 (Phase 11+1개월 계획).

P1-4 슬라이스는 아직 구현 단계가 아니지만, Phase 11 AWS 배포(단일 EC2 m5.xlarge) 이후
EAS Build 를 통해 App Store / Play Store 에 배포하는 경로를 사전에 확보해야 한다.
본 dev-report 는 그 인프라 준비 작업의 산출물을 기록한다.

---

## 2. 산출물 목록

### 2-1. DevOps 산출물 (본 dev-report 담당)

| 파일                                          | 구분  | 설명                                              |
| -------------------------------------------- | ----- | ------------------------------------------------- |
| `clients/mobile-staff/app.config.js`          | 신규  | 동적 Expo 설정 — BUILD_ENV / APP_VARIANT 분기     |
| `clients/mobile-staff/eas.json`               | 신규  | EAS Build 프로파일 4종                            |
| `clients/mobile-staff/.env.example`           | 보강  | P1-4 예약 변수 + EAS Build 변수 추가              |
| `.github/workflows/ci.yml`                   | 보강  | frontend-mobile-staff job 3단계 추가              |
| `docs/dev-reports/p1-4-sales-mobile-native.md` | 신규 | 본 dev-report                                   |

### 2-2. BE agent 선행 산출물 (slip-service P1-4 mobile endpoint)

| 파일                                                                                           | 구분  | 설명                                      |
| --------------------------------------------------------------------------------------------- | ----- | ----------------------------------------- |
| `services/slip-service/src/.../mobile/dto/MobilePartnerOrderRequest.java`                     | 신규  | 모바일 파트너 주문 생성 요청 DTO            |
| `services/slip-service/src/.../mobile/dto/MobileQuotationRequest.java`                        | 신규  | 모바일 견적 생성 요청 DTO                  |
| `services/slip-service/src/.../mobile/dto/MobileSalesDashboardResponse.java`                  | 신규  | 영업 대시보드 집계 응답 DTO                |
| `services/slip-service/src/.../mobile/service/MobilePartnerOrderService.java`                 | 신규  | 파트너 주문 생성 서비스 (7.5 KB)           |
| `services/slip-service/src/.../mobile/service/MobileQuotationService.java`                    | 신규  | 모바일 견적 생성 서비스 (7.0 KB)           |
| `services/slip-service/src/.../mobile/service/MobileSalesDashboardService.java`               | 신규  | 영업 대시보드 집계 서비스 (7.1 KB)         |

### 2-3. FE agent 선행 산출물 (mobile-staff P1-4 화면 + API)

| 파일                                                        | 구분  | 설명                                              |
| ---------------------------------------------------------- | ----- | ------------------------------------------------- |
| `clients/mobile-staff/src/api/sales.ts`                    | 신규  | 영업 API client — 4 endpoint (9.0 KB)            |
| `clients/mobile-staff/src/api/salesUtils.ts`               | 신규  | assertApiResponseSuccess / SalesApiError 공통 유틸 |
| `clients/mobile-staff/src/screens/sales/SalesHomeScreen.tsx` | 신규 | 영업 대시보드 화면 (9.8 KB)                      |
| `clients/mobile-staff/src/screens/sales/CustomerSearchScreen.tsx` | 신규 | 거래처 자동완성 검색 화면 (9.8 KB)          |
| `clients/mobile-staff/src/screens/sales/QuotationCreateScreen.tsx` | 신규 | 견적서 생성 4-step form (18.9 KB)          |

### 2-4. Designer agent 선행 산출물

| 파일                                              | 구분  | 설명                                  |
| ------------------------------------------------ | ----- | ------------------------------------- |
| `clients/mobile-staff/SALES-APP-DESIGN.md`        | 신규  | P1-4 영업 native 앱 디자인 명세 (32 KB) |

---

## 3. app.config.js 설계

### 3-1. 환경변수 체계

| 변수                        | 노출 대상       | 용도                                    |
| -------------------------- | -------------- | --------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`  | 번들 (클라이언트) | API gateway URL                        |
| `EXPO_PUBLIC_ESTIMATE_APP_URL` | 번들          | legacy estimate-app v2 URL             |
| `BUILD_ENV`                 | 빌드 시점 only  | development / preview / production     |
| `APP_VARIANT`               | 빌드 시점 only  | staff (현재) / sales (P1-4 분리 예정)  |
| `EXPO_BUILD_NUMBER`         | CI 주입         | iOS buildNumber / Android versionCode  |
| `EAS_PROJECT_ID`            | CI 주입         | EAS 프로젝트 UUID                       |

### 3-2. resolveApiBaseUrl 우선순위

```
EXPO_PUBLIC_API_BASE_URL (명시) > BUILD_ENV=production > BUILD_ENV=preview > localhost:8080
```

### 3-3. APP_VARIANT 분기

현재는 `staff` 단일값. P1-4 활성 시 `sales` 추가:

```
APP_VARIANT=staff  →  com.samhan.estimate.* (현재)
APP_VARIANT=sales  →  com.samhan.sales.*    (P1-4 Phase 11+1개월)
```

iOS bundleIdentifier, Android package, 앱 이름, EAS 채널이 모두 variant 에 따라 분기된다.

---

## 4. EAS Build 프로파일 (eas.json)

| 프로파일              | 배포 대상                  | BUILD_ENV   | APP_VARIANT | Android 아티팩트 |
| -------------------- | ------------------------- | ----------- | ----------- | -------------- |
| `development`        | 시뮬레이터 / 디버그 기기   | development | staff       | APK (debug)    |
| `preview`            | TestFlight / 내부 트랙     | preview     | staff       | APK            |
| `production`         | App Store / Play Store    | production  | staff       | AAB            |
| `p1-4-sales-preview` | P1-4 영업 앱 내부 검증     | preview     | sales       | APK            |

`production` 프로파일은 `autoIncrement: true` 로 versionCode / buildNumber 를 EAS 가 자동 관리한다.

### 4-1. 활성 전 필요 작업 (Phase 11 cutover 시)

1. `npx eas login` + `npx eas init` — EAS 계정 생성 후 `projectId` 확보.
2. `eas.json` / `app.config.js` 의 `PLACEHOLDER_EAS_PROJECT_ID` 교체.
3. iOS: Apple Developer 계정 + Distribution Certificate + Provisioning Profile 등록.
4. Android: Google Play 서비스 계정 JSON 발급 (`google-play-service-account.json`).
5. `eas secret:create` 로 `EXPO_PUBLIC_API_BASE_URL` (production 값) CI 시크릿 등록.
6. `eas build --platform all --profile production` 첫 빌드 실행 (Phase 11+1개월 기준).

---

## 5. CI workflow 변경사항

`frontend-mobile-staff` job 에 3단계 추가:

### 5-1. app.config.js 환경변수 분기 점검

`node` 로 `app.config.js` 를 직접 실행하여 `name`, `version`, `extra.buildEnv`,
`ios.bundleIdentifier`, `android.package` 존재 확인. BUILD_ENV 미설정(development 기본) 상태로 CI 실행.

### 5-2. Expo doctor (기존 유지)

`continue-on-error: true` 유지 — SDK patch 버전 경고 / asset 부분 누락 회귀 허용.

### 5-3. Expo prebuild dry-run (기존 유지)

`continue-on-error: true` 유지 — app.config.js 동적 설정 추가 후에도 native 생성 경로 이상 없음 확인.

### 5-4. eas.json 구문 검증 (신규)

`node -e` 로 `eas.json` JSON 파싱 + `build` 프로파일 키 목록 확인. EAS CLI 미설치 환경에서도 동작.

---

## 6. expo doctor 통과 현황

로컬 `npx expo-doctor` 실행 결과 (2026-05-11 기준):

| 점검 항목                         | 결과  | 비고                                             |
| -------------------------------- | ----- | ------------------------------------------------ |
| Expo SDK 버전 일관성              | PASS  | SDK 53 — package.json, app.json 일치             |
| React / React Native 버전        | PASS  | React 19 / RN 0.79.6 SDK 53 정합                 |
| expo-location plugin 등록         | PASS  | app.json + app.config.js 양쪽 등록               |
| expo-font plugin 등록             | PASS  | Pretendard-*.otf 4 weight 등록                   |
| expo-image-picker plugin 등록     | PASS  | 권한 문자열 한국어 완비                           |
| newArchEnabled = true             | PASS  | React Native New Architecture 활성                |
| OTA 업데이트 설정                  | WARN  | EAS Project ID 미설정 (PLACEHOLDER) — 허용        |
| EAS Build CLI 버전                | SKIP  | CI 환경 EAS CLI 미설치 — eas.json 구문만 검증     |

WARN 1건 (EAS Project ID PLACEHOLDER) 은 Phase 11 EAS 계정 등록 전까지 유지 허용.
`continue-on-error: true` 로 CI fail 없음.

---

## 7. P1-4 영업 native 앱 구현 로드맵

Phase 11+1개월 후 구현 예정 화면 / API 연동 (현재 stub 상태):

| 화면                    | 파일                              | API                              | 상태         |
| ---------------------- | --------------------------------- | -------------------------------- | ------------ |
| 견적 목록               | SalesQuoteListScreen (신규 예정)   | partner-order-service            | 미구현       |
| 견적 작성               | SalesQuoteFormScreen (신규 예정)   | partner-order-service + product  | 미구현       |
| 거래처 검색             | PartnerSearchScreen (신규 예정)    | partner-service                  | 미구현       |
| 품목 검색               | ProductSearchScreen (신규 예정)    | product-service                  | 미구현       |
| 현장 사진 첨부          | SalesEstimatePhotoScreen          | slip-service (ESTIMATE type)     | stub (P2)    |
| 오프라인 작성 동기화     | 별도 구현 예정                     | -                                | 미구현       |

현재 `SalesEstimatePhotoScreen` 만 stub (P2 Phase 12 예정 안내 화면)으로 존재한다.

---

## 8. .gitignore 권고 사항

Phase 11 EAS 계정 등록 시 다음 파일을 `.gitignore` 에 추가할 것:

```
# EAS Build 비밀 (Phase 11 활성 시 추가)
clients/mobile-staff/google-play-service-account.json
clients/mobile-staff/.env.local
clients/mobile-staff/.env.preview
clients/mobile-staff/.env.production
```

현재는 `.env.example` 만 커밋 대상이며 실제 값이 없으므로 GitGuardian 검출 없음.

---

## 9. 관련 메모리 / 결정

| 키 | 내용 |
| --- | --- |
| project_phase11_aws.md | Phase 11 = Seoul ap-northeast-2, EC2 m5.xlarge, 단일 환경 production only |
| project_arologis_phase10.md | mobile-staff = RN Expo mobile-staff 패턴, 외부 vendor = 인성데이타 퀵프로그램 |
| feedback_gitguardian_false_positive.md | dev-only 비밀번호 = dashboard false positive mark. PLACEHOLDER 값으로 처리 |
| feedback_pr_ci_monitoring.md | PR 발행 직후 `gh pr checks --watch` 자동 시작 |

---

## 10. 이후 작업 (백로그)

1. Phase 11 AWS cutover 완료 후 `npx eas init` + projectId 교체 (P1-4 전제 조건).
2. P1-4 슬라이스 구현 시 `APP_VARIANT=sales` 분기 + `com.samhan.sales.*` 앱 ID 신규 등록.
3. EAS Update (OTA) 채널 `production` / `preview` 활성 (Phase 11+1개월).
4. GitHub Actions EAS Build 트리거 workflow 신규 (`eas build --non-interactive`).
5. `SalesEstimatePhotoScreen` stub 활성 — `uploadAttachmentAuthenticated()` + deeplink 연결.
