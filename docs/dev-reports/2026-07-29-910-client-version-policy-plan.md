# #910 전 사용자 대면 클라이언트 버전 정책 확대 — 정찰·기획 (조기 PR)

- 작성일: 2026-07-29 (집PC 세션)
- 브랜치: `feat/910-client-version-policy`
- 선행: **#935 / PR #981** 아로로지스 데스크톱 버전 확인·자동 업데이트 (머지 완료)

## 1. 이 트랙이 답해야 할 것

#935 가 아로로지스 데스크톱 **한 앱**에 대해 버전 확인·자동 업데이트를 세웠다. 이 트랙은 그것을
**전 사용자 대면 클라이언트로 확대**한다. 확대 대상이 실제로 몇 개이고 각각 무엇이 다른지가
아직 문서로 확정돼 있지 않다 — **정찰이 선행**이다.

## 2. 정찰 질문 (구현 전에 답한다)

1. **사용자 대면 클라이언트가 실제로 몇 개인가.** 이슈 제목은 "8앱" 이라고 하지만
   저장소에서 배포 산출물을 만드는 클라이언트를 **전수로** 세어 근거와 함께 확정한다.
2. #935 가 만든 **버전 확인·자동 업데이트 구조가 무엇인가** — 피드 위치, 코드서명 전제,
   업데이트 확인 시점, 실패 시 거동. **재사용 가능한 부분과 앱마다 달라야 하는 부분**을 가른다.
3. **웹 앱(주문서·종합견적서)은 자동 업데이트 대상이 아니다.** 대신 *"사용 중 새 버전 알림"* 이
   필요한지, 필요하다면 어떤 신호로 판정하는지.
4. **모바일(Expo/RN)** 은 스토어 배포라 자동 업데이트 계약이 다르다. 이 트랙 범위인지 가른다.
5. 코드서명·피드가 **선행 조건**으로 이슈에 적혀 있다. 지금 무엇이 갖춰져 있고 무엇이 없는가.
   **없는 것이 있으면 그것이 이 트랙의 첫 슬라이스**다.

### 2.1 정찰 결과 — 제품 식별자는 8개, 산출물 변형은 그보다 많음

이슈의 “8앱”은 결과적으로 맞지만, 숫자만 세면 오해가 생긴다. `clients/desktop`은 Electron 설치본·웹/PWA·Capacitor를 만들지만 버전 정책 코드가 이들을 하나의 `DESKTOP` 제품으로 명시한다.

> `clients/desktop/src/renderer/version/versionCheck.ts:46-49`
>
> `// Electron·Capacitor·웹은 모두 clients/desktop의 같은 백오피스 앱 산출물이다.`  
> `if (flags.electron || flags.capacitor) return 'DESKTOP';`  
> `return 'DESKTOP';`

따라서 아래 표는 물리적 파일/타깃 수가 아니라 독립적으로 버전 정책을 받아야 하는 **사용자 대면 제품 identity** 기준이다. 실제 빌드를 실행하지 않았으므로 “현재 저장소에서 확인 가능한 배포 경로”를 적었고, 실제 업로드 완료 여부는 별도 확인하지 못했다.

