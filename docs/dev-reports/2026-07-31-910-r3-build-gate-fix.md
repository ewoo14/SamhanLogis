# PR #993 / Issue #910 r3 빌드 게이트·클라이언트 버전 정책 수정 보고서

작성일: 2026-07-31
작업 위치: `C:\dev\Samhan-Public\.claude\worktrees\t910`
범위: Windows 데스크톱 Samhan Public·아로로지스만

## 1단계 — 실제 NSIS 빌드 게이트

### 판정

검증용 우회 구성에서 양쪽 NSIS 컴파일이 종료코드 0으로 완료되었고, 양쪽 모두 NSIS installer 1개가 실제 생성되었습니다. 따라서 **1단계의 산출물 생성 게이트는 통과**했습니다.

단, 기본 저장소 구성의 `npm run build:win`은 이 Windows 환경의 `winCodeSign` 심볼릭 링크 권한 문제로 종료코드 1입니다. 실제 산출물 생성에는 임시 electron-builder 캐시와 다음 두 검증용 CLI override를 사용했습니다.

- `--config.forceCodeSigning=false`
- `--config.win.signAndEditExecutable=false`

저장소의 `forceCodeSigning: true`는 변경하지 않았습니다. 그러므로 아래 산출물은 NSIS 컴파일·설치명 실측용이며, 서명 및 앱 EXE 리소스 편집까지 수행한 배포용 GREEN 산출물이 아닙니다.

### 생성된 NSIS installer

| 앱 | NSIS installer 개수 | 실제 경로 | 파일 크기 |
|---|---:|---|---:|
| Samhan Public | 1 | `clients/desktop/release/2026-07-31-1/Samhan Public-2026-07-31-1-x64.exe` | 85,801,389 bytes |
| 아로로지스 | 1 | `clients/arologis-desktop/release/2026-07-31-1/Arologis Desktop-2026-07-31-1-x64.exe` | 85,211,519 bytes |

두 빌드 모두 portable 산출물도 함께 생성되었습니다. 이번 게이트의 installer 개수는 NSIS 기준으로 앱별 1개입니다.

### 실패 재현 원문

실행 명령:

```powershell
$env:VITE_APP_VERSION='2026/07/31-1'
$env:SAMHAN_RELEASE_ARTIFACT_VERSION='2026-07-31-1'
$env:DESKTOP_UPDATE_URL='https://updates.invalid/samhan'
npm run build:win
```

종료코드: **1**

핵심 원문:

```text
cannot execute cause=exit status 2
ERROR: Cannot create symbolic link : 클라이언트가 필요한 권한을 가지고 있지 않습니다. :
C:\Users\user\AppData\Local\electron-builder\Cache\winCodeSign\<임시폴더>\darwin\10.12\lib\libcrypto.dylib
ERROR: Cannot create symbolic link : 클라이언트가 필요한 권한을 가지고 있지 않습니다. :
C:\Users\user\AppData\Local\electron-builder\Cache\winCodeSign\<임시폴더>\darwin\10.12\lib\libssl.dylib
```

이 실패에서는 installer 산출물이 생성되지 않았습니다. 원인은 r2 보고서의 권한 제약과 동일하며, 이번에 실제 재실행해 여전히 남아 있음을 확인했습니다.

### 중복 지시문 RED 및 수정

실행 명령:

```powershell
node --test scripts/app-build-version.test.cjs
```

수정 전 종료코드: **1**. 16개 중 15개 통과, 1개 실패. 실패 원문은 custom NSIS include에 다음 지시문이 남아 있다는 것이었습니다.

```text
VIProductVersion "2026.7.31.1"
VIAddVersionKey /LANG=1042 ProductVersion "2026.7.31.1"
VIAddVersionKey /LANG=1042 FileVersion "2026.7.31.1"
```

electron-builder 25.1.8의 NSIS builder가 이미 `-XVIProductVersion`·`-XVIAddVersionKey`를 주입하므로, include에서 VersionInfo 세 지시문을 제거했습니다. include는 `VERSION` 매크로만 재정의하고 VersionInfo는 builder가 소유하도록 했습니다.

수정 후 같은 명령 종료코드: **0**

```text
tests 16
pass 16
fail 0
```

### 우회 빌드 실행 결과

공통 실행 조건:

```powershell
$env:ELECTRON_BUILDER_CACHE='C:\Users\user\AppData\Local\Temp\samhan-r3-electron-builder-cache\'
$env:VITE_APP_VERSION='2026/07/31-1'
$env:SAMHAN_RELEASE_ARTIFACT_VERSION='2026-07-31-1'
```

wrapper가 호출하는 electron-builder 인자에 위 두 검증용 override를 추가한 inline Node 실행으로 확인했습니다.

- Samhan Public `build-desktop-release.cjs`: **종료코드 0**
- 아로로지스 `build-arologis-desktop-release.cjs`: **종료코드 0**

