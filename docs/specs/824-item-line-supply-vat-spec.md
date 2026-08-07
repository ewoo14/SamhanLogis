# [기획서] T3 — Issue #824 품목행 공급가액·부가세 열 추가 (자동계산 우선·편집 가능)

- 작성: OPUS 4.8 기획 단계 (캐논 워크플로우 1단계)
- 기준 main: `4892b1c0d` · 열린 PR 0
- 상태: **기획(구현 코드 0)**. 모든 정찰은 실제 파일 확인 기반이며, 미확인 항목은 "미확인" 으로 표기했다.

---

## 0. 요약 (3줄)

1. 현행 시스템은 이미 **라인 단위 공급가액·부가세를 저장·표시**하고 있다(전표 `slip_lines` V12, 견적 `estimate_lines` V13/V35). 없는 것은 **편집 가능성**과 **편집 시 권위 전환 규칙**뿐이다.
2. 현행 계산 방향은 **`단가(VAT포함) → 합계 → 공급가액 = round(합계/1.1) → 부가세 = 합계 − 공급가액`** 이고, 개발책임자 결정 ①은 **`공급가액 → 부가세 = round(공급가액×0.1) → 합계 = 공급가액 + 부가세`** 다. **두 방향은 반대**이므로 "편집한 열이 권위" 를 **라인별 권위 상태(authority)** 로 모델링해 공존시킨다.
3. 4개 편집 경로 모두에서 마지막 정의가 `T = S + V` 또는 `V = T − S` 이므로 **항등식은 FE 에서 정의상 깨질 수 없다**. 결정 ②의 "저장 차단" 은 **BE 방어선**(변조 payload·구 클라이언트·FE 버그)에서만 발동한다.

---

## 1. 적용 화면 범위 확정 (최우선)

### 1-1. 품목행 그리드 전수 정찰 결과 (실측 — 각 파일 직접 열람)

| # | 화면/컴포넌트 | 경로 | 현행 라인 열 | 편집 가능? | 이번 범위 |
|---|---|---|---|---|---|
| 1 | 전표 작성(출고/입고) | `clients/desktop/src/renderer/routes/SlipFormPage.tsx` (363행 `vatInclusive`) | design-system `LineRow` 10열. 합계셀 안에 `공급 N · VAT N` **소표시** | 단가만 | ✅ **포함(핵심)** |
| 2 | design-system 라인행 | `clients/web/design-system/src/components/LineRow/LineRow.tsx` (184~191행 `computeVatBreakdown`) | 10-col grid, 합계셀 read-only | ✕ | ✅ **포함(핵심)** |
| 3 | 전표 상세 + 편집 | `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` (3232~3246행) | 자체 `<table>` 에 **공급가액·부가세 열 이미 존재**(read-only) | 인라인/모달 편집 = **VAT 제외 공급단가** | ✅ **포함(핵심)** |
| 4 | 견적 작성 | `clients/desktop/src/renderer/routes/EstimateFormPage.tsx` (1601~1630행) | **자체 8열 그리드**(design-system LineRow 미사용). `단가(VAT포함)/합계(VAT포함)` | 단가만 | ✅ **포함** |
| 5 | 견적 모바일 카드 | `EstimateMobileLineCard`(EstimateFormPage 내부) | `lineIncl/lineSupply/lineVat` prop 수신 | ✕ | ✅ **포함** |
| 6 | 견적 상세 | `clients/desktop/src/renderer/routes/EstimateDetailPage.tsx` (265~285행) | 공급가액·부가세 열 **이미 존재**(read-only) | ✕ | ✅ **포함(표시 정합만)** |
| 7 | 세금계산서 발행 | `clients/desktop/src/renderer/routes/TaxInvoiceFormPage.tsx` (99~105, 302~309, 622~623행) | 공급가액·부가세 열 **이미 존재**(자동계산, `Math.trunc`) | ✕ | 🚫 **제외** — 아래 1-3 |
| 8 | 회계 매출/매입전표 작성 | `routes/accounting/SalesAccountingSlipFormPage.tsx` · `PurchaseAccountingSlipFormPage.tsx` | **품목행 그리드 아님** — `SlipLineAllocationEditor`(배분 편집기). `taxType`(TAXABLE 등) 보유 | 배분금액 | 🚫 **제외** |
| 9 | 주문 라인(회계 admin) | `routes/accounting/admin/OrderDetailPage.tsx` (47~79행) | read-only `DataTable`, 부가세 열 있음 | ✕ | 🚫 **제외** |
| 10 | 판매 주문 상세 | `routes/SalesPartnerOrderDetailPage.tsx` / BE `PartnerOrderLine.java` | 라인에 `priceVat`(VAT포함 단가) + `subtotal` **만**. 공급/부가세 라인 분해 **부재** | — | 🚫 **제외** — 아래 1-2 |
| 11 | 분개 라인 | `routes/JournalFormPage.tsx` + design-system `JournalLineRow` | 차변/대변 — 품목행 아님 | 편집 O | 🚫 **제외** |
| 12 | 웹 종합견적서(GAS) | `clients/web/estimate-app/` | 별도 스택 | — | 🚫 **제외** |
| 13 | 모바일 앱 | `clients/mobile/src`, `clients/mobile-staff/src` | `공급가액`/`VAT포함단가` grep **0매치**(실측) — 품목행 VAT 그리드 부재 | — | 🚫 **제외** |

> 🚫 grep 0매치를 부재로 단정하지 않았다: #13 은 grep 0매치 + `clients/mobile*` 디렉토리에 전표 작성 라우트 자체가 없음을 목록으로 확인. 그럼에도 **"모바일 라인 그리드 완전 부재" 는 확정이 아니라 "이번 정찰 범위에서 미발견"** 으로 표기한다.

### 1-2. 주문(#10) 제외 근거 — 스키마 신설이 필요해 범위 확대

`services/partner-order-service/.../domain/PartnerOrderLine.java` 실측(64~124행):

```
private int quantity;
@Column(name = "price_vat", ...) private BigDecimal priceVat;   // VAT 포함 단가
private BigDecimal subtotal;                                     // = priceVat × quantity
```

라인에 `supply_amount` / `vat_amount` 컬럼이 **없다**. 주문에 열을 붙이려면 **partner-order-service 신규 Flyway 마이그레이션 + DTO + DC 적용 재계산(priceVat 는 dc-config-service 서버 계산 결과)** 까지 번져 별도 슬라이스 규모가 된다. → [[feedback_throughput_parallel_scope_freeze_batch]] ②범위 동결에 따라 **이번 슬라이스 제외 · 후속 이슈 등록 권고**.

### 1-3. 세금계산서(#7) 제외 근거