| 제품 identity | 경로 | 배포 산출물·빌드 스크립트 | 현재 버전 표기 방식 |
|---|---|---|---|
| `DESKTOP` | `clients/desktop` | Electron Windows: `npm run build:win` → `scripts/build-desktop-release.cjs`; 웹/PWA: `npm run build:web:release` → `dist/web`; Capacitor: `npm run cap:sync:release` → `dist/capacitor` (`clients/desktop/package.json:11-19,21`, `vite.web.config.ts:79-84`, `vite.capacitor.config.ts:54-59`) | package metadata는 `0.1.0`; release renderer에는 `VITE_APP_VERSION`의 `YYYY/MM/DD-N`을 주입한다. 세 타깃은 `DESKTOP`으로 같은 정책 identity를 사용한다. |
| `AROLOGIS_DESKTOP` | `clients/arologis-desktop` | Electron Windows: `npm run build:win` → `scripts/build-arologis-desktop-release.cjs`; builder가 NSIS·portable 두 타깃을 정의한다 (`package.json:9-13`, `electron-builder.yml:23-30`) | package metadata는 `1.0.0`; `electron.vite.config.ts:20-24,53-58`에서 `VITE_APP_VERSION`을 renderer에 주입하며 release 값은 `YYYY/MM/DD-N`이어야 한다. |
| `SAMHAN_MOBILE` | `clients/mobile` | Expo/RN: `npm run android`, `npm run ios`; EAS production store build는 `eas.json`의 `distribution: store`, Android `app-bundle`; 웹 export 경로도 `npm run export:web`로 존재한다 (`package.json:8-17`) | package metadata `0.5.0`; `app.config.js`의 `version`은 package version이고, `extra.appVersion`은 `EXPO_PUBLIC_APP_VERSION` 우선이다. `versionCheck.ts:36-49`가 이 값을 정책 비교에 사용한다. |
| `SAMHAN_MOBILE_STAFF` | `clients/mobile-staff` | Expo/RN: `npm run android`, `npm run ios`; EAS production store build, 웹 export 스크립트도 존재 (`package.json:8-15`, `eas.json`) | package metadata `0.4.0`; `app.config.js`의 `extra.appVersion`/`runtimeVersion.policy: appVersion`과 `versionCheck.ts`의 `SAMHAN_MOBILE_STAFF`를 사용한다. preview profile은 별도 제품으로 세지 않았다. |
| `AROLOGIS_MOBILE` | `clients/arologis-mobile` | Expo/RN: `npm run android`, `npm run ios`, `npm run prebuild`; EAS production store build (`package.json:8-15`, `eas.json`) | package metadata `1.0.0`; `app.config.js`의 `extra.appVersion`, `runtimeVersion.policy: appVersion`, Android `versionCode`/iOS `buildNumber`를 함께 사용한다. |
| `SAMHAN_ORDER_WEB` | `clients/web/order-app` | Vite web/PWA: `npm run build` → `dist` (`package.json:8-14`) | package metadata `0.4.0`; `vite.config.ts:23-31,88-90`이 `VITE_APP_VERSION`을 주입하고, `src/main.ts:27-36`이 그 값을 `/app/version` 비교의 `currentVersion`으로 넘긴다. |
| `SAMHAN_ESTIMATE_WEB` | `clients/web/estimate-app` | Node/Express/EJS 서버: `npm run start` → `node server.js`; `npm run build`는 typecheck만 수행 (`package.json:12-17`). 따라서 Vite 정적 `dist`가 아니라 서버·EJS·`public`이 배포 경로다 (`routes/index.js:13-26`). | package metadata `2.0.0`과 별개로 서버가 `resolveBuildAppVersion()`으로 `VITE_APP_VERSION`을 읽어 EJS의 `window.__SAMHAN_VERSION_GATE_CONFIG__`에 주입한다 (`views/index.ejs:19635-19642`). |
| `SAMHAN_MOBILE_PUBLIC_WEB` | `clients/web/mobile-public` | Vite web: `npm run build` → `dist` (`package.json:8-12`) | package metadata `0.1.0`; `src/main.tsx`가 Vite의 `VITE_APP_VERSION`을 `WebVersionGate`에 전달한다. |

`clients/web/design-system`은 `dist`·Storybook을 만들지만 `main: ./dist/index.js`인 공유 라이브러리이므로 사용자 대면 클라이언트에서 제외했다. `clients/web/legacy-quantity-golden`도 배포 package/build 경로를 확인하지 못했다. Expo의 `export:web`은 각 모바일 제품의 부수 산출물 경로이지 별도 정책 identity로 세지 않았다. 반대로 `clients/desktop`의 Electron·PWA·Capacitor와 각 Electron의 NSIS·portable은 **산출물 변형**이지 위 표의 추가 제품 identity가 아니다. 이 기준으로 8개이며, 물리적 설치/웹/모바일 파일의 정확한 개수는 빌드를 실행하지 않아 확정하지 않았다.

### 2.2 #935 / PR #981 구조 — 정책 확인과 Electron 설치본 업데이트는 분리됨

로컬 handoff는 `docs/handoff/CURRENT-WORK.md:170`에서 “`#981 (#935 아로로지스 버전)`”의 머지를 기록하고, `:205`에서 설치본 검증이 남았다고 기록한다. PR diff 자체는 이번 정찰에서 git/GitHub로 조회하지 않았으므로, 아래는 머지된 현재 구현과 `docs/dev-reports/2026-07-29-928-version-check-s2.md`에 기록된 변경 목록을 대조한 결과다.

**피드 위치.** 아로로지스 설치본은 백엔드 `/app/version` 응답과 Electron binary feed를 별도로 사용한다.

> `clients/arologis-desktop/electron-builder.yml:46-51`
>
> `publish:`  
> `  provider: generic`  
> `  url: ${env.AROLOGIS_UPDATE_URL}`  
> `  channel: latest`

