# PR #1166 제품구분 SOL 재검토 3

- 검토일: 2026-08-11 (KST)
- 대상: `C:\dev\Samhan-Public\.claude\worktrees\wdg2`
- HEAD: `386fa1dab83a95e5d278d813e45c3c5bdb51af46`
- 범위: R2-1 보완, `category_id` write 전수표, 멱등성, 정상경로, RED-B, Desktop 라이브 QA
- 제약: 공유 DB write·배포·git 변경 조작 없음

## 1. 판정

**결함 0 — R3 PASS.** R2-1의 실제 UPDATE 가드와 ECOUNT soft-delete 복원 보완을 수용한다.

보고서의 `category_id` 표를 production source에서 직접 재현했고, 표에 없는 실제 DB write 지점은 없었다. 격리 PostgreSQL에서 apply 멱등성, apply 후 수동 변경, rollback 후 수동 변경, ECOUNT/시트 복원과 정상 자동행을 다시 실행했다. 정상 자동행은 첫 apply에서 실제 2건 변경·감사 2건이었고 두 번째 apply는 변경 0·감사 증가 0이었다.

PM은 이 R3 결과를 제품구분 S1 완료 근거로 사용할 수 있다. PR #1166의 다음 범위인 S2(주문 40% 규칙)는 별도 검토 대상이다.

## 2. `category_id` write 전수 재현

실행 명령:

```text
git grep -n "category_id" -- services/product-service/src/main/java services/product-service/src/main/resources/db/migration
git grep -n -E "changeCategory\(|setCategory\(|\.category\(|categoryRepository\.findById|new Product\(" -- services/product-service/src/main/java
git grep -n -E "INSERT INTO products|UPDATE products|ON CONFLICT.*products" -- services/product-service/src/main/java services/product-service/src/main/resources/db/migration
```

원문은 [category-id-git-grep.txt](../qa/2026-08-11-category-r3/category-id-git-grep.txt)에 보존했다.

| 경로 | 실제 write | 기존행 여부 | `classification_manual=true` 결과 | 판정 |
|---|---|---:|---|---:|
| V38 `rollback()` | `category_id=previous_category_id` | O | WHERE 가드로 skip | O |
| V38 `applyAuditedChanges()` | `category_id=applied_category_id` | O | 새 WHERE 가드로 skip | O |
| 시트 신규 `seedFromSheet()` | classifier category 신규 INSERT | X | 선행행 없음, 기본 false | O |
| 시트 기존/soft-delete 재등장 | category assignment 없음 | O | 기존 category 유지 | O |
| ECOUNT `UPSERT_PRODUCT_SQL` | 신규 INSERT만 `ECOUNT_MIG2` | 신규/활성 | active conflict에는 category assignment 없음 | O |
| ECOUNT soft-delete 복원 | 조건부 category UPDATE | O | 기존 `p.category_id` 유지 | O |
| HVAC seeder native INSERT | seed category 신규 INSERT | X | 선행행 없음 | O |
| `ProductService.create()` | 요청 category 신규 ORM INSERT | X | 사용자 신규 행위 | O |
| `ProductService.update()` | `changeCategory()` ORM UPDATE | O | 사용자 명시 변경 허용, 기존 true 유지 | O |

직접 SQL write는 V38 2, ECOUNT 2, HVAC 1의 5문장이다. ORM sink는 시트 신규, 화면 신규, 화면 수정 3곳이다. 표의 시트 기존/복원 행은 “write 없음”을 확인하는 경로다.

추가로 보인 `HvacProductSeeder.buildProduct()`의 `Product.create()`는 JPA 저장점이 아니다. 생성한 값 객체를 같은 `insertProductNative()`에 넘기므로 별도 write 분모로 세지 않았다. `Product.java @JoinColumn`, repository 조건, V1/V28 스키마·trigger 참조도 write가 아니다.

## 3. 격리 DB 조합과 멱등성

공식 focused 실행:

| suite | tests | 실패/오류/skip |
|---|---:|---:|
| `V38__ProductCategoryBackfillTest` | 6 | 0/0/0 |
| `EcountProductImporterIT` | 6 | 0/0/0 |
| `ProductSheetSyncServiceIT` | 49 | 0/0/0 |
| `ProductServiceTest` | 75 | 0/0/0 |

공식 테스트가 직접 세지 않던 조합은 검토 전용 임시 JUnit 3건으로 밟은 뒤 소스를 제거했다. 원문은 [isolated-db-probe-output.txt](../qa/2026-08-11-category-r3/isolated-db-probe-output.txt)에 있다.

| 조합 | 실측 |
|---|---|
| apply 1회 | manual=false 정상행 2건 변경, 감사 2건 |
| apply 2회 | category/modified 시각 동일, 변경 증가 0, 감사 증가 0 |
| apply → 화면 서비스 수동 변경 → apply | `INDOOR`, manual=true 그대로 유지 |
| apply → rollback → 화면 서비스 수동 변경 → apply | `INDOOR` 유지, 감사 rollback 완료 유지 |
| ECOUNT soft-delete → 복원, manual=true | 기존 수동 category 유지 |
| ECOUNT active conflict | 기존 category 유지 |
| 시트 soft-delete → 재등장, manual=true | 기존 UUID/category 유지 |

