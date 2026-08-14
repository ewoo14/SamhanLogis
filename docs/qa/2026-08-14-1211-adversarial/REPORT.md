# PR #1211 1차 적대검증(SOL) 라이브 QA 보고서

- 검증일: 2026-08-14 (Asia/Seoul)
- 대상 PR: #1211 `#910`+`#935` 클라이언트 자동 업데이트 확대
- exact head: `a6f458df8db5f9f1ea47879f7f04ac1de6669226`
- 브랜치: `feat/910-935-client-update-expansion`
- 판정: **도달 결함 6건. 머지 불가.**
- 원칙: git 명령·코드 수정·Docker 재배포·합성 PNG를 사용하지 않았다. 실제 서명 빌드, 실제 NSIS 설치본, fresh Windows PowerShell 5.1, 로컬 Playwright/Electron 및 설치본 CDP로 검증했다.

## 1. 환경 실측 원문

```text
OS=Microsoft Windows 11 Pro|Version=10.0.26200|Build=26200
RAM_TOTAL_GB=61.61
RAM_FREE_GB_START=8.54
RAM_FREE_GB_FINAL=23.1
DISK_C_FREE_GB_START=1118.82
DISK_C_FREE_GB_FINAL=1143.39|USED_GB=718.66
DISK_D_FREE_GB=908.72|USED_GB=954.28
PS=5.1.26100.9168
NODE=v24.15.0
NPM=11.12.1
PYTHON=Python 3.14.4
CHROMIUM=147.0.7727.15
CHROMIUM_PATH=C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
AllowDevelopmentWithoutDevLicense=0
```

RAM은 전 구간 1.0GB 이상이었다. Docker 스택은 읽거나 재배포하지 않았다.

시작 시와 정리 후 CurrentUser Root 실측:

```text
ROOT=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC|CN=Samhan Internal Release|NotAfter=2027-08-14T00:23:00+09:00
ROOT=32F346D8354B518F6C7D6A12DC6E41FEE1388097|CN=Samhan Internal Release|NotAfter=2027-08-13T23:39:50+09:00
SIGNER=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC|HasPrivateKey=True|MatchesRoot=True
```

결정 6의 3~5년 정본 인증서와 정본 thumbprint가 아직 없고 위 기존 인증서 2개로 경로를 검증했다. 이는 지시대로 결함에 산입하지 않았다.

실 화면용 QA 설치본:

```text
Version=2026/08/14-9201
File=Arologis Desktop-2026-08-14-9201-x64.exe
Bytes=85456064
SHA256=2261C198305F1D913ACCE735A131B5BF200BE3F71EACFCDA996D8B53550C8E71
Authenticode=Valid
Signer=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC
Subject=CN=Samhan Internal Release
SignerRootMatch=True
```

검증 대상 하네스/계약 해시:

```text
scripts/run-arologis-release-feed.ps1
  AC2349039A700CB4E58C97650857094C0F13D448A6989AC1DE9BCF4328F63233
scripts/electron-update-contract.cjs
  29F6E7D88CC259E1A838D3745226920A2CA46A4082CE3FFFA9FDB96B39376E58
scripts/build-arologis-desktop-release.cjs
  909127FC57F5D93ECB7042962C1035EE2F44E47C1C0A6BB960088C326BF3A010
```

## 2. ① 아로로지스 fresh-shell 전체 하네스

유효 실행 **3회**. 각각 별도 `powershell.exe -NoProfile`, 포트 19112/19113/19114, timeout 300초로 실행했다.

| 회차 | 시간 | exit | 결과 |
|---|---:|---:|---|
| 1 | 107.7초 | 0 | PASS |
| 2 | 119.2초 | 0 | PASS |
| 3 | 118.6초 | 0 | PASS |

세 회 모두 다음 원문을 확인했다.

```text
SignerRootMatch=True (thumbprint recorded only for harness verification)
9101 installer: Status=Valid; MatchesRoot=True
9102 installer: Status=Valid; MatchesRoot=True
quitAndInstall=true,true observed through installed version and app.asar replacement
Downgrade=9102-to-9101 verified through quitAndInstall
ArologisInvariant[1]=PASS product prefix /arologis
ArologisInvariant[2]=PASS user data preserved
Arologis full flow PASS
```

