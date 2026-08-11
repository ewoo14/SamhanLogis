# 제품구분 fix 결과 보고서 — PR #1166

- 일자: 2026-08-11
- 작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\wdg2`
- 기준: `f8f36bc06`
- merge 결과 HEAD: `ccc5dd82b` (`origin/main` 병합)
- 범위: SOL-1 목록 노출/필터/카운트, SOL-2 조건부 rollback, SOL-3 V36·V37 누락
- 금지 준수: commit·push·배포·공유 DB write·`samhan-*` 조작을 하지 않았다. Flyway/rollback 검증은 Testcontainers 격리 PostgreSQL에서만 실행했다.

## 1. SOL-3 — origin/main 병합 및 V38 번호

### 병합 해소

`git fetch origin` 후 `git merge origin/main`만 수행했다. merge commit은 `ccc5dd82b`이며 텍스트 충돌은 0건이었다.

자동 병합된 product-service 파일은 다음 두 개였고, 양쪽 diff를 직접 확인했다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`

점검 결과는 main의 V37 시트 기본값/동기화 동작이었다. 제품구분 목록·응답·rollback 변경과 의미 충돌은 없었다. product-service 범위에서 conflict marker도 재검색해 0건이었다. 따라서 자동 병합 파일을 확인하지 않은 상태로 진행하지 않았다.

### 번호 재확인

병합 후 migration 파일을 `src/main/resources/db/migration`과 `src/main/java/db/migration` 양쪽에서 다시 세었다.

```text
count=38 max=38 missing=
```

`origin/main`의 product-service 최대값 V37에 이 작업의 V38이 정확히 `+1`이고, 현재 작업 트리는 V1..V38 연속이다. 번호를 옮기지 않았다.

## 2. SOL-1 — 물리 제품구분을 별도 축으로 목록에 노출

기존 `category`/`productCategory`는 견적 분류축으로 유지했다. 물리 제품구분은 `categoryId` 요청 파라미터와 응답의 `physicalCategory`로 분리했다. 물리 category UUID를 화면에 노출하지 않고 응답에는 `code`/`name`만 추가했다.

### 구현 좌표

- API 필터: [ProductCatalogController.java](../../services/product-service/src/main/java/com/samhanair/logis/product/web/ProductCatalogController.java:157), [ProductRepository.java](../../services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:231)
  - `categoryId`가 없으면 기존 4-인자 호출 경로를 유지한다.
  - 선택 시 native data query와 count query에 동일한 `p.category_id` 조건을 추가한다.
  - 기존 `q` 정규화/검색 조건은 그대로 두어 `q AND physical category`가 된다.
  - 필터 미선택 시 page size, 정렬, 기존 견적 `category` 조건을 바꾸지 않는다.
- 응답: [ProductCatalogResponse.java](../../services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductCatalogResponse.java:50)
  - `physicalCategory: { code, name }`만 추가했다.
  - 기존 `productCategory`와 `estimateCategory`의 위치·의미는 유지했다.
  - `withComponentCount` 내부 생성자도 새 필드를 전달한다.
- 프런트 계약: [productCatalogApi.ts](../../clients/desktop/src/renderer/api/productCatalogApi.ts:78)
  - `categoryId`는 기존 `category`와 별도 파라미터다.
  - `physicalCategory`는 optional/null 허용으로 기존 응답 소비자의 하위 호환을 보존했다.
- 목록 화면: [ProductCatalogPage.tsx](../../clients/desktop/src/renderer/routes/ProductCatalogPage.tsx:107)
  - 새 필터 라벨은 `제품구분`으로 정했다. 기존 `카테고리` 라벨은 변경하지 않았다.
  - 새 컬럼도 `제품구분`으로 표시하며 기존 `카테고리` 컬럼과 나란히 둔다.
  - 필터 변경 시 page를 0으로 초기화하고 query key에 물리 category를 포함한다.
  - 목록 summary는 API의 `totalElements`를 포맷하므로 `2,126`을 하드코딩하지 않는다. 실제 값이 바뀌면 함께 바뀐다.

### 응답 필드 소비자 exact-match 확인

다음 범위로 grep했다.

```text
rg -n "new ProductCatalogResponse|ProductCatalogResponse\(|ProductCatalogRow|physicalCategory" \
  services/product-service/src/test clients/desktop/src
```

