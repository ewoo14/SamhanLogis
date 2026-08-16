# Expo 모바일 앱 설계 대비 구현 격차 정찰

```text
cwd   C:/dev/Samhan-Public   (main, 읽기 전용)
HEAD  00cdeff7ebd249def79a022210cb1153e163b62f
```

> 조사일: 2026-08-16 (Asia/Seoul)  
> 범위: 위 로컬 HEAD의 `clients/mobile-staff`와 직접 연결되는 백엔드 계약. 정찰 도중 외부 작업이 `main`을 `3688617f1047181e63df363252c13880d20087a6`에서 위 SHA로 이동시켰다. 두 SHA의 범위 diff를 재검사했으며 `clients/mobile-staff`와 조사 대상 controller/gateway route에는 변경이 없었다(변경은 서비스 자격·storage/test 설정). 안전 조건에 따라 이 정찰에서는 pull/checkout/EAS build/store submit/DB write를 하지 않았다.

## 요약

- Expo 코드베이스/EAS project는 1개이고, 설정상 설치 앱 identity는 `staff`와 `sales` 2개다. 그러나 runtime root는 variant를 분기하지 않아 실제 화면 동작은 둘 다 `staff` 견적 WebView와 같다.
- 정본의 감사 단위는 19개(영업 11, 사진 8)다. 사용자 도달 기준 분포는 **있음 0 / 일부 0 / 없음 19**다. “없음” 중 다수는 파일만 존재하는 orphan 구현이다.
- root에서 도달하지 못하는 screen component는 9개다. 이 중 정본 관련 5개, 정본 밖 후속 화면 4개다.
- 정본 밖 후속 기능군은 7개다. 기본 도달 2개(WebView, version/OTA), build-time 조건부 도달 1개(QR), 도달 불가 4개다.
- 지금 checkout은 typecheck/test/local export가 모두 `expo-camera` 미설치로 실패한다. lockfile에는 들어 있고 `npm ci --dry-run`은 추가 가능함을 확인했으므로, 이는 우선 현재 설치 상태의 blocker다.
- 기술적 blocker는 10개, 개발책임자 선택지는 4개다.

## 1. 앱 변형 지도

### 1.1 몇 개인가

| 층 | 수 | 실제 의미 |
|---|---:|---|
| Expo source/EAS slug | 1 | `clients/mobile-staff`, slug `samhan-estimate` (`app.config.js:97`) |
| `APP_VARIANT` identity | 2 | `staff`, `sales` (`app.config.js:31`, `app.config.js:72-89`) |
| 사용자에게 다른 화면을 제공하는 runtime | 1 | root가 variant를 읽지 않고 WebView만 반환한다 (`src/screens/AppRootNavigator.tsx:14-23`) |

즉, **패키지 식별자는 2개지만 앱 기능은 아직 1개**다. `sales`는 별도 source/app이 아니라 동일 bundle의 이름·bundle ID/package만 바꾸는 build-time identity다.

### 1.2 variant별 실제 분기

| variant/profile | 표시명 / identity | API·estimate 대상 | OTA | runtime 화면 |
|---|---|---|---|---|
| `staff` development | 삼한공조 견적 (Dev), `com.samhan.estimate.dev` | localhost 8080/5183 | 꺼짐 | 기본 WebView |
| `staff` preview | 삼한공조 견적 (Preview), `com.samhan.estimate.preview` | `api-stg` / `estimate-stg` | 켜짐 | 기본 WebView |
| `staff` production | 삼한공조 견적, `com.samhan.estimate` | 운영 API / estimate | 켜짐 | 기본 WebView |
| `sales` preview | 삼한공조 영업 (Preview), `com.samhan.sales.preview` | `staff` preview와 동일 staging | 켜짐 | **영업 native 탭이 아니라 기본 WebView** |

근거:

- app ID/name만 variant로 분기한다: `app.config.js:72-89`.
- API와 estimate URL은 variant가 아니라 `BUILD_ENV`로만 분기한다: `app.config.js:45-61`.
- `extra.appVariant`는 기록하지만 root가 소비하지 않는다: `app.config.js:111-115`, `src/screens/AppRootNavigator.tsx:14-23`.
- EAS profile은 `development`, `preview`, `production`, `p1-4-sales-preview` 네 개다: `eas.json:7-63`.