2·3회차는 하네스가 출력한 cleanup 항목이 모두 PASS였다. 1회차는 종료할 앱 프로세스가 4개여서 해당 줄이 추가됐지만 feed/temp/release 2개/registry/marker/build root를 모두 정리했다. 세 회 모두 cleanup FAIL은 0건이다.

```text
cleanup PASS: feed process
cleanup PASS: temporary work ...
cleanup PASS: release output 2026-08-14-9101
cleanup PASS: release output 2026-08-14-9102
cleanup PASS: QA uninstall registry entry
cleanup PASS: harness user-data marker
cleanup PASS: harness build trust root
```

검증자 도구 timeout을 1초로 잘못 준 최초 시도는 stdout pipe를 끊어 `EPIPE`가 발생했으므로 유효 실행 수에서 제외했다. 그 시도도 `ARO_PROCS=0`, `PY_HTTP=0`, `TEMP_RUNS=0`, release 2개 없음, registry 0으로 정리 후 다시 시작했다.

판정: 하네스 경합은 3회에서 재현되지 않았다. ①은 PASS다.

## 3. ② 인증서 신뢰 루트 설치 흐름 — 결정 8·9

### 실제 동의 화면과 거부

기존 Root 2개를 `.cer`로 백업한 뒤 CurrentUser Root 대응 키 2개만 잠시 제거해 Root 0개 상태를 만들었다. 실제 설치본을 Playwright `_electron`으로 실행하고 네이티브 창을 실제 `PrintWindow` 캡처했다.

화면에 다음 문구가 그대로 나왔다.

```text
아로로지스 자동 업데이트 안내
삼한 사내 앱의 자동 업데이트를 위해 신뢰 루트를 설치하려고 합니다.
승인하면 이 인증서로 서명된 삼한 사내 앱의 업데이트 파일을 신뢰합니다.
설치는 현재 Windows 사용자 계정에만 적용되며 관리자 권한은 필요하지 않습니다.
승인하지 않아도 앱은 계속 사용할 수 있지만 자동 업데이트는 꺼져 있으며 다음 실행 때 다시 안내합니다.
승인하고 자동 업데이트 켜기
이번에는 설치하지 않기
```

증거: `screenshots/01-trust-root-consent-native-real.png`

`이번에는 설치하지 않기`를 실제 네이티브 버튼으로 눌렀다. 앱은 로그인 화면을 계속 사용할 수 있었고 다음 배너와 버튼이 남았다.

```text
자동 업데이트가 꺼져 있습니다. 삼한 사내 앱 업데이트를 신뢰하려면 신뢰 루트 설치가 필요합니다.
신뢰 루트 설치
```

증거: `screenshots/02-declined-update-disabled-banner-real.png`

`다시 묻지 않기`는 네이티브 창과 renderer 어디에도 없었다. 거부 상태를 저장하고 프로세스를 완전히 종료한 뒤 독립 새 설치본을 실행했을 때 동의창이 다시 나타났고, UI Automation으로 같은 두 버튼과 전문을 재확인했다. 결정 9의 재안내는 PASS다.

### 결함 A — 승인해도 CurrentUser Root 설치 실패

배너의 `신뢰 루트 설치` 버튼을 로컬 Playwright CDP로 실제 클릭했다. Root는 0개로 남았고 `installed=false, declined=true`가 유지됐다. 같은 실제 IPC를 await해 얻은 원문:

```text
Error invoking remote method 'trust-root:install': Error: Command failed:
powershell.exe -NoProfile -NonInteractive -Command
Import-Certificate -FilePath '...\resources\arologis-internal-release.cer'
  -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null

Import-Certificate : 이 작업에는 UI를 사용할 수 없습니다.
FullyQualifiedErrorId : InvalidDestinationPath,Microsoft.CertificateServices.Commands.ImportCertificateCommand
```

