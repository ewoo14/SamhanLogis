# PR #1180 (`#901`) 권한 계약 회귀 검증 보고서

- 검증일: 2026-08-14 (Asia/Seoul)
- 역할: 검증자 (SOL)
- 대상 PR: `#1180` `[FEAT] #901 클로드 대화 기능 — 계정 권한 범위 내 내부 작업 수행 (트랙 개설)`
- 대상 head: `feat/901-claude-conversation` / `b63e047a273addeb2e6c82477dd300992f56a4fe`
- 정본: `docs/decisions/2026-08-13-blocked-tracks-unblocked.md` 결정 1
- 최종 판정: **권한 계약에서 실 사용자 경로로 도달 가능한 결함 0건**

## 1. 판정 요약

`system.claude` 권한 계약은 현재 head에서도 서버 권위로 유지된다.

- 기존 Claude 관련 테스트 4개 클래스, **14/14 통과** (`failures=0`, `errors=0`, `skipped=0`).
- 가상 에이전트 OFF: `MASTER 503`, 내부 비MASTER 9역할 `403`, `PARTNER 401`.
- 가상 에이전트 ON: `MASTER 200`, 내부 비MASTER 9역할 `403`, `PARTNER 401`.
- 즉, 가상 에이전트 ON은 허용 계정의 모델 경계만 `503 → 200`으로 바꾸고, 거부 계정의 권한 판정은 한 건도 넓히지 않았다.
- 3회 반복 캡처까지 포함한 66개 요청의 감사 로그: `DENIED_CLAUDE_PERMISSION=54`, `DENIED_INVALID_TOKEN=6`, `NOT_SENT=3`, `VIRTUAL_SENT=3`. 거부 60건 전부 기록됨.
- 역할 템플릿 11종은 정확히 `MASTER=[true,false,false,false,false,false,false]`, 나머지 10종은 7비트 전부 `false`였다.

`PARTNER=401`은 `system.claude` 가드 전에 파트너 토큰(`partnerCode` claim)을 Samhan 사용자 토큰이 아니라고 거부한 결과다. OFF/ON 모두 동일하며, 권한 우회가 아니라 더 앞선 인증 경계의 거부다.

## 2. 환경 실측 원문

### 2.1 PR

명령:

```text
gh pr view 1180 --json number,title,state,headRefName,baseRefName,url,headRefOid
```

원문:

```json
{"baseRefName":"main","headRefName":"feat/901-claude-conversation","headRefOid":"b63e047a273addeb2e6c82477dd300992f56a4fe","number":1180,"state":"OPEN","title":"[FEAT] #901 클로드 대화 기능 — 계정 권한 범위 내 내부 작업 수행 (트랙 개설)","url":"https://github.com/ewoo14/Samhan-Public/pull/1180"}
```

### 2.2 마이그레이션 처리 방법

공유 `auth_db`에는 V103~V106이 아직 적용되지 않았다.

```text
SELECT COUNT(*) FROM flyway_schema_history
WHERE version IN ('103','104','105','106');

0
```

따라서 공유 `samhan-auth-service`를 이 브랜치로 재배포하면 다른 트랙의 Flyway validate를 깨뜨릴 수 있다고 판단했다. 공유 DB와 공유 `samhan-auth-service`는 변경하지 않고, 격리 PostgreSQL `qa1180sol-pg`(host port `55480`)과 격리 auth 컨테이너만 사용했다.

V103~V106 파일 인코딩 실측:

```text
V103__seed_system_claude_permission.sql        NO-BOM  UTF8Valid=True  Bytes=5285
V104__add_claude_conversation_audits.sql       NO-BOM  UTF8Valid=True  Bytes=617
V105__add_claude_conversation_sessions.sql     NO-BOM  UTF8Valid=True  Bytes=900
V106__allow_anonymous_claude_denial_audit.sql  NO-BOM  UTF8Valid=True  Bytes=178
```

격리 DB 적용 결과:

```text
103|seed system claude permission|t
104|add claude conversation audits|t
105|add claude conversation sessions|t
106|allow anonymous claude denial audit|t
```

증거: [01-environment-flyway-jar.png](screenshots/01-environment-flyway-jar.png)

### 2.3 fresh jar와 격리 서버

fresh 빌드 명령과 원문:

```text
.\gradlew.bat :services:auth-service:bootJar --rerun-tasks --no-daemon --console=plain

> Task :services:auth-service:bootJar
BUILD SUCCESSFUL in 20s
12 actionable tasks: 12 executed
```

jar:

```text
host LastWriteTimeUtc = 2026-08-14 03:49:36Z
size                  = 88095596
SHA-256               = FABB162DA5264D8932FC63EDBFD1A07A2030708252BB2AD020435B81FF9DBC13
```

컨테이너 내부:

```text
qa1180sol-auth     CLAUDE_VIRTUAL_AGENT_ENABLED=false
  /app/app.jar mtime=2026-08-14 03:49:36.861769100 +0000 size=88095596

qa1180sol-auth-on  CLAUDE_VIRTUAL_AGENT_ENABLED=true
  /app/app.jar mtime=2026-08-14 03:49:36.861769100 +0000 size=88095596
```

두 컨테이너는 같은 fresh jar와 같은 격리 DB를 사용하고, 가상 에이전트 플래그만 다르다. 공유 DB의 V103~V106 적용 건수는 검증 후에도 `0`이었다.

## 3. 테스트 탐색과 실행 결과

### 3.1 false-negative 방지 탐색

파일명뿐 아니라 아래 문자열을 `services/auth-service/src/test` 전체에서 교차 검색했다.

```text
system.claude
SYSTEM_CLAUDE
/auth/claude
ClaudeConversationEntryController
CLAUDE_PERMISSION
VIRTUAL_SENT
DENIED_SESSION_OWNER
```

직접 `system.claude` 또는 Claude 권한 HTTP 경계를 단정하는 파일은 다음 2개였다.

```text
ClaudeConversationPermissionIT.java
ClaudeVirtualAgentPermissionIT.java
```

가상 에이전트 동작의 경계 설정/표시 회귀도 함께 확인하기 위해 Claude 이름의 단위 테스트 2개를 추가로 실행했다.

```text
ClaudeVirtualAgentPropertiesTest.java
VirtualClaudeModelClientTest.java
```

### 3.2 실행 명령

```text
.\gradlew.bat :services:auth-service:test \
  --tests '*ClaudeConversationPermissionIT' \
  --tests '*ClaudeVirtualAgentPermissionIT' \
  --tests '*ClaudeVirtualAgentPropertiesTest' \
  --tests '*VirtualClaudeModelClientTest' \
  --rerun-tasks --console=plain
```

종료 원문:

```text
Exit code: 0
Wall time: 52.7 seconds
```

결과 원문(XML `testsuite`):

```text
ClaudeConversationPermissionIT       tests=8 failures=0 errors=0 skipped=0 time=1.017
ClaudeVirtualAgentPermissionIT       tests=3 failures=0 errors=0 skipped=0 time=0.1
ClaudeVirtualAgentPropertiesTest     tests=2 failures=0 errors=0 skipped=0 time=0.004
VirtualClaudeModelClientTest         tests=1 failures=0 errors=0 skipped=0 time=0.0
합계                               tests=14 failures=0 errors=0 skipped=0
```

증거: [02-contract-tests.png](screenshots/02-contract-tests.png)

### 3.3 실행된 단정 목록

`ClaudeConversationPermissionIT` 8개:

```text
PASS 토큰이 없으면 X-User-Id 위조만으로 Claude에 진입할 수 없다
PASS 만료 토큰과 다른 서비스 토큰은 Claude 토큰 계약에서 거부된다
PASS 자격 미설정 질문도 외부 전송 예정 범위와 미전송 상태를 감사 로그에 남긴다
PASS 빌트인 역할그룹 10개가 Claude 7비트 row를 정확히 가진다
PASS 축 0 view 계정은 자격 미설정 경계에서 503을 받는다
PASS 축 0 off 계정은 Claude 대화 정문에서 실 HTTP 403으로 거부된다
PASS 축 0 view 계정도 Claude 자격 미설정이면 모델 호출 없이 503으로 멈춘다
PASS 기존 7비트 권한 계약을 정확히 보존하며 Claude 축은 VIEW 한 비트만 사용한다
```

`ClaudeVirtualAgentPermissionIT` 3개:

```text
PASS virtualAgentWithoutClaudePermissionIsStillForbidden()
PASS virtualAgentResponseAndAuditAreExplicitlyMarked()
PASS virtualAgentCannotCrossSessionOwnershipBoundary()
```

가상 에이전트 단위 테스트 3개:

```text
PASS productionProfileCannotEnableVirtualAgent()
PASS virtualAgentIsDisabledByDefault()
PASS responseIsUnmistakablyVirtual()
```

Testcontainers 원문 중 Flyway 경계:

```text
Database: jdbc:postgresql://localhost:55393/auth_db (PostgreSQL 16.14)
Successfully validated 105 migrations
Migrating schema "public" to version "103 - seed system claude permission"
Migrating schema "public" to version "104 - add claude conversation audits"
Migrating schema "public" to version "105 - add claude conversation sessions"
Migrating schema "public" to version "106 - allow anonymous claude denial audit"
Successfully applied 105 migrations to schema "public", now at version v106
```

## 4. 역할별 서버 응답 — 실 HTTP

호출 경로:

```text
POST /auth/claude/conversations
Authorization: Bearer <실 /auth/login 발급 토큰>
X-User-Id: <토큰 subject와 동일>
Content-Type: application/json
```

내부 역할 10종은 각 dev 계정으로 `/auth/login`을 실제 호출해 받은 토큰을 사용했다. PARTNER는 `partnerCode` claim이 든 실제 파트너 형식 서명 토큰을 사용했다. 토큰 값은 보고서와 캡처에서 비공개 처리했다.

| 역할 | 가상 에이전트 OFF | 가상 에이전트 ON | 서버 판정 |
|---|---:|---:|---|
| MASTER | 503 | 200 | 양쪽 모두 `system.claude` 통과. OFF는 자격 미설정 경계, ON은 가상 응답 성공 |
| MANAGER | 403 | 403 | 권한 거부 |
| ACCOUNTANT | 403 | 403 | 권한 거부 |
| SALES | 403 | 403 | 권한 거부 |
| WAREHOUSE | 403 | 403 | 권한 거부 |
| DISPATCH | 403 | 403 | 권한 거부 |
| INVENTORY | 403 | 403 | 권한 거부 |
| DEVELOPER | 403 | 403 | 권한 거부 |
| STAFF | 403 | 403 | 권한 거부 |
| DRIVER | 403 | 403 | 권한 거부 |
| PARTNER | 401 | 401 | 파트너 토큰은 Samhan 사용자 토큰이 아니므로 인증 경계에서 거부 |

OFF 실 캡처: [03-http-matrix-virtual-off.png](screenshots/03-http-matrix-virtual-off.png)

ON 실 캡처: [04-http-matrix-virtual-on.png](screenshots/04-http-matrix-virtual-on.png)

핵심 비교:

```text
OFF = 503:1, 403:9, 401:1
ON  = 200:1, 403:9, 401:1
```

거부 역할의 상태 코드는 OFF/ON에서 전부 동일했다. 화면 메뉴 표시 여부는 판정에 사용하지 않았다.

## 5. 감사 로그

1차 측정은 DB 시각 `2026-08-14 03:52:56.360489+00` 이후의 OFF/ON 22요청만 집계했다.

```text
dev_accountant | DENIED_CLAUDE_PERMISSION | 2
dev_developer  | DENIED_CLAUDE_PERMISSION | 2
dev_dispatch   | DENIED_CLAUDE_PERMISSION | 2
dev_driver     | DENIED_CLAUDE_PERMISSION | 2
dev_inventory  | DENIED_CLAUDE_PERMISSION | 2
dev_manager    | DENIED_CLAUDE_PERMISSION | 2
dev_sales      | DENIED_CLAUDE_PERMISSION | 2
dev_staff      | DENIED_CLAUDE_PERMISSION | 2
dev_warehouse  | DENIED_CLAUDE_PERMISSION | 2
partner token  | DENIED_INVALID_TOKEN     | 2
dev_master     | NOT_SENT                 | 1
dev_master     | VIRTUAL_SENT             | 1
```

따라서 1차 측정의 거부 20/20이 모두 감사 로그에 남았다. 캡처를 위해 같은 행렬을 두 번 더 실제 호출한 최종 누적 원문은 다음과 같다.

```text
DENIED_CLAUDE_PERMISSION|54
DENIED_INVALID_TOKEN|6
NOT_SENT|3
VIRTUAL_SENT|3
```

거부 행은 모두 다음을 만족했다.

```text
question        = [REDACTED]
outbound_payload= question=[REDACTED]; apiResponses=[]
is_deleted      = false
```

