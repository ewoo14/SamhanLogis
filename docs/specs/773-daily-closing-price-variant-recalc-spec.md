# #773 일마감 단가변동 재계산 토글 — 설계 스펙 (개발책임자 검토용)

- **일자**: 2026-07-12 · **작성**: PM(Opus) 심화 정찰 기반 · **상태**: 🟢 전 결정 확정 · **S1a 완료(#800 dev 시더+정가 endpoint)** → S2(재검증 엔진) 착수 가능. S1d(실 시트 sync·자격) 격리 대기

## ✅ 확정 결정 요약 (2026-07-12 개발책임자)
- **D1 = ⓐ 할인율 재검증 워크시트** (레거시 동등·마감 금액 불변·`확인` 플래그·read-time 감사).
- **D5+D6 = 주문/전표 계층**(출고전표/주문 라인, productId 보유 → price_history 직접 join·fuzzy 불필요).
- **D3 = price_history 채택 + 실시드 선행**(S1에서 실 단가시트 sync[dev 0행 해소]+구성품/구형 baseline[#777 잔여] 먼저 채움).
- D2(카테고리 축)=마감 스키마 불필요(감사 리포트 표시 그룹, price_change_schedule 재사용)·D4=read-time·D7=lock 무관(D1=ⓐ 파급).

## 확정 아키텍처 (감사 파이프라인)
```
마감일 D 기준 → 해당일 출고전표/주문 라인(productId 보유) 집계
  → 각 라인: price_history.findApplicableLatest(productId, 인상전 or 인상후 기준일)로 시점별 정가 lookup
  → 기대 할인율 = 1 - (라인 stamp 단가 / 시점별 정가) vs 거래처 약정할인(dc-config) 대조
  → `확인` 플래그 산출 (금액 불변·read-time)
  → 전역 토글(isBeforeHike 동등): 검증 기준 정가를 인상전/후 중 선택
```
- **연관**: #17 단가변동(S1~S4b 완료) · 레거시 `tools/legacy-gas/일마감 프로그램/Code.js` · 개발책임자 2026-07-08 "별도 대규모 슬라이스" 규정

---

## 0. 🚨 최우선 발견 — "재계산"의 실제 의미 (레거시 코드 정독 결과)

**레거시 `isBeforeHike`는 "가격을 다시 매기는(re-pricing)" 것이 아니라 "할인율 재검증(re-validation) 워크시트"다.**

`Code.js:420 processDailyData(ecountData, isMultiApplied, isBeforeHike)`:
- raw 이카운트 export의 각 라인에 대해 **시점별 단가시트(인상전/후)를 referent로** 출고가·할인율을 재산출.
- 거래처 DC 약정(홈멀티DC/상업멀티DC/360/4way/1way/스탠드/디럭스/1등급/할인제외)과 대조 → **`확인` 플래그만** 산출.
- **공급가액/부가세/합계는 이카운트 raw 그대로 통과**(재산출 안 함, `Code.js:11-14,458-471` FINAL_HEADERS 매핑).
- `isBeforeHike` = 전역 단일 토글: 검증 기준 정가 시트를 인상전/후 중 무엇으로 볼지 고르는 스위치(`Code.js:424-441`).

→ **즉 마감 금액을 바꾸는 게 아니라, 이카운트가 찍어온 단가가 "시점별 정가 × 거래처 약정할인"과 맞는지 감사**하는 것. 이 발견이 스펙 전체 방향을 좌우.

---

## 1. 현대 시스템 현황 (재계산 referent 부재)

| 항목 | 현황 | 근거 |
|---|---|---|
| **일마감 파이프라인** | `DailyClosingService.close()`가 이미 stamp된 최종 합계를 **SUM+lock만**. 단가 재산출 코드 없음 | `DailyClosingService.java:104-163` |
| **DailyClosing 그룹 축** | date+partnerId+closingKind+sourceKind. **카테고리 축 없음**·라인 detail 없음(총액만) | `DailyClosing.java:66-112` |
| **단가변동 stamp 상류** | 견적(S2 수동 체크박스)·주문(S3 납기일 자동전환)에 이미 stamp. 마감 재선택은 상류와 **중복·충돌** | dev-reports S2/S3 |
| **시점별 정가 referent** | product-service `price_history`(product당 인상전 2000-01-01/인상후 2026-04-01) 존재. 단 **dev 0행**(실 sync 필요) | `PriceHistory.java`·`PriceHistoryRepository.findApplicableLatest` |
| **🚨 referent 갭(핵심)** | 마감이 집계하는 회계 문서(TaxInvoiceLine·Sales/PurchaseAccountingSlipLine)는 **productId 미보존·텍스트 itemName/productCode만**. 시점별 정가 join 불가. 견적/주문 라인엔 productId 있으나 **회계 변환서 소실** | `TaxInvoiceLine.java:55-75`·`SalesAccountingSlipLine.java:40-52`·`MonthEndCloseService.java:209` |
| **원단가/변동전단가 보존** | 회계 라인은 **최종 stamp 단가만**. 원정가·할인율·인상플래그 미보존 | 상동 |
| **전역 vs 카테고리별** | 레거시=전역 1토글 / 현대 S4=카테고리별(price_change_schedule 4행) | `Code.js:424-441` vs `PriceChangeSchedule.java` |

**결론**: 단순 토글 신설이 아니라 **매핑 인프라 + 재계산(재검증) 엔진 + (선택)스키마 축 + FE**의 4~5 슬라이스 에픽.

---

## 2. 🟡 개발책임자 결정 필요 (구현 전 확정)

### D1 (최우선) — "재계산"의 의미 ✅ **확정: ⓐ 할인율 재검증 워크시트** (2026-07-12)
- **ⓐ 레거시식 할인율 재검증 워크시트** (감사 리포트·**마감 금액 불변**·`확인` 플래그) ← *레거시 실제 동작·회계 원장 수정금지 원칙과 정합. **개발책임자 확정.***
- ~~ⓑ 인상 전 가격으로 what-if 총액 재산출(마감 금액 변경)~~ — 미채택(원장/마감 불변 충돌)
- ~~ⓒ 마감 SUM referent 전환~~ — 미채택

> **D1=ⓐ 확정 파급**: D4(시점)=**read-time 감사**(마감 금액 불변→무결성 안전, 저장 불필요)·D7(소급)=lock 무관(감사는 read-time이라 언제든 조회 가능)·D2(카테고리 축)=DailyClosing 스키마 축 **불필요**(감사 리포트의 표시 그룹으로 축소, price_change_schedule 카테고리 재사용). → **잔여 핵심 결정 = D3(데이터소스)·D5(계층)·D6(대상문서)**.

### D2 — 전역 vs 카테고리별
레거시 전역 1토글 UX 유지 vs 현대 S4 카테고리별 정합.

### D3 — Referent 데이터소스
price_history(2000-01-01 baseline) 채택 여부·dev 0행 실 sync·구성품/구형 미커버(#777 item3 미해결) 처리.

### D4 — 재계산 시점 + 무결성
마감 실행 시 저장 vs 조회 시(read-time) 산출. **회계 원장 수정금지·마감 불변**(메모리 `accounting_ledger_edit_policy`)과 정합 — D1=ⓐ면 read-time 감사라 무결성 안전.

### D5 — 재계산 계층 ✅ **확정: 회계 문서 텍스트 매칭 endpoint** (2026-07-12)
- **회계 라인(TaxInvoiceLine·SalesAccountingSlipLine) itemName/productCode 텍스트 → product-service 조회 endpoint로 productId 런타임 매핑.** 스키마 무변경·기존 문서 불변·read-time 감사(D4)와 정합. ← *개발책임자 확정.*
- ~~productId 컬럼 플러밍(회계 문서 스키마 신설+백필+변환경로)~~ — 미채택(다서비스 스키마 마이그·기존 데이터 백필·대규모·무결성 주의).
- ~~상류(견적/주문) productId 경로~~ — 미채택(회계 변환서 소실·referent 갭 미해소).
- **파급**: S1 = "회계 라인 텍스트→productId 매핑 endpoint"(런타임·product-service). 동명이인/코드변경 매칭 실패 대비 fallback 설계 필요. 레거시 Code.js 매칭 로직(정가 시트 join 방식) 참조.

### D6 — 대상 문서
세금계산서 vs 매출전표 vs (레거시처럼) 이카운트 raw(출고전표) 중 referent.

### D7 — 기존 마감본 소급
lock된 마감 소급 재계산 허용 여부·AccountingPeriod 잠금/역마감 관계.

> **PM 권고**: **D1=ⓐ(할인율 재검증 워크시트)** — 레거시 실제 동작과 일치하고, 회계 무결성(원장/마감 금액 불변)을 지키며, read-time 감사(D4)라 안전. ⓑ/ⓒ는 마감 금액을 사후 변경해 무결성 도메인 정책 위반 소지. D1이 ⓐ로 확정되면 D5는 "감사 대상 문서 라인 → product 매핑"만 필요(스키마 축 D2·카테고리는 감사 리포트 그룹으로 축소 가능).

---

## 3. 슬라이스 분할 제안 (D1=ⓐ 가정)

| 슬 | 범위 | 산출 |
|---|---|---|
| **S0** | 정책 확정(비-코드) | §2 D1~D7 개발책임자 결정 |
| **S1** | Referent 인프라 | 회계 라인 텍스트→productId→시점별 정가(price_history) 매핑 endpoint(또는 productId 플러밍) + price_history 실시드 + 구성품/구형 baseline(#777 잔여) |
| **S1.5**(조건부) | 검증 config | 거래처 약정할인(dc-config) 검증 노출 + 세트 구성품 분해(BundleExpander) 재사용 |
| **S2** | 재계산(재검증) 엔진 BE | 문서 집계→매핑→시점별 정가→기대 할인→`확인` 플래그. 레거시 확인 로직 포팅 |
| **S3**(조건부) | 결과 표현 | daily_closings 라인 detail 부재 → 조회시 on-the-fly 산출 or 검증결과 테이블 |
| **S4** | FE 토글 + 결과 뷰 | DailyClosingPage "인상 전 적용" 토글 + 출고가/할인율/확인 결과표 + 라이브 QA |

---

## 4. 다음 단계
D1(재계산 의미)이 스펙 전체를 좌우하므로 **§2 결정, 특히 D1을 먼저 확정** → 확정 후 S1부터 정식 캐논(Codex 구현 + Opus 5-agent + 라이브 QA)으로 착수.

---

## 5. S1 심화 정찰 (2026-07-12·3-agent) — referent 매핑 실태 + S1 재분할

> D5=텍스트 매칭 endpoint 확정 후, 회계 라인/product-service/레거시 Code.js 3면 정찰. **S1이 단일 슬라이스가 아니라 매핑 파이프라인 + 검증 소스임을 규명.**

### 5.1 회계 라인 실태 (accounting-service)
- **productId 전무 확증**: `TaxInvoiceLine`(`item_name` NOT NULL / `spec` / `unit`, 부모 `tax_invoice_id` FK만) · `SalesAccountingSlipLine`·`PurchaseAccountingSlipLine`(`product_name` / `product_code`, 부모 `slip_id` FK만).
- **일마감 집계 경로** = `MonthEndCloseService.getTaxInvoiceDailyDetail`(:177-257). group 키 = **텍스트**(`byModel: Map<String,ModelAccumulator>`) — TAX_INVOICE=`itemName`(:226) / SALES_SLIP=`productName`(:285) / PURCHASE=`productName`(:319). L209 주석 "productId 미보존→itemName 키". `DailyProductLine.modelName`은 현재 항상 null(:242-245, productClient가 UUID lookup만이라 placeholder 회피).
- **텍스트 실값 = 이카운트 `품목명[규격]` 원문 라벨**(미정규화): TaxInvoiceLine.item_name ← EcountTaxInvoiceImporter c[11], spec/unit=NULL insert. **SalesAccountingSlipLine.product_code = 리터럴 "MIG4" 하드코딩**(조인키 무용). 실 월마감 `close()`는 JournalLine을 계정코드 prefix로 SUM(품목 무관).

### 5.2 product-service 조회 자산 (이미 존재)
- **텍스트/코드→product endpoint 다수 기존**(`ProductInternalController` `/products/internal`): `/lookup-by-model`(modelName 정확·단건·404)·`/lookup-by-code`(productCode 정확·단건)·`/by-name`(name 정확·**404/409중복**)·`/lookup-by-model-codes`(bulk)·**`/resolve-ecount-aliases`**(aliasCode→ProductAlias 해석)·`/expand`(세트 전개).
- **매칭 안전 키 = 코드류**(`productCode`/`modelCode`/`modelName` 각 active partial-unique 단건 보장). **`name`은 유니크 아님→다건 시 409**(`lookupSummaryByName` CONFLICT). `ProductAlias`(alias_code→main_product N:1)·native LIKE `search()` 재사용 가능.
- S1a(#800) `PriceHistoryInternalController /applicable`(productId+asOf→시점정가)로 **뒷단(productId→정가) 이미 완성**. 갭 = **앞단(품목명[규격] 라벨→productId)**.

### 5.3 레거시 매칭·확인 로직 (Code.js:420-749)
- **매칭 = 4단 fallback + 토큰 정규화**(단순 exact 아님): `extractModelToken_`(:167 괄호제거→대문자→모델코드 정규식 `AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR` 접두 추출) → ①OLD 시트 우선 ②액세서리 키워드 부분일치(유연호스/방진가대) ③zone별(`^AXJ`=COMM_MULTI 강제) ④UNKNOWN fallback ⑤miss=0. 현대 `/lookup-by-model`은 exact only → **토큰 정규화+다단 fallback 계층 앞단 필요**(그냥 쓰면 매칭율 급락).
- **isBeforeHike = 전역 배치 토글**(앞 5행 첫 날짜로 suffix 1회 결정·임계 20260401=price_history 인상후 2026-04-01 일치). true=날짜무시 인상전 강제 → 현대는 asOf=baseline(2000-01-01) 고정으로 등가.
- **`확인` 판정 = 정가만으로 불가**: `출고가(price)`·**`납품가(deliveryPrice)`**·**`고정dc(fixedDc)`** 3종 의존(:551-558,680,688,721). 회계 라인은 stamp 단가만·price_history는 정가만 → **납품가/고정dc 소스 매핑 별도 필요**(dc-config/product). 구형(OLD) 50%고정/납품가완전일치 분기는 **구형 baseline(#777 잔여) 없으면 재현 불가**.
- 허용오차: epsilon 없음. 할인율=`Math.round(rate*100)` 정수% 동등 / 가격=`money_to_int_` 정수원 완전일치 / 세트합=`Math.abs` 정수원. **BigDecimal scale/반올림 모드 차이 시 경계값 확인 뒤집힘**.
- 약정DC=Notion 거래처코드(숫자정규화 키)→홈/상업멀티율(rate)+360/4way/1way/스탠드/디럭스/1등급(정액원). 현대=dc-config `DcConfig`+`PriceCalculationService`. **이카운트 거래처코드→partnerId 매핑 선행 필요**. 세트=역-BundleExpander(flat 라인 재조립·구성품수 내림차순 그리디·원단위 완전일치).

### 5.4 S1 재분할 (정찰 반영)
| 슬 | 범위 | 비고 |
|---|---|---|
| **S1a** ✅ | price_history 시더 + productId→시점정가 endpoint (#800) | 완료 |
| **S1b** ✅ | **품목명[규격] 라벨 → productId 매핑 endpoint** (accounting→product·#802 `62cc42d59`) | 토큰 정규화+4단 fallback+다의성/미매칭. 완료 |
| **S1c** ✅ | 납품가·고정dc referent 소스 (#805 `441164d36`) | 고정dc `/fixed-discount-rate(-bulk)` endpoint + HvacSeeder 시드(percent 45/35/null). 납품가=S1a 완비. 순수조회. 완료 |
| **S1d** | 구형(OLD) baseline + 실 시트 sync | #777 잔여·Google 자격·격리 운영 |
| **S1.5** | dc-config 검증 노출 + 이카운트 거래처코드→partnerId + 역-BundleExpander 세트 매처 | 세트/약정DC 확인 로직 |

> **PM 판단**: **S1b(라벨→productId 매핑 endpoint)가 S2 최소 선결이자 결정불요·무결성무관·순수조회**라 **다음 착수 1순위**. S1c/S1.5는 `확인` 판정 정확도 슬라이스(레거시 정합·중형)로 S2와 함께/후속. S1d는 자격·격리로 별개 트랙.

### 5.5 🚨 S1b 착수 blocker — dev 데이터 세계 불일치 (2026-07-12 실 DB 확인)
착수 전 실 데이터로 `품목명[규격]` 파싱 규칙 실증 시도 → **dev DB와 레거시 매칭 규칙이 다른 세계임을 확인**:
- **accounting_db `tax_invoice_lines` = 16행 전부 서비스 품목**(운반료·수수료·보험료·QA테스트) — HVAC 제품 라벨 0. `sales_accounting_slip_lines` = **0행**.
- **product_db products(100행) = 삼성 유통품**(`product_code` 전부 6자리 `010xxx`·`model_code` 비어있음·specification="N평형 / R32 / 인버터 / 윈드프리"). **레거시 모델코드 체계(AC/AP/AR/AF/AM/AJ/AXJ/PC/AWR/ARR 접두)를 가진 삼한 자체제작 제품 0개**(model_code 접두=QA7…4·TES…1 테스트시드뿐).
- 레거시 AC/AP 모델코드는 **실 파일(계산서 발행용.xlsx·종합견적서)에 실재** → 레거시 세계엔 있으나 dev DB엔 부재.
- **함의**: S1b(`extractModelToken_` 포팅+4단 fallback) 구현해도 **dev에 매칭 대상(AC… 모델코드 제품)이 없어 genuine 매칭 실증 불가**. 합성 AC… 제품 시드는 [[feedback_no_fake_data_ever]] 위반. 실 삼한 카탈로그·실 이카운트 raw는 **S1d(Google Sheets sync·자격·격리)**에 묶임.
- **PM 권고(개발책임자 판단 필요)**: ⓐ S1d(실 시트 sync)를 S1b보다 **먼저**(실 카탈로그 확보 후 매핑 실증) — 단 Google 자격·격리 운영 필요 / ⓑ S1b를 **IT 픽스처 기반**으로 구현(실 라벨 샘플을 계산서 발행용.xlsx에서 추출해 테스트 리소스화·dev 라이브 실증은 S1d 후로 유예)·순수 매퍼 로직은 unit/IT로 genuine 검증 / ⓒ #773 전체를 S1d(실 데이터 확보) 전까지 **보류**하고 결정불요 소형 백로그 우선.

### 5.6 ✅ 개발책임자 결정 = ⓑ IT 픽스처 기반 S1b 착수 (2026-07-12)
- **실 라벨 근거 확보**: `tools/legacy-gas/계산서일괄등록양식 생성/계산서 발행용.xlsx` sheet1에서 실 삼한 HVAC 라벨 **267개 unique** 추출(총 791 매치). 형식 = `<모델코드12자> [<설명>] [<옵션>]`(예 `AC023CN1DBC1 [CN냉전 실내기]`·`AJ040RXH4BC1 (RX냉방기)`). 규격표기 = 대괄호[] 252·소괄호() 43·무괄호 11. **매칭 키 = 선두 모델코드 토큰**(공백 전·`extractModelToken_` 정규식 `(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9\-]{4,}`과 정확 일치), 대괄호 설명은 표시용·매칭 무관.
- **S1b 범위**: accounting 회계 라인 텍스트(`품목명[규격]` 라벨) → **모델코드 토큰 추출** → product-service 조회(modelName/modelCode exact → alias → LIKE 4단 fallback) → productId. 다의성(409)/미매칭(404) 구조화 리포팅. **순수 조회·무결성 무관·결정불요.**
- **genuine 검증 = IT 픽스처**: 실 라벨 267개(합성 아님·실 레거시 데이터)를 테스트 리소스화 → 토큰 추출·fallback·다의성 매퍼를 unit/IT로 검증. **라이브 라벨→productId hit 실증은 S1d(실 카탈로그) 후로 유예**(dev product_db=삼성 유통품이라 AC… 모델코드 매칭 대상 부재 — 명시적 유예·합성 시드 금지).

### 5.7 S1c 심화 정찰 (2026-07-12) — 납품가·고정dc referent 소스 규명·착수 판정

> S1b 머지 후 순차 착수 판단. **결과: S1c=순수조회·무결성무관→개발책임자 정책 게이트 불요.** (스펙 §1:44 "price_history dev 0행"·§0/§1:122 "price_history 정가만" 전제 2개는 **S1a #800으로 stale**·정정.)

- **납품가(deliveryPrice) = 완비(S1a 재사용·신규작업 0)**: `PriceHistory.deliveryPrice`(product `PriceHistory.java:52-53` NOT NULL) + S1a `/products/internal/price-history/applicable(-bulk)`가 **release/delivery 둘 다** 반환(`PriceHistoryInternalController:91-101`·productId+asOf). dev price_history에 delivery 실값 존재(`PriceHistorySeeder`가 `Product.deliveryPrice` 시드·합성값이나 판정 로직 검증 충분). 레거시 `확인=(단가===납품가)`(Code.js:680,688,707).
- **고정dc(fixedDc) = product 품목별(dc-config 아님)·선결 2건**: `Product.fixedDiscountRate`(`Product.java:112-114` NUMERIC(5,2)·품목별·"행별 고정DC L열"). 레거시 MULTI `expectRate=round(_fixedDc*100)`(Code.js:721-722). **⚠️ 스케일 파리티**: 레거시=분수(0.45)·×100 / 현대=이미 percent(45.00) 저장(V20 마이그 ×100·CHECK 0~100) → 재검증 비교 시 현대값은 이미 `expectRate` 공간(×100 재적용 금지). **선결**: ① dev 시드 NULL(🚨 `HvacProductSeeder` INSERT에 `fixed_discount_rate` 없음·전 100제품 NULL) → 시드 주입 ② productId 키 고정dc 조회 경로 부재(`ProductSummaryResponse`=출고가만·EstimateCatalog=modelCode 키) → 신규 internal endpoint.
- **dc-config = S1c 범위 밖 = S1.5**: `DcConfig`(Partner 1:1·거래처별 홈/상업멀티 rate + 정액 6종)는 레거시 `discInfo`(거래처 약정DC)=S1.5. S1c(품목별 납품가/고정dc)와 별개. (dc-config dev 시더 전무=S1.5 별도 blocker.)
- **dev 데이터 blocker(S1b식)**: dev=삼성 유통품이라 실 삼한 납품가/고정dc 부재 → 납품가는 합성값 존재·고정dc는 NULL. **genuine=IT 픽스처 / 라이브 전량 hit=S1d 유예**(S1b 선례 동일).

> **PM 판정**: S1c **착수 가능·순수조회**. 범위 = **고정dc productId 조회 internal endpoint 신설 + dev 시드(fixed_discount_rate) + 스케일 파리티 가드**(납품가는 S1a 완비·무작업). money-logic 계산/무결성 개입 없음(값 조회만·`확인` 판정은 S2). IT 픽스처 genuine·라이브 부분 실증(납품가 synthetic·고정dc 시드).

## 6. S2 착수 정찰 (2026-07-13·2축) — 재검증 엔진 통합지점 + 레거시 확인로직 + 분할

> 개발책임자 결정(2026-07-13)="#773 S2 재검증 엔진 착수". referent(S1a/b/c) 완비 후 본체. 2축 정찰(accounting 통합지점·레거시 Code.js:668-735).

### 6.1 통합지점 (accounting)
- **진입점 = `MonthEndCloseService.getTaxInvoiceDailyDetail`(:194-257·read-time 조회 시점·마감 실행 아님)**. endpoint `GET /accounting/closings/daily?date&kind&sourceKind`(재사용·partnerCode 축 없음=전 거래처). asOf(S1a)=date.
- **결과 표현 = on-the-fly**(D1=ⓐ 정합·마감금액 불변). `daily_closings`는 합계+잠금만·라인 detail 테이블 부재 → 재검증 `확인`/기대/실/출고가는 **`DailyProductLine` DTO 확장(신규 필드)**. **신규 엔티티/테이블 불필요**(검증결과 영속=S3 조건부·범위 밖).
- **referent 배선**: S1b `ProductClient.resolveByLabel` 완료(javadoc이 "S2" 지목). **S1a(applicable[-bulk])·S1c(fixed-discount-rate[-bulk]) 호출 메서드는 accounting ProductClient에 신설 필요**(2 메서드 + wire record 2종).
- **🚨 per-line 관건**: 현 `byModel`이 itemName 키로 집계하며 **unitPrice 소실**. 실할인율 = `supplyAmount/quantity`(유효단가)로 도출 → `actualRate=round((1−(supplyAmount/quantity)/release)×100)`(byModel 구조 자연 정합). **actualRate 분모=출고가(release)**(납품가 아님).
- 중복 없음(accounting 재검증/확인/할인율 엔진 부재·totalDiscount placeholder ZERO). 규모 **중(中)**.

### 6.2 레거시 확인로직 (Code.js:668-735) — S2 커버 vs S1.5 경계
- **실 산식**(:551-561): `rate=1−(unit/price)`·분모=출고가·`money_to_int_` 정수화. `_deliveryPrice`=납품가(없으면 출고가 폴백)·`_fixedDc`=고정dc(**0도 유효값·null과 구분**).
- **S2 커버(순수 S1 referent)**: 운임/절삭(true)·구형 AM/NJ/NS/AVX(`round(rate×100)===50`)·구형기타/액세서리(`unit===납품가`)·멀티 고정dc(`round(rate×100)===round(fixedDc×100)`)·멀티 약정無 폴백(`===45`)·싱글부속(본체無)/싱글기타/기타(true). 정수%동등·정수원완전일치 2형.
- **S1.5 대기(범위 밖)**: 싱글 본체 INDOOR/OUTDOOR/SUB_INDOOR(riUsage 세트 완전일치=역-BundleExpander)·멀티 거래처 commRate/homeRate(노션 약정DC·partnerId 축).
- **게이트**: `isMultiApplied===false`=구형/액세서리/멀티만 스킵. `isBeforeHike`=판정식 토글 아님·**S1a 시점정가 asOf(인상전/후) 로딩계층 흡수**.

### 6.3 분할 (PM 제안·개발책임자 확인)
- **S2a** ✅ (#806 `cb94ad7a5`): accounting `ProductClient`에 S1a(applicablePrices)·S1c(fixedDiscountRates) bulk 호출 + `ApplicablePrice` record. **+ product bulk 부분성공 계약**(결측 productId 전체404→Map 생략·단건404 유지·개발책임자 결정) **+ soft-delete 정합**(applicable-bulk Product 게이트·fixed-discount 대칭·Codex 적대 포착). 완료.
- **S2b**: `getTaxInvoiceDailyDetail` 재검증 엔진 — per-line itemName[spec]→resolveByLabel→productId→(applicable release/delivery + fixedDiscountRate)→기대(expectRate) vs 실(actualRate=supplyAmount/quantity)→`확인`. NOT_FOUND/AMBIGUOUS 사유 보존. **read-time 감사·마감금액 불변(무결성 안전)**. S2a 선행.
- **S2c**: `DailyProductLine` 필드 확장(expectedRate/actualRate/releasePrice/deliveryPrice/확인) + totalDiscount 실계산 + controller passthrough + IT. S2b 선행.
- **범위 밖**: S1.5(세트 riUsage·거래처 약정DC)·S3(검증결과 영속). D1=ⓐ read-time이라 S2 전체 무결성 안전(마감 금액 불변경).

> **PM 권고**: S2a→S2b→S2c 순차 슬라이스(각 조기PR·캐논). S2a는 순수 조회 배선(무결성무관·결정불요)으로 즉시. S2b가 실판정 로직(레거시 포팅)이나 read-time 감사라 마감 불변·개발책임자 정책 게이트 불요.

---

## 6.4 S2b 엔지니어링 스펙 (2026-07-13 · 회사PC 착수) — 재검증 엔진 + 결과 노출

> S2a(#806) 머지로 referent 조회 3종(`resolveByLabel`·`applicablePrices`·`fixedDiscountRates`) 완비. 본 절 = S2b 착수 기획(Opus). read-time 감사(마감금액 불변·무결성 안전)라 개발책임자 정책 게이트 불요·PM 자율.

### 6.4.0 스코프 확정 (PM 결정)
- **S2b = 엔진 + `getTaxInvoiceDailyDetail` 배선 + `DailyProductLine` 필드 노출**(releasePrice/deliveryPrice/expectedRate/actualRate/verified/status). §6.3 초안이 DTO 필드를 S2c로 뒀으나, 엔진 산출이 엔드포인트에 **실제로 노출돼야 라이브 QA 가능·dead code 회피** → DTO 필드만 한 슬라이스 앞당김(단축 아님·정식 캐논).
- **S2c 잔여**: `totalDiscount` 실계산(할인액 집계) + SALES_SLIP/PURCHASE_SLIP 경로 재검증 + 교차소스 end-to-end IT.
- **범위 밖(불변)**: S1.5(세트 riUsage·거래처 약정DC)·S1d(구형 OLD baseline·실 시트 sync)·S3(검증결과 영속).
- **대상 sourceKind = TAX_INVOICE 만**(`getTaxInvoiceDailyDetail`). SALES/PURCHASE 전표 경로는 S2b에서 현행 유지(재검증 미적용).

### 6.4.1 엔진 계약 (`DiscountRevalidator` — 순수 컴포넌트)
모델 그룹(byModel: itemName 키 집계) 1건당 판정. **입력**:
| 필드 | 소스 |
|---|---|
| `itemName` (라벨) | TaxInvoiceLine.itemName (그룹 키) |
| `modelToken` | itemName에서 추출(**레거시 `extractModelToken_` 동일 규칙** — 매칭된 product.modelCode 아님·파리티 핵심) |
| `effectiveUnitPrice` | 그룹 `supplyAmount / quantity` (유효단가·qty=0 방어) |
| `release` / `delivery` | `applicablePrices(productIds, asOf=date).get(pid)` — 결측 가능 |
| `fixedDc` | `fixedDiscountRates(productIds).get(pid)` — percent(45.00)·null(미설정)≠생략(미존재) |
| `matchStatus` | resolveByLabel 결과(MATCHED/NOT_FOUND/AMBIGUOUS) |

**출력** `Revalidation(verified: Boolean|null, expectedRate: Integer|null, actualRate: Integer|null, status: enum, releasePrice, deliveryPrice)`:
- `actualRate = round((1 − effectiveUnitPrice/release) × 100)` (분모=**출고가 release**, 납품가 아님). release 결측/0 → null.
- `verified`=`확인` 플래그(true/false), 판정 불가 시 null + status 사유.
- `status`(사유 보존): `VERIFIED`(판정됨) · `NOT_FOUND`(라벨 미매칭) · `AMBIGUOUS`(다의 409) · `MISSING_REFERENT`(매칭됐으나 정가 결측·부분성공 차집합) · `OUT_OF_SCOPE`(싱글 본체 세트/약정DC 의존 = S1.5 대기).

### 6.4.2 분류 (현대 파생 — itemName 토큰 + 정규식만, OLD 시트/카탈로그 미사용)
레거시는 priceMap OLD·카탈로그로 zone/`_isOld`/`_cls` 판정. 현대 S2b는 **itemName 파생 토큰 + itemName/token 정규식**만 사용(S1d/S1.5 미도입). 판정 우선순위(레거시 668~734 분기 순서 유지):
1. **운임/절삭**: `itemName =~ /(운임|절삭)/` → `verified=true` (referent 무관).
2. **구형 50%**: `modelToken =~ /^(AM|NJ|NS|AVX)/` → `verified = (actualRate === 50)`. ※ 레거시 `_isOld` 게이트는 OLD 시트 의존(S1d)이나, 이 토큰 접두 자체가 구형 식별자라 현대는 토큰 정규식으로 대체(파리티 근사·주석 명시).
3. **액세서리**: `itemName =~ /(유연호스|발통세트|일자발|방진가대)/` OR `modelToken =~ /^AXJ/` → `verified = (effectiveUnitPrice === delivery)` (정수원 완전일치·납품가). ※ 구형 비-AM/NJ/NS/AVX "기타"(unit===delivery)는 OLD 식별 불가(S1d) → 본 액세서리 분기 또는 default로 흡수, 별도 재현 안 함.
4. **멀티**: `modelToken` 이 홈/상업 멀티 접두(레거시 `^AM`&`[6]∈{X,N}`=COMM_MULTI·`^AJ`&`[6]∈{X,N}`=HOME_MULTI) OR `itemName =~ /(멀티|MULTI)/i`:
   - `fixedDc != null` → `expectedRate = round(fixedDc)` (**이미 percent·재×100 금지**), `verified = (actualRate === expectedRate)`.
   - `fixedDc == null` → **약정DC(commRate/homeRate)는 S1.5** → 레거시 폴백 `expectedRate = 45`, `verified = (actualRate === 45)`. (거래처 약정DC 미도입이라 폴백만 재현·정합.)
5. **싱글 본체/부속(세트 매칭)**: `INDOOR/OUTDOOR/SUB_INDOOR` riUsage 완전일치 = **역-BundleExpander(S1.5)** → `status=OUT_OF_SCOPE`, `verified=null`. 단 레거시 "싱글 부속 본체無→true"·"싱글 기타→true" 무조건 true 분기는 세트 무관이나 `_cls` 분류(PANEL/REMOTE/MATERIAL) 필요 → S2b는 세트 분류 미도입이라 **OUT_OF_SCOPE 로 보존**(과잉 true 판정 회피·정직).
6. **default(기타)**: 위 어디에도 안 걸리면 레거시 `확인=true` → `verified=true`.

> **게이트**: 매칭 실패(NOT_FOUND/AMBIGUOUS) 또는 정가 결측(MISSING_REFERENT)이면 판정 이전에 사유 status로 단락(short-circuit)·`verified=null`. `isMultiApplied`(레거시 전역 토글)=S2b 기본 true(항상 재검증)·토글 노출은 S4.

### 6.4.3 🚨 파리티 가드 (리뷰 필수 대조)
1. **VAT 기준 일치(최상위 리스크)**: 레거시 `rate = 1 − 단가(VAT포함)/price`. 현대 `actualRate = 1 − (supplyAmount/qty)/release`이며 supplyAmount=**VAT제외 순액**. 비율은 분자·분모 VAT 기준이 같으면 불변이나, **release(price_history)가 순액인지 VAT포함인지 확인 필수** — 불일치 시 rate가 VAT배율만큼 틀어짐. PriceHistorySeeder/legacy 시트 대조로 순액 확정 or 정규화. (구현·리뷰 필수 검증 항목.)
2. **fixedDc 스케일**: 레거시 `round(_fixedDc×100)`(_fixedDc=분수 0.45) / 현대 `Product.fixedDiscountRate`=percent 45.00 저장(V20 ×100·CHECK 0~100) → **재×100 금지**·`round(fixedDc)` 그대로 expectRate. [[feedback_mock_value_format_be_parity]] 계열.
3. **null≠0 fixedDc**: null=미설정(→45 폴백)·0=유효값(expectRate 0). Map 생략(productId 미존재)과도 구분.
4. **정수 반올림**: 레거시 `Math.round`(양수 half-up). 현대 `BigDecimal.setScale(0, HALF_UP)`. 양수 할인율은 동등·음수 .5 경계는 JS(toward +∞) vs HALF_UP(away 0) 상이(과충전=음수 rate는 희소·주석).
5. **정수원 완전일치**: `effectiveUnitPrice === delivery` 는 `money_to_int_` 정수화 후 비교(레거시 `money_to_int_`=정수원). BigDecimal `compareTo`==0 on 정수화 값.
6. **부분성공 결측**: applicable-bulk/fixed-discount-bulk가 결측 productId 생략(S2a 계약) → keySet 차집합=`MISSING_REFERENT`(재검증 대상외·NOT 오류). qty=0 방어(0나눗셈→actualRate null).

### 6.4.4 배선 (`getTaxInvoiceDailyDetail`)
1. `byModel` 집계 시 그룹별 `itemName`(라벨) 보존(현행 key=itemName·OK). qty·supplyAmount 합계로 effectiveUnitPrice 도출.
2. distinct 라벨마다 `resolveByLabel(label)` → productId 수집(dedupe). NOT_FOUND/AMBIGUOUS 라벨은 사유 보존.
3. MATCHED productId 집합으로 `applicablePrices(ids, asOf=date)` + `fixedDiscountRates(ids)` **각 1회 벌크**(N+1 회피·REFERENT_BATCH_MAX 500 준수·초과 시 청크).
4. 그룹별 `DiscountRevalidator.revalidate(...)` → 새 `DailyProductLine` 필드 채움.
5. 현행 `ensureProductClientReachable()` placeholder 제거(실 호출로 대체). `@Transactional(readOnly=true)` 유지.
6. **asOf = date**(마감일). isBeforeHike 토글 미도입(S1a asOf 로딩계층이 인상전/후 흡수·판정식 토글 아님) — S4에서 asOf 파라미터화.

### 6.4.5 DTO 변경
`DailyProductLine` 확장(하위호환 — 기존 4필드 유지 + 신규 append):
```
record DailyProductLine(String productName, String modelName, BigDecimal quantity, BigDecimal supplyAmount,
    BigDecimal releasePrice, BigDecimal deliveryPrice, Integer expectedRate, Integer actualRate,
    Boolean verified, String revalidationStatus)
```
- `SALES_SLIP`/`PURCHASE_SLIP` 경로(`toProductLines`)는 신규 필드 null 채움(S2b 미적용·S2c 확장). `totalDiscount` = 현행 placeholder ZERO 유지(S2c).
- controller(`AccountingReportController`) 무변경(record 전체 반환). FE 무변경(신규 필드 optional).

### 6.4.6 테스트 전략 + 라이브 QA
- **엔진 단위 테스트(핵심·파리티)**: `DiscountRevalidatorTest` — 6분기 전수 + 파리티 가드 6종 경계값(fixedDc null/0/percent·VAT·정수반올림 .5·정수원일치·결측·qty0). **실 레거시 라벨 픽스처**(S1b `계산서 발행용.xlsx` 267 라벨 재사용) 로 토큰 추출 파리티. [[feedback_no_fake_data_ever]] — 합성 아닌 실 라벨.
- **서비스 IT**: `getTaxInvoiceDailyDetail` @MockBean ProductClient(resolveByLabel/applicablePrices/fixedDiscountRates stub) → 벌크 1회 호출·필드 population·NOT_FOUND/AMBIGUOUS/MISSING_REFERENT status 검증. `--rerun-tasks --no-build-cache` genuine. [[feedback_it_mockbean_external_clients]].
- **라이브 QA(정직)**: Docker 실 accounting+product·mock off. dev product_db=삼성 유통품(AC 모델코드 부재·S1b blocker) → 실 AC 라벨→productId hit는 IT 픽스처 genuine·라이브는 **엔드포인트 배선 + status=NOT_FOUND 실증**(S1b/S1c 선례·명시적 유예). 단 **dev seed 제품 중 model_code+price_history 보유분(있으면)으로 세금계산서 라인 구성 → 실 verified 판정 라이브 1케이스 시도**(genuine dev 데이터·합성 금지). Swagger/curl + (가능시) GUI 스샷 매 라운드.

### 6.4.7 파일 (예상)
- 신규: `service/DiscountRevalidator.java`(엔진) · `service/ModelTokenExtractor`(accounting 포팅 or shared/common 이관·리뷰 판단) · `DiscountRevalidatorTest`.
- 수정: `MonthEndCloseService.getTaxInvoiceDailyDetail`(배선) · `DailyClosingDetailResponse.DailyProductLine`(필드) · `DailyClosingDetailServiceTest`(기존 4필드 assert 갱신) · 신규 서비스 IT.
- dev-report `docs/dev-reports/2026-07-13-773-s2b-revalidation-engine.md` · 본 스펙 · README/ROADMAP 동기화.

### 6.5 R1 리뷰 disposition (2026-07-13 · Opus 5-agent + Codex 적대) — 파리티 정정
> Opus 4차원(FE/BE/Design/DevOps) + BE 심층 리뷰가 **HIGH 파리티 blocker 2건 포착·수정**. §6.4 초안의 두 지점을 정정한다.
- **VAT 기준(정정)**: §6.4.1/§6.4.3-1 의 actualRate 분자는 `supplyAmount/quantity`(순액)가 아니라 **`(공급가액+세액)/수량`(VAT 포함)** 이어야 레거시 `단가(VAT포함)/출고가` 산식과 파리티가 성립(출고가 VAT 기준 무관·면세 자연수렴). ModelAccumulator vatAmount 누적으로 fix.
- **구형50% 게이트(정정)**: §6.4.2-2 "구형 50% = ^(AM|NJ|NS|AVX)" 는 **AM 상업멀티를 오분류**(실 fixture AM 18.8% 전부 zone marker 만족). OLD_FIFTY 를 `&& !isLegacyMultiPrefix` 로 가드 → AM/AJ+[X/N] 은 멀티 분기·50% 는 진짜 구형 접두(NJ/NS/AVX, 현행 dev 부재)에만. fix.
- **판정불가 status 신설**: qty=0 유효단가 산출 불가 → `NOT_MEASURABLE`(verified=null·판정실패 false 와 구분). MISSING_REFERENT 게이트는 출고가 결측만(fixedDc 결측=45 폴백). @Schema 6필드·enum 노출.
- **이연(리뷰어 non-blocking)**: HTTP 레이어 IT=S2c(controller passthrough 동반)·라벨 resolveByLabel N+1 bulk endpoint=후속·FE 타입/mock parity=S2c/S4(FE 미렌더). 서비스 레벨 @Spy 엔진+전 status IT로 로직 커버.
- **Codex 적대검증 R2**: 하단 진행(순차·0수렴까지).

---

## 6.6 S2c 엔지니어링 스펙 (2026-07-13 · 회사PC 순차) — SALES/PURCHASE 재검증 + HTTP IT + FE parity

> S2b(#807 `72a28877`) 머지로 엔진·TAX_INVOICE 배선·DTO 6필드 완비. S2c = 나머지 소비·커버리지·계약 정합. PM 자율(read-time·정책 게이트 불요), 단 totalDiscount 정의만 개발책임자 확인 대상(하단).

### 6.6.0 스코프 (PM 결정)
1. **SALES_SLIP/PURCHASE_SLIP 재검증** — 현재 `getSalesSlipDailyDetail`/`getPurchaseSlipDailyDetail`는 `toProductLines`(신규필드 null-fill). S2b 재검증을 이 2경로에도 적용.
2. **재검증 배선 공유 리팩터** — `getTaxInvoiceDailyDetail` 인라인 배선(라벨해소→벌크 referent→그룹 재검증→DailyProductLine)을 private 헬퍼 `revalidateProductLines(Map<String,ModelAccumulator> byModel, LocalDate asOf)` 로 추출. 3경로 공용.
3. **`accumulateProduct` + vatAmount** — SALES/PURCHASE 라인도 `line.getVatAmount()` 누적(SalesAccountingSlipLine/PurchaseAccountingSlipLine 둘 다 `vatAmount` 보유·확인). effectiveUnitPrice=(공급+세액)/수량 파리티 유지.
4. **HTTP 레이어 IT** — @SpringBootTest/@AutoConfigureMockMvc(AbstractPostgresIT)·@MockBean ProductClient. TAX_INVOICE(+SALES_SLIP) 세금계산서/전표 시드·GET /accounting/closings/daily 로 재검증 필드 직렬화+권한 게이트 검증(S2b 리뷰 커버 갭 해소).
5. **FE 타입/mock parity** — `clients/desktop/api/closingApi.ts` `DailyProductLine` +6 nullable 필드(release/delivery: `string|null`·expected/actual: `number|null`·verified: `boolean|null`·revalidationStatus: literal union `'VERIFIED'|'NOT_FOUND'|'AMBIGUOUS'|'MISSING_REFERENT'|'NOT_MEASURABLE'|'OUT_OF_SCOPE'|null`). `mock.ts` fixture productSummaries에 6필드 BE-parity 값. **렌더 없음**(DailyClosingPage 미렌더=S4). typecheck 통과.

### 6.6.1 🟡 totalDiscount = 이연 (개발책임자 '총 할인' 정의 확인)
- 스펙 초안이 S2c에 "totalDiscount 실계산"을 뒀으나 정의가 **정책성**이라 이연·placeholder ZERO 유지·PR에 결정 요청 게시:
  - **대상 그룹**: 재검증된 제품 그룹만? 운임/절삭·기본 서비스품목은 "출고가 대비 할인" 무의미 → 제외 여부.
  - **산식**: revalidation 기반 `Σ(releasePrice×수량 − (공급가액+세액))`(출고가 대비 gross)? 아니면 journal 할인계정 기반?(현 서비스에 할인계정/메모 개념 부재 확인 → journal 기반 불가) · overcharge(음수) 허용?
  - **VAT 기준**: 출고가 gross 기준(rate 산식 정합).
  - FE 미렌더라 긴급도 낮음. → **개발책임자 정의 확정 후 별도 처리**(S2c 또는 후속). read-time·비-원장이라 무결성 무관.

### 6.6.2 파리티/주의
- SALES/PURCHASE 라벨 = `productName`(productCode="MIG4" 하드코딩·조인키 무용 §5.1). resolveByLabel(productName).
- `toProductLines`(현행)는 리팩터 후 미사용 시 제거. 엔진·referent 계약은 S2b 그대로(무변경).
- dev 데이터: `sales_accounting_slip_lines` 0행(§5.5)→SALES/PURCHASE 라이브 QA 불가(IT genuine·라이브는 TAX_INVOICE AM160 유지·정직 기록).

### 6.6.3 테스트
- 서비스 단위(`DailyClosingDetailServiceTest`): SALES_SLIP/PURCHASE_SLIP 경로 @Mock ProductClient로 재검증 필드 population·accumulateProduct vatAmount.
- **HTTP IT 신규**: MockMvc 3소스 재검증 필드 직렬화·@MockBean 격리·권한(accounting.reports).
- FE typecheck(`npm run typecheck`). genuine `--rerun-tasks --no-build-cache`.

### 6.6.4 캐논
조기 PR(연관 #773) → Codex 구현 → Opus 5-agent+STEP/Codex 적대 순차 0수렴 → 라이브 QA(TAX_INVOICE 재검증 회귀·Swagger) → dev-report → 머지.

### 6.6.5 R1 리뷰 disposition (2026-07-13 · Opus 5-agent[FE/BE/Design/DevOps]+BE심층)
- **0 blocker.** 리팩터 byte-for-byte 무변경(BE 확인)·SALES/PURCHASE 배선/vatAmount 정합·신규 IT genuine(CI 아티팩트 실증)·@MockBean 완전·마이그 무변경.
- **[fix] FE 타입 실직렬화 정합**: `DailyProductLine`의 releasePrice/deliveryPrice/quantity/supplyAmount는 BigDecimal→**JSON number**(라이브 실 응답 실측 확증·Jackson 기본)라 `string`→`number`, modelName→`string|null`. mock을 엔진 정합(AM 상업멀티 45%)·합계 정합·숫자화. (부모 DailyClosingDetail totals=렌더되어 스코프 밖·유지.)
- **[flag] PURCHASE(매입) 재검증 의미론**: release/delivery/fixedDc referent 는 삼한 **판매(출고)** 기준이라, 매입전표/매입 세금계산서 재검증의 verified/expectedRate 는 **참고용**(정식 매입단가 감사 아님). pre-existing(S2b TAX_INVOICE PURCHASE)·3경로 일관. DTO Javadoc 캐벗 추가·**S4 렌더 전 개발책임자 확정 대상**(매입 노출 방식·별도 매입 referent 여부).
- **개발책임자 확인 2건(비차단·read-time)**: ① totalDiscount '총 할인' 정의(§6.6.1) ② PURCHASE 재검증 노출.
- **[정보·수용]** IT productSummaries 인덱스 순서(byModel LinkedHashMap·소량 same-tx 삽입순·CI 통과·기존 코드베이스 패턴)·N+1 라벨(S2b 기이연 파급).
- Codex 적대검증 R2 순차 진행.