관리자 권한 부족이 아니라 `-NonInteractive`에서 신뢰 루트 확인 UI를 열 수 없어 실패한다. 승인 후 Root 설치와 자동 업데이트 활성화는 **도달 불가**다. 버튼 클릭 실패가 사용자 화면에 별도 오류로 표시되지 않고 거부 배너만 남는 것도 확인했다.

### 결함 B — 저장된 installed=true가 실제 Root 부재보다 우선

정상 Root가 있던 이전 실행이 만든 실제 상태는 다음이었다.

```json
{"installed":true,"declined":false}
```

그 상태를 보존한 채 Root를 0개로 만든 후 설치본을 실행했다. Playwright에서 실제 반환값:

```text
STALE_ROOT_STATUS={"installed":true,"declined":false,"shouldAskNextRun":false,"shouldBlockApp":false,"updateDisabled":false}
STALE_APP_BODY_VISIBLE=true
ROOT_COUNT=0
```

동의창과 신뢰 루트 배너가 모두 없고 updater가 활성 상태로 판정됐다. 증거: `screenshots/04-root-missing-stale-installed-no-prompt-real.png`. 사용자가 인증서를 삭제했거나 roll-over 후 기존 루트가 사라진 경로에서 재현 가능하다.

### 결함 C — 실제 renderer에서 오류 3계열 문구 소실

메인 단위 테스트는 trust/integrity/network 세 문구를 만들지만, 실제 설치본 renderer의 network 실패 화면은 다음 한 문구였다.

```text
업데이트에 실패했습니다. 인터넷 연결을 확인해 주세요.
```

공통 계약의 network 문구인 `업데이트 서버에 연결하지 못했습니다...`가 표시되지 않았다. renderer가 `kind=error`의 전달 메시지를 위 일반 문구로 치환하므로 trust/integrity도 동일 화면 문구로 수렴한다. 실제 network 화면은 02와 04에 보인다. trust/integrity packaged 오류 유발은 승인 설치 결함 때문에 끝까지 밟지 못했으며 관측 불가로 별도 기록한다.

## 4. ③ 제품별 격리 — 결정 1

공통 계약 테스트는 6/6 PASS였다.

```text
3개 Electron 앱은 서로 다른 제품 prefix와 같은 latest 채널을 사용한다 PASS
beta는 stable prefix를 오염시키지 않고 별도 prefix를 사용한다 PASS
feed URL은 앱별 prefix를 강제하고 잘못된 앱 feed를 거부한다 PASS
```

실제 wrapper에 서로 잘못된 prefix를 주입한 원문:

```text
[release-build] DESKTOP_UPDATE_URL은 /desktop 제품 prefix를 포함해야 합니다.
[arologis-release] AROLOGIS_UPDATE_URL은 /arologis 제품 prefix를 포함해야 합니다.
[internal-chat-release] INTERNAL_CHAT_UPDATE_URL은 /internal-chat 제품 prefix를 포함해야 합니다.
```

아로로지스 실 하네스 feed는 `/arologis/latest.yml`로 3회 200 응답과 설치 왕복을 했다. 설정·설치본 실측:

```text
appId=com.samhanair.arologis.desktop
productName=Arologis Desktop
exe=Arologis Desktop.exe
installer=Arologis Desktop-2026-08-14-9201-x64.exe
feed=/arologis
uninstall DisplayName=Arologis Desktop
```

삼한 `com.samhanair.logis.desktop` / `Samhan Public` 설정으로 덮인 흔적은 없었다. ③은 PASS다.

## 5. ④ 무서명 fail-closed와 signer/root

fresh shell에서 `CSC_LINK`, `CSC_KEY_PASSWORD`를 지우고 올바른 제품 feed를 주입했다.

```text
desktop exit 1
[release-build] CSC_LINK와 CSC_KEY_PASSWORD가 필요합니다. 서명 없는 Electron 릴리스는 허용하지 않습니다.

arologis exit 1
[arologis-release] CSC_LINK와 CSC_KEY_PASSWORD가 필요합니다. 서명 없는 Electron 릴리스는 허용하지 않습니다.

internal-chat exit 1
[internal-chat-release] CSC_LINK이(가) 필요합니다. 사내 feed와 자체서명 인증서를 지정하십시오.
```

