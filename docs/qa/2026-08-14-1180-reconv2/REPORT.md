# PR #1180 재수렴 라이브 QA 보고서 (SOL)

- 대상: `#901` 삼한 메신저 창 구조 개편
- PR: `#1180`
- 검증 SHA: `091f1bb59f7d3de451bd82244dc4c55f067c7907`
- 검증일: 2026-08-14 (Asia/Seoul)
- 판정: **도달 가능한 제품 결함 3건, exact SHA CI RED**
- 실행 원칙: `clients/internal-chat-desktop` 및 `clients/desktop`의 실제 `electron-vite` 산출물을 로컬 Playwright `_electron`으로 실행했다. 이 보고서의 PNG는 모두 실제 Electron 창 캡처이며 합성·복제 이미지는 없다.

## 1. 환경 실측 및 마이그레이션 처리

### 1.1 호스트 자원 원문

```text
FreePhysicalMemoryKB=24448004
FreeGB=23.315
TotalGB=61.613
```

여유 RAM은 1.0GB보다 컸으므로 검증을 계속했다.

### 1.2 공유 스택 컨테이너와 이미지/JAR 시각

`docker-compose.yml`과 `docker-compose.local-all.yml`의 기대 컨테이너 이름을 합쳐 대조했다.

```text
EXPECTED=24
PRESENT=22
MISSING=2
MISSING_NAMES=samhan-prometheus,samhan-nginx
```

관련 실행 컨테이너의 원문은 다음과 같다.

```text
samhan-auth-service|image=infrastructure-auth-service|imageCreated=2026-08-13T22:56:26.623644421Z|containerCreated=2026-08-13T22:56:30.169049611Z|jar=88069798|2026-08-14 07:56:06 +0900
samhan-user-service|image=infrastructure-user-service|imageCreated=2026-08-14T05:20:23.311931633Z|containerCreated=2026-08-14T05:20:25.937722564Z|jar=93513394|2026-08-14 14:18:49 +0900
samhan-groupware-service|image=infrastructure-groupware-service|imageCreated=2026-08-13T23:56:15.493478861Z|containerCreated=2026-08-13T23:56:17.615205861Z|jar=99438783|2026-08-14 08:56:03 +0900
samhan-logging-service|image=infrastructure-logging-service|imageCreated=2026-08-14T05:19:12.188258155Z|containerCreated=2026-08-14T05:19:14.58675043Z|jar=101001383|2026-08-14 14:18:48 +0900
samhan-api-gateway|image=infrastructure-api-gateway|imageCreated=2026-08-14T05:19:50.935899911Z|containerCreated=2026-08-14T05:19:52.478500604Z|jar=58582798|2026-08-14 14:18:44 +0900
samhan-dc-config-service|image=infrastructure-dc-config-service|imageCreated=2026-08-14T05:21:39.647068115Z|containerCreated=2026-08-14T05:21:42.251038319Z|jar=93437597|2026-08-14 14:18:49 +0900
samhan-partner-auth-service|image=infrastructure-partner-auth-service|imageCreated=2026-08-14T05:22:16.002053777Z|containerCreated=2026-08-14T05:22:18.511008754Z|jar=93376277|2026-08-14 14:18:45 +0900
samhan-dashboard-service|image=infrastructure-dashboard-service|imageCreated=2026-08-14T05:21:02.906161742Z|containerCreated=2026-08-14T05:21:05.343255891Z|jar=101572654|2026-08-14 14:18:49 +0900
```

### 1.3 선택한 마이그레이션 방식

공유 DB에는 V103~V106/V13~V14를 적용하지 않았다. `qa1180reconv2-net` 전용 네트워크와 tmpfs PostgreSQL `qa1180reconv2-pg`를 만들고, 이 워크트리에서 새로 빌드한 `auth-service`와 `user-service` JAR만 격리 실행했다. 공유 스택 재배포는 **0회**다. 이 워크트리에는 `scripts/redeploy-service.ps1`가 없었으며, 다른 워크트리의 스크립트/산출물을 가져와 공유 서비스를 바꾸지 않았다.

DB를 만들고 서비스 실행 전에 확인한 인코딩 원문:

```text
UTF8
auth_db|UTF8|en_US.utf8|en_US.utf8
user_db|UTF8|en_US.utf8|en_US.utf8
```

빌드 원문:

```text
.\gradlew.bat :services:auth-service:bootJar :services:user-service:bootJar --no-daemon
BUILD SUCCESSFUL in 13s
```

새 DB의 적용 결과:

```text
auth_db: 103|true, 104|true, 105|true, 106|true
user_db: 13|true
```

그러나 `user-service` V14는 새 DB에서 실패했다.

```text
Migration V14__create_messenger_presence_sessions.sql failed
SQL State  : 42601
ERROR: syntax error at or near ")"
CREATE TABLE messenger_presence_sessions (...,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
)
```

즉, V14의 마지막 컬럼 뒤 쉼표 때문에 exact HEAD `user-service`는 새 DB에서 기동할 수 없다. 이는 아래 결함 1이다.

## 2. ① 창 구조 및 presence

### 2.1 실제 Electron 창 구조

- 메인 창은 목록 전용이며 좌우 분할이 없었다: [접속 상태 메인 목록](screenshots/10-presence-접속-real-qa.png)
- 1:1 방 클릭 시 별도 BrowserWindow가 열렸다: [1:1 방 창](screenshots/16-contract-direct-window-real-qa.png)
- 그룹 방과 클로드 세션도 각각 별도 창으로 열렸다: [그룹 방 창](screenshots/17-contract-group-metadata-real-qa.png), [클로드 방 창](screenshots/03-claude-child-window-real-qa.png)
- 같은 방을 재클릭해도 창 수는 2(메인+방)로 유지되어 중복 창이 생기지 않았고 기존 창이 앞으로 왔다.
- 방 창 bounds를 바꾼 뒤 닫고 다시 열어 같은 값으로 복원됨을 확인했다.

```text
BOUNDS_DEDUPE|set={"x":140,"y":150,"width":720,"height":640}|restored={"x":140,"y":150,"width":720,"height":640}|windows=2
```

복원된 실제 창: [1:1 방 위치·크기 복원](screenshots/05-direct-restored-deduped-real-qa.png)

### 2.2 presence 생명주기

실제 빌드 산출물 계약 실행 원문:

```text
ELECTRON_CONTRACT|direct=2|windows=deduped|group=metadata|presence=reflected|join=1|childCloseLeave=0|leave=1
```

관측 결과:

- 방 창 여러 개를 열어도 `join=1`이었다.
- 방 창만 닫을 때 `childCloseLeave=0`이었다.
- 메인 창을 닫고 방 창을 남긴 단계에서도 leave 요청은 없었고, 마지막 방 창 종료 시에만 `leave=1`이었다.
- 따라서 정본의 “메인 창을 닫아도 대화방 창이 남아 있으면 접속” 생명주기는 실행 로그에서 충족했다.

다만 **메인 창을 닫은 뒤 방 창만 남은 순간의 별도 PNG**는 보조 캡처 하네스가 응답하지 않아 남기지 못했다. 그 단계의 실행 원문은 위 계약 로그이며, 이미지 근거는 [남아 있는 방 창](screenshots/16-contract-direct-window-real-qa.png)까지다.

## 3. ② 클로드 세션 목록

### 3.1 프런트 창 구조/디자인

실제 Electron에 정본의 세 상태 데이터를 주입해 확인했을 때:

- 가로 버튼 나열이 아닌 수직 목록이었다.
- 각 행은 `[아바타] 제목 / 마지막 대화 한 줄 / 시각` 구조였다.
- 행은 높이 78px, 다음 행 top 차이는 86px로 8px 여백으로 분리됐다.
- 구분선, hover 테두리, 선택 테두리가 없었다. hover는 연한 배경만 사용했다.
- 실제 요약, 가상 에이전트, 자격 미설정 제목이 서로 구분됐다.

캡처: [세 상태 수직 목록](screenshots/02-claude-list-real-virtual-nocred-real-qa.png), [hover 무테두리](screenshots/07-claude-hover-no-border-real-qa.png), [세션 별도 창](screenshots/19-contract-claude-list-real-qa.png)

computed style 원문:

```text
CLAUDE_DESIGN=[
  {"top":255,"left":0,"width":688,"height":78,"border":"0px none rgb(0, 0, 0)","outline":"rgb(0, 0, 0) none 0px","background":"rgba(0, 0, 0, 0)"},
  {"top":341,"left":0,"width":688,"height":78,"border":"0px none rgb(0, 0, 0)","outline":"rgb(0, 0, 0) none 0px","background":"rgb(237, 240, 244)"},
  {"top":427,"left":0,"width":688,"height":78,"border":"0px none rgb(0, 0, 0)","outline":"rgb(0, 0, 0) none 0px","background":"rgba(0, 0, 0, 0)"}
]
```

### 3.2 실제 auth-service 데이터 경로

격리한 실제 `auth-service`에서 일반 세션과 가상 에이전트 세션을 각각 생성한 뒤 실제 Electron 목록을 열었다. API 및 화면 모두 두 세션을 구분하지 못했다.

```text
SESSION_LIST|count=2|titles=새 대화 / 새 대화|messageCounts=1,1|summaryModeFields=0|lastMessageFields=0
REAL_AUTH_CLAUDE_ROWS=["새새 대화대화를 시작해 보세요.","새새 대화대화를 시작해 보세요."]
```

[실제 auth 목록—가상 표시 없는 두 개의 새 대화](screenshots/08-real-auth-claude-list-unmarked-virtual-real-qa.png)

따라서 프런트가 지원하는 레이아웃과 달리 실제 API 계약은 요약/마지막 대화/가상 여부를 제공하지 않는다. 이는 아래 결함 2다.

## 4. ③ 내부 용어 노출

삼한 메신저 독립 앱의 발신자·상태 라벨·그룹 제목·상대 이름·세션 제목을 실제 창에서 훑었다. `축 0`, 화면상의 원시 `CHAT-...`, `[DEV-SEED]`는 발견하지 못했다.

그러나 회귀 대상인 본체 `clients/desktop`의 실제 `/#/chat` 사용자 화면에는 다음이 노출됐다.

- 상단 사용자: `[DEV-SEED] 개발마스터 · MASTER`
- 방 목록 상대: `[DEV-SEED] 개발매니저 · 대표실`

증거: [본체 채팅 목록](screenshots/21-desktop-chat-list-real-qa.png), [본체 방 열기](screenshots/22-desktop-room-open-real-qa.png). 이는 아래 결함 3이다. 원시 `CHAT-...`는 네트워크 URL에는 있었지만 화면에는 노출되지 않았다.

## 5. ④ 정본 §7 디자인 대조

실제 Electron 캡처 기준 체크 결과:

| 정본의 체크 가능한 기준 | 결과 | 근거 |
|---|---|---|
| 메인 창은 목록에 집중 | 충족 | [메인 목록](screenshots/10-presence-접속-real-qa.png) |
| 방은 독립 창이고 정보 계층이 분리됨 | 충족 | [1:1](screenshots/16-contract-direct-window-real-qa.png), [그룹](screenshots/04-group-child-window-real-qa.png), [클로드](screenshots/03-claude-child-window-real-qa.png) |
| 클로드 목록은 수직 행 | 충족 | [클로드 목록](screenshots/02-claude-list-real-virtual-nocred-real-qa.png) |
| 아바타/제목/마지막 한 줄/시각 | 프런트 충족, 실제 API 미충족 | [실제 API 목록](screenshots/08-real-auth-claude-list-unmarked-virtual-real-qa.png) |
| 행 구분선 없음, 여백으로 구분 | 충족 | computed style 및 [hover 캡처](screenshots/07-claude-hover-no-border-real-qa.png) |
| hover/선택 테두리 없음 | 충족 | `border: 0px none`, `outline: none` |
| 내부 구현 용어 비노출 | 독립 앱 충족, 본체 회귀 화면 미충족 | [본체 목록](screenshots/21-desktop-chat-list-real-qa.png) |

## 6. ⑤ 회귀

### 6.1 권한 계약 14/14

캐시를 배제하기 위해 대상 네 클래스에 `--rerun-tasks`를 지정했다.

```text
ClaudeVirtualAgentPropertiesTest|tests=2|failures=0|errors=0|skipped=0
VirtualClaudeModelClientTest|tests=1|failures=0|errors=0|skipped=0
ClaudeConversationPermissionIT|tests=8|failures=0|errors=0|skipped=0
ClaudeVirtualAgentPermissionIT|tests=3|failures=0|errors=0|skipped=0
TOTAL|tests=14|failures=0|errors=0|skipped=0
BUILD SUCCESSFUL in 51s
```

