# #825 슬3 — 품목 자동완성 표준화 foundation (기획 spec)

- 에픽: #825 전역 입력 UX (슬3/7)
- 기준일: 2026-07-18
- 브랜치: `feat/825-s3-product-autocomplete` (base `main`)
- 진실원: 슬3 품목 정찰(본 spec §3 감사표) · 슬1/슬2(거래처) 동형
- 기획 모델: OPUS 4.8 · 품목 free-text 정찰 실측 기반

## 0. 개발책임자 결정

| # | 항목 | 결정 |
|---|---|---|
| D-S3-01 | ProductAutocomplete `getKey=product.id`(UUID) DOM 유출 제거 방식 | **A. DOM id/aria를 getKey와 분리(근본)** — AsyncAutocomplete가 `<li id>`·`aria-activedescendant`를 getKey 대신 **opaque index 토큰**으로 생성. getKey(UUID)는 React key + 선택 유일성만. 공유 base 변경(Partner도 DOM id code→index·동작 보존). **Partner 무회귀 적대검증 필수** |
| D-S3-02 | 슬3 스코프 | **foundation만** — ProductAutocomplete 하이라이트 ④ + getKey UUID fix + splitHighlightMatches 공용 hoist + 품목 감사 + (a) QA. (c)전환은 후속(슬1→슬2 동형) |
| D-S3-03 | (c)전환·필수화·co-edit·바인딩통일 | **후속 슬라이스 이관** — SlipDetail(수정)·EstimateForm·TransferForm·SalesPartnerOrderDetail의 plain→PA 전환 + productId 권위 통일 + 필수화 정책은 별도(무결성·co-edit 결합·착수 전 개발책임자 확인) |

## 1. 스코프 (foundation 4요소)

### ① design-system — AsyncAutocomplete DOM id/aria ↔ getKey 분리 (D-S3-01·근본)
- 현재: `AsyncAutocomplete.tsx` `<li id={`${listId}-${getKey(item)}`}>`(:517)·`aria-activedescendant={`${listId}-${getKey(candidates[activeIndex])}`}`(:454) → getKey 반환값이 DOM에 유입. ProductAutocomplete getKey=UUID → **UUID DOM 노출**([[feedback_uuid_no_user_visibility]] 위반).
- fix: DOM `<li id>`·`aria-activedescendant`를 **opaque index 토큰**(예 `${listId}-opt-${index}`)으로 생성. React key(`key=`)와 선택 매칭(value 비교·pick)은 getKey 유지. → UUID 근본 차단(Product) + Partner도 DOM id가 partnerCode→index(동작 보존).
- **⚠️ 공유 base 변경 → 전 소비처(Partner/Product/기타 AsyncAutocomplete) 영향**. Partner(슬1/슬2 방금 머지) 무회귀를 적대검증+ac-3 mock+라이브QA로 확증([[feedback_expanded_scope_reinstate_review]]).

### ② design-system — ProductAutocomplete 하이라이트 ④ + splitHighlightMatches 공용 hoist
- `splitHighlightMatches`(현 `PartnerAutocomplete/highlight.tsx` 로컬)를 **공용 위치로 hoist**(예 `components/AsyncAutocomplete/highlight.tsx` 또는 `utils/`) — Partner/Product 공유. Partner import 경로 갱신(무회귀).
- `ProductAutocomplete.renderOption`이 `context.query`+`splitHighlightMatches` 소비 → modelName/productName(및 modelCode) 부분강조 `<mark matchMark>` + 필드 배지. XSS-safe(literal substring·React children). matchMark AA(슬2 CM1 색쌍 `--color-warning-800`).

### ③ 품목 free-text 감사 (진실원 기록)
- §3 감사표를 dev-report로 박제. (a)즉시표준화/(b)정당 free-text/(c)후속이관 분류·근거·파일:라인. 슬2 표준화 시 각 화면 재감사가 진실원.

### ④ (a) 이미 PA 사용 화면 QA 확인
- SlipFormPage(출고/입고 작성 라인)·EstimateItemsCatalogPage(구성품·마스터 품목 추가) — foundation(하이라이트+getKey fix) 자동 상속. 라이브 QA 스샷(하이라이트+UUID 미노출 실증).

