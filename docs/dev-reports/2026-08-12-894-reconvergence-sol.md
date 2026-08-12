# PR #1125 (#894) fix1 재수렴 적대검증 보고서

- 검증일: 2026-08-12
- 대상: `feat/894-internal-chat` / 요청 기준 HEAD `252451eb9`
- 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 제약: 구현 코드 변경 없음, 공유 `samhan-*` 스택 쓰기 없음, git 명령 미사용

## 진행 집계

| 구분 | passed | skipped | failed |
|---|---:|---:|---:|
| UTF-8 파일 복제·직후 한글 검증 | 6 | 0 | 0 |
| V21 실제 적용·DB 제약·재시작 채번 연속성 | 4 | 0 | 0 |
| 방 생성·메시지 발송 실 사용자 경로 | 0 | 0 | 3 |
| 참여자 표시·비참여자 권한·UUID | 12 | 0 | 1 |
| 기존 메신저 5 API | 5 | 0 | 0 |
| 기존 결재 co-edit REST/SSE·화면 | 4 | 0 | 0 |
| Playwright 화면·한글 PNG | 6 | 0 | 2 |
| **최종 누계** | **37** | **0** | **6** |

## 측정 기록

### 1. 격리 범위와 UTF-8 파일 복제

공유 `samhan-postgres`에는 읽기 SELECT와 컨테이너 내부 파일 `pg_dump -Fc -f`만 수행했다. PowerShell/셸 파이프를 사용하지 않았다. 덤프는 `docker cp`로 `C:\Temp\recon894\*.dump` 파일을 경유해 신규 격리 컨테이너 `recon894-pg`(호스트 `42232`)로 옮겼다.

원본 SELECT 원문:

```text
PMLIVEQA-892-BURST 30회차
PMLIVEQA-892-BURST 30회차
PMLIVEQA-892-BURST 30회차
messages=598
groupware_db|UTF8

dev_accountant|[DEV-SEED] 개발회계|사원
dev_developer|[DEV-SEED] 개발개발자|개발자
dev_disabled|[DEV-SEED] 탈퇴사용자|사원
employees=25
user_db|UTF8

accounts=33
auth_db|UTF8
```

복제 직후 동일 SELECT 원문:

```text
PMLIVEQA-892-BURST 30회차
PMLIVEQA-892-BURST 30회차
PMLIVEQA-892-BURST 30회차
messages=598
groupware_db|UTF8

dev_accountant|[DEV-SEED] 개발회계|사원
dev_developer|[DEV-SEED] 개발개발자|개발자
dev_disabled|[DEV-SEED] 탈퇴사용자|사원
employees=25
user_db|UTF8

accounts=33
auth_db|UTF8
```

호스트 경유 파일 SHA-256:

```text
groupware.dump 476DD0C27F7AE356A75D7438E8EC3DF3CE823946FE354408D611BD8D39997D8F
auth.dump      A9CBA5F817AF2D48243C89D09B050E5C693136D444C0A024F03951D6E3BD32F1
user.dump      5D6A71040C2A53372E1B18992D222662C6CA239B46BAC7733BC8E6A1B6FC9678
```

판정: 복제 직후 한글·행 수·DB 인코딩이 원본과 일치한다. 이후 쓰기는 `recon894-pg`와 신규 격리 서비스/포트에만 수행한다.

### 2. 현재 HEAD 빌드와 V21 실제 적용

처음 발견한 기존 `groupware-service.jar`에는 V21이 없었으므로 그 실행 결과를 전부 폐기했다. 현재 소스로 `:services:groupware-service:bootJar`를 다시 만들고 jar 내부에 `BOOT-INF/classes/db/migration/V21__harden_room_chat_sequences.sql`이 있음을 확인한 뒤 격리 DB에 재기동했다.

```text
BUILD SUCCESSFUL in 28s
21:21:harden room chat sequences:true
20:20:add room based internal chat:true
chat_room_code_seq|16
CREATE UNIQUE INDEX ux_messages_room_sequence ON public.messages USING btree (room_id, sequence_no)
```

서비스 재시작 전후 DB sequence는 `18 → 19`로 이어졌다. 재시작 후 신규 방 생성 요청이 번호 19를 소비했지만 아래 결함 때문에 방 행은 생성되지 않았다. 즉 DB 채번 자체의 재시작 연속성은 통과했으나 제품 방 생성은 실패다.

### 3. 결함 1 — 신규 방 생성이 FK 위반으로 HTTP 500