세 앱 모두 빌드는 실패했다. 다만 사내 메신저는 공통 전문 전에 기존 앱 전용 검사가 먼저 실패해 요구 전문과 문구가 다르다.

서명된 QA installer는 `Authenticode=Valid`, signer `AE1E...42EC`, 배포 Root `AE1E...42EC`, `MatchesRoot=True`였다. 아로로지스 9101/9102도 3회 모두 `Status=Valid; MatchesRoot=True`였다. ④의 서명 불변식은 PASS다.

## 6. ⑤ 사내 메신저 회귀

### 결함 D — Vitest suite load 및 CI 실패

로컬 실제 명령:

```text
cd clients/internal-chat-desktop
npm test -- --run src/main/auto-update.test.ts

Test Files 1 failed (1)
Tests no tests
Error: Failed to load url ../../../scripts/electron-update-contract.cjs
(resolved id: ../../../scripts/electron-update-contract.cjs)
in .../clients/internal-chat-desktop/src/main/auto-update.ts. Does the file exist?
```

exact SHA CI의 `Internal Chat Desktop`도 같은 원문으로 `1 failed | 3 passed`, `21 passed`, exit 1이다. 공통 계약 도입으로 기존 앱 suite가 깨졌으므로 범위 안 도달 결함이다.

### 결함 E — fresh-shell E2E runner가 새 prefix 계약과 불일치

```text
powershell.exe -NoProfile -File .\scripts\run-internal-chat-release-feed.ps1 -FeedPort 19115

SignerRootMatch=True
[910-feed] build: 2026-08-13-9101
[internal-chat-release] INTERNAL_CHAT_UPDATE_URL은 /internal-chat 제품 prefix를 포함해야 합니다.
FAIL: node exit code 1
exit 1
cleanup PASS: preserve pre-existing certificate AE1E...42EC
cleanup PASS: temporary work ...
```

runner는 `http://127.0.0.1:<port>`를 주입하고 새 wrapper는 `/internal-chat`을 강제해 첫 9101 빌드 전에 막힌다. 따라서 요청된 기존 packaged 동작인 오류 3계열, 9101→9102, 다운그레이드, 데이터 보존은 **하네스 blocker 때문에 관측 불가**다. 이를 결함 0으로 처리하지 않는다.

## 7. ⑥ exact SHA CI

최종 재조회:

```text
SHA=a6f458df8db5f9f1ea47879f7f04ac1de6669226
CI_TOTAL=53
CI_SUCCESS=50
CI_FAILURE=3
```

실패 3건:

1. `Internal Chat Desktop (typecheck + lint + test + build)` — job `94683736680`
   - 원문: `Failed to load url ../../../scripts/electron-update-contract.cjs ... Does the file exist?`
2. `Frontend Desktop (typecheck + lint + build)` — job `94686118312`
   - 원문: 무주입 `build:win`이 이제 서명 필수 문구로 먼저 실패하나 기존 test는 `VITE_APP_VERSION.*명시`를 기대해 assertion 실패. `10 pass, 1 fail`.
3. `App Build Version Guard (scripts/app-build-version, #910/#928)` — job `94683736590`
   - 원문: `clients/arologis-desktop release wrapper의 builder 호출이 없습니다.`. `15 pass, 1 fail`.

결함 F: 공통 계약/아로로지스 wrapper 변경 후 기존 Desktop·App Build Version 계약 테스트가 동기화되지 않아 exact SHA CI가 2개 추가로 깨졌다. CI 3 failure 상태이므로 머지 불가다.

## 8. 캡처 SHA-256 — 중복 0

