# PR #984 R6 `[HIGH-1]` 삭제 Product UUID alias fix

## 결론

R6에서 확인된 단일 결함을 수정했다. `staging.ecount_item_alias`가 soft-delete 된 Product UUID를 반환하지 않도록 product-service resolver를 활성 Product JOIN으로 제한하고, accounting-service MIG-8 변환은 alias 미해소 주문을 `product_id = NULL`로 저장하지 않고 `MIG8_LOOKUP_MISS`로 주문 그룹 전체를 거부한다.

결과적으로 삭제된 UUID가 주문·전표 라인에 기록되지 않으며, 정상 활성 alias와 시트 품목 삭제 운영 경로는 유지된다. 새 migration, Docker 재배포, git add/commit/push/checkout은 수행하지 않았다.

## 원인 — R6 전문의 정상 운영자 7단계

R6 전문의 진단을 그대로 적용했다.

1. Google Sheet에서 현재 활성 품목 `AR-EC05` 행을 제거한다.
2. 관리자가 데스크톱 시트 동기화 화면에서 `지금 동기화`를 누른다.
3. product-service가 시트에서 사라진 `AR-EC05` Product 1건을 soft-delete한다. 그러나 `product_aliases`와 `staging.ecount_item_alias`는 정리하지 않는다.
4. 관리자가 accounting-service의 `/admin/ecount/reimport/mig-8`을 실행한다.
5. alias resolver가 `products`를 확인하지 않고 staging UUID를 그대로 반환한다. accounting-service는 현재 PENDING인 `AR-EC05` 주문 160건 라인에 삭제 Product UUID를 저장한다.
6. 관리자가 partner-order의 `/admin/partner-orders/mig8-import`를 실행한다.
7. product-service UUID lookup은 soft-delete Product를 반환하지 않는다. partner-order는 product lookup miss로 160개 주문을 모두 거부한다.

직접 원인은 `EcountAliasResolveService`의 staging 단독 조회였다. 후속 원인은 accounting 변환기가 resolver의 미해소 결과를 `NULL` product ID로 허용했던 것이다.

## RED — 수정 전 원문

### accounting-service 160건 재현

신규 테스트 `Mig8OrderTransformServiceTest.soft_deleted_alias_UUID가_섞인_160건은_삭제_UUID를_쓰지_않고_전건_reject한다`를 수정 전에 실행했다. RED fixture는 resolver가 삭제 UUID를 반환하는 상태를 직접 시뮬레이션했고, 기존 변환기는 160행을 모두 import해 line에 잘못된 UUID를 허용했다. 수정 후에는 product-service가 그 alias를 응답에서 제외하므로 accounting fixture도 `Map.of()` 미해소 상태로 고정했다.

```text
1 test completed, 1 failed

expected: 0
 but was: 160

Execution failed for task ':services:accounting-service:test'.
BUILD FAILED
```

### product-service 실 PostgreSQL alias 재현

신규 `EcountAliasResolveServiceIT`가 Testcontainers PostgreSQL에서 Product를 soft-delete한 뒤 같은 UUID를 staging alias에 넣고 resolver를 호출했다.

```text
EcountAliasResolveServiceIT > soft_deleted_Product를_가리키는_staging_alias는_해소하지_않는다() FAILED
    java.lang.AssertionError

Expecting actual:
  {"R6-ALIAS-CODE-984-DELETED"=<soft-deleted Product UUID>}
not to contain key:
  "R6-ALIAS-CODE-984-DELETED"

2 tests completed, 1 failed
Execution failed for task ':services:product-service:test'.
BUILD FAILED
```

위 두 RED가 각각 삭제 UUID 반환과 160건 조용한 변환을 독립적으로 재현한다.

## 수정

### 1. product-service resolver

`EcountAliasResolveService`의 SQL을 다음 계약으로 변경했다.

```sql
FROM staging.ecount_item_alias a
JOIN products p
  ON p.id = a.main_product_uuid
 AND p.is_deleted = FALSE
```

staging에 alias 행이 남아 있어도 실제 사용 가능한 활성 Product가 없으면 응답 map에서 제외된다. 활성 Product alias는 계속 반환된다.