Playwright에서 `dev_master`로 로그인해 사이드바 `채팅` → `새 대화` → `개발영업` 선택 → `대화 시작`을 눌렀다. 응답은 HTTP 500이고 URL 이동은 없었다. 같은 요청을 API로 반복해도 재현됐다.

```text
UI_CREATE status=500 url=/admin/groupware/chat/rooms/direct
RESTART_CREATE status=500
last_value=19
rooms=17
```

서버 원문:

```text
org.hibernate.exception.ConstraintViolationException
ERROR: insert or update on table "chat_room_participants" violates foreign key constraint
       "chat_room_participants_room_id_fkey"
Detail: Key (room_id)=(...) is not present in table "chat_rooms".
```

원인은 `ChatRoom.direct()`가 미리 UUID를 만든 뒤 cascade 컬렉션에 참여자를 넣고 `roomRepository.save(room)` 한 번으로 저장하는데, 실제 flush에서 참여자 INSERT가 방 INSERT보다 먼저 실행되는 것이다. fix1의 DB 채번은 충돌을 막았지만 신규 방 생성 전체가 불가능한 새 결함을 만들었다.

화면은 실패 후 선택 상태와 `대화 시작` 버튼만 남고 오류 배너·문구가 전혀 없다. `createErrorVisible=false`였다. 따라서 생성 실패와 실패 무표시를 각각 실 사용자 결함으로 센다.

### 4. 결함 2 — 메시지 발송이 단건·동시 모두 HTTP 500

격리 DB에 진단용 방과 두 참여자만 직접 넣어 방 생성 결함과 분리했다. 이 시드는 제품 생성 성공 증거로 세지 않는다. 두 계정이 볼 수 있도록 서로 보낸 기존 메시지 2행도 진단용으로 넣었다.

동일 방에 실제 HTTP 요청 20건을 동시에 발송한 결과:

```text
CONCURRENT_SEND statuses=500,500,500,500,500,500,500,500,500,500,
                         500,500,500,500,500,500,500,500,500,500
visible=0 duplicateSequences=측정불가
```

Playwright 화면에서 `화면에서 보내는 재수렴 메시지`를 입력하고 `보내기`를 눌러도 HTTP 500이며 입력값이 그대로 남았다.

서버 원문:

```text
java.lang.ClassCastException: class org.postgresql.util.PGobject cannot be cast to class java.lang.Long
at jdk.proxy2.$Proxy226.lockRoomSequence
at ChatMessageService.send(ChatMessageService.java:35)
```

좌표는 `MessageRepository.lockRoomSequence()`의 native query
`select pg_advisory_xact_lock(...)` 반환형을 `Long`으로 선언한 부분이다. PostgreSQL JDBC는 void 반환을 `PGobject`로 전달하므로 메서드 반환 변환에서 죽는다. 따라서 fix1이 목표로 한 “20건 동시 sequence 무중복”은 중복 이전에 **20/20 발송 실패**로 제품 결함이다.

화면은 발송 실패 뒤 입력값만 남기고 오류 문구를 표시하지 않았다. 이것도 별도 실 사용자 결함으로 센다.

### 5. 두 사용자 화면·발신자 구분·표시 정보

Playwright Chromium 1217로 실제 격리 renderer `42275`와 gateway `42280`을 밟았다. `dev_master`와 `dev_manager` 별도 browser context에서 같은 방을 열었다.

```text
MASTER: 상대=[DEV-SEED] 개발매니저
        내 메시지 라벨=나
        상대 메시지 라벨=[DEV-SEED] 개발매니저
MANAGER: 상대=[DEV-SEED] 개발마스터
         내 메시지 라벨=나
         상대 메시지 라벨=[DEV-SEED] 개발마스터
```

이름과 `나/상대` 구분은 통과했다. 그러나 DB 원문에는 `dev_master|대표실`, `dev_manager|대표실`이 있는데 실제 room/message API와 화면에는 부서가 비어 있었다. `/internal/users/{id}` 실제 응답이 `id, loginId, fullName, role`만 내리고 fix1 client는 존재하지 않는 `departmentName`, `ecountCode`를 읽는다. 따라서 요구된 상대·발신자 **부서/사번 표시가 실 화면에서 누락**된다. dev seed의 `ecount_code`는 비어 있어 사번은 이 표본만으로 별도 판정하지 않고, DB에 존재하는 부서 누락 1건만 결함으로 센다.

### 6. 비참여자 직접 API 권한과 UUID 비노출

`dev_sales`가 진단용 방을 API로 직접 호출했다.