### 1.3 production profile 확인

개발책임자 지시문의 “development·preview뿐이며 production 없음”은 **이 HEAD에는 해당하지 않는다**. `staff` production build와 submit profile이 존재한다 (`eas.json:36-49`, `eas.json:65-75`).

다만 다음 두 가지가 다르다.

1. `sales`에는 preview profile만 있고 production profile이 없다 (`eas.json:51-62`). `app.config.js:13-14`, `app.config.js:70`의 “후속 분리 예정” 설명과 일치하므로, 이 HEAD에서는 아직 정식 출시 대상으로 완성하지 않은 흔적이다.
2. `staff` production submit은 iOS 식별값이 placeholder이고 Android service-account 파일도 checkout에 없다 (`eas.json:68-73`). 따라서 profile 존재와 실제 제출 가능은 별개다.

## 2. 판정 기준과 설계 항목별 상태

판정 단위는 정본이 명시한 영업 화면 4개, 공통 패턴 6개, navigation 1개, 사진 공통 UX 5개, 사진 scenario 3개다.

- **있음**: 정상 build/profile에서 사용자가 root부터 도달하고 명세 핵심 동작까지 수행 가능.
- **일부**: 사용자가 도달하지만 명세 일부만 동작.
- **없음**: root/tab/modal 경로가 없거나 화면 자체가 없음. source 파일이나 orphan navigator가 있어도 없음으로 센다.

이 기준은 정본의 native 탭 예정(`SALES-APP-DESIGN.md:705-720`)과 현재 root(`AppRootNavigator.tsx:14-23`)를 직접 대조한 것이다.

### 2.1 `SALES-APP-DESIGN.md` — 11개

| ID | 설계 항목 | 상태 | 사용자 도달 | 구현 증거와 격차 |
|---|---|---|---|---|
| S-01 | 영업 대시보드 `SalesDashboardScreen` | 없음 | 불가 | `SalesHomeScreen` source와 API 호출은 있다 (`SalesHomeScreen.tsx:35-58`). `SalesTabNavigator`에만 걸렸고(`SalesTabNavigator.tsx:64-72`), navigator 자체가 root에 없다. |
| S-02 | 4-step 견적 생성 | 없음 | 불가 | `QuotationCreateScreen`은 존재하지만 orphan이다. source도 `customer/lines/done` 3상태이며 (`QuotationCreateScreen.tsx:40`, `QuotationCreateScreen.tsx:154-185`), 설계의 4-step(`SALES-APP-DESIGN.md:281-416`)과 다르다. |
| S-03 | 3-step 거래처 주문 생성 | 없음 | 불가 | `PartnerOrderCreateScreen`은 orphan이고 source는 `customer/lines/done` 3상태다 (`PartnerOrderCreateScreen.tsx:46`, `PartnerOrderCreateScreen.tsx:164-192`). 설계의 창고 picker(`SALES-APP-DESIGN.md:487`)도 화면 source에 없다. |
| S-04 | 거래처 검색/필터/bottom sheet | 없음 | 불가 | 검색 source는 있다 (`CustomerSearchScreen.tsx:44-92`). 그러나 orphan이고, 구현은 query 결과 위주이며 설계의 필터 탭·독립 상세 흐름(`SALES-APP-DESIGN.md:597-673`)을 완결하지 않는다. |
| S-05 | `SalesTabNavigator` 4-tab 통합 | 없음 | 불가 | 5-tab source까지 있으나 (`SalesTabNavigator.tsx:54-129`) root import/분기가 없다. 설계가 예고한 `mode='sales'` (`SALES-APP-DESIGN.md:705-720`)도 없다. |
| S-06 | `FormField` | 없음 | 불가 | named component가 없고 orphan form 안의 `FormGroup`만 있다 (`QuotationCreateScreen.tsx:296-307`, `PartnerOrderCreateScreen.tsx:313-324`). |
| S-07 | `StepIndicator` | 없음 | 불가 | 설계는 공통 multi-step indicator를 요구한다 (`SALES-APP-DESIGN.md:93-106`). source는 조건부 화면 전환뿐이며 사용자 경로가 없다. |
| S-08 | `SectionHeader` | 없음 | 불가 | 설계 named pattern(`SALES-APP-DESIGN.md:108-120`) 대신 각 orphan 화면의 local header/form group만 있다. |
| S-09 | Primary/Secondary button pattern | 없음 | 불가 | local button style은 있으나 (`QuotationCreateScreen.tsx:261-268`, `PartnerOrderCreateScreen.tsx:278-285`) 공통 component가 아니고 화면이 orphan이다. |
| S-10 | `StatusBadge` | 없음 | 불가 | 설계 named component(`SALES-APP-DESIGN.md:133-144`)가 사용자 경로에 없다. dashboard의 metric card는 다른 구조다 (`SalesHomeScreen.tsx:161-179`). |
| S-11 | `SearchInputBar` | 없음 | 불가 | 거래처 검색의 local input은 있으나 (`CustomerSearchScreen.tsx:105-146`) 공통 component가 아니고 화면이 orphan이다. |

