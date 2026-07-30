# PR #984 R5 SOL 재수렴 적대검증

## 최종 판정

**BLOCK — 원 R3 결함 2건과 CI 실패 5건은 각각 해소됐지만, 네 fix가 만든 표면에서 실 사용자 도달 결함 2건을 확인했다.**

- `[HIGH-1]` ECOUNT→SHEET 승격 시 마스터 품목명이 바뀌지만 기존 견적·전표·거래처주문 이름 snapshot은 바뀌지 않아 같은 품목의 현재 이름과 기발행 문서 이름이 갈라진다.
- `[HIGH-2]` 동명 병합이 실제로 규격·입고가가 다른 24개 SKU를 12개 product로 축소하며, 최초 파일 행 순서가 12/12 정본 code·규격과 9/12 입고가를 결정한다.
- `[EVIDENCE-1]` 새 R4 증거 체인은 수렴했지만, R3가 지적한 구 보고서의 `.gitkeep` 출력과 “3개 raw 파일 사용” 문장 모순은 HEAD에 남아 있다.

검증은 5 agents가 이름 승격, 동명 병합·순서, alias fallback·다운스트림, 순서 수렴·격리, 증거 무결성을 나눠 수행했다. 코드·git·공유 DB·Docker 배포 상태는 변경하지 않았다. 허용된 product-service Testcontainers 테스트만 실행했다.

---

## 결함 1 — `[HIGH-1]` ECOUNT→SHEET 승격이 기존 문서와 현재 카탈로그의 품목명을 분리한다

### 실 사용자 경로

1. 관리자가 ECOUNT CSV를 임포트해 이름 A의 ECOUNT 품목을 만든다.
2. 사용자가 데스크톱 품목 검색에서 이 품목을 선택해 견적서 또는 전표 라인을 저장한다. 라인에는 이름 A가 snapshot으로 저장된다.
3. 같은 modelCode가 이름 B로 시트에 편입된 뒤 관리자가 `지금 동기화`를 실행한다.
4. `promotedFromEcount` 분기가 `p.rename(name)`을 실행한다.
5. 현재 품목 마스터와 새 검색 결과는 이름 B를 표시하지만 기존 견적·전표·거래처주문은 이름 A를 계속 표시한다.

이는 임의 SQL이나 내부 전용 호출이 아니다. ECOUNT 임포트, 데스크톱 품목 선택, 관리자 시트 동기화라는 정상 사용자 동작만으로 도달한다.

### 재현 절차

1. import-first 환경에서 ECOUNT 이름이 `AC023CN1DBC1 [CN냉전 실내기]`인 품목을 임포트한다.
2. 해당 modelCode를 검색해 견적 또는 전표 라인 1개를 저장한다.
3. 같은 modelCode의 시트 이름 `무풍 1way 냉방전용 실내기`가 있는 상태에서 `/admin/sheet-sync`의 `지금 동기화`를 실행한다.
4. 품목 검색 응답과 기존 문서 상세를 나란히 조회한다.

### 관측된 잘못된 결과

- 현재 PostgreSQL IT에서 실제 importer→sync 진입 경로가 마스터 이름을 `이카운트 최초명`에서 `시트 정본명`으로 **1/1 변경**한다. 현재 XML은 이 suite `3 tests / failures=0 / errors=0 / skipped=0`이다.
- 문서 라인은 product master를 재조회하지 않고 저장 당시 `productName`을 반환하므로 기존 문서 갱신은 **0건**이다. 위 절차에서 품목 1건당 현재 마스터와 기발행 문서 사이 이름 불일치가 1건 생긴다.
- 현재 공유 DB에는 활성 ECOUNT 계보 품목을 참조하는 활성 견적·전표·거래처주문 라인이 각각 **0건**이다. 따라서 “현재 DB에서 다음 sync가 즉시 바꾸는 기존 문서”는 0건이다. 결함은 신규 환경의 import-first 또는 ECOUNT 품목의 후속 시트 편입에서 재현된다.

### 파일:행 근거

