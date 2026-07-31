# PR #1006 기능 회귀 재수렴 검토

- 대상: Issue #895 일정관리 슬라이스 2
- 검증 브랜치: `feat/895-schedule-s2`
- 검증 HEAD: `7fe10f5bdc9c6cf7289c2b4c1ca6e04448ee135a`
- 검토 시각: 2026-07-31 KST
- 검토 역할: 기능 회귀 검토자. 구현 코드 수정 없음
- 제약 준수: git 쓰기, Docker 이미지 재빌드, 서비스 재기동, 공유 DB 쓰기 모두 0건

## 1. 최종 판정 — BLOCK

소스 기준으로 재현 가능한 기능 회귀는 찾지 못했다. 특히 첫 번째 고정 각도인
"보여야 할 일정이 안 보이게 됐는가?"는 V17 적용을 전제로 통과한다.

- 공유 DB 읽기 전용 계산: 현재 V14 데이터 `106 → 64`, V17 가상 적용 후 `106` 복구
- V17 영구 누락 활성 일정: `0건`
- 현재 운영 생성 경로 중 작성자 대상자 행 누락 경로: `0개 / 2개`
- 대상자 수정 경로 중 작성자 행 삭제 가능 경로: `0개`
- exact SHA 모듈 전체: `242건 / 실패 0 / 오류 0 / 건너뜀 0`
- exact SHA GitHub CI: `38개 / 성공 38 / 대기 0 / 실패 0`

그러나 머지 게이트의 세 번째 조건인 **exact SHA 라이브 QA 성공**은 충족되지 않았다.
현재 실서버는 `groupware_db V14`, `auth_db V89`이고 소스는 각각 V18, V90이다.
실서버의 활성 대상자 일정 상세 1회는 기대 200 대신 500, 미존재 상세 1회는 기대 404
대신 500이었다. 로그 원인은 두 경우 모두 신규 GET 매핑이 아직 없는 실행 이미지의
`HttpRequestMethodNotSupportedException: Request method 'GET' is not supported`였다.

따라서 이 판정은 **소스 결함 BLOCK이 아니라 배포 전 실행 스택으로 인해 라이브 게이트가
닫히지 않은 BLOCK**이다. auth V90과 groupware V17·V18 및 exact SHA 애플리케이션 배포 후
동일 라이브 경로를 다시 실행해야 PASS로 바꿀 수 있다.

## 2. 차단 문제

### B-01. exact SHA 라이브 상세 성공을 확인할 수 없음

**실 사용자 기능 경로**

대상자가 일정 목록에서 일정을 열면
`GET /admin/groupware/schedules/{scheduleId}`를 호출한다. 소스의 신규 매핑은
`services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java:314-325`에 있다.

**재현 절차**

1. 공유 `groupware_db`에서 삭제되지 않은 일정과 그 일정의 활성 대상자 한 쌍을 SELECT로
   고른다. UUID는 보고서에 기록하지 않았다.
2. 실서버 `localhost:8092`의 기존 기간 목록 GET을 같은 대상자 헤더로 호출해 서버와
   호출 경로가 살아 있는지 확인한다.
3. 같은 대상자로 선택한 일정의 상세 GET을 호출한다.
4. 같은 대상자로 임의의 미존재 일정 ID 상세 GET을 호출한다.
5. 같은 시각의 `samhan-groupware-service` 로그를 읽는다.

권한 마이그레이션 V90이 아직 적용되지 않은 영향을 분리하기 위해 직접 서비스 프로브에는
대상자 `X-User-Id`와 시스템 마스터 헤더를 사용했다. 따라서 이는 실서버 라우팅·서비스
실행 검증이며, 게이트웨이 JWT 종단 간 검증은 아니다.

**관측된 잘못된 결과**

| 프로브 | 기대 | 관측 | 잘못된 결과 |
|---|---:|---:|---:|
| 기존 기간 목록 | 200 | 200 | 0/1 |
| 활성 대상자의 존재 일정 상세 | 200 | 500 | 1/1 |
| 미존재 일정 상세 | 404 | 500 | 1/1 |

두 500 응답의 본문 코드는 모두 `INTERNAL_ERROR`였다. 서버 로그에는 두 번 모두
`HttpRequestMethodNotSupportedException: Request method 'GET' is not supported`가 남았다.

