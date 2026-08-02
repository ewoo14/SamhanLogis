# PR #993 (#910) 날짜 버전 후속 릴리스 자동 업데이트 감지 fix

- 작성일: 2026-07-30 KST
- 대상 브랜치: `feat/910-client-version-policy`
- 작업 기준 HEAD: `65d96e8c9`
- 대상 결함: `docs/dev-reports/2026-07-30-910-sol-review.md` 결함 1
- 작업 원칙: 정책 서버 계약과 renderer 정책 판정은 유지하고, Electron 패키지/update-feed 비교 축만 보완

## 원인

기존 진단을 그대로 인용한다.

> release wrapper의 공통 환경 생성기는 날짜 버전을 `VITE_APP_VERSION`과 파일명용
> `SAMHAN_RELEASE_ARTIFACT_VERSION`에만 넣는다. electron-updater가 비교하는 package semver는
> 고정이라 `update-not-available`로 끝난다.

> 보존된 슬2 실제 `app.asar`의 실측은 다음과 같다.

```text
DESKTOP            renderer currentVersion = 2026/07/30-2   packaged package version = 0.1.0
AROLOGIS_DESKTOP   renderer currentVersion = 2026/07/30-3   packaged package version = 1.0.0
```

따라서 정책 서버는 날짜 버전으로 `CRITICAL` 차단을 할 수 있지만, 기존 Electron 설치본과
feed의 고정 semver가 같아 updater가 새 설치본을 감지하지 못했다.

## RED-first

수정 전에 `scripts/app-build-version.test.cjs`에 날짜 버전 후속 릴리스의 Electron 비교 버전
계약을 추가하고 실행했다.

명령:

```text
node --test scripts/app-build-version.test.cjs
```

RED 원문:

```text
✔ 무주입 개발·CI 빌드는 릴리스가 아닌 고정 sentinel을 사용한다 (1.3153ms)
✔ 릴리스 모드의 무주입 빌드는 호스트 날짜와 무관하게 실패한다 (0.8678ms)
✔ production·preview 빌드도 릴리스 주입 없이 sentinel을 사용하지 않는다 (0.2667ms)
✔ 명시 주입 릴리스는 개발 형식 버전을 그대로 사용한다 (0.2554ms)
✔ 데스크톱 릴리스 wrapper는 검증된 버전과 릴리스 모드를 하위 빌드에 전달한다 (0.2159ms)
✖ 날짜 버전만 올라간 후속 릴리스도 Electron updater 비교 버전이 올라간다 (1.1117ms)
ℹ tests 6
ℹ pass 5
ℹ fail 1

AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected

+ undefined
- '20260730.2.0'

at scripts/app-build-version.test.cjs:75:10
```

RED는 wrapper 결과에 내부 package 비교 버전이 없음을 재현했다.

## 수정

1. `scripts/app-build-version.cjs`에 날짜 버전의 내부 semver 변환을 추가했다.
   `YYYY/MM/DD-N`은 `YYYYMMDD.N.0`으로 변환한다. 예를 들어 `2026/07/30-2`는
   `20260730.2.0`이다. 날짜는 major, 당일 순번은 minor에 넣어 날짜와 같은 날의 후속
   릴리스 모두 semver 순서로 구분한다.
2. release wrapper가 `SAMHAN_RELEASE_PACKAGE_VERSION`을 두 Electron builder 하위 프로세스에
   전달하고, 두 `electron-builder.yml`의 `extraMetadata.version`으로 포장 대상
   `package.json`에 주입하게 했다. `latest.yml`, `app.getVersion()`의 비교 축도 이 값이 된다.
3. DESKTOP 직접 포장 검증기가 renderer 날짜 버전에서 파생한 package semver와 환경값이
   일치하는지 확인하게 했다.
4. 두 main updater는 `UpdateInfo.version`의 내부 semver를 IPC 상태에 그대로 노출하지 않고
   `YYYY/MM/DD-N`으로 되돌린다. 따라서 renderer의 기존 버전 표시와 정책 서버 query는
   계속 날짜 버전을 사용한다.
