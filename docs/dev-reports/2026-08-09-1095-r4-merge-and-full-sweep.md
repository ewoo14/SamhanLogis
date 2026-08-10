# PR #1133 R4 — main 병합 및 품목 상태 축 전수 재검증

- 작업 브랜치: `feat/1095-sheet-product-status`
- 시작 HEAD: `3c3c8b0db`
- 병합 기준: `origin/main` (`fef1d58cd`, PR #1152 비상품 품목 포함)
- 검증일: 2026-08-09 KST

## 결론

`#1152`의 비상품 축(`goodsType`)과 #1133의 상태 축(`ProductStatus`)을 함께 반영했다. 후보 목록은 `DISCONTINUED`/`NOT_FOR_SALE`를 제외하되 `OUT_OF_STOCK`을 남기고, 수량 입력은 `OUT_OF_STOCK`에서 잠금·`품절` 표시가 되도록 연결했다. 품절 BUNDLE은 전개 호출을 하지 않아 사용자 경로에서 `/slips/expand-line` 500에 도달하지 않는다.

## 충돌 7건 해소

1. `clients/desktop/src/renderer/api/productApi.ts`: `status`와 `goodsType`, `usageScope`, `estimateCategories`, `productCategory`를 `ProductSummaryResponse`/`ProductOption`에 모두 매핑했다. #1152의 검색 페이지 메타데이터(`ProductSearchResults`)도 유지했다.
2. `clients/desktop/src/renderer/api/productApi.search-modal.test.ts`: 상태 선택 판정 테스트와 #1152의 전체 건수/절단 여부 테스트를 합쳤다.
3. `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`: `usageScope=ESTIMATE`, `size=50`, 상태 후보 필터를 함께 사용한다. 선택 결과에는 goodsType과 status를 모두 보존한다.
4. `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx`: 상품/비상품 필드와 상태 필드를 모두 보존했다.
5. `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductCatalogResponse.java`: record 생성자와 `withComponentCount`에 `goodsType`과 `status`를 모두 포함했다.
6. `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`: main의 `ExternalWriteTracker`/`updatedRows` 계약을 채택하고, 시트 상태가 비어 있지 않을 때만 `changeStatus`를 실행했다. 따라서 표기 없는 시트 행은 기존 상태를 덮지 않는다.
7. `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`: main의 `ProductLineage`, 노출 repository 계약과 #1133의 `ProductStatus` 시나리오를 합쳤다. main에서 제거된 hash-cache API 호출은 제거했다.

Flyway는 main의 `V33` 다음에 브랜치의 `V34__expand_product_statuses.sql`이 오도록 번호를 유지했다.

## 축 A — 후보 목록을 만드는 곳: 현재 grep 원문

실행:

```text
rg -n --glob '!docs/**' --glob '!**/node_modules/**' "searchProducts\\(|ProductAutocomplete|isSelectableProductStatus" clients services
```

핵심 원문:

```text
clients/desktop/src/renderer/api/productApi.ts:123:export function isSelectableProductStatus(status?: string | null): boolean {
clients/desktop/src/renderer/api/productApi.ts:124:  return status !== 'DISCONTINUED' && status !== 'NOT_FOR_SALE'
clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1118:    const candidates = (await searchProducts(q, { usageScope: 'ESTIMATE', size: 50 }))
clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1119:      .filter((candidate) => isSelectableProductStatus(candidate.status))
clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:105:    if (!isSelectableProductStatus(product.status) || product.productCategory === 'MATERIAL') return false
clients/desktop/src/renderer/routes/SafetyStockAlertsPage.tsx:... searchProducts(query) ... isSelectableProductStatus(product.status)
clients/desktop/src/renderer/routes/SlipFormPage.tsx:... searchProductsApi(q, { usageScope: 'PARTNER_ORDER' }) ... isSelectableProductStatus(candidate.status)
clients/web/order-app/src/samhanApi.ts:413:        return status !== 'DISCONTINUED' && status !== 'NOT_FOR_SALE'
services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:287:AND p.status NOT IN (...DISCONTINUED, ...NOT_FOR_SALE)
```

판정: 축 A의 `OUT_OF_STOCK`은 서버 query와 FE predicate 모두에서 살아 있으며, 단종·미판매는 안전재고·견적품목·견적·판매전표 후보 경로에서 제거된다. `ACTIVE`는 동일 predicate에서 제거되지 않는다.

## 축 B — 수량 입력을 받는 곳: 현재 grep 원문

실행:

```text
rg -n --glob '!docs/**' "onQuantityChange|quantity|OUT_OF_STOCK|품절" clients/desktop/src/renderer/routes clients/web/design-system/src/components/LineRow
```

핵심 원문:

```text
clients/web/design-system/src/components/LineRow/LineRow.tsx:... const isOutOfStock = line.status === 'OUT_OF_STOCK'
clients/web/design-system/src/components/LineRow/LineRow.tsx:... disabled={isOutOfStock}
clients/web/design-system/src/components/LineRow/LineRow.tsx:... 수량${isOutOfStock ? ' 품절' : ''}
clients/desktop/src/renderer/routes/SlipFormPage.tsx:392:disabled={props.line.status === 'OUT_OF_STOCK'}
clients/desktop/src/renderer/routes/SlipFormPage.tsx:403:aria-label={`라인 ${props.lineNumber} 수량${props.line.status === 'OUT_OF_STOCK' ? ' 품절' : ''}`}
clients/desktop/src/renderer/routes/EstimateFormPage.tsx:2261:readOnly={Boolean(isReadOnly) || line.status === 'OUT_OF_STOCK'}
clients/desktop/src/renderer/routes/EstimateFormPage.tsx:2288:aria-label={`라인 ${i + 1} 수량${line.status === 'OUT_OF_STOCK' ? ' 품절' : ''}`}
```

판정: 공용 desktop LineRow, 모바일 전표 수량 input, 견적 협업 수량 input을 모두 잠금 대상으로 확인했다. 각 지점의 접근성 label과 옆 status text에 `품절`을 표시한다.

## F3 귀속 및 조치

`git diff --name-only origin/main...HEAD` 원문에는 `services/slip-service/**`가 없다. 따라서 `/slips/expand-line`의 500을 발생시킨 slip-service/product-service 전개 경로 자체는 이 PR 선재 결함이다. 다만 사용자에게 도달하는 품절 선택 경로는 이번 라운드에서 닫았다. 품절 상태를 선택 결과에서 라인으로 보존하고, `SlipFormPage`가 `OUT_OF_STOCK` BUNDLE에 대해 `expandSelectedBundle`을 호출하지 않는다. 단일 품목은 전개 없이 품절 수량 잠금 상태로 남는다.

## RED-A~E

- RED-A: `DISCONTINUED`/`NOT_FOR_SALE` 0건 후보. `ProductRepository`의 `NOT IN` + FE `isSelectableProductStatus` + 안전재고/견적품목 필터 확인.
- RED-B: `OUT_OF_STOCK` 후보는 유지되고, LineRow·모바일 전표·견적 입력에서 disabled/readOnly 및 `품절` 표시 확인.
- RED-C: 품절 BUNDLE 선택 시 `/slips/expand-line` 호출을 차단. 품절 선택은 500 대신 현재 라인에 유지.
- RED-D: `OUT_OF_STOCK` predicate 결과 `true`, `ACTIVE` predicate 결과 `true`; `ACTIVE` 오차단 0건 계약 테스트 통과.
- RED-E: DTO/API/Autocomplete에 `goodsType`을 상태와 함께 유지. #1152의 비상품 선택·납품가 입력 수량 자동 1 배선은 main 변경 그대로 보존.

## G 시트 상태 공란 불변식

`ProductSheetSyncService`는 `ProductStatus.fromSheetDisplay(...).orElse(null)`을 사용하고, `sheetStatus != null`일 때만 `changeStatus`한다. 공란 행은 기존 상태를 덮지 않는다. `ProductSheetSyncServiceIT`의 단종 상태 후 공란 재동기화 검증을 통과했다.

## 검증 결과

```text
design-system: npm run build                         PASS
design-system: npm run typecheck                     PASS
desktop: npm run typecheck                           PASS
desktop 관련 Vitest 5 files / 174 tests             PASS
design-system LineRow/ProductAutocomplete 45 tests  PASS
product-service service tests                        PASS
product-service ProductSheetSyncServiceIT + EstimateCatalogInternalControllerIT PASS
```

## 신규 파일 목록

이번 R4에서 새로 만든 구현 파일은 없다. 신규 산출물은 이 보고서 1개다. `V34__expand_product_statuses.sql` 및 기존 R3 QA 파일은 병합 전 브랜치에 이미 존재했고, main 병합으로 추가된 다른 파일은 #1152/main의 기존 산출물이다.

## 못 한 것

- 실제 운영 backend를 대상으로 한 Playwright 캡처/실서비스 QA는 로컬 테스트 범위에서 실행하지 못했다. 기존 QA 스펙은 존재하지만 이번 라운드에서 credential/서비스 기동을 전제로 실행하지 않았다.
- `services/slip-service`의 전개 구현 자체는 `origin/main...HEAD` 변경 범위 밖인 선재 코드라 수정하지 않았다. 사용자 도달 경로는 desktop에서 차단했다.
