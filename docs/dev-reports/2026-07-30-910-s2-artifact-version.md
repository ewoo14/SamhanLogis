# Issue #910 / PR #993 슬라이스 2 — 정식 artifact 버전 실증

작성일: 2026-07-30
기준 커밋: `ff9c8e7da`

## 슬라이스 정의

PR #993 코멘트의 다음 단계 정의를 따른다.

> **정식 release artifact 버전 증명** — `DESKTOP`과 `AROLOGIS_DESKTOP`의 release wrapper가 주입한 `YYYY/MM/DD-N`과 renderer bundle의 `CURRENT_VERSION` 및 서버 query가 같은지 설치 전 증거로 남긴다.

이번 라운드는 다른 6개 클라이언트, 웹/모바일 배포, 코드서명·feed 운영을 다루지 않았다.

## 판정 요약

| identity | release wrapper | renderer bundle | 실제 `app.asar` | installer |
|---|---|---:|---:|---:|
| `DESKTOP` | `2026/07/30-2` 주입·renderer 검증 통과 | 정확한 버전 + `currentVersion` 참조 확인 | 정확한 버전 + `currentVersion` 참조 확인 | 미생성 |
| `AROLOGIS_DESKTOP` | `2026/07/30-3` 주입·renderer 검증 통과 | 정확한 버전 + `currentVersion` 참조 확인 | 정확한 버전 + `currentVersion` 참조 확인 | 미생성 |

**버전 payload 판정: PASS.** 두 release 실행이 실제로 만든 `out/renderer`와 Electron 포장 단계가 만든 `win-unpacked/resources/app.asar` 모두 올바른 `YYYY/MM/DD-N`을 담고 있다.

**최종 Windows installer 판정: BLOCKED.** 두 실행 모두 `winCodeSign` 압축 해제 중 Windows 심볼릭 링크 권한 오류로 `build:win`이 exit 1이 됐다. 따라서 NSIS/portable `.exe` 최종 산출물 및 설치 후 HTTP 실호출까지는 이 PC에서 증명하지 못했다. 이 오류를 우회하도록 `forceCodeSigning`을 끄지 않았다.

## 실행 환경 준비

워크트리에 `node_modules`가 없고 공유 `design-system/dist`도 없었다. 다음을 순서대로 실행했다.

```text
clients/web/design-system: npm ci                         EXIT_CODE=0
clients/web/design-system: npm run build                 EXIT_CODE=0
clients/desktop: npm ci                                  EXIT_CODE=0
clients/arologis-desktop: npm ci                          EXIT_CODE=0
```

Docker와 Gradle은 실행하지 않았다. 전체 테스트 스위트도 실행하지 않았다.

## DESKTOP 정식 release 실행

실행 명령:

```powershell
$env:VITE_APP_VERSION='2026/07/30-2'
$env:DESKTOP_UPDATE_URL='https://updates.invalid/samhan-desktop'
npm run build:win
```

실행 원문 중 판정에 필요한 부분:

```text
> @samhan/desktop@0.1.0 build:win
> node ../../scripts/build-desktop-release.cjs

[release-build] VITE_APP_VERSION=2026/07/30-2
out/renderer/assets/index-DdJDeN78.js  5,295.82 kB
[release-build] electron-builder 입력 renderer 검증 완료: 2026/07/30-2
• packaging       platform=win32 arch=x64 electron=33.4.11 appOutDir=release\2026-07-30-2\win-unpacked
• updating asar integrity executable resource  executablePath=release\2026-07-30-2\win-unpacked\Samhan Public.exe
ERROR: Cannot create symbolic link ... : 클라이언트가 필요한 권한을 가지고 있지 않습니다.
• Above command failed, retrying 3 more times
Exit code: 1
```

`out/renderer`와 `release/2026-07-30-2/win-unpacked/resources/app.asar`는 위 실행에서 생성됐다.

## AROLOGIS_DESKTOP 정식 release 실행

실행 명령:

```powershell
$env:VITE_APP_VERSION='2026/07/30-3'
$env:AROLOGIS_UPDATE_URL='https://updates.invalid/arologis-desktop'
npm run build:win
```

실행 원문 중 판정에 필요한 부분:

```text
> @samhan/arologis-desktop@1.0.0 build:win
> node ../../scripts/build-arologis-desktop-release.cjs

[arologis-release] VITE_APP_VERSION=2026/07/30-3
out/renderer/assets/index-DYX-ilQ7.js  1,107.61 kB
[arologis-release] renderer 버전 주입 확인: 2026/07/30-3
• packaging       platform=win32 arch=x64 electron=33.4.11 appOutDir=release\2026-07-30-3\win-unpacked
• updating asar integrity executable resource  executablePath=release\2026-07-30-3\win-unpacked\Arologis Desktop.exe
ERROR: Cannot create symbolic link ... : 클라이언트가 필요한 권한을 가지고 있지 않습니다.
• Above command failed, retrying 3 more times
Exit code: 1
```

