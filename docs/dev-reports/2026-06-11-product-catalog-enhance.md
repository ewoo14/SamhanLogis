# 품목관리 고도화 — 시드 전용 정책 + 세트 컬럼 + 구성품 편집기 + 표시 순서 직접 조정 + 설정 실시간 동기화

> 2026-06-11 슬라이스. PR #461. Branch `feat/product-catalog-enhance` (HEAD 691fb861), base `origin/main`.
> spec: `docs/superpowers/specs/2026-06-11-product-catalog-enhance-spec.md`.
> 결정 로그: `migration/decisions/DECISIONS.md` D-PCE-01 ~ D-PCE-07.

## 1. 배경

개발책임자 지시 (2026-06-11 새벽, 메모리 `project_item_exposure_and_menu_5cat` §1-보강):

> "구글 시트는 첫 시드 데이터고 추후 조회하지 않는데? 세트인지 아닌지 여부도 알아야하고 출처는 굳이 필요 없잖아. 세트인 품목은 해당 품목 상세에서 구성품 설정이 가능한지도 알고 싶고, 세트 품목을 전표에 넣으면 바로 구성품 자동 전개가 되는지도."

2차/3차 지시 (구현 중 수신):
> "재고의 경우 세트 단위로는 재고 표시하면 안됨 주의. 표시 순서도 수정할 수 있게 하되 수정시 다른 관련 품목의 표시 순서도 자동 갱신되어야함"
>
> "종합견적서 및 주문서 표시가 체크된 경우에만 표시순서를 표시하며, 품목뿐 아니라 모든 설정이 전표처럼 실시간표시 되기를 원함."

= 구글 시트를 **최초 시드 전용**으로 격하(자동 cron 비활성·출처 UI 제거) + 세트 가시화 + 구성품 직접 편집 + 표시 순서 직접 조정(카테고리 한정 자동 재번호) + 품목 설정 실시간 동기화(전표 SSE 패턴 재사용) + 세트 재고 표시 금지.

## 2. 변경 매트릭스 (함수 단위)

### 2a. BE product-service — 자동 sync 시드 전용 격하 (§1a, D-PCE-04)

| 파일 | 변경 (함수 단위) |
|---|---|
| `scheduler/ProductSheetSyncScheduler.java` | `@Value samhan.product.sheet-sync.cron-enabled`(기본 **false**) 게이트 추가. `scheduledSync()`·`onApplicationReady()` 둘 다 `cronEnabled` false 시 skip(부팅 sync 도 게이트 — 재시작마다 시트 재적재로 표시순서 소실 방지, P1-E). 수동 trigger(`POST /api/v1/products/admin/sync`)는 본 메서드를 거치지 않아 게이트 무관 항시 유효. |
| `service/ProductSheetSyncService.java` | sync displayOrder 보존 가드 **제거** — 시드 전용이므로 비상 재적재 시 시트 기준 재시드가 의도 동작(Javadoc 명시). manual 보존 가드·rowHash evict 는 #460 자산 유지. |
| `application.yml` (product) | `samhan.product.sheet-sync.cron-enabled: false` 기본 키 명시. |

### 2b. BE product-service — 세트 정보 노출 (§1b)

| 파일 | 변경 |
|---|---|
| `web/dto/ProductCatalogResponse.java` | record 에 `ProductType productType` + `int componentCount` 추가. `from(Product)`(componentCount=0 기본) + `withComponentCount(int)`(불변 교체) 신설. |
| `web/ProductCatalogController.java` `listProducts()` | 페이지 내 `productType=BUNDLE` UUID 집합 수집 → `BundleComponentRepository.countMapByBundleProductIds(IN)` 1쿼리로 componentCount 채움(N+1 방지, P2-2 — `searchByUsageScope` 가 반환한 `Page<Product>` 직접 사용해 행별 재조회 제거). SINGLE 은 0. |
| `repository/BundleComponentRepository.java` | `countMapByBundleProductIds(Set<UUID>)` 벌크 count + `findByBundleProductId`(ORDER BY display_order ASC NULLS LAST) 추가. |

