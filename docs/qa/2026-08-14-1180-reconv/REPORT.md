# PR #1180 재수렴 적대검증(SOL) 라이브 QA 보고서

- 대상: `feat/901-claude-conversation`, PR #1180
- 검증 HEAD: `f044db28e52d5c8db39a97f7982d99e80b58ae65` (`gh pr view 1180` 원문 기준)
- 검증일: 2026-08-14 (Asia/Seoul)
- 판정: **도달 가능한 결함 6건**. 진입/명칭, 상단 칩, 6종 픽셀, 클로드 세션 지속성·가상 표기, 본체 채팅 회귀는 통과했다. 1:1 대화 열기, 그룹방 메타데이터, presence 실시간·다중 세션, 앱 완전 종료 정리, 클로드 세션 목록 표현, 내부 설계 용어 노출은 실패했다.
- 방법: 패키지 내부 Playwright의 `_electron`으로 실제 Electron 실행 파일에 연결했다. 캡처는 모두 실 앱 PNG이며 합성·복제하지 않았다. 로컬 Chromium 지정 경로 `C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe`도 존재함을 확인했다.

## 1. 환경 실측과 마이그레이션 처리

### 1.1 RAM과 공유 컨테이너

검증 시작 원문:

```text
FreePhysicalMemory=8360556 KB
TotalVisibleMemorySize=64606096 KB
```

여유 RAM은 약 7.97 GiB로 1.0 GiB 중단 기준보다 컸다.

사용자가 지정한 공유 컨테이너 7개를 이름으로 전수 대조했다. **기대 7 / 존재 7 / 없음 0**이었다. 검증 중 다른 트랙이 일부 컨테이너를 재기동한 것도 관측했다.

```text
samhan-auth-service|infrastructure-auth-service|container 2026-08-13T22:56:30.169049611Z|/app/app.jar|88069798|2026-08-14 07:56:06 +0900
samhan-user-service|infrastructure-user-service|container 2026-08-14T04:37:00.697547126Z|/app/app.jar|93513394|2026-08-14 13:36:00 +0900
samhan-logging-service|infrastructure-logging-service|container 2026-08-14T04:36:16Z|/app/app.jar|101001383|2026-08-14 13:35:58 +0900
samhan-api-gateway|infrastructure-api-gateway|container 2026-08-14T04:36:38Z|/app/app.jar|58582798|2026-08-14 13:35:54 +0900
samhan-dc-config-service|infrastructure-dc-config-service|container 2026-08-14T03:18:34Z|/app/app.jar|93437597|2026-08-14 12:18:05 +0900
samhan-partner-auth-service|infrastructure-partner-auth-service|container 2026-08-14T03:18:34Z|/app/app.jar|93376277|2026-08-14 12:18:02 +0900
samhan-dashboard-service|infrastructure-dashboard-service|container 2026-08-14T04:37:26Z|/app/app.jar|101572654|2026-08-14 13:36:00 +0900
```

이미지 생성 시각 원문:

```text
infrastructure-auth-service:latest|2026-08-13T22:56:26.623644421Z
infrastructure-user-service:latest|2026-08-14T04:36:58.279963918Z
infrastructure-logging-service:latest|2026-08-14T04:36:13.262Z
infrastructure-api-gateway:latest|2026-08-14T04:36:36.555Z
infrastructure-dc-config-service:latest|2026-08-14T03:18:31.367Z
infrastructure-partner-auth-service:latest|2026-08-14T03:18:31.504Z
infrastructure-dashboard-service:latest|2026-08-14T04:37:23.207Z
```

### 1.2 격리 DB 선택 및 재배포 범위

공유 DB에는 마이그레이션을 적용하지 않았다. `qa1180reconv-net`과 PostgreSQL 16 `qa1180reconv-pg`(host 29480)를 만들고, `auth_db`, `user_db`를 UTF-8로 생성했다.

```text
server_encoding=UTF8
auth_db|UTF8|en_US.utf8|en_US.utf8
user_db|UTF8|en_US.utf8|en_US.utf8
```