`out/renderer`와 `release/2026-07-30-3/win-unpacked/resources/app.asar`는 위 실행에서 생성됐다.

## 실제 artifact payload 검증

두 실행 후 실제 파일을 읽는 Node 검증기를 실행했다. 단순 소스 검색이 아니라, Electron 포장 결과인 `app.asar`의 바이트를 직접 읽었다.

실행 원문:

```text
{"identity":"DESKTOP","version":"2026/07/30-2","rendererExact":true,"rendererQueryRef":true,"asarExact":true,"asarQueryRef":true,"asarBytes":34838279,"installerFiles":[]}
{"identity":"AROLOGIS_DESKTOP","version":"2026/07/30-3","rendererExact":true,"rendererQueryRef":true,"asarExact":true,"asarQueryRef":true,"asarBytes":39709537,"installerFiles":[]}
```

검증 의미:

- `rendererExact=true`: release wrapper가 생성한 renderer JavaScript에 해당 버전 문자열이 정확히 존재한다.
- `rendererQueryRef=true`: 같은 bundle이 `currentVersion: CURRENT_VERSION`을 사용한다.
- `asarExact=true`: Electron 포장 결과 `app.asar`에 같은 버전 문자열이 실제로 들어갔다.
- `asarQueryRef=true`: 포장 결과에서도 `/app/version` 호출에 `CURRENT_VERSION`을 전달하는 코드가 보존됐다.
- `installerFiles=[]`: signing 단계 실패로 최종 NSIS/portable 파일은 생성되지 않았다.

`app.asar` 내부 context도 별도로 읽었다.

```text
DESKTOP CURRENT_VERSION="...const CURRENT_VERSION = resolveBuildAppVersion(\n  \"2026/07/30-2\"\n);..."
DESKTOP currentVersion: CURRENT_VERSION="...currentVersion: CURRENT_VERSION..."
AROLOGIS_DESKTOP CURRENT_VERSION="...const CURRENT_VERSION = resolveBuildAppVersion(\"2026/07/30-3\");..."
AROLOGIS_DESKTOP currentVersion: CURRENT_VERSION="...currentVersion: CURRENT_VERSION..."
```

각 client의 query 연결은 다음과 같이 artifact에 남아 있다.

```text
DESKTOP: apiClient.get("/app/version", config), config.params = { clientType, currentVersion: CURRENT_VERSION }
AROLOGIS_DESKTOP: URLSearchParams({ clientType: "AROLOGIS_DESKTOP", currentVersion }), `${base}/app/version?${params.toString()}`
```

따라서 이번 실행에서 증명된 설치 전 불변식은 다음과 같다.

```text
release wrapper 주입값
  = renderer CURRENT_VERSION
  = packaged app.asar CURRENT_VERSION
  = /app/version query에 전달되는 currentVersion 참조값
```

실행 중인 backend에 대한 실제 HTTP 요청은 이번 슬라이스에서 실행하지 않았다. Docker·서비스 재기동이 금지되어 있고, 최종 installer도 signing 권한 오류로 만들어지지 않았기 때문이다. 그러므로 “artifact 내부 문자열과 query wiring”은 PASS로, “설치 후 실제 네트워크 요청”은 미검증으로 분리한다.

## 타입검증

`arologis-desktop`은 단독 실행에서 통과했다.

```text
> @samhan/arologis-desktop@1.0.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
Exit code: 0
```

`clients/desktop`을 포함한 병렬 `npm run typecheck` 실행은 180초 제한에 도달해 출력 없이 종료됐다. 성공으로 간주하지 않는다.

```text
command timed out after 184038 milliseconds
```

이는 이번 artifact payload 판정과 별도의 검증 결과이며, 전체 테스트로 우회하지 않았다.

## 변경·신규 파일

이번 라운드에는 코드 변경이 없다. 따라서 코드 변경 파일과 `git show --numstat` 기준 `+N/-M` 보고 대상은 없다.

저장소에 남긴 신규 보고 파일 전체 목록:

```text
docs/dev-reports/2026-07-30-910-s2-artifact-version.md
```

실행으로 생성된 `node_modules`, `clients/*/out`, `clients/*/release`는 빌드 검증용 로컬 파생물이며 Git 미추적/무시 상태다.

Git `add`, `commit`, `push`, `checkout`, `switch`는 실행하지 않았다.