**근거와 원인 분리**

- exact SHA에는 GET 매핑이 존재한다:
  `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java:320-325`
- exact SHA 통합 테스트에서는 대상자 200, 비대상자 404, 미존재 404가 모두 통과했다:
  `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwareAdminControllerIT.java:988-1048`
- 공유 DB Flyway 최고 적용 버전은 V14지만, 작성자 backfill은 소스 V17이다:
  `services/groupware-service/src/main/resources/db/migration/V17__add_schedule_owner_as_participant.sql:4-27`
- 공유 auth DB 최고 적용 버전은 V89지만, `groupware.schedules` 권한 seed는 소스 V90이다:
  `services/auth-service/src/main/resources/db/migration/V90__seed_groupware_schedules_page_permission.sql:14-168`

즉 관측 500은 검증 대상 HEAD의 신규 메서드가 잘못 실행된 결과가 아니라, 그 메서드가 없는
이전 이미지가 실행된 결과다. 그렇더라도 exact SHA 라이브 성공값이 없으므로 머지 게이트는
BLOCK이다.

## 3. 첫 번째 각도 — 보여야 할 일정이 안 보이게 됐는가

### 3.1 V17은 모든 활성 일정을 대상으로 하는가

그렇다. V17의 기준 집합은 `FROM schedules s WHERE s.is_deleted = FALSE`이므로 삭제되지 않은
모든 일정을 시작 집합으로 삼는다.

`NOT EXISTS`는 작성자 활성 대상자 행이 이미 있는 일정만 삽입 대상에서 제외한다. 즉
건너뛴 행은 이미 새 목록 조건을 만족한다. 작성자나 상태, 기간에 의한 추가 제외 조건은 없다.

- 전체 기준 집합: `V17__add_schedule_owner_as_participant.sql:19-20`
- 이미 충족된 행만 제외: 같은 파일 `:21-27`
- `schedules.owner_id`는 NOT NULL: `V1__init_groupware.sql:108-123`
- 활성 대상자 중복은 부분 unique index로 방지: `V1__init_groupware.sql:151-154`

공유 DB 읽기 전용 실측:

| 항목 | 건수 |
|---|---:|
| 활성 일정 | 42 |
| 삭제 일정 | 0 |
| 활성 일정 중 owner NULL | 0 |
| V17 삽입 후보 | 42 |
| V17 조건 때문에 작성자 행 없이 영구 누락되는 활성 일정 | 0 |

### 3.2 V17 적용 후 가시 건수는 106으로 복구되는가

그렇다. 공유 DB에는 쓰지 않고, V17의 SELECT 결과를 CTE로 기존 활성 대상자 집합에 합친
가상 적용 결과를 계산했다.

- 현재 V14의 기존 조건 총합: 106
- 현재 V14 데이터에 새 조건만 적용한 총합: 64
- V17 가상 적용 후 새 조건 총합: 106
- 가시 사용자 수: 12

사용자별 재현값:

| 익명 사용자 | 기존 조건 | 현재 V14 + 새 조건 | V17 가상 적용 + 새 조건 |
|---|---:|---:|---:|
| 사용자-01 | 8 | 8 | 8 |
| 사용자-02 | 8 | 8 | 8 |
| 사용자-03 | 8 | 8 | 8 |
| 사용자-04 | 8 | 0 | 8 |
| 사용자-05 | 8 | 8 | 8 |
| 사용자-06 | 16 | 8 | 16 |
| 사용자-07 | 1 | 0 | 1 |
| 사용자-08 | 16 | 8 | 16 |
| 사용자-09 | 8 | 0 | 8 |
| 사용자-10 | 8 | 8 | 8 |
| 사용자-11 | 16 | 8 | 16 |
| 사용자-12 | 1 | 0 | 1 |
| **합계** | **106** | **64** | **106** |

따라서 42건 감소는 새 목록 조건 자체의 영구 데이터 손실이 아니라, 현재 공유 DB가 V17
이전이라는 설명과 정확히 일치한다.

### 3.3 V17 이후 신규 일정 생성 경로

프로덕션 소스에서 `Schedule.create()` 후 일정을 저장하는 경로는 두 곳이다.