이 HEAD에서 새로 빌드한 auth/user JAR만 읽기 전용으로 격리 컨테이너에 마운트했다. 공유 `samhan-*` 서비스 재배포는 **0회**다. 워크트리에는 `scripts/redeploy-service.ps1`가 없고 main 체크아웃의 스크립트는 main JAR 및 공유 `samhan-*`를 대상으로 하므로, 대상 HEAD와 격리 원칙을 깨지 않기 위해 사용하지 않았다. 특히 금지된 logging/api-gateway/dc-config/partner-auth/dashboard는 건드리지 않았다.

```text
auth Flyway: 103,104,105,106 모두 success=true
user Flyway: 13 success=true
```

백엔드 빌드 원문:

```text
.\gradlew.bat :services:auth-service:bootJar :services:user-service:bootJar --no-daemon
BUILD SUCCESSFUL in 12s
```

## 2. 정본 §8 결정 A~D 및 항목 1~8 실 앱 결과

### 2.1 명칭 — 통과

- 실제 창 제목, `document.title`, 내부 헤더, Electron `app.getName()` 모두 `삼한 메신저`였다.
- fresh release 빌드 산출물은 `삼한 메신저-2026-08-14-1180-x64.exe`, portable도 같은 제품명이었다.
- NSIS를 격리 경로에 실제 설치했다. 설치 파일 `삼한 메신저.exe`, 바탕 화면 `삼한 메신저.lnk`, 시작 메뉴 `삼한 메신저.lnk`가 생성됐고, 제거 프로그램 실행 후 바로가기 0개를 확인했다.
- 실 앱: [01-entry-name-chips-individual-real-qa.png](screenshots/01-entry-name-chips-individual-real-qa.png)

### 2.2 상단 pill 칩 — 통과

- 실제 앱에 `[개별] [그룹별] [클로드]`가 보였다.
- 계산 스타일: 선택 칩 배경 `rgb(27, 74, 107)`, 글자 흰색; 미선택 배경 `rgb(237, 240, 244)`, 어두운 글자였다.
- 실 앱: [01-entry-name-chips-individual-real-qa.png](screenshots/01-entry-name-chips-individual-real-qa.png), [04-group-room-metadata-real-qa.png](screenshots/04-group-room-metadata-real-qa.png), [05-claude-session-list-real-qa.png](screenshots/05-claude-session-list-real-qa.png)

### 2.3 내 상태와 사용자 상태 아이콘 — 부분 통과

- 칩 아래 내 상태에서 6종을 직접 선택할 수 있었고, 사용자 이름 왼쪽 아이콘이 실제 계산 스타일을 가졌다.
- 메뉴: [02-my-status-menu-real-qa.png](screenshots/02-my-status-menu-real-qa.png)
- 계산 픽셀(모두 `10px × 10px`, `display:block`, `visibility:visible`, `opacity:1`):

| 상태 | 배경색 | 실 캡처 |
|---|---|---|
| 접속 | `rgb(22, 163, 74)` | [10](screenshots/10-presence-available-real-qa.png) |
| 자리비움 | `rgb(245, 158, 11)` | [11](screenshots/11-presence-away-real-qa.png) |
| 부재중 | `rgb(239, 68, 68)` | [12](screenshots/12-presence-absent-real-qa.png) |
| 회의중 | `rgb(27, 74, 107)` | [13](screenshots/13-presence-in_meeting-real-qa.png) |
| 통화중 | `rgb(45, 119, 168)` | [14](screenshots/14-presence-on_call-real-qa.png) |
| 오프라인 | `rgb(148, 163, 184)` | [15](screenshots/15-presence-offline-real-qa.png) |

6색은 모두 서로 달랐다. 다만 다른 사용자 세션 반영과 세션 집계는 2.7에서 실패했다.

### 2.4 개별 — 정렬 통과, 1:1 열기 실패