- 이미 공급가액·부가세 열이 **존재하고 자동계산**된다 → 이슈 #824 의 결핍(열 부재)이 이 화면엔 없다.
- 편집 가능화 = 국세청 발행 데이터 직접 수정 → **무결성 도메인**([[feedback_integrity_domain_policy_preconfirm]]) 이며 착수 전 개발책임자 선확인 대상. 이번 배치 결정(2026-07-19)에 세금계산서 라인 편집 허용은 포함되지 않았다.
- ⚠️ 다만 **결함 후보 1건 발견**: `TaxInvoiceFormPage` 는 `Math.trunc`(내림)를, 전표/견적/BE 는 `HALF_UP`(반올림)을 쓴다(99~105행 vs `SlipLine.createFromVatInclusive` 203행). 또 헤더 부가세를 `trunc(총공급 × 0.1)`(305행)로 **총합에서 한 번** 계산해 라인별 합과 어긋날 수 있다. → **범위 외 결함 · PM 자율 이슈 등록**([[feedback_fix_in_current_pr_no_split]] 범위 외 처분 규칙). 이번 PR 에서 고치지 않는다.

### 1-4. ✅ 확정 범위

> **전표(작성·상세/편집) + 견적(작성·상세)** — 단일 BE 서비스 `slip-service` 로 닫힌다.
> 제외: 주문 · 세금계산서 · 회계 매출/매입전표(배분) · 분개 · 웹 GAS · 모바일 앱.

