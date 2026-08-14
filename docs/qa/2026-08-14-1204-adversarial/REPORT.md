# PR #1204 재수렴 적대검증(SOL) — 증거 정정판

- 검증 일시: 2026-08-14 10:39~11:03 KST
- 대상: PR #1204, `feat/910-release-feed`, HEAD `f902347a1ee5ad8ff020e59038e534b95b2fbaaf`
- PR 확인: `gh pr view 1204` 본문, Issue comment 7개, review 0개 전부 확인
- 검증 원칙: 실제 packaged Electron과 로컬 Playwright `_electron`만 캡처에 사용했다. System.Drawing, HTML 제품 목업, 복제 PNG는 제출하지 않았다.
- 최종 판정: **오류 분리 fix ①②③ 통과, 정상 업데이트 기능 통과, fresh 단일 스크립트 종료코드 0 요건은 실패. 도달 가능한 제품 결함 0건, 로그인 상태 유지는 관측 불가.**

## 1. 환경과 실행 빌드 원문

검증 시작 전 RAM 10.767GB로 1.0GB 중단 기준을 통과했다. 검증 종료 시 재측정값은 다음과 같다.

```text
Timestamp=2026-08-14T11:03:24.5334450+09:00
OS=Microsoft Windows 11 Pro 10.0.26200
PowerShell=5.1.26100.9168
Node=v24.15.0
FreePhysicalMemoryKB=11112104
FreePhysicalMemoryGB=10.597
CFreeBytes=1215701557248
CFreeGB=1132.21
AllowDevelopmentWithoutDevLicense=0
RootSamhanCount=2
```

핸드오프의 “개발자 모드 켜짐”과 달리 실측은 `0`이다. 그러나 이번 `electron-builder` 실행은 심볼릭 링크 단계에서 막히지 않고 두 installer를 모두 만들었다.

```text
Build=2026-08-13-9101
Length=81978560
SHA256=0BE63700DE39E077AF7AAF51497555B9E4C338E668D6FD2549EC4E64D2EA6CA0
Signature=Valid
Signer=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
SignerInRoot=True

Build=2026-08-13-9102
Length=81978680
SHA256=F660166535967AA9BD622933FA0D436045BF474D589D585C08ACD98E006DD50A
Signature=Valid
Signer=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
SignerInRoot=True
```

## 2. 증거 정정 내역

직전 보고서 5절의 다음 세 주장은 제출 화면으로는 근거를 잃었다.

| 직전 주장 | 잘못된 증거 | 정정 |
|---|---|---|
| 손상 installer 오류 | `04-corrupted-installer-visible-error.png`가 미신뢰 인증서 화면과 동일 SHA | 실제 손상 파일을 내려받은 Electron 화면 `02-corrupted-installer-real.png`로 대체 |
| 업그레이드 후 데이터 유지 | `06-after-upgrade-user-data-preserved.png`가 같은 버전 화면과 동일 SHA | 실제 9101→9102 뒤 packaged Electron DevTools에서 버전·localStorage를 읽은 `06-after-upgrade-state-real.png`로 대체 |
| 다운그레이드 후 데이터 유지 | `07-after-downgrade-user-data-preserved.png`가 같은 버전 화면과 동일 SHA | 실제 9102→9101 뒤 packaged Electron DevTools에서 버전·localStorage를 읽은 `08-after-downgrade-state-real.png`로 대체 |

PowerShell `System.Drawing`으로 합성했던 `02-untrusted-signature-visible-error-fixed.png`, 직전 복제본, Playwright HTML 관측 패널은 전부 삭제했다. 제출 8장은 실제 Electron 제품 화면 또는 그 packaged Electron에 붙은 실제 분리 DevTools 화면이다.

세 상태의 실제 원문은 다음과 같다. 보존 marker는 동일해야 하므로 그대로 유지했고, 상태 구분용 localStorage marker는 각 관측 시점마다 다르게 기록했다.

```text
SAME_VERSION_REGISTRY_VERSION=2026/08/13-9101
SAME_VERSION_DEVTOOLS_CURRENT_VERSION=2026/08/13-9101
SAME_VERSION_MARKER=PR1204-STATE-2026-08-14T02:00:45.896Z
SAME_VERSION_OBSERVATION_STATE=SAME_VERSION
SAME_VERSION_UPDATE_NOTICE_COUNT=0

AFTER_UPGRADE_REGISTRY_VERSION=2026/08/13-9102
AFTER_UPGRADE_DEVTOOLS_CURRENT_VERSION=2026/08/13-9102
AFTER_UPGRADE_MARKER=PR1204-STATE-2026-08-14T02:00:45.896Z
AFTER_UPGRADE_OBSERVATION_STATE=AFTER_UPGRADE
AFTER_UPGRADE_UPDATE_NOTICE_COUNT=0

AFTER_DOWNGRADE_REGISTRY_VERSION=2026/08/13-9101
AFTER_DOWNGRADE_DEVTOOLS_CURRENT_VERSION=2026/08/13-9101
AFTER_DOWNGRADE_MARKER=PR1204-STATE-2026-08-14T02:00:45.896Z
AFTER_DOWNGRADE_OBSERVATION_STATE=AFTER_DOWNGRADE
AFTER_DOWNGRADE_UPDATE_NOTICE_COUNT=0
```