- 실제 디렉터리 8명은 대표실(order 1) → 영업1팀(2) → 영업2팀(3) → 회계팀(5) 순으로 그룹화됐다.
- 대표실은 `대표 → 부장 → 개발자`였다. `개발자`는 정본 직급 축에 없는 값으로 known rank에 편입되지 않고 후순위로 배치됐다.
- 같은 직급의 입사일 정렬은 모든 seed의 입사일이 `2026-01-01`로 같아 방향성을 구별할 수 없었다.
- 사람을 클릭하면 실제 앱이 `/admin/groupware/chat/rooms/direct/by-employee-code`를 호출했으나 HTTP 404였고, 오른쪽 대화/입력창은 열리지 않았다. 공유 groupware 재배포는 금지돼 있어 현 사용자 경로 그대로 판정했다.
- 실 앱 화면: [01-entry-name-chips-individual-real-qa.png](screenshots/01-entry-name-chips-individual-real-qa.png). 클릭 후 화면은 오프라인 상태 화면과 픽셀 중복이라 제출본에서 제거했으며, HTTP/DOM 원문은 `DIRECT_OPEN|http=404|textarea=0`이다.

### 2.5 그룹별 — 실패

- 9개 실제 방에서 원형 아바타와 방 이름은 보였다.
- 인원수, 마지막 메시지, 시각은 표시되지 않았다. 각 row의 보조 텍스트가 비었고 시각 요소가 없었다.
- 실 앱: [04-group-room-metadata-real-qa.png](screenshots/04-group-room-metadata-real-qa.png)

### 2.6 클로드 — 기능 통과, 세션 목록 표현 실패

- 세션 목록과 `새 세션`이 보였고, 생성 후 선택하면 해당 세션 대화 입력 영역이 열렸다.
- 앱 프로세스를 종료하고 새 Electron 프로세스로 재실행한 뒤에도 동일한 `새 대화` 세션을 다시 찾고 선택했다.
- 그러나 목록은 수직 대화방 행이 아니라 기본 네모 버튼의 가로 나열이며, 11개가 모두 `새 대화`여서 서로 구분할 표시 정보가 없었다. 헤더의 `축 0 권한 보호`도 내부 설계 용어 노출이다. 상세 재현은 9절과 10절에 기록했다.
- 실 앱: [05-claude-session-list-real-qa.png](screenshots/05-claude-session-list-real-qa.png), [06-claude-session-selected-real-qa.png](screenshots/06-claude-session-selected-real-qa.png), [08-claude-session-persist-after-restart-real-qa.png](screenshots/08-claude-session-persist-after-restart-real-qa.png)

### 2.7 presence 실시간·다중 세션·종료 — 실패

- 6종 자체 픽셀은 통과했다.
- 두 Electron 세션 중 A에서 상태를 바꿔도 B의 개발마스터는 처음 5종 동안 계속 오프라인 픽셀이었다: [16-other-session-presence-reflection-real-qa.png](screenshots/16-other-session-presence-reflection-real-qa.png)
- 직접 SSE 원문은 연결됐으나 식별자가 null이었다.

```text
event:connected
data:{"ok":true}
event:presence
data:{"employeeCode":null,"presenceStatus":"OFFLINE","label":"오프라인"}
event:presence
data:{"employeeCode":null,"presenceStatus":"IN_MEETING","label":"회의중"}
```

- 동일 사용자 세션 두 개를 JOIN한 뒤 하나만 LEAVE했을 때 즉시 `OFFLINE`이 됐다.

```text
JOIN|reconv-api-a|200
JOIN|reconv-api-b|200
LEAVE_FIRST|200
AFTER_FIRST|OFFLINE
```

- 실제 Electron 앱을 모두 완전히 닫은 뒤 새 presence 테이블의 `dev_master`는 `AVAILABLE`로 남았다. 반면 화면/`me`가 읽는 값은 이미 `OFFLINE`이었다. 실제 앱 종료 DELETE가 정본 상태를 정리하지 못했다. 관찰자 화면: [18-all-master-apps-closed-offline-real-qa.png](screenshots/18-all-master-apps-closed-offline-real-qa.png)

### 2.8 가상 에이전트 — 통과

