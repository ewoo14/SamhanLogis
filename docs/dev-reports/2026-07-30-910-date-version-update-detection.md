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
