# #825 슬3 — 품목 자동완성 표준화 foundation (기획 spec · CODEX 기획검수 반영)

- 에픽: #825 전역 입력 UX (슬3/7)
- 기준일: 2026-07-18
- 브랜치: `feat/825-s3-product-autocomplete` (base `main`)
- 진실원: 슬3 품목 정찰(§3 감사표) · 슬1/슬2(거래처) 동형 · CODEX SOL 기획검수 6-BLOCKING 반영

## 0. 개발책임자 결정

| # | 항목 | 결정 |
|---|---|---|
| D-S3-01 | AsyncAutocomplete DOM/ARIA 식별자에 도메인 식별자 결합 제거 | **A. DOM id/aria를 getKey와 분리(opaque index)** — ⚠️**신규 방어심층화 결정**(기존 UUID 규칙은 화면/입력/tooltip 노출만 금지·React key/hidden input 허용이라 DOM id 결합은 명시 위반 아님. 본 결정으로 "DOM/ARIA 식별자에도 도메인 식별자 미사용" 신설). **범위=AsyncAutocomplete 계열 DOM 식별자 결합 해소**(전역 UUID 근본해소 아님). getKey(값 무관·UUID 가능)는 React key+선택 매칭만 |
| D-S3-02 | 슬3 스코프 | **foundation만** — AsyncAutocomplete DOM 분리 + ProductAutocomplete 하이라이트 + splitHighlightMatches 공용 hoist + 품목 감사 + 이미-PA 화면 QA |
| D-S3-03 | (c)전환·필수화·co-edit·바인딩통일 | **후속** — SlipDetail(수정)·EstimateForm·SalesPartnerOrderDetail plain→PA + productId 권위 + 필수화(무결성·co-edit·착수 전 확인) |
| D-S3-04 | WarehouseAutocomplete UUID-DOM(별도 구현·`Warehouse.id`가 aria/id 유입) | **후속 분리** — 별도 컴포넌트라 이번 foundation(AsyncAutocomplete)과 별개. 추적 이슈 등록 |
| D-S3-05 | TransferFormPage 분류 | **(a) 후속 전환 대상** — co-edit 아님·onBlur exact lookup으로 이미 productId 바인딩(`:97·107·231`). 최저마찰 (a) 전환이나 foundation 경계로 이번 defer |

## 1. 스코프 (foundation 4요소)

