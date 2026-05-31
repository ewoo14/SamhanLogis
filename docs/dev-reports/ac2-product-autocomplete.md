# 슬라이스 AC-2 — 품목 자동완성 (dev-report)

- **작성일**: 2026-05-31
- **브랜치**: `feat/ac-2-product-autocomplete`
- **spec**: `docs/superpowers/specs/2026-05-31-ac2-product-autocomplete-design.md`
- **이니셔티브**: 마스터데이터 자동완성 ②/3 (AC-1 창고 #331 후속, AC-3 거래처 예정).

## 1. 목표/배경
전표 작성(SlipFormPage) 품목 라인의 modelName 정확매칭 onBlur lookup → **부분입력 서버검색 autocomplete**. 품목 다수라 서버검색(debounced) — AC-1 WarehouseAutocomplete(client 소량 필터)의 async 변형.

## 2. 결정 (DECISIONS D-AC2-01~04)
- D-AC2-01 서버검색형 ProductAutocomplete(searchProducts 주입, design-system API 비의존).
- D-AC2-02 검색 = product-service `GET /products?q=`(name/model_name LIKE, 기존) → desktop searchProducts(q), 백엔드 무변경.
- D-AC2-03 LineRow optional `modelCell` slot(미제공 시 기존 input — backward compat).
- D-AC2-04 SlipFormPage 만 적용, productId 내부/표시 modelName·productName.

## 3. 변경 (커밋 `5e407438`)
- **design-system 신규** `ProductAutocomplete`(.tsx/.module.css/.stories.tsx) + export: debounce(250)·minChars·로딩/빈/에러·키보드 네비·**stale 응답 무시(seq)**·FormField·combobox 접근성. `ProductOption{id,modelName,productName,sellingPrice?}`.
- **LineRow** optional `modelCell?: ReactNode` slot(미제공 시 기존 modelName input 동작 보존).
- **desktop** `productApi.searchProducts(q)` → `GET /api/products?q=&size=20`(gateway StripPrefix=1 → product-service, `ApiResponse<Page<ProductSummaryResponse>>` → ProductOption 매핑). SlipFormPage 라인에 `modelCell={<ProductAutocomplete .../>}` 주입(onChange→productId/modelName/productName/unitPrice fill), 기존 handleModelNameBlur no-op. mock `GET /api/products?q=` 추가.
- **Playwright** `ac-2-product-autocomplete` spec(품목 부분입력→후보→선택→fill).

## 4. 함수 단위 문서
- `ProductAutocomplete`: 입력 debounce → `searchProducts(q)` async → 후보 listbox(modelName·productName) → `onChange(ProductOption|null)`. stale: 모듈 단조 seq + instance latestSeq ref 로 최신 query 응답만 반영. blur 미확정 시 더미 onChange 금지(AC-1 교훈).
- `desktop searchProducts(q)`: `/api/products?q=&size=20` → Page.content → ProductOption[]. 실패 시 빈 배열.

## 5. 테스트
- design-system typecheck 0 / lint 0 / build ✓ / Storybook 5종(검색/로딩/빈/에러/선택).
- desktop typecheck 0 / lint 0.
- Playwright `ac-2-product-autocomplete`(품목 입력→검색→선택→fill) — 리뷰/CI 에서 실행 검증.
- Docker 실 QA(머지 전): 실 전표 작성 품목 부분입력→실 검색 후보→선택→채움 실 캡처([[feedback_no_fake_data_ever]]).

## 6. 배포 / 후속
- design-system + desktop 빌드(백엔드/Flyway 무관).
- AC-3 거래처 자동완성. 견적/주문 등 다른 품목 폼. 공용 typeahead 추출(sync/async 변형 통합) 재평가.
