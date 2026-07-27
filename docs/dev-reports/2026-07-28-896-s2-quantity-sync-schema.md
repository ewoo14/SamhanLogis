# #896 S2 수량 동기화 규칙 스키마 개발 보고서

## 결론

- 실 catalog snapshot: **미확보**.
- 따라서 합성 seed, 현재 local-test catalog에서 추출한 seed, seed generator를 만들지 않았다.
- V24 스키마·DB 저장 경계·8종 검증·CRUD API만 구현했다. evaluator, shadow diff, replay, cutover, chip UI는 범위에 포함하지 않았다.
- 공유 `product_db`에는 write하지 않았다. snapshot 판정은 read-only query만 수행했고, DB probe/migration 검증은 별도 throwaway PostgreSQL과 Testcontainers를 사용했다.

## 1. 실 catalog snapshot 확보 판정

정공법으로 실행 환경의 `samhan-postgres/product_db`를 read-only 조회했다. 확인 결과는 다음과 같다.

```text
active_products
---------------
105

product_type | count
-------------+------
BUNDLE       | 2
SINGLE       | 103

estimate_category | count
------------------+------
COMMERCIAL_MULTI  | 2
HOME_MULTI        | 2
                 | 101

created_by | count
-----------+------
qa-seed    | 1
qa798      | 4
system     | 100

model_code
----------
(0 rows for the survey legacy-code candidates)

active product_estimate_exposure rows: 4
active bundle_component rows: 4
product created_at: 2026-05-31 00:45:23.419686 .. 2026-07-12 09:21:42.924557
```

또한 `services/product-service/src/main/java/com/samhanair/logis/product/seed/HvacProductSeeder.java`가
현재 local 데이터의 provenance를 명시한다.

```text
Stage 1 (master data) local-test seed — Samsung HVAC 제품 100개.
@Profile("dev")
@ConditionalOnProperty(value = "app.product.seed-test-data", havingValue = "true")
```

이는 실 catalog snapshot의 확인 가능한 provenance가 아니므로 **실 snapshot 미확보로 시드 미생성**으로 판정했다.
survey의 legacy model code 후보도 0행이어서 이를 추정하거나 합성하지 않았다.

## 2. 선택한 수단과 버린 대안

### 저장 경계

- 애플리케이션에는 `QuantitySyncRuleValidator`를 두어 API 오류를 빠르게 반환한다.
- PostgreSQL V24에는 `DEFERRABLE INITIALLY DEFERRED` constraint trigger를 두어 rule/source/target 전체 graph를 commit 시점에 재검사한다.
- 이중 방어를 선택한 이유는 DTO·서비스를 우회한 SQL도 통과하면 안 되는 I-2 불변식 때문이다. direct SQL probe가 이를 확인한다.
- DTO만 검증하는 대안은 DB 우회 경로를 막지 못하므로 버렸다.

### 배수 자료형

- factor/multiplier는 PostgreSQL `NUMERIC`에 저장하고 `> 0`, `<= 1000`, `scale <= 4`, `round(..., 4)` CHECK를 적용했다.
- `NUMERIC(12,4)` 대안은 PostgreSQL이 입력을 먼저 반올림해 scale 초과 입력을 CHECK 전에 통과시킬 수 있어 버렸다.

### Product 연결과 응답

- source/target은 내부 UUID FK로 저장하고 요청·응답은 `modelCode`/품목명으로 해소한다.
- Product 엔티티 연관관계를 API DTO에 전파하거나 UUID를 응답하는 대안은 사용자 UUID 비노출 규칙에 어긋나므로 버렸다.

### seed

- 실 snapshot을 확보했을 때만 동일 snapshot→동일 결과 생성기를 추가하기로 했다.
- 현재 dev seeder 데이터 조합, survey 예시 code 추정, 임의 fixture를 seed로 만드는 대안은 fake data 영구 배제 규칙 때문에 버렸다.

## 3. RED-first / GREEN 원문

### RED

각 정본 검증을 입력으로 고정한 `QuantitySyncRuleValidationTest`를 먼저 작성한 뒤 validator 없이 실행했다.

```text
.\gradlew :services:product-service:test --tests "com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidationTest" --rerun-tasks --no-build-cache

> Task :services:product-service:compileTestJava FAILED
error: cannot find symbol
  symbol:   class QuantitySyncRuleValidator
...
42 errors
```

RED 입력 8종은 cross-category, source=target, 동일 condition의 REPLACE 중복,
cycle, deleted/non-visible Product, BUNDLE 자체 component target, factor/multiplier 범위·scale,
빈 source/target이다.

### GREEN

```text
.\gradlew :services:product-service:test --tests "com.samhanair.logis.product.quantitysync.*" --rerun-tasks --no-build-cache

BUILD SUCCESSFUL in 40s
```

JUnit 결과:

```text
QuantitySyncRuleValidationTest.xml: tests=8 skipped=0 failures=0 errors=0
QuantitySyncRuleDbProbeIT.xml:        tests=8 skipped=0 failures=0 errors=0
QuantitySyncRuleCrudIT.xml:           tests=1 skipped=0 failures=0 errors=0
QuantitySyncRuleSeedAbsenceIT.xml:    tests=1 skipped=0 failures=0 errors=0
```

사용자가 지정한 전체 product-service 명령도 그대로 실행했다.

```text
.\gradlew :services:product-service:test --rerun-tasks --no-build-cache

process exit code: 0
JUnit reports: files=48 tests=523 skipped=0 failures=0 errors=0
```

초기 CRUD 교체 테스트에서 발견한 실제 실패 원문은 다음이었다.

```text
ERROR: duplicate key value violates unique constraint "ux_qss_rule_source_active"
Detail: Key (rule_id, source_product_id)=(..., ...) already exists.
```

기존 active child UPDATE가 신규 INSERT보다 늦게 flush되는 원인이었고, 기존
`BundleComponentService` 패턴과 동일하게 soft-delete 후 `EntityManager.flush()`를 수행하도록 고쳤다.

## 4. isolated PostgreSQL direct SQL probe

`QuantitySyncRuleDbProbeIT`는 `AbstractPostgresIT`의 격리 PostgreSQL에 JDBC SQL을 직접 실행한다.
서비스 validator를 호출하지 않고 rule/source/target/product/bundle_component row를 넣은 뒤 transaction
commit에서 실패하는지 검사하며, 각 실패 후 active row 수가 변하지 않는지도 확인한다.

```text
QuantitySyncRuleDbProbeIT.xml: tests=8 skipped=0 failures=0 errors=0
```

검증 대상은 다음 8종이다.

1. source/target category 일치
2. source와 target 동일 금지
3. 동일 condition의 REPLACE target 중복 금지
4. graph cycle 금지
5. deleted/non-visible Product 금지
6. BUNDLE source의 자체 component target 금지
7. factor/multiplier 범위 및 decimal scale
8. source/target 비어 있는 rule 금지와 commit 원자성

`QuantitySyncRuleSeedAbsenceIT`는 `rule_key`와 `legacy_ref`에 `H-07`, `C-09`가 활성 레코드로
존재하지 않음을 격리 DB에서 잠근다.

## 5. fresh PostgreSQL V1~V24 migration probe

공유 DB가 아닌 `postgres:16-alpine` throwaway container를 만들고, `DROP DATABASE`/`CREATE DATABASE`
후 `docker cp`로 migration directory를 복사한 다음 각 파일을 `psql -v ON_ERROR_STOP=1 -f`로 적용했다.
heredoc `docker exec`는 사용하지 않았다. 스크립트는 종료 시 해당 run 고유 container만 제거한다.

```text
.\scripts\probe-896-s2-fresh-postgres.ps1

container=samhan-896-s2-fresh-pg-43260b332044 image=postgres:16-alpine
DROP DATABASE
CREATE DATABASE
migration_count=24
psql -v ON_ERROR_STOP=1 -f /migration-files/V1__init_product_service.sql
...
psql -v ON_ERROR_STOP=1 -f /migration-files/V24__quantity_sync_rule_schema.sql
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE TRIGGER
CREATE TRIGGER
CREATE TRIGGER
CREATE TRIGGER
CREATE TRIGGER
      database       | quantity_sync_tables |   v24_rule_table
---------------------+----------------------+--------------------
 quantity_sync_probe |                    3 | quantity_sync_rule
(1 row)

fresh-postgres-migration=PASS
removed=samhan-896-s2-fresh-pg-43260b332044
```

V1~V23 파일은 수정하지 않았다. V24는 seed INSERT 없이 schema, indexes, functions, deferred triggers만 추가한다.

## 6. 변경 파일

- `.github/workflows/ci.yml`
- `scripts/probe-896-s2-fresh-postgres.ps1`
- `services/api-gateway/src/main/resources/application.yml`
- `services/product-service/README.md`
- `services/product-service/src/main/resources/db/migration/V24__quantity_sync_rule_schema.sql`
- `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySync{Rule,Source,Target}.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySync{Aggregation,ConflictPolicy,EstimateCategory,InactiveBehavior,RoundingMode}.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/repository/QuantitySync{Rule,Source,Target}Repository.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/QuantitySyncRuleService.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySync{ProductRef,RuleRequest,RuleResponse}.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidationTest.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleDbProbeIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleCrudIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleSeedAbsenceIT.java`
- `docs/superpowers/plans/2026-07-28-896-s2-quantity-sync-schema.md`
- 본 보고서

API endpoint는 `/api/v1/quantity-sync-rules` 아래 GET/POST/PUT/DELETE CRUD이며, CI에는
`product-quantity-sync-schema` 별도 matrix job과 네 개 JUnit report의 `tests>=1`,
`skipped=0`, `failures=0`, `errors=0` hard gate를 등재했다.
