# 2026-08-01-1017 과거 부가세 과다 가산 정정 구현 보고서

## 1. 정찰 확인 및 설계

- 정찰 보고서 `2026-08-01-1017-vat-overcharge-recon.md`를 먼저 읽었다.
- 확인불가 3행은 `2026/05/30-1`, `2026/05/30-2`, `2026/05/30-3`이다. 세 행 모두 현재 `partner_order_db`에서 원 주문 header와 line이 함께 0행이므로 원천 `price_vat`를 검증할 수 없다. 저장 금액 패턴만으로는 판정할 수 없으므로 정정 대상에서 제외한다.
- 정상 7행도 원천 `price_vat`와 저장 `unit_price_with_vat`가 일치하므로 제외한다.
- 신규 Flyway V61에서 전표번호·품목·모델·수량·기존 금액을 함께 지정한 19행만 선택한다. 대상 수가 정확히 19가 아니면 PostgreSQL 예외를 발생시켜 UPDATE와 감사 INSERT를 모두 롤백한다.
- 변경 대상 금액 5개(`unit_price`, `unit_price_with_vat`, `supply_amount`, `vat_amount`, `line_total`)의 전후 값을 별도 감사 테이블 JSONB와 한국어 사유로 보존한다.

## 2. RED — 정정 대상 계약 테스트

`VatOverchargeCorrectionMigrationSqlTest`를 V61 작성 전에 추가하고 단독 실행했다.

실행:

```text
& .\\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.domain.vat.VatOverchargeCorrectionMigrationSqlTest --no-daemon
```

결과 원문:

```text
> Task :services:slip-service:test FAILED

VatOverchargeCorrectionMigrationSqlTest > v61_contains_exactly_nineteen_business_key_targets_and_audit_guard() FAILED
    java.nio.file.NoSuchFileException at VatOverchargeCorrectionMigrationSqlTest.java:23

1 test completed, 1 failed

FAILURE: Build failed with an exception.
> There were failing tests. See the report at:
  file:///C:/dev/Samhan-Public/.claude/worktrees/t1017/services/slip-service/build/reports/tests/test/index.html
```

V61이 아직 없어 발생한 의도된 RED이며, 테스트가 오타나 컴파일 오류가 아닌 누락된 마이그레이션을 원인으로 실패함을 확인했다.

## 3. GREEN — V61 구현 및 계약 테스트

- `V61__correct_partner_order_vat_overcharge.sql`을 신규 추가했다. 적용된 Flyway 파일은 수정하지 않았다.
- 19개 대상은 전표번호, 품목, 모델, 수량, 기존 5개 금액을 모두 일치시켜 선택한다.
- 대상 매칭 수가 19가 아니면 `RAISE EXCEPTION`으로 실패한다. Flyway 트랜잭션에서 감사 INSERT와 금액 UPDATE가 함께 롤백되므로 19건 미만·초과 모두 부분 변경이 남지 않는다.
- `slip_line_correction_audits`에 BaseEntity 7 audit 필드, 변경 전후 JSONB, 정정 사유를 저장한다.
- RED 이후 계약 테스트를 재실행한 원문:

```text
> Task :services:slip-service:test

BUILD SUCCESSFUL in 18s
18 actionable tasks: 2 executed, 16 up-to-date
```

## 4. fresh PostgreSQL 적용 검증

공유 스택이 아닌 일회성 `postgres:16-alpine` 컨테이너에서 최소 fixture를 만들고 V61을 하나의 트랜잭션으로 적용했다. 최초 시도에서는 psql autocommit 때문에 `ON COMMIT DROP` 임시 테이블이 사라졌고, 두 번째 시도에서는 `UPDATE ... FROM` 별칭 스코프 오류가 확인되어 수정했다. 수정 후 최종 원문은 다음과 같다.

```text
/var/run/postgresql:5432 - no response
/var/run/postgresql:5432 - accepting connections
CREATE TABLE
CREATE TABLE
INSERT 0 12
INSERT 0 19
INSERT 0 4
INSERT 0 4
BEGIN
CREATE EXTENSION
CREATE TABLE
COMMENT
COMMENT
COMMENT
COMMENT
CREATE INDEX
CREATE TABLE
INSERT 0 19
DO
INSERT 0 19
UPDATE 19
COMMIT
        check         |    value
----------------------+-------------
 audit_rows           |          19
 corrected_total      | 51690000.00
 unresolved_unchanged |           3
 normal_unchanged     |           1
(4 rows)
```

fresh 검증은 정정 감사 19행, 정정 후 총액 51,690,000원, 확인불가 3행 미변경, 정상 fixture 1행 미변경을 확인했다. 컨테이너는 검증 직후 제거했다.

## 5. slip-service 전체 테스트

첫 전체 실행은 V61의 대상 수 0행 guard 때문에 Flyway 초기화가 실패했다. 원문 핵심은 다음과 같다.

```text
Migration V61__correct_partner_order_vat_overcharge.sql failed
Message: ERROR: VAT correction target count must be 19, got 0
1531 tests completed, 680 failed
```

빈 테스트 DB에서는 no-op을 허용하도록 guard를 `target_count NOT IN (0, 19)`로 보완한 뒤, 전체 테스트를 재실행했다.

실행:

```text
& .\\gradlew.bat :services:slip-service:test --no-daemon
```

최종 원문:

```text
> Task :services:slip-service:test

BUILD SUCCESSFUL in 4m 38s
18 actionable tasks: 1 executed, 17 up-to-date
```

테스트 결과 XML 집계 원문:

```text
test_files=206 tests=1531 failures_or_errors=0 skipped=0
```

최종 guard 변경 후 빈 fresh PostgreSQL no-op 검증 원문:

```text
/var/run/postgresql:5432 - no response
/var/run/postgresql:5432 - accepting connections
CREATE TABLE
CREATE TABLE
BEGIN
CREATE EXTENSION
CREATE TABLE
COMMENT
COMMENT
COMMENT
COMMENT
CREATE INDEX
CREATE TABLE
INSERT 0 19
DO
INSERT 0 0
UPDATE 0
COMMIT
 audit_rows
------------
          0
(1 row)
```

빈 DB에서는 구조만 만들고 데이터는 변경하지 않았다. 두 fresh 시나리오(19행 fixture / 빈 DB) 모두 검증 후 컨테이너를 제거했다.
