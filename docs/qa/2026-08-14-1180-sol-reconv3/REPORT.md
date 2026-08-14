# PR #1180 SOL 재수렴 검증 — 2026-08-14

- 대상 SHA: `6c78be12a26577a1939c22f6ceb582b0b939f40b`
- 판정: **실사용 도달 결함 3건**
- 금지 준수: 코드 수정, Git 명령, 공유 스택 재배포/재생성, 공유 DB 마이그레이션 적용 모두 0회
- 실행: 현재 형상 JAR 2개 신규 빌드, 전용 tmpfs PostgreSQL, 실제 Electron 산출물과 Playwright `_electron`

## 결함 1 — V14는 적용되지만 user-service가 새 DB에서 기동 실패

재현:

1. 전용 `qa1180solr3-pg` PostgreSQL 16을 tmpfs로 시작한다.
2. UTF-8 `user_db`를 비운 상태에서 현재 `user-service.jar`를 시작한다.
3. Flyway V1~V14와 그 직후 JPA validate를 확인한다.

실제:

```text
Successfully applied 14 migrations to schema "public", now at version v14
Schema-validation: missing column [deleted_at] in table [messenger_presence_sessions]
USER_HEALTH=<응답 없음>
```

V14가 만든 컬럼은 `id, employee_id, session_id, created_at, updated_at, created_by, updated_by, is_deleted`이다. 엔티티가 상속한 `BaseEntity` 계약은 `created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted`이므로 `deleted_at`부터 검증이 막힌다.

기대: V1부터 마지막 마이그레이션을 적용한 새 DB에서 `user-service`가 기동되어야 한다.

근거: `user.out.log`, V14 적용 DB의 `flyway_schema_history` 14건(모두 success), JPA 오류 원문.

### 마이그레이션 번호 3곳 실측

```text
origin/main: auth V107=0, user V14=0, 최대 auth=102, user=12
열린 worktree: w901만 auth V103~V107 / user V13~V14 보유
공유 실제 DB: auth V107=0, user V14=0
격리 DB: auth V107=1 success, user V14=1 success
```

현재 열린 브랜치와 origin/main에는 같은 번호 충돌이 없다. 직전 보고의 `main 0 / 열린 worktree 1 / 실제 DB 0`은 **재현됨**. 하지만 “V14 직접 수정이 안전해 새 DB에서 기동 가능”은 **다름**: SQL 적용 뒤 JPA schema validate에서 기동 실패한다.

## 결함 2 — 클로드 제목은 Claude 요약이 아니라 질문 원문 복사

재현:

1. 격리 auth-service의 가상 에이전트 실제 API에서 세션을 생성한다.
2. `오늘 미배차 차량과 우선 처리 순서를 한 줄로 요약해줘`를 실제 세션 메시지 endpoint로 전송한다.
3. 실제 세션 목록 API와 그 API를 읽는 Electron 클로드 목록을 연다.

실제:

```text
VIRTUAL_UTF8|ask=200
title="오늘 미배차 차량과 우선 처리 순서를 한 줄로 요약해줘"
lastMessage="오늘 미배차 차량과 우선 처리 순서를 한 줄로 요약해줘"
summaryMode=VIRTUAL
```

제목과 마지막 메시지가 입력 질문과 완전히 같다. Electron에서도 `가상 요약 · <질문 원문>`으로 표시됐다. 자격 미설정 행은 `요약을 생성할 수 없음 · 자격 미설정`으로 분리됐다.

기대: 제목은 질문 원문 복사가 아니라 Claude가 대화 내용을 한 줄로 요약한 결과여야 한다.

근거: [실제 API 클로드 목록](screenshots/01-actual-api-claude-list-real-electron.png)

관측 범위: `VIRTUAL`과 `CREDENTIAL_UNAVAILABLE`은 실제 API 생성 경로로 확인했다. 격리 프로세스에 실제 외부 Claude 자격을 재주입하지 않았으므로 `REAL` 모델 호출은 관측 불가이며 통과로 세지 않는다.

## 결함 3 — `[DEV-SEED]`는 채팅 데이터에서만 가려지고 공통 헤더에 남음

재현:

1. 현재 `clients/desktop`을 빌드하고 실제 Electron에서 `dev_master`로 로그인한다.
2. `/#/chat` 목록을 열고 실제 방을 연다.

