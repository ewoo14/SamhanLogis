# PR #1058 / Issue #1008 R10 — 머지 커밋 의미 충돌 검증

검증 시각: 2026-08-02 23:50 ~ 2026-08-03 00:10 KST  
대상 브랜치/HEAD: `feat/1008-daily-closing` / `f15cc3a2cfa88c94fe721f626c3dedcab46cec75`  
merge parents: `1a86c1d2647837a5a2b261ee961508208c36eb66` (#1058 측) + `2460e3cf61c878fa5219daaecda7299d4b7df799` (#1046/main 측)

## 0. 결론

**PASS — 병합으로 인한 의미 충돌을 발견하지 못했다.**

- `product-service` 전체 fresh 테스트는 **632/632, 실패·오류·skip 0**으로 통과했다.
- `accounting-service` 전체 fresh 테스트는 컴파일과 `testClasses`까지 통과한 뒤 `test` 실행 중 **304.1초 timeout(exit 124)** 이었다. 로컬 전체 GREEN으로 간주하지 않는다. 같은 HEAD의 GitHub CI `accounting+partner`는 **2,662 run / 2,652 passed / 10 skipped / 0 failed**, PR check 42개는 전부 pass다.
- #1046 3축 후보의 서로 다른 UUID 충돌은 현재 로컬 DB에서 **0/1,320**, 세트 matcher 카탈로그는 **1,584링크 / 400모델 / 미해소 0 / model_code↔model_name 불일치 0**이었다.
- #1058 targeted 회귀는 **27/27**, 스냅샷은 SHA-256 고정값 일치 및 실외기 링크 **271/271 일치, 불일치 0**이다.
- 생성자 소거/오버로드 충돌은 없었다. `javap`에 canonical 22-arg와 pre-parent 21-arg를 포함한 8개 생성자가 서로 다른 시그니처로 남고, 저장소의 직접 생성 7곳은 전체 컴파일을 통과했다.

코드 수정, commit, push, checkout, 브랜치 조작, Docker 이미지 재빌드, 공유 DB write/DDL, 합성 데이터 생성은 하지 않았다. SQL은 모두 `BEGIN TRANSACTION READ ONLY ... COMMIT` 안에서 실행했다.

## 1. 데이터 출처와 판정 범위

수치를 다음처럼 구분한다.

- **[DEV-SEED 로컬 DB 실측]**: `samhan-postgres`의 `product_db`, `dc_config_db`, `accounting_db`, `inventory_db`. 현재 실행 중인 로컬 개발 스택의 저장 행이며 운영 DB 수치가 아니다.
- **[고정 실원본 스냅샷]**: `docs/dev-reports/1008-r9-snapshot/single-components-A1-N1737.csv`. Google Sheet `싱글 구성품!A1:N1737`에서 2026-08-02 22:40:29 KST에 취득해 고정한 원문이다.
- **[테스트 fixture]**: JUnit의 회귀 fixture. 합성 DB 실측으로 가장하지 않고 테스트 근거로만 사용했다.
- **[GitHub CI]**: 대상 HEAD `f15cc3a2c...`에서 실행된 원격 검증이다.

## 2. 컴파일·전체 테스트 결과 원문

### 2.1 product-service 전체 — PASS

명령:

```powershell
.\gradlew.bat :services:product-service:test --rerun-tasks --no-daemon --console=plain
```

Gradle 원문:

```text
> Task :services:product-service:compileJava
> Task :services:product-service:classes
> Task :services:product-service:compileTestJava
> Task :services:product-service:testClasses
> Task :services:product-service:test

BUILD SUCCESSFUL in 2m 38s
13 actionable tasks: 13 executed
__EXIT_CODE__=0
```

fresh XML 합계 원문:

```text
PRODUCT_XML_FILES=61 TESTS=632 FAILURES=0 ERRORS=0 SKIPPED=0
```

판정: production/test 컴파일과 모듈 전체 테스트 모두 PASS.

### 2.2 accounting-service 전체 — 로컬 timeout, 성공 판정 금지

명령:

```powershell
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon --console=plain
```

timeout 직전 로그 원문:

```text
> Task :services:accounting-service:compileJava
> Task :services:accounting-service:classes
> Task :services:accounting-service:compileTestJava
> Task :services:accounting-service:testClasses
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
> Task :services:accounting-service:test

command timed out after 304050 milliseconds
Exit code: 124
```

timeout 시점 부분 XML 원문:

```text
ACCOUNTING_PARTIAL_XML_FILES=1 TESTS=1 FAILURES=0 ERRORS=0 SKIPPED=0
```

이 1건은 전체 완료가 아니므로 PASS 근거로 사용하지 않았다. timeout 후 남은 정확한 Gradle 테스트 프로세스 트리만 종료했고, Testcontainers 임시 컨테이너는 Ryuk가 회수했다. 공유 `samhan-postgres`는 중단하거나 변경하지 않았다.

### 2.3 accounting targeted — PASS

명령:

```powershell
.\gradlew.bat :services:accounting-service:test `
  --tests '*DailyClosingSnapshotBaselineTest' `
  --tests '*LegacySetMatcherTest' `
  --tests '*DailyClosingDetailServiceTest' `
  --rerun-tasks --no-daemon --console=plain
```

원문:

```text
> Task :services:accounting-service:compileJava
> Task :services:accounting-service:classes
> Task :services:accounting-service:compileTestJava
> Task :services:accounting-service:testClasses
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 42s
21 actionable tasks: 21 executed
__EXIT_CODE__=0

DailyClosingDetailServiceTest       TESTS=22 SKIPPED=0 FAILURES=0 ERRORS=0
DailyClosingSnapshotBaselineTest   TESTS=1  SKIPPED=0 FAILURES=0 ERRORS=0
LegacySetMatcherTest               TESTS=4  SKIPPED=0 FAILURES=0 ERRORS=0
TARGETED_TOTAL                     TESTS=27 SKIPPED=0 FAILURES=0 ERRORS=0
```

### 2.4 #1046 보상 축 targeted — PASS

명령:

```powershell
.\gradlew.bat :services:inventory-service:test `
  --tests '*StockInstanceServiceOutboundTest' `
  --rerun-tasks --no-daemon --console=plain
```

원문:

```text
> Task :services:inventory-service:compileJava
> Task :services:inventory-service:classes
> Task :services:inventory-service:compileTestJava
> Task :services:inventory-service:testClasses
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 30s
18 actionable tasks: 18 executed
__EXIT_CODE__=0
CLASS=com.samhanair.logis.inventory.service.StockInstanceServiceOutboundTest TESTS=17 SKIPPED=0 FAILURES=0 ERRORS=0
```

### 2.5 같은 HEAD의 GitHub CI — 권위 GREEN

`gh pr checks 1058 --json name,state,bucket` 원문 요약:

```text
Name Count
---- -----
pass    42

TOTAL_CHECKS=42
```

관련 job 원문:

```text
빌드 + 테스트 (accounting+partner) pass 4m59s
JUnit 테스트 결과 (accounting+partner) - 2662 tests run, 2652 passed, 10 skipped, 0 failed.

빌드 + 테스트 (user+product+inventory+logging) test
BUILD SUCCESSFUL in 1m 23s
JUnit 테스트 결과 (user+product+inventory+logging) - 1515 tests run, 1510 passed, 5 skipped, 0 failed.
```

로컬 accounting 전체 timeout에 대해서는 이 CI를 권위로 둔다.

## 3. 각도 2 — 3축 조회·CONFLICT와 세트 매칭의 의미 충돌

### 3.1 실행 경로 분리

일마감은 `MonthEndCloseService.resolveProductSummaries` → `ProductClient.lookupByModel` → `/products/internal/lookup-by-model` → `ProductService.lookupSummaryByModelName` 경로를 사용한다. 이 경로는 `model_name` exact 단축이며 #1046의 `/lookup-by-product-code` 3축 후보 수집을 호출하지 않는다.

세트 matcher는 별도로 `estimateComponents("SINGLE_SET")`와 `estimateComponents("COMMERCIAL_MULTI")` 두 bulk 카탈로그를 읽는다. 따라서 `lookupSummaryByProductCode`의 `CONFLICT`가 matcher에 직접 전파되는 호출 경로는 없다.

### 3.2 [DEV-SEED 로컬 DB 실측] 3축 충돌

활성 `products.product_code`, 활성 alias가 가리키는 활성 품목의 `alias_code`, 활성 `products.model_name`을 trim 후 합치고 값별 `count(DISTINCT product_id)`를 셌다.

```text
BEGIN
 conflict_values | conflict_candidate_rows | same_uuid_multi_axis_values | total_lookup_values
-----------------+-------------------------+-----------------------------+--------------------
               0 |                       0 |                           0 |                1320
(1 row)

 lookup_value | axis | product_id
--------------+------+------------
(0 rows)
COMMIT
```

활성 품목 1,220행, 활성 alias 0행이다. 따라서 현재 데이터에서 새 3축 때문에 정상 조회가 `CONFLICT`로 막히거나 다른 UUID를 임의 선택하는 건수는 0이다. 단, 실제 alias 행을 통한 실행 성공은 이 DB에서 관측하지 못했다.

### 3.3 [DEV-SEED 로컬 DB 실측] matcher 카탈로그 축 정합

실제 endpoint와 동일하게 부모 `product_category IN ('SINGLE_SET','COMMERCIAL_MULTI')`만 측정했다.

```text
 matcher_catalog_links | distinct_component_codes | unresolved_links | model_axis_different_links
-----------------------+--------------------------+------------------+---------------------------
                  1584 |                      400 |                0 |                          0

 matcher_component_codes | model_code_unique | model_code_missing | model_code_ambiguous | model_name_unique | model_name_ambiguous
-------------------------+-------------------+--------------------+----------------------+-------------------+---------------------
                     400 |               400 |                  0 |                    0 |               400 |                    0
```

즉 matcher가 받는 400개 구성품 토큰은 model_code와 model_name 양쪽에서 모두 같은 단일 품목으로 해소된다. #1046의 모델명 노출 전환 때문에 matcher가 엉뚱한 품목을 잡는 실측 표본은 0이다.

전체 활성 BUNDLE에는 `TEST-BUNDLE-SET-01` 아래 #1046 검증용 구성 링크 2개가 추가로 존재하며 두 구성품은 `model_code=null`이다. 그러나 부모 `product_category`가 `SINGLE_SET`/`COMMERCIAL_MULTI`가 아니므로 실제 matcher endpoint 모집단에는 들어오지 않는다. 범위를 넓힌 잘못된 SQL에서는 미해소 2행으로 보이지만 production 호출 조건을 적용하면 미해소 0행이다.

### 3.4 [DEV-SEED 로컬 DB 실측] parentSetModelCode 안전성

`lookupSummaryByModelName`은 model_name으로 찾은 바로 그 Product의 `model_code`를 구성 링크에 대조한다. 활성 1,220품목의 부모 분포는 다음과 같다.

```text
 active_products | parent_none | parent_unique | parent_ambiguous | max_parent_count
-----------------+-------------+---------------+------------------+-----------------
            1220 |         820 |           198 |              202 |               84
```

- 부모 1개인 198품목만 `parentSetModelCode`를 반환한다.
- 부모가 2개 이상인 202품목은 임의 부모를 고르지 않고 null을 반환한다.
- 실제 옵션 선택은 이 단건 부모가 아니라 완성 세트 matcher 결과를 사용한다.

판정: **PASS. 3축 CONFLICT와 세트 매칭 사이의 의미 충돌 없음.**

## 4. 각도 3 — ProductSummaryResponse 필드·생성자 병합

`javap`으로 병합 산출 class를 확인했다.

```text
public final class ...ProductSummaryResponse extends java.lang.Record {
  public ProductSummaryResponse(... 21 args);              // parent 필드 추가 전 canonical 호환
  public ProductSummaryResponse(... 15 args);
  public ProductSummaryResponse(... 6 args);
  public ProductSummaryResponse(... 7 args);
  public ProductSummaryResponse(... 8 args);
  public ProductSummaryResponse(... 10 args);
  public ProductSummaryResponse(... 11 args);
  public ProductSummaryResponse(... 22 args);              // 현재 canonical + parentSetModelCode
  public static ProductSummaryResponse from(Product);
  public static ProductSummaryResponse from(Product,String);
  public String parentSetModelCode();
}
```

실측:

```text
PRODUCT_SUMMARY_CONSTRUCTOR_CALLS=7
product-service compileJava/compileTestJava: PASS
product-service 전체: 632 tests, failures=0, errors=0
```

의미 확인:

- `from(Product)`은 `exposedProductCode(p) = p.getModelName()`을 사용한다.
- `from(Product, parentSetModelCode)`은 먼저 `from(Product)`를 호출하고 `base.productCode()`를 canonical 생성자에 복사한다. 따라서 부모 필드를 붙이는 #1058 경로에서도 #1046의 모델명 노출이 유지된다.
- 21-arg 호환 생성자는 마지막 `parentSetModelCode`만 null로 위임한다. 기존 소비처가 새 필드 자리에 다른 값을 잘못 밀어 넣는 경로가 없다.
- `ProductServiceTest`에는 모델명 노출, 3축 model_name 해소, 교차 품목 CONFLICT, 단일 부모 반환, 복수 부모 null 회귀가 함께 살아 있고 모듈 전체에서 통과했다.

판정: **PASS. 생성자 가림·오선택 없음.**

## 5. 각도 4 — 양 PR 성과 생존

### 5.1 #1046

| 요구 성과 | 병합 후 결과 | 근거 |
|---|---:|---|
| 노출 코드 = `model_name` | PASS | `from(Product)`/`from(Product,parent)` 모두 모델명 노출, product 전체 632/632 |
| product_code / alias_code / model_name 3축 | PASS | 소스 경로 생존, [DEV-SEED] 총 lookup 값 1,320 |
| CONFLICT 0 | PASS | [DEV-SEED] 서로 다른 UUID 충돌 0/1,320 |
| 보상 축 대칭 | PASS(테스트/CI), 라이브 표본 없음 | `StockInstanceServiceOutboundTest` 17/17; CI user+product+inventory 1,515 run/0 fail |

[DEV-SEED] inventory 현재 모양:

```text
 active_instances | with_product_id | recalled | shipped | available
------------------+-----------------+----------+---------+----------
                3 |               3 |        0 |       2 |         1
```

모든 활성 재고는 productId를 보유하지만 RECALLED 행이 0이므로 unrecall/resell의 실제 저장 행 역경로는 이번 라운드에서 실행하지 않았다. 공유 DB write 금지 때문에 상태를 만들지 않았다.

### 5.2 #1058

#### 과차감 0행 / 0원

[DEV-SEED] R5 위험 모집단을 fresh 재현했다.

```text
 chosen_selector | no_option_links | component_models
-----------------+-----------------+-----------------
 4way            |               4 |                4
 360             |              18 |                3

 active_configs | c360 |    s360    | c4way |   s4way
----------------+------+------------+-------+-----------
            210 |   45 | 1900000.00 |    46 | 2000000.00
```

기존 위험값은 `18×45 + 4×46 = 994행`, `18×1,900,000 + 4×2,000,000 = 42,200,000원`이다. 병합 후 matcher는 단일 구성품의 임의 부모를 옵션 selector로 쓰지 않고 실내기+실외기 완성 후보만 소비한다. `LegacySetMatcherTest` 4/4와 `DailyClosingDetailServiceTest` 22/22에서 완성 세트/실패 fallback 경로가 통과했으므로 이 위험 모집단의 **확정 과차감은 0행 / 0원**으로 유지된다.

이는 카탈로그×설정 계산 결과이며 실제 일마감 전표 발생액을 뜻하지 않는다. [DEV-SEED] `accounting_db`의 모델 보유 원천은 다음처럼 0행이다.

```text
           source            | model_rows | total_rows
-----------------------------+------------+-----------
 sales_accounting_slip_lines |          0 |          0
 tax_invoice_lines           |          0 |         22
```

#### 옵션 미보유 164곳 / 0원 변화

[DEV-SEED] fresh 원문:

```text
 optionless_configs | no_360 | no_4way | no_1way | no_stand
--------------------+--------+---------+---------+---------
                164 |    165 |     164 |     165 |      165
```

`optionless_configs`는 6개 옵션 금액이 모두 null인 정확한 모집단 164곳이다. matcher 실패 시 `modelToken` fallback을 유지하고 임의 option selector를 만들지 않는 targeted 회귀가 통과하므로 **164곳 / 0원 변화**를 유지한다. 개별 `no_360/no_1way/no_stand=165`는 해당 필드 하나의 null만 세는 별도 집계이므로 6필드 전부 null인 164곳 정의와 모순되지 않는다.

#### 스냅샷 기준선 0

[고정 실원본 스냅샷] fresh 결과:

```text
SHA256 405B2596D61A2A4F3658BC9ED4F75D0B3BA9DFCF7A643E9CE38BBBC88ED0E663
DailyClosingSnapshotBaselineTest TESTS=1 FAILURES=0 ERRORS=0 SKIPPED=0

 snapshot_outdoor_rows | matched_links | mismatch_links
-----------------------+---------------+---------------
                   271 |           271 |              0
```

고정 원본의 실내기 271행·실외기 271행·14열·총 1,736 CSV행 계약과 hash가 유지된다. 실외기 `(setModel, componentModel)` 271쌍을 현재 [DEV-SEED] `product_db`의 활성 `SINGLE_SET` 링크에 read-only로 다시 대조한 결과도 불일치 0이다.

판정: **PASS. #1046과 #1058의 요구 성과가 모두 살아 있다.**

## 6. 의미 충돌 재현 원문

**재현된 의미 충돌 없음.**

대신 혼동 가능성이 있는 비결함 1건을 기록한다.

```text
전체 활성 BUNDLE 링크 기준: 1,586행 중 미해소 2행
실 matcher endpoint 범위 기준: 1,584행 중 미해소 0행
```

미해소 2행은 `TEST-BUNDLE-SET-01`의 `AR07TXEAAWKNEU-03`, `AR09TXEAAWKNEU-04`이며 #1046 테스트용 부모다. 해당 부모는 matcher가 조회하는 `product_category=SINGLE_SET|COMMERCIAL_MULTI`가 아니므로 실행 결함으로 판정하지 않았다.

## 7. 최종 판정

**PASS — PR #1058 HEAD `f15cc3a2c`의 #1046 병합 커밋에서 의미 충돌을 찾지 못했다.**

- 로컬 product 전체 GREEN.
- 로컬 accounting 전체는 timeout이므로 GREEN 주장 없음.
- accounting targeted, snapshot, matcher, 일마감 detail, inventory 보상 회귀 GREEN.
- 같은 HEAD CI 42/42 pass이며 accounting 전체 권위 결과 0 failed.
- 3축 CONFLICT, 세트 카탈로그 축, record 생성자, 두 PR 불변식 모두 병합 후 유지.

## 8. 이 라운드가 보지 않은 것

1. 운영/production DB와 운영 트래픽은 보지 않았다. DB 수치는 모두 `[DEV-SEED]` 로컬 스택이다.
2. 활성 alias 행이 0이므로 실제 `product_aliases.alias_code` 행을 통한 runtime 성공은 보지 않았다. 3축 소스·단위 테스트·CI와 V30 예상 경로만 검증됐다.
3. `accounting_db`에 model_name을 가진 일마감 원천 행이 0이므로 실제 전표 묶음이 matcher를 통과해 산출한 금액은 보지 않았다. 과차감 0/0원은 실 카탈로그×실 설정 위험 모집단과 회귀 실행에 대한 판정이다.
4. `inventory_db`에 RECALLED 행이 0이므로 실제 공유 DB에서 unrecall/resell을 실행하지 않았다. 보상 축은 targeted 17/17과 CI로 검증했다.
5. accounting-service 로컬 전체 suite는 timeout 때문에 끝까지 보지 못했다. 성공 권위는 같은 HEAD의 GitHub CI다.
6. Google Sheet의 살아 있는 최신 상태를 다시 호출하지 않았다. 저장소에 고정된 2026-08-02 취득 스냅샷만 권위 기준으로 사용했다.
7. soft-deleted product/alias/bundle/재고 행은 production 조회 조건과 동일하게 제외했다.
8. API gateway를 통한 실제 HTTP 일마감 호출, UI 조작, 금액 write, 마감/역마감은 공유 DB write 금지 때문에 수행하지 않았다.

## 9. 새 파일 경로

- `docs/dev-reports/2026-08-02-1008-r10-merge-verification.md`

이 라운드에서 새로 만든 파일은 위 1개뿐이다.
