# #910 첫 슬라이스 정찰 — 결정 비의존 기준선 (2026-08-13)

> 정찰 전용 보고서다. 구현 코드, 공유 DB, Docker 스택은 변경하지 않았다. 조사는 원격 `main`과 일치하는 로컬 원격 추적 참조 `origin/main` (`e8c2d370994abf1b14dd62009273ae7822072382`)의 blob을 `git show`·`git grep`으로 읽어 수행했다. `git ls-remote origin refs/heads/main`도 같은 SHA를 반환했다. 현재 작업 브랜치 HEAD는 `474392c1059b5b632bcd68863b2c14c1dea37e68`이므로 아래 코드 판정은 오래된 작업 tree가 아니라 명시적으로 `origin/main:<path>`를 기준으로 했다.

## 0. 결론

결정 없이 머지 가능한 첫 단위가 있다. 다만 **실제 updater feed와 installer를 만드는 단위는 아니다.** 첫 슬라이스는 다음 네 가지를 묶은 **9앱 계약 기준선**이 적합하다.

1. 사내 메신저를 9번째 서버 식별자 `INTERNAL_CHAT_DESKTOP`으로 등록한다.
2. 이미 공통 날짜 버전 변환기를 호출하는 사내 메신저 release wrapper를 기존 두 Electron 앱과 같은 정적 계약 테스트에 포함하고, NSIS 사용자 표시 버전도 `YYYY/MM/DD-N`으로 맞춘다.
3. 사내 메신저에 현재 없는 독립 CI 소스 검증(`npm ci`·typecheck·lint·test·`electron-vite build`)을 추가한다.
4. updater가 이미 있는 아로로지스 데스크톱의 `electron-updater`를 `devDependencies`가 아니라 packaged runtime 의존성으로 정리한다.

이 범위는 배포 URL, 제품별 prefix/channel, 인증서, secret, 실제 installer 게시를 정하거나 가정하지 않는다. updater가 없는 사내 메신저에 실제 확인·다운로드·설치 배선을 넣는 일은 가능하지만, 첫 슬라이스에서는 **서버 식별자와 빌드 기준선만 먼저 만든 뒤** 별도 슬라이스로 두는 편이 안전하다. 현재 boot-time updater를 그대로 복제하면 피드 설정이 없는 packaged 앱에서 즉시 오류를 만들고, 부분 배선만 머지하면 동작하는 것처럼 보일 수 있기 때문이다.

## 1. 조사 기준과 오늘 변경

- PR #1193은 `2026-08-13 04:20:54 KST`에 머지됐다. merge commit은 `668e4d0f5ee0f55c179dc982b35e7b8979346bb3`이며 `origin/main`에 `clients/internal-chat-desktop`이 존재한다. 따라서 분모는 **9앱**이다.
- PR #1195는 조사 시점에 **OPEN**이고 head는 `7ddda35091dfaa1f9067779169223612d1f71ba0`이다. `published` 릴리스가 없을 때 `/app/version`을 `404`가 아니라 `200 + forceLevel=NONE`으로 바꾸지만 아직 `origin/main` 계약은 아니다.
- PR #1181은 OPEN이며 현재 변경 파일은 조사/트랙 문서 3개뿐이다. 구현 파일 변경은 없다.

## 2. 9개 앱 현재 상태

`CI 빌드`는 소스/정적 산출 검증과 배포 가능한 signed package 생성을 구분했다. 현재 어느 Electron 앱도 CI에서 `npm run build:win`을 실행해 installer/feed 산출물을 만들지 않는다.