5. 두 updater의 `allowDowngrade = false`, 개발 모드의 `not-available` 및
   `INSTALL_CHANNEL` 경로는 유지했다. `electron-updater`는 기존과 동일하게 default import
   구조를 사용한다.

## GREEN

공통 버전·builder 계약:

```text
node --test scripts/app-build-version.test.cjs
✔ 7 tests
ℹ pass 7
ℹ fail 0
```

실행한 대체 비교 probe:

```text
{"current":"20260730.2.0","feed":"20260730.3.0","updateAvailable":true,"critical":{"canContinue":false,"updatePathAvailable":true}}
```

두 updater의 내부 semver 수신과 사용자 표기 복원:

```text
DESKTOP       src/main/auto-update.test.ts       6 tests passed
AROLOGIS      src/main/auto-update.test.ts       5 tests passed
```

두 테스트 모두 `UpdateInfo.version = 20260730.3.0`을 주입했을 때 renderer IPC 상태가
`2026/07/30-3`이 되는 것과 update-available → download, update-downloaded → install
경로를 확인했다.

정책·renderer 회귀:

```text
DESKTOP version/policy/gate/updater tests: 34 tests passed
AROLOGIS version/gate/updater tests:       11 tests passed
DESKTOP desktopUpdatePolicy date fixture:  6 tests passed
```

## 불변식별 확인

| 불변식 | 확인 내용 | 판정 및 한계 |
|---|---|---|
| 1. 날짜 버전 후속 릴리스 자동 감지 | 실제 설치된 `semver`로 `20260730.2.0 → 20260730.3.0`을 비교했고 `updateAvailable:true`를 얻었다. 두 builder 모두 `extraMetadata.version`에 공통 env를 연결했다. | 코드·semver 실행 대체 증명은 PASS. 실제 `latest.yml`을 HTTP로 받고 `electron-updater.isUpdateAvailable()`를 packaged 앱에서 실행한 증명은 installer 제한으로 미실행이다. |
| 2. CRITICAL 사용자 업데이트 경로 | probe에서 `critical.canContinue:false`와 `updatePathAvailable:true`가 나왔다. 두 updater 테스트에서 available 다운로드와 downloaded 설치 위임을 실행했고, DESKTOP 정책 테스트는 날짜 버전 downloaded 상태에서도 `canContinue:false`를 유지했다. | 클라이언트 상태·IPC 결합 대체 증명은 PASS. 실제 운영 정책 record와 실제 feed 다운로드·설치는 미실행이다. |
| 3. 화면 표기는 날짜 버전 | 두 main updater가 내부 semver를 `2026/07/30-3`으로 복원하는 테스트가 통과했다. renderer `CURRENT_VERSION`, 정책 API query, 기존 `latestVersion` 표면은 수정하지 않았다. | 소스/단위 실행 PASS. 실제 Windows 화면 캡처는 installer 미생성으로 하지 않았다. |
| 4. 다운그레이드 금지 | 두 updater mock에 `allowDowngrade`를 true로 시작시킨 뒤 등록 후 false인지 양쪽 테스트에서 확인했다. source assignment도 유지했다. | PASS. 실제 feed의 역순 게시를 운영 환경에서 실행하지 않았다. |
| 5. 두 앱 동일 성질 | DESKTOP·AROLOGIS 각각 builder env 연결, package semver 생성 공통 wrapper, updater decode, download/install 테스트를 확인했다. | 두 앱 소스/단위 실행 PASS. 실제 두 installer 설치는 미실행이다. |
| 6. 같은 날짜 여러 릴리스 구분 | 공통 테스트에서 `2026/07/30-2 → 20260730.2.0`, `2026/07/30-3 → 20260730.3.0`을 각각 확인하고 semver 증가를 실행 검증했다. 다음 날 `20260731.1.0`도 증가한다. | PASS. 실제 feed 파일 생성은 미실행이다. |
| 7. 개발 모드 배너 제거·INSTALL_CHANNEL 유지 | 두 updater의 비패키징 check/install 테스트가 모두 통과했고, `INSTALL_CHANNEL`과 `if (!app.isPackaged)` 분기를 변경하지 않았다. | PASS. 개발 Electron 창 재기동 캡처는 이번 범위에서 재실행하지 않았다. |
| 8. renderer 표시·정책 판정 유지 | `desktopUpdatePolicy`의 `NONE/MINOR/MAJOR/CRITICAL` 6개 테스트, DESKTOP gate 16개, AROLOGIS gate 2개 및 version tests가 통과했다. 정책 구현 파일 자체는 변경하지 않았다. | PASS. 테스트 fixture의 downloaded version만 날짜 표기로 갱신했다. |