- ECOUNT 임포트 사용자 endpoint: `services/product-service/src/main/java/com/samhanair/logis/product/web/EcountProductImportController.java:32-47`
- ECOUNT 이름 저장: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:425-465`
- 이름을 덮는 fix: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1274,1289-1292`
- 실제 rename: `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:438-440`
- 관리자 sync 사용자 경로: `clients/desktop/src/renderer/routes/admin/SheetSyncPage.tsx:134-142`, `clients/desktop/src/renderer/api/sheetSyncApi.ts:67-71`, `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductAdminController.java:64-72`
- 견적 이름 snapshot: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/domain/EstimateLine.java:25,94-101,139-148`
- 전표 이름 snapshot: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:63,142-149,176-189`
- 거래처주문 이름 snapshot: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:72,116-139`
- 기존 문서가 snapshot을 반환: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/dto/EstimateLineResponse.java:28-44`, `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipLineResponse.java:63-79`
- 이름 변경 실 PostgreSQL 경로: `services/product-service/src/test/java/com/samhanair/logis/product/it/EcountSheetOrderConvergenceIT.java:125-132,147-154`

---

## 결함 2 — `[HIGH-2]` 동명 병합이 다른 규격 SKU를 합치고 최초 파일 행으로 정본·입고가를 결정한다

### 실 사용자 경로

1. MASTER가 실 ECOUNT 파일 3종을 `/admin/products/imports/ecount`로 최초 적재한다.
2. importer가 exact 품목명이 같은 모든 정상 raw 행을 한 그룹으로 만든다.
3. 기존 대표 후보가 없는 12그룹은 `sameNameRows.get(0)`을 product 정본으로 저장하고 두 번째 행은 alias로만 남긴다.
4. 사용자가 데스크톱 안전재고·견적품목·전표 자동완성에서 두 번째 ECOUNT code를 검색한다.
5. 사용자 검색은 `products.name/model_name`만 보고 `product_aliases`를 보지 않으므로 두 번째 code는 검색 결과 0건이다. 내부 `lookup-by-code`는 그 code를 첫 번째 product로 바꿔 반환한다.

### 재현 절차

1. R4와 같은 SHA-256 `02785A731FCC502D8828ADA534DF103DC79BFDBB67D84A7142825AA323CE083C` 품목 파일에서 후보 없는 동명 12그룹의 두 행 순서를 각각 반전한 최초 임포트를 가정한다.
2. 원순서와 역순서에서 선택되는 canonical code, specification, inbound price를 비교한다.
3. 현재 라이브 사용자 검색 `GET /products?q=<code>&size=20`으로 12개 canonical code와 12개 secondary code를 각각 조회한다.
4. 대표 사례 `AAAA-00022`와 `AAAA-00023`을 비교한다.

### 관측된 잘못된 결과

- 실 raw **24행이 12 product로 축소**됐다.
- 12그룹 모두 규격이 서로 다르며, **12/12 canonical code·규격이 최초 행 순서에 따라 바뀐다.**
- **9/12 그룹은 입고단가까지 다르다.**
- 현재 라이브 사용자 검색은 canonical code **12/12 hit**, secondary alias code **0/12 hit**였다. `AAAA-00023`은 HTTP 200이지만 `totalElements=0`이다.
- `AAAA-00022`는 `저층용(2~8층) / 148,512원`, `AAAA-00023`은 `저층용(9층이상) / 247,521원`이다. 현재 정본은 첫 행 `AAAA-00022`이고 내부 lookup도 `AAAA-00023 → AAAA-00022`를 반환한다. 최초 파일 순서를 뒤집으면 정본 입고가가 **99,009원** 바뀐다.
- 현재 staging에서 fix의 전체 동명 병합 표면은 **164품목명 / 328행**이다. 그중 이번 결함으로 확정한 후보 없는 실 순서 의존 표면이 **12품목명 / 24행**이다.

### 파일:행 근거