| 앱 | updater 배선 | `electron-builder` 설정 | 코드서명 설정 | CI 빌드 여부 |
|---|---|---|---|---|
| 삼한 데스크톱 (`clients/desktop`, `DESKTOP`) | **있음** — `/app/version` 정책 조회와 `electron-updater` check/download/`quitAndInstall`이 서로 독립적으로 기동 | **있음** — NSIS+portable, generic `${DESKTOP_UPDATE_URL}`, `channel: latest` | `forceCodeSigning: true`, `publisherName: Samhan Air Systems Co., Ltd.`. 실제 인증서/secret은 못 찾음 | **소스 빌드 있음** — `ci.yml`의 electron-vite/web/capacitor 빌드. **Windows installer CI 없음** |
| 아로로지스 데스크톱 (`clients/arologis-desktop`, `AROLOGIS_DESKTOP`) | **있음** — `/app/version` + `electron-updater` check/download/install | **있음** — NSIS+portable, generic `${AROLOGIS_UPDATE_URL}`, `channel: latest` | `forceCodeSigning: true`, 같은 `publisherName`. 실제 인증서/secret은 못 찾음 | **소스 빌드 있음** — `arologis-ci.yml`의 `npm run build`. **Windows installer CI 없음** |
| 사내 메신저 데스크톱 (`clients/internal-chat-desktop`, 식별자 없음) | **없음** — `/app/version`, `electron-updater`, preload IPC, 버전 게이트 모두 없음 | **있음** — NSIS+portable. `publish` 설정 없음 | `forceCodeSigning: false`; release wrapper도 `--config.win.signAndEditExecutable=false`로 명시 비활성. `publisherName` 없음 | **없음** — `.github/workflows`에서 앱 경로 참조 0건. 로컬 `build:win` wrapper만 있음 |
| 삼한 모바일 (`clients/mobile`, `SAMHAN_MOBILE`) | **있음** — `/app/version` + `expo-updates` fetch/reload. EAS placeholder이면 OTA 비활성 | 해당 없음 | 저장소의 명시적 native signing 자격 설정은 못 찾음. EAS project는 placeholder | **검증 있음** — typecheck+Jest. signed native/OTA 산출 CI 없음 |
| 직원 모바일 (`clients/mobile-staff`, `SAMHAN_MOBILE_STAFF`) | **있음** — `/app/version` + `expo-updates`; EAS placeholder이면 비활성 | 해당 없음 | 명시적 signing 자격은 못 찾음. EAS project placeholder | **검증 있음** — typecheck+Jest, expo-doctor/prebuild는 일부 graceful. signed native/OTA 산출 CI 없음 |
| 아로로지스 모바일 (`clients/arologis-mobile`, `AROLOGIS_MOBILE`) | **있음** — `/app/version` + `expo-updates`; EAS placeholder이면 비활성 | 해당 없음 | 명시적 signing 자격은 못 찾음. EAS project placeholder | **검증 있음** — Jest, typecheck/doctor/prebuild 일부 graceful. signed native/OTA 산출 CI 없음 |
| 주문 웹 (`clients/web/order-app`, `SAMHAN_ORDER_WEB`) | **있음** — `/app/version` 후 사용자 선택 reload, dirty 확인 | 해당 없음 | 해당 없음 | **있음** — Vite `dist` 빌드; 별도 deploy workflow도 build 후 조건부 배포 |
| 종합견적 웹 (`clients/web/estimate-app`, `SAMHAN_ESTIMATE_WEB`) | **있음** — `/app/version` 후 사용자 선택 reload, dirty 확인 | 해당 없음 | 해당 없음 | **있음** — 배포 workflow에서 test/typecheck/build. 이 앱의 `build`는 typecheck이며 Node/EJS 서버형이라 별도 bundle은 없음 |
| 모바일 퍼블릭 웹 (`clients/web/mobile-public`, `SAMHAN_MOBILE_PUBLIC_WEB`) | **있음** — `/app/version` 후 사용자 선택 reload, 서명 입력 dirty 보호 | 해당 없음 | 해당 없음 | **있음** — `ci.yml`에서 Vite build |

근거:

- Electron builder: `clients/desktop/electron-builder.yml`, `clients/arologis-desktop/electron-builder.yml`, `clients/internal-chat-desktop/electron-builder.yml`.
- Electron updater: `clients/desktop/src/main/auto-update.ts`, `clients/arologis-desktop/src/main/auto-update.ts`. 내부 채팅의 `src/main/index.ts`와 `src/preload/index.ts`에는 updater 코드가 없다.
- CI: `.github/workflows/ci.yml:757-999`, `.github/workflows/arologis-ci.yml:155-239`, `.github/workflows/deploy-order-app.yml:25-48`, `.github/workflows/deploy-estimate-app.yml:34-64`. `.github/workflows`에서 `internal-chat-desktop` 검색 결과는 0건이다.
- Expo: 세 앱의 `app.config.js`는 `EAS_PROJECT_ID` 기본값을 placeholder로 두고 그 상태에서 `updates.enabled=false`가 되도록 한다.

## 3. `intranet.example` 하드코딩 위치

