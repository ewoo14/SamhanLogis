# PR #1180 재검증 보고서 — 2026-08-14

## 설계와 판단

1. V14는 `BaseEntity`의 7개 audit/soft-delete 컬럼 집합을 맞췄다. V13, V14, V103~V107의 브랜치 생성 테이블을 모두 훑었으며, 새 migration은 추가하지 않았다. 따라서 origin/main·열린 브랜치·실제 DB의 3-way 대조가 필요한 신규 migration 충돌 상황은 발생시키지 않았다.
2. 제목은 질문을 복사한 값이 아니라 모델 응답의 별도 `summary` 필드로 저장한다. 검증 계약은 공백 정규화, 한 줄, 최대 80자, 원문과 불일치, 질문의 핵심을 나타내는 내용이다. 실제 모델은 한 번의 요청에서 요약과 답변을 함께 반환하고, virtual 모델은 같은 계약의 결정적 요약을 반환한다. 목록 조회는 저장소와 count만 읽는다.
3. `[DEV-SEED]`는 실 계정 데이터 삭제가 아니라 공통 표시 경계에서 제거한다. 공유 DB read-only 확인 결과 auth 33개 중 12개, user 25개 중 9개가 명시적인 `dev_*` seed 계정이었고 실 계정의 해당 접두사는 확인되지 않았다. QA용 seed를 데이터에서 삭제하면 테스트 기반을 훼손하므로 표시 경계를 공통화했다.

## 변경 파일

- `services/user-service/src/main/resources/db/migration/V14__create_messenger_presence_sessions.sql`
- `services/user-service/src/test/java/com/samhanair/logis/user/it/MessengerMigrationContractTest.java`
- `services/auth-service/src/main/resources/db/migration/V107__add_claude_session_list_metadata.sql`
- `services/auth-service/src/main/java/com/samhanair/logis/auth/claude/ClaudeModelResult.java`
- `services/auth-service/src/main/java/com/samhanair/logis/auth/claude/ClaudeModelClient.java`
- `services/auth-service/src/main/java/com/samhanair/logis/auth/claude/VirtualClaudeModelClient.java`
- `services/auth-service/src/main/java/com/samhanair/logis/auth/claude/AnthropicClaudeModelClient.java`
- `services/auth-service/src/main/java/com/samhanair/logis/auth/claude/ClaudeConversationSession.java`
- `services/auth-service/src/main/java/com/samhanair/logis/auth/claude/ClaudeConversationService.java`
- `services/auth-service/src/test/java/com/samhanair/logis/auth/claude/ClaudeModelResultContractTest.java`
- `services/auth-service/src/test/java/com/samhanair/logis/auth/claude/ClaudeConversationSessionTest.java`
- `services/auth-service/src/test/java/com/samhanair/logis/auth/claude/ClaudeSessionMigrationContractTest.java`
- `services/auth-service/src/test/java/com/samhanair/logis/auth/claude/ClaudeConversationServiceTest.java`
- `clients/web/design-system/src/utils/actorName.ts`
- `clients/desktop/src/renderer/common/userDisplayName.ts` 및 관련 표시 경로/테스트
- `clients/internal-chat-desktop/src/renderer/ChatApp.tsx`

## 새 테이블 규약 점검

| migration | 서비스 | 테이블 | 결과 |
|---|---|---|---|
| V13 | user | `messenger_presences` | 7개 전부 준수 |
| V14 | user | `messenger_presence_sessions` | 7개 전부 준수; `modified_at`, `modified_by`, `deleted_at`, `deleted_by` 보완 |
| V103 | auth | 테이블 생성 없음 | seed/alter |
| V104 | auth | `claude_conversation_audits` | 7개 전부 준수 |
| V105 | auth | `claude_conversation_sessions` | 7개 전부 준수 |
| V106 | auth | 테이블 생성 없음 | seed/alter |
| V107 | auth | 테이블 생성 없음 | seed/alter; 질문을 제목으로 backfill하지 않음 |

## RED 원문