즉 `/app/version`은 `clientType=AROLOGIS_DESKTOP&currentVersion=...`으로 force level과 최신 정책을 판단하고, `electron-updater`는 `AROLOGIS_UPDATE_URL`의 HTTPS 정적 feed에서 `latest.yml`·설치 파일·blockmap을 찾는 구조다. 실제 URL, 업로드된 `latest.yml`/installer/blockmap은 저장소에서 확인하지 못했다.

**확인 시점.** main process는 `app.whenReady()`에서 IPC를 등록한다.

> `clients/arologis-desktop/src/main/index.ts:110-116`
>
> `app.whenReady().then(() => {`  
> `  registerAutoUpdateIpcHandlers();`  
> `  ...`  
> `  createMainWindow();`  
> `});`

renderer는 인증 bootstrap 뒤 `bootstrapped`가 되면 `AppVersionGate`에서 정책 API를 한 번 호출하고, 동시에 updater status를 구독한 뒤 `checkForUpdate()`를 호출한다 (`clients/arologis-desktop/src/renderer/App.tsx:29-42`, `components/common/AppVersionGate.tsx:67-98`). 확인은 packaged 앱에서만 허용된다.

**업데이트 동작과 실패 시 거동.** `clients/arologis-desktop/src/main/auto-update.ts:36-42`는 다음을 설정한다.

> `autoUpdater.autoDownload = false;`  
> `autoUpdater.autoInstallOnAppQuit = false;`  
> `autoUpdater.allowDowngrade = false;`

`update-available`이면 `downloadUpdate()`를 자동 호출하고, `update-downloaded` 뒤에는 renderer가 설치/재시작을 사용자 동작으로 위임한다 (`auto-update.ts:44-60`, preload `:50-62`). updater 오류는 상세 내용을 숨긴 한국어 상태로 broadcast하고 retry/종료 UI를 제공한다. `/app/version`이 timeout·non-OK·fetch 예외이면 `versionCheck.ts:43-64`가 `null`을 반환해 일반 부팅은 계속된다. 단 서버가 `CRITICAL`을 명시한 경우에는 `AppVersionGate.tsx:114-126`의 차단 modal이 열리며 retry 또는 앱 종료를 요구하므로, “모든 실패는 무시”라고 요약하면 안 된다.

**코드서명 전제.** builder에는 전제만 있다.

> `clients/arologis-desktop/electron-builder.yml:8-9`
>
> `artifactName: ${productName}-${env.SAMHAN_RELEASE_ARTIFACT_VERSION}-${arch}.${ext}`  
> `forceCodeSigning: true`

release wrapper도 `AROLOGIS_UPDATE_URL`과 명시적 `VITE_APP_VERSION`을 요구한다 (`scripts/build-arologis-desktop-release.cjs:38-50`). 그러나 인증서와 `CSC_LINK`/`CSC_KEY_PASSWORD` 같은 CI secret의 실제 연결, 서명된 설치본, clean machine의 `available → downloading → downloaded → quitAndInstall`은 확인하지 못했다. 기존 `docs/dev-reports/2026-07-23-desktop-auto-update.md`도 “publisherName만으로는 서명되지 않으며 인증서/CI secret과 실제 feed 업로드·설치 검증이 필요하다”고 기록한다.

**재사용/앱별 분리.** 재사용 가능한 것은 (a) `/app/version`의 `clientType/currentVersion` 계약과 `NONE/MINOR/MAJOR/CRITICAL` 정책, (b) `scripts/app-build-version.cjs`의 `YYYY/MM/DD-N` 검증과 release sentinel 방지, (c) Electron main–preload–renderer 간 updater status IPC, (d) generic HTTPS feed와 `forceCodeSigning`을 포함한 release 검증 골격이다. 앱마다 달라야 하는 것은 client type, API base URL, feed env/경로, Electron appId·productName·artifact 이름, 브랜딩과 인증 bootstrap 완료 시점, 그리고 설치본이 아닌 스토어/웹 배포 방식이다.

### 2.3 웹 판정 — `VITE_APP_VERSION`은 “현재 빌드”, 최신 여부는 `/app/version`

웹에는 설치 파일을 내려받아 재시작하는 Electron updater를 적용하지 않는다. 판정 신호는 런타임에 백엔드 `/app/version`을 호출해 `currentVersion`과 서버의 최신/최소 지원 버전 및 force level을 비교하는 것이다.