### ① design-system — AsyncAutocomplete DOM id/aria ↔ getKey 분리 (D-S3-01)
- 현재: `AsyncAutocomplete.tsx` `<li id={`${listId}-${getKey(item)}`}>`(:517)·`aria-activedescendant`(:452-455)가 getKey 유입. ProductAutocomplete getKey=UUID·Warehouse는 별도.
- fix: **`optionDomId(index)` 단일 helper**(`:100-101` listId 인접) 도입 — `<li id>`·`aria-activedescendant`가 `${listId}-opt-${index}`(opaque·**기존 접두사 `ds-aac-list-`/listId 보존**해 #809 selector 무회귀). **보존**: React key(:513-516)·선택 동일성/aria-selected(:520·526)·pick(:529)·keyboard activeIndex(:316-340). input과 활성 옵션이 동일 `optionDomId(activeIndex)` 참조 → 스크린리더 정합.
- **getKey 유일성 계약 명시**(주석+단위테스트): getKey 중복 시 React key 충돌·이중 selected — 소비자가 유일성 보장(Product=UUID 유일). 계약 문서화.
- 계약 주석(:33) 갱신. `TaxInvoiceFormPage.partner-contract.test.tsx:206` "partnerCode getKey로 DOM id 구분" 주석 갱신(거짓화).

### ② design-system — ProductAutocomplete 하이라이트 ④ + splitHighlightMatches 단일 공개 export
- **hoist(단일 export 전략)**: 구현 파일을 공용 위치로 이동, **Partner barrel이 재-export**(기존 외부 import `DocumentReferencePicker.tsx:2` 보존), **Async barrel/루트는 중복 export 금지**(루트 심볼 정확히 1개). 순수 함수라 순환참조 없음. Partner 내부 import 경로 갱신.
- ProductAutocomplete `renderOption`이 `context.query`+splitHighlightMatches 소비 → **강조 대상=서버 검색 대상 `modelName`·`productName`만**(모델코드는 서버 검색 미대상·`ProductRepository:88·93-108`), 배지 "모델명"/"품목명". matchMark AA 색쌍(슬2 CM1). modelCode/productCode 표시·검색은 후속 계약 확장.

### ③ 품목 free-text 감사 (진실원)
- §3 감사표를 dev-report 박제. taxonomy: **이미표준화/QA-only** / (a)즉시전환 / (b)정당 free-text / (c)문서작성·필수화 후속. 후속 슬라이스 ID·수용조건 명시.

### ④ 이미-PA 화면 QA
- SlipFormPage(:1313·1394 desktop/mobile)·EstimateItemsCatalogPage(:893·1749) — render override 없어 하이라이트+DOM 분리 **코드 변경 0 자동 상속**. 라이브 QA(하이라이트+DOM UUID 미노출 실증).

## 2. 품목 검색 API·식별자 현황 (정찰+검수 확증)
- `productApi.searchProducts` → `ProductOption`{id:UUID, modelName, productName, sellingPrice, modelCode?, productType}. BE `productCode` FE 미매핑.
- **식별자 사실(정정)**: 활성 `model_name` UNIQUE(`V1:54`)·활성 non-null `model_code` UNIQUE(`V3:47`)·`product_code` UNIQUE(`V5:44`). modelName은 고유하나 **가변 비즈니스값+전 AsyncAutocomplete 통용키 아님** → DOM 식별자를 getKey와 분리(D-S3-01)가 옳음. "동명 품목"은 productName 중복으로 정정.

## 3. 품목 free-text 감사표 (요약·검수 반영)
- **이미표준화(QA-only)**: SlipFormPage·EstimateItemsCatalogPage(foundation 자동상속).
- **(a) 즉시전환(후속)**: TransferFormPage(:223/238·co-edit 아님·onBlur lookup productId — D-S3-05).
- **(c) 문서작성/필수화(후속)**: SlipDetailPage(매출 :1994/2003·매입 :2256/2265)·EstimateFormPage(:1716/1731·mobile :402/420)·SalesPartnerOrderDetailPage(:1446/1456 modelCode). 전부 co-edit/필수화.
- **(b) 정당 free-text**: ProductFormPage(마스터 생성)·ProductCatalogPage(목록필터)·EstimateItemsCatalogPage(:1689)·InventoryAuditDetailPage(바코드)·**BUNDLE 자동 전개 modelCode 입력 계약(`slip.ts:232`, picker 제거 후에도 품목 master 자유입력 아님)**·SalesPartnerOrderListPage(통합검색)·**TaxInvoiceFormPage itemName(mobile :137·desktop :663-668)**·**ArologisManualDispatchPage 품목메모(:671·771-785·BE schema 부재)**·재고표 열 필터.

## 4. 기존 결정 교차검증
| 규칙 | 준수 |
|---|---|
| UUID 사용자 비공개 [[feedback_uuid_no_user_visibility]] | D-S3-01은 **신규 방어심층화**(DOM/ARIA에도 도메인식별자 미사용)·기존 규칙 위반수정 아님으로 정정 |
| design-system 변경=Playwright mock [[feedback_design_system_playwright_mock_suite]] | §5 회귀 매트릭스(5 소비처+ARIA 단위) |
| 범위 점증 리뷰 재가동 [[feedback_expanded_scope_reinstate_review]] | 공유 base→5 소비처 무회귀 적대검증 |
| CSS 토큰 AA [[feedback_css_var_token_not_fallback]] | matchMark 색쌍 양테마 |
| 무결성 pre-confirm | (c)·필수화 후속(D-S3-03) |

## 5. 검증 계획 (회귀 매트릭스 — 공유 base 5 소비처)
- **직접 소비처 5**: Product(`ProductAutocomplete:71`)·Partner(`:107`)·ApprovalLineConfig(`:784`)·GroupwareApprovalCreate(`:506`)·JournalForm(`:106`).
- **Playwright mock 게이트**: ac-2(Product)·**ac-3+ac-4(Partner 무회귀)**·**journal-form-dropdown**·**groupware 결재작성·결재선설정**·**#809 자동완성 selector 회귀**·신규(Product 하이라이트·DOM UUID/업무키 미노출).
- **AsyncAutocomplete 단위테스트**: `aria-activedescendant`가 실제 활성 `role=option` 지시·ID에 UUID/업무키 없음·Enter가 정확 객체 pick·getKey 유일성.
- **FE**: DS vitest/build/typecheck·desktop typecheck/vitest.
- **라이브 QA**: 실 :8080·SlipForm 품목 ④하이라이트+**DOM UUID 미노출 실증**+Partner 무회귀.
- **적대검증**: OPUS 5+agent → CODEX SOL 5+agent → 머지 전 재수렴(2-model 단독신뢰 금지 [[feedback_reconvergence_before_merge]]). **Partner/5소비처 무회귀 집중**.

## 6. 리스크
- 공유 base blast radius(5 소비처·Partner 방금 머지) → 전 소비처 회귀 게이트 필수. 라이브 스샷만으론 DOM/ARIA 증명 불가 → 단위테스트 단언.
- getKey 중복(소비자 유일성 계약) 명시.

## 7. 팀 배치 (구현=CODEX LUNA 5.6)
- design-system: AsyncAutocomplete optionDomId 분리 + splitHighlightMatches hoist(단일 export) + ProductAutocomplete 하이라이트(modelName/productName) + 단위테스트.
- FE: 이미-PA 화면 QA. 품목 감사 dev-report.

---
연관 Issue: #825