- 요약: `cannot find symbol class ClaudeModelResult`, `cannot find symbol method askWithSummary(String)`
- V14: `MessengerMigrationContractTest > ... FAILED` (1 test failed)
- 공통 표시: `Failed to load url ./userDisplayName ... Does the file exist?`

## GREEN 원문

- `:services:user-service:test --tests com.samhanair.logis.user.it.MessengerMigrationContractTest`: `BUILD SUCCESSFUL`
- `:services:auth-service:test --tests 'com.samhanair.logis.auth.claude.*'`: `BUILD SUCCESSFUL`
- desktop 관련 4개 파일: `Test Files 4 passed`, `Tests 26 passed`
- internal-chat 전체: `9 files, 42 tests passed`
- design-system 전체: `31 files, 280 passed`

## 세 건 실행 근거

### 1. DB

V14 SQL에 `created_at`, `created_by`, `modified_at`, `modified_by`, `deleted_at`, `deleted_by`, `is_deleted`를 맞췄다. `updated_at/updated_by`는 JPA 계약에 없는 이름이므로 제거했다. V107은 기존 세션 backfill 제목을 `대화 요약 없음`으로 바꾸고 질문은 `last_message`에만 둔다.

### 2. Claude 제목

virtual 계약 테스트가 다음을 검증한다: 요약 non-blank, 한 줄, 80자 이하, 질문 원문과 다름, 답변에 virtual marker 존재. 추가로 `ClaudeConversationServiceTest`가 `listSessions`에서 `verifyNoInteractions(modelClient)`를 통과했다. 즉 목록을 열 때 모델을 호출하지 않는다.

### 3. DEV-SEED 공통 경로

`sanitizeDisplayName`을 auth ingress, 공통 header, presence, co-edit, dashboard, internal-chat participant에 적용하고 design-system `safeActorName`에도 접두사 제거를 넣었다. 공통 header 회귀 테스트는 `[DEV-SEED] 오병승` 입력에서 `오병승`만 출력되는지 검사한다.

실제 Electron desktop 재현 원문:

```text
DESKTOP_LOGIN=header-user-name reached
DESKTOP_GLOBAL_HEADER|devSeed=0|output=C:\Users\user\AppData\Local\Temp\luna-1180-desktop-7VmMBN
COUNT=1|UNIQUE=1|DUPLICATES=0|SHA256=D1DFF53ADF8C657A8C280243CCBA1A1AE00BFDB38107AE48AD786545230974D9
```

실제 Electron internal-chat 계약 원문:

```text
ELECTRON_CONTRACT|direct=2|windows=deduped|group=metadata|presence=reflected|join=1|childCloseLeave=0|leave=1
COUNT=6|UNIQUE=6|DUPLICATES=0
```

## 깨지지 않음 재실행 원문

```text
ELECTRON_CONTRACT|direct=2|windows=deduped|group=metadata|presence=reflected|join=1|childCloseLeave=0|leave=1
BOUNDS_RESTORE|set={"x":140,"y":150,"width":720,"height":640}|restored={"x":140,"y":150,"width":720,"height":640}|windows=2
PERMISSIONS|14/14
INTERNAL_CHAT|42/42
INACTIVE_EMPLOYEE_SEARCH|0
```

실행한 캡처는 [`screenshots`](./screenshots/)에만 보관했으며, 7장 전부 SHA-256 unique였다. 캡처를 그려서 만들지 않았다.

## 관측 불가 및 기존 실패

- shared auth/user 서비스는 재배포하지 않았고 shared DB migration도 적용하지 않았다. 따라서 수정된 Anthropic 실 API의 새 요약 생성에 대한 라이브 백엔드 관측은 불가하다. virtual/단위/서비스 계약으로 검증했다.
- hosted exact-SHA GitHub Actions run은 이번 범위에서 관측 불가다.
- desktop 전체 테스트에서는 기존 QA harness의 `docs/qa` 경로 감시 실패와 병렬 환경의 `inbound-permission-contract` timeout이 관찰됐다. 이번 변경 관련 targeted 테스트는 모두 통과했으며, 이 기존 실패를 통과로 세지 않았다.
- 상단 헤더 디자인은 변경하지 않았다.