| 웹 앱 | `VITE_APP_VERSION`의 런타임 사용 | 사용자 알림 동작 |
|---|---|---|
| 주문서 | Vite build 시 `import.meta.env.VITE_APP_VERSION`으로 bundle에 들어가고, `src/main.ts:27-36`이 `SAMHAN_ORDER_WEB`의 `currentVersion`으로 전달된다. `src/version/versionCheck.ts:33-74`가 `/app/version?...`을 호출한다. | `src/version/versionGate.ts:60-72`가 업데이트 notice를 렌더링하며, 주석대로 자동 reload는 하지 않는다. reload 버튼은 draft guard와 확인을 거친 뒤에만 실행한다 (`:109-133`). PWA `registerType: 'autoUpdate'`는 service worker asset 갱신이고 버전 정책 판정 자체가 아니다 (`vite.config.ts:35-37`). |
| 종합견적서 | Vite 브라우저 변수로 직접 읽는 앱이 아니다. `routes/index.js:13-26`이 서버의 `resolveBuildAppVersion()` 결과를 EJS에 넘기고, `views/index.ejs:19635-19642`가 `currentVersion`으로 주입한다. 브라우저 `public/version-gate.js:7-10`이 그 값을 `/app/version?...`에 사용한다. | `public/version-gate.js:74-110`이 notice를 표시하고 확인 뒤 reload한다. `:113-124`의 원문은 “버전 확인 실패는 견적서 사용을 막지 않는다”이다. `package.json`의 `2.0.0`은 package metadata이며, 실제 release currentVersion은 `VITE_APP_VERSION` 주입값이다. |

핵심 원문은 다음과 같다.

> `clients/web/order-app/src/main.ts:27-36`  
> `const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.0-dev'`  
> `void mountOrderVersionGate({`  
> `  currentVersion: CURRENT_VERSION,`
>
> `clients/web/estimate-app/routes/index.js:13-17`  
> `const currentAppVersion = resolveBuildAppVersion()`
>
> `clients/web/estimate-app/views/index.ejs:19635-19642`  
> `window.__SAMHAN_VERSION_GATE_CONFIG__ = <%- JSON.stringify({`  
> `  clientType: 'SAMHAN_ESTIMATE_WEB',`  
> `  currentVersion: currentAppVersion,`

따라서 `VITE_APP_VERSION` 자체를 최신 버전으로 간주하면 안 된다. 그것은 현재 배포물이 어떤 버전인지 나타내는 값이고, 최신 여부는 서버 `/app/version` 응답으로 판정한다. 서버 응답 실패는 현재 구현상 fail-open이다. 이 신호는 웹 3개(`order-app`, `estimate-app`, `mobile-public`)에 재사용할 수 있지만, 자동 설치/강제 reload는 채택하지 않는다.

### 2.4 모바일 판정 — 정책 범위에는 포함하되, Electron feed 범위에는 포함하지 않음

모바일 세 앱은 소스상 Expo/EAS 스토어 배포 계약이다.

> `clients/mobile/eas.json` (staff, arologis-mobile도 동일한 production 구조)
>
> `"production": {`  
> `  "distribution": "store",`  
> `  ...`  
> `  "channel": "production"`  
> `}`

각 `app.config.js`도 `runtimeVersion: { policy: 'appVersion' }`와 `expo-updates`를 사용하고, production Android는 app-bundle로 정의한다. 현재 코드에는 `/app/version` 정책 확인과 EAS OTA 시도가 이미 있다. 예를 들어 `clients/mobile/src/version/versionCheck.ts:59-65`는 `SAMHAN_MOBILE`과 `currentVersion`으로 API를 호출하고, `src/version/otaUpdates.ts:10-28`은 개발/비활성 상태를 건너뛴 뒤 EAS update 확인을 수행한다.

**범위 판정:** “전 사용자 대면 클라이언트의 버전 정책”이라는 상위 목표에는 모바일 세 앱의 client identity·정책 등록이 포함된다. 그러나 Electron의 `latest.yml` feed, Authenticode 서명, `quitAndInstall`을 모바일에 확대하는 것은 이 트랙의 동일 계약이 아니다. 모바일은 App Store/Google Play 제출과 EAS project/runtimeVersion/OTA 채널을 별도 검증하는 후속 계약으로 분리하는 것이 근거에 맞다. 저장소의 EAS project ID와 스토어 제출 ID는 placeholder이므로 실제 스토어 배포가 활성화됐다고 확인할 수 없다.