영업 소계: **있음 0 / 일부 0 / 없음 11**.

### 2.2 `PHOTO-ATTACHMENT-DESIGN.md` — 8개

| ID | 설계 항목 | 상태 | 사용자 도달 | 구현 증거와 격차 |
|---|---|---|---|---|
| P-01 | 카메라/갤러리 Bottom Sheet | 없음 | 불가 | orphan `PhotoAttachmentCapture`는 modal/sheet가 아니라 세 버튼을 inline 렌더한다 (`PhotoAttachmentCapture.tsx:303-345`). 설계는 tap 후 sheet를 요구한다 (`PHOTO-ATTACHMENT-DESIGN.md:24-28`). |
| P-02 | 권한 거부 인라인 카드 + 설정 열기 | 없음 | 불가 | source는 권한 요청 후 `Alert`만 띄운다 (`PhotoAttachmentCapture.tsx:116-166`). 설계의 sheet 내부 카드와 `Linking.openSettings()`(`PHOTO-ATTACHMENT-DESIGN.md:88-105`)가 아니다. |
| P-03 | 썸네일 3열 grid + 삭제 | 없음 | 불가 | orphan source는 horizontal `ScrollView` preview와 삭제를 제공한다 (`PhotoAttachmentCapture.tsx:351-394`). 3열 grid가 아니며 사용자 경로도 없다. |
| P-04 | 실제 업로드 진행률 + 이탈 차단 | 없음 | 불가 | source는 퍼센트 bar 대신 “업로드 중” badge만 표시한다 (`PhotoAttachmentCapture.tsx:363-370`). 이탈 취소/계속 dialog 경로가 없다. 설계 근거는 `PHOTO-ATTACHMENT-DESIGN.md:142-183`. |
| P-05 | 자동 압축/크기 가드 | 없음 | 불가 | 1920×1080/JPEG 0.8 압축 코드는 있다 (`PhotoAttachmentCapture.tsx:168-194`)지만 이를 쓰는 유일한 화면이 root에서 끊겼다. 압축 실패 사용자 안내도 없이 원본 fallback한다. |
| P-06 | 검수 사진 + 서명 scenario | 없음 | 불가 | 설계의 `DriverSignatureScreen` 접근(`PHOTO-ATTACHMENT-DESIGN.md:200-277`)은 이 앱에 없다. D-AX-19 이후 기사 runtime은 `clients/arologis-mobile`로 이동했다 (`App.tsx:1-8`). |
| P-07 | 배송 완료 사진 + GPS scenario | 없음 | 불가 | 설계의 dashboard 정차 카드 경로(`PHOTO-ATTACHMENT-DESIGN.md:289-357`)와 화면이 이 앱에 없다. 현 백엔드는 다른 arologis 사진 계약을 제공한다 (`ArologisDriverAppController.java:343`). |
| P-08 | 영업 현장 사진 native modal + WebView bridge | 없음 | 불가 | `SalesEstimatePhotoScreen`은 명시적 Phase 12 placeholder이며 (`SalesEstimatePhotoScreen.tsx:2-30`, `SalesEstimatePhotoScreen.tsx:44-67`) root import와 `OPEN_PHOTO_MODAL`/`PHOTO_ATTACHED` bridge가 없다. |

