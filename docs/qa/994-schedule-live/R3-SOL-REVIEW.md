# PR #994 / Issue #895 일정관리 R3 SOL 도달성 적대검증

## 최종 판정

- 대상 브랜치/HEAD: `feat/895-dashboard-schedule` / `74466117718a77e73d20411fa04907c002e1d6a8`
- 비교 기준: `origin/main...HEAD`
- 판정 기준: **이 PR이 바꾼 표면에서 인증된 실사용자 화면·요청으로 재현 가능한가**
- 판정: **도달 가능한 결함 2건**
  1. 확정 일정의 대상자에게 전달되는 알림 경로가 없다.
  2. 대상자가 아닌 등록자도 `owner OR participant` 목록 조건으로 일정을 조회한다.
- 증거 무결성: **수치 불일치 1건** — PR 코멘트의 `v90_account_rows_would_materialize = 25`를 현재 같은 live `auth_db`에서 재현하면 `10`이다.
- KST: 현재 구현된 API 왕복에서 날짜 밀림은 확인되지 않았다. 다만 실제 운영 cutover 상태와 아직 없는 달력 UI의 “오늘” 계산은 **판정불가**다.
- auth 기존 권한 표면: 도달 결함 0건.
- 다른 열린 브랜치의 auth Flyway V90 충돌: 0건.

## 5명 리뷰어 운용과 합의

| 리뷰어 | 조사 각도 | 개별 판정 | 최종 반영 |
|---|---|---|---|
| 1 | 대상자 알림·KST | 알림 결함 1, KST 현재 결함 0/운영 판정불가 | 반영 |
| 2 | 목록 조회 전체 진입점 | 비대상 등록자 노출 결함 1 | 반영 |
| 3 | auth `PageCode`·V90 seed 부수효과 | 도달 결함 0 | 반영 |
| 4 | 원격 브랜치 V90 충돌·증거 무결성 | migration 충돌 0, 증거 수치 불일치 1 | 반영 |
| 5 | 독립 읽기 전용 Codex 적대검증 | 도달 결함 0 | 일부 기각 |

리뷰어 5는 초기 정찰 문서의 “알림을 MVP 기본 범위에 넣지 않는다”는 문구
(`docs/dev-reports/2026-07-29-895-dashboard-schedule-plan.md:202-223`)를 우선해
알림 미구현을 결함에서 제외했다. 그러나 이번 라운드 입력에 적힌 **후속 확정 사양**
“대상자만 알림 받고 조회 가능”이 더 최신이고 명시적이므로 그 판단은 기각했다.
또한 등록자와 대상자가 분리된 R2 실측을 놓쳤으므로 조회 판정도 채택하지 않았다.

## 결함 1 — 확정 일정 대상자에게 전달되는 알림 경로가 없다

### 실 사용자 경로

`groupware.schedules / CREATE` 권한이 있는 내부 사용자 A가 대상자 B를 지정해
`CONFIRMED` 일정을 등록하거나, 자기 일정을 수정해 B를 새 대상자로 추가한다.
B는 데스크톱 상단 알림 벨 또는 알림 내역 화면을 확인한다.

이 요청 경로는 R2에서 실제 JWT로 실행됐다. A=`dev_sales`, B=`dev_accountant`로
`participantIds=[B]`인 일정 등록이 HTTP 201이었고
(`docs/qa/994-schedule-live/R2-REPORT.md:92-105`), B의 일정 목록에는 같은 일정이
HTTP 200으로 반환됐다(`docs/qa/994-schedule-live/R2-REPORT.md:107-118`).

### 재현 절차

1. A의 실제 로그인 JWT로 아래 요청을 보낸다.

   ```text
   POST /admin/groupware/schedules
   status=CONFIRMED
   participantIds=[B]
   ```

