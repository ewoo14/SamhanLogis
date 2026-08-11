# 제품구분 수동분류 불가침 보완 보고서

- 검증일: 2026-08-11 (KST)
- 대상: PR #1166, 워크트리 `C:\dev\Samhan-Public\.claude\worktrees\wdg2`, HEAD `f02d6cd33`
- 기준 지시서: `docs/dev-reports/2026-08-11-product-category-sol-review2.md` §6
- 범위: V38 `apply()` 재실행, `category_id` 자동 write 전수조사, ECOUNT soft-delete 복원, 회귀·Desktop QA
- 제외: git 조작, 공유 DB write, 배포, `samhan-*` 조작, 40% 규칙

## 1. 결론

R2-1을 수정했다. 원인은 V38 최초 후보 SELECT에는 `p.classification_manual = FALSE`가 있었지만, 기존 감사행을 재적용하는 실제 `UPDATE products ... FROM product_category_backfill_audit`에는 같은 조건이 없었던 것이다. 따라서 감사행 생성 후 담당자가 category와 수정자를 바꿔도 `apply()` 재실행이 감사 적용값으로 덮어썼다.

전수조사에서 별도로 발견된 X 지점인 ECOUNT soft-delete 복원도 보완했다. 수동 soft-delete 행은 기존 `category_id`를 유지하고, 비수동 행은 기존처럼 `ECOUNT_MIG2`로 복원한다.

## 2. RED 원문

### RED-A — V38 apply 재실행

추가한 회귀: `V38__ProductCategoryBackfillTest.apply_재실행은_감사후_수동변경한_제품구분을_덮어쓰지_않는다()`

수정 전 실행 결과:

```text
V38__ProductCategoryBackfillTest > apply_재실행은_감사후_수동변경한_제품구분을_덮어쓰지_않는다() FAILED
4 tests completed, 1 failed

org.opentest4j.AssertionFailedError:
expected: "INDOOR"
 but was: "OUTDOOR"
```

재현 상태:

```text
product=BACKFILL-MANUAL-RERUN
first apply=OUTDOOR
human change=INDOOR, classification_manual=true, modified_by=human
second apply=expected INDOOR, actual OUTDOOR
```

원문 파일: [v38-r2-1-before-fix.txt](../qa/2026-08-11-category-fix2/v38-r2-1-before-fix.txt)

수동행과 정상행을 섞은 RED에서는 V38 5 tests 중 다음 2건이 실패했다.

```text
apply_재실행은_감사후_수동변경한_제품구분을_덮어쓰지_않는다()
apply_재실행은_수동행을_정상자동행과_섞어도_수동행만_건너뛴다()
```

### RED-B — ECOUNT soft-delete 복원

수정 전 ECOUNT IT:

```text
6 tests completed, 1 failed
expected: 00000000-0000-0000-0000-000000001002
 but was: 00000000-0000-0000-0000-000000001099
```

`001002=INDOOR`, `001099=ECOUNT_MIG2`이다. `classification_manual=true`인 soft-delete 행이 복원 과정에서 ECOUNT 기본 category로 덮어써지는 원문이다.

## 3. `git grep category_id` write 전수표

다음 명령으로 production source의 `category_id` 발생 지점을 전수 확인했다.

```text
git grep -n "category_id" -- services/product-service/src/main/java services/product-service/src/main/resources/db/migration
```

