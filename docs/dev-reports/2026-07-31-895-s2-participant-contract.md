# Issue #895 후속 슬라이스 2 — 대상자 집합 정본·단건 상세 계약

- 작성일: 2026-07-31
- 작업 브랜치: `feat/895-schedule-s2`
- 선행 정찰: `docs/dev-reports/2026-07-31-895-s2-recon.md`
- 작업 원칙: 한국어 산출물, git 쓰기 명령 0건, Docker 이미지 재빌드·서비스 재기동 0건,
  공유 DB write 0건

## 1. 결론

일정 기간 목록의 접근 판정을 `ownerId OR 활성 대상자`에서 활성
`schedule_participants` 행의 `EXISTS` 하나로 변경했다. 정상 POST 경로는 작성자를 실제
대상자 행으로 계속 저장하므로 작성자에게 일정이 보이고, 작성자 대상자 행이 없는 legacy
일정은 작성자에게도 보이지 않는다.

`GET /admin/groupware/schedules/{scheduleId}`를 추가했다. 호출자가 활성 대상자이면
200으로 상세를 반환하고, 대상자가 아니거나 일정이 존재하지 않으면 모두 404
`NOT_FOUND`로 응답한다. 일정 존재 여부 탐색을 막기 위한 결정이며, PUT/DELETE의 등록자
본인 전용 403 검사는 변경하지 않았다.

## 2. 불변식 ① — 접근 판정은 대상자 집합 하나

### 2.1 RED 원문

기존 owner-less 회귀 테스트의 단정을 먼저 `owner 조회 0건`으로 바꾸고, 기존 JPQL에
`s.ownerId = :userId OR`가 남아 있는 상태에서 실행했다. 이 실패는 테스트 오류가 아니라
작성자 조건절이 대상자 행 누락을 우회한다는 원인에 의한 RED다.

실행:

```powershell
$taskGradleHome = 'D:\dev\Samhan-Public\.gradle-t20'; $env:GRADLE_USER_HOME = $taskGradleHome
.\gradlew :services:groupware-service:test `
  --tests 'com.samhanair.logis.groupware.repository.ScheduleRepositoryTest.owner_cannot_query_legacy_ownerless_schedule_without_participant_row' `
  --rerun-tasks --no-daemon --console=plain
```

원문 핵심:

```text
ScheduleRepositoryTest > owner_cannot_query_legacy_ownerless_schedule_without_participant_row() FAILED
    java.lang.AssertionError at ScheduleRepositoryTest.java:37

1 test completed, 1 failed

> Task :services:groupware-service:test FAILED
BUILD FAILED
```

### 2.2 구현 요지

- `ScheduleRepository.findVisibleInRange()`에서 `s.ownerId = :userId OR`를 제거했다.
- 활성 `ScheduleParticipant` 행의 `participantId = :userId AND isDeleted = false`인
  `EXISTS`만 기간 목록 접근 조건으로 남겼다.
- 정상 생성 경로의 `ScheduleService.create()`는 변경하지 않았다. 작성자를 먼저
  `schedule.addParticipant(ownerId)`하므로 실제 POST로 만든 일정은 새 조건에서도
  작성자에게 보인다.
- 기존 owner-less fixture는 현재 POST 경로로는 만들 수 없다. 이는 V17 이전
  `ScheduleService/GroupwareSeeder`가 실제로 만들었고 공유 DB에도 남아 있는 역사적 상태다.
  따라서 해당 fixture를 임의의 정상 상태로 취급하지 않고, “실 경로에서 다시 만들 수 없는
  legacy 상태가 존재한다”는 결함 신호로 명시해 비노출을 검증했다. 정상 경로 테스트는
  raw SQL이 아닌 POST API로 별도 검증했다.
- 신규 Flyway migration은 추가하지 않았다. groupware-service migration 최고 번호는
  기존 V18이며, 이미 적용된 V16/V17/V18 파일도 수정하지 않았다.

### 2.3 GREEN 및 정상 경로

owner-less 단일 repository 테스트를 같은 명령으로 재실행한 결과:

```text
> Task :services:groupware-service:test
BUILD SUCCESSFUL in 42s
27 actionable tasks: 27 executed
1 test completed, 0 failed
```