## installer를 만들 수 없었던 항목과 대체 증명의 한계

사용자 지시대로 `build:win`은 실행하지 않았다. 이 PC에서는 이미 `winCodeSign` 심볼릭 링크
권한 오류로 해당 패키징이 실패하는 것이 확인되어 있다. 따라서 다음을 주장하지 않는다.

- 새 NSIS/portable installer가 실제로 생성됐다는 것
- 새 `app.asar`의 `package.json.version`이 내부 semver가 됐다는 것
- 실제 `latest.yml.version`이 내부 semver로 게시됐다는 것
- clean Windows에서 설치 후 `app.getVersion()`과 feed 비교가 연결됐다는 것
- 코드서명, blockmap, `quitAndInstall`, 재기동까지 성공했다는 것

대신 실제 실행 가능한 범위에서 공통 wrapper의 변환값, 두 builder의 `extraMetadata` 계약,
설치된 semver 비교, 두 main updater의 상태 전이와 표기 복원을 검증했다. 이 결과는
전자 패키징 자체의 증명이 아니라 그 패키징 단계에 입력되는 계약과 updater 로직의
대체 증명이다. 실제 installer/feed 도달성은 CI 또는 권한이 있는 Windows 패키징 환경에서
추가 확인해야 한다.

추가 검증:

- AROLOGIS `npm run typecheck`: 성공.
- DESKTOP 일반 `npm run typecheck`: 244초 실행 제한에 걸려 종료 코드 124였고 오류 원문은 없었다.
- DESKTOP `REAL_QA_SKIP_FRESHNESS_CHECK=1 npm run typecheck`: 성공, real-QA 보조 테스트 50/50 통과.
  이 실행은 로컬 파생물 신선도 확인만 건너뛰었으므로 해당 신선도 검증은 별도 CI 책임이다.
- Docker, Gradle, `build:win`은 실행하지 않았다.

## 변경 파일

`git diff --numstat` 기준이다. 합산 수치가 아니라 파일별 수치로 기록한다.

- `clients/arologis-desktop/electron-builder.yml` `+4/-0`
- `clients/arologis-desktop/src/main/auto-update.test.ts` `+4/-3`
- `clients/arologis-desktop/src/main/auto-update.ts` `+10/-2`
- `clients/desktop/electron-builder.yml` `+5/-0`
- `clients/desktop/scripts/validate-desktop-release.cjs` `+9/-1`
- `clients/desktop/src/main/auto-update.test.ts` `+6/-4`
- `clients/desktop/src/main/auto-update.ts` `+10/-2`
- `clients/desktop/src/renderer/version/desktopUpdatePolicy.test.ts` `+2/-2`
- `scripts/app-build-version.cjs` `+20/-1`
- `scripts/app-build-version.test.cjs` `+58/-0`

신규 파일:

- `docs/dev-reports/2026-07-30-910-date-version-update-detection.md` `+171/-0` (본 보고서; git add 전이라 `git diff --numstat`에는 나타나지 않음)

## 2026-07-30 후속 fix — 개발책임자 지시 형식으로 semver 재사상

### 개발책임자 지시

> "semver 버전은 그러면 **`1.YYYYMMDD.N`** 으로 진행요청."

직전 라운드의 `YYYYMMDD.N.0` 사상은 날짜와 당일 순번을 내부 semver로 비교하는 목적은
달성했지만, 이번 지시의 major/minor/patch 배치와 달랐다. 이번 fix는 공통 생성기와 두
데스크톱 updater의 내부 표현을 함께 변경했다. renderer, 정책 서버 계약, updater IPC의
사용자 표시 값은 변경하지 않았다.