- 기본값 OFF: 실제 질문 시 `Claude 자격이 설정되지 않았습니다. 관리자에게 문의해주세요.`로 503이었다: [07-claude-default-off-real-qa.png](screenshots/07-claude-default-off-real-qa.png)
- ON: 실제 화면 응답에 `[가상 에이전트]`가 남았고 API `virtualAgent=true`, 감사 `outbound_status=VIRTUAL_SENT`를 확인했다: [09-virtual-agent-ui-real-qa.png](screenshots/09-virtual-agent-ui-real-qa.png)
- 운영 프로파일 + 가상 ON은 예상대로 기동 실패했다.

```text
PROD_GATE|exited|1
Caused by: java.lang.IllegalStateException: 운영 프로파일에서는 가상 에이전트를 켤 수 없습니다.
```

## 3. 본체 `clients/desktop` 회귀

fresh `npm run build` 성공 후 실제 Electron을 `file:///.../out/renderer/index.html#/chat`로 띄웠다.

- `/#/chat` 진입 및 방 10개 목록: [21-desktop-chat-list-real-qa.png](screenshots/21-desktop-chat-list-real-qa.png)
- 그룹방 `CHAT-20260814-000018` 열기, SSE `200 text/event-stream`.
- UI 전송 `RECONV1180-UI-1786684232373`: 발신자 DOM 1건, REST 재조회 1건.
- 외부 POST `RECONV1180-SSE-1786684232587`: reload 없이 SSE 수신 DOM 1건, REST 1건: [24-desktop-sse-receive-real-qa.png](screenshots/24-desktop-sse-receive-real-qa.png)
- 그룹 메시지 1회가 발신자 화면과 서버에 각각 1건: [23-desktop-group-one-send-real-qa.png](screenshots/23-desktop-group-one-send-real-qa.png)
- 비활성 검색어 `탈퇴` 결과 버튼 0개: [25-desktop-inactive-hidden-real-qa.png](screenshots/25-desktop-inactive-hidden-real-qa.png)

판정: **본체 회귀 전 항목 통과**.

## 4. 권한 계약 유지와 actual-entry 계약 테스트

권한 계약은 이 HEAD에서 fresh 재실행했다.

```text
ClaudeVirtualAgentPropertiesTest|2|fail 0|error 0|skip 0
VirtualClaudeModelClientTest|1|0|0|0
ClaudeConversationPermissionIT|8|0|0|0
ClaudeVirtualAgentPermissionIT|3|0|0|0
TOTAL|14|failures 0|errors 0|skipped 0
BUILD SUCCESSFUL in 37s
```

`actual-entry.contract.test.ts`는 `src/renderer/main.ts`가 `ChatApp`을 생성하고 `MemoryRouter`/`basename`을 쓰지 않는지, 그리고 **기존 build 결과물 문자열**에 `클로드`, `page-chips`가 있는지 정적으로 검사한다. 로컬에서 build 후 단독 실행하면 2/2 통과했고 실제 Electron도 v2 진입을 증명했다. 그러나 이 테스트 자체가 Electron이나 DOM을 실행하는 것은 아니므로 “실제 앱이 연다”를 단독으로 단정하는 테스트는 아니다.

현재 PR CI의 `Internal Chat Desktop (typecheck + lint + test + build)`는 red다. CI가 build 전에 test를 실행해 `out/renderer/assets`가 없어 실패했다.

```text
Error: ENOENT: no such file or directory, scandir '/home/runner/work/Samhan-Public/Samhan-Public/clients/internal-chat-desktop/out/renderer/assets'
Test Files  1 failed | 35 passed
```

이는 실 사용자 결함 목록에는 넣지 않았지만, 계약 테스트가 fresh CI 순서를 견디지 못한다는 검증 결과다.

## 5. 실 캡처 SHA-256

최종 실 캡처 **21장**, SHA-256 중복 그룹 **0**이다. 픽셀이 완전히 같았던 중간 캡처 5장은 제출 전에 제거했다. 검증 보고서 보강 중 다른 트랙이 같은 폴더에 추가한 `round-fix-repro-electron-entry.png`는 사용자 산출물이므로 삭제하지 않고 해시 목록에 포함했다.

