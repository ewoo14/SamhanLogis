# PR #993 / Issue #910 — 2차 적대검증(재수렴) 판정

- 검증 대상: `feat/910-client-version-policy`
- 검증 HEAD: `36c96926fe82788637e5f22222324692ffa7bb85`
- 검증 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 검증 방식: 5개 조사 축(표시/VITE 주입, updater, NSIS, 변경 16파일 전체, 전수목록·증거 무결성), 코드 수정 없음

## 최종 판정 — BLOCK

실 사용자 경로 결함이 재현되었고, 이 commit이 직접 바꾼 NSIS 표면의 라이브 실행도 끝나지 않았다.

| 머지 게이트 | 관측 | 판정 |
|---|---|---|
| ① 실 사용자 경로 재현 가능 결함 0 | 아래 결함 5건. 그중 Windows 설치 앱 `DisplayName` 내부 semver 노출은 양쪽 앱에서 확정적이다. | 불충족 |
| ② CI green(exact SHA) | `gh pr view 993`: head `36c96926...`, checks 49개, pending 0, non-success 0, merge state `CLEAN` | 충족 |
| ③ 라이브QA 실서버 실행 | 실제 renderer의 Samhan 인증 셸과 아로로지스 로그인 화면은 확인했다. 그러나 installer EXE 0개, 아로로지스 unpacked/installer 0개이며 설치·제거·레지스트리 표면은 실행 0회다. | 불충족 |

심볼릭 링크 권한 때문에 NSIS 설치 실행 파일을 만들지 못한 사실은 정직한 보고이지만, **게이트는 막는다**. 이번 fix의 핵심 출력은 설치/제거 마법사 브랜딩과 Windows 설치 앱 메타데이터다. CI도 `build:win`이나 NSIS compile을 실행하지 않으므로 실제 installer 실행을 대체하지 않는다.

## 1. 첫 번째 각도 — 보이던 것이 사라지거나 정상 경로가 막혔는가

### 인증 셸/VITE 주입

실제 Chromium renderer에서 공통 사이드바 표면 1개를 확인했다.

| 입력 | HTTP | 표시 | page error | 빈칸/`undefined`/`새 버전` |
|---|---:|---|---:|---:|
| `2026/07/31-1` | 200 | `2026/07/31-1 · 사내 전용` | 0 | 0 |
| 미주입 | 200 | `0.1.0-dev · 사내 전용` | 0 | 0 |
| 공백 | 200 | `0.1.0-dev · 사내 전용` | 0 | 0 |
| `1.20260731.1` | renderer 전 config exit 1 | artifact 없음 | 해당 없음 | 해당 없음 |

이상값은 `VITE_APP_VERSION는 YYYY/MM/DD-{번호} 형식이어야 합니다`로 artifact 생성 전에 거절됐다. `AppLayout` 추가 전에도 앱 루트 `AppVersionGate`가 같은 renderer resolver를 사용했으므로 신규 화면 사망 경로는 아니다. 근거는 `clients/desktop/src/renderer/components/AppLayout.tsx:45-49,1662`, `clients/desktop/src/renderer/components/common/AppVersionGate.tsx:21-23`, `clients/desktop/src/renderer/version/versionCheck.ts:25-31`, `scripts/app-build-version.cjs:18-35`다.

공유 사이드바 DOM은 1개이고 인증 하위 route 선언 167개(고유 path 166개)에서 반복된다. 167개를 별도 표면으로 부풀려 세지 않았다.

### fix가 직접 연 사용자 표면 수

변경된 코드가 여는 관측 지점을 코드 위치 기준으로 세면 **13개**다.

| 구분 | 수 | 근거 |
|---|---:|---|
| Samhan 인증 셸 사이드바 | 1 | `AppLayout.tsx:1662` |
| updater 사용자 문구 DOM | 5 | Samhan 4곳 `AppVersionGate.tsx:355,381,524,615`, 아로로지스 1곳 `AppVersionGate.tsx:108` |
| NSIS/Windows 생성 출력 | 6 | 앱당 설치 마법사 BrandingText, 제거 마법사 BrandingText, `DisplayVersion` = 3 × 2앱 |
| Codef 가져오기 실행 경로 | 1 | `CodefImportScopeForm.tsx:454-473` |