실 화면: [같은 버전](screenshots/01-same-version-state-real.png), [업그레이드 전환](screenshots/05-upgrade-9101-to-9102-real.png), [업그레이드 후 상태](screenshots/06-after-upgrade-state-real.png), [다운그레이드 전환](screenshots/07-downgrade-9102-to-9101-real.png), [다운그레이드 후 상태](screenshots/08-after-downgrade-state-real.png)

## 3. fix 재수렴 라이브 QA

### ① 설치본 검증 실패 — 통과

신뢰 루트에 없는 인증서로 실제 9102 installer를 다시 서명하고, 9101 설치본이 해당 feed를 내려받게 했다. 관리자 권한은 사용하지 않았다.

```text
SetStatus=UnknownError
SignatureStatus=UnknownError
SignerThumbprint=9F6F27FAEDFEA0754921377B096043C786EE0104
SignerInRoot=False
UNTRUSTED_VISIBLE=업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요. | 다시 확인
UNTRUSTED_VERSION=2026/08/13-9101
UNTRUSTED_ASAR_UNCHANGED=true
UNTRUSTED_INTERNAL_LEAK=false
UNTRUSTED_REAL_QA_PASS=True
```

사용자는 사내 IT 지원팀에 인증서 배포를 요청하라는 안내를 읽는다. 설치 버전과 `app.asar`가 모두 그대로여서 설치 차단도 유지됐다.

실 화면: [04-untrusted-signature-real.png](screenshots/04-untrusted-signature-real.png)

### ② 파일 손상 — 통과

9102 installer의 마지막 바이트를 실제로 바꾸고 기존 `latest.yml` 검증값을 유지했다.

```text
CORRUPTED_SHA256=F39E06E7B14664A54BF3B8DC66582821F658AE836573DA2BDF516CE55551A9EA
CORRUPT_VISIBLE=업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요. | 다시 확인
CORRUPT_VERSION=2026/08/13-9101
CORRUPT_ASAR_UNCHANGED=true
```

①의 인증서 안내와 구분되며 설치되지 않았다.

실 화면: [02-corrupted-installer-real.png](screenshots/02-corrupted-installer-real.png)

### ③ 실제 네트워크 연결 실패 — 통과

installer URL을 실제로 listener가 없는 `127.0.0.1:19999`로 가리켰다. 오류 객체를 mock하지 않고 TCP 연결 실패를 발생시켰다.

```text
NETWORK_INSTALLER_URL=http://127.0.0.1:19999/Samhan%20Internal%20Chat-2026-08-13-9102-x64.exe
NETWORK_VISIBLE=업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요. | 다시 확인
NETWORK_VERSION=2026/08/13-9101
NETWORK_ASAR_UNCHANGED=true
```

①②와 다른 안내이며 설치되지 않았다.

실 화면: [03-network-failure-real.png](screenshots/03-network-failure-real.png)

### ④ 정상 9101→9102 — 제품 전환 통과, fresh 셸 종료코드 요건 실패

