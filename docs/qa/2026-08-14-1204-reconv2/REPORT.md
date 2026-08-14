# PR #1204 재수렴 적대검증 2차(SOL) — 머지 직전 라이브 QA

- 검증 일시: 2026-08-14 11:37~12:10 KST
- 대상: PR #1204, `feat/910-release-feed`, 원격 HEAD `38fdfdef994255e77f7192cc090eb65619569f72`
- PR 확인: `gh pr view 1204` 본문, issue comment 7개, review 0개, review comment 0개를 전부 읽었다.
- 실행 원칙: fresh PowerShell 5.1, 사람 입력 0, 실제 signed installer, 실제 packaged Electron과 로컬 Playwright `_electron`만 사용했다. 합성 PNG와 제품 HTML 목업은 만들거나 제출하지 않았다.
- 최종 판정: **fresh 단일 스크립트 3/3회 exit 0. 진짜 삭제 불능은 main 스크립트 exit 1. 도달 가능한 제품 결함 0건. 로그인 상태 유지는 기능 미구현으로 관측 불가 1건.**

## 1. 환경 실측 원문과 실행 빌드

시작 전 RAM은 1.0GB 중단 기준을 넘었다.

```text
Timestamp=2026-08-14T11:37:11.6937040+09:00
OS=Microsoft Windows 11 Pro 10.0.26200
PowerShell=5.1.26100.9168
Node=v24.15.0
FreePhysicalMemoryKB=8299128
FreePhysicalMemoryGB=7.915
CFreeBytes=1211791056896
CFreeGB=1128.57
AllowDevelopmentWithoutDevLicense=0
RootSamhanCount=2
RootSamhan=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC|CN=Samhan Internal Release
RootSamhan=32F346D8354B518F6C7D6A12DC6E41FEE1388097|CN=Samhan Internal Release
```

제품 회귀 runner가 실행 직전에 기록한 installer와 서명 검증 원문이다. fresh 스크립트는 매회 두 installer를 다시 만들었고 두 파일 모두 `Status=Valid`, `MatchesRoot=True`였다.

```text
Build=2026-08-13-9101
Length=81978720
SHA256=2336A18794253CF183E967D88E813C508ED70F3C3268683AF0D4F1F457C29FA4
Signature=Valid
Signer=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
SignerInRoot=True

Build=2026-08-13-9102
Length=81978712
SHA256=5BE1E88ABABE0F83DAB29EF6544E752B65655B30D99D9F701FD027FE86E33DDC
Signature=Valid
Signer=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
SignerInRoot=True
```

검증 종료 시에도 RAM은 5.718GB, C: 여유 공간은 1128.63GB였다.

## 2. fresh 단일 스크립트 반복 실행