- exact name 그룹화: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:90-99`
- 전 그룹을 한 candidate로 강제: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:124-148`
- 후보 없을 때 첫 행 선택: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:332-343`
- 선택 행의 규격·가격 저장: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:402-466`
- 나머지 code alias화: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:193-197,557-579`
- 사용자 검색이 alias를 보지 않음: `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:88-117`
- 데스크톱 실 사용자 검색: `clients/desktop/src/renderer/api/productApi.ts:39-60`, `clients/desktop/src/renderer/routes/SafetyStockAlertsPage.tsx:298`, `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:725-726,1469-1470`
- 실 raw 대표 사례: `D:\dev\Samhan-Public\docs\migration\ecount-data\raw\품목-Excel다운로드.csv:143-144`
- 12그룹 규격·단가 원문: `docs/dev-reports/2026-07-30-984-same-name-merge.md:155-168`
- R4 내부 lookup의 오수렴: `docs/qa/984-ecount-import-live/R4-REPORT.md:258-259,347-348`

---

## 각도별 판정

### 1. `p.rename(name)` 사용자 이름 변경

**FAIL — 결함 1로 도달한다.**

ECOUNT-first 품목이 같은 modelCode의 시트 행을 처음 만나는 순간 이름을 시트 이름으로 바꾼다. 현재 문서 라인은 의도적으로 snapshot을 저장하므로 이미 찍힌 이름은 갱신되지 않는다. 현재 공유 DB의 즉시 영향 행은 0이지만 import-first 정상 사용자 순서로 재현된다.

### 2. 동명 병합·파일 행 순서

**FAIL — 결함 2로 도달한다.**

“같은 이름”이 실제 같은 SKU라는 전제가 실데이터 12그룹에서 성립하지 않는다. 12/12 규격이 다르고 9/12 입고가가 다르다. 최초 파일 행이 정본을 정하며 secondary code는 사용자 검색에서 0/12다.

### 3. alias fallback

**현재 실데이터 PASS, 2개 경로는 판정불가.**

읽기 전용 실측:

| 항목 | 결과 |
|---|---:|
| 활성 alias | 2,835 |
| distinct 활성 alias code | 2,835 |
| 한 alias의 활성 중복 target | 0 |
| 활성 alias → soft-delete product | 0 |
| alias code와 다른 target의 활성 `product_code` 충돌 | 0 |
| R4 대상 alias / target product | 24 / 12 |
| staging alias와 product_aliases target 불일치 | 0 |

- 한 alias가 여러 활성 품목을 가리키는 것은 active alias 부분 unique index가 막는다: `services/product-service/src/main/resources/db/migration/V7__add_product_aliases_and_ecount_staging.sql:42-44`.
- 조회 우선순위는 직접 `product_code` 후 alias fallback이다: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:218-228`.
- importer가 기존 alias를 다른 product에 연결하려 하면 `MIG2_ALIAS_DUPLICATE`로 전체 transaction을 실패시킨다: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:565-578`.
- soft-delete alias는 repository 조회에서 제외된다: `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductAliasRepository.java:11`.

판정불가:

1. product 삭제는 alias를 함께 soft-delete하지 않는다: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:698-705`. 현재 dangling alias가 0건이고 write 금지라 실제 HTTP 결과를 만들지 않았다.
2. inventory 직접 `reserve-batch`는 alias로 product 성격만 확인한 뒤 실제 재고는 입력 alias 문자열로 조회한다: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:153-174`. alias-only 168개 중 serial-managed target은 143개지만 현재 `stock_instances=0`이고 데스크톱 호출자도 없어 실 사용자 오결과는 관측하지 못했다.

전표 수락은 line의 productId로 product를 재조회한 뒤 canonical `productCode`를 inventory에 넘기므로 현재 alias가 전표를 다른 품목으로 바꾸는 경로는 없다: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:867-881,1147-1152`.

### 4. 네 실행 순서 수렴

**원 R3 HIGH-2 상태축은 PASS.**

실 PostgreSQL XML에서 다음 세 순서는 모두 이름·lineage·productCategory·usageScope·HOME_MULTI exposure가 같은 SHEET 정본 상태로 끝났다.

