# 품목 등록/관리 고도화 슬라이스 — 스펙 (Codex-ready)

> 작성: 2026-06-15 (Opus 계획). 개발책임자 결정 기반. 다모델 워크플로우([[feedback_temp_multimodel_workflow]]) 착수.
> 관련 메모리: [[product-master-registration]] [[quotation-estimate-app-state]] [[project_serial_inventory_model]] [[feedback_enum_expansion_check_constraint]].

## 0. 배경·결정 (개발책임자 2026-06-15)
결정 #6(시드1회→DB원천)이 요구하는 **인앱 품목 관리 화면**의 본격 구현. 착수 순서 = 이 슬라이스 먼저, G1+G2(estimate-app 카탈로그 DB전환)는 다음.

**요구사항 4건:**
1. 품목 등록 시 **종류 3구분**: 일반품목 / 세트 / 세트구성품.
2. **세트구성품 등록 = 부모 세트 자동완성 검색 필수**. (표시정책: 견적서(기본)=세트명 1줄 / 견적서(세트상세)+출고전표=구성품 폭발 — 기존 estimate-app·`EstimateToSlipConverter` 구현, 본 슬라이스는 부모링크 보장만.)
3. **상품/비상품 구분**: 비상품(운임·영업수수료·설치비)=재고 미생성. 견적/전표 라인엔 사용 가능.
4. **자동완성 전역 표준**: 방향키 선택+Enter, 모든 자동완성 일관.

## 1. 현재 상태 (조사 확정 — 중복 회피)
- ❌ **품목 등록 폼 없음**: `clients/desktop/src/renderer/routes/ProductCatalogPage.tsx` = 관리 전용(목록·노출토글·구성품편집·표시순서). 신규 생성 UI/`POST /products` 호출 없음.
- 🟡 **`POST /products` 존재하나 DTO 빈약**: `ProductController.java:126-133` + `web/dto/CreateProductRequest.java`(name/modelName/categoryId/sellingPrice/purchasePrice/currency/tags/description만). `ProductService.create`(`service/ProductService.java:296-317`)는 `productType` default(SINGLE) 고정 → **수기로 세트/구성품/분류 지정 불가**.
- 🔁 **구성품 편집 방향 반대**: `ProductCatalogPage.tsx` `ComponentsModal`(L313-676)는 "BUNDLE 행 클릭 → 그 안에서 자식 구성품 검색·추가"(`componentsModalCode=row.modelCode`). 요구는 "구성품 등록 화면에서 부모 세트 검색"(역방향).
- 🆕 **상품/비상품 게이트 없음**: `Product.java` 에 `inventoryQtyMgmt`(Boolean, 死필드·아무도 안 읽음)·`productBusinessType`(문자열, eCount 메타) 존재하나 재고 판정 미사용. 실제 재고 추적 = `Category.serialManaged`(개별시리얼 vs batch)뿐 — 비상품(재고 0) 개념 전무.
- 🆕 **운임/수수료/설치비 카탈로그·카테고리 전무**.
- ✅ **`AsyncAutocomplete`(design-system) 방향키 이미 완비**: `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:228-256`(ArrowDown/Up/Enter/Escape + activeIndex 하이라이트 + aria-activedescendant). 래퍼 `ProductAutocomplete`/`PartnerAutocomplete` 가 이를 사용. → 요구 #4 = **표준 일원화(audit)**, 신규 구현 아님.
- ✅ **세트↔구성품 매핑 완비**: `BundleComponent`(bundle_product_id ↔ component_product_code, component_kind INDOOR/OUTDOOR/PANEL/REMOTE/MATERIAL/FOOT/ACCESSORY). 실데이터 368 부모 + 1885 구성품.

## 2. 설계

### A. 품목 종류 3구분 + 세트구성품 부모링크 (product-service)
- **모델링(신규 enum 최소화)**: 종류는 `(productType, 부모 BundleComponent 링크 유무)`로 표현.
  - 일반품목 = `productType=SINGLE`, 부모링크 없음.
  - 세트 = `productType=BUNDLE`.
  - 세트구성품 = `productType=SINGLE` + **부모 세트 BundleComponent 링크 필수** (+ `productCategory` *_PART, `usageScope=NONE` 권장).