### 2.5 없는 선행 조건 — 배포 활성화 선행 조건은 코드서명·feed 운영 기반

| 선행 조건 | 현재 확인 결과 | 근거 |
|---|---|---|
| Windows 코드서명 인증서와 CI secret 연결 | **확인되지 않음.** 설정은 서명을 강제하지만 실제 인증서/secret 값이나 CI wiring은 저장소에서 찾지 못했다. | 두 Electron builder가 `forceCodeSigning: true`를 설정한다 (`clients/desktop/electron-builder.yml:16-18`, `clients/arologis-desktop/electron-builder.yml:8-9`). 기존 auto-update 보고서도 인증서·`CSC_LINK`/`CSC_KEY_PASSWORD` 및 서명 artifact 검증을 미완료로 기록한다. |
| 실제 HTTPS update feed와 게시 artifact | **확인되지 않음.** Arologis는 `AROLOGIS_UPDATE_URL` 없이는 release wrapper가 중단되고, Samhan desktop도 `DESKTOP_UPDATE_URL` generic provider만 설정되어 있다. 실제 `latest.yml`, NSIS installer, blockmap 업로드는 확인하지 못했다. | `clients/arologis-desktop/electron-builder.yml:46-51`, `clients/desktop/electron-builder.yml:64-69`, `scripts/build-arologis-desktop-release.cjs:38-41`. |
| 8개 모두의 운영 `/app/version` record | 소스상 endpoint/client type 계약은 확인했지만, DB 또는 production record의 실제 내용은 이번 읽기에서 확인하지 않았다. | 각 web/mobile/desktop version checker와 기존 `2026-07-23-desktop-auto-update.md`의 API 계약 기록. |
| 모바일 EAS project/store 자격 증명 | **placeholder만 확인.** 실제 EAS project ID, App Store Connect ID, Google Play service account와 store listing은 확인하지 못했다. | 각 모바일 `app.config.js`와 `eas.json`의 `PLACEHOLDER_EAS_PROJECT_ID` 및 제출 설정. |

따라서 배포 활성화의 첫 선행 조건은 여전히 **코드서명 + HTTPS feed 운영 기반 확보**다. 다만 이번 실측으로 확인된 QA 버전값 전파 문제는 더 작고 먼저 닫아야 할 검증 차단선이다. 외부 secret store나 실제 feed가 저장소 밖에 이미 있을 가능성은 있으나, 이번 정찰에서는 그것을 확인하지 못했으므로 “없다”가 아니라 “확인되지 않음”으로 판정했다.

### 2.6 추가 정찰 — `DESKTOP` currentVersion 400

이번 라운드의 라이브QA 실측 원문은 다음과 같다.

```text
GET http://localhost:8080/app/version?clientType=DESKTOP&currentVersion=8.98029556650246
→ 400
{"success":false,"code":"INVALID_INPUT",
 "message":"현재 버전 semver 형식 불일치: 8.98029556650246","data":null}
```

#### 1) `DESKTOP`의 `currentVersion` 생성 지점

렌더러의 실제 전파 경로는 세 단계다.

> `clients/desktop/src/renderer/components/common/AppVersionGate.tsx:21-23`
>
> `const CURRENT_VERSION = resolveBuildAppVersion(`  
> `  import.meta.env.VITE_APP_VERSION ?? (import.meta.env.MODE === 'test' ? '0.1.0' : undefined),`  
> `)`
>
> `clients/desktop/src/renderer/components/common/AppVersionGate.tsx:270-273`
>
> `getAppVersion({`  
> `  clientType: clientTypeRef.current,`  
> `  currentVersion: CURRENT_VERSION,`  
> `})`
>
> `clients/desktop/src/renderer/api/appVersion.ts:111-122`
>
> `const config: ApiRequestConfig = { params, skipAuth: true }`  
> `apiClient.get('/app/version', config)`

`clientTypeRef`는 `clients/desktop/src/renderer/version/versionCheck.ts:43-49`에서 Electron·Capacitor·웹 모두 `DESKTOP`으로 판정한다. 따라서 관측된 URL의 `currentVersion`은 서버나 updater가 만든 값이 아니라, renderer 모듈 초기화 시점의 `import.meta.env.VITE_APP_VERSION`에서 온 값이다.

#### 2) `8.98029556650246`의 성격

확인한 `currentVersion` 경로에는 `Math.random()`이 없다. 무주입 fallback도 난수가 아니다.