| 지점 | 자동/사용자 | 실제 동작 | `classification_manual` 존중 | 조치 |
|---|---|---|---:|---|
| `V38__ProductCategoryBackfill.rollback()` :69 | 자동 rollback | `SET category_id = a.previous_category_id` | O | 기존 `p.classification_manual = FALSE` 유지 |
| `V38__ProductCategoryBackfill.applyAuditedChanges()` :236 | 자동 V38 재적용 | `SET category_id = a.applied_category_id` | X → O | 실제 UPDATE WHERE에 `AND p.classification_manual = FALSE` 추가 |
| `ProductSheetSyncService` 신규 `seedFromSheet()` :1328 | 자동 신규 INSERT | classifier 결과 category로 새 행 생성 | O | 신규 기본값 false; 기존 수동행을 덮지 않음 |
| `ProductSheetSyncService` 기존/soft-delete 재등장 :1319-1320 | 자동 시트 sync | 기존 entity 복원 후 기존 category 유지 | O | category write 없음 |
| `EcountProductImporter.UPSERT_PRODUCT_SQL` :393 | 자동 신규 INSERT / active conflict | 신규 INSERT는 `ECOUNT_MIG2`; conflict UPDATE에는 category assignment 없음 | O | 기존 active category 보존 |
| `EcountProductImporter.restoreSoftDeletedProduct()` :503 | 자동 soft-delete 복원 | 기존에는 무조건 `ECOUNT_MIG2` | X → O | `CASE WHEN p.classification_manual THEN p.category_id ... END` 추가 |
| `HvacProductSeeder.insertProductNative()` :431 | 자동 신규 seed INSERT | 신규 seed row의 category 기록 | O | 기존 행을 update하지 않음 |
| `ProductService.create()` :549 | 사용자 화면 신규 등록 | 요청 category로 신규 행 생성 | O | 신규 사용자 선택은 허용 |
| `ProductService.update()` :610 | 사용자 화면 명시 수정 | `product.changeCategory(category)` | 사용자 행위 | 자동 가드로 막지 않음 |

다음은 `git grep`에는 잡히지만 write가 아닌 지점이다.

- `Product.java @JoinColumn(name = "category_id")`: ORM 매핑
- `ProductRepository`의 `category_id` 조건: 목록/필터 조회
- V1의 column/index, V28의 trigger/join 조건: 스키마·참조
- DTO/classifier의 category_id 언급: 표현·분류 결과이며 DB write 아님

따라서 자동 category write의 X 분모는 V38 apply 재적용과 ECOUNT soft-delete 복원 2건이며 둘 다 닫았다. rollback, 시트 기존/재등장, active ECOUNT conflict는 원래 O였다.

## 4. 선택한 수단과 근거

### V38 apply

`loadCandidates()`만 다시 고치는 것은 후보 조회와 UPDATE 사이에 수동 변경이 발생하는 경계를 막지 못한다. 실제 쓰기 SQL의 `WHERE`에서 현재 row를 다시 검사하도록 다음 조건을 추가했다.

```sql
AND p.classification_manual = FALSE
```

이 조건은 감사행 생성 여부와 무관하게 실제 UPDATE 시점에 수동행을 제외한다. skip된 행은 category, `modified_at`, `modified_by`, `rolled_back_at`을 변경하지 않는다. rollback SQL에는 이미 같은 가드가 있어 변경하지 않았다.

### ECOUNT soft-delete 복원

복원 자체는 계속 수행해야 하므로 수동행을 UPDATE 대상에서 제거하지 않았다. category assignment만 조건부로 두었다.

```sql
category_id = CASE
    WHEN p.classification_manual THEN p.category_id
    ELSE (SELECT id FROM categories
          WHERE code = 'ECOUNT_MIG2' AND is_deleted = FALSE LIMIT 1)
END
```

화면의 `ProductService.update()`는 명시적 사용자 변경이므로 보호 대상 자동 경로에 포함하지 않았다. 이로써 “자동 갱신 차단”과 “사용자 화면 수정 허용”을 분리했다.

## 5. RED-B 및 조합 검증표