| 입력 날짜 버전 | 변경 전 내부 semver | 변경 후 내부 semver |
|---|---|---|
| `2026/07/30-2` | `20260730.2.0` | `1.20260730.2` |
| `2026/07/30-3` | `20260730.3.0` | `1.20260730.3` |
| `2026/07/31-1` | `20260731.1.0` | `1.20260731.1` |

생성기 본체는 루트 `scripts/app-build-version.cjs`의 `resolveReleasePackageVersion`이며,
DESKTOP과 AROLOGIS_DESKTOP은 동일한 `createReleaseBuildEnvironment`를 사용한다. 두
`electron-builder.yml`의 `extraMetadata.version` 계약은 계속
`SAMHAN_RELEASE_PACKAGE_VERSION`을 주입한다.

### RED-first 원문

테스트 기대값을 먼저 `1.YYYYMMDD.N`으로 바꾸고, 구현을 바꾸기 전에 실행했다.

```text
✖ 데스크톱 릴리스 wrapper는 검증된 버전과 릴리스 모드를 하위 빌드에 전달한다
✖ 날짜 버전만 올라간 후속 릴리스도 Electron updater 비교 버전이 올라간다
✖ 날짜 semver는 같은 날 9→10과 월·연 경계에서도 단조 증가한다
✖ 같은 날짜·순번 입력은 같은 내부 semver를 만든다
ℹ tests 9
ℹ pass 5
ℹ fail 4

AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected

+ '20260725.91003.0'
- '1.20260725.91003'
```

후속 릴리스 실패도 동일하게 실제 `20260730.2.0`, 기대 `1.20260730.2`로 확인됐고,
경계 테스트는 실제 배열 전체가 `20260730.*.0`으로 생성되는 원문을 남겼다. 따라서
테스트가 기존 구현의 낡은 기대값 때문에 통과한 것이 아님을 확인했다.

### fix 및 GREEN 원문

- `scripts/app-build-version.cjs`: `1.${YYYYMMDD}.${N}` 반환으로 변경했다.
- `clients/desktop/src/main/auto-update.ts`와
  `clients/arologis-desktop/src/main/auto-update.ts`: 새 내부 semver를
  `YYYY/MM/DD-N`으로 되돌리는 정규식을 변경했다.
- 두 updater 테스트의 `UpdateInfo.version` fixture를 새 내부 semver로 갱신했다.
- 기존 `allowDowngrade = false`, `INSTALL_CHANNEL`, 개발 모드 분기, 정책 서버 계약,
  electron-updater CJS default import는 변경하지 않았다.

```text
✔ tests 9
✔ pass 9
ℹ fail 0
```

```text
DESKTOP       src/main/auto-update.test.ts                    6 tests passed
AROLOGIS      src/main/auto-update.test.ts                    5 tests passed
DESKTOP       정책·게이트·versionCheck 대상                    28 tests passed
AROLOGIS      게이트·versionCheck 대상                          6 tests passed
```

### 단조성 및 실제 semver probe

생성기 회귀 테스트에 다음 전 구간을 고정했다. 특히 문자열 비교라면 깨지는 같은 날
`9 → 10`, 월 경계, 연 경계를 모두 포함한다.

```text
1.20260730.1 < 1.20260730.2 < 1.20260730.9 < 1.20260730.10
             < 1.20260731.1 < 1.20260801.1 < 1.20261231.9 < 1.20270101.1
```

```text
node --test scripts/app-build-version.test.cjs
✔ tests 9
✔ pass 9
ℹ fail 0
```

설치된 `semver` 라이브러리로 같은 배열을 다시 비교한 원문이다.

```text
{"versions":["1.20260730.1","1.20260730.2","1.20260730.9","1.20260730.10","1.20260731.1","1.20260801.1","1.20261231.9","1.20270101.1"],"valid":true,"monotonic":true}
```

직전 probe와 동일한 후속 릴리스 비교도 새 형식으로 재실행했다.

```text
{"current":"1.20260730.2","feed":"1.20260730.3","currentValid":true,"feedValid":true,"updateAvailable":true,"allowDowngrade":false}
```

