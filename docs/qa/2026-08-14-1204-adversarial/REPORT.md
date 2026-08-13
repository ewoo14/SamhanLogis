# PR #1204 1차 적대검증(SOL) 라이브 QA

- 검증 일시: 2026-08-14 07:50~08:02 KST
- 대상: PR #1204, `feat/910-release-feed`, HEAD `77cc040d438bf833aac14c0134e750e58ad13689`
- 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 판정: **도달 가능한 결함 1건**, 증거 무결성 불일치 0건
- 금지 준수: git 명령 및 소스 수정 없음. 임시 QA runner는 `qa/playwright`에서 실행 후 삭제했다. `docs/qa`에는 캡처 스크립트를 남기지 않았다.

## 1. 환경 실측 원문

```text
2026-08-14T07:50:29.730+09:00
OS=Microsoft Windows NT 10.0.26200.0
PowerShell=5.1.26100.9168
Node=v24.15.0
TotalVisibleMemorySize=64606096 KB
FreePhysicalMemory=20628128 KB
FreePhysicalMemoryGB=19.673
C: Size=1999367041024 bytes
C: FreeSpace=1205074178048 bytes
FreeDiskGB=1122.313
NodeFsSymlinkExists=true
```

RAM 1.0GB 중단 기준에 도달하지 않았다. fresh E2E 중 최저 여유 RAM은 17.997GB였다.

### 실행한 빌드 — 버전·서명·해시 원문

fresh E2E가 직접 다시 만든 두 installer의 실행 종료 직후 값이다.

```text
Version=2026-08-13-9101
Length=81978424
SHA256=5889E3BBBE6EF0FC5F17431A62ABAB6C0015D69A7BE99C192E7FB5E3DEA78944
SignatureStatus=Valid
StatusMessage=Signature verified.
SignerThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
SignerInRoot=True

Version=2026-08-13-9102
Length=81978424
SHA256=61EBF88E17EF4D5574E5666A1104DC1BFA40B666096D6504FC1DC7B11EF28576
SignatureStatus=Valid
StatusMessage=Signature verified.
SignerThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
SignerInRoot=True
```

환경·fresh 실행 증거: [01-environment-and-fresh-shell-e2e.png](screenshots/01-environment-and-fresh-shell-e2e.png)

## 2. fresh 셸 단일 스크립트 재현

부모 프로세스 환경을 복사하지 않고 Windows Machine/User 환경과 Windows 필수 사용자 경로 변수만 새 `ProcessStartInfo`에 구성했다. `CSC_LINK`, `CSC_KEY_PASSWORD`, `INTERNAL_CHAT_UPDATE_URL`, 작업 경로 등 릴리스 실행 변수는 0개 주입했다. 사람 입력은 없었다.

```text
FreshShellParentEnvironmentCopied=False
FreshShellInjectedReleaseVariables=0
FreshShellCommand=C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\dev\Samhan-Public\.claude\worktrees\w910f\scripts\run-internal-chat-release-feed.ps1"
FreePhysicalMemoryGB.Before=18.999
AbortedForLowRam=False
MinFreePhysicalMemoryGB=17.997
ProcessExitCode=0
```

핵심 stdout 원문:

```text
[910-feed] reuse existing signing certificate: AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
SignerThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
TrustedRootThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
SignerRootMatch=True
9101 installer: Status=Valid; SignerThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC; MatchesRoot=True
9102 installer: Status=Valid; SignerThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC; MatchesRoot=True
[910-feed] FeedStatus=200
InstallerExit=0
FreshRunBeforeHash=C8CCFF7B2472BA681FDFE316D4EB37FCEDA954ED0D3C517012F7687F06445D07
DisplayVersion before=2026/08/13-9101
CacheExistsAfterClear=False
InstalledHashBefore=C8CCFF7B2472BA681FDFE316D4EB37FCEDA954ED0D3C517012F7687F06445D07
InstalledHashAfter=05C9B1A1DE207EDE52596861AA5E1055CBF93F4D548270025102B41DAB33FE06
Changed=True
DisplayVersion after=2026/08/13-9102
quitAndInstall=true,true observed through installed version and app.asar replacement
[910-feed] full flow PASS
[910-feed] cleanup PASS: feed process
[910-feed] cleanup PASS: app process 12236
[910-feed] cleanup PASS: preserve pre-existing certificate AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
[910-feed] cleanup PASS: temporary work C:\Users\user\AppData\Local\Temp\samhan-910-feed-608f01cc8c654db28c963d070a69dcec
```