## 2. 품목 검색 API·현상 (정찰 확증)
- `productApi.searchProducts(q, {usageScope?})` → `ProductOption[]`{id:UUID, modelName, productName, sellingPrice, modelCode?, productType}. **BE `productCode`는 FE 미매핑(버려짐)**. 품목엔 단일 비-UUID 고유키 없음(modelCode nullable·modelName 동명) → D-S3-01 A안(DOM 분리)이 근본.
- ProductAutocomplete = AsyncAutocomplete wrapper. getKey=product.id·getInputLabel=modelName·renderOption 하이라이트 없음.

## 3. 품목 free-text 감사표 (요약)
- **이미 PA(무변경·foundation 자동상속)**: SlipFormPage(:1313·1394)·EstimateItemsCatalogPage(:893·1749).
- **(c) 후속이관**: SlipDetailPage(매출 :1994/2003·매입 :2256/2265 CollaborativeSlipInput)·EstimateFormPage(desktop :1716/1731·mobile :402/420 modelName onBlur lookup)·TransferFormPage(:223/238 plain onBlur lookup·co-edit 아님)·SalesPartnerOrderDetailPage(:1446/1456 modelCode).
- **(b) 정당 free-text**: ProductFormPage(마스터 생성)·ProductCatalogPage(목록필터)·EstimateItemsCatalogPage(:1689 목록검색)·InventoryAuditDetailPage(바코드/코드)·BundleOptionRow(세트옵션 modelCode)·SalesPartnerOrderListPage(통합검색)·InventoryStockBalance/DpsByProduct/HometaxExport(표 열 필터).
- **바인딩 불일치(후속 통일 대상)**: 작성=productId(SlipForm)·수정=modelName(SlipDetail)·주문수정=modelCode(SalesPartnerOrder).

## 4. 기존 결정 교차검증
| 규칙 | 슬3 준수 |
|---|---|
| UUID 사용자 비공개 [[feedback_uuid_no_user_visibility]] | D-S3-01 A안이 근본 해소(DOM id/aria opaque) — Product UUID DOM 노출 제거 |
| design-system 변경=Playwright mock [[feedback_design_system_playwright_mock_suite]] | ac-2(Product)·ac-3(Partner) mock 스위트 + 신규 Product 하이라이트/id-분리 회귀 게이트. 공유 base 변경이라 전 autocomplete 스펙 필수 |
| 범위 점증 시 리뷰 재가동 [[feedback_expanded_scope_reinstate_review]] | 공유 base 변경(Partner 영향)이라 정식 적대검증+Partner 무회귀 |
| CSS var 토큰 fallback [[feedback_css_var_token_not_fallback]] | matchMark AA 색쌍(슬2 CM1) 양테마 |
| 무결성 정책 pre-confirm [[feedback_integrity_domain_policy_preconfirm]] | (c)전환·필수화는 후속(D-S3-03)·착수 전 확인 |

## 5. 검증 계획
- **FE**: design-system vitest(highlight·ProductAutocomplete·AsyncAutocomplete id-분리 단위)·build·typecheck. desktop typecheck·vitest. **Playwright mock: ac-2(Product)·ac-3(Partner 무회귀)+신규 Product 하이라이트/UUID-미노출 회귀 게이트**.
- **라이브 QA**: 실 :8080·mock OFF. SlipFormPage 품목 자동완성 ④하이라이트+**DOM UUID 미노출 실증**(inspector/aria)+Partner 무회귀 스샷.
- **적대검증**: OPUS 4.8 5+agent → CODEX SOL 5.6 5+agent → **머지 전 재수렴**([[feedback_reconvergence_before_merge]]·2-model 단독신뢰 금지). Partner 무회귀 집중.

## 6. 리스크
- **공유 base 변경 blast radius**: AsyncAutocomplete id/aria 분리가 전 소비처(Partner 방금 머지·기타) 영향 → Partner ac-3+라이브QA 무회귀 필수. aria-activedescendant 참조 정합(스크린리더).
- 동명 품목 disambiguation(표시 품목코드/규격 병기)는 (c)/후속.
- splitHighlightMatches hoist 시 Partner import 경로·기존 테스트 갱신.

## 7. 팀 배치 (구현=CODEX LUNA 5.6)
- design-system: AsyncAutocomplete id/aria 분리 + splitHighlightMatches hoist + ProductAutocomplete 하이라이트 renderOption.
- FE(desktop): (a) 화면 QA 확인(코드 변경 0). 품목 감사 dev-report.

---
연관 Issue: #825
