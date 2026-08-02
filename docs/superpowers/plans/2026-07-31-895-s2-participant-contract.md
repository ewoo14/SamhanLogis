# 일정 대상자 집합 정본 구현 계획

> **작업자 안내:** 이 계획은 현재 워크트리에서 순서대로 실행한다. 각 단계는 RED → GREEN
> 검증을 포함하며, git add/commit/push는 개발책임자의 지시에 따라 수행하지 않는다.

**목표:** 일정 목록·단건 상세의 접근 판정을 활성 대상자 집합 하나로 통일한다.

**구조:** `ScheduleRepository`에 목록·단건 대상자 기준 JPQL을 두고 `ScheduleService`가
호출자 UUID를 전달한다. 컨트롤러는 헤더 호출자를 사용하고 상세 권한 실패를 404로
통일한다.

**기술 스택:** Spring Boot, Spring Data JPA, MockMvc, H2 `@DataJpaTest`, Gradle.

## 전역 제약

- Docker 이미지 재빌드·서비스 재기동을 하지 않는다.
- 공유 DB는 SELECT만 실행한다.
- 실 API로 만들 수 있는 정상 fixture를 우선 사용한다. legacy owner-less fixture는 V17
  이전 데이터라는 결함 신호를 보고서에 명시한다.
- 신규 Flyway migration은 추가하지 않는다. groupware-service 최고 번호는 V18이다.
- 수정·삭제는 등록자 본인만 가능하다는 기존 정책을 유지한다.
- UUID는 화면 표시용 값으로 렌더링하지 않는다.

---

### 작업 1: 목록 접근 정본 RED/GREEN

**파일:**

- 수정: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/repository/ScheduleRepositoryTest.java`
- 수정: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ScheduleRepository.java`
- 수정: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwareAdminControllerIT.java`

- [ ] owner-less 일정의 작성자 조회 단정을 “0건”으로 먼저 변경한다.
- [ ] repository 단일 테스트를 실행해 기존 `ownerId OR` 조건 때문에 RED인지 확인한다.
- [ ] JPQL에서 `s.ownerId = :userId OR`를 제거하고 활성 participant `EXISTS`만 남긴다.
- [ ] 단일 repository 테스트를 다시 실행해 GREEN을 확인한다.
- [ ] 실제 POST → GET 경로로 작성자에게 정상 일정 1건이 보이는 회귀 테스트를 추가한다.

### 작업 2: 대상자 기준 단건 상세 RED/GREEN

**파일:**

- 수정: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ScheduleRepository.java`
- 수정: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java`
- 수정: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java`
- 수정: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwareAdminControllerIT.java`
- 수정: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwarePermissionControllerIT.java`

- [ ] 대상자 상세 200을 기대하는 실제 POST fixture 테스트를 먼저 추가하고 GET 매핑 부재로 RED를 확인한다.
- [ ] 비대상자 상세가 404여야 한다는 테스트를 추가한다.
- [ ] 존재하지 않는 일정 상세가 404여야 한다는 테스트를 추가한다.
- [ ] 저장소에 `findVisibleById(scheduleId, userId)`를 추가한다.
- [ ] 서비스에 `findVisibleById`를 추가하고 실패를 `NOT_FOUND`로 매핑한다.
- [ ] 컨트롤러에 GET 매핑을 추가하고 `ScheduleResponse`로 변환한다.
- [ ] 상세 테스트를 다시 실행해 세 경우가 GREEN인지 확인한다.

### 작업 3: 권한·모듈 전체 검증 및 보고

**파일:**

- 신규: `docs/dev-reports/2026-07-31-895-s2-participant-contract.md`

- [ ] 수정 전 공유 DB 사용자별 가시 건수를 SELECT로 저장한다.
- [ ] 수정 후 같은 SELECT를 재실행하고 사용자별 before/after를 대조한다.
- [ ] groupware-service 전체 테스트를 `--rerun-tasks --no-daemon --console=plain`으로 실행한다.
- [ ] `UP-TO-DATE`/`FROM-CACHE`가 없는지 확인하고 테스트 수·실패·skip을 기록한다.
- [ ] `git diff --check`와 `git status --porcelain` 원문을 기록한다.
- [ ] 신규/수정 파일을 분리해 보고서에 적고, 이번에 안 본 범위를 명시한다.

## 검토 결과

- 설계 요구사항 ①은 작업 1, ②는 작업 2, ③은 컨트롤러 응답을 화면에 연결하지 않는
  범위 정책과 보고서 점검으로 다룬다.
- 단건 상세의 권한 실패를 404로 통일해 존재 여부 노출을 막으며, 수정·삭제의 기존
  403 검사는 별도 코드 경로로 보존한다.
- Flyway 변경이 없어 이미 적용된 migration checksum을 건드리지 않는다.