결과: **라운드 5의 fresh 셸 E2E 핵심 주장은 재현됐다. 증거 무결성 불일치 0건.**

참고로 `Start-Process -UseNewEnvironment`만 사용한 최초 격리 시도는 스크립트 진입 전에 다음 Windows PowerShell 원문으로 실패했다. 그래서 위의 명시적 clean environment 방식으로 재실행했다.

```text
내부 Windows PowerShell 오류입니다. 8009001d 오류가 발생하여 관리되는 Windows PowerShell을 로드하지 못했습니다.
```

## 3. feed 파일 도달성·해시·버전

별도 미신뢰 인증서로 9103을 만들고 실제 HTTP 서버에서 `latest.yml`이 가리키는 파일을 다시 받았다.

```text
FeedStatus=200
InstallerStatus=200
FeedVersion=1.20260813.9103
FeedUrl=Samhan Internal Chat-2026-08-13-9103-x64.exe
FeedSHA512=kx51SRwnC8Q3WIDZJZBEsTeK/6NvvIS6fXkz1lsqSbegkpVQC4Ygpgung+jsc6xwUekOzBLElyoRy6NarC9ygg==
DownloadedSHA512=kx51SRwnC8Q3WIDZJZBEsTeK/6NvvIS6fXkz1lsqSbegkpVQC4Ygpgung+jsc6xwUekOzBLElyoRy6NarC9ygg==
FeedHashMatch=True
DownloadedBytes=81978384
```

증거: [08-feed-edge-cases-and-state.png](screenshots/08-feed-edge-cases-and-state.png)

## 4. 도달 가능한 결함

### SOL-1 — 미신뢰 인증서 차단 안내가 원인을 인터넷 장애로 오인시켜 사용자가 복구할 수 없음

- 범위: 인증서가 사내 PC 신뢰 루트에 배포되지 않은 실제 사용자 경로
- 심각도: 보통
- 영향: 업데이트는 서명 검증에서 정상 차단되지만 사용자는 인증서/IT 지원 필요성을 알 수 없다. “인터넷 연결 확인 후 다시 실행”만 반복하게 되어 구버전에 계속 머무를 수 있다.

재현:

1. CurrentUser Root에 없는 별도 코드서명 인증서로 `2026-08-13-9103` installer/feed를 생성한다.
2. 신뢰된 `2026/08/13-9102` 설치본을 실행해 해당 feed를 확인한다.
3. installer가 실제 다운로드된 뒤 앱 하단 사용자 안내를 관찰한다.

서명 원문:

```text
UntrustedSignerThumbprint=9BA99D02B44794D8C27E36FCD053EDDDC5B2ACDC
UntrustedSignerInRoot=False
UntrustedInstallerStatus=UnknownError
UntrustedInstallerStatusMessage=A certificate chain processed, but terminated in a root certificate which is not trusted by the trust provider
```

사용자 화면 원문:

```text
업데이트에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.
다시 확인
```

실제 화면: [02-untrusted-signature-visible-error.png](screenshots/02-untrusted-signature-visible-error.png)

즉, **조용한 실패는 아니지만 사용자가 알 수 있는 복구 경로가 없다.**

## 5. 비정상 입력 및 상태 보존

### 같은 버전

`2026/08/13-9102` 설치본에 9102 feed를 제공했다.

```text
UpdateNoticeCount=0
DisplayVersion=2026/08/13-9102
```

화면: [03-same-version-no-update.png](screenshots/03-same-version-no-update.png)

### 손상된 installer

9103 installer 마지막 1바이트를 변조하되 latest.yml 해시는 원래 값으로 유지했다.

