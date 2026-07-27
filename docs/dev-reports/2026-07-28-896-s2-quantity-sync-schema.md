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
> 라운드(§7)·재수렴 라운드(§8)의 변경분을 모두 반영한 최신본이다.

- `.github/workflows/ci.yml` — 재수렴: hard gate min_tests 갱신 + 신규 리포트 2건 등재
- `scripts/probe-896-s2-fresh-postgres.ps1`
- `services/api-gateway/src/main/resources/application.yml`
- `services/product-service/README.md`
- `services/product-service/src/main/resources/db/migration/V24__quantity_sync_rule_schema.sql` — 재수렴: M-7 early-exit
- `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySync{Rule,Source,Target}.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySync{Aggregation,ConflictPolicy,EstimateCategory,InactiveBehavior,RoundingMode}.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java` — 재수렴: 결함 1
- `services/product-service/src/main/java/com/samhanair/logis/product/repository/QuantitySync{Rule,Source,Target}Repository.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/QuantitySyncRuleService.java` — 재수렴: 결함 2
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java` — R1 fix(결함 3) · 재수렴: 결함 3
- `services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySync{ProductRef,RuleRequest,RuleResponse}.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidationTest.java` — 재수렴: 결함 1 단위 RED(+3)
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleDbProbeIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleCrudIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleSeedAbsenceIT.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleProductDiscontinueIT.java` — R1 fix 신규(결함 2(a)·3) · 재수렴: 결함 3 RED(+3)
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleOptionInParityIT.java` — 재수렴 신규: 결함 1 통합 RED
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleProductDeletionCascadeHttpIT.java` — 재수렴 신규: 결함 2 실 HTTP RED
- `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java` — R1 fix(결함 3)
- `docs/superpowers/specs/2026-07-28-896-s2-quantity-sync-schema-spec.md`
- `docs/superpowers/plans/2026-07-28-896-s2-quantity-sync-schema.md`
- 본 보고서 — §6·§7 정정 + 본 §8

API endpoint는 `/api/v1/quantity-sync-rules` 아래 GET/POST/PUT/DELETE CRUD이며, CI에는
`product-quantity-sync-schema` 별도 matrix job과 report별 정확한 최소 tests 수 hard gate를
등재했다.

> 🔧 **재수렴 정정(§8)**: 위 "다섯 개 JUnit report(13/11/2/1/4)"는 R1 fix 시점 기준이었다.
> 재수렴 라운드에서 report가 **일곱 개**(16/11/2/1/7/3/1, §8 참조 — ValidationTest·
> ProductDiscontinueIT 카운트 증가 + OptionInParityIT·ProductDeletionCascadeHttpIT 신규
> 등재)로 늘었다 — `.github/workflows/ci.yml`의 `min_tests`를 최신 실측치로 갱신했다.

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

> 🔧 **재수렴 증거 무결성 정정(§8 결함 1)**: 위 마지막 문장은 부정확했다 — `optionIn` 배열
> 비공란 제약은 V24 SQL에는 있었지만 Java validator(`validateOptionPair`)에는 **없었다**.
> `allowList=true` 분기의 불리언식이 스칼라도 빈 배열도 통과시켜, "그대로 유지된다"는 서술과
> 달리 실제로는 Java·DB가 다른 답을 냈다(재수렴 결함 1 [HIGH], §8). "typed 제약 유지"는
> 연산자 whitelist·`[key,value]` arity·key 비공란에만 참이었다.

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

---

## 8. 재수렴 라운드 (2026-07-28) — R1 fix가 만든 회귀 1건 + 결함 2건 + M-7 재판단

재수렴 적대검증이 R1 fix 직후 실서버 재현으로 도달 가능 결함 3건을 잡았다(최우선 1·MED 2).
전부 RED-first(재현 실패 테스트 → RED 원문 확보 → 수정 → GREEN)로 처리했다.

### 결함 2 [최우선] — `enabled` 게이트가 만든 회귀: 규칙 API 전체 404 벽돌

