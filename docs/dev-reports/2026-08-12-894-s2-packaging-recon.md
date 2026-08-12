# #894 S2 — 별도 패키징 앱 선례 정찰

## 결론

**`clients/arologis-desktop`의 Electron 패키징 골격은 재사용할 수 있지만, 그대로 복제해서는 요구사항을 충족할 수 없다.**

복제 가능한 범위는 Electron main/preload/renderer 3-entry, `electron-vite` → `electron-builder`, Windows NSIS + portable, 날짜형 버전 wrapper, generic HTTPS updater, sandbox/CJS preload 보안 불변식이다. 별도 구현이 필요한 범위는 (1) 트레이 생명주기, (2) 본체 로그인 연계, (3) 삼한이 트레이 자산의 패키지 포함, (4) 신규 앱 고유 identity/feed/서명 자격과 CI installer 단계다.

## 1. `clients/arologis-desktop` 패키징 선례

### 찾은 것

| 항목 | 파일:줄 원문 | 판정 |
|---|---|---|
| 별도 앱 identity | `clients/arologis-desktop/electron-builder.yml:3-6` — `desktop 패턴을 복제하되 app id / productName만 변경`, `appId: com.samhanair.arologis.desktop`, `productName: Arologis Desktop` | 본체와 다른 설치 앱이다. 신규 메신저도 고유 `appId`/`productName`이 필요하다. |
| 산출물 | `electron-builder.yml:8,11-13,26-31,35-48` — 버전별 `release/`에 x64 NSIS와 portable 생성 | 골격 재사용 가능. |
| 포장 입력 | `electron-builder.yml:18-24` — `out/**/*`, `package.json`, `asar: true` | main/preload/renderer 빌드 결과만 포장한다. 현재 별도 이미지 resource 선언은 없다. |
| 업데이트 피드 | `electron-builder.yml:50-54` — 앱 전용 `AROLOGIS_UPDATE_URL` generic feed | 신규 앱도 다른 feed 변수/경로가 필요하다. |
| 릴리스 명령 | `clients/arologis-desktop/package.json:8-16` — `build`는 `electron-vite build`, `build:win`은 앱 전용 wrapper | 앱 디렉터리와 release wrapper가 한 쌍이다. |
| 3-entry 빌드 | `clients/arologis-desktop/electron.vite.config.ts:26-72` — main/preload/renderer를 각각 `out/`에 빌드 | 재사용 가능. preload는 CJS(`:36-51`)를 유지해야 한다. |
| 패키징 회귀 가드 | `clients/arologis-desktop/src/main/packaging-invariants.test.ts:65-112` — sandbox, CJS preload, bridge namespace, DS 의존성 검사 | 신규 앱용 같은 가드가 필요하다. |
| 공용 버전 규칙 | `electron.vite.config.ts:19-24`, `scripts/build-arologis-desktop-release.cjs:14-18,67-85` — `scripts/app-build-version.cjs` 재사용 | 공용 파일은 그대로 재사용 가능하다. |
| 공용 디자인시스템 | `clients/arologis-desktop/package.json:28-48` 중 `:29` — `@samhan/design-system: file:../web/design-system`; CI는 `.github/workflows/arologis-ci.yml:167-181`에서 DS 선빌드 후 앱 `npm ci` | UI 토큰/컴포넌트/삼한이 renderer 자산은 공유한다. 앱 자체 의존성과 lockfile은 별도다. |
| 별도 main/preload/renderer | `clients/arologis-desktop/README.md:27-48` | 본체 소스를 런타임 공유하는 구조가 아니라 독립 앱 소스를 가진다. |
| 별도 인증 namespace/store | `clients/arologis-desktop/src/preload/index.ts:7-12,37-48`; `src/main/store/auth-store.ts:4-11,32` — `window.arologisAuth`, `arologis-auth.json` | 본체 `samhan-auth.json`(`clients/desktop/src/main/store/auth-store.ts:1-5,38`)과 의도적으로 분리한다. |

### 코드 서명에서 걸리는 것

- `clients/arologis-desktop/electron-builder.yml:9`는 `forceCodeSigning: true`다. 인증서가 없는 unsigned Windows 릴리스는 성공시키지 않는 설정이다.
- 저장소 설명은 인증서 입력을 `CSC_LINK`/`CSC_KEY_PASSWORD` 등으로 명시한다(`docs/dev-reports/2026-07-23-desktop-auto-update.md:89-90`). 그러나 이 저장소의 workflow에서 해당 secret 연결은 찾지 못했다. 저장소 밖 secret의 존재 여부는 **모른다**.
- `scripts/build-arologis-desktop-release.cjs:62-65`는 `AROLOGIS_UPDATE_URL`이 없으면 시작 전에 실패하고, `:67-85`는 명시 버전으로 빌드·포장을 실행한다.
- 현 CI의 아로로지스 desktop job은 typecheck/lint/test/`npm run build`까지만 실행한다(`.github/workflows/arologis-ci.yml:153-197`). `build:win`, NSIS/portable, 코드서명은 CI에서 실행하지 않는다. `arologis-deploy.yml`에서도 desktop installer 관련 항목을 찾지 못했다.

따라서 신규 앱은 설정만 복제해서는 배포 artifact가 나오지 않는다. 고유 인증서 사용 정책/CI secret 연결, 앱 전용 HTTPS feed, signed installer CI 또는 별도 release workflow가 필요하며 현재 확보 여부는 **모른다**.

### 본체 자동 로그인과의 충돌

