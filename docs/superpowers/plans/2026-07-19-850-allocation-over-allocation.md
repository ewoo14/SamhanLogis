# #850 배분 과할당 수정 구현 계획

> **For agentic workers:** 이 계획은 사용자가 승인한 `docs/specs/850-allocation-in-request-over-allocation-spec.md`를 실행한다. Git commit/checkout/branch/add는 수행하지 않는다.

**Goal:** 매출·매입 회계전표 생성 시 요청 내부의 금액·수량 누적 과할당을 차단하고, 입력 검증·동시성 잠금·DB 방어 제약을 대칭 적용한다.

**Architecture:** 각 `createDraftAttempt` 호출 안에서만 입력 검증, 원천별 상태 cache, 금액·수량 accumulator를 생성한다. 모든 원천의 advisory lock을 `msb XOR lsb` 숫자 오름차순으로 선점한 후 원천별 외부 snapshot과 DB 합계를 1회만 읽고, first allocation과 나머지 allocation을 같은 누적 검증기로 처리한다.

**Tech Stack:** Java 21, Spring Boot MVC/Validation, Spring Data JPA, PostgreSQL advisory transaction lock, Flyway, JUnit 5, Mockito, Testcontainers.

## Global Constraints

- D-850-01~08을 `docs/specs/850-allocation-in-request-over-allocation-spec.md` 그대로 구현한다.
- 매출과 매입 구현은 동일한 순서·검증·메시지 정책을 유지한다.
- `sourceLineId` 기반 cache, attempt-local accumulator/cache를 사용하고 singleton mutable state를 추가하지 않는다.
- 금액 검증은 수량보다 먼저 수행하며, 금액 잔여는 소수 둘째 자리로 표시한다.
- 요청 invalid 입력은 lock, SlipService, allocation repository, slip repository 전에 `INVALID_INPUT`으로 거부한다.
- Flyway 신규 버전은 accounting-service 기존 최대 V61 다음 V62를 사용하며 기존 migration은 수정하지 않는다.
- 사용자가 금지한 Git 명령은 실행하지 않는다.

### Task 1: 회귀 테스트를 RED로 고정

**Files:**
- Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesAccountingSlipServiceTest.java`
- Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/PurchaseAccountingSlipServiceTest.java`
- Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SalesAccountingSlipControllerIT.java`
- Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/PurchaseAccountingSlipControllerIT.java`

**Interfaces:** 테스트는 기존 `createDraft`/`createDraftAttempt` API와 MockMvc 계약을 사용하고, 새 production helper API에는 의존하지 않는다.

- [ ] 요청 구조 선검증 테스트를 매출·매입에 추가한다: null line, null allocation, null sourceLineId, null/0/음수 amount·qty, 금액 1.001, 수량 1.0001, `@Digits` integer overflow. 서비스 직접호출에서는 외부/DB/lock 호출이 0인지 검증한다.
- [ ] 요청 내부 A+A, 라인간 A+A, A+B+A, 수량 과할당, first 시딩, DB+요청 경계/초과, 거부 시 save 0회를 테스트한다.
- [ ] 원천별 snapshot 및 두 repository 합계가 각 1회인지, lock query가 distinct lockKey numeric 순서로 한 번씩 호출되는지 테스트한다.
- [ ] slipNo 재시도에서 이전 attempt의 accumulator/cache가 누출되지 않는지 테스트한다.
- [ ] Controller의 `@Valid`가 nested null 원소와 field constraint를 400 `INVALID_INPUT`으로 매핑하는지 추가한다.
- [ ] 새 테스트만 선택해 `.\gradlew :services:accounting-service:test --tests "*SalesAccountingSlipServiceTest" --tests "*PurchaseAccountingSlipServiceTest" --rerun-tasks`로 RED를 확인한다.

### Task 2: 입력 DTO와 Controller 계약 구현

**Files:**
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CreateSalesAccountingSlipRequest.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CreatePurchaseAccountingSlipRequest.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesAccountingSlipController.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/PurchaseAccountingSlipController.java`

- [ ] `lines`와 `allocations`를 `List<@NotNull @Valid ...>`로 선언한다.
- [ ] `AllocationRequest.sourceLineId`에 `@NotNull`을, amount/qty에 `@NotNull @Positive @Digits(integer=13,fraction=2)` 및 `@NotNull @Positive @Digits(integer=9,fraction=3)`을 붙인다.
- [ ] 두 create endpoint의 body를 `@Valid @RequestBody`로 변경한다.

### Task 3: 매출·매입 attempt 처리 순서와 누적 검증 구현

**Files:**
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipCreateAttemptService.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PurchaseAccountingSlipCreateAttemptService.java`

- [ ] 서비스 진입 최선두에서 null 구조, positive, scale/precision, sourceLineId를 `INVALID_INPUT`으로 검증한다.
- [ ] distinct source ID에서 lockKey를 계산하고 Long numeric sort 후 advisory lock을 선잠금한다.
- [ ] source ID별 snapshot, `lineId` 방어 일치, 금액/수량 DB 합계를 `Map<UUID, SourceState>`에 한 번만 cache한다.
- [ ] first allocation을 금액 먼저·수량 다음으로 검증하고 `Map<UUID, AllocationTotals>`에 시딩한다.
- [ ] 나머지 배분을 같은 cache/accumulator로 순회하며 금액 초과 시 `잔여금액`, 수량 초과 시 `잔여수량` 한국어 메시지를 반환한다.
- [ ] 금액·수량이 모두 초과하면 금액을 먼저 반환하고, 음수 잔여는 금액 0.00/수량 0.000으로 표시한다.
- [ ] 기존 source type/status/partner 검증과 snapshot identity 저장을 보존하고, 마지막에 `saveAndFlush` 1회만 수행한다.

### Task 4: DB 방어 제약과 migration audit 주석 추가

**Files:**
- Create: `services/accounting-service/src/main/resources/db/migration/V62__add_allocation_positive_checks.sql`

- [ ] migration 선두 주석에 raw sales/purchase allocation table 전체 행(`is_deleted=true` 포함)의 amount/qty 위반 조회 SQL을 남긴다.
- [ ] dev 데이터 위반이 있으면 추가 CHECK가 실패해 migration이 드러나도록 검사/삭제/수정으로 우회하지 않는다.
- [ ] 두 allocation table에 `allocated_amount > 0 AND allocated_qty > 0` CHECK를 추가한다.

### Task 5: 전체 검증

- [ ] 서비스 단위 테스트와 두 ControllerIT를 실행한다.
- [ ] accounting-service 전체 test를 `--rerun-tasks`로 실행하고 실패 시 원인을 수정한다.
- [ ] 변경 파일과 테스트 결과를 최종 보고한다.