독립 앱 패키지 테스트도 `9 files, 42 tests passed`였다.

### 6.2 본체 `clients/desktop` 실제 사용자 경로

`npm run build` 성공 후 실제 Electron에서 공유 개발 스택에 로그인해 `/#/chat`을 밟았다.

- 본체 진입: [데스크톱 실제 진입](screenshots/20-desktop-entry-real-qa.png)
- 목록 진입: [채팅 목록](screenshots/21-desktop-chat-list-real-qa.png)
- 방 열기: [그룹 방](screenshots/22-desktop-room-open-real-qa.png)
- UI 전송 1건: [UI 전송](screenshots/23-desktop-ui-send-real-qa.png)
- 외부 POST 후 SSE 반영: [SSE 수신](screenshots/24-desktop-sse-receive-real-qa.png)
- 비활성 직원 검색 결과 0: [비활성 직원 숨김](screenshots/25-desktop-inactive-hidden-real-qa.png)

```text
DESKTOP_LIVE|ui=RECONV2-1180-UI-1786691370062|sse=RECONV2-1180-SSE-1786691370062|post=200|rest={"status":200,"ui":1,"ext":1}|sseResponses=[{"status":200,"path":"/admin/groupware/chat/rooms/CHAT-20260814-000018/stream"}]|inactiveButtons=0
```

### 6.3 presence 6종/SSE/수동 우선

실제 Electron 렌더에서 6종이 서로 다른 픽셀로 표시됐다.

- [접속](screenshots/10-presence-접속-real-qa.png)
- [자리비움](screenshots/11-presence-자리비움-real-qa.png)
- [부재중](screenshots/12-presence-부재중-real-qa.png)
- [회의중](screenshots/13-presence-회의중-real-qa.png)
- [통화중](screenshots/14-presence-통화중-real-qa.png)
- [오프라인](screenshots/15-presence-오프라인-real-qa.png)
- SSE 렌더 반영: [presence SSE](screenshots/18-contract-presence-sse-real-qa.png)

프런트의 여섯 상태 선택 PUT과 SSE 반영은 실행했다. 하지만 exact `user-service`가 V14에서 기동 실패했으므로 실제 백엔드를 통한 6종 저장·실시간 전파·수동 우선은 **관측 불가**다. 이 미실행 구간을 통과로 판정하지 않는다.

### 6.4 가상 에이전트 기본 OFF/API/감사/운영 차단

기본 OFF 실제 auth 경로:

```text
DEFAULT_OFF|http=503|code=CLAUDE_CREDENTIAL_NOT_CONFIGURED
AUDIT|RECONV2-1180-OFF|NOT_SENT
```

[자격 미설정 실제 화면](screenshots/09-default-off-real-auth-real-qa.png)

가상 에이전트 ON 격리 인스턴스:

```text
HTTP=200|virtualAgent=true|answer=[가상 에이전트] ...
AUDIT|RECONV2-1180-VIRTUAL|VIRTUAL_SENT
```

[가상 에이전트 실제 화면/API 표기](screenshots/10-virtual-agent-real-auth-real-qa.png)

운영 프로파일에서는 기동이 차단됐다.

```text
qa1180reconv2-auth-prod exited 1
Caused by: java.lang.IllegalStateException: 운영 프로파일에서는 가상 에이전트를 켤 수 없습니다.
```

## 7. ⑥ exact SHA CI

`gh pr view 1180` 및 exact SHA run 목록을 대조했다. SHA는 `091f1bb59f7d3de451bd82244dc4c55f067c7907`로 일치한다.

```text
Applied Flyway Guard|31776052804|success
Harness Guard|31776052778|failure
Docs Guard|success
arologis CI|success
QA E2E|success
CI|31776048383|failure
```

결론은 **CI RED**다. 변경된 “build 이후 Electron 계약 테스트” 잡은 실제로 돌지 않았다. workflow 파일의 해당 부분은 다음처럼 step 들여쓰기가 잘못돼 `실제 Electron 계약 테스트`가 이전 step 아래에 중첩돼 있다.

```yaml
    - name: source build (electron-vite)
      run: npm run build

      - name: 실제 Electron 계약 테스트
        run: xvfb-run -a npm run test:electron-contract
```