R1 fix(§7 결함 2)가 "enabled=false 규칙은 강제력이 없다"를 DB 트리거에도 적용해, 비활성
규칙이 참조하는 Product의 삭제/비노출 전환을 허용했다. 그런데 `QuantitySyncRuleService`의
`activeRuleSnapshots()`(create/replace가 다른 모든 기존 규칙과 교차검증할 때 사용)와
`toResponse()`(list/get이 사용)는 여전히 모든 규칙(enabled 무관)의 source/target Product를
`productCode()`로 해소하며, 이 메서드는 Product가 null이면 무조건 `PRODUCT_NOT_FOUND`를
던졌다. 결과: 비활성 규칙 하나가 삭제된 Product를 참조하는 순간 **목록 조회 전체 + 모든
규칙의 생성·편집**이 항상 404로 죽었다 — 복구하려면 어떤 규칙이 문제인지 목록에서 봐야
하는데 그 목록 자체가 죽어 있었다.

**RED** — MockMvc 실 HTTP 왕복(`QuantitySyncRuleProductDeletionCascadeHttpIT`)으로 재현.
비활성 규칙(C→D) 생성 → HTTP로 Product D 삭제(204, R1 fix로 허용) → `GET
/api/v1/quantity-sync-rules` 기대 200, 실측:

```text
java.lang.AssertionError: Status expected:<200> but was:<404>
    at QuantitySyncRuleProductDeletionCascadeHttpIT.java:130
```

**fix** — `activeRuleSnapshots()`와 `toResponse()`를 Product 미해소에 관용적으로 바꿨다.
- `activeRuleSnapshots()`: 새 `danglingSafeProductCode(product, productId)` 헬퍼가 null이면
  `productId` 기반 고유 placeholder 문자열을 반환한다. `QuantitySyncRuleValidator`의 REPLACE
  중복 검사·순환 검사는 이미 `existing.enabled()==false`인 기존 규칙의 source/targetCodes를
  전부 무시하므로(R1 §7 결함 2), 이 값이 무엇이든 disabled 규칙에는 결과가 달라지지 않는다 —
  API 응답으로 나가지 않으므로 UUID 비노출 원칙과도 무관하다.
- `toResponse()`: Product가 null이면 `productCode=null`, `productName="(삭제된 품목)"`을
  반환한다(M-2). list·get 양쪽에서 어떤 규칙의 어떤 슬롯이 깨졌는지 보이므로, 사용자가
  그 규칙을 직접 `DELETE`(product 조회가 필요 없는 경로)하거나 `PUT`으로 다른 Product로
  교체해 스스로 복구할 수 있다.

**GREEN** — 같은 IT를 8단계(생성→삭제→목록→단건→신규생성→편집→깨진 규칙 자신 조회→
자가복구 delete 후 목록 재확인) 전부 통과하도록 재실행. `BUILD SUCCESSFUL`.

**버린 대안** — "enabled=false도 Product 삭제/비노출을 막는다"로 R1 fix를 되돌리는 안은
M-3(비활성 규칙 무강제력 성질을 다시 깨뜨림)에 위배되어 버렸다. "목록에서 깨진 규칙을 통째로
숨긴다"는 안도 검토했으나 M-2(사용자가 무엇이 문제인지 봐야 한다)에 위배되어 버렸다 —
placeholder로 보여주는 편이 성질을 둘 다 지킨다.

### 결함 1 [HIGH] — `optionIn` 값이 Java를 통과하고 DB에서만 걸림

`QuantitySyncRuleValidator.validateOptionPair(value, allowList=true)`의 불리언식
(`!value.get(1).isValueNode() && !(allowList && value.get(1).isArray())`)이 `optionIn`에서
스칼라(`isValueNode()=true`→좌항 false)와 빈 배열(`isArray()=true`→우항 false, 길이 미검사)
양쪽 모두를 통과시켰다. V24 SQL(`quantity_sync_validate_condition`)은 `optionIn` 값을
"배열이고 비어있지 않음"으로 명시적으로 요구해, Java가 통과시킨 입력이 DB에서만 거부되며
원인이 "동시 편집 충돌 또는 제약 위반"(결함 3이 없애려던 바로 그 409)으로 위장됐다.