> `scripts/app-build-version.cjs:21-33`
>
> `if (!injected) {`  
> `  ...`  
> `  return DEVELOPMENT_FALLBACK_VERSION`  
> `}`  
> `validateDevelopmentVersion(injected, variable)`
>
> `DEVELOPMENT_FALLBACK_VERSION = '0.1.0-dev'`

반면 렌더러 단독 QA 서버인 `clients/desktop/vite.renderer.dev.config.ts:2-11`은 스스로 `VITE_APP_VERSION`을 해석하거나 `define`하지 않고, 호출 환경의 Vite 변수에 의존한다. 이 경로에서 소스의 `resolveBuildAppVersion()`은 `clients/desktop/src/renderer/version/versionCheck.ts:25-30`처럼 비어 있는 값만 거부하고 날짜 형식을 검증하지 않는다.

따라서 판정은 다음과 같다.

- `8.98029556650246`은 이 버전 경로의 고정 fallback이 아니며, 확인한 버전 경로에서 `Math.random()`으로 생성된 값도 아니다.
- 이 값이 정확히 어느 외부 실행 환경·하네스·이미 떠 있던 dev server에서 주입/잔류했는지는 **확인하지 못함**. 저장소의 버전 생성 코드만으로 그 숫자의 출처를 특정할 수 없다.
- 다만 현재 QA 설정은 임의의 non-empty 문자열을 통과시킬 수 있으므로, `2026/07/29-1`을 넣었다는 실행과 실제 renderer가 읽은 값이 달랐다면 그 불일치를 시작 시점에 차단하지 못한다.

#### 3) dev 한정인가, 패키징본에도 도달하는가

**관측된 malformed 값의 경로는 QA/dev 한정으로 확인된다.** `vite.renderer.dev.config.ts`는 주석부터 “QA 전용 — renderer 단독 Vite dev 서버”라고 명시되어 있고, 정식 패키징은 이 설정을 사용하지 않는다.

정식 `DESKTOP` Windows 패키징은 다음 경로에서 공통 resolver와 release 검증을 거친다.

> `clients/desktop/electron.vite.config.ts:21-24,67-72`
>
> `const { resolveBuildAppVersion } = require('../../scripts/app-build-version.cjs')`  
> `const appVersion = resolveBuildAppVersion({ variable: 'VITE_APP_VERSION' })`  
> `'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion)`
>
> `scripts/build-desktop-release.cjs:43-66`
>
> `releaseBuild = createReleaseBuildEnvironment({ variable: 'VITE_APP_VERSION' })`  
> `run(..., electronViteCli, 'build', releaseBuild.env)`  
> `verifyReleaseRenderer(releaseBuild.appVersion)`  
> `run(..., electronBuilderCli, '--win', releaseBuild.env)`

또한 `clients/desktop/scripts/validate-desktop-release.cjs:22-45`는 `SAMHAN_RELEASE_BUILD=1`, `VITE_APP_VERSION`, `YYYY/MM/DD-N` 형식, artifact version 일치, renderer에 같은 값이 주입됐는지를 모두 검사한다. `clients/desktop/README.md:52-59`도 일반 `build`는 배포하지 않는 sentinel 경로이고, Windows 배포는 `build:win` release wrapper만 사용한다고 구분한다.

그러므로 **정식 release wrapper를 통과한 배포본에는 이 숫자가 들어가지 않는다**. malformed 값이 실제 패키지에 들어간다면 매 부팅의 `AppVersionGate` 요청이 400이 되고, 그 `.catch`가 부팅을 계속하게 되므로 `CRITICAL` 응답을 받을 기회도 없어 강제 업데이트는 동작하지 않는다. 그러나 이번 실측만으로 실제 운영 설치본의 renderer를 확인한 것은 아니며, 비정상적인 수동 패키징·오래된 산출물·다른 config를 사용한 배포 여부는 **확인하지 못함**이다.

#### 4) 다른 클라이언트의 `currentVersion` 대조