CI run `31776048383`에서 실 작업 대신 보고용 `JUnit 테스트 결과 (arologis-service)`만 success였고 내부 채팅 데스크톱 job은 생성/실행되지 않았다. Harness Guard run `31776052778`도 61개 통과, 1개 실패였다. 실패 원인은 실제 계약 스크립트가 `docs/qa` 경로에 직접 쓰는 정책 위반이다. 이는 제품 사용자 경로 결함 수에는 포함하지 않고 CI 상태로만 기록한다.

## 8. 도달 가능한 제품 결함

### 결함 1 — V14 문법 오류로 새 DB에서 user-service 기동 불가

- 경로: 새 UTF-8 PostgreSQL → exact HEAD `user-service` 시작
- 결과: `V14__create_messenger_presence_sessions.sql`의 마지막 컬럼 뒤 쉼표에서 SQLSTATE 42601
- 영향: presence 세션, 6종 상태의 실제 저장/SSE/수동 우선 경로 전체가 배포 단계에서 차단됨

### 결함 2 — 실제 클로드 세션 목록이 모두 “새 대화”이며 가상 세션도 구분되지 않음

- 경로: 실제 auth API에서 일반/가상 세션 생성 → 실제 Electron 클로드 목록
- 결과: 두 제목 모두 `새 대화`, 마지막 대화/요약 mode 필드 없음, 가상 세션 표시 없음
- 영향: 정본 §5-b의 요약 제목/마지막 대화와 “가상이면 제목도 가상임이 드러나야 함”을 위반

### 결함 3 — 본체 채팅 실제 화면에 `[DEV-SEED]` 노출

- 경로: `clients/desktop` 로그인 → `/#/chat` → 목록/방 열기
- 결과: 로그인 사용자와 대화 상대 이름에 `[DEV-SEED]`가 그대로 표시됨
- 영향: 내부 개발 접두사 사용자 노출 0건 계약 위반

도달 가능한 제품 결함 합계: **3건**.

## 9. 관측 불가 및 실행 실패 원문

1. exact `user-service`가 V14에서 실패했으므로 실제 백엔드 presence 6종 저장, 실제 SSE 전파, 수동 우선은 관측 불가다. 실패 원문은 §1.3에 수록했다.
2. 메인 창 종료 후 방 창만 남은 상태는 실제 계약 실행에서 `leave=0`으로 밟았으나, 그 순간을 추가 PNG로 남기는 보조 `_electron` 평가가 반환되지 않아 종료했다. 따라서 별도 화면 캡처 근거는 관측 불가로 둔다.
3. 첫 보조 하네스에서 PowerShell→Node 전달 중 한국어 selector가 `??`로 변형돼 다음 오류가 났다. UTF-8 파일 기반 실행으로 바꾼 뒤 실제 캡처를 완료했다.

   ```text
   SyntaxError: Invalid regular expression: /?? ?? ??/: Nothing to repeat
   ```

4. 클로드 입력의 최초 접근성 이름을 `메시지 본문`으로 잘못 가정해 timeout이 났다. 실제 이름 `클로드 질문`으로 정정한 실행은 통과했다.

   ```text
   getByRole('textbox', { name: '메시지 본문' }) timed out
   ```

5. 본체 첫 로그인에서 존재하지 않는 `QA_MASTER_PASSWORD` 환경 키를 써 HTTP 401이 났다. seed가 사용하는 `QA_DEV_DEFAULT_PASSWORD`로 다시 실행해 §6.2의 사용자 경로를 완료했다.

개발책임자 미결정 항목은 결함으로 세지 않았다. 상단 `안읽음`/`+`와 개별 목록 안읽음 표시는 이번 데이터에서 보이지 않았고, 입사일 공백 직원 위치와 수동 상태 해제 시점은 exact 백엔드 차단으로 관측하지 못했다.

## 10. 실제 캡처 SHA-256