양쪽 로그에서 `building target=nsis`가 출력되었고 `VIProductVersion already defined`가 재발하지 않았습니다. NSIS와 nsis-resources는 임시 캐시에 내려받아 사용했습니다.

## 2단계 — 생성 산출물 실측

### 결함 1: 설치 앱 이름

두 installer를 별도 임시 경로에 `/S /D=...`로 실제 설치하고 HKCU uninstall registry를 읽었습니다.

| 앱 | installer `ProductName` | 설치 `DisplayName` | 설치 `DisplayVersion` | 설치 명령 종료코드 |
|---|---|---|---|---:|
| Samhan Public | `Samhan Public` | `Samhan Public` | `2026/07/31-1` | 0 |
| 아로로지스 | `Arologis Desktop` | `Arologis Desktop` | `2026/07/31-1` | 0 |

실제 uninstall registry에는 각각 `Uninstall Samhan Public.exe`, `Uninstall Arologis Desktop.exe`가 기록되었습니다. 설치 앱 이름 결함은 이 실측 범위에서 해소되었습니다.

### 결함 3: PE 파일 속성

검증용 override가 `signAndEditExecutable=false`이므로, 다음은 숨기지 않은 실제 값입니다.

installer·portable PE:

| 앱 | ProductName | FileDescription | ProductVersion | FileVersion |
|---|---|---|---|---|
| Samhan Public | `Samhan Public` | `Samhan Public 사내 직원용 데스크톱 앱 (Electron)` | `1.20260731.1` | `1.20260731.1` |
| 아로로지스 | `Arologis Desktop` | `아로로지스 — 배차/기사 관리 전용 Electron 데스크톱 앱 (Samhan Public 분리 독립 운영).` | `1.20260731.1` | `1.20260731.1` |

installer 내부의 실제 `win-unpacked` 앱 EXE:

| 앱 EXE | ProductName | FileDescription | ProductVersion | FileVersion | OriginalFilename |
|---|---|---|---|---|---|
| `Samhan Public.exe` | `Electron` | `Electron` | `33.4.11` | `33.4.11` | `electron.exe` |
| `Arologis Desktop.exe` | `Electron` | `Electron` | `33.4.11` | `33.4.11` | `electron.exe` |

따라서 **PE 앱 EXE 속성은 이번 우회 산출물로 GREEN이라고 판정하지 않습니다.** 소스에는 `shortVersion`·`shortVersionWindows`를 builder에 전달하는 계약이 남아 있지만, 해당 값을 실제 PE에 쓰는 rcedit 단계를 이번 환경에서는 실행하지 못했습니다. 이 결과를 정상 배포 빌드의 PE 검증 통과로 해석해서는 안 됩니다.

## 3단계 — 날짜 불변식 및 알림 재표시

1단계 산출물 생성이 확인된 뒤에만 진행했습니다.

### RED-first

Samhan targeted suite 실행:

```powershell
npx vitest run src/main/auto-update.test.ts src/renderer/components/common/AppVersionGate.test.tsx --reporter=basic
```

수정 전 종료코드: **1**. 29개 중 27개 통과, 2개 실패.

- main이 `1.20261340.1`을 `{ kind: 'available', version: '2026/13/40-1' }`로 전달
- renderer가 `2026/13/40-1`을 사용자 문구에 그대로 표시

아로로지스 targeted suite 같은 명령 종료코드: **1**. 15개 중 12개 통과, 3개 실패.

- main의 동일한 무효 날짜 노출
- renderer의 동일한 무효 날짜 노출
- 알림 닫기 후 후속 `available` 상태가 `app-auto-update-status` 없이 숨겨짐

### 구현

- Samhan·아로로지스 main의 내부 semver 변환에 UTC 날짜 생성 후 연·월·일 왕복 비교를 추가했습니다.
- Samhan·아로로지스 renderer의 사용자 표시 라벨에도 같은 달력 검사를 추가했습니다.
- 아로로지스 `AppVersionGate`에 `updateStatus?.kind` 변경 시 `noticeDismissed`를 초기화하는 effect를 추가했습니다. 같은 상태를 닫은 직후 계속 깜박이지 않으면서, 새 상태 종류는 다시 표시됩니다.
- `2026/13/40-1`은 main에서 빈 version으로 전달되고 renderer에서는 일반 `새 버전을 다운로드하는 중입니다.` 문구만 표시됩니다.

### 정상값·허용 변형·이상값 재계수