운영 URL 하드코딩이 아니다. **오류 상세가 사용자 화면에 노출되지 않는지 검증하는 test fixture**다. 실제 production builder는 외부 환경변수 `DESKTOP_UPDATE_URL`을 사용한다.

CI 문구와 완전히 같은 문자열 `Cannot find channel latest at https://intranet.example/latest.yml x-secret-header`가 들어 있는 위치:

- `clients/desktop/src/main/auto-update.test.ts:141`
- `clients/desktop/playwright/909-auto-update-real-qa/luna-round-real-qa.spec.ts:20`
- `clients/desktop/playwright/909-auto-update-real-qa/opus-reconv2-inflow-real-qa.spec.ts:25`
- `clients/desktop/playwright/909-auto-update-real-qa/opus-reconv3-probe-real-qa.spec.ts:28`
- `clients/desktop/playwright/909-auto-update-real-qa/sonnet-round2-notice-overlap-real-qa.spec.ts:25`
- `clients/desktop/playwright/909-auto-update-real-qa/sonnet-round2-print-sweep-real-qa.spec.ts:419`

유사 문자열이 반복되는 위치:

- `clients/desktop/src/renderer/components/common/AppVersionGate.test.tsx:154,172,231,251,397`
- `clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts:1202,1204`

가장 직접적인 일반 CI 출력 후보는 `auto-update.test.ts:141`이다. 이 fixture를 production의 `messageFromError()`에 넣으면 `clients/desktop/src/main/auto-update.ts:58`의 `console.error`가 원문을 CI 로그에 남기고 사용자에게는 일반화된 한국어 문구만 반환한다. 어느 GitHub Actions run/step에서 나온 한 줄인지는 로그 URL을 받지 않았으므로 **정확히 어느 테스트가 출력했는지는 모른다.**

결정 없이 가능한 정리는 fixture를 한 곳에 모으고 예상 `console.error`를 test spy로 포착해 CI 로그를 오염시키지 않게 하는 것이다. production의 상세 로그 정책을 바꾸거나 실제 피드 URL을 넣을 필요는 없다.

## 4. PR #1195 `/app/version` 계약과 자동 업데이트의 관계

### 4.1 같은 기능군이지만 같은 계약은 아니다

두 계층은 목적과 데이터가 다르다.

| 계층 | 역할 | 데이터/호출 |
|---|---|---|
| 정책 제어면 | 현재 버전에 업데이트 안내·강제 차단이 필요한지 결정 | dashboard-service `GET /app/version` → `latestVersion`, `minSupportedVersion`, `forceLevel`, release notes |
| 바이너리 배포면 | 설치 파일을 발견·다운로드·설치 | `electron-updater` → generic feed의 `latest.yml`, installer, blockmap |

삼한 데스크톱은 `AppVersionGate.tsx:215-283`에서 Electron updater를 확인하고, 별도 effect인 `:285-308`에서 `/app/version`을 조회한다. 아로로지스도 `AppVersionGate.tsx:89-108`과 `:114-124`에서 두 호출을 독립 실행한다. 따라서 `/app/version`이 `200 + NONE`이 되어도 `https://.../latest.yml` 부재 오류는 사라지지 않는다.

### 4.2 PR #1195가 바꾸는 것

현재 `origin/main`의 `AppReleaseService.latestRelease()`는 published row가 없으면 `BusinessException(NOT_FOUND)`를 던진다(`AppReleaseService.java:116-128`). PR #1195는 이를 정상 초기 상태로 바꾼다.

```text
latestVersion      = 요청 currentVersion
minSupportedVersion = 요청 currentVersion
forceLevel         = NONE
releaseNotes       = null
releasedAt         = null
HTTP               = 200
```

이 변경은 feed가 아직 없는 상태에서 정책 API가 404를 만들지 않게 하므로 자동 업데이트 첫 도입에 유리하다. 그러나 다음은 하지 않는다.

- `latest.yml`을 만들거나 게시하지 않는다.
- `electron-updater`의 feed 오류를 막지 않는다.
- updater가 없는 사내 메신저에 IPC/UI를 추가하지 않는다.
- 새 `INTERNAL_CHAT_DESKTOP` 서버 식별자를 추가하지 않는다.