- `01-entry-name-chips-individual-real-qa.png` — `017e6092de5f5e935ddcf1f3254278a27bac0cecf5398e0db04af646736dd2a2`
- `02-my-status-menu-real-qa.png` — `4840759e98c84410efd351b3851ef80eb1670dc992c461673a1963a0b27d0988`
- `04-group-room-metadata-real-qa.png` — `5fed50c56bf40112b5754e331282f80729db24452ea5a7b3ae057e9746611d65`
- `05-claude-session-list-real-qa.png` — `9f6ee37abe9bcf70f4ac6ea0951f50de73971fc13fd2061d8f1c7d189c13e253`
- `06-claude-session-selected-real-qa.png` — `bdef58ec2d74034de86b2c52badd52160ce9f75f65aeddc2578cd3d24a683782`
- `07-claude-default-off-real-qa.png` — `120977fa6d669a886b53da398186eb90943f3aa3595e20f1351b5daf7379e695`
- `08-claude-session-persist-after-restart-real-qa.png` — `64c979e561db48374dd53b68307ea0e4d4c04edd4b67977454bb6bd512d9bfef`
- `09-virtual-agent-ui-real-qa.png` — `6dbc71276445d2d1acf4fdbf34f233cb90b27cd1a0dbdc0634593a240c20d8da`
- `10-presence-available-real-qa.png` — `68b6a44e724731b5a5e9b21c8e9550d2fbec04e0b5c19af0dbaba6840d1770b7`
- `11-presence-away-real-qa.png` — `de23d69cc1467d9070bc69bad2df2d96294b366f478ec3571c61e92d21d59d8c`
- `12-presence-absent-real-qa.png` — `69242511fd938d62eebcb1117c1fc61717eff26599a8301f19da6569b1347aed`
- `13-presence-in_meeting-real-qa.png` — `34696ea7580a5af35fad1c550e0e62cf4b58605021e30f43d2fa9d91ad3094af`
- `14-presence-on_call-real-qa.png` — `7a04d12f5329b2a4fea1205fa723b5dbc4abf440c5dfe2fc0f3d65d2a136f525`
- `15-presence-offline-real-qa.png` — `61b21c9b7bdfe1ce29bd15a3d6528d6b1f6a2b5ca2d9fe6f4c133ec181b8a537`
- `16-other-session-presence-reflection-real-qa.png` — `389589cadb4c650a4533fcb2473324edac593e8e0076a952ce909490279728d1`
- `18-all-master-apps-closed-offline-real-qa.png` — `9a4c22f3b0b0fac2e5d361d57b768313d4c43ca37040078d038d0f90ab94d820`
- `21-desktop-chat-list-real-qa.png` — `0638c1f454d6f480c610f4f6bd5c3c977f533bfd989774e7b5c2fc7b5bf34adf`
- `23-desktop-group-one-send-real-qa.png` — `e162f89dab7b1096e71934773bf1b47600d05951b4b11d2e70f18029ed30b727`
- `24-desktop-sse-receive-real-qa.png` — `9e12fb0204670b1ec779ae745ecad9863f24080e9d167521b3ab241cbbc6b4ac`
- `25-desktop-inactive-hidden-real-qa.png` — `72c96009522a79cd07e630a22c8e13376a2cdcbe83bb2a799be0d10d6ab1da00`
- `round-fix-repro-electron-entry.png` — `03f43ed8937a8dd90126661f3f305b3b8dc90845674b5f073801ee1391a40c31`

## 6. 도달 가능한 결함 목록

1. **개별 1:1 대화 열기 실패** — 사람 클릭 시 실제 HTTP 404, 대화창/입력창 미생성.
2. **그룹별 방 계약 미완료** — 실제 목록에 아바타·방 이름만 있고 인원수·마지막 메시지·시각이 없다.
3. **presence 실시간·다중 세션 실패** — SSE `employeeCode:null`, 다른 사람 화면 미반영, 두 세션 중 하나만 LEAVE해도 OFFLINE.
4. **앱 완전 종료 후 AVAILABLE 잔존** — 실제 Electron 전부 종료 뒤 DB 정본에 `dev_master=AVAILABLE`이 남는다.
5. **클로드 세션 목록이 가로 기본 버튼 나열** — 11개 세션이 모두 `새 대화`로 표시돼 사용자가 세션을 구분할 수 없고, 정본 §5의 수직 대화방 목록 형태를 따르지 않는다.
6. **내부 설계 용어·원시 식별자 노출** — `축 0 권한 보호`가 클로드 헤더에 노출되며, 다른 화면 전수 훑기에서도 원시 `CHAT-…` 방 코드와 `[DEV-SEED]` 검증 데이터 접두사를 확인했다.