사진 소계: **있음 0 / 일부 0 / 없음 8**.

전체: **19개 = 있음 0 / 일부 0 / 없음 19**.

### 2.3 도달 불가 화면 수

root가 import하는 화면은 기본 `EstimateWebViewScreen`과 조건부 `QrScanScreen`뿐이다 (`AppRootNavigator.tsx:10-23`). 다음 screen component 9개는 production source graph에서 root 도달 경로가 없다.

1. `SalesEstimatePhotoScreen` (`SalesEstimatePhotoScreen.tsx:44`)
2. `SlipDetailScreen` (`SlipDetailScreen.tsx:107`)
3. `SlipEditRequestsScreen` (`SlipEditRequestsScreen.tsx:73`)
4. `DispatchBoardScreen` (`dispatch-board/DispatchBoardScreen.tsx:90`)
5. `SalesHomeScreen` (`sales/SalesHomeScreen.tsx:35`)
6. `QuotationCreateScreen` (`sales/QuotationCreateScreen.tsx:64`)
7. `PartnerOrderCreateScreen` (`sales/PartnerOrderCreateScreen.tsx:70`)
8. `CustomerSearchScreen` (`sales/CustomerSearchScreen.tsx:44`)
9. `VisitPhotoScreen` (`sales/VisitPhotoScreen.tsx:71`)

`SalesTabNavigator`도 root에서 끊겼지만 screen 수에는 navigator container를 중복 산입하지 않았다.

## 3. 설계 밖에서 추가된 것 — 7개 기능군