| 클라이언트 | 생성 지점 | 무주입/구버전 처리 | 이번 난수 형태와 같은 경로 확인 |
|---|---|---|---|
| `AROLOGIS_DESKTOP` | `clients/arologis-desktop/src/renderer/components/common/AppVersionGate.tsx:10-11`이 `import.meta.env.VITE_APP_VERSION`을 `resolveBuildAppVersion()`에 넣고, `:91-94`에서 API에 전달 | `version/versionCheck.ts:25-30`은 고정 `0.1.0-dev`; `electron.vite.config.ts:20-24,56-58`은 공통 resolver로 release 주입 | `Math.random()` 경로는 확인하지 못함. 공통 release config가 날짜 형식을 검증한다. |
| `SAMHAN_MOBILE` | `src/version/versionCheck.ts:37-49`의 `Constants.expoConfig.extra.appVersion` 우선, 없으면 `expoConfig.version` | `app.config.js:12-18,59-77`에서 `EXPO_PUBLIC_APP_VERSION`을 shared resolver로 `extra.appVersion`에 넣고, 없으면 package semver를 호환 사용 | 난수 fallback 없음. `:59-65`가 그 값을 URL의 `currentVersion`으로 넣는다. |
| `SAMHAN_MOBILE_STAFF` | `src/version/versionCheck.ts:37-49`, `:59-65` | `app.config.js:27-35,110-136`의 동일한 `extra.appVersion`/package semver 구조 | 난수 fallback 없음. |
| `AROLOGIS_MOBILE` | `src/version/versionCheck.ts:37-49`, `:59-65` | `app.config.js:12-18,53-70`의 동일한 `extra.appVersion`/package semver 구조 | 난수 fallback 없음. |
| `SAMHAN_ORDER_WEB` | `vite.config.ts:25-30,88-90`이 build-time version을 주입하고, `src/main.ts:27-36`이 `currentVersion`으로 전달 | `src/version/versionCheck.ts:33-40`의 고정 `0.1.0-dev` | 난수 fallback 없음. |
| `SAMHAN_ESTIMATE_WEB` | `routes/index.js:13-25`의 `currentAppVersion` → EJS config → `public/version-gate.js`; resolver는 `lib/version-check.js:9-19` | shared resolver와 고정 `0.1.0-dev` sentinel | 난수 fallback 없음. |
| `SAMHAN_MOBILE_PUBLIC_WEB` | `vite.config.ts:7-18` 주입 → `src/main.tsx:15-18`의 `resolveBuildAppVersion()` | `src/version/versionCheck.ts:24-32`의 고정 `0.1.0-dev` | 난수 fallback 없음. |

대조 결과, 다른 7개 클라이언트에서도 버전 경로가 난수를 만드는 코드는 확인하지 못했다. 모바일 화면의 line ID 등 다른 UI 목적의 `Math.random()` 호출이 존재하는 것과 version gate의 `currentVersion` 생성은 별개다.

#### 5) 서버 semver와 `YYYY/MM/DD-N`의 공존

서버는 실제로 두 형식을 모두 받도록 작성되어 있다.

> `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/domain/Semver.java:17-18,65-72`
>
> `Pattern.compile("^(\\d{4})/(\\d{2})/(\\d{2})-([1-9][0-9]*)$")`  
> `if (looksLikeDevelopmentVersion(value)) { ... return; }`  
> `parse(value, fieldName)`

날짜 형식이 아니면 legacy semver parser로 내려간다. parser는 `Semver.java:154-162`에서 `.`로 나눈 부분이 정확히 3개인지와 각 부분의 semver 숫자 규칙을 검사한다. 그래서 `8.98029556650246`은 점으로 나눈 부분이 2개뿐이라 실측 메시지 그대로 거부된다.

> `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/service/AppReleaseService.java:31-39`
>
> `Semver.requireValid(currentVersion, "currentVersion")`  
> `if (Semver.isDevelopmentSentinel(currentVersion)) { ... NONE ... }`

공존 규칙은 다음이다.

- `GET /app/version`의 `currentVersion`은 `YYYY/MM/DD-N` 또는 legacy semver를 모두 허용한다. `0.1.0-dev`는 별도 개발 sentinel로 허용되며 `NONE` 처리된다.
- 새 admin release의 `version`은 `AppReleaseService.java:53-58`의 `Semver.requireDevelopmentVersion()` 때문에 `YYYY/MM/DD-N`이어야 한다.
- 전환기 `minSupportedVersion`은 같은 줄의 `requireValid()`로 semver와 날짜 형식을 모두 허용한다. 서비스의 비교기(`Semver.compare`)도 양쪽 형식을 별도 비교한다.
- 따라서 package.json의 Electron/Expo metadata semver와 실제 release 정책 버전 `YYYY/MM/DD-N`은 의도적으로 공존한다. 이번 400은 두 계약의 충돌이 아니라, 어느 계약에도 속하지 않는 잘못된 renderer 값이다.