아로로지스 선례는 인증을 공유하지 않는다. 아로로지스 store는 `arologis-auth`, 본체 store는 `samhan-auth`이고, 두 앱 main/preload에서 single-instance/deep-link/custom protocol/앱 간 인증 전달 구현도 찾지 못했다. 따라서 “본체 로그인 시 연계 자동 로그인”은 이 선례를 그대로 복제해서 얻을 수 없다. 어떤 안전한 앱 간 handoff를 쓸지는 이번 범위에서 결정하지 않았다.

## 2. 트레이 상주 + 창을 닫아도 유지

### 찾지 못한 것

`clients/`와 `scripts/`의 실행 코드에서 Electron `Tray`, `new Tray`, `setContextMenu`, `setToolTip`, `before-quit`, `mainWindow.hide()` 구현을 찾지 못했다.

오히려 두 Electron 앱은 Windows에서 마지막 창이 닫히면 종료한다.

- `clients/arologis-desktop/src/main/index.ts:105-107` — 창 `closed` 시 `mainWindow = null`.
- `clients/arologis-desktop/src/main/index.ts:124-126` — `window-all-closed` 시 macOS가 아니면 `app.quit()`.
- 본체도 동일: `clients/desktop/src/main/index.ts:102-104,142-144`.

따라서 트레이 상주/닫기→숨김/트레이에서 다시 열기/명시 종료 구분은 **신규 구현**이다. 기존 선례를 그대로 따르면 요구사항과 반대로 앱이 종료된다.

## 3. 삼한이 마스코트 이미지 자산

### 찾은 것

| 경로 | 실측 해상도 | 비고 |
|---|---:|---|
| `clients/web/design-system/src/assets/mascot/samhani-static.png` | 171×150 | 정적 최적화본, 27,130 bytes. `MascotLoader.tsx:2,39-48`과 `MascotEmptyState.tsx:2,24`가 사용한다. |
| `clients/web/design-system/src/assets/mascot/samhani.webp` | 171×150 | 8-frame 애니메이션 최적화본, 71,880 bytes. 원본 설명은 `docs/superpowers/specs/2026-06-19-samhani-mascot.md:6-9`; 해상도 근거는 `docs/superpowers/specs/2026-07-28-965-document-image-decodability-spec.md:203,262`다. |
| `docs/character/char_01.png` … `char_08.png` | 432×432 7장, `char_02.png`만 458×458 | 개발책임자 제공 원본 프레임. |
| `docs/character/KakaoTalk_20260519_162341631.gif` | 1496×1051, 12 frames | 원본 GIF, 3,682,585 bytes. |

### 패키징 관점의 부족한 것

- 트레이 전용 `.ico` 또는 크기별 정사각 PNG 자산은 찾지 못했다.
- `clients/arologis-desktop/build/`과 `clients/desktop/build/` 디렉터리는 현재 없고, 아로로지스 builder에는 `win.icon`이나 mascot `extraResources`가 없다(`electron-builder.yml:11-24,26-33`).
- 디자인시스템의 이미지는 renderer용 dependency다. main process가 `Tray`에서 안정적으로 읽을 별도 포장 경로는 현재 없다.

즉 삼한이 원본/최적화 자산은 존재하지만, 트레이 아이콘 산출물과 패키지 포함 연결은 새로 필요하다.

## 신규 패키징 앱 1개 추가 시 건드릴 파일

아래는 아로로지스 선례를 적용할 때 확인되는 최소 패키징/빌드 표면이다. 앱 이름·feed 이름·인증 연계 방식은 아직 결정되지 않아 `<chat-app>`으로 적는다.

### 신규 파일

- `clients/<chat-app>/package.json`, `package-lock.json`
- `clients/<chat-app>/electron-builder.yml`
- `clients/<chat-app>/electron.vite.config.ts`
- `clients/<chat-app>/tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- `clients/<chat-app>/eslint.config.js`, `vitest.config.ts`
- `clients/<chat-app>/src/main/index.ts` — BrowserWindow + Tray 생명주기
- `clients/<chat-app>/src/preload/index.ts`
- `clients/<chat-app>/src/renderer/index.html` 및 renderer entry
- `clients/<chat-app>/src/main/packaging-invariants.test.ts` — sandbox/CJS/자산/트레이 종료 계약 가드
- `clients/<chat-app>/build/` 또는 별도 resource 경로의 앱 아이콘·삼한이 트레이 아이콘
- `scripts/build-<chat-app>-release.cjs` — 고유 update URL 검사와 electron-builder 실행

### 기존 파일 변경

- `.github/workflows/ci.yml` — 신규 앱 `npm ci`/typecheck/lint/test/build job 추가. 새 경로는 현재 main CI trigger에서 무시되지는 않지만, 빌드하는 job은 없다(`:757-820`은 `clients/desktop` 전용).
- 별도 릴리스 cadence를 택한다면 신규 release workflow가 필요하다. 기존 `.github/workflows/arologis-ci.yml`은 아로로지스 전용 path/job(`:9-35,150-197`)이므로 메신저를 여기에 넣을 근거는 없다.
- `scripts/run-client-local-dev.cjs` — `package.json`에서 공용 `local-dev` launcher를 쓸 경우 target 등록 필요(`:7-22,72-75`).
- `scripts/app-build-version.cjs`는 현재 그대로 재사용 가능하며 변경 필요를 찾지 못했다.

## 최종 판정

**부분 재사용 가능 / 그대로 사용 불가.** 포장 기술은 아로로지스 선례를 복제하되, 트레이 생명주기·본체 인증 handoff·트레이 resource·고유 서명/feed/installer CI는 별도 설계와 구현이 필요하다. 특히 현재 선례의 인증 격리와 창 종료 동작은 확정 요구사항과 정반대다.

## 라운드 종료 점검

삭제된 추적 파일 없음. `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 추적 상태이며 삭제되지 않았다.