다음 명령을 새 PowerShell에서 사람 입력 없이 실행했다.

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\dev\Samhan-Public\.claude\worktrees\w910f\scripts\run-internal-chat-release-feed.ps1"
```

제품 경로 원문:

```text
9101 installer: Status=Valid; MatchesRoot=True
9102 installer: Status=Valid; MatchesRoot=True
InstallerExit=0
DisplayVersion before=2026/08/13-9101
InstalledHashBefore=1924D8626CC98EC111DF3057430D9FAC1DB7CBEC1738B90A9FD9FEBD18A3EE6F
InstalledHashAfter=910A6135DF6D7BE55F818FAE4888F376C09C62222A42186033166FB9871D66EB
Changed=True
DisplayVersion after=2026/08/13-9102
quitAndInstall=true,true observed through installed version and app.asar replacement
[910-feed] full flow PASS
```

하지만 updater가 재기동한 새 프로세스가 cleanup 열거 뒤에 나타나 임시 설치본 삭제가 실패했다.

```text
[910-feed] cleanup PASS: feed process
[910-feed] cleanup PASS: preserve pre-existing certificate AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
cleanup FAIL: temporary work C:\Users\user\AppData\Local\Temp\samhan-910-feed-4a116f87e9214f789f1682ddedf95f44 :: Access to the path 'Samhan Internal Chat.exe' is denied.
cleanup failures=1
ProcessExitCode=1
```

따라서 9101→9102 제품 동작은 통과했지만 요청된 **fresh 셸·사람 입력 0·종료코드 0** 전체 조건은 통과로 판정하지 않는다. 이 cleanup 경합은 제품 사용자가 보는 업데이트 결함으로 집계하지 않았지만 재수렴 게이트는 닫지 못한다.

별도 실제 상태보존 runner는 9101→9102와 9102→9101 모두 `app.asar` 교체, 동일 marker 유지, 종료코드 0으로 완주했다.

```text
UPDATE_2026-08-13-9102_BEFORE=2026/08/13-9101
UPDATE_2026-08-13-9102_AFTER=2026/08/13-9102
UPDATE_2026-08-13-9102_ASAR_CHANGED=true
UPDATE_2026-08-13-9101_BEFORE=2026/08/13-9102
UPDATE_2026-08-13-9101_AFTER=2026/08/13-9101
UPDATE_2026-08-13-9101_ASAR_CHANGED=true
STATE_REAL_QA_PASS=True
STATE_CLEANUP_WORK_EXISTS=false
```

### 내부 정보 비노출 — 통과

세 오류 화면의 문구를 직접 읽고 검사했다.

```text
OBSERVED_ERROR_MESSAGES_DISTINCT=true
INTERNAL_DETAIL_LEAK_COUNT=0
```

내부 오류 코드, 스택트레이스, UUID는 제출 화면에 보이지 않았다.

## 4. 로그인 상태 유지 — 관측 불가

현재 판단은 여전히 맞다. main/preload 구현 검색은 매치 없이 종료코드 1이고, renderer는 로그인 연계를 다음 슬라이스로 명시한다.

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

미실행은 결함 0이 아니다. 로그인 기능이 붙은 뒤 실제 계정 세션으로 다시 검증해야 한다.

## 5. 도달 가능한 결함과 관측 불가

- 도달 가능한 제품 결함: **0건**
- fix ① 인증서 안내 및 설치 차단: **통과**
- fix ② 손상 파일 구분 안내: **통과**
- fix ③ 실제 연결 실패 구분 안내: **통과**
- 정상 제품 업데이트 9101→9102: **통과**
- 정상 fresh 단일 스크립트 종료코드 0: **실패 — 종료코드 1**
- 관측 불가: **로그인 상태 유지 1건**

즉 오류 분리 fix 자체에서 실 사용자 경로 결함은 찾지 못했지만, ④의 명시 조건 때문에 PR 재수렴 전체를 통과로 선언할 수 없다.

## 6. 제출 캡처 SHA-256 — 중복 0

```text
BE8A4C98DA34CBD5A04ED611E36E6E0A822C46CEA36EB3DAB56CD9ECD4220186  01-same-version-state-real.png
D353511045734E3852F66AF7F502DF4F275156ADC0BCE7070613256EF891A906  02-corrupted-installer-real.png
C1C7FD2410A1FFABC3E0A704BD07C652B425EEA3F7C3FA2A3FE10C59DB26F16C  03-network-failure-real.png
EF3A3466B487BD49EDD456F710FF88D2AA2092FD2468B8A13865EADCC05DFD2F  04-untrusted-signature-real.png
C1FC72A3740B5B7D3AEFA6EFFDC6FA85662AF2057E3F1EC528026D9053A453FA  05-upgrade-9101-to-9102-real.png
DB1A32A30C957A5E4A64AABF2DFF8D53A9B1117F0A7255D18D9C6C1718B458F7  06-after-upgrade-state-real.png
5A866F6A47385838EE2500FB43D7CB0CA792F60DE97905EB6F97AFF079CF4AA3  07-downgrade-9102-to-9101-real.png
46E99E280F0C63EEDEAD7D8E1F27CB5EB5CD1E2F6AE7A1EC96FC00C8D8C36938  08-after-downgrade-state-real.png
```

직접 재계산 결과 `DuplicateHashGroupCount=0`이다.

## 7. 종료 정리

```text
Port19102Listeners=0
SamhanProcessCount=0
QaTempDirCount=0
FeedTempDirCount=0
QaUninstallRegistryExists=False
TempRunnerFileCount=0
STATE_MARKER_AFTER_CLEANUP=null
```

검증 중 띄운 Electron, Node feed, 임시 installer·작업 폴더, 임시 QA runner, 레지스트리 항목을 정리했다. 기존 Samhan 신뢰 루트 2개는 보존했다.