**이번 실측의 최종 판정:** 버전 확인 API 자체는 packaged `DESKTOP`에서도 호출되지만, 관측된 난수형 값이 정식 release artifact까지 도달한다는 증거는 없다. 현재 확인 가능한 원인은 QA 전용 renderer 경로의 입력 검증 부재와 실행 환경 값 불일치이며, 그 숫자를 만든 정확한 외부 주입원은 **확인하지 못함**이다.

### 2.7 슬라이스 제안

1. **QA `currentVersion` 전파 차단선** — `vite.renderer.dev.config.ts`가 공통 resolver와 동일한 날짜 형식 검증을 사용하게 하고, 실제 renderer가 읽은 값과 `/app/version` query를 한 번에 확인한다. 이번 400을 가장 작은 범위에서 먼저 재현·차단하는 슬라이스다.
2. **정식 release artifact 버전 증명** — `DESKTOP`과 `AROLOGIS_DESKTOP`의 release wrapper가 주입한 `YYYY/MM/DD-N`과 renderer bundle의 `CURRENT_VERSION` 및 서버 query가 같은지 설치 전 증거로 남긴다. 이번 정찰에서는 실행하지 않았다.
3. **코드서명·HTTPS feed 활성화** — Authenticode 인증서/CI secret, 제품별 feed, `latest.yml`·NSIS installer·blockmap 게시와 rollback runbook을 확보한다. 이것은 malformed version 차단 후의 배포 활성화 선행 조건이다.
4. **웹·모바일 채널 운영 확인** — 웹 3개는 `/app/version`과 수동 reload 정책을, 모바일 3개는 EAS project/store/OTA 계약을 각각 확인한다. Electron feed 계약을 모바일에 복제하지 않는다.

### 2.8 이번 정찰이 보지 않은 것

- 사용자가 금지한 git 명령과 GitHub PR API 조회를 하지 않았으므로, PR #981의 원격 diff/리뷰 코멘트 원문 전체는 확인하지 않았다. 현재 머지된 코드와 저장소 handoff/report를 근거로 구조를 재구성했다.
- `npm install`, 빌드, Docker, 실제 Electron 설치/업데이트, 브라우저·모바일 기기 실행은 하지 않았다. 따라서 표는 실행 산출물 검수가 아니라 저장소의 배포 경로 목록이다.
- CI secret store의 인증서, 실제 HTTPS feed 호스트, 업로드된 `latest.yml`·installer·blockmap, 운영 `/app/version` DB record와 CDN 캐시는 확인하지 않았다.
- EAS 계정, App Store Connect/Google Play 콘솔, 실제 모바일 store listing과 OTA publish 결과는 확인하지 않았다.
- 이번 400을 직접 재현하거나 실행 중인 dev server의 실제 환경변수·번들·프로세스 출처를 캡처하지 않았다. 제공된 라이브QA 원문과 정적 소스 추적만으로 `8.98029556650246`의 외부 주입원을 특정할 수 없다.
- `clients/desktop/src/renderer/components/documentTemplate/**`의 내용은 이번 판정에 필요하지 않아 읽지 않았다. 지정된 `clients/web/order-app/**`와 `clients/web/design-system/**`은 요청대로 읽기만 했고 수정하지 않았다.

## 3. 불변식 (수단 미지시)

1. 사용자가 **구버전을 쓰고 있다는 사실을 알 수 있어야 한다** — 조용히 구버전으로 머무르지 않는다.
2. 업데이트 확인이 실패해도 **앱이 죽지 않아야 한다.** 실패는 실패로 보여야 하고 기능을 막지 않는다.
3. 버전 표기는 이 저장소 규약 `YYYY/MM/DD-N` 을 따른다.
4. 앱마다 다른 것은 **설정으로** 가르고, 같은 것은 **한 곳에서** 관리한다.

## 4. 격리 조건 (병렬 트랙 다수와 공유 자원)

- **Docker·서비스 재기동 금지** — 정찰·기획 단계는 스택이 필요 없다. 라이브QA 는 PM 이 별도 지시.
- `clients/web/order-app/**` **수정 금지** — PR #985 #987 #992 가 진행 중.
- `clients/desktop/src/renderer/components/documentTemplate/**` **수정 금지** — PR #990 진행 중.
- `clients/web/design-system/**` **수정 금지** — dist 가 여러 워크트리에 junction 으로 공유된다.

## 5. 이 문서의 상태

**정찰 결과 반영 기획서다.** §2.1~§2.6에 소스·설정 대조 결과와 실측 400 판정을 반영했고, §2.7에 후속 슬라이스를 갱신했다.