| 순서 | 현재 결과 |
|---|---|
| `sync→import` | PASS |
| `import→sync` | PASS |
| `import→sync→import` | PASS |
| `sync→import→sync` | 정적 경로 PASS |

네 번째 순서는 첫 sync에서 이미 SHEET 이름·계보·분류·노출이 만들어지고, import는 `lineage='SHEET'` 행의 이름을 보존한다. 마지막 sync가 cache-hit이면 기존 SHEET 상태를 유지하고 exposure를 upsert하며, cache-miss여도 `promoteEcountToSheet()`가 false라 이미 확정된 SHEET 이름을 다시 바꾸지 않는다.

근거: `ProductSheetSyncService.java:1246-1352`, `EcountProductImporter.java:469-505`, `EcountSheetOrderConvergenceIT.java:101-154`.

### 5. 격리 cleanup 완전성

**현재 suite와 fixture 생성 표면에서 PASS.**

- cleanup 대상: `product_aliases`, `staging.ecount_item_alias`, `staging.ecount_item_raw`, relation/group staging, `product_estimate_exposure`, `price_history`, `products`.
- `product_spec`은 products 삭제의 `ON DELETE CASCADE`로 회수된다.
- `bundle_component`, `quantity_sync_source`, `quantity_sync_target`은 이 fixture가 만들지 않는다.
- 메모리 rowHash는 매 테스트 전 초기화된다.
- `ORDER_CONVERGENCE_%`의 `_`가 SQL LIKE 단일문자 wildcard이기는 하나, 현재 suite에 그 패턴으로 잘못 매칭되는 타 fixture는 없었다.
- product-service 전체 재실행 결과 `62 suites / 627 tests / failures=0 / errors=0 / skipped=0`, `BUILD SUCCESSFUL`, `13 actionable tasks: 13 executed`였다.

근거: `services/product-service/src/test/java/com/samhanair/logis/product/it/EcountSheetOrderConvergenceIT.java:42-99`, `services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:167-182`.

---

## 증거 무결성 대조

### 현재 R4 수치

| 주장 | 이번 라운드 재대조 | 판정 |
|---|---|---|
| lookup-by-code 24/24 HTTP 200 | 현재 실행 서비스에 24개 직접 재요청: 200=24, 404=0, other=0 | 일치 |
| 대상 alias 24개 | read-only DB count=24 | 일치 |
| 12그룹 각 1행 | read-only DB 12개 이름 모두 active count=1 | 일치 |
| 대상 staging 누락 없음 | 대상 24행 모두 `UPDATED`, `MERGED_SAME_NAME` reason 24 | 일치 |
| `skippedGroupCount=0` | R4 1·2차 응답 원문 모두 0; 현재 staging `SKIPPED_MAIN_CANDIDATE=0` | 일치 |
| 2차 임포트 멱등 | R4 원문 `imported=0`, active products/aliases 불변 | 원문 일치, write 재실행 안 함 |

`skippedGroupCount=0`은 현재 importer가 `0, List.of()`를 반환하므로 응답 필드 하나만으로는 독립 증거가 아니다: `EcountProductImporter.java:205-207`. 그러나 동일 source hash의 staging 2,836행에서 `SKIPPED_MAIN_CANDIDATE=0`, 대상 alias 24개, 12개 이름 각 1행을 별도로 대조했으므로 수치 모순은 없다.

R4 라이브 배포 증거의 source commit은 `b6e7b9448`이다: `R4-REPORT.md:43`. `b6e7b9448..HEAD`에서 importer와 ProductService가 바뀌지 않았으므로 HIGH-1의 24/24 증거는 HEAD에 승계된다. 이 R4 자료를 fix 3의 `p.rename` 런타임 증거로 사용하지 않았다.

### 전체 product-service

이번 라운드 직접 재실행:

```text
GRADLE_USER_HOME=D:\dev\Samhan-Public\.gradle-t25
.\gradlew.bat :services:product-service:test --rerun-tasks --no-build-cache --no-daemon --console=plain

BUILD SUCCESSFUL in 2m
13 actionable tasks: 13 executed
XML suites=62 tests=627 failures=0 errors=0 skipped=0
```

`docs/dev-reports/2026-07-30-984-ci-red-fix.md:109-120`의 수치와 정확히 일치한다.

### R3 EVIDENCE-1

**부분 해소.**

- 새 R4 보고서는 메인 트리 원본과 워크트리 복사본의 source/destination, bytes, SHA-256을 각각 기록했다: `docs/qa/984-ecount-import-live/R4-REPORT.md:116-151`.
- 그러나 구 보고서는 host/container 모두 `.gitkeep`만 출력한 직후 “위 3개 raw 파일을 읽기 전용으로 사용했다”고 적은 모순을 그대로 보유한다: `docs/dev-reports/2026-07-29-984-r4-product-lineage-verification.md:294-320`.

따라서 현재 R4 증거 체인은 수렴했지만 R3가 지적한 구 artifact 자체는 미정정이다.

---

## R3 결함 2건 해소 판정

| R3 항목 | 원 결함 해소 | 근거 | 재수렴 판정 |
|---|---|---|---|
| HIGH-1: 12그룹·24행 누락 | **해소** | skipped 0, alias 24, 12그룹 각 1행, lookup 24/24 200 | 대체 구현이 결함 2를 만듦 |
| HIGH-2: import/sync 순서에 따라 ECOUNT·NONE 고정 | **해소** | 세 순서 XML 3/3 PASS, SHEET 이름·lineage·분류·usage·exposure 일치 | 이름 승격이 결함 1을 만듦 |

즉, R3의 원 증상은 각각 없어졌지만 두 fix가 안전하게 수렴한 것은 아니다.

---

## CI 실패 5건 1:1 해소 판정

최종 HEAD `328ac7880`에서 다음 5건은 모두 현재 XML `failures=0 / errors=0 / skipped=0`으로 통과했다.

| # | CI 실패 테스트 | 현재 판정 |
|---:|---|---|
| 1 | `import_then_sync_converges_to_sheet_canonical_state()` | 해소 |
| 2 | `import_then_sync_then_reimport_converges_to_sheet_canonical_state()` | 해소 |
| 3 | `GET_products_displayOrder_정렬_보장()` | 해소 |
| 4 | `PUT_display_orders_usageScope_NONE_활성노출은_전체모수에서_제외_204()` | 해소 |
| 5 | `PUT_display_orders_정상경로_204_DB반영_및_목록순서_역전()` | 해소 |

suite 원문:

- `EcountSheetOrderConvergenceIT`: 3 tests, failures=0, errors=0, skipped=0
- `ProductCatalogControllerIT`: 38 tests, failures=0, errors=0, skipped=0

cleanup은 신규 순서 IT 3건의 데이터를 회수했고, 기존 controller IT 3건의 `ORDER_`/display-orders 결과를 더 이상 오염시키지 않는다.

---

## 이 라운드가 보지 않은 것

- 코드 수정, fix 제안 구현, 새 테스트 작성.
- git add/commit/push/checkout, 새 브랜치·Issue 생성.
- Docker stack 재배포·중단.
- 공유 DB write. 따라서 dangling soft-delete alias와 inventory alias 직접 reserve 후보는 실제 행을 만들어 재현하지 않았다.
- 게이트웨이 `/admin/products/**` 선재 404.
- Issue #1000 소관인 코드 규칙 전환과 이카운트 원본 병합.
- R3에서 이미 통과한 정상 726건 lookup, 실 전표 수락·재고 예약, 중간 실패 rollback, V27/V28 번호 충돌의 재실행.
- 현재 공유 DB에 즉시 대상이 0건인 ECOUNT 문서 snapshot 이름 불일치를 live write로 새로 만들지 않았다. 결함 1은 실제 importer/sync 경로, 문서 snapshot 저장·응답 경로, 정상 사용자 순서로 도달성을 확정했다.