| 파일 | 크기 | bytes | SHA-256 |
|---|---:|---:|---|
| `01-trust-root-consent-native-real.png` | 834×375 | 28,572 | `1D72D0B9DBC25FC1EDE85A558AD7AD386B3C62F8F8D1931165CC7AFABFF755B1` |
| `02-declined-update-disabled-banner-real.png` | 1874×1217 | 33,484 | `AC1F25EE50823B2D3B6E87BB00DF9EA7F61448B26C8B73EE69541761FDCEE29D` |
| `04-root-missing-stale-installed-no-prompt-real.png` | 1874×1181 | 24,575 | `2DB4084ACCFCD4C47A5B4BBDAEC179AF42EAAD9099DA37332DA1AFFB1ACB0338` |

```text
SCREENSHOT_COUNT=3
DUPLICATE_HASH_GROUPS=0
```

01은 설치본 네이티브 창 자체의 실제 `PrintWindow` 캡처다. 02·04는 실제 설치본 renderer를 로컬 Playwright가 캡처했다. 합성·복제 이미지는 없다. `docs/qa`에는 REPORT와 PNG만 있고 캡처 스크립트는 남기지 않았다.

## 9. 도달 가능한 결함 목록

| ID | 심각도 | 실제 사용자/운영 경로 | 결과 |
|---|---|---|---|
| A | BLOCKER | 최초/거부 후 `신뢰 루트 설치` 승인 | `-NonInteractive Import-Certificate`가 `InvalidDestinationPath`; Root 설치 불가 |
| B | HIGH | 과거 승인 후 Root 삭제·roll-over | 실제 Root 0인데 `installed=true`를 신뢰해 재안내·배너 없이 updater 활성 판정 |
| C | MEDIUM | 아로로지스 updater network/trust/integrity 오류 | 실제 renderer가 공통 3계열 문구를 일반 문구로 덮어씀 |
| D | BLOCKER | 사내 메신저 로컬/CI 테스트 | 공통 CJS 상대경로 load 실패, CI failure |
| E | BLOCKER | 사내 메신저 fresh-shell release E2E | runner feed URL이 `/internal-chat` 없음, 첫 빌드 전에 실패 |
| F | BLOCKER | exact SHA CI | Frontend Desktop 및 App Build Version Guard 계약 테스트 미동기화 |

## 10. 관측 불가와 실패 원문

- 사내 메신저 packaged 오류 3계열·9101→9102·다운그레이드·데이터 보존: E runner가 첫 빌드 전 실패해 관측 불가.
- 아로로지스 trust/integrity 두 오류의 실제 packaged 화면: 승인 설치 A가 막아 end-to-end 유발 관측 불가. network 실제 화면만 관측했다.
- 승인 후 CurrentUser Root 설치·자동 업데이트 활성 화면: A로 도달 불가.
- 검증자 최초 잘못된 1초 timeout: `Error: EPIPE: broken pipe`; 제품 판정에서 제외하고 잔재 0 확인 후 유효 3회를 새로 실행했다.
- Playwright 첫 실행 의존성 미설치: `Cannot find module '@playwright/test'`; `clients/desktop` 패키지 내부에서 기존 lockfile대로 `npm install --ignore-scripts` 후 실제 설치본을 실행했다. 인앱 Browser 런타임을 근거로 삼지 않았다.

## 11. 정리 증명

종료 시 원문:

```text
ROOTS=AE1E1803A1E3B10C518AAE03D1F3C064D3B942EC,32F346D8354B518F6C7D6A12DC6E41FEE1388097
STATE={"installed":true,"declined":false}
UNINSTALL_EXISTS=False
RELEASE_EXISTS=False
TEMP_EXISTS=False
RUNNER_DIR_EXISTS=False
ARO_PROCS=0
CDP_19222=closed
OWNED_CHROME_REMAINING=0
```

- Root 2개와 원래 electron-store 상태를 복원했다.
- QA NSIS 설치 레지스트리, 설치 디렉터리, PFX/CER 백업 임시 폴더, 9201 release 출력, 임시 Playwright runner를 제거했다.
- 아로로지스 앱·로컬 feed·CDP·이번 검증이 띄운 Chromium 프로세스가 0임을 확인했다.
- 다른 트랙의 Docker 컨테이너·프로세스·인증서·데이터는 변경하거나 정리하지 않았다.