2. B로 로그인한다.
3. B의 일정 범위 조회에서 일정이 반환되는지 확인한다.
4. 알림 발생 시각까지 기다린 뒤 데스크톱 알림 벨, `GET /api/notifications/my`,
   `GET /api/notifications/history`를 확인한다.
5. 이 라운드에서는 새 write를 하지 않고 R2 전용 일정
   `5cf3a8b1-c45d-42b2-9379-55d3619761ab`과 B를 대상으로 live
   `notification_db.notification_center`를 읽기 전용 조회했다.

### 관측된 잘못된 결과

- B는 일정 목록에서는 초대 일정을 조회할 수 있지만 일정 알림을 받지 못한다.
- R2 대상자 B에 대해 일정 ID, R2 제목, `source_service='groupware-service'`를
  대조한 알림 행은 `0`건이었다.
- R2 실행 시각의 UTC/KST 양쪽 5분 범위에서 B에게 생성된 전체 알림도 `0`건이었다.
- 요청 DTO에는 알림 지정 시각도 없고, 일정 생성·수정 트랜잭션은 참여자 행만 저장한다.
  즉 즉시 알림뿐 아니라 예약 알림을 나중에 발행할 outbox/job/publish 경로도 없다.

### 파일:행 근거

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java:290-297`
  — 생성 후 `ScheduleResponse`만 반환한다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:23-49`
  — 의존성은 repository와 `UserClient`뿐이며 생성은 참여자를 추가하고 저장하는 데서 끝난다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:84-101`
  — 수정으로 새 참여자를 추가해도 알림 발행이 없다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleRequest.java:24-31`
  — 알림 시각/정책 필드가 없다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleStatus.java:7-9`
  — `CONFIRMED`를 “참여자 알림 / 캘린더 노출 대상”으로 정의한다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/MessageService.java:35-38,53-68`
  — 같은 서비스의 정상 알림 경로는 `NotificationPublishRequest`를 만들고
  after-commit publisher를 호출한다.
- `services/notification-service/src/main/java/com/samhanair/logis/notification/service/NotificationCenterService.java:31-40`
  — publish 요청이 들어와야 알림 행이 저장된다.
- `clients/desktop/src/renderer/components/NotificationBellDropdown.tsx:30-35,83-90,153-160`
  — 실사용자 알림 벨은 60초마다 알림을 다시 조회해 건수를 표시한다.
- `clients/desktop/src/renderer/api/notificationApi.ts:39-49`
  — 알림 벨/내역의 실제 조회 endpoint.

## 결함 2 — 대상자가 아닌 등록자에게 일정이 표시된다

### 실 사용자 경로

등록자 A가 자신을 `participantIds`에 넣지 않고 B만 대상자로 지정해 일정을 만든다.
이후 A가 자기 인증 JWT로 일정표 범위 조회 요청을 보낸다.

R2의 실제 fixture가 정확히 이 상태다. 응답의 등록자는 `dev_sales`이고
유일한 대상자는 `dev_accountant`다
(`docs/qa/994-schedule-live/R2-REPORT.md:97-105`).

### 재현 절차

1. A로 `participantIds=[B]`인 일정을 등록한다.
2. 응답에서 `ownerId=A`, `participantIds=[B]`이고 A가 대상자 목록에 없는지 확인한다.
3. A의 JWT로 같은 기간을 조회한다.

   ```text
   GET /admin/groupware/schedules?from=2030-01-15T09:00:00&to=2030-01-15T10:00:00
   ```

4. R2에서는 A가 수정한 뒤 같은 조회를 했고, 해당 일정 1건이 HTTP 200으로 반환됐다
   (`docs/qa/994-schedule-live/R2-REPORT.md:212-228`).

### 관측된 잘못된 결과

확정 사양은 “대상자만 조회 가능, 대상자가 아니면 일정에 표시하지 않음”인데,
A는 대상자가 아니어도 등록자라는 이유만으로 일정을 조회한다. 향후 달력 화면이 이
목록 endpoint를 사용하면 같은 일정이 A의 달력에 표시된다.