테스트·문서·PNG 자체는 runtime 사용자 표면 수에 넣지 않았다.

## 2. 재현 결함

### 결함 1 — Windows 설치 앱 이름에 내부 semver가 남는다

- 실 사용자 경로: 날짜형 버전으로 Samhan Public 또는 Arologis Desktop 설치 → Windows 설정 → 앱 → 설치된 앱(또는 제어판 → 프로그램 및 기능) → 앱 이름 확인.
- 재현 절차:
  1. wrapper 입력 `VITE_APP_VERSION=2026/07/31-1`을 helper에 적용하면 package version은 `1.20260731.1`이다.
  2. 두 `electron-builder.yml`에는 `uninstallDisplayName` override가 없다.
  3. electron-builder 기본값과 registry 기록을 계산한다.
- 관측된 잘못된 결과: 앱 2개/설치 목록 표면 2개에서 각각 `Samhan Public 1.20260731.1`, `Arologis Desktop 1.20260731.1`이다. 기대는 제품명만 또는 날짜형 표기다.
- 원인: electron-builder 기본값은 `${productName} ${version}`이다(`clients/desktop/node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js:446`). 이 값은 `DisplayName`에 기록된다(`clients/desktop/node_modules/app-builder-lib/templates/nsis/include/installer.nsh:119`). 신규 include는 `VERSION`만 재정의한다(`scripts/app-build-version.cjs:99-108`)고 `DisplayName`을 바꾸지 않는다. `DisplayVersion`만 `installer.nsh:125`에서 날짜형을 받는다.
- 결과: 한 행 안에서 앱 이름은 `1.20260731.1`, 버전 열은 `2026/07/31-1`로 불일치한다.

### 결함 2 — updater가 승인한 표기 변형이 `새 버전 새 버전`으로 보인다

- 실 사용자 경로: generic HTTPS update feed의 `latest.yml` → electron-updater가 최신 버전으로 승인 → `update-available` 또는 `update-downloaded` IPC → renderer 안내.
- 재현 절차:
  1. 현재 버전 `1.20260730.9`에서 실제 electron-updater 6.8.9의 비교 경로에 `v1.20260731.1` 또는 앞뒤 공백이 있는 ` 1.20260731.1 `을 넣는다.
  2. upstream `semver.parse`/`gt`는 두 값을 최신 버전으로 승인한다.
  3. 양쪽 main의 새 정규식은 불일치하여 IPC `version`을 `새 버전`으로 만든다.
  4. renderer가 다시 `새 버전 ${version}`을 조합한다.
- 관측된 잘못된 결과: 허용 변형 2/2가 날짜를 잃었다. Samhan에서 `새 버전 새 버전을 다운로드하는 중입니다.`, `새 버전 새 버전이 다운로드되었습니다.`, `새 버전 새 버전을 설치하고...`; 아로로지스에서도 `새 버전 새 버전...`이 표시된다. 영향 앱 2개, 사용자 문구 위치 5개다.
- 파일 근거: `clients/desktop/src/main/auto-update.ts:25,39-42,62-72`, `clients/arologis-desktop/src/main/auto-update.ts:19,33-36,53-63`, `clients/desktop/src/renderer/components/common/AppVersionGate.tsx:134-153,355,381,524,615`, `clients/arologis-desktop/src/renderer/components/common/AppVersionGate.tsx:32-44,108`.
- 범위 한정: wrapper가 정상 생성하는 exact 값 `1.20260731.1`은 `2026/07/31-1`로 정상 표시됐다. 운영 CDN의 현재 `latest.yml`이 변형 표기를 실제 게시 중인지는 이 라운드에서 보지 않았다. 다만 electron-updater가 이벤트를 발생시키는 실제 feed 호환 경로라 사용자 도달 가능 경로로 판정했다.

### 결함 3 — 전수목록 밖 Windows PE 속성에 내부 semver가 남는다