### 2c. BE product-service — 구성품 CRUD (§1c, BUNDLE 전용)

신규 `service/BundleComponentService.java` (replace-all 패턴, #459 계좌 패턴 차용):

| 메서드 | 책임 |
|---|---|
| `listComponents(modelCode)` | 구성품 목록 조회. componentProductCode 명칭 벌크 join(1차 modelCode IN → 2차 modelName IN fallback, D-PCE-03 레거시 model_code null 행 표시 해소). BUNDLE 아니어도 빈 목록. read 전용 트랜잭션. |
| `replaceComponents(modelCode, requests, actor)` | 전건 검증 후 기존 전량 soft-delete → 신규 INSERT(배열 인덱스=1-based display_order). 검증: ① BUNDLE 아님 → 409 ② 부모 model_code null(전개 불능 죽은 세트) → 409(#7) ③ 빈 배열 → 400 ④ 자기 자신 포함 → 400 ⑤ 미해소 코드 → 400 ⑥ 구성품이 BUNDLE(세트-안-세트) → 400(#3) ⑦ 요청 내 중복 코드 → 400(P3-2, 부분 유니크 인덱스 선제 차단). 해소 검증 축 = `findByModelCodeAndIsDeletedFalse`(modelCode-only, expander 와 동일 — A fix: model_name fallback 저장 시 전표 전개에서 단가 0·productId null silent 방출 방지). soft-delete UPDATE 를 INSERT 전 `flush()`(P1-D, 부분 유니크 위반 방지). soft-delete actor=`X-User-Id`(null/blank→"system", P3-3). |
| `updateDisplayOrders(requests)` | §1d 표시 순서 일괄 갱신(아래 2d). |

`web/ProductCatalogController.java` 신규 endpoint:
- `GET /api/v1/products/{modelCode}/components` — products.list VIEW
- `PUT /api/v1/products/{modelCode}/components` — products.admin UPDATE
- `PUT /api/v1/products/display-orders` — products.admin UPDATE

DTO 신규: `web/dto/BundleComponentRequest`(@NotBlank code + `@DecimalMin 0.01 @DecimalMax 999.99 @Digits(3,2)` defaultQty — K fix NUMERIC(5,2) overflow 방지) / `BundleComponentResponse` / `DisplayOrderRequest`(@NotBlank modelCode + @NotNull displayOrder).

예외 컨벤션: 비즈니스 오류 전건 `BusinessException(ErrorCode)` 사용(`ResponseStatusException` 금지 — D-PCE-01). `web/GlobalExceptionHandler.java` 가 `BusinessException` httpStatus 매핑 + `DataIntegrityViolation→409`(#1 보조 방어).

### 2d. BE product-service — 표시 순서 직접 조정 (§1d, D-PCE-02)

`BundleComponentService.updateDisplayOrders(requests)`:
- 요청 내 중복 modelCode → 400(H fix, 마지막 값 덮어쓰기 방지).
- 전건 매칭 벌크화(#5 N+1 제거): 1차 `findByModelCodeInAndIsDeletedFalse` IN + 미해소분 `findByModelNameInAndIsDeletedFalse` IN. 요청 순서 보존 매칭, 미존재 1건이라도 있으면 404(전체 롤백).
- **카테고리 동일 검증 축 = `estimateCategory`**(D-PCE-02 + G fix): null 군은 null끼리 허용, null+non-null 혼합 → 400, 서로 다른 non-null → 400. (`findExposedCatalog` 는 실제로 `ProductCategory`(별개 enum)로 정렬하므로 '동일 차원' 문구는 G fix 로 제거 — 시트 적재분은 1:1 이나 markUsageManual override 시 desync 가능. display_order 충돌은 `findExposedCatalog` 의 `modelCode ASC` 타이브레이커로 결정.)
- 도메인 메서드 `Product.changeDisplayOrder` 재사용.

`repository/ProductRepository.java`: `findByIdForUpdate`(PESSIMISTIC_WRITE) + `findByModelCodeInAndIsDeletedFalse` / `findByModelNameInAndIsDeletedFalse` / `findByModelNameAndIsDeletedFalse` 벌크/단건 조회 추가.

### 2e. BE product-service — 설정 실시간 SSE (§2-2, D-PCE-05)

| 파일 | 변경 |
|---|---|
| `realtime/ProductCatalogChangePublisher.java` (신규) | publish 시점 통일 게이트웨이(P3-1). 활성 트랜잭션 있으면 `TransactionSynchronization.afterCommit()` 등록(롤백 시 미발화), 없으면 즉시 발화(컨트롤러 fallback). 채널 = `CATALOG_CHANNEL_ID`(well-known UUID `…0001`), 이벤트 = `product:catalog:changed`. 페이로드 `{event, modelCode?}` 최소 구조. |
| `realtime/ProductCatalogRealtimeController.java` (신규) | `GET /api/v1/products/catalog-realtime` — text/event-stream 구독(카탈로그 목록 채널, 30s heartbeat). products.list VIEW. 기존 productId 단위 `ProductRealtimeController` 와 달리 목록 전체 invalidate 채널 구독. |
| `BundleComponentService` / `ProductCatalogController.changeUsage`·`clearUsage` | usage PATCH/DELETE·components PUT·display-orders PUT 성공 시 `catalogChangePublisher.publishCatalogChanged()` 호출 → afterCommit 통일(롤백 헛이벤트 제거, P3-1). |
| 기성 `realtime/ProductRealtimeBroker`(SP-D7 shared realtime) | 재사용 — 신규 broker 도입 없음. |

### 2f. BE product-service — internal modelCode 일괄 조회 (#23)

| 파일 | 변경 |
|---|---|
| `web/ProductInternalController.java` | `POST /products/internal/lookup-by-model-codes` 신설(X-Internal-Token). `web/dto/LookupByModelCodesRequest`(@NotEmpty + @Size max 100). partner-order 상세 productType enrich 전용 — direct PUT 라인이 synthetic stableProductId 를 저장할 수 있어 productId 가 아닌 modelCode snapshot 으로 BUNDLE 여부 조회. |
| `service/ProductService.java` | `lookupByModelCodes(List<String>)` 추가. |

### 2g. BE migration — V15

`db/migration/V15__bundle_component_display_order.sql`:
- `bundle_component.display_order INTEGER` 추가(NULL 허용 + ORDER BY NULLS LAST).
- 기존 활성 행 `ROW_NUMBER() OVER (PARTITION BY bundle_product_id ORDER BY created_at, id)` backfill(결정적 초기값).
- `ix_bundle_component_order (bundle_product_id, display_order NULLS LAST) WHERE is_deleted=false` 부분 인덱스 신설.
- 잉여 `ix_bc_bundle`(V3, 단일 컬럼) DROP — 신규 인덱스가 prefix 상위호환(#15).

### 2h. BE partner-order — 주문 상세 productType enrich (#23 세트 재고 가드)

| 파일 | 변경 |
|---|---|
| `client/ProductClient.java` | `lookupByModelCodes(List<String>)` 추가(`/products/internal/lookup-by-model-codes` 호출, 1~100건, fail-soft 회로). 기존 `toProductSummary` 헬퍼로 추출 일원화(중복 제거). |
| `client/ProductSummary.java` | `modelCode` + `productType` 필드 추가. |
| `service/PartnerOrderQueryService.java` `getDetail()` | `resolveLineProductTypes(order)` 신설 — 라인 modelCode(라인 필드명상 modelName) distinct 수집 → `productClient.lookupByModelCodes` → `modelCode→productType` 맵. product-service 조회 실패 시 **fail-soft**(빈 맵, 전 라인 productType=null, 상세 가용성 우선). |
| `web/dto/PartnerOrderDetailResponse.java` | `from(order, Map<String,String> productTypeByModelCode)` 오버로드 — 라인별 modelCode snapshot 으로 productType 부착(빈 맵이면 enrich 없음, 기존 동작 동일). `LineResponse` 에 productType 필드. |

### 2i. BE slip — SlipLineResponse 세트 메타 노출 (5d3bb017)

`slip-service` `web/dto/SlipLineResponse.java`: `setHead` + `parentSetModel` 노출 추가. SlipDetail 전표는 `addSlipLinesExpanded` 로 BUNDLE 을 구성품 라인으로 **전개 저장**하므로 전표 라인에 BUNDLE 부모가 남지 않아 재고 가드 불필요(아래 FE 판정). 라인 식별 메타만 노출.

### 2j. FE desktop — ProductCatalogPage 전면 개편 (§2)

`src/renderer/routes/ProductCatalogPage.tsx`(+1084 라인):
- 출처 컬럼·'시트자동/수동' 뱃지·'시트 자동 복귀' 버튼 **제거**(#460 자산 무효화) — usage 토글·수동 마킹은 내부 동작으로 유지.
- **세트 컬럼**: BUNDLE 뱃지 + 구성품 수("세트 · 13"), SINGLE 은 "—".
- **구성품 편집 모달**: BUNDLE 행 '구성품' 버튼 → 현 구성 목록 + 행 추가(기존 q 검색 재사용)/삭제/수량/순서 → replace-all PUT. products.admin 게이트.
- **표시 순서 드래그**: `@dnd-kit/sortable` 행 드래그 → '순서 저장' 일괄 PUT. **견적/주문 노출 체크(usageScope ≠ NONE) 품목에만** 컬럼·드래그 표시(§2-2 3차), NONE 은 '—' + 정렬 제외. 검색/필터 활성 또는 카테고리 미선택 시 드래그 비활성(부분 목록 순서 모호 — 카테고리 한정에서만).
- **실시간 구독**: `realtime/ProductRealtimeClient.ts`(신규, `SlipRealtimeClient` 패턴 복제) 로 `/api/v1/products/catalog-realtime` SSE 구독 → `product:catalog:changed` 수신 시 react-query invalidate(동시 시청자 화면 실시간 갱신).
- `api/productCatalogApi.ts`: components GET/PUT·display-orders PUT 함수 + 타입 추가. `api/mock.ts`: 동형 핸들러 + 세트 시드(BUNDLE + 구성품) — BE 계약 1:1, 경로 선점 순서 주의.

### 2k. FE desktop — 세트 재고 가드 (§2-1, #23)

| 파일 | 변경 |
|---|---|
| `routes/components/InventoryLookupModal.tsx` | props `bundleOnlyLines?`(전부 세트 → 조회 대신 "세트 품목 — 재고는 구성품 단위" 안내) + `excludedBundleCount?`(혼합 선택 시 "세트 N건 제외" 캡션, P2-3) 추가. |
| `routes/SlipFormPage.tsx` | `selectedProductLines` 에 `productType` 동반 → `nonBundleLookupLines`(BUNDLE 제외) + `allSelectedAreBundle` + `selectedBundleCount`. 모달 열 때 스냅샷 확정(`stockBundleOnlySnapshot`·`stockExcludedBundleSnapshot`). |
| `routes/SalesPartnerOrderDetailPage.tsx` | `selectedOrderLines`(productType 동반) → `inventoryLookupLines`(BUNDLE 제외) + `allSelectedAreBundle` + `selectedBundleCount`. 수정 PUT 후 응답 setQueryData → `invalidateQueries`(GET 재조회)로 변경 — PUT 응답에 enrich 필드 누락 보정. modelCode→modelName 매핑(UUID 미노출). |
| `routes/SlipDetailPage.tsx` | 세트 가드 **불필요** 판정 명문화(5d3bb017/#23) — 신규 전표는 전개 저장으로 BUNDLE 부모 라인 부재(이미 구성품 단위 재고조회). 가짜 가드 금지 원칙. |
| `api/slip.ts`·`api/sales.ts` | 라인 응답 타입에 productType / setHead / parentSetModel 반영. |

### 2l. DevOps — 게이트웨이 라우트 3종

`services/api-gateway/src/main/resources/application.yml`:
- `product-components-v1` (`/api/v1/products/*/components`, no-strip) — specs 패턴과 세그먼트 달라 미매칭 → 전용 라우트.
- `product-display-orders-v1` (`/api/v1/products/display-orders`, no-strip) — strip=2 통과 시 컨트롤러 풀패스 매핑 불일치 → 전용 라우트.
- `product-catalog-realtime-v1` (`/api/v1/products/catalog-realtime`, no-strip) — SSE.
- 셋 다 `product-service-v1`(strip=2) **앞** 선언(우선순위). filters: JwtAuthentication.

### 2m. 테스트

| 파일 | 커버 |
|---|---|
| `product-service` `service/BundleComponentServiceTest.java` (722 라인) | replace-all 검증 분기(409/400 7종)·display-orders 카테고리 검증·중복·동시성·해소 축. |
| `product-service` `it/ProductCatalogControllerIT.java` (378 라인) | components GET/PUT·display-orders 실 HTTP 계약 + 권한. |
| `product-service` `web/ProductCatalogControllerComponentCountTest.java` | componentCount 벌크 채움. |
| `product-service` `scheduler/ProductSheetSyncSchedulerTest.java` | cron-enabled 게이트 skip. |
| `product-service` `it/ProductPermissionControllerIT.java` | 신규 endpoint 권한 갱신. |
| `partner-order-service` `it/PartnerOrderDetailIT.java` | 상세 productType enrich + ProductClient @MockBean. |
| `slip-service` `web/dto/SlipLineResponseTest.java` | setHead/parentSetModel 직렬화. |
| `api-gateway` `it/ApiGatewayContextLoadIT.java` | 컨텍스트 로드(라우트 3종 추가 회귀). |
| desktop Playwright | `product-catalog/product-catalog.spec.ts`(514 라인 갱신) + `bundle-set-options` + `product-catalog-enhance-real-qa/*`(세트 컬럼/구성품 왕복/순서 드래그/권한/세트 재고 가드). |

CI: `.github/workflows/ci.yml` slip 잡 필터 — 신규 slip 테스트 패키지 등재(`feedback_ci_test_filter_false_green` 가드).

## 3. 다모델 리뷰 경위 (4 라운드)

임시 워크플로우(`feedback_temp_multimodel_workflow`, 2026-06-11 개발책임자 임시 지시): Opus 계획/PR → Codex(GPT5.5) 구현 → **Opus 5-agent → Codex 5-agent → Fable5 5-agent → PM** 각 라운드 review+fix+게시.

| 라운드 | 리뷰어 | fix |
|---|---|---|
| 사이클1 | Opus/Codex 통합 | 확정 58건 fix(FE·BE 구성품 계약 1:1 정렬 + 메타 round-trip + 부팅 sync 게이트 + V15 순서 영속) + 실 QA 적발 3건(BusinessException 통일 409/400 + estimateCategory 검증 축 + model_name 2차 조회) + P3 3건(SSE afterCommit 통일 + 중복 구성코드 400 + soft-delete actor). |
| Round A | Opus 5-agent | 16 확정 fix — 해소축 정합·실HTTP 회귀가드·mock 정합. |
| Round C | Fable5 5-agent | CVE 핸들러·동시성 락(PESSIMISTIC_WRITE)·정렬 결정화·mock 정합·FE 페이지 버그 + #23 주문상세 세트(BUNDLE) 가드 완결. |
| Round B | Codex(GPT5.5) 5-agent | 8건 fix — #23 enrich modelCode 재작성·tiebreaker·sync 락·displayOrder paginate. |

각 라운드 fix 의 결함 코드(#1~#15, P1~P3, A~K, D-PCE-01~05)는 코드 Javadoc 에 박제. 통합 실서버 QA 증빙 12컷으로 처리(#461 1회 한정 예외 — 다음 슬라이스부터 라운드별 QA 스크린샷 게시 의무).

## 4. 실서버 QA (Docker, 12컷)

`docs/qa/product-catalog-enhance/` (실 게이트웨이 :8080 FE 화면, mock 미사용):
- T2(7컷): `t2-1-catalog-search` → `t2-2-modal-13-components`(구성품 모달 13행 GET) → `t2-3-edit-qty`(수량 1→2) → `t2-4-after-save`(PUT 200) → `t2-5-reopen-persisted`(재오픈 영속) → `t2-6-slip-bundle-line` → `t2-7-slip-detail-expanded`(전표 전개 라인 수량 2 반영 — 구성품 편집 ↔ 전개 round-trip 실증).
- 통합 보강(5컷): `cycle-set-column`(세트·13) / `cycle-usage-toggle`(usage PATCH 200) / `cycle-order-before`·`cycle-order-after`(표시순서 드래그 저장 PUT 204, 276건 백업 원복) / `cycle-bundle-stock-guard`(세트 재고 가드 안내).
- `screenshots/` 추가 증빙: `T1-catalog-bundle-badge` / `T3-category-selected-HOME_MULTI` / `T3-no-category-drag-disabled-caption` / `T5-warehouse-access-result` / `T7-B-before-toggle`·`T7-B-after-sse-update`(2-브라우저 SSE 실시간 실증).
- DB 완전 원복(구성품 FULL MATCH·순서 pristine·usage 복귀·QA 전표 삭제).

## 5. 신규/변경 endpoint 목록

| Method · Path | 권한 | 비고 |
|---|---|---|
| GET `/api/v1/products` | products.list VIEW | 응답에 productType + componentCount 추가(§1b) |
| GET `/api/v1/products/{code}/components` | products.list VIEW | 구성품 목록(§1c) |
| PUT `/api/v1/products/{code}/components` | products.admin UPDATE | replace-all(§1c) |
| PUT `/api/v1/products/display-orders` | products.admin UPDATE | 표시 순서 일괄(§1d) |
| GET `/api/v1/products/catalog-realtime` | products.list VIEW | 목록 레벨 SSE(§2-2) |
| POST `/products/internal/lookup-by-model-codes` | X-Internal-Token | modelCode 일괄(#23, partner-order enrich) |

## 6. 가드 적용

- BaseEntity 7 audit + Soft Delete only — ✓ 구성품 soft-delete(markDeleted actor), hard delete 없음.
- UUID 비공개 — ✓ 전 응답 modelCode/componentProductCode 기반, catalog-realtime 채널 UUID 는 well-known 내부 상수(사용자 미노출).
- 한국어 Javadoc + springdoc — ✓ 신규 service/controller/DTO 전건 한국어 주석, SSE/internal endpoint `@Operation`.
- 도메인 메서드 경유 — ✓ changeDisplayOrder / markDeleted / seed, setter·reflection 금지.
- 실시간 일반화 후속 — '모든 설정 화면'(공급자 설정 등) 실시간 전파는 본 슬라이스에서 패턴 확립 후 별도 슬라이스(메모리 박제).
- 비스코프 — order-app 카테고리 탭 노출 정책(개발책임자 확인 대기) / 메뉴 5대분류 / 사원 서명 등록(다음 슬라이스 순연).