Java `ProductCatalogResponse` 생성자는 응답 record 내부의 `from`/`withComponentCount`뿐이었다. 외부 exact constructor/mock 소비자는 발견되지 않았다. 프런트의 `ProductCatalogRow` 소비자는 구조적 TypeScript 타입으로 동작하고 새 필드는 optional로 두었다. 새 API 계약은 [ProductCatalogControllerIT.java](../../services/product-service/src/test/java/com/samhanair/logis/product/it/ProductCatalogControllerIT.java:116)에서 `q + categoryId` AND와 `physicalCategory.code/name`을 함께 검증한다. 프런트 query 파라미터 계약은 `productCatalogApi.test.ts`에 추가했다.

## 3. SOL-2 — rollback 불변식

구현은 [V38__ProductCategoryBackfill.java](../../services/product-service/src/main/java/db/migration/V38__ProductCategoryBackfill.java:62)의 하나의 CTE 문장이다.

```sql
WITH restored AS (
    UPDATE products p
       SET category_id = a.previous_category_id,
           modified_at = CURRENT_TIMESTAMP,
           modified_by = ?
      FROM product_category_backfill_audit a
     WHERE a.migration_key = ?
       AND a.product_id = p.id
       AND a.rolled_back_at IS NULL
       AND a.is_deleted = FALSE
       AND p.is_deleted = FALSE
       AND p.classification_manual = FALSE
       AND p.category_id = a.applied_category_id
     RETURNING a.id
)
UPDATE product_category_backfill_audit a
   SET rolled_back_at = CURRENT_TIMESTAMP,
       rolled_back_by = ?,
       modified_at = CURRENT_TIMESTAMP,
       modified_by = ?
  FROM restored r
 WHERE a.id = r.id;
```

판정 근거는 다음과 같다.

1. 해당 migration key의 감사행만 대상이다.
2. 감사행과 제품이 모두 활성이고, 감사행이 아직 rollback 완료가 아니다.
3. 제품의 `classification_manual = false`인 경우에만 대상이다.
4. 현재 `products.category_id`가 감사행의 `applied_category_id`와 같을 때만 대상이다. 다르면 V38 이후 사람이 바꾼 것으로 보고 보존한다.

제품 UPDATE의 `RETURNING a.id` 결과를 감사 UPDATE의 입력으로 사용하므로 실제 복원한 감사행만 완료 표시한다. 따라서 수동분류 변경, soft-delete, 기완료 감사, 삭제 감사는 제품도 감사 상태도 바뀌지 않는다. 재실행 시 이미 완료된 행은 다시 대상이 되지 않는다.

회귀 테스트는 [V38__ProductCategoryBackfillTest.java](../../services/product-service/src/test/java/db/migration/V38__ProductCategoryBackfillTest.java:116)에 적용 직후 행, 사후 수동 변경 행, soft-delete 행, 기완료 행, 감사 soft-delete 행을 한 batch로 섞어 검증한다. `executeUpdate()` 반환값도 임의의 1건이 아니라 동일한 4조건 후보 수와 대조한다.

기존 백필 보고서의 rollback 절도 이 조건부 CTE로 갱신했다: [2026-08-11-product-category-backfill.md](2026-08-11-product-category-backfill.md:93).

## 4. RED 원문과 GREEN 결과

### 원래 SOL-1 RED

기존 직접 Playwright 결과는 [playwright-output.txt](../qa/2026-08-11-category/playwright-output.txt)에 보존되어 있다.

```text
Error: 기초품목 화면에 제품구분 필터가 없습니다.
Locator: getByRole('combobox', { name: /카테고리|제품구분/ })
Error: 기초품목 화면에 미등록 카운트가 없습니다.
Locator: getByText(/미등록\s*2,126건/)
1 failed / 1 passed
```

### 추가한 회귀 RED

- `ProductCatalogControllerIT`: `categoryId`와 기존 검색어를 함께 보냈을 때 필터된 1행과 `physicalCategory.code/name`을 요구하도록 추가했다.
- `V38__ProductCategoryBackfillTest`: rollback 메서드가 없던 상태와 사후 변경 행을 복원하면 안 되는 조건을 먼저 고정했다.
- Playwright: 전체 3,084건 → `미등록` 선택 → 2,126건/행 표시 → 필터 해제 → 3,084건을 요구하도록 고쳤다.

### GREEN

```text
product-service 전체: 777 tests completed, BUILD SUCCESSFUL
desktop typecheck: real-QA helper 51 passed, tsc 통과
desktop API/mock: 152 passed | 1 skipped
Playwright headless Chromium: 2 passed (4.2s)
```