- 실 사용자 경로: 설치/portable/installer/uninstaller EXE → 파일 탐색기 → 속성 → 자세히 → `파일 버전`/`제품 버전`.
- 재현 절차:
  1. wrapper가 `--config.extraMetadata.version=1.20260731.1`을 전달한다(`scripts/build-desktop-release.cjs:87-95`, `scripts/build-arologis-desktop-release.cjs:76-84`).
  2. electron-builder `AppInfo`를 같은 값으로 실측한다.
  3. Windows resource 편집 인자를 확인한다.
- 관측된 잘못된 결과: `version=1.20260731.1`, `buildVersion=1.20260731.1`, `fileVersion=1.20260731.1`, `productVersion=1.20260731.1.0`. 앱 2개에 대해 설치 앱 EXE·portable·installer·uninstaller, 최대 8개 artifact 인스턴스가 같은 내부 값을 사용한다.
- 파일 근거: `clients/desktop/node_modules/app-builder-lib/out/appInfo.js:29-47,66-85`, `clients/desktop/node_modules/app-builder-lib/out/winPackager.js:121-140`, `clients/desktop/node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js:169-175,272,355-365`.
- 이 표면은 dev-report의 “`extraMetadata.version`은 updater 비교용 내부 메타데이터” 분류에서 빠졌다. 다만 권한 문제로 resource patch를 마친 최종 EXE는 이 라운드에서 생성·실행하지 못했다. 값은 builder가 최종 resource 편집에 넘기는 실제 계산 결과로 관측했다.

### 결함 4 — 모바일 3종의 OS/마켓 표시 버전이 package semver다

- 실 사용자 경로: iOS 앱 정보/App Store 또는 Android 앱 정보/Play Store에서 버전 확인.
- 재현 절차: production 설정에서 `EXPO_PUBLIC_APP_VERSION=2026/07/31-1`을 주입하고 세 `app.config.js`를 평가한다.
- 관측된 잘못된 결과:
  - Samhan 주문: 정책 표시 버전 `2026/07/31-1`, Expo `version=0.5.0`
  - 삼한공조 견적: 정책 표시 버전 `2026/07/31-1`, Expo `version=0.4.0`
  - 아로로지스 기사: 정책 표시 버전 `2026/07/31-1`, Expo `version=1.0.0`
- 영향: 앱 3개 × iOS/Android 플랫폼 인스턴스 2개 = 6개. 각 플랫폼의 OS 앱 정보와 스토어 표시는 같은 Expo `version` 메타데이터를 사용한다.
- 파일 근거: `clients/mobile/app.config.js:4-6,50-55`, `clients/mobile-staff/app.config.js:18-22,94-99`, `clients/arologis-mobile/app.config.js:4-6,44-49`와 각 `package.json:3`.
- 이 표면은 dev-report의 데스크톱 중심 표시 목록에 없었다. package version이 정책 API의 현재 버전 fallback으로 쓰이는 경로도 존재한다(`clients/mobile/src/version/versionCheck.ts:36-49` 및 동형 2파일).

### 결함 5 — Capacitor Android 앱 정보에 `1.0`이 노출된다

- 실 사용자 경로: Samhan Public Capacitor Android 앱 설치 → Android 설정 → 앱 → Samhan Public → 앱 정보의 버전 확인.
- 재현 절차: release/sync wrapper가 `clients/desktop/android/app/build.gradle`의 native metadata를 갱신하는지 전체 검색한 뒤 `defaultConfig`를 확인한다.
- 관측된 잘못된 결과: 정책/renderer 버전은 `2026/07/31-1`인데 Android `versionName`은 정확히 `1.0`, `versionCode`는 `1`이다. 영향 논리 표면 1개다.
- 파일 근거: `clients/desktop/android/app/build.gradle:6-11`. `scripts/`와 `clients/desktop/scripts/`에는 이 두 값을 release 버전으로 갱신하는 경로가 없다.

## 3. 변경 파일 11개 + 신규 5개가 연 전체 경로

`git show --numstat 36c96926f` 기준 16파일을 모두 확인했다.