1. 사용자 POST 경로
   - `ScheduleService.create()`가 일정을 만든 직후 `schedule.addParticipant(ownerId)`를
     호출한 뒤 저장한다.
   - 근거: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:32-50`
2. 개발 데이터 시더 경로
   - `GroupwareSeeder.seedSchedules()`도 작성자를 먼저 대상자로 넣고 저장한다.
   - 근거: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/seed/GroupwareSeeder.java:272-303`

프로덕션 범위의 `Schedule.create`, `new Schedule`, 일정 테이블 직접 INSERT,
`scheduleRepository.save` 소비처를 전수 검색했으며 다른 생성 경로는 없었다. 현재 신규 생성
경로에서 작성자 대상자 행이 빠지는 경우는 `0개 / 2개`다.

### 3.4 대상자 수정 시 작성자 행을 지울 수 있는가

현재 사용자 수정 경로에서는 지울 수 없다.

- 수정 시작 시 legacy 상태도 `schedule.addParticipant(schedule.getOwnerId())`로 먼저 복원한다:
  `ScheduleService.java:82-90`
- 요청 대상자 전체 교체에서 작성자가 빠져 있어 제거를 호출하더라도 도메인 메서드가
  owner ID 삭제를 즉시 무시한다: `Schedule.java:139-147`
- 신규 대상자 단건 추가 경로도 작성자를 먼저 보장한다: `ScheduleService.java:116-125`

따라서 PUT 요청의 `participantIds`가 null, 빈 배열, 작성자 미포함 배열인 조합 모두에서
작성자 활성 대상자 행은 유지된다.

## 4. 두 번째 각도 — 단건 상세가 연 표면

### 4.1 exact SHA 동작

보고서와 같은 모듈 전체 명령을 새로 실행했고 신규 상세 통합 테스트가 실제로 포함됐다.

| 경우 | 기대 | exact SHA 관측 |
|---|---:|---:|
| 활성 대상자 | 200 | 200 |
| 비대상자 | 404 | 404 |
| 미존재 | 404 | 404 |

저장소는 일정 ID와 활성 대상자 `EXISTS`를 한 쿼리에서 판정하고, 실패는 서비스에서 같은
`NOT_FOUND`로 바꾼다.

- 저장소: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ScheduleRepository.java:22-29`
- 서비스: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:65-70`
- 컨트롤러: `GroupwareAdminController.java:314-325`

### 4.2 정상 사용자가 자기 일정을 열 때 404가 되는 조합

정상 배포 순서, 즉 시작 시 V17이 적용된 exact SHA에서는 찾지 못했다. 기존 일정 42건은
V17이 모두 보완하고, 이후 생성 두 경로는 작성자를 저장하며, 수정은 작성자 삭제를 막는다.

다만 **새 쿼리만 V14 데이터에 적용하는 비정상 조합**에서는 작성자 행이 없는 42건이
작성자에게도 보이지 않고 상세도 404가 된다. 현재 공유 DB가 바로 그 데이터 상태지만 현재
실행 앱은 신규 쿼리·신규 상세 전 버전이다. 정상 groupware-service 재배포는 애플리케이션을
열기 전에 Flyway V15~V18을 적용하므로 이 조합은 배포 완료 상태가 아니다.

### 4.3 UUID 노출

신규 상세은 기존 `ScheduleResponse`를 재사용한다. 응답 payload에는 내부 식별용
`scheduleId`, `ownerId`, `participantIds` UUID가 그대로 있다:
`services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleResponse.java:22-40`.

이번 변경이 추가한 화면용 라벨이나 UUID 문자열 렌더링은 `0개`다. 클라이언트 전체 검색에서도
일정 API 소비·화면 렌더링은 `0개`였고, DTO 주석은 owner/participant UUID를 화면에 표시하지
말라고 명시한다. 따라서 API 내부 식별자는 존재하지만 **사용자 화면에 노출되는 UUID 표면은
이번 변경에 없다**.

## 5. 세 번째 각도 — 변경 7개 파일과 신규 3개 파일의 전체 표면

`git show --numstat 7fe10f5bd` 기준 변경을 각각 확인했다.

