# PR #1125 (#894) 재수렴 2회차 SOL 보고서

- 검증일: 2026-08-12
- 대상: `feat/894-internal-chat`, 사용자 지정 HEAD `148b61898`
- 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 판정: **이번 라운드에서 재현된 결함은 0건이다.** 독립 사용자 세션·실 gateway/API·SSE·PostgreSQL 경로는 통과했다. Browser runtime 부재로 실제 화면 캡처 2항목은 skipped로 분리했다.
- 금지사항 준수: git 명령 0회, 구현 코드 변경 0건, 공유 DB 쓰기 0건. 공유 DB는 SELECT와 네트워크 `pg_dump` 읽기만 수행했다.

## 집계

| 구분 | passed | skipped | failed |
|---|---:|---:|---:|
| UTF-8 파일 경유 복제 직후 원문 일치 | 3 | 0 | 0 |
| DIRECT 생성·양방향 왕복·수신측 REST/SSE | 5 | 1 | 0 |
| 실제 PostgreSQL 동시 20건·sequence 유일성 | 3 | 0 | 0 |
| 사용자 오류 문구·개발자 원문 비노출 | 3 | 1 | 0 |
| 발신자·상대 부서 DB/API 일치 | 2 | 0 | 0 |
| 사용자 노출 chat API UUID 잔존 | 1 | 0 | 0 |
| 기존 메신저 5 API | 5 | 0 | 0 |
| 기존 결재 co-edit REST/SSE | 7 | 0 | 0 |
| fix2 PostgreSQL IT / desktop 계약 | 9 | 0 | 0 |
| **합계** | **38** | **2** | **0** |

skipped 2건은 (1) 두 사용자 화면 자체에서 수신 메시지가 자동으로 나타나는 장면 캡처, (2) 방 생성/메시지 발송 실패 문구의 실제 화면 캡처다. API·SSE·수신측 재조회와 화면 계약 테스트는 각각 통과했다.

## 1. 격리 DB와 UTF-8 복제 증거

공유 DB는 `host.docker.internal:5432`로 읽고, `postgres:16-alpine pg_dump -Fc -f /backup/*.dump`가 호스트 `C:\Temp\reconv2-894` 파일에 직접 기록했다. 셸/PowerShell 파이프는 복제에 사용하지 않았다. 복원 대상은 신규 `reconv2-894-pg`, 호스트 포트 `42332`다.

덤프 SHA-256:

```text
auth.dump      9FA9D8CB9367DDF8848EFFBE4F54922FFAC0CE9B66CA55C66234FFE3EFCFBA30
groupware.dump 16607D4B0A1CB98D06CE6DD8A1895CFD3CB23D80011BAD22FD09A40F2BE730AB
user.dump      EBAF3A6FD7C35069D06D864C467AE2A7CF697294BC5E69BD77A5CC1185C469EA
```

복제 전 원본 SELECT:

```text
DB=groupware_db|ENC=UTF8
APPROVAL=2026/07/19-1|LiveQA848 발의 오버플로 검증
APPROVAL=2026/06/14-5|실서버 QA — 6월 택배비 지출결의
APPROVAL=2026/06/14-4|실서버 QA — 6월 택배비 지출결의
APPROVAL_COUNT=76
MESSAGE_COUNT=598

DB=user_db|ENC=UTF8
EMP=dev_accountant|[DEV-SEED] 개발회계|회계팀|NULL
EMP=dev_developer|[DEV-SEED] 개발개발자|대표실|NULL
EMP=dev_inventory|[DEV-SEED] 개발재고|영업2팀|NULL
EMP=dev_locked|[DEV-SEED] 잠금사용자|영업1팀|NULL
EMP=dev_manager|[DEV-SEED] 개발매니저|대표실|NULL
EMPLOYEE_COUNT=25

DB=auth_db|ENC=UTF8
ACCOUNT=dev_accountant|[DEV-SEED] 개발회계|NULL
ACCOUNT=dev_developer|[DEV-SEED] 개발개발자|NULL
ACCOUNT=dev_dispatch|[DEV-SEED] 배차담당자|NULL
ACCOUNT=dev_driver|[DEV-SEED] 기사|NULL
ACCOUNT=dev_inventory|[DEV-SEED] 개발재고|NULL
ACCOUNT_COUNT=33
```

복제 직후 동일 SELECT:

```text
DB=groupware_db|ENC=UTF8
APPROVAL=2026/07/19-1|LiveQA848 발의 오버플로 검증
APPROVAL=2026/06/14-5|실서버 QA — 6월 택배비 지출결의
APPROVAL=2026/06/14-4|실서버 QA — 6월 택배비 지출결의
APPROVAL_COUNT=76
MESSAGE_COUNT=598

DB=user_db|ENC=UTF8
EMP=dev_accountant|[DEV-SEED] 개발회계|회계팀|NULL
EMP=dev_developer|[DEV-SEED] 개발개발자|대표실|NULL
EMP=dev_inventory|[DEV-SEED] 개발재고|영업2팀|NULL
EMP=dev_locked|[DEV-SEED] 잠금사용자|영업1팀|NULL
EMP=dev_manager|[DEV-SEED] 개발매니저|대표실|NULL
EMPLOYEE_COUNT=25

DB=auth_db|ENC=UTF8
ACCOUNT=dev_accountant|[DEV-SEED] 개발회계|NULL
ACCOUNT=dev_developer|[DEV-SEED] 개발개발자|NULL
ACCOUNT=dev_dispatch|[DEV-SEED] 배차담당자|NULL
ACCOUNT=dev_driver|[DEV-SEED] 기사|NULL
ACCOUNT=dev_inventory|[DEV-SEED] 개발재고|NULL
ACCOUNT_COUNT=33
```

판정: 세 DB 모두 UTF8이고 한글 원문과 건수가 복제 전후 일치한다.

## 2. 현재 산출물과 격리 서비스

현재 작업트리에서 eureka/gateway/auth/user/groupware bootJar를 새로 생성했다.

```text
BUILD SUCCESSFUL in 16s
42 actionable tasks: 4 executed, 38 up-to-date
```

격리 포트/서비스:

```text
renderer   127.0.0.1:42375
gateway    127.0.0.1:42380
auth       127.0.0.1:42381
user       127.0.0.1:42383
groupware  127.0.0.1:42392
eureka     127.0.0.1:42376
postgres   127.0.0.1:42332
redis/rabbitmq host port 미노출
```

groupware 기동 시 복제 DB에 V19~V21이 적용됐고 `reconv2-894-groupware` health는 `{"status":"UP"}`였다.

## 3. 두 사용자 세션 양방향 왕복

`dev_master`와 `dev_manager`를 각각 로그인해 서로 다른 JWT 세션으로 같은 DIRECT 방을 사용했다. 상대 검색, 신규 방 생성, 양방향 발송, 상대 세션 SSE 수신, 상대 세션 REST 재조회를 모두 밟았다.

```text
LOGIN master=200/MASTER/[DEV-SEED] 개발마스터 manager=200/MANAGER/[DEV-SEED] 개발매니저
RECIPIENT_SEARCH status=200 count=1 selected=[DEV-SEED] 개발매니저|대표실|
DIRECT_CREATE status=201 roomCode=CHAT-20260812-000017 partner=[DEV-SEED] 개발매니저|대표실|
ROUNDTRIP_A send=200 recipientSse=200 event=event:connected ... event:chat:message-created data:{"sequence":1,"roomCode":"CHAT-20260812-000017"}
ROUNDTRIP_A_RECIPIENT status=200 seen=true sender=[DEV-SEED] 개발마스터|대표실|mine=false
ROUNDTRIP_B send=200 recipientSse=200 event=event:connected ... event:chat:message-created data:{"sequence":2,"roomCode":"CHAT-20260812-000017"}
ROUNDTRIP_B_RECIPIENT status=200 seen=true sender=[DEV-SEED] 개발매니저|대표실|mine=false
```

판정: 보낸 쪽 응답만 성공한 것이 아니다. 매 왕복마다 상대 사용자 SSE에 `chat:message-created`가 도달했고, 상대 사용자 메시지 재조회에도 정확한 본문이 `seen=true`로 존재했다.

## 4. 실제 PostgreSQL 동시 20건

같은 DIRECT 방에 실제 gateway를 거쳐 HTTP 20건을 동시에 보냈다.

```text
CONCURRENT_20 statuses=200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200 visibleRecipient=20 uniqueSequences=20 sequences=3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22
```

격리 PostgreSQL 직접 확인:

```text
ROOM=CHAT-20260812-000017|TYPE=DIRECT
BURST_COUNT=20|DISTINCT_SEQUENCE=20|MIN=3|MAX=22
DUPLICATE_SEQUENCE_ROWS=0
```

판정: 20/20 성공, 수신자 조회 20건, sequence 유일 20개, DB 중복 0건이다.

## 5. 사용자 오류 문구와 개발자 원문

실 gateway에서 존재하지 않는 참여자와 존재하지 않는 방을 사용해 실패를 유도했다.

```text
CREATE_FAIL status=404 message=참여자를 찾을 수 없습니다 developerLeak=false
SEND_FAIL status=404 message=채팅방을 찾을 수 없습니다 developerLeak=false
```

응답 전체에서 `Exception`, `StackTrace`, `org.`, `java.`, `SQL`, `select`, `insert`, `constraint`, `PGobject`를 검사했고 0건이었다.