- **`CreateProductRequest` 확장**: `itemKind`(GENERAL/SET/SET_COMPONENT, request 전용)·`productCategory`·`bundleMode`(SET만)·`parentSetModelCode`(SET_COMPONENT 필수)·`componentKind`(SET_COMPONENT)·`unit`·`releasePrice`·`deliveryPrice`·`goodsType`(아래 B) 추가.
- **`ProductService.create` 확장**: itemKind 매핑 — SET→`product.changeBundle(BUNDLE,bundleMode)`; SET_COMPONENT→SINGLE 생성 후 `BundleComponentService` 로 부모 세트(parentSetModelCode→부모 BUNDLE product id 해석)에 component 링크 생성. **검증**: SET_COMPONENT 인데 parentSetModelCode 없거나 미해소/부모가 BUNDLE 아님 → 400. (자기참조·BUNDLE-in-BUNDLE 기존 `BundleComponentService` 검증 재사용.)
- **`UpdateProductRequest`/`PATCH`**: 종류·분류·부모링크 수정 허용(세트구성품↔일반 전환 시 링크 정리).

### B. 상품/비상품 + 재고 게이트 (product-service + inventory-service)
- **신규 enum `ProductGoodsType { GOODS, NON_GOODS }`** + `Product.goodsType`(NOT NULL, default GOODS). 死필드 `inventoryQtyMgmt` 재활용 대신 명시 필드(의미 명확).
- **마이그레이션 V__**: `ALTER TABLE products ADD COLUMN goods_type VARCHAR(16) NOT NULL DEFAULT 'GOODS'` + **CHECK(goods_type IN ('GOODS','NON_GOODS'))** ([[feedback_enum_expansion_check_constraint]] 의무) + 기존 backfill='GOODS'. **fresh Postgres probe 검증 의무**([[feedback_migration_fresh_postgres_probe]]).
- **비상품용 카테고리 시드**: `Category` 신규 1건(code 예: `SERVICE`, name "서비스/요금", `serialManaged=false`) — 운임/수수료/설치비 등 비상품 품목의 NOT NULL category FK 충족. V 시드 마이그 또는 seeder.
- **재고 게이트 3지점** (`services/inventory-service`):
  - `service/StockInstanceService.java:68-80 create` + `:100-129 inboundBatch` — `serialManaged` 체크 인근에 `!summary.goods()` → 거부/skip.
  - `service/StockService.java:66-83 inbound` — `productClient.requireExists(...)` 직후 **비상품이면 lot/balance 생성 skip**(현재 게이트 전무 → 핵심 추가).
  - `inventory/client/ProductSummary.java` + product-service `web/dto/ProductSummaryResponse.java:94`(serialManaged 매핑 인근)에 **`goods` boolean 전파**(`goodsType==GOODS`). serialManaged 배선 패턴 그대로 복제.
- **견적/전표 라인은 비상품 허용**(재고만 차단) — slip/estimate 라인 입력 경로 무변경 확인.

### C. 품목 등록/수정 폼 (desktop FE)
- **신규 `routes/ProductFormPage.tsx`** (`/products/new`, `/products/:modelCode/edit`) 또는 `ProductCatalogPage` 내 등록 모달. 필드:
  - **종류 라디오**(일반품목/세트/세트구성품) — 선택에 따라 조건부 필드.
  - 세트구성품 선택 시 → **부모 세트 필수 자동완성**(`ProductAutocomplete` 를 BUNDLE 필터로, 또는 신규 `SetAutocomplete`). 미선택 시 저장 차단(필수 검증).
  - **상품/비상품 토글**.
  - category·name·modelCode·unit·releasePrice·deliveryPrice 등.
- **api client**: `api/productCatalogApi.ts`(또는 `productApi.ts`)에 **create/update 함수 신규**(현재 부재) → `POST /api/v1/products`, `PATCH /api/v1/products/{id}`.
- **route + 권한**: `routes/index.tsx` 라우트 + `PermissionGuard products.admin`(CREATE/UPDATE). 목록 화면에 "품목 등록" 버튼(canAccess 가드).
- UUID 비노출(modelCode/name만). react-query invalidate(목록·카탈로그 realtime).

