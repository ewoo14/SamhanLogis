# D-G1 S1 영업수수료 정산 구현 보고서

작성일: 2026-08-11  
대상: PR #1165 / `accounting-service`  
범위: 정산 엔티티·Flyway·repository·문서번호 채번만

## 1. 구현 결과

- `SalesCommissionSettlement` aggregate를 신설했다.
  - `settlementDate`: 정산 기준일
  - `documentNo`: 확정 전에는 `NULL`, 확정 후 `yyyy/MM/dd-N`
  - `status`: `DRAFT` / `CONFIRMED`
  - `@Version` 및 `BaseEntity` 7 audit + soft delete 적용
- `SalesCommissionSettlementRepository`를 추가했다.
  - 활성 정산서를 `documentNo`로 조회하는 왕복 경로를 제공한다.
- `SalesCommissionSettlementNumberSequence`와 repository를 추가했다.
  - 정산 기준일별 행을 `INSERT ... ON CONFLICT DO NOTHING`으로 만들고,
    `PESSIMISTIC_WRITE` 조회 후 `last_seq`를 증가시킨다.
- `SalesCommissionSettlementService`를 추가했다.
  - `createDraft()`는 번호를 소비하지 않는다.
  - `confirm()` 시에만 정산 기준일로 번호를 발급하고 도메인 `confirm()` 메서드 체인으로 저장한다.
- Flyway `V97__add_sales_commission_settlement.sql`을 추가했다.
  - 정산서 테이블, 일자별 sequence 테이블, 활성 문서번호 unique index를 생성한다.

계산 금액·요율·계산기·그룹웨어 enum/연결·화면·버튼은 S2~S4 범위이므로 구현하지 않았다.
기존 `조달수수료`·`카드수수료`·`영업수수료`·`판매수수료` 품목을 사용하는 견적·전표 경로도 수정하지 않았다.

## 2. 채번 표준과 기준일 결정

### 본으로 삼은 구현

`CashReceiptNumberService`를 본으로 삼았다.

```java
sequenceRepository.insertIfAbsent(UUID.randomUUID(), date);
return date.format(DATE_FMT) + "-" + seq.next();
```

동일하게 정산서 전용 sequence row를 먼저 `ON CONFLICT DO NOTHING`으로 만들고,
`findLockedBySettlementDate()`로 행 잠금을 확보한 뒤 `next()`를 호출한다. 새 전역 카운터,
애플리케이션 메모리 카운터, UUID 기반 문서번호는 사용하지 않았다.

### 채번 날짜

`settlementDate`(정산 기준일)를 사용한다.

- S1에는 아직 계산 결과나 지급예정일이 없으므로 지급예정일을 번호 기준으로 사용할 근거가 없다.
- 문서가 어느 회계일에 귀속되는지 나타내는 업무일이 정산 기준일이다.
- 작성일은 재작성·지연 입력 때 문서 귀속일과 달라질 수 있어 번호의 업무 기준으로 선택하지 않았다.

### DRAFT 정책

번호 없는 `DRAFT`를 기본으로 한다. 번호는 `confirm()` 시점에만 발급한다.
따라서 임시 저장·폐기 때문에 일련번호가 소모되지 않고, 확정 문서만 `documentNo`를 갖는다.

### 길이

포맷은 `yyyy/MM/dd-N`이며 `document_no`와 도메인 검증 모두 최대 40자다.
그룹웨어 `ApprovalAttachment.ref_doc_no VARCHAR(40)`에 맞춘다.

## 3. 서비스 배치 근거와 migration 번호

새 도메인은 `accounting-service`에 배치했다.

- `accounting-service`가 기존 `Journal`, `CashReceipt`, `CollectionPlan`,
  `Sales/PurchaseAccountingSlip` 등 회계 문서를 소유한다.