즉, 날짜 버전이 올라간 feed는 `update-not-available`로 끝나지 않고 semver 비교상
업데이트로 감지된다. 실제 packaged installer/feed/Windows 설치 실행은 이번에도
`build:win` 금지 조건 때문에 주장하지 않는다.

### 불변식 8개별 확인

| 불변식 | 이번 fix에서 확인한 것 | 결과 및 한계 |
|---|---|---|
| 1. DESKTOP·AROLOGIS 내부 형식 `1.YYYYMMDD.N` | 공통 생성기 테스트의 wrapper/env 값, 양쪽 builder `extraMetadata.version` 계약, 실제 생성값 probe를 확인했다. | PASS. 실제 installer의 `package.json`은 패키징 금지로 미확인이다. |
| 2. 날짜 상승 릴리스 자동 업데이트 감지 | 실제 `semver.valid`와 `semver.gt`로 `1.20260730.2 → 1.20260730.3`을 비교했고 `updateAvailable:true`를 확인했다. | PASS인 코드·라이브러리 비교 증명. 실제 HTTP feed와 packaged `electron-updater` 실행은 미실행이다. |
| 3. 사용자 표기 `YYYY/MM/DD-N` 유지 | 양쪽 main updater의 새 정규식과 DESKTOP updater 상태 테스트에서 내부 `1.20260730.3`을 `2026/07/30-3`으로 IPC에 보냈음을 확인했다. renderer 버전·정책 query는 변경하지 않았다. | PASS. 실제 Windows 화면 캡처는 installer 미생성으로 미실행이다. |
| 4. 전 구간 단조 증가 | 생성기 테스트와 설치된 `semver` probe가 같은 날 `9→10`, 월 경계, 연 경계의 전체 배열을 검증했다. | PASS. 동일 입력 멱등성 테스트도 포함했다. |
| 5. 다운그레이드 금지 | DESKTOP·AROLOGIS updater 테스트에서 초기 mock 값을 true로 두고 등록 후 `allowDowngrade === false`를 확인했다. | PASS. 역순 운영 feed 실험은 미실행이다. |
| 6. 직전 fix 유지 | 개발 모드 check/install 분기와 `INSTALL_CHANNEL`, 정책 `NONE/MINOR/MAJOR/CRITICAL`, 화면 게이트·versionCheck, CJS default import를 소스 diff와 대상 테스트로 확인했다. | PASS. 정책 서버 계약은 수정하지 않았다. |
| 7. 유효 semver | 실제 `semver.valid`가 전체 경계 배열과 후속 feed 모두 true를 반환했고, 두 builder가 공통 package semver env를 받는 계약 테스트가 통과했다. | PASS. electron-builder 패키징 자체는 미실행이다. |
| 8. 멱등성 | 동일 `2026/07/30-10` 입력 2회가 모두 `1.20260730.10`을 반환하는 생성기 테스트를 추가해 통과시켰다. | PASS. |

### 타입검증 및 실행 제한

- AROLOGIS `npm run typecheck`: 종료 코드 0.
- DESKTOP `npm run typecheck`: 303.3초 제한으로 종료 코드 124. `real-qa-scope.test.cjs`가
  별도 실행에서도 출력 없이 같은 timeout을 보였으며, TypeScript 오류 원문은 없었다.
- DESKTOP 원시 타입검증 `npx tsc -p tsconfig.node.json --noEmit`: 종료 코드 0.
- DESKTOP 원시 타입검증 `npx tsc -p tsconfig.web.json --noEmit`: 종료 코드 0.
- DESKTOP `node scripts/real-qa-scope.cjs --phase=typecheck`: freshness 확인 종료 코드 0.
- DESKTOP `node --test scripts/real-qa-cleanup-scope.test.cjs`: 2/2 통과.
- Docker, Gradle, `build:win`, 정책 서버 변경은 수행하지 않았다.

따라서 이 후속 fix의 변경 코드에 대한 TypeScript 컴파일은 PASS지만, desktop의 전체
`npm run typecheck` 게이트는 기존 real-QA 보조 테스트 timeout으로 완료되지 않은 상태다.