### 2. accounting-service MIG-8 fail-closed

각 order group을 DB에 upsert하기 전에 모든 line의 alias 해소 결과를 검사한다. 하나라도 없으면:

- `MIG8_LOOKUP_MISS` sample을 만든다.
- 해당 order group의 staging row를 `REJECTED`로 표시한다.
- `orders`와 `order_lines` INSERT를 실행하지 않는다.
- 다른 정상 group의 기존 변환 경로는 유지한다.

따라서 resolver 장애나 삭제 Product alias 미해소도 `product_id = NULL` 또는 삭제 UUID로 조용히 진행되지 않는다.

## GREEN 원문

### 회귀 테스트

```text
:services:accounting-service:test
21 tests ...
BUILD SUCCESSFUL in 18s

:services:product-service:test --tests EcountAliasResolveServiceIT
BUILD SUCCESSFUL in 3s
```

핵심 160건 테스트 결과는 다음과 같다.

```text
totalRows=160
imported=0
updated=0
rejected=160
samples[0].code=MIG8_LOOKUP_MISS
staging statuses=160 x REJECTED
orders INSERT=0
order_lines INSERT=0
```

### 모듈 전체

실 PostgreSQL Testcontainers와 Gradle user home `D:\dev\Samhan-Public\.gradle-t21`로 전체 모듈을 실행했다.

```text
product-service
BUILD SUCCESSFUL in 1m 54s
630 tests / failures=0 / errors=0 / skipped=0

accounting-service
BUILD SUCCESSFUL in 4m 49s
Gradle test report: 1684 tests / failures=0 / ignored=10
```

product-service 전체는 PostgreSQL 16 Testcontainers에서 Flyway V1~V28을 적용해 검증했다. accounting-service 전체도 GREEN이며, 이 변경으로 영향받은 두 모듈 모두 full suite를 실행했다.

## 공유 운영 DB 사전상태 — 읽기 전용 대조

`samhan-postgres`가 healthy인지 확인한 뒤 아래 DB에 `docker exec ... psql -c`로 SELECT만 실행했다. INSERT/UPDATE/DELETE, sync, MIG-8 reimport, partner-order import, Docker 재배포는 수행하지 않았다.

### product_db

```text
 product_code | is_deleted | lineage | product_category | usage_scope_manual | active_quantity_rule_ref_count | active_public_alias_count | staging_alias_count
--------------+------------+---------+------------------+--------------------+--------------------------------+---------------------------+---------------------
 AR-EC05      | f          | SHEET   | HOME_MULTI       | f                  | 0                              | 1                         | 1
```

### accounting_db

```text
 item_name | transform_status | active_rows | distinct_order_count | distinct_partner_count | partner_name
-----------+------------------+-------------+----------------------+------------------------+--------------------------
 AR-EC05   | PENDING          | 160         | 160                  | 1                      | 주식회사 광도설비-황정욱
```

### partner_db

```text
 name                    | status | is_deleted | exact_active_rows
-------------------------+--------+------------+-------------------
 주식회사 광도설비-황정욱 | ACTIVE | f          | 1
```

### 테스트 sentinel

신규 fixture prefix인 `R6-ALIAS-984-%`와 `R6-ALIAS-CODE-984-%`를 공유 `product_db`에서 읽기 전용으로 확인했다.

```text
 relation                  | rows
--------------------------+------
 products                  | 0
 staging.ecount_item_alias | 0
```

신규 IT 자체도 `@DirtiesContext`에 의존하지 않는다. `@BeforeEach`와 `@AfterEach`에서 alias를 먼저 지우고 고유 model code의 Product를 지우는 `cleanupFixture()`를 실행한다. 이 cleanup은 테스트 전용 Testcontainers DB 안에서만 실행됐다.

## 불변식별 확인 근거