- 기존 회계 문서번호 채번 서비스와 sequence repository가 모두 이 서비스에 있다.
- `slip-service`는 기존 영업·매입 전표 원천을 소유하지만, 이번 정산 문서 자체를 소유할 기존 배치 근거가 없다.
- 신규 서비스는 기존 회계 배치·Flyway·공통 audit 경계를 불필요하게 늘리므로 선택하지 않았다.

회계 migration 파일을 먼저 세어 최대값 `V96`을 확인했고, 충돌을 피하기 위해 `V97`을 사용했다.
실제 통합 테스트에서도 Flyway가 빈 PostgreSQL에서 `V97`까지 적용되고 Hibernate validate가 통과했다.

## 4. RED 원문

production code를 추가하기 전에 다음 테스트만 추가하고 실행했다.

```text
.\gradlew :services:accounting-service:test \
  --tests 'com.samhanair.logis.accounting.domain.SalesCommissionSettlementTest' \
  --tests 'com.samhanair.logis.accounting.service.SalesCommissionSettlementNumberServiceTest' \
  --tests 'com.samhanair.logis.accounting.service.SalesCommissionSettlementServiceTest' \
  --no-daemon
```

결과:

```text
> Task :services:accounting-service:compileTestJava FAILED
error: cannot find symbol
  class SalesCommissionSettlement
  class SalesCommissionSettlementStatus
  class SalesCommissionSettlementNumberSequence
  class SalesCommissionSettlementNumberSequenceRepository
  class SalesCommissionSettlementNumberService
  class SalesCommissionSettlementRepository
33 errors
BUILD FAILED
```

실패 원인은 테스트 오타나 기존 코드 회귀가 아니라 아직 구현하지 않은 S1 타입이었다.

## 5. 테스트 결과

### S1 전용 최종 검증

```text
.\gradlew :services:accounting-service:test \
  --tests 'com.samhanair.logis.accounting.domain.SalesCommissionSettlementTest' \
  --tests 'com.samhanair.logis.accounting.service.SalesCommissionSettlementNumberServiceTest' \
  --tests 'com.samhanair.logis.accounting.service.SalesCommissionSettlementServiceTest' \
  --tests 'com.samhanair.logis.accounting.it.SalesCommissionSettlementNumberSequenceIT' \
  --no-daemon
```

```text
BUILD SUCCESSFUL
8 tests, 0 failures, 0 errors, 0 skipped
```

실제 PostgreSQL Testcontainer에서 확인한 항목:

1. DRAFT 생성 직후 `documentNo IS NULL`.
2. 확정 직후 발급된 문서번호로 repository/service 조회 왕복 — 같은 UUID와 문서번호 회수.
3. 같은 날 `-1`, `-2`, 다른 날 `-1`.
4. 같은 날 8개 동시 채번 결과가 중복 없이 `-1`부터 `-8`.
5. 생성 문서번호 길이가 40자 이하.

### 전체 accounting suite

다음 전체 suite도 실행했으나 304초 실행 제한에 걸려 결과를 PASS로 판정하지 않았다.

```text
.\gradlew :services:accounting-service:test --no-daemon
command timed out after 304027 milliseconds
```

이 timeout은 S1 테스트 실패가 아니며, 전체 suite의 완료 결과를 의미하지 않는다. timeout 뒤 남은
Gradle test worker가 결과 파일을 잡고 있어 해당 워커만 종료한 후 S1 전용 테스트를 재실행했고,
위 8/8 결과를 확인했다.

## 6. 신규 파일

```text
services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlement.java
services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementStatus.java
services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementNumberSequence.java
services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesCommissionSettlementRepository.java
services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesCommissionSettlementNumberSequenceRepository.java
services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementService.java
services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementNumberService.java
services/accounting-service/src/main/resources/db/migration/V97__add_sales_commission_settlement.sql
services/accounting-service/src/test/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementTest.java
services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementNumberServiceTest.java
services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementServiceTest.java
services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SalesCommissionSettlementNumberSequenceIT.java
docs/dev-reports/2026-08-11-dg1-s1-implementation.md
```