| 분류 | 입력 예 | 기대 결과 | 검증 |
|---|---|---|---|
| 정상값 | `1.20260730.3` | `2026/07/30-3` | Samhan·아로로지스 main |
| 허용 변형 | `v1.20260731.1`, 앞뒤 공백이 있는 `1.20260731.1` | `2026/07/31-1` | Samhan·아로로지스 main |
| 이상값 | `1.0.0` | 사용자 표시 version 비공개/빈 값 | 기존 회귀 테스트 |
| 이상값 | `1.20261340.1` | 날짜형 문자열 미전달 | 신규 main 회귀 테스트 |
| 이상값 | renderer `2026/13/40-1` | 일반 라벨만 표시, 원문 날짜 비표시 | 신규 renderer 회귀 테스트 |
| 상태 전이 | `checking` 표시 → 닫기 → `available` | 후속 알림 재표시 | 신규 아로로지스 회귀 테스트 |

### GREEN targeted 결과

Samhan targeted suite 종료코드: **0** — 2 files, 29 tests passed.

아로로지스 targeted suite 종료코드: **0** — 2 files, 15 tests passed.

달력 판정은 Windows API나 로컬 timezone에 의존하지 않고 `YYYY-MM-DDT00:00:00.000Z` 및 `getUTC*` 왕복 비교만 사용합니다. Linux와 같은 UTC ECMAScript 실행 조건 확인 명령도 실행했습니다.

```powershell
$env:TZ='UTC'
node -e "const cases=[['2026-07-31',true],['2026-02-29',false],['2024-02-29',true],['2026-13-40',false]]; for(const [value,expected] of cases){const [year,month,day]=value.split('-').map(Number); const date=new Date(value+'T00:00:00.000Z'); const actual=!Number.isNaN(date.getTime())&&date.getUTCFullYear()===year&&date.getUTCMonth()+1===month&&date.getUTCDate()===day; if(actual!==expected) throw new Error(value+' expected '+expected+' got '+actual)} console.log('UTC 달력 왕복 검증 4건 통과')"
```

종료코드: **0**

## 전체 검증 명령과 종료코드

| 명령 | 결과 |
|---|---:|
| `npm run build` (`clients/desktop`) | 0 |
| `npm run build` (`clients/arologis-desktop`) | 0 |
| `npm test -- --reporter=basic` (`clients/desktop`) | 0 — 186 files, 1,684 tests passed |
| `npm test -- --reporter=basic` (`clients/arologis-desktop`) | 0 — 12 files, 70 tests passed |
| `npm run typecheck` (`clients/desktop`) | 0 |
| `npm run typecheck` (`clients/arologis-desktop`) | 0 |
| `npm run lint` (`clients/desktop`) | 0 — 0 errors, 기존 경고 104개 |
| `npm run lint` (`clients/arologis-desktop`) | 0 |
| `git diff --check` | 0 |

전체 테스트의 stderr에는 기존 updater 오류 원문 비공개 테스트와 React Router/jsdom 경고가 있었지만, 테스트 실패는 없었습니다. lint의 104개 warning은 이번 변경으로 새로 발생한 오류로 판정하지 않았으며 error는 0개입니다.

## 변경 파일

### 수정 파일

- `scripts/app-build-version.cjs`
- `scripts/app-build-version.test.cjs`
- `clients/desktop/src/main/auto-update.ts`
- `clients/desktop/src/main/auto-update.test.ts`
- `clients/desktop/src/renderer/components/common/AppVersionGate.tsx`
- `clients/desktop/src/renderer/components/common/AppVersionGate.test.tsx`
- `clients/arologis-desktop/src/main/auto-update.ts`
- `clients/arologis-desktop/src/main/auto-update.test.ts`
- `clients/arologis-desktop/src/renderer/components/common/AppVersionGate.tsx`
- `clients/arologis-desktop/src/renderer/components/common/AppVersionGate.test.tsx`

### 신규 파일

- `docs/dev-reports/2026-07-31-910-r3-build-gate-fix.md` — 본 보고서

백엔드 서비스·Flyway·Docker·모바일 3종·Capacitor Android·자동 업데이트 피드 서버·코드서명 도입은 변경하지 않았습니다.

## `git status --porcelain` 원문

보고서 작성 후 실행한 원문을 아래에 기록합니다.

```text
 M clients/arologis-desktop/src/main/auto-update.test.ts
 M clients/arologis-desktop/src/main/auto-update.ts
 M clients/arologis-desktop/src/renderer/components/common/AppVersionGate.test.tsx
 M clients/arologis-desktop/src/renderer/components/common/AppVersionGate.tsx
 M clients/desktop/src/main/auto-update.test.ts
 M clients/desktop/src/main/auto-update.ts
 M clients/desktop/src/renderer/components/common/AppVersionGate.test.tsx
 M clients/desktop/src/renderer/components/common/AppVersionGate.tsx
 M scripts/app-build-version.cjs
 M scripts/app-build-version.test.cjs
?? docs/dev-reports/2026-07-31-910-r3-build-gate-fix.md
```

git add/commit/push/checkout/stash는 실행하지 않았습니다.