**RED** — 단위(`QuantitySyncRuleValidationTest`)와 통합(`QuantitySyncRuleOptionInParityIT`,
실 Postgres) 양쪽에서 확보. 통합 RED 원문:

```text
java.lang.AssertionError:
Expecting actual throwable to be an instance of:
  com.samhanair.logis.common.exception.BusinessException
but was:
  org.springframework.dao.DataIntegrityViolationException: Hibernate transaction: Unable to
  commit against JDBC Connection; ERROR: quantity_sync optionIn value must be a non-empty array
```

**fix** — `validateOptionPair`를 operator별로 분리했다: `optionIn`(allowList)은 배열+비공란,
`optionEquals`는 스칼라(`isValueNode()`)를 각각 독립적으로 요구한다. M-4 지시대로 `optionIn`
외 전체 condition 검증(연산자 whitelist·object 여부·`{}` 조기 return·`[key,value]` arity·
key 비공란·`not`/`all`/`any` 재귀)을 SQL과 항목별로 대조했고, 이 boolean식 결함 외 추가
불일치는 찾지 못했다.

**GREEN** — 단위 18/18, 통합 3/3(스칼라 거부·빈 배열 거부·비공란 배열 통제군 저장) 전부 통과.

**버린 대안** — `optionIn`도 스칼라를 허용하도록 DB 쪽을 완화하는 안은 검토하지 않았다 —
DB 제약이 원래 정본(V24는 R1 이전부터 배열을 요구)이고 Java가 그 정본에서 벗어난 쪽이라,
완화가 아니라 Java를 정본에 맞추는 방향이 correctness상 유일하게 맞다.

### 결함 3 [MED] — fix가 discontinue/delete만 덮고 update()/노출구분 변경은 빠짐

R1 fix(§7 결함 3)의 `assertNotReferencedByEnabledQuantitySyncRule()` 선제 확인이
`ProductService.discontinue()`/`delete()`에만 있었다. 그러나 V24의 "삭제·비노출 Product
연결 금지" 검사(`sp.usage_scope = 'NONE' OR tp.usage_scope = 'NONE'` 포함)는 `usage_scope`가
`NONE`으로 바뀌는 모든 경로에 적용된다 — `update()`(PATCH 일반 수정, `usageScope` 직접 지정·
SET_COMPONENT 강제·부모 세트 연결 강제·MATERIAL 카테고리 강제 등 `applyUpdateFields()` 내부
분기 전부 포함)와 `updateUsageAndReturn()`(수동 override PATCH)에는 가드가 없어, 같은
원인인데 호출 경로에 따라 "동시 편집 충돌 또는 제약 위반"(update 경로)과 "수량 동기화
규칙이 …"(discontinue 경로)로 서로 다른 메시지가 나갔다(M-5).

**RED** — `QuantitySyncRuleProductDiscontinueIT`에 3건 추가, 실 Postgres에서 전부 확보:

```text
java.lang.AssertionError:
Expecting actual throwable to be an instance of: BusinessException
but was: DataIntegrityViolationException: ... ERROR: quantity_sync cannot reference deleted
or invisible product
```

**fix** — `update()`에 "usageScope가 NONE이 아니었다가 NONE이 됨" 전이만 판정하는 가드를,
`updateUsageAndReturn()`에는 대상 scope가 NONE(또는 null)로 향할 때의 가드를 각각
`applyUpdateFields()`/`markUsageManual()` 호출 지점에 추가했다. 전이 여부만 보므로 이미
NONE인 품목의 무관한 필드 수정은 막지 않는다(M-1과 충돌 없음). 공용 helper의 메시지를
"단종/삭제할 수 없습니다"에서 "상태를 변경할 수 없습니다"로 일반화해 — discontinue/delete/
usageScope 전환 어느 경로로 오든 **완전히 같은 문자열**을 낸다(M-5, 회귀 방지 lock 테스트로
byte-identical 비교까지 고정).