실제:

- 방 목록 상대: `개발매니저 · 대표실` — 접두사 제거됨
- 방 상단 상대: `개발매니저` — 접두사 제거됨
- 공통 우상단 사용자 칩: **`[DEV-SEED] 개발마스터 · MASTER`** — 목록과 방 모두 노출

기대: 본체 채팅 및 다른 업무 화면의 공통 사용자 헤더에서도 개발 seed 접두사가 노출되지 않아야 한다.

근거: [본체 채팅 목록](screenshots/08-desktop-chat-list-global-header-real-electron.png), [본체 방](screenshots/09-desktop-room-global-header-real-electron.png)

비활성 직원 `탈퇴사용자` 검색 결과는 `visible=0`으로 재현됐다. 본체 채팅 화면에는 별도 참여자 목록 UI가 렌더되지 않아 그 표면은 관측 불가로 분리한다.

## 회귀 계약 재실행

실제 Electron 산출물 원문:

```text
ELECTRON_CONTRACT|direct=2|windows=deduped|group=metadata|presence=reflected|join=1|childCloseLeave=0|leave=1
```

요청값과 동일하다. 메인 창 목록 전용, 별도 BrowserWindow, 중복 방지, 메인 종료 뒤 방 생존은 이번 실행 캡처 6장으로 확인했다. 위치·크기 복원은 별도 실제 Electron 실행에서 직접 set/close/reopen 후 같은 값을 확인했다.

```text
BOUNDS_RESTORE|set={"x":140,"y":150,"width":720,"height":640}|restored={"x":140,"y":150,"width":720,"height":640}|windows=2
```

근거: [복원된 실제 방 창](screenshots/10-direct-restored-real-electron.png)

권한 계약 fresh 실행:

```text
ClaudeVirtualAgentPropertiesTest 2/2
VirtualClaudeModelClientTest 1/1
ClaudeConversationPermissionIT 8/8
ClaudeVirtualAgentPermissionIT 3/3
TOTAL 14/14, failures=0, errors=0, skipped=0
```

내부 채팅 테스트는 `9 files, 42 tests passed`. 실제 백엔드 presence 6상태 저장/SSE/수동 우선은 결함 1로 user-service가 기동하지 못해 관측 불가이며 통과로 세지 않는다.

## Electron CI

exact SHA의 GitHub Actions 실측:

```text
actions/runs total_count=0
check-runs total_count=1
GitGuardian Security Checks=success
```

따라서 GitHub hosted `xvfb-run -a npm run test:electron-contract`는 **돌지 않았다**. 현재 YAML에는 job-level step으로 보이지만, exact SHA의 run ID와 job이 0이므로 “실제 hosted 실행”은 확인 불가다. 로컬 실제 산출물 계약 성공을 hosted CI 성공으로 대체하지 않는다. 이는 실사용 도달 결함 3건에는 포함하지 않는다.

## 디자인 관측

- 행은 수직 목록이며 `[아바타] 제목 / 마지막 대화 한 줄 / 시각`, 높이 78px이다.
- 구분선과 outline은 없고 기본 배경은 투명하다.
- `VIRTUAL`과 `CREDENTIAL_UNAVAILABLE` 표시는 구분된다.
- 상단 `클로드` 영역은 높고 짙은 단색 블록으로 화면 폭 대부분을 차지한다. 카카오톡처럼 가벼운 목록 헤더라기보다 큰 배너로 보인다.

## 증거 무결성

직전 LUNA 인용값:

```text
COUNT=6|UNIQUE=6|DUPLICATES=0 — 재현됨
LUNA_OVERLAP_RECONV2=5 — 6장 중 5장은 그 전 reconv2 파일과 SHA-256 동일
```

이번 제출 PNG:

```text
COUNT=10|UNIQUE=10|DUPLICATES=0
```

이번 계약 캡처 6장은 동일한 결정적 하네스를 새로 실행했기 때문에 LUNA 6장과 각각 SHA-256이 같다. 별도 실제 API/본체/복원 캡처 4장은 신규 해시다. PNG 합성은 하지 않았다.

## 정리

검증 종료 후 `qa1180solr3-pg`, `qa1180solr3-net`, 포트 29481/29482 격리 auth 프로세스를 종료·삭제했다. 공유 `samhan-*` 컨테이너와 공유 DB는 변경하지 않았다.