검증 중 전체 테스트 첫 실행에서 새 혼합 rollback 테스트의 기대값만 `1`로 고정해 `expected: 1 but was: 26`이 발생했다. V38 격리 fixture에 기존 감사 후보도 포함되어 `executeUpdate()`가 실제 조건부 복원 전체를 반환한 것이 원인이었고, 테스트 기대값을 같은 4조건 후보 query로 계산하도록 수정했다. rollback 구현을 완화하지 않고 targeted 및 전체 테스트를 재실행해 위 GREEN 결과를 얻었다.

Playwright는 `clients/desktop`에서 renderer root를 `src/renderer`로 기동하고 `VITE_MOCK_MODE=0`, `VITE_API_BASE_URL=http://127.0.0.1:1`로 page.route API fixture를 사용했다. 설치된 Chromium으로 headless 실행했으며 공유 API/DB에는 쓰지 않았다.

## 5. 라이브 QA 캡처

최종 실행 시각은 2026-08-11 13:57(KST)이며 아래 4장으로 흐름을 확인할 수 있다.

1. [01-form-unregistered-selected.png](../qa/2026-08-11-category/01-form-unregistered-selected.png) — 등록 폼의 필수 `미등록 (UNREGISTERED)` 선택
2. [02-catalog-before-category-filter.png](../qa/2026-08-11-category/02-catalog-before-category-filter.png) — 목록 전체 `3,084건`
3. [03-catalog-unregistered-filtered.png](../qa/2026-08-11-category/03-catalog-unregistered-filtered.png) — `제품구분=미등록`, 행의 `미등록`, API 기반 카운트 `2,126건`
4. [04-catalog-filter-cleared.png](../qa/2026-08-11-category/04-catalog-filter-cleared.png) — 필터 해제 후 전체 `3,084건`

중간에 root 없이 `vite.config.ts`를 직접 기동한 잘못된 QA 래퍼는 빈 HTML로 실패했으나, 이는 앱 부팅 전 하네스 root 오류였다. renderer root를 명시한 최종 실행으로 교정했고 위의 `2 passed` 원문을 확보했다. 제품 assertion 실패로 판정하지 않았다.

## 6. RED-B 보존 조합표

| 보존 항목 | 확인 결과 |
|---|---|
| 받침대 지정 11건 / 패턴 18건 / 정상 본체 과잉 매칭 0 | 기존 격리 분석 결과를 [SOL review](2026-08-11-product-category-sol-review.md:79)에서 재대조. 이번 변경은 classifier 규칙을 수정하지 않았다. |
| 구성품 역산 41건 / 다중 역할 충돌 11건 | 기존 백필 산출과 일치. 목록 API/화면만 추가했고 classifier·구성품 역산 코드는 건드리지 않았다. |
| 모델코드 접두 분류 금지 | V38은 `classify(name, componentKinds)`만 사용하며 model code를 classifier 입력으로 추가하지 않았다. |
| `classification_manual=true` 불가침 | 적용 테스트와 rollback 사후 수동 변경 batch 테스트가 보존을 확인했다. |
| 시트 신규 자동분류 / soft-delete 재등장 | 병합된 V37 시트 파일과 기존 재등장 경로를 보존했고 전체 product-service 테스트가 통과했다. |
| category 필수 입력 화면/API | 등록 폼 QA와 기존 controller 테스트가 통과했다. |
| 견적·전표·세트 전개·정액DC 불변 | 변경 파일에 견적 계산/전표/세트 전개 경로가 없고, 기존 `category`/`estimateCategory`를 별도 축으로 유지했다. 40% 규칙은 건드리지 않았다. |
| 필터 미선택 결과 | API는 기존 호출 overload를 사용하고 query 조건은 null guard로 동작한다. UI QA에서 전체 3,084건 → 필터 2,126건 → 해제 3,084건을 확인했다. |

기존 분석에서 공유 DB 활성 `classification_manual=true` 표본은 0건이었으므로, 수동 불가침은 격리 PostgreSQL 회귀 테스트로 검증했다. 이번 작업은 공유 DB를 수정하지 않았다.

## 7. 신규 파일 및 작업 트리

이번 작업에서 새로 생긴 파일은 다음과 같다.

- `docs/dev-reports/2026-08-11-product-category-fix.md` (본 보고서)
- `docs/qa/2026-08-11-category/02-catalog-before-category-filter.png`
- `docs/qa/2026-08-11-category/03-catalog-unregistered-filtered.png`
- `docs/qa/2026-08-11-category/04-catalog-filter-cleared.png`

`01-form-unregistered-selected.png`은 기존 파일을 최종 QA 캡처로 갱신했다. 코드·기존 보고서·테스트 파일은 신규 생성이 아니라 수정이다. merge commit 이외의 commit은 만들지 않았고 push하지 않았다.