**GREEN** — 신규 3건 + 기존 4건 전부 통과.

**버린 대안** — `update()` 내부에서 usageScope가 NONE이 되는 각 분기(SET_COMPONENT/부모
세트/MATERIAL/직접 지정)마다 개별적으로 가드를 심는 안은 검토했으나, 분기가 4곳으로 흩어져
있어 새 분기가 추가될 때마다 또 빠뜨릴 위험이 있어 버렸다 — "before/after 전이 판정" 방식은
분기 수와 무관하게 최종 상태만 보므로 향후 분기 추가에도 자동으로 적용된다.

### M-7 [재판단] — CONSTRAINT TRIGGER 비용, "규칙 0건=영향 없음" 반증 후 재결정

§7 J-7은 "실 DB 규칙 0건 → 오늘 영향 없음"을 보류 근거로 들었다. 재수렴 실측(150행 UPDATE,
규칙 0건, 트리거 활성 63.1ms vs disable 6.45ms, ≈10배)이 이 전제를 반증했다 — **규칙이
0건이어도 트리거 자체의 매 행 함수 호출 비용은 존재한다**. 원인: PostgreSQL
`CONSTRAINT TRIGGER`는 `FOR EACH STATEMENT`를 지원하지 않는 하드 제약(row-level만 가능)이라,
`quantity_sync_validate_rule_graph()`가 규칙이 0건이든 아니든 변경 행마다 EXISTS 5개+재귀
CTE 1개를 전부 실행했다.

**재판단 — 이번 라운드에 처리한다.** 내 환경 재현(150행, 규칙 0건): 활성 18ms vs 비활성
3ms(≈6배, 원 보고 10배와 같은 현상 다른 배율). `quantity_sync_validate_rule_graph()` 최상단에
"활성 규칙이 하나도 없으면 즉시 return"(`IF NOT EXISTS (SELECT 1 FROM quantity_sync_rule
WHERE is_deleted = FALSE) THEN RETURN; END IF;`) 한 줄을 추가했다 — 모든 하위 검사가
`r.is_deleted = FALSE`를 전제하므로 활성 규칙이 0건이면 전부 공집합이라 항상 통과하고,
따라서 이 조기 종료는 **동작을 바꾸지 않는 순수 성능 최적화**다. fix 후 재측정: 활성
4ms/3ms/3ms vs 비활성 3ms(3회 반복, ≈1.0~1.3배) — 회귀 없이 오늘 실 DB의 실제 프로파일(규칙
0건)에서 비용이 사실상 소멸했다. `quantitysync` 패키지 전체(트리거가 실제로 규칙을 막아야
하는 기존 테스트 포함) 재실행으로 조기 종료가 "규칙이 있을 때"는 발동하지 않음을 확인했다
(`BUILD SUCCESSFUL`, 실패 0).

**처리하지 않은 나머지(별도 근거로 명시 보류)** — `products`/`bundle_component` 트리거에
"이 행이 quantity_sync 규칙에 실제로 걸려 있을 때만 검증" `WHEN`/컬럼 비교 조건을 추가하는
안(규칙이 실제로 존재할 때 무관한 컬럼(가격 등) 변경까지 매번 전체 그래프를 재검사하는
비용)은 **이번 라운드에도 보류한다.** 새 근거(§7의 "규칙 0건" 근거가 반증됐으므로 재사용
불가) — ① 위 early-exit이 오늘 실제 프로파일(규칙 0건)의 비용을 이미 사실상 소멸시켰다.
② 이 안은 constraint trigger의 `OLD`/`NEW` 컬럼 비교를 이벤트(INSERT/UPDATE/DELETE)
별로 정확히 구분해야 하는 조건식이 필요해, correctness-critical한 fail-closed 안전망에
실행 안 되는 코드 경로를 새로 만들 위험이 early-exit보다 크다. ③ 이 비용은 규칙이 실제로
채워진 뒤에만 발생하며 아직 그 시점의 실측이 없다 — 실측 없이 조건식을 짜면 "근거 없는
allowlist를 만들지 않는다"(대조-1과 같은 원칙)를 트리거 코드에서 어기게 된다. 규칙이 실제로
채워지는 슬3+ 단계에서 그때의 실측을 근거로 별도 라운드로 처리한다.