## 2026-07-30 결함 1 fix — electron-builder extraMetadata semver 명시 주입

### 원인과 수정

electron-builder 25.1.8의 YAML config loader는 `extraMetadata.version` 안의
`${env.SAMHAN_RELEASE_PACKAGE_VERSION}`를 환경값으로 치환하지 않는다. 따라서 기존
설정은 transformer에 리터럴을 전달했고, Windows 버전 해석 전에 포장이 중단됐다.

이번 fix는 결함 1만 다뤘다. 결함 2의 구 설치본 첫 업데이트 표기 문제, 정책 서버 계약,
`CURRENT-WORK.md`는 건드리지 않았다.

- `scripts/app-build-version.cjs`에 `createElectronBuilderVersionArgs`를 추가했다.
  `1.YYYYMMDD.N`만 허용하고 빈 값, env 리터럴, 직전 형식은 오류로 거부한다.
- 두 release wrapper가 electron-builder에
  `--config.extraMetadata.version=<실제 semver>`를 전달한다.
- 두 `electron-builder.yml`에서 치환되지 않는 env 리터럴을 제거했다.

### RED-first 원문

수정 전 새 transformer 회귀 테스트를 먼저 실행했다.

```text
  • loaded configuration  file=D:\dev\Samhan-Public\.claude\worktrees\w993-version\clients\desktop\electron-builder.yml
✖ 두 릴리스 wrapper가 실제 package semver를 builder transformer에 전달한다

AssertionError [ERR_ASSERTION]: clients/desktop
+ actual - expected

+ '${env.SAMHAN_RELEASE_PACKAGE_VERSION}'
- '1.20260730.2'

ℹ tests 10
ℹ pass 9
ℹ fail 1
```

### GREEN 원문 및 실제 포장 버전 단계

수정 후 공통 생성기·두 실제 `app-builder-lib` transformer 계약 테스트는 다음과 같다.

```text
✔ tests 11
✔ pass 11
ℹ fail 0
```

전체 Windows 포장을 실행하지 않고, 실제 release version resolver → electron-builder
CLI parser → app-builder-lib config/transformer까지만 실행한 원문이다.

```text
[version-stage] appVersion=2026/07/30-2
[version-stage] SAMHAN_RELEASE_PACKAGE_VERSION=1.20260730.2
[version-stage] builderArg=--config.extraMetadata.version=1.20260730.2
[version-stage] clients/desktop/package.json.version=1.20260730.2
[version-stage] clients/arologis-desktop/package.json.version=1.20260730.2
[builder-cli-parse] config.extraMetadata.version=1.20260730.2
```

위 `package.json.version`은 각 앱의 실제 `app-builder-lib` transformer가 포장 대상
`package.json`에 반환한 값이다. 따라서 env 리터럴이 남지 않고 두 앱 모두
`1.20260730.2`가 들어가는 것을 실행으로 확인했다.

### 7개 불변식 확인

| 불변식 | 확인 방법 | 결과 및 한계 |
|---|---|---|
| 1. 포장본 version은 실제 `1.YYYYMMDD.N` | 두 앱의 실제 builder CLI parser와 `app-builder-lib` transformer를 실행해 `package.json.version`을 출력했다. | PASS: 두 값 모두 `1.20260730.2`. installer/app.asar/latest.yml 자체는 `build:win` 금지로 미생성. |
| 2. 표시는 `YYYY/MM/DD-N` | 이번 변경의 diff에 main updater·renderer·updater IPC 파일이 없고, 기존 역변환·표시 코드를 읽어 변경하지 않았음을 확인했다. | PASS 유지. 실제 Windows 화면은 미실행. |
| 3. 날짜 상승 릴리스 자동 감지 | 공통 생성기 기존 후속 릴리스 테스트와 실제 builder 주입으로 feed 비교축이 `1.20260730.2`가 됨을 확인했다. | PASS인 코드 경로. 실제 HTTP feed/설치 updater는 미실행. |
| 4. 단조 증가·멱등성 | `node --test scripts/app-build-version.test.cjs`의 `9→10`, 월·연 경계, 동일 입력 테스트를 실행했다. | PASS, 전체 11/11. |
| 5. `allowDowngrade=false` | updater 파일·설정 diff에 변경이 없고 기존 updater 계약을 대조했다. | PASS 유지. 실제 feed 역순 실행은 미실행. |
| 6. 직전 fix 유지 | 개발 모드 배너/`INSTALL_CHANNEL`, `NONE/MINOR/MAJOR/CRITICAL`, 슬1, 정책 IPC, electron-updater 런타임 default import 파일이 이번 diff에 없음을 확인했다. | PASS 유지. 정책 서버는 수정하지 않음. |
| 7. 환경변수 부재 fail-fast | release mode 무주입 테스트와 새 helper의 빈 값/env 리터럴/직전 형식 거부 테스트를 실행했다. | PASS: 잘못된 값으로 조용히 포장하지 않음. |