기존 `find_schedules_uses_header_owner_and_ignores_owner_id_param()` fixture를 실제 POST
두 건으로 전환했다. 작성자 일정은 POST 호출자의 자동 대상자 행으로 저장되고, 다른
작성자 일정은 조회되지 않으며 `ownerId` query parameter로 범위를 바꿀 수 없음을 확인했다.

## 3. 불변식 ② — 대상자 기준 단건 상세

### 3.1 RED 원문

실제 POST로 일정을 만든 뒤 다음 세 테스트를 먼저 추가했다. GET 매핑과 호출자 대상자
검사가 없는 상태에서는 모두 실패했다.

실행:

```powershell
.\gradlew :services:groupware-service:test `
  --tests 'com.samhanair.logis.groupware.it.GroupwareAdminControllerIT.participant_can_read_schedule_detail' `
  --tests 'com.samhanair.logis.groupware.it.GroupwareAdminControllerIT.non_participant_cannot_read_schedule_detail' `
  --tests 'com.samhanair.logis.groupware.it.GroupwareAdminControllerIT.missing_schedule_detail_returns_not_found' `
  --rerun-tasks --no-daemon --console=plain
```

원문 핵심:

```text
GroupwareAdminControllerIT > non_participant_cannot_read_schedule_detail() FAILED
    java.lang.AssertionError at GroupwareAdminControllerIT.java:1025
GroupwareAdminControllerIT > missing_schedule_detail_returns_not_found() FAILED
    java.lang.AssertionError at GroupwareAdminControllerIT.java:1033
GroupwareAdminControllerIT > participant_can_read_schedule_detail() FAILED
    java.lang.AssertionError at GroupwareAdminControllerIT.java:997

3 tests completed, 3 failed

> Task :services:groupware-service:test FAILED
BUILD FAILED
```

### 3.2 구현 요지

- `ScheduleRepository.findVisibleById(scheduleId, userId)`를 추가했다. 일정 ID와 활성
  대상자 `EXISTS`를 같은 JPQL에서 판정하며, 참여자 fetch join은 유지한다.
- `ScheduleService.findVisibleById()`는 이 저장소 메서드만 호출하고 조회 실패를
  `BusinessException(NOT_FOUND)`로 변환한다. 기존 내부 `findById()`는 수정·삭제 경로에
  남겨 객체 권한 축을 바꾸지 않았다.
- `GroupwareAdminController`에 `GET /admin/groupware/schedules/{scheduleId}`와
  `groupware.schedules / VIEW` 권한 가드를 추가했다.
- 대상자 상세는 200, 비대상자 상세와 존재하지 않는 상세는 모두 404다. 두 경우를
  구분하지 않아 일정 ID 존재 여부를 노출하지 않는다.
- 권한 매트릭스 테스트에도 새 VIEW endpoint를 추가했다.

### 3.3 GREEN 원문

대상자 200·비대상자 404·미존재 404 세 테스트 실행 결과:

```text
> Task :services:groupware-service:test
BUILD SUCCESSFUL in 47s
27 actionable tasks: 27 executed
```

## 4. 불변식 ③ — UUID 비노출

이번 슬라이스에는 데스크톱 화면·캘린더·대상자 표시 UI가 없다. 기존
`ScheduleResponse`의 `ownerId`와 `participantIds`는 생성·수정 요청과 다음 화면의 내부
상태 관리를 위한 payload 식별자이며, Javadoc에 `화면 표시 금지`를 명시했다. 새 상세
endpoint에서도 이 내부 DTO를 사용자 표시 문자열로 렌더링하는 코드는 추가하지 않았다.

다음 화면 슬라이스에서 대상자 표시를 만들 때는 이름·부서·담당자코드만 표시하고
UUID를 텍스트로 렌더링해야 한다. 이번 슬라이스에서는 이를 위해 UI를 선행 구현하지
않았다.

## 5. 실 데이터 실측 — 변경 전후 가시 건수

2026-07-31 KST, 공유 `samhan-postgres`의 `groupware_db`에 SELECT만 실행했다. 이미지
재빌드·서비스 재기동·migration 적용·데이터 수정은 없었다. 실행 스택은 정찰 보고서와
같이 groupware V14 상태이며, 아직 소스 변경이 배포되지 않았으므로 아래 수치는 같은
실데이터 스냅샷에서 기존 predicate와 새 predicate를 각각 계산한 계약 비교다.