각 회차를 다음 명령 하나만 새 `powershell.exe`에서 실행했다.

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\dev\Samhan-Public\.claude\worktrees\w910f\scripts\run-internal-chat-release-feed.ps1"
```

| 회차 | 소요 | 사람 입력 | 종료코드 | 판정 |
|---:|---:|---:|---:|---|
| 1 | 100.2초 | 0 | 0 | PASS |
| 2 | 93.9초 | 0 | 0 | PASS |
| 3 | 60.7초 | 0 | 0 | PASS |

세 회차 공통 원문:

```text
SignerThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
TrustedRootThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
SignerRootMatch=True
9101 installer: Status=Valid; SignerThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC; MatchesRoot=True
9102 installer: Status=Valid; SignerThumbprint=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC; MatchesRoot=True
InstallerExit=0
DisplayVersion before=2026/08/13-9101
InstalledHashBefore=1924D8626CC98EC111DF3057430D9FAC1DB7CBEC1738B90A9FD9FEBD18A3EE6F
InstalledHashAfter=910A6135DF6D7BE55F818FAE4888F376C09C62222A42186033166FB9871D66EB
Changed=True
DisplayVersion after=2026/08/13-9102
quitAndInstall=true,true observed through installed version and app.asar replacement
[910-feed] full flow PASS
[910-feed] cleanup PASS: temporary work ...
[910-feed] cleanup PASS: QA uninstall registry entry
```

세 회차 stderr 크기는 모두 0 byte였다. 3회차는 재기동 앱 PID도 `cleanup PASS: app process 21428`로 종료 확인했다.

## 3. 진짜 정리 실패가 exit 1로 끝나는가

main 스크립트가 만든 임시 작업 폴더의 `000-forced-cleanup-lock\locked.bin`을 `[IO.FileShare]::None`으로 계속 잡았다. 제품 업데이트 자체는 정상 완주한 뒤 cleanup helper가 120회 재시도했고, 실패를 숨기지 않았다.

```text
[910-feed] full flow PASS
NegativeLockHeld=True
cleanup FAIL: temporary work C:\Users\user\AppData\Local\Temp\samhan-910-feed-673e25cef5ee4769b3c67b084fa8734f :: The process cannot access the file 'locked.bin' because it is being used by another process.
[910-feed] cleanup PASS: QA uninstall registry entry
cleanup failures=1
NegativeMainProcessExitCode=1
```

helper 단독 fresh PowerShell에서도 OS 종료코드와 stderr를 별도로 확인했다.

```text
GenuineCleanupFailureExitCode=1
GenuineCleanupFailureStdout=
GenuineCleanupFailureStderr=GENUINE_CLEANUP_FAILURE=The process cannot access the file 'locked.bin' because it is being used by another process.
GenuineFailureWorkExistsAfterCleanup=False
```

회귀 테스트도 같은 계약을 확인했다.

```text
PASS: process exit is observed before temporary work cleanup.
PASS: genuine cleanup failure remains fatal: The process cannot access the file 'Samhan Internal Chat.exe' because it is being used by another process.
CleanupRegressionExit=0
```

## 4. 잔재 0 실측

강제 실패용 핸들을 해제한 뒤 정확한 GUID 작업 경로만 제거하고 다시 측정했다.

```text
Port19102Listeners=0
SamhanProcessCount=0
FeedTempDirCount=0
ProductQaTempDirCount=0
GenuineFailureTempDirCount=0
TempRunnerFileCount=0
QaUninstallRegistryCount=0
UpdaterCacheExists=False
UntrustedQaRootExists=False
```

즉 로컬 feed 서버, Electron 앱, 임시 작업 디렉터리, 임시 설치본, QA uninstall 레지스트리, updater pending installer, 임시 runner가 남지 않았다. 기존 CurrentUser Root의 Samhan 인증서 2개는 보존했다.

## 5. 제품 동작 회귀

### 5.1 세 오류 계열 안내 구분과 설치 차단

실제 9101 packaged Electron이 각각의 실제 feed를 내려받게 했다. 세 문구는 모두 다르고 내부 오류 코드·스택·UUID는 화면에 없었다.

```text
CORRUPTED_SHA256=1B85D253EF77DFB87A86DD96B3913B761FDCC16CA5AE7D6D5AF383C363916AF2
CORRUPT_VISIBLE=업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요. | 다시 확인
CORRUPT_VERSION=2026/08/13-9101
CORRUPT_ASAR_UNCHANGED=true

NETWORK_INSTALLER_URL=http://127.0.0.1:19999/Samhan%20Internal%20Chat-2026-08-13-9102-x64.exe
NETWORK_VISIBLE=업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요. | 다시 확인
NETWORK_VERSION=2026/08/13-9101
NETWORK_ASAR_UNCHANGED=true

SetStatus=UnknownError
SignatureStatus=UnknownError
SignerThumbprint=9F6F27FAEDFEA0754921377B096043C786EE0104
SignerInRoot=False
UNTRUSTED_VISIBLE=업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요. | 다시 확인
UNTRUSTED_VERSION=2026/08/13-9101
UNTRUSTED_ASAR_UNCHANGED=true
UNTRUSTED_INTERNAL_LEAK=false
UNTRUSTED_REAL_QA_PASS=True