### 실행 범위와 미실행 범위

- 실행: RED 재현, GREEN `node --test scripts/app-build-version.test.cjs` 11/11, 두 앱의
  실제 transformer version-stage, electron-builder CLI parser, AROLOGIS
  `npm run typecheck` 종료 코드 0.
- DESKTOP `npm run typecheck`는 180초 제한에서 종료 코드 124였다. `node
  scripts/real-qa-scope.cjs --phase=typecheck`, `npm exec -- tsc -p tsconfig.node.json
  --noEmit`, `npm exec -- tsc -p tsconfig.web.json --noEmit`는 각각 종료 코드 0이나
  `real-qa-scope.test.cjs` 전체 하네스는 별도 실행에서도 출력 없이 대기했다.
- 미실행: 전체 `build:win`, installer, `app.asar`, `latest.yml`, blockmap, 코드서명 및
  `winCodeSign` 단계. 그러므로 실제 Windows 패키징 완주를 주장하지 않는다.
- Docker, Gradle, 정책 서버 계약 변경, 결함 2 수정은 수행하지 않았다.

## 2026-07-30 CI red fix — 데스크톱 의존성 없는 App Build Version Guard

### 원인 판정

PR #993의 `App Build Version Guard` 잡은 checkout과 Node 20만 준비하고 `npm ci` 없이
루트 `node --test scripts/app-build-version.test.cjs`를 실행한다. 그런데 기존 10번
테스트가 두 앱의 `node_modules/app-builder-lib/out/...` private 파일을 직접 `require`해
실제 transformer를 실행했다. 따라서 로컬처럼 데스크톱 의존성이 설치된 환경에서는
통과하지만, 이 잡에서는 `MODULE_NOT_FOUND`로 테스트 본문에 도달하기 전에 실패했다.

### fix

`scripts/app-build-version.test.cjs`의 테스트는 이제 private `app-builder-lib` 파일을
요구하지 않는다. 대신 다음 경계를 실제로 실행해 검증한다.

1. DESKTOP·AROLOGIS_DESKTOP 릴리스 wrapper를 실제로 `require`한다.
2. renderer 산출물 확인만 메모리 fixture로 대체하고, wrapper의 실제 `spawnSync`를
   캡처한다.
3. 두 builder 호출이 `--win` 다음에
   `--config.extraMetadata.version=1.20260730.2`를 전달하는지 확인한다.
4. 같은 호출 환경의 `SAMHAN_RELEASE_PACKAGE_VERSION`도 `1.20260730.2`인지 확인한다.

따라서 wrapper에서 CLI override를 제거하거나 다른 semver를 전달하면 builder 호출
assertion이 실패한다. 두 `electron-builder.yml`의 env 리터럴 검사와 잘못된 semver
fail-fast 검사는 그대로 남겼다. production 파일과 `YYYY/MM/DD-N` 표시, 단조 증가·
멱등성, `allowDowngrade=false`, 개발 모드 배너 제거·정책 게이트·슬1은 변경하지 않았다.

### CI 조건 재현

이 worktree 자체에는 두 데스크톱 의존성이 설치되어 있었다.

```text
clients/desktop/node_modules/app-builder-lib: True
clients/arologis-desktop/node_modules/app-builder-lib: True
```