```text
OUTSIDER_READ status=403
OUTSIDER_WRITE status=403
OUTSIDER_MARK_READ status=403
OUTSIDER_STREAM status=403
LIST_OUTSIDER status=200 containsRoom=false
```

신규 채팅 room 목록·message 목록·발송 500 오류·방 생성 500 오류·비참여자 403 오류·두 사용자 화면·room URL을 UUID 정규식으로 검사해 일치 0건이었다. URL은 `#/chat/CHAT-20260812-RECONV`처럼 roomCode만 사용했다.

### 7. 기존 메신저 5 API 무손상

동일 격리 스택에서 기존 메신저 표면을 다시 실제 호출했다.

```text
LEGACY search=200 count=1
LEGACY direct=201
LEGACY bulk=201 sentCount=2
LEGACY inbox=200
LEGACY read=200 readState=READ
```

### 8. 기존 결재 co-edit REST/SSE와 실제 화면

기존 PENDING 결재 `2026/07/19-1 · LiveQA848 발의 오버플로 검증` 상세를 Playwright로 열고 `수정`을 눌렀다. `협업 연결 중…`이 사라지고 실제 수정 form이 활성화됐다.

```text
collab/stream GET 200
collab/comments GET 200
collab/edits GET 200
collab/presence GET/POST 200
collab/coedit GET 200
collab/coedit/awareness POST 200
collab/coedit/update POST 200
coeditPending=0 formVisible=true
```

공유 RealtimeBroker를 쓰는 기존 결재 SSE/co-edit가 실제 화면에서도 연결된 것을 확인했다.

### 9. 스크린샷과 한글 확인

모든 PNG는 실제 격리 renderer의 Playwright Chromium 캡처다. 합성/Mock 이미지는 없다. 저장 후 8장을 직접 열어 `채팅`, `새 대화`, `개발마스터`, `개발매니저`, `재수렴 확인`, `결재 상세`, `수정 이력` 한글이 정상임을 확인했다.

```text
docs/qa/2026-08-12-894-reconv/00-login.png                         1440x1000 26564 bytes
docs/qa/2026-08-12-894-reconv/00-login-after.png                   1280x720  35481 bytes
docs/qa/2026-08-12-894-reconv/01-master-chat-list.png              1440x1000 25812 bytes
docs/qa/2026-08-12-894-reconv/02-master-chat-detail.png            1440x1000 35107 bytes
docs/qa/2026-08-12-894-reconv/03-send-failure-visible-path.png     1440x1000 35618 bytes
docs/qa/2026-08-12-894-reconv/04-new-conversation-failure.png      1440x1000 31061 bytes
docs/qa/2026-08-12-894-reconv/05-manager-chat-detail.png           1440x1000 35294 bytes
docs/qa/2026-08-12-894-reconv/06-existing-coedit-connected.png     1440x1391 91354 bytes
```

### 10. 최종 판정

**실 사용자 경로로 재현 가능한 결함이 있다. 총 5건이다.**

1. 신규 DIRECT 방 생성이 `chat_rooms`/participant cascade INSERT 순서 FK 위반으로 HTTP 500이다.
2. 방 생성 실패가 화면에 표시되지 않는다.
3. 메시지 단건·동시 발송이 advisory-lock native query의 `PGobject → Long` 변환 실패로 HTTP 500이다.
4. 메시지 발송 실패가 화면에 표시되지 않는다.
5. DB에 존재하는 상대/발신자 부서가 API와 실제 화면에서 누락된다.

fix1의 핵심 동시성 경로는 20건 모두 500이라 sequence를 하나도 발급하지 못했다. 이는 3번 결함의 동시 사용자 영향이며, 집계에서는 단건 발송과 동시 20건을 서로 다른 실패 시나리오로 셌다.

방 코드 DB sequence 자체는 서비스 재시작 뒤에도 이어졌고, 비참여자 5경로·신규 chat UUID 비노출·기존 메신저 5 API·기존 결재 co-edit REST/SSE/화면은 통과했다.

### 11. 추적 파일 보존

git 명령 없이 worktree index v2를 직접 읽어 추적 entry 전부의 물리 존재를 대조했다.

```text
INDEX_VERSION=2
TRACKED_ENTRY_COUNT=19384
MISSING_TRACKED_COUNT=0
TRACKED_WRITER_EXISTS=True LENGTH=42
SHA256=F3A735766688747E0E23C5D4155E95D1BF1B2134C845263D784661E8F79603A3
```

**삭제된 추적 파일 없음.** 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`가 존재한다.