등록자에게 수정·삭제 권한이 있다는 사양은 목록 표시 대상이라는 뜻이 아니다.
실제 R2 응답의 `participantIds`에도 A는 없다.

### 파일:행 근거

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:38-49`
  — 등록자를 참여자에 자동 추가하지 않고 요청의 `participantIds`만 추가한다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ScheduleRepository.java:31-39`
  — 목록 조건이 `s.ownerId = :userId OR active participant`다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java:302-311`
  — 게이트웨이 호출자 UUID를 목록 조회에 그대로 넘긴다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:63-70`
  — 다른 대상자 정책 없이 repository 조건을 그대로 사용한다.

## 각도별 판정

### 1. 사양과 구현의 어긋남

- 대상자 알림: **도달 결함 1건**. 결함 1 참조.
- 대상자 전용 조회: **도달 결함 1건**. 결함 2 참조.
- KST:
  - HTTP 계약은 offset 없는 `LocalDateTime`을 받고 반환한다
    (`services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleRequest.java:24-31`).
  - DB도 plain `TIMESTAMP`다
    (`services/groupware-service/src/main/resources/db/migration/V1__init_groupware.sql:108-124`).
  - R2의 `09:00~10:00`은 POST 입력, POST 응답, 대상자 GET에서 동일했다
    (`docs/qa/994-schedule-live/R2-REPORT.md:97-115`).
  - 아직 일정 GUI와 서버 측 “오늘” 계산 경로가 없으므로 한국 달력의 오늘이 하루
    밀리는 실사용자 경로는 현재 없다. 운영 cutover가 compose의 KST 설정을 실제로
    적용했는지는 Docker·재배포 금지 조건 때문에 **판정불가**다.

### 2. 경로 개방성

- 일정 목록 GET은 `GroupwareAdminController`의 한 경로뿐이다.
- 운영 코드에서 `ScheduleService.findInRange`와
  `ScheduleRepository.findVisibleInRange`의 호출자도 각각 한 곳뿐이다.
- query의 `ownerId`는 무시되므로 다른 사용자 UUID를 넣어 제3자 일정을 여는 우회는 없다.
- 기간 파라미터 변경으로 소유자/참여자 조건을 제거하는 경로도 없다.
- 단, 공통 한 경로 자체가 등록자를 대상자와 별도로 허용하므로 결함 2가 모든 범위 조회에 적용된다.
- 알려진 상세 GET 405→500은 지시대로 재보고하지 않았다.

### 3. auth `PageCode`·V90 seed 표면 충돌

**도달 결함 0건.**

- V90의 네 DML 대상은 모두 `page_code='groupware.schedules'`로 고정된다
  (`services/auth-service/src/main/resources/db/migration/V90__seed_groupware_schedules_page_permission.sql:14-36,38-71,74-115,118-168`).
- 다른 page-code를 DELETE, UPDATE, 재매핑하는 구문이 없다.
- 내부 10개 역할 그룹 UUID는 기존 V43 역할 그룹과 일치한다.
- 데스크톱 권한설정은 새 행을 카탈로그에 추가했을 뿐, 사용자가 바꾼 dirty page만 저장한다.
- 따라서 기존 권한 보유자의 다른 화면 접근이 이 migration으로 좁아지거나 넓어지는
  실사용자 경로는 확인되지 않았다.

### 4. 다른 열린 PR과 auth V90 충돌

**충돌 0건.**

읽기 전용으로 `git ls-remote --heads origin`의 원격 head 24개를 열거했다.
24개 commit object 모두 현재 저장소에서 `git ls-tree -r --name-only <sha> --
services/auth-service/src/main/resources/db/migration/`으로 확인 가능했다.

- auth `V90__*`가 있는 원격 branch: `feat/895-dashboard-schedule` 1개
- 열린 PR: 7개
- 다른 열린 PR의 auth V90: 0개