| 파일 | 열린 표면 | 다른 소비자 영향 |
|---|---|---|
| `GroupwareAdminController.java` | 대상자 상세 GET 1개 추가 | 신규 외부 API 경로 1개 |
| `ScheduleResponse.java` | 화면 표시 금지 Javadoc 정정 | wire field 변경 0개 |
| `ScheduleRepository.java` | 목록 판정을 대상자 EXISTS로 단일화, 상세 쿼리 추가 | 현재 목록 소비자 1개와 신규 상세 소비자 1개 |
| `ScheduleService.java` | 대상자 기준 상세 서비스 추가 | 기존 수정·삭제 경로 변경 0개 |
| `GroupwareAdminControllerIT.java` | POST 기반 목록 fixture와 상세 3경우 | 운영 경로 추가 없음 |
| `GroupwarePermissionControllerIT.java` | 신규 GET의 VIEW 권한 매트릭스 등록 | 운영 경로 추가 없음 |
| `ScheduleRepositoryTest.java` | legacy owner-less 비노출 계약으로 변경 | 운영 경로 추가 없음 |
| `participant-contract.md` | 구현·수치 보고 | 런타임 영향 없음 |
| `participant-contract.md` 계획 | 구현 순서 기록 | 런타임 영향 없음 |
| `participant-contract-design.md` | 설계 계약 기록 | 런타임 영향 없음 |

프로덕션 참조 전수 검색 결과 `findVisibleInRange()`는
`ScheduleService.findInRange()`와 목록 컨트롤러만 소비한다. 알림, 별도 필터, 통계,
대시보드가 이 저장소 메서드를 직접 소비하는 경로는 현재 `0개`다. `schedule_participants`
직접 소비도 일정 도메인·저장소·마이그레이션·시더 밖에는 없다. 따라서 현재 변경으로 동작이
달라지는 기존 소비자는 기간 목록 하나이며, V17 이후 그 가시 총합은 106으로 유지된다.

알림·필터·통계·대시보드의 부재 자체는 다음 슬라이스 범위이므로 결함으로 세지 않았다.

## 6. 네 번째 각도 — 보고서 수치 재현

### 6.1 모듈 전체 242건

보고서와 같은 명령을 실행했다.

```powershell
$taskGradleHome = 'D:\dev\Samhan-Public\.gradle-t20'; $env:GRADLE_USER_HOME = $taskGradleHome
.\gradlew :services:groupware-service:test --rerun-tasks --no-daemon --console=plain
```

관측:

```text
BUILD SUCCESSFUL in 2m 11s
27 actionable tasks: 27 executed
xml_files=32 tests=242 failures=0 errors=0 skipped=0
```

보고서의 `242건`과 일치한다. 테스트 DB는 격리 Testcontainers였고 공유 DB write는 없었다.

### 6.2 106 → 64 및 사용자별 표

공유 DB에 `docker exec ... psql ... -c "SQL"` 형식의 SELECT만 실행했다. 기존 조건,
현재 새 조건, V17 결과를 합친 가상 대상자 집합을 같은 활성 일정 스냅샷에서 계산했다.

- 활성 일정 42
- 가시 사용자 12
- 기존 106
- 현재 새 조건 64
- 감소 42
- V17 가상 적용 후 106
- 사용자별 12행: 개발 보고서와 전 행 일치

보고 수치 불일치는 `0개`다.

### 6.3 exact SHA CI

`gh pr view 1006`과 `gh pr checks 1006`을 읽기 전용으로 확인했다.

```text
head=7fe10f5bdc9c6cf7289c2b4c1ca6e04448ee135a
checks=38 success=38 pending=0 non_success_completed=0
```

CI 조건은 충족한다.

## 7. 이 라운드가 보지 않은 것

- 데스크톱 일정 화면, 캘린더, 대시보드 오늘·이번 주 위젯
- 부서 공유·전사 공유와 구성원 물질화
- 종일 일정
- 일정 알림의 실제 발행·자기 알림 제외 동작
- 다음 슬라이스의 필터·통계 소비 동작
- 공유 DB에 V17·V18 또는 auth V90을 실제 적용하는 작업
- Docker 이미지 재빌드·서비스 재기동·배포
- exact SHA 배포 후 게이트웨이 JWT를 거치는 종단 간 라이브 QA
- POST·PUT·DELETE를 사용하는 공유 실서버 쓰기 시나리오

위 항목의 부재는 이번 슬라이스 결함으로 세지 않았다. 다만 exact SHA 배포 후 종단 간
라이브 QA는 머지 게이트 필수 잔여 작업이다.