V38 실제 UPDATE는 후보 SELECT와 별도로 쓰기 시점에 `p.classification_manual = FALSE`를 다시 검사한다. 따라서 후보 조회 뒤 상태가 true로 바뀐 경우에도 UPDATE가 막힌다. rollback도 같은 현재행 가드를 유지한다.

## 4. 정상경로가 막히지 않았는가

- **백필 정상행:** 격리 probe에서 manual=false 2건이 첫 apply에 실제 변경되고 감사 2건이 생겼다. 공식 V38 첫 테스트도 자동분류/미분류/구성품 역산 4행 적용과 수동 1행 skip을 단언한다.
- **시트 자동분류:** `ProductSheetSyncServiceIT` 49/49. 신규 `실외기 → OUTDOOR`, 미일치 → `UNCLASSIFIED`, 기존/soft-delete category 보존 경로가 포함된다.
- **화면 사용자 변경:** Chromium 등록 폼에서 카테고리 선택이 동작했다. `ProductFormPage.test.tsx` 10/10은 편집 hydrate와 `updateProduct(... categoryId ...)` 저장을 확인했고, 격리 ProductService probe는 manual=true 행을 `INDOOR`로 바꾼 뒤 재-apply에서도 값을 보존했다.
- **ECOUNT 정상 복원:** manual=false 복원은 기존 `ECOUNT_MIG2` 계약을 유지하고 manual=true 복원만 현재값을 보존한다.

## 5. RED-B 보존

- product-service full suite: **781 tests, failures 0, errors 0, skipped 0**. Gradle HTML과 72개 XML 첫 태그를 독립 합산했다.
- Desktop API Vitest: **152 passed / 1 skipped** (`productCatalogApi.test.ts`, `mock.test.ts`).
- ProductForm 추가 focused: **10 passed**.
- 받침대 지정 11, 받침대 패턴 18의 본체 과잉 0, 구성품 역산 41, 다중 역할 충돌 11은 full suite 회귀 범위에 포함된다.
- classifier production 호출은 V38의 `classify(candidate.name(), componentKinds)`와 시트 신규의 `classify(name)` 두 곳뿐이다. **모델코드를 인자로 받는 호출은 0곳**이다.
- `main...HEAD`에서 estimate-service, slip-service, estimate-app, order-app production 변경은 없었다. 제품 물리 category 축과 정액DC/견적/전표/세트 전개 축을 연결하는 변경도 없다.
- `git diff --check` 출력 없음.

## 6. 라이브 QA

`clients/desktop`에서 Playwright 1.59.1과 `chromium-1217` 실행 파일을 직접 사용했다.

첫 실행은 `vite.web.config.ts` BrowserRouter에 HashRouter URL을 넣어 두 화면이 대시보드로 낙착했고 **2 failed**였다. 제품 결함이 아닌 하네스 오류이며, 요청대로 [실패 원문](../qa/2026-08-11-category-r3/playwright-first-run-failure.txt)과 실패 캡처 2장을 보존했다.

저장소가 정한 HashRouter 하네스(`npx vite src/renderer --config vite.config.ts`, API `127.0.0.1:1`)로 한 변수만 교정한 최종 실행은 **2 passed (4.1s)**였다. [최종 원문](../qa/2026-08-11-category-r3/playwright-final-output.txt).

최종 캡처:

1. [01-form-unregistered-selected.png](../qa/2026-08-11-category-r3/01-form-unregistered-selected.png) — 등록 폼 `미분류` 선택
2. [02-catalog-before-category-filter.png](../qa/2026-08-11-category-r3/02-catalog-before-category-filter.png) — 필터 전 전체 3,084
3. [03-catalog-unregistered-filtered.png](../qa/2026-08-11-category-r3/03-catalog-unregistered-filtered.png) — `미분류` 선택, 2,126
4. [04-catalog-filter-cleared.png](../qa/2026-08-11-category-r3/04-catalog-filter-cleared.png) — 해제 후 3,084

## 7. 이 라운드가 보지 않은 표면

1. 공유/운영 DB에 V38을 실제 적용하는 실행은 write 금지 때문에 하지 않았다. 모든 migration 검증은 격리 PostgreSQL이었다.
2. 후보 조회와 UPDATE 사이의 **별도 세션 동시 트랜잭션 경합**을 인위적으로 스케줄링하지 않았다. 쓰기 SQL의 현재행 가드와 단일 트랜잭션 조합은 검증했다.
3. 실제 gateway/공유 DB를 붙인 GUI PATCH 왕복은 하지 않았다. 화면 선택·mock API payload·격리 ProductService DB 변경을 각각 검증했다.
4. S2 주문 40% 규칙의 계산식·주문 UI·회귀는 이번 R3 범위 밖이며 아직 판정하지 않았다.

## 8. PM 보고

R3에서 새 결함은 발견되지 않았다. R2-1과 전수조사에서 추가 발견한 ECOUNT soft-delete 복원 경로는 닫혔고, 정상 자동행과 사용자 변경 경로도 막히지 않았다. 제품구분 S1은 PASS로 넘기고, 같은 PR의 다음 단계 S2(주문 40% 규칙)로 진행 가능하다.