| 기능군 | 사용자 도달 | 근거 / 현재 상태 |
|---|---|---|
| 견적 WebView 단일 runtime | 기본 도달 | 실제 root 기본 화면 (`AppRootNavigator.tsx:18-23`), remote estimate URL을 연다 (`EstimateWebViewScreen.tsx:57-62`, `EstimateWebViewScreen.tsx:113-132`). 두 정본의 native 화면과는 별도 전략이다. |
| QR 스캔 입출고 (#1210) | build-time 조건부 | `EXPO_PUBLIC_WAREHOUSE_SCAN=1`이면 root에서 직접 도달 (`AppRootNavigator.tsx:15-17`). API POST도 구현 (`QrScanScreen.tsx:43-55`), 백엔드 endpoint도 존재 (`StockInstanceController.java:385-397`). 단 어떤 EAS profile도 이 변수를 설정하지 않는다. |
| version policy + EAS OTA (#1217) | 기본 도달 | App 전체를 gate로 감싼다 (`App.tsx:41-43`). boot에서 version/OTA를 확인 (`MobileVersionGate.tsx:42-80`), OTA coordinator도 있다 (`otaUpdates.ts:35-68`). |
| 거래처 방문 사진 | 도달 불가 | `VisitPhotoScreen`과 순차 업로드 source가 있다 (`VisitPhotoScreen.tsx:91-145`, `VisitPhotoScreen.tsx:205-251`)지만 orphan tab 안에 있고 거래처 context도 stub이다 (`SalesTabNavigator.tsx:39-51`). |
| 전표 상세·실시간 협업/audit | 도달 불가 | `SlipDetailScreen`, `AuditOverlay`, realtime client가 있으나 root route가 없다 (`SlipDetailScreen.tsx:107`, `AuditOverlay.tsx:1-4`). |
| 전표 수정 요청 관리 | 도달 불가 | `SlipEditRequestsScreen` source는 있으나 root route가 없다 (`SlipEditRequestsScreen.tsx:73`). |
| Samhan Public 배차 보드 | 도달 불가 | `DispatchBoardScreen` source는 있으나 root route가 없다 (`DispatchBoardScreen.tsx:90`). |

git 이력상 QR은 `75e9d0d33` (#1210), 자동 업데이트는 `856b28d6c` (#1217)에서 유입됐다. 둘 다 현재 조사 HEAD의 ancestor다.

## 4. 지금 실제로 쓸 수 있는 상태인가

### 4.1 build / 정적 검증

| 검사 | 결과 | 판정 |
|---|---|---|
| `npm run typecheck` | 실패: `QrScanScreen.tsx:3`의 `expo-camera` module/type 미해결 | 현재 checkout 설치 상태로 typecheck 불가 |
| `npm test -- --runInBand` | 5 suite 중 4 pass, 1 fail; 실행된 test 14/14 pass. root suite가 동일 module 미해결로 load 실패 | 전체 test green 아님 |
| local `expo export --platform web` | Metro 365 modules에서 동일 `expo-camera` 미해결로 실패 | JS bundle 생성 불가 |
| `npm ci --dry-run --ignore-scripts` | `expo-camera` 1 package 추가 예정, exit 0 | lockfile에는 dependency가 있어 clean install로 복구 가능성이 높음 |
| `npm run doctor` | `expo-doctor` command not found | package script는 있으나 실행 dependency가 없어 품질 gate 자체가 작동하지 않음 (`package.json:14`) |

`expo-camera`는 manifest와 lockfile에는 선언돼 있다 (`package.json:23`, `package-lock.json:4962`). 따라서 “repository가 영구적으로 빌드 불가”까지는 증명되지 않았고, **현재 설치 상태에서는 빌드 불가**가 정확한 결론이다. EAS build는 실행하지 않았다.

### 4.2 로그인

- `staff`에는 RN native login이 없다. 인증은 WebView 안 legacy `checkUserAuth`와 cookie/sessionStorage에 위임된다 (`EstimateWebViewScreen.tsx:9-12`, `legacyEstimateShim.ts:65-101`).
- source상 로그인 흐름은 존재하지만, 이번 정찰은 자격을 쓰지 않았고 HTTPS 검증도 실패했으므로 end-to-end 로그인 성공은 확인되지 않았다.
- `sales` native source는 모든 API에 JWT `token` prop을 요구한다 (`SalesTabNavigator.tsx:32-34`, `sales.ts:169-177`). 그러나 root가 navigator를 열지도, token을 공급하는 auth flow를 갖지도 않는다. 따라서 native sales 로그인은 **불가**다.

### 4.3 백엔드 연결

1. production/staging의 configured estimate/API 네 URL 모두 이 PC의 정상 TLS 검증에서 `SEC_E_WRONG_PRINCIPAL`로 실패했다. 정찰용으로 인증서 검증을 끈 GET에서는 estimate 두 곳이 200, `/app/version` 두 곳이 404였다. 실제 Expo/WebView는 인증서를 우회하지 않으므로 연결 성공으로 볼 수 없다.
2. version endpoint는 repo에는 gateway route와 controller가 있다 (`api-gateway/application.yml:531`, `AppReleaseController.java:51`). 배포 응답 404는 배포 drift 또는 ingress/routing 불일치다. gate는 조회 실패 시 경고 후 app을 열어 주는 fail-open이다 (`MobileVersionGate.tsx:75-80`).
3. native sales client의 네 경로는 `sales.ts:174`, `sales.ts:198`, `sales.ts:222`, `sales.ts:253`이다. 실제 backend는 dashboard/quotation/order를 `/mobile/sales/**`로 제공한다 (`MobileSalesController.java:44-54`, `MobileSalesController.java:79-116`, `MobileSalesController.java:137-144`). 경로가 일치하지 않는다.
4. backend 주석이 말하는 `/mobile/sales/customer-quick-search` controller는 source tree에서 찾지 못했다 (`MobileSalesController.java:50-51`). client의 `/api/v1/partners/quick-search`도 구현 controller가 없다.

결론:

- **기본 staff**: source상 WebView shell은 있으나 현재 local build와 HTTPS가 막혀 실사용 가능을 입증하지 못했다.
- **sales native**: package identity만 있고 root/auth/API 계약이 끊겨 실사용 불가다.
- **QR**: 화면·backend source는 있으나 EAS profile에서 켜지지 않고 현재 build도 실패한다.
- **OTA**: client source와 EAS channel은 있으나 TLS/version route/store 자격 상태 때문에 실제 update lifecycle은 완결되지 않았다.

## 5. 기술적 blocker — 10개

| # | blocker | 막히는 것 | 근거 |
|---:|---|---|---|
| B-01 | 현재 `node_modules`에 `expo-camera` 없음 | typecheck/test/export | manifest는 `package.json:23`, import는 `QrScanScreen.tsx:3`; `npm ls`는 empty |
| B-02 | root가 `APP_VARIANT`를 소비하지 않음 | `sales` 화면 전체 | `app.config.js:31`, `AppRootNavigator.tsx:14-23` |
| B-03 | native sales auth/token 공급 경로 없음 | 대시보드·검색·견적·주문 401 이전 단계 | `SalesTabNavigator.tsx:32-34`, `AppRootNavigator.tsx:14-23` |
| B-04 | sales client와 backend endpoint path 불일치 | 대시보드·견적·주문 호출 | `sales.ts:174-259` 대 `MobileSalesController.java:44-54` |
| B-05 | 거래처 quick-search backend controller 부재 | 견적/주문의 첫 거래처 선택 | `sales.ts:198`, `MobileSalesController.java:50-51` |
| B-06 | 사진 설계의 기사 scenario가 분리 전 앱 경계를 전제 | 검수·배송 사진을 이 앱에서 구현/검증 | `PHOTO-ATTACHMENT-DESIGN.md:200-365`, `App.tsx:1-8` |
| B-07 | 영업 사진 화면은 placeholder이고 WebView bridge 없음 | scenario 3 | `SalesEstimatePhotoScreen.tsx:2-30`, `EstimateWebViewScreen.tsx:83-95` |
| B-08 | configured HTTPS 네 host의 TLS hostname 검증 실패 | preview/production WebView와 API | `app.config.js:47-60`; 2026-08-16 read-only curl 실측 |
| B-09 | 배포 `/app/version`이 prod/staging 모두 404 | version policy/OTA 운영 확인 | repo route `application.yml:531`, client call `versionCheck.ts:68-75`; read-only GET 실측 |
| B-10 | 배포 자격/프로필 미완결 | store submit 및 sales 정식 배포 | iOS placeholder·Android key path `eas.json:65-73`, 파일 부재; sales production profile 부재 `eas.json:51-62` |

별도 검증 결함: `npm run doctor`는 clean manifest만으로 실행될 수 없는 스크립트다. 이것은 현재 product runtime blocker 수에는 중복 산입하지 않았다.

## 6. 개발책임자 선택지 — 권고 없음, 대가만 표시

| 선택지 | 포함 범위 | 대가 |
|---|---|---|
| A. 두 정본의 격차 19개를 모두 메운다 | sales root/auth/API 4화면·공통 component·사진 3 scenario·EAS 실기기 QA | 가장 큰 개발/QA 범위. 분리된 `arologis-mobile` 경계와 2026-05-11 사진 정본을 먼저 재합의해야 하며 backend·mobile 두 저장 영역을 함께 바꿔야 한다. |
| B. native sales의 한 업무만 끝낸다 | 예: 거래처 검색 → 견적 생성 한 흐름만 root/auth/API까지 연결 | 첫 실사용은 빨라지지만 대시보드·주문·사진은 계속 없음으로 남고, 임시 navigation/auth가 후속 통합 때 재작업될 수 있다. |
| C. 실기기 배포 통로를 먼저 뚫는다 | dependency clean install, TLS/ingress, EAS owner/project, signing, preview device install | 사용자 기능 격차 19개는 그대로다. Apple/Google 계정·서명·스토어 운영과 staging 인프라 작업이 선행 비용이 된다. |
| D. staff WebView를 정식 전략으로 고정하고 native sales 정본을 폐기/대체한다 | 현재 WebView login/RPC와 OTA·TLS만 완결, orphan native source 정리 여부 결정 | native 4화면·사진 UX 설계 투입분을 포기하고 WebView UX/가용성에 계속 의존한다. 기존 문서·테스트·후속 source의 대규모 정합성 정리가 필요하다. |

## 7. 보고 수치

```text
앱 변형                         2 (staff / sales; source/EAS project는 1)
설계 항목                       19
  있음 / 일부 / 없음            0 / 0 / 19
사용자 도달 불가 screen component 9
설계 밖 후속 기능군              7
blocker                         10
개발책임자 선택지                4
산출물                           docs/dev-reports/2026-08-16-expo-design-implementation-gap.md
```