| 파일 | 새 경로/영향 | 판정 |
|---|---|---|
| `clients/arologis-desktop/src/main/auto-update.test.ts` | runtime 없음; updater fallback 검증 | 증거에 반영 |
| `clients/arologis-desktop/src/main/auto-update.ts` | 아로로지스 available/downloaded IPC | 결함 2 |
| `clients/desktop/src/main/auto-update.test.ts` | runtime 없음; updater fallback 검증 | 증거에 반영 |
| `clients/desktop/src/main/auto-update.ts` | Samhan available/downloaded IPC | 결함 2 |
| `clients/desktop/src/main/packaging-invariants.test.ts` | runtime 없음; sidebar literal 불변식 | 증거에 반영 |
| `clients/desktop/src/renderer/components/AppLayout.tsx` | 인증 셸 공통 sidebar 1개, route 선언 167개에서 반복 | 정상/미주입/공백 정상 |
| `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.tsx` | 저장된 ALL scope 직후 가져오기 payload | 소스와 42개 선택 테스트 확인; 실서버 import는 미실행 |
| `scripts/app-build-version.cjs` | NSIS `VERSION` include 생성 | 결함 1·3의 경계 확인 |
| `scripts/app-build-version.test.cjs` | runtime 없음; helper/wrapper 계약 | 12/12 재현 |
| `scripts/build-arologis-desktop-release.cjs` | 임시 include → Arologis electron-builder | installer 미생성 |
| `scripts/build-desktop-release.cjs` | 임시 include → Samhan electron-builder | installer 미생성 |
| `docs/dev-reports/2026-07-31-910-r-display-surface-fix.md` | 구현자 주장/명령의 증거 입력 | 원문 대조 |
| `.../01-samhan-login-real.png` | 1440×900 renderer 캡처 | 이미지/renderer 대조 |
| `.../02-samhan-authenticated-sidebar-real.png` | 1440×962 인증 셸 캡처 | sidebar 날짜형 확인 |
| `.../03-samhan-sidebar-version-real.png` | 1440×962 사용자 메뉴 열린 인증 셸 | sidebar 날짜형 확인 |
| `.../04-arologis-login-real.png` | 1440×900 아로로지스 로그인 | renderer 대조 |

wrapper의 `process.exit` → `throw` 변경은 양쪽 최상위 catch와 `finally` cleanup으로 종료 코드 1과 임시 디렉터리 정리를 유지했다. 이 분기에서 별도 사용자 runtime 결함은 재현하지 못했다.

## 4. 전수목록 완전성

검증 요청에는 18개 자리라고 인용됐지만, dev-report의 실제 Markdown 데이터 행은 20개다. 그럼에도 다음 사용자 표면이 누락됐다.

누락은 **최소 12개 논리 자리**다. 같은 설정값이 여러 artifact/OS에 복제되는 경우 논리 자리는 묶어 세고 실제 인스턴스 수도 병기했다.

1. Windows 설치 앱 `DisplayName` 2개 — 결함 1.
2. Windows PE 파일/제품 버전 속성 6개 논리 자리(앱/portable 묶음·installer·uninstaller × 2앱), 실제 artifact 인스턴스는 최대 8개 — 결함 3.
3. 모바일 3종의 OS·마켓 버전 메타데이터 3개 논리 자리, iOS/Android 플랫폼 인스턴스는 6개 — 결함 4.
4. Samhan Public Capacitor Android 앱 정보 `versionName` 1개 — 결함 5.

업무 데이터의 optimistic-lock `version`, 문서 이력 번호, dependency lockfile의 `0.1.0`은 앱 버전 사용자 표면이 아니므로 제외했다.

## 5. 증거 무결성

### RED 원문 3개

parent `36c96926^`를 파일 변경 없이 메모리에서 실행/단정했다.

| 인용 | 재현 관측 |
|---|---|
| sidebar `v0.1.0` 불변식 | parent source `includes('v0.1.0')` actual `true`, expected `false` → `AssertionError` |
| NSIS helper 부재 | `TypeError: createNsisDisplayVersionInclude is not a function` |
| updater raw `1.0.0` | actual `"1.0.0"`, expected `"새 버전"` → `AssertionError` |

세 인용의 의미와 실제 parent 결과는 일치했다.

