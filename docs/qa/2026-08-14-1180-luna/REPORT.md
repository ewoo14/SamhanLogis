# PR #1180 LUNA fix round — 2026-08-14

## 변경 결과

- V14 문법 오류: `V14__create_messenger_presence_sessions.sql`의 마지막 컬럼 쉼표 제거.
  main 작업 디렉터리 0, 열린 worktree 파일 1, 실제 `samhan-postgres.user_db` 0, 격리 DB 0으로 적용 이력이 없어 V14 자체 수정이 안전하다고 판정했다.
- Claude 세션: V105는 이미 적용된 상태라 불변으로 유지하고 V107을 추가했다. 질문 시 한 번 저장한 `title`, `last_message`, `last_message_at`, `summary_mode`를 목록 API로 반환하고, 기존 `새 대화` 행은 감사 로그의 최신 질문으로 backfill한다. 목록 조회에서는 모델을 호출하지 않는다.
- `[DEV-SEED]`: 데이터베이스 seed 원문은 보존하고 `clients/desktop`의 메신저 API 표시 경계에서 이름을 정제한다. 방 목록·방 본문·수신자 검색·생성 응답과 화면 방어선을 함께 처리했다.
- Electron CI: 잘못 중첩된 step을 job-level step으로 수정했다.

## RED 원문

```text
ChatRoomPage.fix1.test.tsx
Tests 7 | 1 failed
개발 시드 표식은 실제 채팅 화면에 노출하지 않는다 RED
Unable to find role="heading" and name "개발매니저"
본문에 [DEV-SEED] 개발매니저가 노출됨
```

```text
ClaudeConversationSessionTest
compileTestJava FAILED
cannot find symbol: recordQuestion(String, boolean)
cannot find symbol: getLastMessage()
cannot find symbol: getSummaryMode()
```

## GREEN 원문

```text
ChatRoomPage.fix1.test.tsx (7 tests)
Test Files 1 passed
Tests 7 passed

ClaudeConversationSessionTest
BUILD SUCCESSFUL
```

## 실행 근거

```text
V14_SQL_PARSE=PASS_ROLLED_BACK
V107_SQL_PARSE=PASS_ROLLED_BACK
:services:auth-service:test --tests ClaudeConversationSessionTest
BUILD SUCCESSFUL
:services:user-service:bootJar
BUILD SUCCESSFUL
internal-chat-desktop typecheck: PASS
clients/desktop typecheck: PASS
CI_YAML_PARSE=PASS
```

실제 Electron build wrapper + Playwright `_electron` 실행:

```text
ELECTRON_CONTRACT|direct=2|windows=deduped|group=metadata|presence=reflected|join=1|childCloseLeave=0|leave=1
```

캡처: [screenshots](screenshots/)

```text
COUNT=6|UNIQUE=6|DUPLICATES=0
```

메인 창 숨김 뒤 방 창만 남은 단계는 `round-fix-6-main-closed-room-survives-real-electron.png`에 기록했다. 실제 방 입력창에 초안을 입력한 뒤 캡처했으며 메시지는 전송하지 않았다.

## 관측 불가

- GitHub Actions의 실제 hosted `xvfb-run` job run ID는 이 로컬 세션에서 직접 관측하지 못했다. 대신 수정된 job과 동일한 `npm run test:electron-contract`가 실제 산출물에서 종료·계약 로그를 남겼다. `xvfb-run` 자체의 hosted 실행을 초록으로 세지 않는다.
- 공유 스택 재배포 및 공유 DB migration 적용은 하지 않았다.