따라서 원래 worktree를 의존성 미설치 상태로 훼손하지 않고, 임시 dependency-free
fixture를 만들었다. 루트 `scripts/`의 테스트·버전 생성기·두 release wrapper와 두
`electron-builder.yml`만 임시 fixture에 복사하고 `node_modules`는 만들지 않은 뒤,
CI와 같은 `node --test scripts/app-build-version.test.cjs`를 실행했다. 실행 전 두
앱의 `app-builder-lib` 경로가 모두 `False`임을 확인했고, 테스트 뒤 임시 fixture를
삭제했다.

로컬 실행 Node는 `v24.14.1`이었다. CI workflow가 설치하는 Node 20 바이너리는 이
PC에 별도로 없어 Node 런타임까지 완전히 동일하게 재현하지는 못했다. 다만 테스트가
사용하는 `node:test`, `fs`, `child_process`, `path`, `String.replaceAll`, `Array.at`은
Node 20에서 지원되는 built-in API이고, 데스크톱 의존성 미설치 조건과 CI의 테스트
명령은 동일하게 재현했다.

GREEN 원문:

```text
CI fixture root: C:\Users\ewoo2\AppData\Local\Temp\samhan-app-build-version-ci-1efedfb61c8c4359b983c21e815fbf9a
clients/desktop/node_modules/app-builder-lib present: False
clients/arologis-desktop/node_modules/app-builder-lib present: False
[release-build] VITE_APP_VERSION=2026/07/30-2
[arologis-release] VITE_APP_VERSION=2026/07/30-2
[arologis-release] renderer 버전 주입 확인: 2026/07/30-2
✔ 무주입 개발·CI 빌드는 릴리스가 아닌 고정 sentinel을 사용한다 (1.2575ms)
✔ 릴리스 모드의 무주입 빌드는 호스트 날짜와 무관하게 실패한다 (0.502ms)
✔ production·preview 빌드도 릴리스 주입 없이 sentinel을 사용하지 않는다 (0.2872ms)
✔ 명시 주입 릴리스는 개발 형식 버전을 그대로 사용한다 (0.239ms)
✔ 데스크톱 릴리스 wrapper는 검증된 버전과 릴리스 모드를 하위 빌드에 전달한다 (1.2755ms)
✔ 날짜 버전만 올라간 후속 릴리스도 Electron updater 비교 버전이 올라간다 (0.3964ms)
✔ 날짜 semver는 같은 날 9→10과 월·연 경계에서도 단조 증가한다 (1.3318ms)
✔ 같은 날짜·순번 입력은 같은 내부 semver를 만든다 (0.1984ms)
✔ 두 Electron builder 설정에 env 리터럴 버전이 남지 않는다 (1.8459ms)
✔ 두 릴리스 wrapper가 실제 package semver를 builder CLI transformer 입력으로 전달한다 (5.609ms)
✔ electron-builder package semver가 없거나 env 리터럴이면 조용히 진행하지 않는다 (0.3777ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 716.6574
```

이 재현은 CI 잡의 데스크톱 의존성 설치 조건과 테스트 실행 명령은 정확히 재현하지만,
Node 20 자체는 실행하지 못했다. 따라서 CI 통과 판단은 Node 24의 dependency-free
fixture GREEN, Node 20에서 지원되는 built-in API만 사용하는 코드 경로, 그리고
`.github/workflows/ci.yml`의 실제 잡 명세를 근거로 한다. Node 20 runner 자체의
실행 결과라고 주장하지 않는다. 또한 `app-builder-lib` 자체가 없는 조건이므로
private transformer 구현을 실행한 증명은 아니다. 이 guard가 책임지는 wrapper→builder
CLI 인자 전달은 실제 wrapper 실행과 캡처된 builder 호출로 검증했고, 실제
transformer/package.json 변환은 데스크톱 의존성이 설치된 별도 패키징 검증 범위로
남긴다.

### 이번 fix 변경 파일

`git diff --numstat` 기준:

- `scripts/app-build-version.test.cjs`: `+87/-25`
- `docs/dev-reports/2026-07-30-910-date-version-update-detection.md`: `+96/-0`