증거: [05-denied-audit-log.png](screenshots/05-denied-audit-log.png)

## 6. 캡처 SHA-256

모든 이미지는 실제 PowerShell 창을 OS 화면 캡처한 PNG다. 합성 PNG와 `docs/qa` 내 캡처 스크립트는 없다.

| 파일 | SHA-256 |
|---|---|
| `01-environment-flyway-jar.png` | `D02F5669B16F4AA5C76059CCE6E35B59789DA845C12C04F0C4A511052ACD16B1` |
| `02-contract-tests.png` | `94BE8BBF49A35C599F310DA992BA1075EF6FD09B834DCD22078BFF651214A58F` |
| `03-http-matrix-virtual-off.png` | `47392C4901C645EBE57252C3AD43DE7C7C050D61179D35DB57271418F8582C47` |
| `04-http-matrix-virtual-on.png` | `E94EFA8C186C8C96BA5DC05D76C57115B62945EFBC6971B1FD787A865C68254A` |
| `05-denied-audit-log.png` | `8C297B20E17BD2A3543590B0663027DC9B53C4ECDF4F0C411FB4517F13368912` |

```text
FILES=5 UNIQUE=5 DUPLICATES=0
```

## 7. 도달 가능한 결함 목록

**0건.**

검증한 실 사용자 경로에서 다음 우회는 재현되지 않았다.

- 비MASTER 내부 역할이 `system.claude` 없이 대화에 진입하는 경로
- 파트너 토큰이 Samhan Claude 대화에 진입하는 경로
- 가상 에이전트 ON이 거부 역할을 허용하는 경로
- 거부 요청이 감사 로그에서 누락되는 경로

## 8. 관측 불가와 실패 원문

### 8.1 지정 재배포 스크립트 — 이 워크트리에서 관측 불가

사용자가 지정한 명령의 원문 실패:

```text
Get-Content scripts\redeploy-service.ps1 -Raw -Encoding UTF8

Get-Content : Cannot find path
'C:\dev\Samhan-Public\.claude\worktrees\w901\scripts\redeploy-service.ps1'
because it does not exist.
```

동일 파일은 별도 루트 main 체크아웃 `C:\dev\Samhan-Public\scripts\redeploy-service.ps1`에만 존재했다. 그 스크립트는 자신의 위치를 repo root로 고정하고 공유 compose/공유 `auth_db`를 사용하므로, 이 브랜치 jar와 격리 DB를 함께 쓰는 방법이 없다. 공유 DB에는 V103~V106이 0건이어서 실행하지 않았다.

따라서 **지정 스크립트 자체의 이 워크트리 실행은 관측 불가**다. 대신 동일 핵심 순서인 fresh `bootJar → auth-service 격리 컨테이너 재시작 → jar 내부 시각/크기 확인 → actuator UP`을 수행했다. 권한 HTTP 결과는 모두 이 fresh jar 서버에서 관측했다.

### 8.2 최초 테스트 실행기 제한

```text
.\gradlew.bat :services:auth-service:test ...
command timed out after 5023 milliseconds
Exit code: 124
```

테스트 실패가 아니라 최초 실행기의 1초 요청/5초 강제 제한이었다. 동일 명령을 10분 상한으로 fresh 재실행해 `exit 0`, 14/14를 확인했다.

### 8.3 최초 ON 포트 충돌

```text
docker: Error response from daemon:
Bind for 0.0.0.0:18082 failed: port is already allocated
```

실패 컨테이너 상태:

```text
Status=created
Error=failed to set up container networking ... port is already allocated
```

`18082` 점유 주체는 `wslrelay/com.docker.backend`였고, 미점유 `18180`을 확인한 뒤 데이터가 없는 실패 컨테이너만 제거·재생성했다. 최종 ON 컨테이너는 ID `c46ce43fb0181...`, `running`, actuator `UP`, fresh jar 내부 시각 일치로 재검증했다.

## 9. 증거 규율 확인

- git 명령: 사용하지 않음
- 코드 수정: 없음
- 공유 `samhan-auth-service` 및 다른 서비스 재배포: 없음
- 공유 `auth_db` V103~V106 적용: 검증 전/후 모두 0건
- 합성 PNG: 없음
- 서로 다른 상태: OFF/ON 별도 실 캡처
- `docs/qa` 내 캡처 스크립트: 없음
- 캡처 직접 열람: 5장 전부 수행
- SHA-256 중복: 0