### D. 자동완성 전역 표준 (audit + 마이그레이션)
- `AsyncAutocomplete` 는 이미 방향키 완비 → **task = ad-hoc 자동완성 발굴 + 표준 이관**.
- **audit 범위**(desktop renderer): typeahead/검색-suggest 류 전수 grep(`autocomplete`, `suggest`, `onKeyDown`+검색, 거래처/품목/사원 검색 인라인). `AsyncAutocomplete`/`ProductAutocomplete`/`PartnerAutocomplete` 미사용 + 자체 방향키 없는 곳을 표준 컴포넌트로 이관.
- estimate-app(EJS, GAS 이식 vanilla JS)은 **별 스택** — 본 슬라이스는 desktop React 한정. (estimate-app 자동완성은 G1+G2/별도.)
- 발굴 결과는 PR 본문에 목록 게시(누락 0 — [[feedback_defect_family_sweep_fix]]).

## 3. 구현 순서 (Codex)
1. BE-A/B: `ProductGoodsType` enum + `Product.goodsType` + V 마이그(CHECK)·비상품 카테고리 시드 → fresh Postgres probe.
2. BE-A: `CreateProductRequest`/`UpdateProductRequest` 확장 + `ProductService.create/update` 종류·부모링크·검증.
3. BE-B: `ProductSummary(Response)` goods 전파 + inventory 게이트 3지점.
4. FE-C: ProductFormPage + 부모세트 자동완성 + 상품/비상품 토글 + api create/update + route/권한.
5. FE-D: 자동완성 audit + 표준 이관.
6. 테스트: BE 단위/IT(세트구성품 부모필수·비상품 재고차단 실HTTP), FE(폼 검증·mock), estimate/slip 라인 비상품 회귀 무손상.

## 4. 테스트·QA (no-fake [[feedback_no_fake_data_ever]])
- **BE IT(실 HTTP/Testcontainers)**: ① 세트구성품 생성 시 parentSetModelCode 누락→400 / 정상→BundleComponent 링크 검증. ② 비상품 품목 입고 시 재고(StockLot/Balance·StockInstance) 미생성 검증(StockService.inbound + StockInstanceService). ③ 상품 품목은 정상 재고 생성(회귀).
- **마이그**: fresh Postgres probe(goods_type CHECK + 비상품 카테고리 seed) push 전 직접 적용.
- **Docker 실서버 QA**(라운드별 스크린샷 [[feedback_temp_multimodel_workflow]]): 게이트웨이 :8080 + dev_master. ① 일반품목/세트/세트구성품 각 등록(세트구성품=부모 자동완성 방향키 선택 캡처). ② 비상품(예: "설치비") 등록 + 입고 시도 → 재고 안 잡힘 화면. ③ 자동완성 방향키 동작 캡처.
- desktop typecheck(`npm run typecheck` [[feedback_desktop_typecheck_command]]) + 변경 모듈 전체 test 완주([[feedback_changed_module_full_test_before_push]]).

## 5. 위험·미결
- **세트구성품 "단독 노출 X"** = usageScope NONE 기본. 단 일부 구성품이 단독 판매도 되는 경우 처리(개발책임자: 종류로 분리 — 단독은 일반품목으로 별도 등록). 현 설계는 SET_COMPONENT=usageScope NONE 고정.
- **수기 등록 ↔ 시트 sync 충돌**: 시트 sync 는 기본 비활성(부팅/수동만)이라 충돌 적음. 단 수동 sync 실행 시 수기 등록 품목 보호 필요 시 `usageScopeManual` 류 보호 플래그 패턴 검토(P2).
- **비상품 라인 단가/세금 흐름**: slip/estimate 라인이 품목 마스터 필수 참조인지 자유텍스트 가능인지 — 비상품 라인 VAT/단가 표시 확인(스코프 경계, 필요시 후속).
- 품목 종류 `itemKind` 영속 안 함(파생) — 목록에서 "세트구성품" 필터는 BundleComponent 참조 쿼리. 명시 컬럼 필요성 대두 시 추가.