- 활성 일정: 42건
- 가시 사용자 집합: 12명
- 변경 전: `owner_id = user OR 활성 participant EXISTS`
- 변경 후: `활성 participant EXISTS`
- 전체 가시 건수: `106건 → 64건` (42건 감소)
- 익명 순번은 사용자 UUID를 보고서에 노출하지 않기 위해 내부 UUID 정렬 결과에만
  부여했다. UUID 자체는 기록·표시하지 않았다.

| 익명 사용자 | 변경 전 가시 건수 | 변경 후 가시 건수 | 변화 |
|---|---:|---:|---:|
| 사용자-01 | 8 | 8 | 0 |
| 사용자-02 | 8 | 8 | 0 |
| 사용자-03 | 8 | 8 | 0 |
| 사용자-04 | 8 | 0 | -8 |
| 사용자-05 | 8 | 8 | 0 |
| 사용자-06 | 16 | 8 | -8 |
| 사용자-07 | 1 | 0 | -1 |
| 사용자-08 | 16 | 8 | -8 |
| 사용자-09 | 8 | 0 | -8 |
| 사용자-10 | 8 | 8 | 0 |
| 사용자-11 | 16 | 8 | -8 |
| 사용자-12 | 1 | 0 | -1 |

변경 전·후 두 차례 실행한 원문은 동일했다.

```text
anonymous_user|before_count|after_count
사용자-01|8|8
사용자-02|8|8
사용자-03|8|8
사용자-04|8|0
사용자-05|8|8
사용자-06|16|8
사용자-07|1|0
사용자-08|16|8
사용자-09|8|0
사용자-10|8|8
사용자-11|16|8
사용자-12|1|0
(12 rows)
```

## 6. 모듈 전체 테스트

새 통합 테스트 추가 후 모듈 전체를 다시 실행했다.

```powershell
$taskGradleHome = 'D:\dev\Samhan-Public\.gradle-t20'; $env:GRADLE_USER_HOME = $taskGradleHome
.\gradlew :services:groupware-service:test --rerun-tasks --no-daemon --console=plain
```

원문:

```text
> Task :services:groupware-service:test
BUILD SUCCESSFUL in 1m 32s
27 actionable tasks: 27 executed
```

테스트 XML 실측:

```text
xml_files=32 tests=242 failures=0 errors=0 skipped=0
```

`--rerun-tasks` 실행 결과에 `UP-TO-DATE` 또는 `FROM-CACHE`는 없었다. Testcontainers
기반 테스트는 격리 컨테이너로 실행됐고 공유 backend stack은 건드리지 않았다.

## 7. 이번에 안 본 것

- 데스크톱 화면, 전체 캘린더, 대시보드 오늘·이번 주 위젯
- 부서 공유·전사 공유 정책 및 구성원 물질화
- 종일 일정
- 일정 알림과 자기 알림 제외 발행
- 내부 채팅 #894
- 라이브 QA 및 실행 스택 재배포
- 공유 DB migration 적용, 공유 DB write, Docker 이미지 재빌드, 서비스 재기동

## 8. 변경 파일 목록

### 신규 파일

- `docs/dev-reports/2026-07-31-895-s2-participant-contract.md`
- `docs/superpowers/plans/2026-07-31-895-s2-participant-contract.md`
- `docs/superpowers/specs/2026-07-31-895-s2-participant-contract-design.md`

### 수정 파일

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleResponse.java`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ScheduleRepository.java`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwareAdminControllerIT.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwarePermissionControllerIT.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/repository/ScheduleRepositoryTest.java`

신규 migration은 없다.

## 9. `git status --porcelain` 원문

```text
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleResponse.java
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ScheduleRepository.java
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java
 M services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwareAdminControllerIT.java
 M services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwarePermissionControllerIT.java
 M services/groupware-service/src/test/java/com/samhanair/logis/groupware/repository/ScheduleRepositoryTest.java
?? docs/dev-reports/2026-07-31-895-s2-participant-contract.md
?? docs/superpowers/plans/2026-07-31-895-s2-participant-contract.md
?? docs/superpowers/specs/2026-07-31-895-s2-participant-contract-design.md
```

git add/commit/push/checkout/stash는 실행하지 않았다. 커밋은 PM이 대행해야 한다.