1. **삭제된 품목 UUID가 주문·전표 라인에 박히지 않음**
   - product resolver가 `p.is_deleted = FALSE` JOIN을 통과한 UUID만 반환한다.
   - accounting 160건 GREEN에서 `imported=0`, `rejected=160`, `orders INSERT=0`, `order_lines INSERT=0`을 확인했다.
   - downstream이 삭제 UUID를 lookup하는 단계까지 도달하지 않는다.

2. **미해소 시 조용한 오기록 금지 및 관리자 인지 가능**
   - `ensureProductAliasesResolved`가 미해소 line을 `MIG8_LOOKUP_MISS`로 거부한다.
   - 결과 sample에 오류 code와 `sourceRowNo`, `itemName`을 남기고 staging status를 `REJECTED`로 갱신한다.
   - 기존 `product_id = NULL` 허용 테스트도 이 계약으로 변경해 `REJECTED`와 no INSERT를 단언한다.

3. **기존 검증 유지**
   - 활성 alias가 계속 해소되는 실 PostgreSQL IT를 추가했고 GREEN이다.
   - 기존 lookup-by-code 24/24 HTTP 200, skippedGroupCount 0, alias 24개/12그룹, 726건 downstream, 전표·재고·rollback·순서 수렴 수치는 R6 기준 증거를 유지한다. 이번 diff는 그 경로의 code sorting, importer, inventory/slip 계약을 수정하지 않았다.
   - product-service 전체 `630/0/0/0`, accounting-service 전체 `1684/0/0/10`으로 기존 테스트 회귀가 없음을 확인했다.

4. **시트에서 품목이 사라지는 정상 운영 유지**
   - `ProductSheetSyncService`의 soft-delete 동작과 시트 동기화 경로는 수정하지 않았다.
   - 삭제 후 남을 수 있는 alias를 resolver의 사용 가능성 경계에서 제외했으며, 활성 alias의 기존 반환은 GREEN으로 확인했다.

5. **멱등·실패 시 부분 반영 없음**
   - 변환 전 order group 전체의 alias 해소를 검사해 missing line이 있는 group은 upsert 전에 전건 거부한다.
   - 160건 테스트에서 주문/라인 INSERT가 0건이고 상태만 160건 `REJECTED`임을 확인했다.
   - accounting 전체 suite의 기존 멱등·rollback 검증도 GREEN이다.

## 마이그레이션 판정

마이그레이션은 필요하지 않다. 기존 `staging.ecount_item_alias.main_product_uuid`, `products.is_deleted` 컬럼과 인덱스로 SQL JOIN이 가능하다. 신규 V 파일을 만들지 않았으므로 V27/V28 적용 순서나 origin/main 대비 하위 번호 충돌은 발생하지 않는다.

## 변경·신규 파일

### 변경 파일

| 파일 | 변경량 | 내용 |
|---|---:|---|
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java` | `+20 / -0` | alias 미해소 order group 사전 거부 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/Mig8OrderTransformServiceTest.java` | `+37 / -2` | NULL 진행 회귀 수정 및 160건 RED/GREEN |
| `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountAliasResolveService.java` | `+6 / -3` | 활성 Product JOIN |
| `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductInternalControllerIT.java` | `+2 / -0` | native alias 조회 전 fixture flush |

### 신규 파일

| 파일 | 변경량 | 내용 |
|---|---:|---|
| `services/product-service/src/test/java/com/samhanair/logis/product/it/EcountAliasResolveServiceIT.java` | `+108 / -0` | 활성/soft-delete alias 실 PostgreSQL 회귀 |
| `docs/dev-reports/2026-07-30-984-deleted-uuid-alias.md` | 신규 | 본 R6 fix 보고서 |

## 남긴 파일 전체 목록

```text
services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java
services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/Mig8OrderTransformServiceTest.java
services/product-service/src/main/java/com/samhanair/logis/product/service/EcountAliasResolveService.java
services/product-service/src/test/java/com/samhanair/logis/product/it/ProductInternalControllerIT.java
services/product-service/src/test/java/com/samhanair/logis/product/it/EcountAliasResolveServiceIT.java
docs/dev-reports/2026-07-30-984-deleted-uuid-alias.md
```

`docs/handoff/CURRENT-WORK.md`는 수정하지 않았다.