## 7. 관측 불가·실패 원문과 미결정 관측

- 입사일 정렬: seed 8명의 입사일이 모두 같아 동률 내부의 입사일 방향은 관측 불가. 입사일 공백 직원 위치는 미결정 사항으로 결함 미산정.
- 안읽음/`+`, 개별 안읽음, 수동 상태 해제 시점은 미결정 사항으로 관측만 하고 결함 미산정.
- 격리 user 첫 기동은 필수 환경변수 누락을 정확히 내고 종료했다. 값을 주입해 재기동 후 health 통과했다.

```text
java.lang.IllegalStateException: QA_MASTER_PASSWORD 환경변수가 필요합니다.
```

- 첫 release 시도는 버전 환경변수 누락으로 종료했고, `VITE_APP_VERSION=2026/08/14-1180`을 주입한 fresh build는 성공했다.

```text
[internal-chat-release] VITE_APP_VERSION에 YYYY/MM/DD-{번호} 형식의 버전이 필요합니다.
```

- 실제 1:1 실패 원문: `DIRECT_OPEN|http=404|textarea=0`.
- 현재 PR check 원문 요약: Playwright SUCCESS, Desktop Playwright mock gate SUCCESS, GitGuardian SUCCESS, Internal Chat Desktop FAILURE(actual-entry fresh out 없음).

## 8. 공유 DB에 만든 것과 정리

- 공유 DB 스키마/마이그레이션 생성: **0**.
- 공유 groupware 기존 그룹방 `CHAT-20260814-000018`에 QA 메시지 2건을 생성했다.
  - `RECONV1180-UI-1786684232373`
  - `RECONV1180-SSE-1786684232587`
- 공유 auth 로그인으로 해당 QA 계정의 마지막 로그인 시각이 갱신됐다.
- 개별 1:1 방은 404여서 공유 DB에 생성되지 않았다.
- Claude 세션·감사, presence, Flyway V103~V106/V13 데이터는 모두 격리 DB에만 만들었다. 보고서 작성 후 격리 컨테이너·볼륨 없는 임시 DB·네트워크를 제거했다.
- 실행한 Electron/Chromium/프록시 프로세스, 임시 Playwright 하네스, 실제 설치본과 바로가기를 종료·제거했다.

## 9. 결함 5·6 현재 상태 캡처와 재현 경로

### 9.1 결함 5 — 클로드 세션 목록

재현 경로:

```text
삼한 메신저 실제 Electron 실행
→ 상단 [클로드] pill 선택
→ 서버 세션 목록 로드 완료 대기
```

실 앱 캡처: [05-claude-session-list-real-qa.png](screenshots/05-claude-session-list-real-qa.png)

관측 결과:

- `[새 대화]` 기본 네모 버튼 11개가 한 줄에 가로로 나열됐다.
- 아바타, 마지막 메시지, 시각, 수직 행 여백이 없다.
- 표시 제목이 11개 모두 `새 대화`여서 어느 세션인지 구분할 정보가 0이다.
- 정본 §5의 `[아바타] 이름·인원수 / 마지막 메시지 / 시각` 형태 및 §7의 현대적 메신저 기준과 다르다.

서버/클라이언트 데이터 경계를 확인했다.

```text
서버 응답 계약: sessionCode, title, messageCount
실제 표시 코드: title만 렌더링
서버 생성 기본 title: "새 대화"
DB에는 BaseEntity의 createdAt이 있으나 현재 ClaudeSessionResponse에는 생성 시각이 없음
마지막 메시지와 마지막 메시지 시각도 현재 세션 목록 응답에는 없음
```

