# 품목 등록/관리 고도화 — 개발 리포트 (PR #485)

> 2026-06-15 회사 PC 세션. 개발책임자 결정 기반. 다모델 워크플로우(Opus 계획/PR → Codex 개발 → Opus 5-agent → Codex 5-agent → PM 머지).
> 관련: 스펙 `docs/superpowers/specs/2026-06-15-product-master-registration.md`, 메모리 [[product-master-registration]].

## 1. 배경·결정
결정 #6(시드1회→DB원천)이 요구하는 **인앱 품목 관리 화면** 본격 구현. 착수 순서 = 이 에픽 먼저, G1+G2(estimate-app 카탈로그 DB전환) 다음.

**개발책임자 결정**:
- 품목 종류 **3구분**(일반품목/세트/세트구성품), 세트구성품 등록 시 **부모 세트 자동완성 검색 필수**.
- 상품/비상품 구분 — **비상품(운임·영업수수료·설치비)=재고 미생성**(견적/전표 라인엔 사용 가능).
- 자동완성 **방향키 선택 전역 표준**.
- 세트구성품 정의 = 부모 세트 종속(usageScope NONE). 단독 판매는 일반품목 별도 등록. 표시 = 견적기본(세트명)/견적상세+출고전표(구성품 폭발, 기존 구현).
- 라운드1 fix 시: **P1-2 inventory 게이트 = no-op skip(최소)**, **modelCode = 불변**.

## 2. 구현 (BE)
### Part A — 종류 3구분 + 세트구성품 부모링크 (product-service)
- `ProductItemKind`(GENERAL/SET/SET_COMPONENT, 요청 전용 enum, DB 미영속 — productType + BundleComponent 링크로 변환).
- `CreateProductRequest`/`UpdateProductRequest` 확장: itemKind, productCategory, bundleMode, parentSetModelCode, componentKind, unit, releasePrice, deliveryPrice, goodsType.
- `ProductService.create/update`: 종류 매핑 — SET→productType BUNDLE(+bundleMode), SET_COMPONENT→SINGLE + 부모 세트 `BundleComponent` 링크 생성(+usageScope NONE), GENERAL→SINGLE 무부모. 종류 전환 시 링크 추가/교체/제거.
- `BundleComponentService.addRegisteredComponent`/`replaceRegisteredComponentLink`/`removeRegisteredComponentLinks`: 세트구성품 부모 필수 검증(누락/미해소/비BUNDLE → 400).

### Part B — 상품/비상품 + 재고 게이트 (product-service + inventory-service)
- `ProductGoodsType`(GOODS/NON_GOODS) + `Product.goodsType`(NOT NULL default GOODS).
- **V16 마이그**: `goods_type` 컬럼 + `CHECK(goods_type IN (GOODS,NON_GOODS))` + 비상품 카테고리 시드(code=SERVICE, 서비스/요금, serial_managed=false).
- `ProductSummary`(inventory)/`ProductSummaryResponse`(product) `goods` boolean 전파(serialManaged 배선 패턴).
- inventory 게이트 — 비상품이면 **재고 미생성 no-op skip**(개발책임자 결정): `StockService.inbound`/`adjust`, `StockInstanceService.create`/`inboundBatch`. (reject→skip: 전표 전환 루프가 비상품 라인을 보내도 전표 전체가 깨지지 않게 graceful.)

## 3. 구현 (FE — desktop)
### Part C — 품목 등록/수정 폼
- 신규 `ProductFormPage`(`/products/new`, `/products/:modelCode/edit`, PermissionGuard products.admin) + `productFormModel`(순수 매핑 + vitest 5건).
- 종류 라디오(일반/세트/세트구성품), 세트구성품 선택 시 **부모 세트 자동완성 필수**(`ProductAutocomplete`, BUNDLE 필터), 상품/비상품 토글.
- `productCatalogApi` create/update(`POST/PATCH /api/products`) + ProductCatalogPage 등록/수정 버튼 + mock 핸들러.

### Part D — 자동완성 전역 표준
- 공용 `AsyncAutocomplete`(design-system) 이미 방향키(↑↓/Enter/Esc + activeIndex 하이라이트) 보유 → ad-hoc 자동완성 일원화. EstimateFormPage·TaxInvoiceFormPage partner suggest → `PartnerAutocomplete` 이관. audit: Slip/Groupware/DocumentReferencePicker 이미 표준 확인.

## 4. 리뷰·QA (다모델)
- **Opus 5-agent 리뷰**(BE-product/inventory/FE-form/FE↔BE계약/CI-docs): P1 2건(등록 405 경로·비상품 게이트 reject) + P2(수정모드 라운드트립·SET 고아·modelCode·문서) 적출.
- **P1 fix(Opus)**: 경로 `/api/products` + inventory no-op skip(+테스트3).
- **QA Docker 실서버**: 라운드1 — `POST /api/v1/products` 405 확정(mock 위장, 실서버 단독적발). 라운드2 — product-service 재빌드(+V16) 후 `POST /api/products` GENERAL/NON_GOODS **201 생성**(category=서비스/요금 SERVICE 라이브). 데스크톱 UI 시각캡처는 본 환경 electron-vite dev 미서빙으로 불가(정직 보고) — 캡처 spec `playwright/product-registration-real-qa/` 커밋(대화형 환경 캡처용).
- **Codex 5-agent 라운드**: 수정모드 라운드트립·SET 고아·InboundInspection 게이트·modelCode 교차 fix.

## 5. 검증
- gradle BUILD SUCCESSFUL(product+inventory 컴파일+모듈 전체 테스트). V16 fresh Postgres probe + 실서버 201. desktop typecheck + vitest 49.

## 6. 후속
- 데스크톱 UI 실 스크린샷(대화형 환경). estimate-app(종합견적서) 연계 시 비상품 라인 처리. 수기 등록 ↔ 시트 sync 보호 플래그(P3).