또한 PR #1195는 아직 OPEN이다. 사내 메신저가 `/app/version`을 즉시 호출하도록 만드는 슬라이스는 (a) PR #1195 머지 뒤 진행하거나, (b) published 사내 메신저 release를 함께 준비해야 한다. 배포 결정을 기다리지 않는 방향은 **#1195 머지 뒤 호출 배선을 넣는 것**이다.

## 5. 결정에 의존하지 않는 작업

| 작업 | 지금 가능한 근거 | 경계/주의 |
|---|---|---|
| 9번째 식별자 `INTERNAL_CHAT_DESKTOP` 등록 | PR #1193 머지로 독립 배포 앱의 존재가 확정됐다. enum, DB check constraint migration, admin 앱 선택지, client type 테스트는 feed·서명과 무관 | 공유 DB에 수동 write하지 않고 정상 Flyway migration 코드로만 구현해야 함. `/app/version` 호출 활성화는 PR #1195 순서 주의 |
| 사내 메신저 공통 날짜 버전 계약 완성 | `scripts/build-internal-chat-desktop-release.cjs:19`가 이미 공통 `createReleaseBuildEnvironment()`를 사용한다 | 현재 공통 테스트는 명시적으로 “두 Electron 앱”만 검사하고, 내부 채팅 wrapper는 NSIS 표시 버전 include를 넘기지 않는다. 세 앱 계약으로 확장 가능 |
| 사내 메신저 source CI 추가 | 앱에 lint/typecheck/test/build script와 lockfile이 이미 있다 | Windows installer/package CI가 아니다. Linux에서 `electron-vite build`까지만 수행하면 서명·feed 결정 불필요 |
| 아로로지스 updater runtime 의존성 정정 | 삼한은 `electron-updater`를 `dependencies`에 두지만 아로로지스는 `devDependencies`에 둔다. packaged runtime 모듈은 runtime dependency가 정합 | lockfile 동기화와 packaged module 정적 검증 필요. 실제 installer 포함 E2E는 후속 |
| Electron 3앱 builder 공통 불변식 테스트 | appId 고유성, NSIS+portable target, artifact/output version, runtime dependency, package files는 정책 결정이 아님 | `publish.url`, channel, `forceCodeSigning`, publisher 값의 통일은 이번 범위에서 금지 |
| 9앱 버전 표기 계약 테스트 확장 | 기존 8앱은 공통 `scripts/app-build-version.cjs`를 사용하고 내부 채팅 wrapper도 이미 이를 호출 | 내부 채팅은 renderer의 버전 UI와 `/app/version`이 아직 없어 “사용자 화면까지 통일 완료”라고 하면 안 됨 |
| updater 없는 내부 채팅에 **비활성 골격** 추가 | 기존 두 Electron 앱의 main/preload/renderer 경계를 재사용할 수 있음 | 첫 슬라이스 권장 범위는 아님. feed 없는 boot-time check를 활성화하면 오류를 새로 만든다. 정책 gate는 PR #1195 뒤가 안전 |
| CI의 `intranet.example` 예상 오류 출력 정리 | fixture 위치와 production 사용자 비공개 동작이 확인됨 | production 로그 정책 변경 없이 test spy/fixture 공통화만 수행 |
| 웹·모바일의 기존 `/app/version` NONE 회귀 테스트 | PR #1195 응답 DTO는 기존 정상 응답 형태를 유지한다 | PR #1195 브랜치에서 이미 backend 테스트가 있으며, 9앱 client contract 테스트는 후속 추가 가능 |

### 결정 없이 할 수 없는 것

- 실제 `publish.url`, S3/local feed 주소, 제품별 prefix/channel 이름 확정.
- 자체 서명 인증서 발급·보관·CI secret 주입, 내부 채팅의 `forceCodeSigning` 값 변경.
- CI에서 signed NSIS, `latest.yml`, blockmap을 만들어 게시·승격하는 release job.
- 실제 installer `available → download → quitAndInstall → 재기동` E2E.
- Expo production project/channel과 signed native/OTA 배포.

## 6. 첫 슬라이스 선택지와 권고

### A. 9앱 계약 기준선 — 권고

범위:

1. `INTERNAL_CHAT_DESKTOP` 서버 식별자·Flyway constraint·admin 표시·계약 테스트 추가.
2. Electron 공통 release/version 테스트의 대상을 2앱에서 3앱으로 확장하고, 내부 채팅 NSIS 표시 버전을 날짜형으로 맞춤.
3. 내부 채팅 독립 source CI 추가.
4. 아로로지스 `electron-updater` runtime dependency 정정과 packaged dependency 정적 가드 추가.
5. 예상 updater 오류 fixture가 CI 로그에 그대로 출력되지 않도록 test log capture 정리.

장점은 배포 결정 없이 9번째 앱의 정체성과 빌드 최소 품질을 먼저 고정한다는 점이다. 이후 updater 배선 PR이 URL·서명·channel 논의와 섞이지 않는다.

### B. 내부 채팅 updater 배선부터 추가

main/preload/renderer와 정책 API client를 기존 두 앱처럼 추가할 수는 있다. 하지만 현재 feed 설정이 없고 PR #1195도 아직 OPEN이므로, 활성 배선은 boot-time feed 오류 또는 `/app/version` 404를 만들 수 있다. 비활성 코드만 넣으면 완료 기준이 약하다. **첫 슬라이스로는 권하지 않는다.**

### C. 3 Electron installer CI 통일부터 시작

실제 `build:win`은 두 앱에서 `forceCodeSigning: true`이고 updater manifest에는 feed URL이 필요하다. 내부 채팅은 반대로 서명을 명시적으로 끈 상태다. 이를 “일관되게” 만들려면 바로 보류 중인 서명·피드 결정을 침범한다. **지금은 불가하다.**

## 7. 권고 슬라이스의 완료 정의

다음이 모두 참이면 첫 슬라이스가 끝난다.

1. 서버·migration constraint·admin UI·클라이언트 타입 계약이 사용자 대면 앱 **9개**를 같은 목록으로 인식한다.
2. `INTERNAL_CHAT_DESKTOP`은 published row가 없어도 PR #1195 계약 기준 `200 + NONE`을 받을 수 있다. PR #1195가 아직 머지 전이면 이 항목은 선행 PR 의존성으로 명시하고 runtime 호출은 활성화하지 않는다.
3. 세 Electron release wrapper가 모두 `YYYY/MM/DD-N` 입력을 검증하고, 내부 semver/PE version/NSIS 사용자 표시 버전을 같은 공통 함수로 만든다는 정적 테스트가 통과한다.
4. 아로로지스 packaged 앱의 `electron-updater`가 runtime dependency로 판정된다.
5. 사내 메신저 CI가 typecheck·lint·test·electron-vite build를 필수 통과한다.
6. updater 예상 오류 테스트가 `intranet.example/latest.yml` 원문을 사용자 UI와 일반 CI 로그에 노출하지 않는다.
7. `DESKTOP_UPDATE_URL`, `AROLOGIS_UPDATE_URL`, 신규 feed URL, `channel`, `forceCodeSigning`, 인증서/secret에는 변경이 없다.
8. installer/feed E2E를 했다고 주장하지 않는다. 이 슬라이스의 산출물은 **정체성·버전·runtime dependency·source CI 기준선**이다.

## 8. 모르는 것

- 제공된 CI 한 줄이 어느 Actions run과 step에서 출력됐는지. 문자열이 같은 fixture는 전수 확인했지만 로그 URL이 없어 단일 발원 테스트는 확정하지 못했다.
- 실제 `DESKTOP_UPDATE_URL`·`AROLOGIS_UPDATE_URL` 값과 향후 내부 채팅 feed 환경변수명/경로.
- 자체 서명 인증서가 저장소 밖에 이미 존재하는지, 누가 보관하는지.
- 사내 메신저를 updater 트랙에 편입하는 별도 D-결정 번호. 이번 요청과 9앱 분모는 편입을 전제로 하지만 `DECISIONS.md`의 D-910-01은 아직 기존 8개만 기록한다.
- 아로로지스 현재 NSIS에 devDependency의 `electron-updater`가 우연히 포함되는지. 실제 packaged installer가 없어 확인하지 못했다.
- Expo 세 앱의 실제 EAS project와 signing credential 존재 여부. 저장소 기본값은 placeholder다.

추정으로 채우지 않았다.

## 9. 라운드 종료 점검

삭제된 추적 파일은 0개이며 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 존재하고 git 추적 상태다. 이 worktree 경로를 command line에 포함한 임시 Node/Java/Electron/Chrome/Edge/Playwright 프로세스는 0개다.