따라서 현재 원격 상태에서 다른 열린 PR과 같은 auth Flyway 번호가 합쳐져
서비스 기동이 실패하는 경로는 없다.

## 증거 무결성 대조 결과

### 일치

- R2의 POST `09:00~10:00`은 응답과 대상자 GET에서도 동일하다.
- R2의 등록자/대상자/비대상자 HTTP 상태와 본문은 보고서 내부에서 서로 일치한다.
- `98e2aad81..744661177` 차이는 R2 보고서와 스크린샷뿐이므로, R2가 실행된
  `98e2aad81` 이후 런타임 코드 변경은 없다.
- `03-permission-groupware-schedule.png`를 원본 해상도로 확인했고
  `그룹웨어 일정`, `groupware.schedules`, 보기/생성/수정/삭제/복원/엑셀/인쇄 열이
  실제 캡처와 보고 내용에 일치한다.
- PR 코멘트가 주장한 `CI 42/42`는 `98e2aad81`의 GitHub check-runs를 다시 조회해
  `total_count=42`, `success=42`로 일치했다.

### 불일치 — V90 계정 투영 25건은 현재 재현되지 않음

PR 코멘트
[`#issuecomment-5120851014`](https://github.com/ewoo14/Samhan-Public/pull/994#issuecomment-5120851014)는
공유 DB 읽기 전용 투영의 원문 수치로 아래를 제시했다.

```text
v90_account_rows_would_materialize = 25
```

이 라운드에서 Docker를 사용하지 않고 PostgreSQL JDBC read-only 연결로 V90의 실제
투영 SQL(`V90__seed_groupware_schedules_page_permission.sql:117-158`)을 같은 live
`auth_db`에 다시 실행한 결과는 다음과 같다.

```text
V90_ACCOUNT_ROWS_PROJECTED=10
V90_ACCOUNT_ROWS_ACTIVE=10
ACTIVE_ACCOUNTS=11
V90_SUCCESS=1
```

`127.0.0.1`과 `::1`은 모두 같은 서버 `172.18.0.12`, 같은 `auth_db`에서 같은 값을
반환했다. 따라서 **25라는 실측 수치는 현재 재현되지 않는다.**

다만 최초 코멘트 시점 이후 활성 계정 모집단이 바뀌었는지 확인할 보존 snapshot이나
원본 SELECT 출력 파일이 없어, 당시 수치가 잘못됐는지 이후 데이터가 바뀐 것인지는
**판정불가**다. 제품 도달성 결함으로 세지 않았지만, 요청의 증거 무결성 예외에 따라
반드시 남긴다.

## 이 라운드가 보지 않은 것

- 1차 라운드에서 이미 확인한 타인 수정·삭제 권한 조합은 재실행하지 않았다.
- 이미 원인이 확정된 `GET /schedules/{id}` 405→500은 재조사·재보고하지 않았다.
- 아직 구현되지 않은 데스크톱 달력 UI, 확대 달력, 모바일 iOS형 상호작용,
  공휴일 표시는 실사용자 경로가 없어 조사하지 않았다.
- 지정 시각 알림의 구체 UI/정책은 조사하지 않았다. 이번 라운드는 일정 생성·대상자
  변경부터 notification center까지 **발행 경로 자체가 존재하는지**만 판정했다.
- 운영 네트워크에서 gateway를 우회해 groupware-service에 직접 접근할 수 있는지는
  이 PR이 만든 표면이 아니며 조사하지 않았다.
- 테스트 강도, 누락 테스트, mock 품질, 문서 과장, 가드 완전성은 요청대로 찾거나
  결함으로 보고하지 않았다. 단 원문 수치 불일치는 증거 무결성 예외로 대조했다.
- Docker, Gradle, 서비스 재배포, 공유 실데이터 write는 수행하지 않았다.
  DB 확인은 PostgreSQL JDBC read-only SELECT만 사용했다.