```text
CorruptedSHA256=150EB58CF28896C09751A695C37D87D36A1A37356DCDA48DFD18179467C2A446
UpdateNoticeCount=1
VisibleText=업데이트에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.
DisplayVersionAfterCorrupt=2026/08/13-9102
```

손상 파일은 설치되지 않았고 기존 버전이 유지됐다. 화면: [04-corrupted-installer-visible-error.png](screenshots/04-corrupted-installer-visible-error.png)

### 다운그레이드

9102 설치본에서 fresh updater cache로 9101 feed를 제공했다.

```text
GET /latest.yml 200
GET /Samhan Internal Chat-2026-08-13-9101-x64.exe.blockmap 200
GET /Samhan Internal Chat-2026-08-13-9101-x64.exe 200
VersionAfterDowngrade=2026/08/13-9101
```

`allowDowngrade=true` 경로가 실제 설치·재기동까지 도달했다. 화면: [07-after-downgrade-user-data-preserved.png](screenshots/07-after-downgrade-user-data-preserved.png)

### 기존 사용자 데이터

9101 실행 중 renderer localStorage에 `PR1204-USER-DATA-PRESERVED`를 기록했다. 동일 user-data-dir로 9101→9102 실제 업데이트 후, 이어 9102→9101 다운그레이드 후 재확인했다.

```text
VersionBeforeUpgrade=2026/08/13-9101
VersionAfterUpgrade=2026/08/13-9102
MarkerAfterUpgrade=PR1204-USER-DATA-PRESERVED
VersionAfterDowngrade=2026/08/13-9101
MarkerAfterDowngrade=PR1204-USER-DATA-PRESERVED
```

화면: [05-before-upgrade-user-data-marker.png](screenshots/05-before-upgrade-user-data-marker.png), [06-after-upgrade-user-data-preserved.png](screenshots/06-after-upgrade-user-data-preserved.png), [07-after-downgrade-user-data-preserved.png](screenshots/07-after-downgrade-user-data-preserved.png)

## 6. 관측 불가 항목과 실패 원문

### 로그인 상태 유지

관측 불가. 이 설치본 자체 화면 원문이 다음과 같고 로그인 기능이 아직 없다.

```text
채팅 연결과 로그인 연계는 다음 슬라이스에서 추가됩니다.
```

따라서 업데이트 전후 로그인 토큰/세션 유지 여부를 실제 사용자 로그인으로 밟을 수 없다. 대신 현재 존재하는 사용자 데이터 저장소(localStorage)는 실제 업데이트·재기동·다운그레이드 전후 유지됨을 확인했다.

### 최초 Playwright launch 시도

`qa/playwright` 패키지 안에서 실행했으나 이 워크트리에 `node_modules`가 없어 앱 launch 전에 실패했다. `npm ci` 후 동일 runner로 재실행하여 이후 앱 캡처를 완료했다.

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright' imported from C:\dev\Samhan-Public\.claude\worktrees\w910f\qa\playwright\pr1204-release-feed-real-qa.mjs
Node.js v24.15.0
```

## 7. 브라우저·프로세스·정리

- Electron 실제 설치본: Playwright `_electron`으로 실행·캡처.
- 증거 패널: 로컬 Chromium `C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe` 직접 launch.
- 스크린샷 8장 생성.
- 생성한 미신뢰 인증서 My/Root 잔존 0건, 임시 설치본·feed·9103 release·임시 `node_modules` 제거.
- 이 검증에서 띄운 Electron, Python feed, Chromium, Node 프로세스 종료. 세션 시작 전부터 있던 Node PID 34924는 보존.

## 최종 판정

1. 환경 실측: RAM·디스크 충분, Node `fs.symlink` 성공.
2. fresh 셸 E2E: **성공**, 종료 코드 0, 사람 입력 없음, 라운드 5 원문 재현.
3. 도달 가능한 결함: **1건(SOL-1)**.
4. 증거 무결성 불일치: **0건**.
5. 관측 불가: 실제 로그인 상태 유지(기능 자체 미구현). 최초 Playwright dependency 부재 launch 실패는 원문 기록 후 재실행 완료.