이 경계는 [[feedback_expanded_scope_reinstate_review]] 상 **BE 1개 서비스 + FE 2개 도메인** 으로 유지되며, T1(#868 design-system/groupware) 과는 design-system 패키지에서만 접점이 생긴다(9절 참조).

---

## 2. 정찰 결과 (실측 — 경로·행번호 기록)

### 2-1. FE 계산 지점

| 파일 | 행 | 실측 내용 |
|---|---|---|
| `clients/web/design-system/src/components/LineRow/LineRow.tsx` | 184–191 | `computeVatBreakdown`: `incl = round(q×p)`, `supply = round(incl/1.1)`, `vat = incl − supply` |
| 〃 | 10–20, 333–343 | `.module.css` grid **10 컬럼**(checkbox/drag/lineNo/model/product/spec/qty/price/sum/delete) |
| 〃 | 415–428 | 합계셀 = 합계(VAT포함) + `공급 N · VAT N` 소표시(2줄, fontSize 10) |
| `clients/desktop/src/renderer/routes/SlipFormPage.tsx` | 141–142 | `incl = round(q×p)`, `supply = round(incl/1.1)` |
| 〃 | 363 | `<LineRow vatInclusive ... />` |
| 〃 | 798–810 | `totals` = 라인별 반올림 후 합산 |
| 〃 | 854–855 | 제출 시 `priceVatInclusive: true` 고정 |
| `clients/desktop/src/renderer/routes/EstimateFormPage.tsx` | 1627–1630 | 동일 공식(자체 그리드) |
| 〃 | 795–796, 1317 | totals 라인단위 합산 · 제출 `priceVatInclusive` |
| `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` | 3232–3246 | 상세표 `공급가액`/`부가세` 열(read-only), `unitPriceWithVat` 있으면 VAT포함 표시 |
| `clients/desktop/src/renderer/utils/vatPrice.ts` | 84–109 | `vatInclusiveOf`(×1.1 scale2 HALF_UP) / `vatExclusiveOf`(÷1.1 scale0 HALF_UP) — BigInt 십진 연산 |
| `clients/desktop/src/renderer/routes/EstimateDetailPage.tsx` | 265–285, 714–720 | 공급가액/부가세 열 + 합계박스 |

### 2-2. BE 도메인 (slip-service)

`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java`

| 팩토리 | 행 | 계산 |
|---|---|---|
| `create` (공급단가) | 111–127 | `lineTotal = qty×unitPrice`; `supplyAmount = lineTotal`; `vatAmount = supplyAmount×0.1`; `unitPriceWithVat = unitPrice×1.1` ← **결정 ④가 "정확한 모델" 이라 한 그 경로** |
| `createFromVatInclusive` | 193–214 | `lineInclVat = round(qty×unitPriceWithVat, 0 HALF_UP)`; `supply = round(lineInclVat/1.1, 0 HALF_UP)`; `vat = lineInclVat − supply`; **`lineTotal = supply`**; `unitPrice = supply/qty (scale2)` |
| `copyOf` | 243–253 | 권위 4값(lineTotal/supply/vat/unitPriceWithVat) 원본 승계 |
| `restoreAuthoritativeAmounts` | 276–290 | 스냅샷 캡처값 승계(재계산 드리프트 차단). **이번 슬라이스가 재사용할 선례 API** |

`services/slip-service/.../estimate/domain/EstimateLine.java`

- 182–183: VAT포함 경로 `supplyAmount = supply(scale2)`, `vatAmount = incl − supply`
- 215–218: 일반 경로 `supplyAmount = unitPrice×qty`, `vatAmount = supplyAmount×VAT_RATE(0.10)`, **`lineTotal = supplyAmount + vatAmount`**

> 🚨 **핵심 비대칭 (실측 확정)** — **전표 `lineTotal` = 공급가액(VAT 미포함)** 이고 **견적 `lineTotal` = 공급 + 부가세(VAT 포함)** 다. 결정 ②의 항등식을 `lineTotal` 컬럼에 그대로 걸면 **전표의 모든 기존 라인이 즉시 저장 차단**된다. 4절에서 항등식 대상을 FE 표시 합계 `T` 로 명시 분리한다.

### 2-3. BE 호출 경로

| 경로 | 파일:행 | 사용 팩토리 |
|---|---|---|
| 전표 생성/라인추가/세트전개 | `service/SlipService.java:165,167,197,199` | `priceVatInclusive` 플래그로 분기 |
| **매출 전표 PUT 수정** | `service/SalesSlipUpdateService.java:221` | **`SlipLine.create`**(VAT 제외 공급단가) |
| **매입 전표 PUT 수정** | `service/SlipUpdateService.java:221` | **`SlipLine.create`** |
| 견적 생성/수정 | `estimate/service/EstimateService.java` | `priceVatInclusive` 분기 |
| 견적→전표 변환 | `EstimateToSlipConverter` | `unitPriceWithVat != null` 이면 `createFromVatInclusive` 재생성 |

### 2-4. 요청/응답 DTO

- `web/dto/CreateSlipRequest.java`, `AddLineRequest.java` — `priceVatInclusive` 플래그 보유. **`supplyAmount`/`vatAmount` 수신 필드 없음**.
- `web/dto/SlipUpdateRequest.java` — `LineRequest(productId, productName, modelName, specification, quantity, unitPrice, note, lineId)` + `lineIdContract` 계약 마커(D-R8-9, `LineIdContractGate`). **VAT 필드 없음**.
- `web/dto/SlipLineResponse.java:63`, `estimate/web/dto/EstimateLineResponse.java:40` — 응답에는 supply/vat/unitPriceWithVat 노출 중.

### 2-5. 무결성 소비처 (항등식 파급)

| 소비처 | 파일:행 | 사용값 |
|---|---|---|
| 헤더 총액(정리/서명) | `SlipCleanupService.java:117`, `SlipSignatureService.java:207` | `lineTotal` 합 |
| 판매조회 응답 | `SlipSalesQueryResponse.java:96` | `lineTotal` 합 |
| 🚨 전표 요약 | `web/dto/SlipSummary.java:65–71` | `totalWithVat = unitPriceWithVat × quantity` **(재계산)** |
| 회계 전환 | `accounting-service/.../SalesAccountingSlip.java:95–97`, `PurchaseAccountingSlip.java:94–96` | 라인 `supplyAmount`/`vatAmount` 합 |
| 세금계산서 | `accounting-service/.../TaxInvoiceLine.java:178,197` | `sourceLine.getSupplyAmount()/getVatAmount()` 승계 |
| 홈택스 내보내기 | `HometaxExportService.java:482–500` | supply/vat |
| 부가세 신고서 | `report/VatReportService.java:82–87` | supply/vat 합 |

> 🚨 **`SlipSummary.totalWithVat` 는 저장된 합계를 쓰지 않고 `unitPriceWithVat × quantity` 로 재계산한다.** 사용자가 공급가액을 편집해 `unitPriceWithVat` 가 파생 소수값이 되면, 이 재계산이 저장 합계와 ±원 단위로 어긋날 수 있다 → **이번 슬라이스가 반드시 고쳐야 할 슬라이스 내부 결함**(5-4).

---

## 3. 기존 결정 교차검증 ([[feedback_spec_cross_check_prior_decisions]])

| 기확정 결정 | 출처(실측) | 본 기획과의 관계 | 판정 |
|---|---|---|---|
| **D-R4-3 서브-원(sub-KRW) 드리프트 수용** | `docs/dev-reports/2026-07-15-809-partner-product-price-memory.md:286, 972, 1041` | 공급가액 편집 → `unitPrice = S/Q`(scale 2) 파생에서 원 미만 잔차 발생 가능 | ✅ **상충 없음** — 이미 수용된 한계. 본 기획은 확대하지 않는다(라인 3값은 정수 유지) |
| **단가 = VAT 포함 (2026-06-09 확정)** | `docs/superpowers/specs/2026-06-09-unit-price-vat-inclusive-spec.md`, `docs/qa/unit-price-vat-pr-a|b/RESULTS.md` | 단가 필드 의미 불변. 신규 열은 단가를 **대체하지 않고 병렬 권위**로 추가 | ✅ 상충 없음 — 단가 열 라벨/의미 변경 금지 |
| **결정 ④ `unitPriceWithVat = unitPrice × 1.1` 은 정확한 모델** | 이슈 #824 본문 | 이는 `SlipLine.create`(수정 경로) 규약이며, 결정 ①의 `공급 → 부가세` 방향과 **동일 방향** | ✅ 정합 — ① 재계산이 기존 `create` 규약을 그대로 계승 |
| **회계 원장 수정금지(Journal 역분개)** | `.claude/memory/project_accounting_ledger_edit_policy.md` | 본 기획은 **전표/견적 라인**만 건드리고 Journal/원장은 무접촉 | ✅ 상충 없음 |
| **회계 보고서 표시 규약**(음수 `-X` 빨강, 0 = `—`, 코드 prefix 금지) | `.claude/memory/feedback_accounting_report_display_conventions.md` | 신규 열은 **입력 필드**(보고서 아님) → 규약 비적용. 단 상세 read-only 표는 기존 표기 유지 | ✅ 상충 없음(신규 표기 도입 금지) |
| **수식 빌더 에픽 ✅ 완결** | `.claude/memory/project_formula_builder_epic.md` | 견적 수식 라인과 VAT 열의 상호작용 = **미확인**. 견적 라인이 수식 파생 단가를 가질 때 공급가액 편집이 수식을 무효화하는지 구현 단계 정찰 필요 | ⚠️ **미확인 — 구현 착수 시 필수 정찰 항목** |
| **기초품목↔견적품목 분리 ✅ · 멀티가격 #19 MOOT** | `.claude/memory/project_basic_vs_estimate_item_separation.md` | 라인당 단일 가격 전제 유지 | ✅ 상충 없음 |
| **범위 동결(2026-07-20)** | `.claude/memory/feedback_throughput_parallel_scope_freeze_batch.md` | 주문·세금계산서 확장은 후속 이슈로 | ✅ 준수 |
| **D-R8-9 lineId 계약 게이트** | `SlipUpdateRequest.java:45–57`, `LineIdContractGate` | 신규 VAT 필드도 **같은 게이트를 통과한 요청에만** 적용 | ✅ 준수 — 별도 우회 경로 신설 금지 |
| **R8-QA-1 세트 계보 파괴 선례** | `SalesSlipUpdateService.java:212–219` 주석 | 세트 구성품 라인의 공급/부가세 편집 = 배분 계보·가격기억 오염 위험 | ⚠️ **설계 반영** — 구성품 라인 편집 금지(4-5) |

---

## 4. 계산·항등식 설계

### 4-1. 기호

| 기호 | 의미 | 도메인 |
|---|---|---|
| `Q` | 수량 | 정수 ≥ 1 |
| `P` | **단가(VAT 포함)** — 기존 열 | 원 단위 정수(현행 입력이 `[^0-9]` 제거) |
| `S` | **공급가액(라인)** — 신규 열 | 원 단위 정수 ≥ 0 |
| `V` | **부가세(라인)** — 신규 열 | 원 단위 정수 ≥ 0 |
| `T` | **합계(라인, VAT 포함)** = `S + V` | 원 단위 정수 |
| `A` | 라인 권위(authority) ∈ `PRICE` \| `SUPPLY` \| `VAT` \| `TOTAL` | 라인 로컬 상태(비영속) |

`round(x)` = **HALF_UP 원 단위**(BE `RoundingMode.HALF_UP`, FE `Math.round` — 두 곳 이미 동일 granularity 로 정합됨, `SlipLine.java:199–200` 주석이 명시).

### 4-2. 재계산 파이프라인 (편집한 열이 권위 — 결정 ①)

| 편집 대상 | A 전환 | 재계산 |
|---|---|---|
| **단가 `P`** (현행 유지) | `PRICE` | `T = round(Q × P)` → `S = round(T / 1.1)` → `V = T − S` |
| **공급가액 `S`** (신규·결정 ①) | `SUPPLY` | `V = round(S × 0.1)` → `T = S + V` → 표시 단가 `P* = T / Q`(scale 2, 읽기전용 파생 표기) |
| **부가세 `V`** (신규·결정 ①) | `VAT` | `S` 불변 → `T = S + V` → `P* = T / Q` |
| **합계 `T`** (선택 — D-824-1) | `TOTAL` | `S = round(T / 1.1)` → `V = T − S` → `P* = T / Q` |
| **수량 `Q`** | A 유지 | `A=PRICE`: `P` 고정 후 PRICE 행 재적용. `A∈{SUPPLY,VAT,TOTAL}`: **직전 파생 단가 `P*` 를 `P` 로 승격하고 PRICE 경로로 복귀**(D-824-2) |

### 4-3. 항등식 `S + V = T` 가 정의상 성립함의 논증

각 경로의 **마지막 정의**를 보면:

- `PRICE`: `V := T − S` ⇒ `S + V = S + (T − S) = T` ∎
- `SUPPLY`: `T := S + V` ⇒ 자명 ∎
- `VAT`: `T := S + V` ⇒ 자명 ∎
- `TOTAL`: `V := T − S` ⇒ ∎

**반올림은 언제나 `S` 또는 `V` 중 정확히 하나에만 적용되고, 나머지 한 값은 덧셈/뺄셈으로 닫힌다.** 정수 덧셈·뺄셈은 무손실이므로 끝수가 항등식을 깨뜨릴 수 없다. 이슈가 지적한 함정(`공급가액 + round(공급가액×0.1) ≠ 합계`)은 **합계를 독립 계산하지 않고 파생값으로 정의**함으로써 원천 제거된다.

**끝수 사례 검산(RED-first 대상)**

| 입력 | `V = round(S×0.1)` | `T = S+V` | 검증 |
|---|---|---|---|
| `S = 100,005` | `round(10,000.5) = 10,001` | `110,006` | `100,005 + 10,001 = 110,006` ✅ |
| `S = 5` | `round(0.5) = 1` | `6` | ✅ (HALF_UP 경계) |
| `S = 33,333` | `round(3,333.3) = 3,333` | `36,666` | ✅ |
| `S = 4` | `round(0.4) = 0` | `4` | ✅ (부가세 0 — 4-6 경고 대상) |

### 4-4. 저장 차단(결정 ②)이 실제로 발동하는 유일한 경로

FE 항등식이 정의상 성립하므로, **정상 UI 조작으로는 저장 차단이 발동하지 않는다.** 발동 경로는 다음 뿐이다:

> **BE 가 수신한 `(S, V, T)` 삼중값에서 `S + V ≠ T` 인 요청.**
> 실체: ① 조작·변조된 payload ② FE 계산 버그(회귀) ③ 미래에 합계 열을 직접 편집 가능하게 만든 클라이언트가 잘못 구현된 경우.

따라서 **클라이언트는 `T`(라인 합계)를 반드시 명시 전송**해야 한다. `T` 를 서버가 `S+V` 로 정의해버리면 검증할 대상이 사라져 결정 ②가 **형해화**된다. 이것이 본 설계의 계약 핵심이다.

- **D-824-1 (합계 열 편집 허용 여부)**: **허용을 권고**한다. 허용해도 `TOTAL` 경로가 `V := T − S` 로 닫히므로 항등식이 깨지지 않고, 이슈 본문이 상정한 "합계 직접 편집" 사용자 경로가 실제로 존재하게 된다. **대안**(합계 read-only 유지)도 무해하나, 그 경우 결정 ②는 순수 BE 방어선으로만 남는다. → **적대검증 라운드의 명시 쟁점으로 올린다.**

### 4-5. 수량 > 1 · 세트 라인

- `Q` 는 정수. `S`/`V` 는 **라인 총액**이지 단가가 아니다(eCount 방식·현행 `supplyAmount` 의미와 동일).
- **세트(BUNDLE) 전개 구성품 라인은 `S`/`V` 편집 금지**(입력 `readOnly`). 근거: 구성품은 부모 세트가에서 배분된 값이라, 개별 편집 시 배분 합이 부모와 어긋나고 `collectPriceMemory` 가 배분가를 각인한다(`SalesSlipUpdateService.java:212–219` 의 R8-QA-1 실증). `BundleLineageResolver.isBundleComponent` 로 판정.

### 4-6. 부가세 0 / 비-10% 입력

결정 ③(면세/영세 범위 외, VAT 10% 고정)과 결정 ①(편집한 열이 권위)은 **부가세를 0 이나 임의값으로 편집하면 실질 면세 라인이 만들어진다**는 지점에서 긴장한다.

- **본 기획의 처분**: `V ≠ round(S × 0.1)` 인 라인은 **저장 허용하되 FE 에서 비차단 경고**(라인에 `⚠ 부가세가 10% 와 다릅니다` 라벨, `role="note"`)를 표시한다. 결정 ①이 "편집한 열이 권위" 이므로 차단은 결정 위반이고, 결정 ③은 *세율 컬럼/과세구분 신설을 하지 않는다*는 뜻이지 *사용자 입력을 되돌린다*는 뜻이 아니다.
- 이 해석은 **적대검증 라운드 명시 쟁점**으로 올린다(개발책임자 재확인이 필요하면 PM 이 회수).

### 4-7. 문서 총계 전파

```
totals.supply = Σ Sᵢ
totals.vat    = Σ Vᵢ
totals.total  = Σ Tᵢ = totals.supply + totals.vat   (∵ 라인별 항등식)
```

라인별 반올림 후 합산 — **현행 `SlipFormPage.tsx:798–810` / `EstimateFormPage.tsx:795–796` 과 동일 granularity 유지**. 헤더 항등식도 정의상 성립하므로 헤더 레벨 별도 차단 로직은 두지 않는다.

---

## 5. 경계 / 권한 / 계약 / 무결성

### 5-1. BE 검증 위치 (FE 계산 신뢰 금지)

검증은 **도메인 팩토리**에서 한다(서비스 레이어가 아니라). 신규:

```
SlipLine.createFromAuthoritativeAmounts(slip, ..., quantity, supplyAmount, vatAmount, lineTotalWithVat, note, sourceOrderLineId)
EstimateLine.createFromAuthoritativeAmounts(...)   // 견적 대응
```

검증 항목(모두 400 `INVALID_INPUT` + 한국어 메시지):
1. `S ≥ 0`, `V ≥ 0`, `T ≥ 0`
2. `S`, `V`, `T` 는 **원 단위 정수**(`stripTrailingZeros().scale() <= 0`)
3. **`S + V == T`** ← 결정 ②의 실체. 메시지 예: `"공급가액(100,005)과 부가세(10,000)의 합이 합계(110,006)와 일치하지 않습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."`
4. `Q ≥ 1`

저장 매핑(🚨 **도메인별 `lineTotal` 비대칭 준수** — 2-2 참조):

| 필드 | 전표 `SlipLine` | 견적 `EstimateLine` |
|---|---|---|
| `supplyAmount` | `S` | `S` |
| `vatAmount` | `V` | `V` |
| `lineTotal` | **`S`** (VAT 미포함 — 기존 의미 유지) | **`T`** (= S+V) |
| `unitPriceWithVat` | `T / Q` (scale 2 HALF_UP) | 동일 |
| `unitPrice` | `S / Q` (scale 2 HALF_UP) | 동일 |

> `lineTotal` 의미를 바꾸면 `SlipCleanupService:117`·`SlipSignatureService:207`·`SlipSalesQueryResponse:96` 의 헤더 총액이 전부 10% 튄다. **절대 변경 금지 · 뮤테이션 RED 로 고정**(I2).

### 5-2. API 계약 변경 (모두 **optional 추가** — 하위호환)

| DTO | 추가 필드 |
|---|---|
| `CreateSlipRequest.SlipLineRequest` | `BigDecimal supplyAmount`, `BigDecimal vatAmount`, `BigDecimal lineTotalWithVat` (3개 동시 존재 시에만 권위 모드) |
| `AddLineRequest` | 동일 |
| `SlipUpdateRequest.LineRequest` | 동일 |
| `CreateEstimateRequest` / `UpdateEstimateRequest` 의 LineRequest | 동일 |

**분기 규칙(3-값 all-or-nothing)**
- 3개 모두 non-null → `createFromAuthoritativeAmounts` (권위 모드)
- 3개 모두 null → **기존 경로 그대로**(`priceVatInclusive` 플래그 분기 — 회귀 0)
- 부분 제공 → 400 (`"공급가액·부가세·합계는 함께 전송해야 합니다"`) — 조용한 절반 적용 금지

**미편집 라인 계약**: FE 는 **사용자가 VAT 열을 실제로 편집한 라인에만** 3값을 보낸다(라인 dirty 플래그). 미편집 라인은 종전 payload 그대로 → legacy 라인 왕복 무손실(6-2).

### 5-3. 권한

- **신규 권한 코드 없음.** 전표/견적 작성·수정 기존 `@RequirePermission` 을 그대로 상속한다.
- FE `canAccess` page-code 도 변경 없음([[feedback_fe_canaccess_pagecode_be_match]] 대조 불요, 단 구현 시 재확인).
- 역할 표기는 MASTER / MANAGER 풀네임. 화면 UUID 노출 금지(`productId`/`lineId` 는 state 전용 — 현행 `LineRow.tsx:26` 가드 계승).

### 5-4. 무결성 — 회계 전환 · 세금계산서 발행

| 경로 | 영향 | 조치 |
|---|---|---|
| 회계 전환(`SalesAccountingSlip`/`PurchaseAccountingSlip`) | 라인 `supplyAmount`/`vatAmount` 합을 그대로 사용 | ✅ 편집값이 **정수**이므로 합도 정수 — 무영향 |
| 세금계산서(`TaxInvoiceLine:178,197`) | `sourceLine.getSupplyAmount()/getVatAmount()` 승계 | ✅ 무영향(항등식 보장으로 오히려 강화) |
| 홈택스 내보내기 / 부가세 신고서 | supply/vat 합 | ✅ 무영향 |
| 🚨 `SlipSummary.totalWithVat` (`SlipSummary.java:65–71`) | `unitPriceWithVat × Q` **재계산** → 권위 편집 라인에서 저장 `T` 와 ±drift | ❌ **fix 필요**: `supplyAmount != null && vatAmount != null` 이면 `supplyAmount.add(vatAmount)` 반환, 아니면 현행 fallback. **뮤테이션 RED 로 고정**(I5) |
| 가격기억(`collectPriceMemory`) | 공급가액 편집으로 파생된 `unitPriceWithVat`(소수 2자리)가 기억에 각인 | ⚠️ D-R4-3 서브-원 드리프트 범위 내. **라이브QA 로 실측 확인**(8-단계 6) |
| 전표 복사 `copyOf:243–253` / 버전복원 `restoreAuthoritativeAmounts:276–290` | 권위 4값 승계 로직 이미 존재 | ✅ 그대로 동작 — **회귀 테스트로 고정** |
| 견적→전표 변환 `EstimateToSlipConverter` | `unitPriceWithVat != null` → `createFromVatInclusive` **재생성**(재반올림) | ❌ **권위 라인은 `createFromAuthoritativeAmounts` 로 분기** 필요 — 안 하면 편집한 공급가액이 변환에서 되돌아감 |

---

## 6. 데이터 · 마이그레이션 영향

### 6-1. 컬럼 신설 — **불필요 (실측 확인)**

| 테이블 | 컬럼 | 출처 |
|---|---|---|
| `slip_lines` | `unit_price_with_vat` NUMERIC(15,2) · `supply_amount` NUMERIC(17,2) · `vat_amount` NUMERIC(15,2) — **nullable** | `V12__add_ecount_slipline_fields.sql:16–18` |
| `estimate_lines` | `supply_amount` NUMERIC(17,2) **NOT NULL CHECK ≥0** · `vat_amount` NUMERIC(15,2) **NOT NULL CHECK ≥0** | `V13__add_estimate.sql:95–96` |
| `estimate_lines` | `unit_price_with_vat` NUMERIC(15,2) nullable | `V35__...sql:8` |

→ **Flyway 신규 V 파일 0개.** 적용된 마이그레이션은 주석조차 수정 금지([[feedback_applied_migration_immutable]]).
만약 구현 중 제약이 필요해지면 **`V59__` 부터** 신규 파일만 추가(현 최대 = `V58__create_partner_product_price_memory.sql`, 실측).

- ⚠️ `estimate_lines.vat_amount CHECK (vat_amount >= 0)` → 부가세 음수 입력은 **DB 레벨에서 500** 이 된다. **FE + BE 에서 `V ≥ 0` 을 선검증**해 400 으로 내려야 한다(5-1 항목 1).
- ⚠️ `NUMERIC(17,2)` / `(15,2)` 정밀도 — 원 단위 정수는 안전. 상한(15자리) 초과 입력은 BE 400 으로 방어.

### 6-2. 기존 행 회귀 — **항등식 강제가 기존 데이터를 저장 불가로 만들지 않는가?**

**만들지 않는다.** 근거 3개:

1. 항등식 검증은 **요청 경로에만** 존재한다. 기존 저장 행을 읽을 때 재검증하지 않는다(조회·인쇄·회계 전환 전부 무영향).
2. 3-값 all-or-nothing 분기(5-2)로, VAT 열을 편집하지 않은 라인은 **종전 payload·종전 팩토리**를 그대로 탄다.
3. legacy 라인(`unit_price_with_vat IS NULL`, V12 이전)은 FE 가 3값을 보내지 않으므로 `SlipLine.create` 경로 유지 — 현행 동작과 바이트 동일.

**단, 반드시 검증할 회귀 시나리오**:
- (a) 전표 `lineTotal = supplyAmount`(VAT 미포함)인 **기존 전표 라인 전체**가 `S + V ≠ lineTotal` 이다. 항등식을 `lineTotal` 컬럼에 걸면 **전 전표가 저장 불가**가 된다 → 항등식 대상은 요청 필드 `lineTotalWithVat` 로 한정(5-1 표).
- (b) 무수정 왕복 PUT(상세 → 저장) 시 값 불변 — RED-first 대상 #5.

---

## 7. 테스트 전략

### 7-1. RED-first 대상 (결함 재현 실패 테스트를 **먼저** 쓰고 RED 원문 제출 후 고친다)

| # | 계층 | RED 시나리오 | 기대 |
|---|---|---|---|
| R1 | FE unit | 공급가액 `100,005` 입력 → 부가세 셀 | `10,001`, 합계 `110,006` |
| R2 | FE unit | 공급가액 `5` → HALF_UP 경계 | 부가세 `1`, 합계 `6` |
| R3 | FE unit | 부가세 `0` 직접 입력 | 합계 = 공급가액, **경고 라벨 표시**(4-6) |
| R4 | FE unit | 단가 편집 후 공급가액 편집 후 다시 단가 편집 | 권위 전환 3회, 매번 항등식 성립 |
| R5 | BE IT | `S+V ≠ T` payload | **400** + 한국어 메시지(항등식 문구 포함) |
| R6 | BE IT | 3값 중 2개만 전송 | **400** (부분 적용 금지) |
| R7 | BE IT | legacy 라인(`unit_price_with_vat = null`) 무수정 왕복 PUT | 저장값 **바이트 불변** |
| R8 | BE IT | 권위 저장 후 `lineTotal` 검사 | 전표 = `S`, 견적 = `S+V` (비대칭 고정) |
| R9 | BE IT | 권위 라인 있는 전표의 헤더 총액 | `SlipCleanupService`/`SlipSignatureService` 값 = `Σ lineTotal` 불변 |
| R10 | BE IT | `SlipSummary.totalWithVat` on 권위 라인 | 저장 `S+V` 와 **정확 일치**(현재 코드로는 재현 실패 = RED) |
| R11 | BE IT | 세트 구성품 라인에 3값 전송 | 거부 또는 무시 — 배분 계보 불변 |
| R12 | BE IT | 권위 견적 → 전표 변환 | `supply/vat/unitPriceWithVat` **재반올림 없이 보존** |
| R13 | BE IT | 전표 복사(`copyOf`) · 버전복원 | 권위 4값 무손실 승계 |
| R14 | FE 계약 | mock 값 형식 BE parity([[feedback_mock_value_format_be_parity]]) | `clients/desktop/src/renderer/api/mock.ts`(현 37 occurrences)에 supply/vat 3값 정합 시드 |
| R15 | Playwright mock | design-system `LineRow` 열 추가 후 키보드 탭 순서·debounce·드래그 회귀 | 기존 `ac-*`/전표 mock 스위트 green |

> **"RED 를 못 만들면 결함을 이해하지 못한 것 → 고치지 말고 보고"** ([[feedback_canonical_workflow]]).

### 7-2. 뮤테이션 RED 로 지킬 불변식

| ID | 불변식 | 뮤테이션(고의 파손) 시 반드시 FAIL |
|---|---|---|
| **I1** | 저장된 라인의 `supplyAmount + vatAmount == 요청 lineTotalWithVat` | 검증문 삭제 |
| **I2** | 전표 `lineTotal == supplyAmount`, 견적 `lineTotal == supplyAmount + vatAmount` | 두 매핑 서로 교환 |
| **I3** | 헤더 총계 == `Σ` 라인 (`SlipCleanupService`/`SlipSignatureService`/`SlipSalesQueryResponse`) | 라인 하나 누락 |
| **I4** | legacy·미편집 라인 왕복 불변 | 3값 null 일 때도 권위 팩토리로 강제 분기 |
| **I5** | `SlipSummary.totalWithVat` 는 권위값 우선 | `unitPriceWithVat × Q` 재계산으로 되돌림 |
| **I6** | `V ≥ 0` 선검증 | 검증 제거 → `estimate_lines` CHECK 500 발생 확인 |

### 7-3. CI

- BE: 변경 모듈 **전체** test 후 push([[feedback_changed_module_full_test_before_push]]). `--rerun-tasks --no-build-cache` 로 genuine 강제([[feedback_gradle_test_cache_false_green]]).
- FE: `npm run typecheck`(vitest ≠ tsc) + vitest + **Playwright mock 스위트**(design-system 변경 = hard gate, [[feedback_design_system_playwright_mock_suite]]).
- `ci.yml` 의 `--tests` allowlist 에 신규 테스트 클래스 등재 확인([[feedback_ci_test_filter_false_green]]).

---

## 8. 라이브QA 시나리오 (실서버 실제 실행 — 🚫 정적검사 대체 금지)

전제: 실 Docker 스택 `up -d --build slip-service` + 게이트웨이 `:8080` + 데스크톱 실 GUI + `dev_master` / `${QA_DEV_DEFAULT_PASSWORD}` + **mock OFF**. 매 라운드 **스크린샷 다수**(SendUserFile + PR SHA-pinned 인라인 둘 다).
🚨 공유 라이브 DB 쓰기 — **전용 throwaway 거래처/품목**만 사용([[feedback_qa_live_shared_data_readonly]]).

| 단계 | 조작 | 캡처/단언 |
|---|---|---|
| 1 | 새 출고전표 작성 진입 | 라인 그리드에 **공급가액·부가세 열이 보인다** |
| 2 | 품목 조회 → 단가(VAT포함) `1,100`, 수량 `2` | 공급 `2,000` / 부가세 `200` / 합계 `2,200` (PR-A 실측값과 동일) |
| 3 | **공급가액 셀에 `100,005` 직접 입력** | 부가세 자동 `10,001`, 합계 `110,006`, 단가 표시 파생 갱신 |
| 4 | **부가세 셀에 `9,999` 직접 입력** | 공급 불변 `100,005`, 합계 `110,004` |
| 5 | 수량 `2 → 3` 변경 | D-824-2 규칙대로 재계산됨을 화면으로 확인 |
| 6 | 저장 → 전표 상세 재진입 | 저장값이 **화면 입력값과 정확히 일치**. 헤더 총계 = 라인 합 |
| 7 | DB 직접 확인(읽기) | `slip_lines`: `supply_amount=100,005`, `vat_amount=9,999`, `line_total=100,005`, `unit_price_with_vat` 파생값 |
| 8 | 같은 전표 **무수정 재저장**(왕복 PUT) | 값 **불변**(회귀 R7 의 실경로 확인) |
| 9 | 견적 작성에서 3~6 반복 | 견적 `line_total = supply + vat` 확인 |
| 10 | 견적 → 전표 **변환** | 편집한 공급/부가세가 **재반올림 없이** 전표에 보존 |
| 11 | 전표 → **회계 전환**(매출전표 생성) | `totalSupplyAmount`/`totalVatAmount` 가 라인 합과 일치 |
| 12 | **기존(변경 전 생성) 전표** 열기 → 저장 | 저장 차단 **없음**(6-2 회귀 실증) |
| 13 | 세트(BUNDLE) 품목 라인 | 구성품 행의 공급/부가세 입력이 **비활성** |
| 14 | (변조 경로) 개발자도구로 `S+V≠T` payload 전송 | **400 + 한국어 메시지** 실캡처 — 결정 ② 실체 증명 |

> 14단계는 결정 ②의 저장 차단이 **실제로 도달 가능한 유일한 경로**임을 실증하는 단계다. 이 캡처 없이는 ② 구현을 "완료" 로 선언하지 않는다.
> 🚨 HashRouter 함정 — real-qa 스펙은 `/#/` 경로로 진입하고 **고유 구별 요소 가시성**을 필수 대기로 둔다(2026-07-22 핸드오프 §5).

---

## 9. 파일 단위 구현 계획

### 9-1. BE (`services/slip-service`)

| 파일 | 변경 |
|---|---|
| `.../slip/domain/SlipLine.java` | **신설** `createFromAuthoritativeAmounts(...)` + 항등식/정수/음수 검증. 기존 팩토리 무수정 |
| `.../slip/estimate/domain/EstimateLine.java` | **신설** 동명 팩토리 (`lineTotal = S+V` 비대칭 준수) |
| `.../slip/web/dto/CreateSlipRequest.java` | `SlipLineRequest` 에 3필드 추가(optional) |
| `.../slip/web/dto/AddLineRequest.java` | 동일 |
| `.../slip/web/dto/SlipUpdateRequest.java` | `LineRequest` 에 3필드 추가 (⚠️ D-R8-6 canonical 생성자 규율 유지) |
| `.../slip/estimate/web/dto/CreateEstimateRequest.java` · `UpdateEstimateRequest.java` | 동일 |
| `.../slip/service/SlipService.java` | 165/167/197/199행 분기에 권위 모드 추가(3-way) |
| `.../slip/service/SlipUpdateService.java` · `SalesSlipUpdateService.java` | 221행 `toLine` 에 권위 모드 분기 |
| `.../slip/estimate/service/EstimateService.java` | 동일 |
| `.../slip/estimate/service/EstimateToSlipConverter.java`(정확 경로 구현 시 확인) | 권위 라인은 재반올림 없이 승계 |
| 🚨 `.../slip/web/dto/SlipSummary.java` | 65–71행 `totalWithVat` 권위값 우선 fix (5-4) |
| `.../slip/web/dto/SlipLineResponse.java` · `EstimateLineResponse.java` | 이미 supply/vat 노출 — **변경 불요**(확인만) |
| 테스트 | `SlipControllerIT` · `EstimateControllerIT` · `SlipLineResponseTest` · 신규 `SlipLineAuthoritativeAmountsTest` |
| 🚫 Flyway | **신규 파일 없음** |

### 9-2. FE — design-system (`clients/web/design-system`)

| 파일 | 변경 |
|---|---|
| `src/components/LineRow/LineRow.tsx` | `LineDraft` 에 `supplyAmount`/`vatAmount`/`lineTotal`/`authority` 추가. **10열 → 12열**(공급가액·부가세 입력 셀). `onSupplyAmountChange`/`onVatAmountChange`/(선택)`onLineTotalChange` prop. `vatInclusive` opt-in 유지 — **미지정 시 기존 10열 동작 그대로**(하위호환) |
| `src/components/LineRow/LineRow.module.css` | 10–20 · 333–343행 `grid-template-columns` 에 `--col-supply`/`--col-vat` 추가. **dense 폭 재배분 필수**(1280px 데스크톱 오버플로 위험) |
| `src/components/LineRow/LineRow.test.tsx` · `.stories.tsx` · `LineRow.contrast.test.tsx` | 신규 열 케이스 + 대비 재검증([[feedback_css_var_token_not_fallback]]) |

### 9-3. FE — desktop (`clients/desktop/src/renderer`)

| 파일 | 변경 |
|---|---|
| `routes/SlipFormPage.tsx` | 141–142 계산 → 공용 유틸로 대체. 363행 신규 prop 배선. 798–810 totals. 854–855 제출 payload 3값(dirty 라인만) |
| `routes/SlipDetailPage.tsx` | 3232–3246 상세표 열 유지 + **편집 매트릭스**에 공급/부가세 입력 추가. ⚠️ 이 화면 단가 필드는 **VAT 제외 공급단가**(`vatPrice.ts` 미러) — 신규 열과의 의미 충돌을 반드시 명시 처리 |
| `routes/EstimateFormPage.tsx` | 1601–1630 자체 그리드에 2열 추가 + `EstimateMobileLineCard` prop |
| `routes/EstimateDetailPage.tsx` | 265–285 표시 정합(변경 최소) |
| **신설** `utils/lineVat.ts` | 4-2 파이프라인 단일 구현(SlipForm/EstimateForm/SlipDetail 공용). `vatPrice.ts` 와 역할 분리 명시 |
| `api/slip.ts` · `api/estimateApi.ts` | 요청 타입에 3필드 optional 추가 |
| `api/mock.ts` | supply/vat/lineTotal **정합 시드**(BE parity — R14) |
| 테스트 | `SlipFormPage.test.tsx` · `EstimateFormPage.coedit.test.tsx` · 신규 `lineVat.test.ts` |
| Playwright | 신규 `824-line-vat-real-qa/`(**`-real-qa` 접미사 필수** — 미부착 시 CI mock 잡 미제외 → ECONNREFUSED) |

### 9-4. 문서 (매 PR 동기화 의무)

`README.md` · `ROADMAP.md` · `DECISIONS.md` · `docs/samhan-public-overview.html` · `docs/dev-reports/2026-07-2x-824-line-vat-columns.md` · `docs/qa/824-line-vat/`

### 9-5. 🚨 T1/T2 충돌 가능 공유 파일

| 트랙 | 영역 | 충돌 |
|---|---|---|
| **T1 #868** (DS-3b 문서양식 편집기, design-system/groupware) | `clients/web/design-system/**` | ⚠️ **동일 패키지**. `LineRow/**` 를 T1 이 건드리지 않으면 파일 충돌 0이지만, **`package.json`/배럴 `index.ts`/공용 토큰 CSS** 에서 충돌 가능. → 머지 순서 조정 + 나중 머지 트랙이 `git merge origin/main` 후 **재-CI green** 필수([[feedback_stacked_pr_ci_false_green]]) |
| **T2 #866** (쪽지 수신자 칩, messaging/user-service) | `user-service`, 칩 컴포넌트 | ✅ 충돌 없음(단, 칩이 design-system 이면 위와 동일 취급) |
| 공통 | `clients/desktop/src/renderer/api/mock.ts` | ⚠️ 다수 트랙이 자주 건드리는 파일 — 충돌 시 **수동 병합 후 mock 스위트 재실행** |

---

## 10. 리스크 · 알려진 함정 대조

| # | 리스크 | 근거/함정 메모리 | 대응 |
|---|---|---|---|
| 1 | **`lineTotal` 의미 비대칭**(전표=공급 / 견적=공급+부가세)을 놓쳐 헤더 총액 10% 튐 | 실측 `SlipLine:209` vs `EstimateLine:218` | I2 뮤테이션 RED + R8/R9 |
| 2 | 항등식을 `lineTotal` 컬럼에 걸어 **기존 전표 전량 저장 불가** | 6-2(a) | 항등식 대상 = 요청 `lineTotalWithVat` 로 한정. R7/R12(라이브) 실증 |
| 3 | `SlipSummary.totalWithVat` 재계산 drift | `SlipSummary.java:65–71` | I5 + R10 |
| 4 | design-system 10→12열 **행동 회귀**(키보드 탭·debounce·드래그) — vitest/typecheck green 이어도 못 잡음 | [[feedback_design_system_playwright_mock_suite]] | Playwright mock 스위트 hard gate = 권위. 정적+vitest 만으로 수렴 선언 금지 |
| 5 | 12열 dense 그리드 **가로 오버플로**·인쇄 양식 깨짐 | `LineRow.module.css` 10~20행 · [[feedback_print_design_iteration]] | mock 캡처 → CSS 3~5회 반복 정정. 단번 완성 금지 |
| 6 | mock 시드 값 형식이 BE 와 어긋나 false-green | [[feedback_mock_value_format_be_parity]] | R14 — mock.ts 3값 정합 시드 + 형식 가드 테스트 |
| 7 | `estimate_lines` CHECK(≥0) 로 음수 부가세 → **500** | `V13:96` | I6 — FE/BE 선검증 400 |
| 8 | 세트 구성품 편집이 배분 계보·가격기억 오염 | R8-QA-1(`SalesSlipUpdateService:212–219`) | 4-5 구성품 입력 비활성 + R11 |
| 9 | `SlipDetailPage` 편집 단가 = **VAT 제외**인데 신규 열은 VAT 도메인 → 이중 의미 혼선 | `vatPrice.ts:1–32` | 신규 유틸 `lineVat.ts` 로 도메인 명시 분리 + 화면 라벨 명시 |
| 10 | react-query freshness — 저장 후 상세가 stale 값 표시 | [[feedback_react_query_freshness_route_param_reset]] | freshness-critical 쿼리 `staleTime:0` + `refetchOnMount:'always'` 검토. presence-only 단언 금지(고유 금액값 단언) |
| 11 | 라이브QA 공유 DB 쓰기가 타 트랙 QA 오염 | [[feedback_parallel_agent_gradle_shared_tree_contention]] · [[feedback_qa_live_shared_data_readonly]] | 전용 throwaway 거래처/품목, 쓰기 차원 직렬화 |
| 12 | 스크린샷 원복이 spec 수정을 삭제 | [[feedback_screenshot_restore_scope_destroys_edits]] · #863 | `git checkout -- clients/desktop/playwright/` **디렉토리 통째 금지**. 의도 변경 먼저 `git add` |
| 13 | HashRouter 로 real-qa 음성 단언이 위장 통과 | 2026-07-22 핸드오프 §5 | `/#/` 진입 + 고유요소 가시성 필수 대기 |
| 14 | 결정 ③ vs ① 긴장(부가세 0/비-10% 입력) | 4-6 | 비차단 경고 + **적대검증 명시 쟁점**. 개발책임자 재확인 필요 시 PM 회수 |
| 15 | 견적 수식 빌더 라인과 VAT 편집 상호작용 **미확인** | 3절 | **구현 착수 시 필수 정찰**. 미확인 상태로 구현 금지 |

---

## 11. 미해결 / 착수 시 확정할 항목

| ID | 항목 | 기본값(권고) | 확정 주체 |
|---|---|---|---|
| **D-824-1** | 합계 열 편집 허용 여부 | **허용**(TOTAL 권위 경로) — 결정 ②의 저장 차단에 실제 사용자 경로를 부여 | 적대검증 라운드 쟁점 → PM |
| **D-824-2** | 수량 변경 시 `A∈{SUPPLY,VAT,TOTAL}` 라인 처리 | **파생 단가 `P*` 를 `P` 로 승격 후 PRICE 경로 복귀** | 적대검증 라운드 쟁점 |
| **D-824-3** | 부가세 ≠ 10% 라인 처분 | **저장 허용 + 비차단 경고** (4-6) | 개발책임자 재확인 후보 |
| **D-824-4** | 견적 수식 빌더 라인과의 상호작용 | **미확인 — 구현 착수 시 정찰** | 구현자 정찰 후 보고 |
| **D-824-5** | `TaxInvoiceFormPage` `Math.trunc` vs `HALF_UP` 불일치 | **범위 외 · PM 자율 이슈 등록** | PM |
| **D-824-6** | 주문(`PartnerOrderLine`) 공급/부가세 열 | **범위 외 · 후속 이슈**(스키마 신설 필요) | PM |

---

## 12. 캐논 준수 체크

- 🚫 본 기획서 작성 중 **프로덕션 코드 0줄**, 브랜치/커밋/PR **생성 0건**.
- 조기 PR 개설·기획 리뷰 게시는 **PM 이 수행**.
- 다음 단계 = CODEX LUNA 5.6 구현(`gpt-5.6-luna`, `sandbox: danger-full-access`, git 금지·PM commit 대행) → OPUS 4.8 5-agents 적대리뷰 + 라이브QA + SONNET5 fix → CODEX SOL 5.6(`gpt-5.6-sol`) 5-agents + LUNA fix → 도달성 0수렴 → PM 종합 + CI green(exact SHA) + 라이브QA → 머지.
- 머지 게이트 = ①실 사용자 경로 재현 가능한 결함 0 ②CI green(exact SHA) ③라이브QA 실서버 실행.