| 조합 | 기대 결과 | 검증 |
|---|---|---|
| manual=false 최초 apply | 품목명/구성품 역산 결과 적용, 감사 1행 | 기존 V38 test + full suite |
| manual=true 최초 apply | category·수정자 불변, 감사 0행 | 기존 V38 test |
| 감사행 생성 후 manual=true, applied와 다른 제3 category, apply 재실행 | 수동 category·`modified_at/by` 유지 | 신규 RED-A GREEN |
| 감사행 생성 후 manual=true, applied와 같은 category, apply 재실행 | update 0, 수동 수정자·시각 유지 | 신규 혼합 batch GREEN |
| manual 두 행 + 정상 자동행 혼합 batch | 수동 두 행 skip, 정상 자동행만 적용 | 신규 혼합 batch GREEN |
| apply 2회, 수동 변경 없음 | category 동일, 감사 중복 없음 | 신규 혼합 batch 및 기존 멱등 INSERT |
| apply → rollback → apply | rollback된 감사행 재적용 안 함 | 신규 V38 조합 GREEN |
| rollback 4조건 | eligible만 복원; completed/productDeleted/manual/mismatch/auditDeleted skip | 기존 SOL-2 test/probe + full suite |
| 시트 신규 자동분류 후 재동기화 | 신규 category 유지 및 기존 category 축 불변 | `ProductSheetSyncServiceIT` + full suite |
| 시트 soft-delete 재등장 + manual=true | 기존 UUID/category 보존 | 기존 `sync_softDelete후_재등장한_수동카테고리품목은_기존카테고리를_보존한다()` |
| ECOUNT active conflict | 기존 category 보존 | 기존 ECOUNT IT |
| ECOUNT soft-delete 재등장 + manual=true | 복원하되 기존 category 보존 | 신규 ECOUNT IT GREEN |
| 화면에서 category 직접 수정 | 명시적 사용자 변경 허용 | `ProductService.update()` 경로 미변경 |

## 6. SOL-B 보존 및 라이브 QA

`clients/desktop`에서 별도 Vite renderer를 띄우고 Playwright 1.59.1, 설치된 Chromium-1217, headless로 다음 스펙을 직접 실행했다.

```text
playwright/1166-product-category-sol-review/1166-product-category-sol-review.spec.ts

Running 2 tests using 1 worker
2 passed (3.6s)
```

검증한 흐름:

```text
전체 3,084건 → 제품구분=미분류 2,126건 → 필터 해제 3,084건
```

재생성된 캡처:

- [01-form-unregistered-selected.png](../qa/2026-08-11-category/01-form-unregistered-selected.png)
- [02-catalog-before-category-filter.png](../qa/2026-08-11-category/02-catalog-before-category-filter.png)
- [03-catalog-unregistered-filtered.png](../qa/2026-08-11-category/03-catalog-unregistered-filtered.png)
- [04-catalog-filter-cleared.png](../qa/2026-08-11-category/04-catalog-filter-cleared.png)

## 7. 테스트 결과

| 검증 | 결과 |
|---|---|
| V38 focused (`V38__ProductCategoryBackfillTest`) | 6 tests pass |
| ECOUNT focused (`EcountProductImporterIT`) | 6 tests pass |
| product-service full (`:services:product-service:test --no-daemon --rerun-tasks`) | **781 tests, failures 0, errors 0, skipped 0** |
| Desktop Vitest (`productCatalogApi.test.ts mock.test.ts`) | **152 passed, 1 skipped** |
| Desktop Playwright Chromium-1217 | **2 passed** |
| `git diff --check` | 출력 없음 |

기존 product-service 777 tests에 V38 회귀 3건과 ECOUNT 회귀 1건을 추가해 최종 781건이 되었다. 기존 제품구분 분류·받침대 11건·받침대 패턴 18건·구성품 역산 41건·다중 역할 11건·시트 재등장·견적/전표/세트 전개 회귀도 full suite에 포함되어 모두 통과했다. 모델코드 접두 분류를 추가하지 않았으며, 40% 규칙은 건드리지 않았다.

이번 작업에서는 checkout/fetch/pull/add/commit/reset/merge/push를 실행하지 않았고, 공유 DB에 접근하거나 write하지 않았다. 모든 DB 검증은 Testcontainers 격리 PostgreSQL에서 수행했다.