```text
02-claude-list-real-virtual-nocred-real-qa.png|26d8c2199637bb1148def01c0580ce95b8cc2c69ab1af7e4b55d4131a155a3fd
03-claude-child-window-real-qa.png|609330a4f10b111e337c9c144fd378dff5f3184f44f27891a5df567b54cd5252
04-group-child-window-real-qa.png|cffee97ac12edc19b8ec30a3fc894ccacf2665022b116f10a8a722686bebbf7d
05-direct-restored-deduped-real-qa.png|04799db7abacf189fbb1aa58fb7a136b8546bfeb81849fe01f23fc6d99a85624
07-claude-hover-no-border-real-qa.png|e183d27123f7fff46eb54fc373c0bded1a498a39a8df8535c122f3c00295c026
08-real-auth-claude-list-unmarked-virtual-real-qa.png|bc237ddf6f65f8a9086bb6c941244e6c37fecb2feee7e52cfff811b203304ad8
09-default-off-real-auth-real-qa.png|0678708551229b47a00dcc14aa122fd2c41c8a9b994cb48edb1553b863104f30
10-presence-접속-real-qa.png|ccbe280d21ace37ce97d5b2c6382a41bb43854ed20bdcd347f1c730443ecd008
10-virtual-agent-real-auth-real-qa.png|52d2b29c277128dbd69c5a563d2fdc04b8a56d5d3405c096276e79bff4c09b21
11-presence-자리비움-real-qa.png|46d012d98dd311460f81abd7e70cdd4bd96d34dcfd6a26c4f4bd4fa45ab409cc
12-presence-부재중-real-qa.png|6713daa6808fc76c4cebe6076856ba27aad56d6e119fd97a4641153f4331e7ec
13-presence-회의중-real-qa.png|fbf165541be341400172947df2019fabdc6d50e4ac611df4b780230bea03d876
14-presence-통화중-real-qa.png|7bf9df2d8c181ca7ed646437df4a5814cd4171275bef8ad5d089cf1e33dda570
15-presence-오프라인-real-qa.png|e60b237c6d380f772f17a5a50e9fb82a4b2a86ce5d760843d8619d32fc6625d0
16-contract-direct-window-real-qa.png|69af4512cb584335f63cebf28c2f85d6a866b45931d107bab65e45417eaffb6d
17-contract-group-metadata-real-qa.png|d6ff8419d8c603f72148c23a5facd7e222cfe401cf442cb8c130262c6a1ea9f5
18-contract-presence-sse-real-qa.png|af3aa38e96f3b9d575f86d36d748d1e95162d27842031285b0543af95a86c341
19-contract-claude-list-real-qa.png|3b2ff66c8e8030a410734fca86f0371378c70554a677adaf617242ff1caae68f
20-desktop-entry-real-qa.png|76668fa83ad6ab653363fda366ed797c5ef417dbae962a4e4517bfc41aa617ef
21-desktop-chat-list-real-qa.png|f6ec855fbc1f59f0c7ff3ce031c34a2982485c3a2ebd03f1fa419d1ddcd4444f
22-desktop-room-open-real-qa.png|165d4a388614ed21081cff70091f3e81679de8dbd6c7fa00e2d2e529acdb6c45
23-desktop-ui-send-real-qa.png|309ecc65be81348a45b960d3a0139f9e3ad91268a4fd83073032ce4f25a4f4b3
24-desktop-sse-receive-real-qa.png|8b748b5c5fb156371a96f91fbe22c7e1d85939f79a88aeee93443ccecc558f85
25-desktop-inactive-hidden-real-qa.png|1bbe011a0c33935395101fed337bcde9d48c89c17ee00f9ea1dd1ce21b7abfb3
COUNT=24|UNIQUE=24|DUPLICATES=0
```

## 11. 공유 DB 생성 데이터 및 정리

공유 DB에는 마이그레이션/스키마 변경을 만들지 않았다. 본체 실제 전송 검증으로 기존 그룹 방 `CHAT-20260814-000018`에 다음 메시지 2건을 만들었다.

```text
RECONV2-1180-UI-1786691370062
RECONV2-1180-SSE-1786691370062
```

실제 로그인으로 공유 auth의 `dev_master` 마지막 로그인 시각도 갱신됐다.

격리 tmpfs DB에는 클로드 세션 2건, 감사 로그 4건, auth V103~V106 및 user V13을 만들었다. 검증 종료 후 `qa1180reconv2-*` 컨테이너와 `qa1180reconv2-net`을 삭제했으므로 격리 데이터는 남지 않는다.

종료 확인 원문:

```text
MATCHED_PROCESSES=0
REMAINING_CONTAINERS=
REMAINING_NETWORK=
PORT_15432_LISTENERS=0
PORT_18080_LISTENERS=0
PORT_18081_LISTENERS=0
PORT_18082_LISTENERS=0
```
