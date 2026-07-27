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
psql:/migration-files/V24__quantity_sync_rule_schema.sql:6: NOTICE:  extension "pgcrypto" already exists, skipping
CREATE EXTENSION
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
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

> 🔧 **R1 fix 정정(§7)**: 위 인용은 R1 발견 각도가 지적한 8줄 축약(`CREATE EXTENSION` 1 +
> `CREATE INDEX` 7 누락)을 정정하고, V24 fix 반영 후 재실행한 원문으로 교체했다(`container=
> samhan-896-s2-fresh-pg-2384b8fc9d13`, 동일하게 `migration_count=24`·PASS). 요약 주장
> (테이블 3개·PASS·V1~V23 무변경)은 정정 전에도 전부 참이었다 — 인용 블록만 축약본이었다.

V1~V23 파일은 수정하지 않았다. V24는 seed INSERT 없이 schema, indexes, functions, deferred triggers만 추가한다.

## 6. 변경 파일

> 🔧 **R1 fix 정정**: 최초 게시 목록에 신규 spec 문서(`docs/superpowers/specs/2026-07-28-896-s2-
> quantity-sync-schema-spec.md`)가 누락되어 있었다(R1 대조 지적). 아래 목록은 그 정정과 R1 fix
> 라운드(§7)의 변경분을 모두 반영한 최신본이다.

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
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java` — R1 fix(결함 3)
- `services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySync{ProductRef,RuleRequest,RuleResponse}.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidationTest.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleDbProbeIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleCrudIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleSeedAbsenceIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleProductDiscontinueIT.java` — R1 fix 신규(결함 2(a)·3)
- `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java` — R1 fix(결함 3)
- `docs/superpowers/specs/2026-07-28-896-s2-quantity-sync-schema-spec.md`
- `docs/superpowers/plans/2026-07-28-896-s2-quantity-sync-schema.md`
- 본 보고서

API endpoint는 `/api/v1/quantity-sync-rules` 아래 GET/POST/PUT/DELETE CRUD이며, CI에는
`product-quantity-sync-schema` 별도 matrix job과 다섯 개 JUnit report의 report별 정확한
최소 tests 수(13/11/2/1/4, R1 fix §7 참조) · `skipped=0` · `failures=0` · `errors=0` hard
gate를 등재했다.

---

## 7. R1 fix 라운드 (2026-07-27~28) — 발견 3건 + 대조 2건 처리

R1 적대검증(발견 각도 OPUS·대조 각도 SONNET5)이 지목한 결함 3건(HIGH 1·MED 2)과 대조 2건을
처리했다. 상세 RED/GREEN 원문·수단·근거는 PR 코멘트에 게시한다. 요지만 기록한다.

### 결함 1 [HIGH] — 자기 편집 시 옛 관계가 순환으로 오판되던 문제

`QuantitySyncRuleService.replace()`가 검증 시점에는 옛 source/target을 아직 soft-delete하지
않은 채로 `activeRuleSnapshots()`를 넘겨, 자기 자신의 옛 간선과 새 간선이 합쳐져 순환으로
오판됐다. `QuantitySyncRuleValidator.rejectCycles()`에 self(ruleKey 일치) 제외를 추가했다 —
바로 위 REPLACE 중복 검사가 이미 쓰던 것과 같은 방식이다. DB 층은 deferred constraint
trigger가 커밋 시점 최종 상태만 재검사하므로 애초에 이 결함이 없었다(리뷰어 수기 확인을
`QuantitySyncRuleDbProbeIT`의 parity 테스트로 고정).

### 결함 2 [MED] — `enabled`이 검증 어디에서도 고려되지 않던 문제

서비스 validator와 V24 SQL 양쪽에서 순환 검사·REPLACE 중복 검사·"삭제·비노출 Product 연결
금지" 검사가 `enabled`을 읽지 않아, 비활성 규칙도 활성 규칙과 동일한 강제력을 가졌다. 세
지점 모두에 `enabled = TRUE` 조건을 추가했다(서비스: `RuleSnapshot.enabled` 신규 필드 +
`rejectCycles`/REPLACE 중복 loop, DB: V24 3개 EXISTS/CTE).

### 결함 3 [MED] — 품목 단종/삭제 차단 원인이 "동시 편집 충돌"로 위장되던 문제

`ProductService.discontinue()`/`delete()`가 수량 동기화 규칙 참조를 전혀 모른 채 mutation을
시도하다 DB constraint trigger에 막히면, `GlobalExceptionHandler`의 범용
`DataIntegrityViolationException` 핸들러가 "동시 편집 충돌 또는 제약 위반"으로 뭉뚱그렸다.
`QuantitySyncRuleService.findEnabledRuleKeysReferencing()`(신규)로 mutation 전 선제 확인해
`BusinessException(CONFLICT, "수량 동기화 규칙이 이 품목을 참조하고 있어 단종/삭제할 수
없습니다: <ruleKey, ...>")`를 던진다. fail-closed는 유지되고(DB trigger가 안전망으로 잔존),
원인이 ruleKey로 드러난다.

### 대조-1 [MED] — J-5: option key allowlist 근거 부재 → 슬3으로 이관

하드코딩 18개 option key의 근거를 저장소 전체에서 찾지 못했다(`legacy-quantity-golden/
fixtures.js`의 실 식별자와 문자 그대로 일치 0개, `remoteOption`/`panelOption`은
`BundleExpander.ExpandOptions`라는 다른 도메인 필드명과 우연히 같음). **판단**: 목록을
줄이는 대안은 애초에 근거 있는 부분집합이 없어 불가능했다 — 대신 key-vocabulary 검증
자체를 슬3(evaluator가 실제 옵션 계약을 읽는 시점)으로 미루고, Java validator·V24 SQL 양쪽
모두 "공백이 아닌 문자열"이라는 구조적 제약만 남겼다. 연산자 whitelist·`[key,value]` arity·
`optionIn` 배열 비공란 등 나머지 typed 제약은 그대로 유지된다.

### 대조-2 — 증거 무결성 2건 (§6·§5에 정정 반영)

dev-report 변경파일 목록의 spec 문서 누락과 §5 psql 인용의 8줄 축약을 정정했다.

### 🟡 J-7 (우선순위 낮음) — CONSTRAINT TRIGGER 대량 write 비용 — 이번 라운드는 보류

`products`/`bundle_component`의 CONSTRAINT TRIGGER가 변경 행마다 전체 규칙 그래프를
재검증해 (변경 행수 × 규칙 수)로 비용이 곱해진다(실측 13.5배, 145품목×39규칙). **판단**:
이번 라운드에서는 보류한다. 근거 — ① 실 DB는 현재 규칙 0건이라 오늘 사용자 영향이 없다.
② 단건 저장은 2.6ms로 무해하다. ③ 이 fix(예: `products`/`bundle_component` 트리거에 "이
행을 참조하는 quantity_sync 규칙이 있을 때만 검증" `WHEN` 절 추가)는 correctness-critical한
트리거 로직 변경이라, 서두르면 검증 누락(false negative)이라는 성능 문제보다 더 심각한
회귀를 만들 수 있다 — 이미 이번 라운드에서 결함 1·2·3·대조 1을 다뤘고, 타이밍 기반 성능
회귀 테스트까지 같은 라운드에 넣는 것은 RED-first를 서두르게 한다. 규칙이 실제로 채워지는
슬3+ 단계에서 실측 기반으로 전용 라운드로 처리하는 편이 안전하다.

### RED/GREEN 요약

```text
RED (fix 전, --tests "com.samhanair.logis.product.quantitysync.*" --tests
     "com.samhanair.logis.product.service.ProductServiceTest" --rerun-tasks --no-build-cache)
80 tests completed, 12 failed
  QuantitySyncRuleCrudIT > 기존_규칙의_source_target을_맞교환해도_순환으로_거부되지_않는다() FAILED
  QuantitySyncRuleDbProbeIT > DB_직접_SQL도_비활성_규칙은_Product_비노출_전환을_막지_않는다() FAILED
  QuantitySyncRuleDbProbeIT > DB_직접_SQL도_비활성_규칙간_순환은_거부하지_않는다() FAILED
  QuantitySyncRuleProductDiscontinueIT > 활성_규칙이_참조하면_단종이_거부되고_원인이_드러난다() FAILED
  QuantitySyncRuleProductDiscontinueIT > 활성_규칙이_참조하면_삭제도_거부되고_원인이_드러난다() FAILED
  QuantitySyncRuleProductDiscontinueIT > 비활성_규칙만_참조하면_단종이_허용된다() FAILED
  QuantitySyncRuleValidationTest > 비활성_기존_규칙은_REPLACE_중복_판정에도_강제력이_없다() FAILED
  QuantitySyncRuleValidationTest > 자기_자신을_편집할_때_...__순환으로_오판되지_않는다() FAILED
  QuantitySyncRuleValidationTest > 비활성_기존_규칙은_순환_판정에_강제력이_없다() FAILED
  QuantitySyncRuleValidationTest > 조건_JSON의_option_key는_...__저장할_수_있다() FAILED
  ProductServiceTest > delete_참조하는_활성_규칙이_있으면_수량동기화_사유와_함께_거부한다() FAILED
  ProductServiceTest > discontinue_참조하는_활성_규칙이_있으면_수량동기화_사유와_함께_거부한다() FAILED

GREEN (fix 후, 동일 명령)
BUILD SUCCESSFUL in 39s

report별 tests (fix 후 재실행 XML 직접 파싱)
  QuantitySyncRuleValidationTest.xml       tests=13 skipped=0 failures=0 errors=0
  QuantitySyncRuleDbProbeIT.xml            tests=11 skipped=0 failures=0 errors=0
  QuantitySyncRuleCrudIT.xml               tests=2  skipped=0 failures=0 errors=0
  QuantitySyncRuleSeedAbsenceIT.xml        tests=1  skipped=0 failures=0 errors=0
  QuantitySyncRuleProductDiscontinueIT.xml tests=4  skipped=0 failures=0 errors=0
```

RED 단계에서 테스트 작성 실수 2건도 발견해 함께 고쳤다(결함 아님·검증 장치 결함): source/
target/rule 하드 삭제를 별도 auto-commit 문 3개로 나눈 cleanup()이 그 사이 순간에 "rule
must have active source and target rows"를 오탐시켰다(`QuantitySyncRuleCrudIT`·
`QuantitySyncRuleProductDiscontinueIT`·`QuantitySyncRuleDbProbeIT`의 cleanup을 단일
transaction으로 통합). selfswap parity 테스트의 최초 setup도 3개 분리된 auto-commit
INSERT라 같은 문제를 겪어 `inTransaction`+커넥션 기반 헬퍼로 고쳤다.