### 🟡 참고 항목 판단 — 허용목록 제거 후의 option key 형식(공백/개행/길이/`__proto__`)

대조 각도가 "오늘 도달 불가"로 표시한 참고 자료: 앞뒤 공백 포함 키·개행 포함 키·5000자
키·`__proto__` 키가 전부 Java·DB 양쪽에서 통과해 201로 저장된다. **판단 — 이번 라운드에서
처리하지 않는다.** 근거는 대조-1(§7)이 이미 세운 것과 같은 원칙의 연장이다: 이 네 항목
모두 "evaluator가 실제로 어떤 키 형식을 어떻게 소비할지"에 대한 가정(trim 정책·인코딩·
안전한 객체 접근 패턴)이 있어야 옳고 그름을 판단할 수 있는데, 그 계약은 슬3에만 존재한다.
`__proto__`가 truthy를 반환하는 근본 원인도 API가 받아들이는 문자열이 아니라 **슬3 evaluator가
평범한 JS object에 `options[key]`로 접근하는 방식**이다 — `toString`/`constructor`/`valueOf`
등 `__proto__`가 아닌 다른 상속 프로퍼티 이름도 같은 문제를 일으키므로, API 계층의
blocklist로는 이 계열을 다 막을 수 없다. 올바른 fix는 evaluator가 `Object.hasOwn(options,
key)`나 `Map`/`Object.create(null)`처럼 안전한 조회를 쓰는 것이며, 이는 슬3 구현 자체다.
길이 상한만 별도로 지금 추가하는 안도 검토했으나, "5000자"는 오늘 도달 불가능한 입력에 대한
방어일 뿐 사용자 영향이 없고, 상한값(200? 500?) 자체가 evaluator 계약을 모르는 채로는
근거 없는 숫자가 되어 대조-1이 이미 반대한 것과 같은 함정이라 함께 보류했다.

### RED/GREEN 요약

```text
RED (fix 전, 각 신규 테스트를 개별 실행 — 결함별 원문은 위 절 참조)
  QuantitySyncRuleValidationTest        optionIn 스칼라/빈배열 2건 FAILED (AssertionError, 예외 미발생)
  QuantitySyncRuleOptionInParityIT      optionIn 스칼라/빈배열 2건 FAILED
                                          (DataIntegrityViolationException, BusinessException 아님)
  QuantitySyncRuleProductDeletionCascadeHttpIT
                                        1건 FAILED (Status expected:<200> but was:<404>)
  QuantitySyncRuleProductDiscontinueIT  신규 3건 FAILED/ERRORED
                                          (DataIntegrityViolationException, BusinessException 아님)

GREEN (fix 후)
.\gradlew :services:product-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 2m 4s
JUnit reports: files=51 tests=548 skipped=0 failures=0 errors=0
```

### 변경 파일 (재수렴 라운드)

- `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java` — 결함 1
- `services/product-service/src/main/java/com/samhanair/logis/product/service/QuantitySyncRuleService.java` — 결함 2
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java` — 결함 3
- `services/product-service/src/main/resources/db/migration/V24__quantity_sync_rule_schema.sql` — M-7 early-exit(공유 DB 미적용 확인 후 수정, fresh 재적용으로 재확인)
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidationTest.java` — 결함 1 단위 RED
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleOptionInParityIT.java` — 결함 1 통합 RED(신규)
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleProductDeletionCascadeHttpIT.java` — 결함 2 실 HTTP RED(신규)
- `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleProductDiscontinueIT.java` — 결함 3 RED
- 본 보고서 — §6·§7 정정 + 본 §8
