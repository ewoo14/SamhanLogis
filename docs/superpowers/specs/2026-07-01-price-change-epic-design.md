# #17 단가변동(Unit Price Change) 에픽 — 설계

> 2026-07-01 야간 자율. 개발책임자 지시(가장 누락됐던 에픽). 정찰 `ad252374`. **가격(돈) 정책 에픽 — 결정점은 권장방향 채택 + 본 spec 박제(오전 확인).**

## 핵심 결론 (정찰)
**#17 요구 인프라의 60~70%가 이미 존재 → 신규 구축이 아니라 통합·설정화·카테고리화.**
- `price_history`(V3) — `product_id`·**`effective_date`**·release_price·delivery_price·UNIQUE(product_id, effective_date). `PriceHistoryRepository.findApplicableLatest(productId, asOf)` 존재(**死코드 — 프로덕션 미배선, 테스트만**).
- estimate-app `index.ejs` — **'인상 전 단가' 카테고리별 토글 완성**(chkHomeInc/chkCommInc/chkSingleInc; 기본=인상후 현행, 체크=인상전 baseline=price_history@2000-01-01).
- order-app `index.html` — **날짜 자동전환 존재** `PRICE_INC_DATE='2026-04-01'`, `due≥날짜 → *_INC`. **단 DB-mode no-op**(`*_INC`=현행 카탈로그와 동일 가격 → 전환 무효).

## 현재 단가 흐름
- **견적**: estimate-app → product-service `/products/internal/estimate-catalog/*`. price=`Product.deliveryPrice`, list=`Product.releasePrice`(V3, *_단가인상 탭 sync=인상후 현행). 인상전=`/price-baseline`(price_history@2000-01-01). 할인=dc-config `PriceCalculationService`. **데스크톱 QuoteView/EstimateFormPage=별개 사내 간이견적(slip-service)=#17 렌더 대상 아님.**
- **주문**: order-app(거래처 발송) → partner-order-service `BootstrapService`(16키 incl *_Inc) → 동일 estimate-catalog. 영속=`PartnerOrderLine`(categoryKey: homemulti/singleSets/commercialMulti/oldProducts·priceVat·modelName 스냅샷). 확정=`PartnerOrderConfirmService`(Product.sellingPrice→dc-config). 견적→주문 변환=`PartnerOrderFromEstimateService`(단가 동결).

## 개발책임자 결정 (D1~D6 — 권장방향 채택, 오전 확인)
- **D1 카테고리 정의** = **EstimateCategory(홈멀티/싱글중대형/상업멀티/구형)** 권장 — 기존 토글·order categoryKey 일치. (vs ProductCategory 7종/per-SKU 기각.)
- **D2 변동 단위** = **카테고리별 단일 변동일**(요구 문구) 권장. 품목별 effective_date(price_history 입자)는 전/후 단가 저장에만 사용, 변동일은 카테고리 레벨.
- **D3 렌더 기본값(견적 출력)** = **인상 후(현행) 기본, '인상 전' 토글 유지**(estimate-app 현행 동작 보존) 권장. 카테고리별 토글 유지.
- **D4 변동일 기준 시점(주문)** = **납기일(due) 기준, KST 자정 경계 `>=`**(order-app 현행) 권장.
- **D5 견적↔주문 일관성** = **변환 시 단가 동결 유지**(현행, 재평가 안 함) 권장. 주문 신규 작성만 날짜 자동전환.
- **D6 D-IES-03 충돌** = 무충돌 확정 — #17="카테고리별 **변동일·전후 토글**"이지 "카테고리별 **가격**"이 아님([[project_basic_vs_estimate_item_separation]] D-IES-03 "단가 SKU 1개" 유지).

## 슬라이스 분해 (저위험·결정독립 우선)
- **S1 (BE 가격 모델, 결정 D1/D2 의존도 낮음 — 요구가 카테고리별 변동일로 명확):** ① `price_change_schedule` 경량 config 엔티티 신설(category·effective_date_kst, product-service 소관) + Flyway(fresh-postgres probe 의무) ② price_history "인상 후" row 보장(현재 "전"=2000-01-01만 적재 → 후 row 명시 적재) ③ `findApplicableLatest(asOf)` 또는 category-date as-of 해석을 endpoint 노출(`/price-as-of` 또는 `/price-baseline` 확장). **+ 기술부채: order-app `*_INC`가 진짜 후가격(price_history) 담도록 배선(no-op 해소).**
- **S2 (FE 견적 렌더, D3 의존):** estimate-app index.ejs 토글 = price_change_schedule 연동(현행 chk*Inc 재사용, 기본=후). 권장 기본값 적용 + PR에 D3 확인 요청.
- **S3 (주문 자동전환, D4 의존):** order-app `PRICE_INC_DATE` 하드코딩 제거 → bootstrap 카테고리별 변동일 주입 → `due`(KST) 카테고리별 비교. *_INC=실제 후가격.
- **S4 (관리 UI):** 견적품목 관리(`ProductCatalogPage`)에 카테고리별 변동일 + 전/후 단가 편집.
- **S5 (일관성, D5 의존):** 견적↔주문 전/후 의미 통일·변환/확정 경로 정책 확정.

## 리스크
- 🔴 order-app DB-mode no-op(*_INC=현행) → 진짜 후가격 배선 필수(S1/S3).
- 🔴 전/후 의미 불일치(estimate 기본=후·체크=전 vs order 기본=전·날짜후=후) → 통일(S5).
- 🟡 변동일 3중 하드코딩 단일진실원화 · findApplicableLatest 死코드 배선 · Product 단가필드 난립(sellingPrice vs release/delivery) 정리.
- 🟡 시트 sync 의존(price_history "전" 적재=beforeIncreaseTab) — 시트=시드전용 정책 정합.
- ⚠️ Flyway 추가 시 fresh-postgres probe([[feedback_migration_fresh_postgres_probe]]), enum/CHECK 동반([[feedback_enum_expansion_check_constraint]]).

## Testing
S1 BE IT(price_change_schedule·as-of 해석·price_history 전/후, Testcontainers) + ci.yml IT 필터 등재. S2/S3 라이브 QA(estimate-app/order-app 실 렌더·날짜전환). 마이그 fresh-probe.