OBSERVED_ERROR_MESSAGES_DISTINCT=true
INTERNAL_DETAIL_LEAK_COUNT=0
```

실 화면: [손상 파일](screenshots/02-corrupted-installer-real.png), [연결 실패](screenshots/03-network-failure-real.png), [미신뢰 인증서](screenshots/04-untrusted-signature-real.png)

### 5.2 정상 9101→9102, quitAndInstall, 재기동, DisplayVersion

fresh 단일 스크립트 3회와 별도 실제 상태보존 runner 모두 완주했다.

```text
UPGRADE_BEFORE_VERSION=2026/08/13-9101
UPGRADE_AFTER_VERSION=2026/08/13-9102
UPGRADE_ASAR_CHANGED=true
UPGRADE_TRANSITION=새 버전 2026/08/13-9102을 다운로드하는 중입니다. | 다시 확인
UPGRADE_MARKER=PR1204-REAL-2026-08-14T03:02:52.536Z
quitAndInstall=true,true observed through installed version and app.asar replacement
```

실 화면: [9101→9102 전환](screenshots/05-upgrade-9101-to-9102-real.png)

### 5.3 다운그레이드 9102→9101

```text
DOWNGRADE_BEFORE_VERSION=2026/08/13-9102
DOWNGRADE_AFTER_VERSION=2026/08/13-9101
DOWNGRADE_ASAR_CHANGED=true
DOWNGRADE_TRANSITION=새 버전 2026/08/13-9101을 다운로드하는 중입니다. | 다시 확인
DOWNGRADE_MARKER=PR1204-REAL-2026-08-14T03:02:52.536Z
```

실 화면: [9102→9101 전환](screenshots/07-downgrade-9102-to-9101-real.png)

### 5.4 사용자 데이터 보존과 같은 버전

업그레이드 전 기록한 localStorage marker가 업그레이드와 다운그레이드 뒤 모두 동일했다. 마지막 정리에서는 marker를 제거해 `MARKER_AFTER_CLEANUP=null`을 확인했다.

```text
SAME_VERSION_NOTICE_COUNT=0
SAME_VERSION_DISPLAY=2026/08/13-9101
MARKER_SET=PR1204-REAL-2026-08-14T03:02:52.536Z
UPGRADE_MARKER=PR1204-REAL-2026-08-14T03:02:52.536Z
DOWNGRADE_MARKER=PR1204-REAL-2026-08-14T03:02:52.536Z
MARKER_AFTER_CLEANUP=null
REAL_QA_PASS=True
ProductRegressionRunnerExitCode=0
```

실 화면: [같은 버전](screenshots/01-same-version-no-update-real.png)

추가 자동 검증:

```text
Test Files 2 passed (2)
Tests 13 passed (13)
NpmTestExit=0
TypecheckExit=0
```

## 6. 로그인 상태 유지 — 관측 불가

직전 라운드와 동일하다. main/preload에는 로그인·인증·토큰·세션 구현이 없고 renderer가 다음 슬라이스 범위라고 명시한다. 실제 로그인 세션 자체가 없으므로 로그인 상태 유지는 실행할 수 없다.

실패 명령과 원문:

```powershell
rg -n -i '\b(login|auth|token|session|sign[ -]?in)\b' clients/internal-chat-desktop/src/main clients/internal-chat-desktop/src/preload
```

```text
LoginImplementationSearchExit=1
```

기능 부재 원문:

```text
clients/internal-chat-desktop/src/renderer/main.ts:42:
<small>채팅 연결과 로그인 연계는 다음 슬라이스에서 추가됩니다.</small>
```

따라서 이 항목은 결함 0으로 세지 않는다. 로그인 기능이 구현된 뒤 실제 계정 세션으로 다시 검증해야 한다.

## 7. 실 캡처 SHA-256 — 6장, 중복 0

동일한 정적 셸 픽셀이었던 업그레이드 후/다운그레이드 후 캡처와 진단 중복본은 제출에서 제거했다. 아래 6장은 서로 다른 실제 제품 상태이고 전부 packaged Electron 캡처다.

```text
F8DE0FDEB6B14A63EC88A086E7E270480DCA697FF450C1F189023ACA3D77C2CE  01-same-version-no-update-real.png
D353511045734E3852F66AF7F502DF4F275156ADC0BCE7070613256EF891A906  02-corrupted-installer-real.png
C1C7FD2410A1FFABC3E0A704BD07C652B425EEA3F7C3FA2A3FE10C59DB26F16C  03-network-failure-real.png
EF3A3466B487BD49EDD456F710FF88D2AA2092FD2468B8A13865EADCC05DFD2F  04-untrusted-signature-real.png
C1FC72A3740B5B7D3AEFA6EFFDC6FA85662AF2057E3F1EC528026D9053A453FA  05-upgrade-9101-to-9102-real.png
5A866F6A47385838EE2500FB43D7CB0CA792F60DE97905EB6F97AFF079CF4AA3  07-downgrade-9102-to-9101-real.png
ScreenshotCount=6
DuplicateHashGroupCount=0
NonPngCount=0
```

## 8. 도달 가능한 결함 목록과 최종 게이트

- 도달 가능한 제품 결함: **0건**
- fresh 단일 스크립트: **3/3회 통과, 각 exit 0**
- 진짜 정리 실패: **main 스크립트 exit 1, 원인 사용자 노출 — 통과**
- 잔재 0: **통과**
- 세 오류 안내 구분과 미신뢰 installer 설치 차단: **통과**
- 정상 9101→9102, `quitAndInstall`, 재기동, `DisplayVersion`: **통과**
- 다운그레이드와 사용자 데이터 보존: **통과**
- 로그인 상태 유지: **관측 불가 1건 — 기능 미구현**

이 트랙의 판정 기준인 fresh 셸 단일 스크립트 게이트 ④는 닫혔다. 관측 가능한 범위에서는 머지를 막는 제품 결함을 찾지 못했다.

## 9. 실행 중 관측 실패 원문

초기 로컬 runner를 PowerShell 5.1 파이프로 Node stdin에 넘길 때 기본 ASCII 인코딩이 한국어 기대 문자열을 `?`로 바꿔 제품 notice와 매치되지 않았다. 제품 화면에는 기대 문구가 실제로 표시됐지만 runner가 다음 원문으로 끝났다.

```text
page.waitForFunction: Timeout 120000ms exceeded.
DIAG_CORRUPT_NOTICE=업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요. | 다시 확인
```

`$OutputEncoding`과 `[Console]::OutputEncoding`을 UTF-8로 지정한 동일 실제 제품 실행은 45.7초에 `REAL_QA_PASS=True`, `ProductRegressionRunnerExitCode=0`으로 완주했다. 이는 제품 결함 목록에 포함하지 않았다.