별도로 dev-report가 인용한 Codef CI RED도 실행 `30528769269`의 failed log와 대조했다. `expected type: "LOAN" / received type: "ALL"`, `1 failed | 186 passed (187)`, `1 failed | 1695 passed (1696)`가 일치했다.

### GREEN 숫자

- `node --test scripts/app-build-version.test.cjs`: 12 pass, 0 fail.
- exact HEAD `clients/desktop npm test -- --reporter=dot`: **186 files / 1678 tests**, exit 0. 같은 숫자를 fresh 2회 재현했다.
- CI의 일부 PR merge-ref job은 합성 기준으로 187 files / 1698 tests를 실행했지만, exact HEAD 로컬 숫자와 모순되지 않는다.

### PNG와 bundle

- PNG 4개는 각각 1440×900, 1440×962, 1440×962, 1440×900이며 서로 다른 SHA-256이다. PNG chunk도 `IHDR + 4096-byte IDAT 반복 + IEND`로, 저장소의 확정 System.Drawing mock이 가진 `sRGB/gAMA/pHYs + 단일 IDAT` 패턴과 다르다.
- 실제 renderer를 다시 띄워 HTTP 200, sidebar `2026/07/31-1 · 사내 전용`, page error 0을 Chromium에서 재현했다. 커밋 PNG의 레이아웃·글꼴·상태와 실제 renderer가 일치했고 합성 PNG 생성기나 mock 이미지 generator 경로는 저장소에서 발견되지 않았다.
- 다만 커밋 PNG 자체에는 생성 provenance metadata가 없으므로 “실 gateway 인증 세션을 주입했다”는 서버 세션 원문까지 픽셀만으로 독립 증명하지는 않았다. 이 제한은 아래 미검증 범위에 포함한다.
- 현재 Samhan renderer bundle JS 12개 검색: raw `v0.1.0` hit 0, `v0.1.0 · 사내 전용` hit 0, `2026/07/31-1` hit 2. 보고서의 bundle 주장은 재현됐다.

## 6. 이 라운드가 보지 않은 것

다음은 결함 0으로 세지 않았다.

- 실제 서명된 Samhan/Arologis installer·uninstaller UI, Windows registry `DisplayName`/`DisplayVersion`, 설치·제거 후 프로그램 목록.
- resource patch를 마친 최종 앱 EXE·portable EXE의 파일 속성. 현재 Samhan `win-unpacked` EXE 2개는 `ProductName=Electron`, `ProductVersion=33.4.11`, `FileVersion=33.4.11`인 중간 복사본이고 installer EXE는 0개다. 아로로지스 release 산출물은 0개다.
- 운영 HTTPS update feed/CDN의 현재 `latest.yml`, 실제 서명 installer 다운로드·설치·재기동.
- 모바일 production APK/IPA 설치 후 iOS/Android 앱 정보 및 실제 App Store/Play Store 상세 화면.
- Web/Capacitor 별도 산출물의 실제 기기 실행. Capacitor Android `versionName=1.0`은 Gradle 설정에서 관측했지만 기기 앱 정보 화면은 실행하지 않았다.
- Codef 가져오기 변경의 실서버 API/공유 DB 실행. 공유 DB write 금지 때문에 source와 테스트까지만 확인했다.
- 커밋 PNG를 만들 때 사용한 실 gateway 세션의 원본 네트워크 로그. 실제 renderer 형태는 재현했지만 같은 세션을 재사용하지 않았다.

## 결론

첫 번째 각도의 sidebar 정상/미주입/공백 경로 자체는 회귀가 없었다. 그러나 NSIS fix가 놓친 Windows `DisplayName`, updater 허용 표기 변형, Windows PE version resource, 모바일 OS/마켓 version, Capacitor Android `1.0` 표면이 사용자에게 내부/package 버전을 보이거나 문구를 망가뜨리는 경로로 남았다. 또한 이 commit이 직접 바꾼 NSIS 6개 표면은 installer 미생성으로 라이브QA가 0회다. 따라서 exact-SHA CI green과 무관하게 PR #993은 현재 **BLOCK**이다.
