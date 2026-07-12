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

### D5 — 재계산 계층
회계 문서(productId 없음) fuzzy match vs 상류(견적/주문 productId 있음) vs 이카운트 raw import 경로.

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