화면 계약 테스트도 사용자 문구 2종을 확인했다.

```text
대화방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.
메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.
Test Files 1 passed (1)
Tests 6 passed (6)
```

단, Browser runtime이 없어 실패를 실제 화면에 띄운 PNG 캡처는 skipped다.

## 6. 발신자·상대 부서 DB/API 일치

격리 user DB:

```text
dev_manager|[DEV-SEED] 개발매니저|대표실|NULL
dev_master|[DEV-SEED] 개발마스터|대표실|NULL
```

실 chat API:

```text
DIRECT_CREATE ... partner=[DEV-SEED] 개발매니저|대표실|
ROUNDTRIP_A_RECIPIENT ... sender=[DEV-SEED] 개발마스터|대표실|mine=false
ROUNDTRIP_B_RECIPIENT ... sender=[DEV-SEED] 개발매니저|대표실|mine=false
```

판정: 상대 이름, 양쪽 발신자 이름, 부서가 DB 값과 일치한다. 사번은 DB `NULL`이므로 API 빈 값도 일치한다.

## 7. UUID 비노출

방 목록 2세션과 메시지 목록 2세션의 사용자 노출 chat 응답 전체에 UUID 정규식을 적용했다.

```text
CHAT_API_UUID_EXPOSURE matches=0 masterList=200 managerList=200
```

방 URL 식별자는 `CHAT-20260812-000017` roomCode다. 실제 화면 UUID 검사는 Browser runtime 부재로 화면 캡처 항목과 함께 skipped지만, 사용자 노출 chat API에는 UUID가 없다.

## 8. 기존 메신저 5 API

```text
LEGACY_5 search=200 direct=201 bulk=201 inbox=200 read=200 readState=READ
```

판정: 수신자 검색, 단건 발송, 일괄 발송, 수신함, 읽음 처리 모두 실 격리 스택에서 통과했다.

## 9. 기존 결재 co-edit REST/SSE

기존 결재 `2026/07/19-1`을 사용했다. master가 SSE를 먼저 연결하고 manager가 presence join을 보냈다.

```text
COEDIT_REST_SSE stream=200 event=event:connected ... event:presence:join data:{"sessionId":"reconv2-...","displayName":"[DEV-SEED] 개발매니저","color":"AMBER"} join=200 comments=200 edits=200 presence=200 coedit=200 update=200
COEDIT_AWARENESS_CLIENT_FORMAT status=200
```

처음 임의 JSON 문자열 awareness는 base64 계약 위반으로 400이었고, 실제 desktop 계약 값 형식 `BQYH`로 재호출해 200을 확인했다. 기존 SSE broker 경로와 co-edit REST 6경로가 연결된다.

## 10. fix2 집중 회귀

실 Testcontainers PostgreSQL 집중 IT:

```text
> Task :services:groupware-service:test
BUILD SUCCESSFUL in 34s
```

`ChatFix2RedIT`의 DIRECT FK, advisory lock 반환형, 동시 20건 sequence 3개 테스트가 통과했다.

desktop 채팅 화면 계약:

```text
src/renderer/routes/ChatRoomPage.fix1.test.tsx (6 tests) 203ms
Test Files 1 passed (1)
Tests 6 passed (6)
```

## 11. 스크린샷과 증거 무결성

Browser 연결 원문:

```text
No browser is available
[]
```

따라서 이 라운드 PNG는 0개이며 나열할 스크린샷 경로는 **없다**. 증거 안내 파일은 다음 1개다.

```text
docs/qa/2026-08-12-894-reconv2/README.md
```

이전 라운드 PNG나 mock 이미지는 재사용하지 않았다.

## 12. 삭제 추적 파일 확인

git 명령 없이 worktree index v2를 직접 읽어 19,395개 추적 entry의 실제 경로 존재를 전수 확인했다.

```text
INDEX_VERSION=2
TRACKED_ENTRY_COUNT=19395
MISSING_TRACKED_COUNT=0
TRACKED_WRITER_EXISTS=true
TRACKED_WRITER_LENGTH=42
TRACKED_WRITER_SHA256=F3A735766688747E0E23C5D4155E95D1BF1B2134C845263D784661E8F79603A3
```

**삭제된 추적 파일 없음.** `tools/.s24-build-only/build/deep/tracked-writer.mjs`도 원래 길이와 해시로 존재하므로 `git add -f` 복구는 필요하지 않았다.

## 최종 답

**이번 재수렴 2회차에서 실 사용자 세션·실 gateway/API·SSE·PostgreSQL 경로로 재현된 결함은 없다.** 화면 자동 갱신 장면과 화면 실패 문구 PNG는 Browser runtime 부재로 skipped이며, 이를 결함으로 집계하지 않았다.