즉 서버가 실제 가진 공개 응답 값 중 세션별 `sessionCode`와 `messageCount`는 클라이언트가 받지만 목록에 표시하지 않는다. 다만 `sessionCode`는 사용자용 제목으로 노출할 기술 식별자가 아니며, `messageCount`만으로도 세션 내용을 구분할 수 없다. 생성 시각·마지막 대화 요약·마지막 대화 시각은 현재 API 응답에 없으므로 검증자가 값을 지어내지 않았다.

### 9.2 결함 6 — 내부 설계 용어 노출

같은 재현 경로의 실제 헤더에 `축 0 권한 보호`가 노출된다. `축 0`은 권한 설계 내부 용어이고 사용자에게 의미가 설명되지 않는다.

- 세션 목록: [05-claude-session-list-real-qa.png](screenshots/05-claude-session-list-real-qa.png)
- 세션 선택 후에도 동일: [06-claude-session-selected-real-qa.png](screenshots/06-claude-session-selected-real-qa.png)
- 오류 및 가상 응답 상태에서도 동일: [07-claude-default-off-real-qa.png](screenshots/07-claude-default-off-real-qa.png), [09-virtual-agent-ui-real-qa.png](screenshots/09-virtual-agent-ui-real-qa.png)

## 10. 내부 용어·코드·식별자 노출 훑기

훑은 범위:

- 제출 폴더의 실제 앱 캡처 21장 전부
  - 삼한 메신저: 개별, 상태 메뉴와 6종 상태, 그룹별, 클로드 목록·선택·기본 OFF·재시작·가상 응답, 다중 세션/종료 상태
  - 본체 `clients/desktop`: 채팅 목록, 그룹 전송, SSE 수신, 비활성 직원 검색
  - 다른 트랙이 추가한 entry 재현 캡처 1장: 네트워크 미연결 상태의 개별 화면이며, 내부 설계 용어·원시 식별자 추가 노출은 없음
- 실제 v2 진입 렌더러 `clients/internal-chat-desktop/src/renderer/ChatApp.tsx`의 화면 출력 문자열과 식별자 fallback
- 클로드 세션 API 응답 계약 및 auth-service의 세션 생성·목록 DTO

찾은 고유 노출 유형은 **3종**이다.

| 유형 | 실제 노출 | 위치/건수 | 판정 |
|---|---|---|---|
| 내부 설계 용어 | `축 0 권한 보호` | 클로드 상태 캡처 5장에 동일 헤더 | 결함 6 핵심 |
| 원시 시스템 방 코드 | `CHAT-20260814-000019`~`000026` | 그룹별 목록 8행. `roomName`·`partnerName`이 없을 때 `roomCode`를 표시하는 fallback | 결함 6 범위의 식별자 노출 |
| 검증 데이터 표식 | `[DEV-SEED]` | 개별/그룹별 사용자 이름 8명 | 서버가 준 표시 이름이지만 사용자 화면에 내부 seed 표식이 그대로 노출됨 |

증거:

- 그룹방 원시 코드: [04-group-room-metadata-real-qa.png](screenshots/04-group-room-metadata-real-qa.png)
- 사용자 이름의 seed 접두사: [01-entry-name-chips-individual-real-qa.png](screenshots/01-entry-name-chips-individual-real-qa.png)

추가로 확인했으나 노출되지 않은 것:

- UUID: 없음.
- 클로드 `sessionCode`(`CLD-…`): 서버 응답에는 있으나 화면에는 없음.
- `employeeCode`: API와 상태 이벤트에는 있으나 화면에는 없음.
- 본체의 `MASTER`는 프로젝트에서 정한 사용자 역할 풀네임이며 내부 축/코드 노출로 세지 않았다.
- `기본값 OFF 검증`, `RECONV1180-…` 등은 QA가 직접 입력한 메시지이므로 제품이 생성한 내부 용어로 세지 않았다.

본 절은 현 상태 검증 기록이며 코드 수정이나 수정안 적용은 하지 않았다. 결함 5·6의 fix와 최종 형태 검증은 다음 LUNA 스테이지 대상이다.
