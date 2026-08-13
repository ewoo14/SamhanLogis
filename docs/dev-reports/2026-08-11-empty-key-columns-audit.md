# 견적 할인율 미보존 26라인 · 제품 `product_code` NULL 388건 감사

## 1. 결론(4줄)

- ① **26라인의 성격:** 전건이 `dev_manager`·`dev_sales`·`dev_master`가 만든 명시적 QA/LOADTEST/변환 probe이며, 사용자가 입력한 할인율이 저장 중 사라진 실업무 표본은 **0라인**이다.
- ① **26라인의 도달성:** `unit_price_with_vat IS NULL`은 할인율 NULL이 아니라 레거시 공급단가 입력 표지이고 26/26의 공급가·VAT·합계가 일치한다. 다만 정규화 견적에는 할인율 컬럼 자체가 없어 D-G2 역사 할인율은 계속 **판정 불가**다.
- ② **388건의 성격:** 물리 전체 NULL은 441건이고, 요청의 388은 `product_code IS NULL AND NOT is_deleted`인 활성 행이다. 전건 `lineage=SHEET`·`purchase_source IS NULL`이며 BUNDLE 343/SINGLE 45, 이카운트 적재분은 0건이다.
- ② **388건의 도달성:** 실제 문서 도달은 제품 2개·활성 수동 OUTBOUND DRAFT 전표 23건뿐이고 견적·주문은 0건이다. 현 API는 `productCode=model_name`으로 내고 조회도 model name fallback하므로 빈 응답 결함은 관측되지 않았지만, #1132 V37 72세트와 외부 전송 실표본은 0건이므로 그 경로는 **판정 불가**다.

## 2. 측정 조건

- 측정일·시간대: 2026-08-11 KST(Asia/Seoul).
- 1차 견적 측정 시각: `2026-08-11 09:17:43.443558+09`.
- 1차 제품 측정 시각: `2026-08-11 09:18:26.083701+09`.
- 전표 도달 재확인: `2026-08-11 09:16:47.530754+09`; inventory 재확인: `2026-08-11 09:16:55.646840+09`.
- 최종 수치 재검증: `2026-08-11 09:26:29.322920+09`(product), `2026-08-11 09:26:29.490865+09`(estimate).
- 모든 DB SQL은 `BEGIN TRANSACTION READ ONLY` 및 `statement_timeout='30s'` 안에서 실행했다. 임시 테이블·DB write는 사용하지 않았다.
- 코드·스키마 변경, git 조작, 컨테이너 lifecycle 조작, 서비스 조작, 배포는 하지 않았다. 이 문서만 산출물로 추가했다.
- 물리 컬럼 `products.product_code`와 DTO/요청 필드명 `productCode`는 이름은 같지만 값의 권위축이 다르므로 별도로 판정했다.

## 3. 배정 ① — 26라인은 정확히 무엇인가

### 3.1 먼저 센 월·일/작성자 분포

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT clock_timestamp() AS measured_at;

SELECT date_trunc('month',e.created_at) AS created_month,e.created_by,
       COUNT(DISTINCT e.id) AS estimate_count,COUNT(el.id) AS line_count,
       COALESCE(SUM(el.line_total),0) AS line_total
FROM estimates e
JOIN estimate_lines el ON el.estimate_id=e.id
WHERE NOT e.is_deleted AND NOT el.is_deleted
  AND el.unit_price_with_vat IS NULL
GROUP BY 1,2 ORDER BY 1,2;

SELECT e.created_at::date AS created_date,e.created_by,
       COUNT(DISTINCT e.id) AS estimate_count,COUNT(el.id) AS line_count,
       COALESCE(SUM(el.line_total),0) AS line_total
FROM estimates e
JOIN estimate_lines el ON el.estimate_id=e.id
WHERE NOT e.is_deleted AND NOT el.is_deleted
  AND el.unit_price_with_vat IS NULL
GROUP BY 1,2 ORDER BY 1,2;
COMMIT;
```

월 분포 원문 결과:

| created_month | created_by | estimate_count | line_count | line_total |
|---|---|---:|---:|---:|
| 2026-07-01 | `a0000000-0000-0000-0000-000000000003` | 1 | 2 | 231,000.00 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000001` | 6 | 6 | 5,994.00 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000003` | 2 | 2 | 2.00 |
| 2026-08-01 | `a0000000-0000-0000-0000-000000000004` | 18 | 18 | 1,570,250.00 |

일/작성자 원문 결과:

| created_date | created_by | estimate_count | line_count | line_total |
|---|---|---:|---:|---:|
| 2026-07-16 | `a0000000-0000-0000-0000-000000000003` | 1 | 2 | 231,000.00 |
| 2026-08-06 | `a0000000-0000-0000-0000-000000000003` | 2 | 2 | 2.00 |
| 2026-08-07 | `a0000000-0000-0000-0000-000000000004` | 6 | 6 | 0.00 |
| 2026-08-08 | `a0000000-0000-0000-0000-000000000004` | 12 | 12 | 1,570,250.00 |
| 2026-08-09 | `a0000000-0000-0000-0000-000000000001` | 6 | 6 | 5,994.00 |

활성 NULL은 현재 **28라인**이다. 이 중 `2026/07/16-27`의 2라인은 직전 보고서가 이미 분리한 QA797 라인(`QA797-PART-01/02`, 합계 231,000원)이다. 이를 제외한 집합이 직전 측정의 26라인이다.

작성자 계정 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT id,login_id,display_name,enabled,created_at,created_by
FROM accounts
WHERE id IN (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'a0000000-0000-0000-0000-000000000003'::uuid,
  'a0000000-0000-0000-0000-000000000004'::uuid
)
ORDER BY id;
COMMIT;
```

| created_by | login_id | display_name |
|---|---|---|
| `a000…001` | `dev_master` | `[DEV-SEED] 개발마스터` |
| `a000…003` | `dev_manager` | `[DEV-SEED] 개발매니저` |
| `a000…004` | `dev_sales` | `[DEV-SEED] 개발영업` |

### 3.2 26라인 전건

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT e.estimate_no,e.created_at,e.created_by,e.memo,
       el.model_name,el.quantity,el.unit_price,el.unit_price_with_vat,
       el.supply_amount,el.vat_amount,el.line_total,e.total_amount
FROM estimates e
JOIN estimate_lines el ON el.estimate_id=e.id
WHERE NOT e.is_deleted AND NOT el.is_deleted
  AND el.unit_price_with_vat IS NULL
  AND e.estimate_no <> '2026/07/16-27'
ORDER BY e.created_at,el.created_at;
COMMIT;
```

| 견적번호 | created_at | created_by | memo | 모델 | unit_price | supply | VAT | line/header total |
|---|---|---|---|---|---:|---:|---:|---:|
| `2026/08/06-1` | 2026-08-06 03:34:36.156926 | `dev_manager` | `QA-S17-1075-PROVENANCE-ROUNDTRIP` | AJ040RXH4BC1 | 1 | 1 | 0 | 1 / 1 |
| `2026/08/06-2` | 2026-08-06 03:35:04.085930 | `dev_manager` | `QA-S17-1075-PROVENANCE-UTF8-ROUNDTRIP` | AJ040RXH4BC1 | 1 | 1 | 0 | 1 / 1 |
| `2026/08/07-6` | 2026-08-07 18:33:42.738234 | `dev_sales` | `LOADTEST-1-1` | 00019 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-7` | 2026-08-07 18:33:54.703918 | `dev_sales` | `LOADTEST-1-2` | 0002002 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-8` | 2026-08-07 18:34:08.477612 | `dev_sales` | `LOADTEST-2-2` | 00024 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-9` | 2026-08-07 18:34:12.612727 | `dev_sales` | `LOADTEST-1-4` | 00006 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-10` | 2026-08-07 18:34:19.958982 | `dev_sales` | `LOADTEST-1-5` | EG-SOU05M | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-11` | 2026-08-07 18:34:29.695681 | `dev_sales` | `LOADTEST-2-4` | 00019 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-13` | 2026-08-08 02:24:02.835062 | `dev_sales` | `LOADTEST-2-3` | 00016 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-14` | 2026-08-08 02:24:03.494483 | `dev_sales` | `LOADTEST-1-3` | 00006 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-15` | 2026-08-08 03:38:11.950071 | `dev_sales` | `LOADTEST-1-1` | 00023 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-16` | 2026-08-08 03:38:42.672312 | `dev_sales` | `LOADTEST-1-4` | 00009 | 683,000 | 683,000 | 68,300 | 751,300 / 751,300 |
| `2026/08/07-17` | 2026-08-08 03:45:45.192398 | `dev_sales` | `LOADTEST-2-1` | 00017 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-18` | 2026-08-08 03:46:05.917973 | `dev_sales` | `LOADTEST-1-3` | 00004 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-19` | 2026-08-08 03:46:28.991820 | `dev_sales` | `LOADTEST-1-5` | 00004 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-20` | 2026-08-08 03:46:31.751942 | `dev_sales` | `LOADTEST-1-6` | 0002002 | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-21` | 2026-08-08 03:47:08.710533 | `dev_sales` | `LOADTEST-1-1` | EG-SOU05M | 0 | 0 | 0 | 0 / 0 |
| `2026/08/07-22` | 2026-08-08 04:11:28.041650 | `dev_sales` | `LOADTEST-2-2` | 00005 | 742,500 | 742,500 | 74,250 | 816,750 / 816,750 |
| `2026/08/08-1` | 2026-08-08 21:08:56.067538 | `dev_sales` | `S24-1123-seven-path-estimate` | AC060CX1DBC1 | 1,000 | 1,000 | 100 | 1,100 / 1,100 |
| `2026/08/08-2` | 2026-08-08 22:02:56.726610 | `dev_sales` | `S26-1123-estimate-convert-probe` | 0000098 | 1,000 | 1,000 | 100 | 1,100 / 1,100 |
| `2026/08/09-1` | 2026-08-09 22:25:59.885138 | `dev_master` | `R3 GUI 견적 전표 변환` | AJ060MXHNBC1 | 909 | 909 | 90 | 999 / 999 |
| `2026/08/09-2` | 2026-08-09 22:27:01.482186 | `dev_master` | `R3 GUI 견적 전표 변환` | AJ060MXHNBC1 | 909 | 909 | 90 | 999 / 999 |
| `2026/08/09-3` | 2026-08-09 22:27:25.557137 | `dev_master` | `R3 GUI 견적 전표 변환` | AJ060MXHNBC1 | 909 | 909 | 90 | 999 / 999 |
| `2026/08/09-4` | 2026-08-09 22:28:12.256376 | `dev_master` | `R3 GUI 견적 전표 변환` | AJ060MXHNBC1 | 909 | 909 | 90 | 999 / 999 |
| `2026/08/09-5` | 2026-08-09 22:48:23.325977 | `dev_master` | `R3 GUI 견적 전표 변환` | AJ060MXHNBC1 | 909 | 909 | 90 | 999 / 999 |
| `2026/08/09-6` | 2026-08-09 22:52:03.229788 | `dev_master` | `R3 GUI 견적 전표 변환` | AJ060MXHNBC1 | 909 | 909 | 90 | 999 / 999 |

성격별 숫자는 QA provenance 2 + LOADTEST 16 + #1123 전환 probe 2 + R3 GUI 변환 QA 6 = **26**이다. `unit_price=0`은 14라인, 0보다 큰 값은 12라인이다. NULL은 0을 뜻하지 않는다.

tracked 직접 근거:

- `docs/dev-reports/2026-08-06-1075-s17-fix-directive.md:127` — 8월 6일 두 provenance QA 생성.
- `docs/dev-reports/2026-08-08-1092-s7-order-written-date-diagnosis.md:50,54` — LOADTEST 문서군.
- `docs/dev-reports/2026-08-08-1123-s24-merge-reconvergence.md:253`, `2026-08-08-1123-s26-merge-reconvergence.md:108,367` — 두 #1123 probe.
- `clients/desktop/playwright/1156-r3-sol-real-qa/1156-r3-sol-real-qa.spec.ts:178` — `R3 GUI 견적 전표 변환` 메모 원문.

따라서 26건은 created_at·created_by·memo·tracked QA 산출물이 서로 수렴한다. 실업무로 분류되는 행은 0이다.

## 4. 배정 ① — “미보존”의 정확한 뜻과 금액 대조

### 4.1 할인율 컬럼은 NULL/0이 아니라 존재하지 않는다

`estimate_lines`에는 `discount_rate`, `discount_amount`, 고정/가변 DC 컬럼이 없다. 직전 보고서의 “미보존 26”은 **할인율 컬럼 26개가 NULL**이라는 뜻이 아니라, 현재 정가와 대조할 VAT 포함 입력단가 `unit_price_with_vat`가 NULL이라 역사 할인율을 재계산할 수 없다는 뜻이다.

- `services/slip-service/src/main/resources/db/migration/V35__add_estimate_line_unit_price_with_vat.sql:1-8` — nullable/no-default이고 NULL을 legacy VAT 미포함 공급단가로 명시한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/domain/EstimateLine.java:151-165,182-190` — 평문 `create`는 `unitPrice`만 넣고 `unitPriceWithVat`를 쓰지 않는다.
- 같은 파일 `:202-219` — VAT 포함 경로만 `line.unitPriceWithVat = ...`를 쓴다.
- 같은 파일 `:227-251` — 권위 공급가/VAT/합계 경로는 합계/수량으로 `unitPriceWithVat`를 쓴다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java:113-122` — `priceVatInclusive`와 권위 금액 여부에 따라 세 factory 중 하나를 선택한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/dto/CreateEstimateRequest.java:32-49` — 요청 필드는 단가·VAT포함 여부·공급가·VAT·합계이고 할인율은 없다.

정규화 견적 라인에 **할인율을 저장하는 지점은 0곳**이다. 저장되는 것은 최종 단가/금액과 단가 도메인뿐이다.

웹 종합견적 스냅샷은 별도다. 할인 관련 저장 지점 전수:

- `clients/web/estimate-app/views/index.ejs:16979-16995` — `takeSnapshot()`이 모든 input/select/textarea를 수집하므로 `home_rate`, `comm_rate`도 `form`에 들어간다.
- 같은 파일 `:17051-17077` — 모델별 `homeDc[m]`/`commDc[m]`의 `{fix,var}`를 수집한다.
- 같은 파일 `:17154-17167` — `homeDc`, `commDc`를 snapshot core에 넣는다.
- 같은 파일 `:17822,18087-18092` — snapshot 상태와 합계를 `saveQuoteSnapshot`으로 보낸다.
- `clients/web/estimate-app/lib/code.js:2470-2484` — internal snapshot POST/PUT.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/domain/QuoteSnapshot.java:49-80,84-91` — JSONB `snapshot_state`와 공급가/VAT/총액 저장·수정.

단, tier 계산률은 `clients/web/estimate-app/views/index.ejs:13959`의 `window.LATEST_CALC_RATES`에 임시로 놓인 뒤 기본률을 복구한다(`:13959-13970`). 따라서 snapshot의 폼 기본률만으로 당시 tier 적용률을 역사적으로 확정할 수 없다. 이것이 D-G2 판정 불가의 본체이며, 위 26라인의 저장 결함과는 다른 문제다.

### 4.2 사용자가 할인을 넣었는데 저장이 안 됐는가

**아니다. 이 26라인에서는 그런 표본이 0이다.** 요청 DTO에 할인율 입력 자체가 없고, 26라인은 전건 legacy 공급단가/권위 금액 QA 경로다.

금액 정합 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT COUNT(*) AS lines,
       COUNT(*) FILTER (WHERE el.supply_amount=el.unit_price*el.quantity) AS supply_matches,
       COUNT(*) FILTER (WHERE el.line_total=el.supply_amount+el.vat_amount) AS line_total_matches,
       COUNT(*) FILTER (WHERE e.total_amount=el.line_total) AS single_line_header_matches,
       COALESCE(SUM(el.supply_amount),0) AS supply_amount,
       COALESCE(SUM(el.vat_amount),0) AS vat_amount,
       COALESCE(SUM(el.line_total),0) AS line_total
FROM estimates e
JOIN estimate_lines el ON el.estimate_id=e.id
WHERE NOT e.is_deleted AND NOT el.is_deleted
  AND el.unit_price_with_vat IS NULL
  AND e.estimate_no <> '2026/07/16-27';
COMMIT;
```

원문 결과:

```text
lines=26
supply_matches=26
line_total_matches=26
single_line_header_matches=26
supply_amount=1,432,956.00
vat_amount=143,290.00
line_total=1,576,246.00
```

화면 코드 대조도 같은 값을 소비한다.

- `clients/desktop/src/renderer/routes/EstimateDetailPage.tsx:292-297`은 `unitPriceWithVat ?? unitPrice`를 표시한다.
- `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:260-270`은 NULL 라인을 legacy 공급단가로 hydrate한다.
- 같은 파일 `:1821-1839`는 사용자가 건드리지 않은 legacy 라인을 `priceVatInclusive=false`로 재전송한다.

따라서 공급가·VAT·라인합계·헤더합계는 화면 계약과 DB가 다르지 않다. 다만 상세 표의 헤더가 `단가(VAT포함)`인데 legacy fallback으로 공급단가를 표시하는 의미상 라벨 불일치는 존재한다. 이것은 합계 소실이나 “할인을 넣었는데 저장 안 됨”의 증거는 아니다.

## 5. 배정 ② — 활성 `product_code IS NULL` 388건의 출처

### 5.1 전체/활성 및 월·일/작성자·purchase_source 분포

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT clock_timestamp() AS measured_at;

SELECT COUNT(*) AS all_rows,
       COUNT(*) FILTER (WHERE product_code IS NULL) AS all_null,
       COUNT(*) FILTER (WHERE product_code='') AS all_empty_string,
       COUNT(*) FILTER (WHERE product_code IS NULL AND NOT is_deleted) AS active_null
FROM products;

SELECT product_type,is_deleted,COUNT(*) AS rows
FROM products
WHERE product_code IS NULL
GROUP BY product_type,is_deleted
ORDER BY product_type,is_deleted;

SELECT date_trunc('month',created_at) AS created_month,created_by,purchase_source,
       product_type,COUNT(*) AS rows
FROM products
WHERE product_code IS NULL AND NOT is_deleted
GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;

SELECT created_at::date AS created_date,created_by,purchase_source,product_type,
       COUNT(*) AS rows,MIN(created_at) AS first_created_at,MAX(created_at) AS last_created_at
FROM products
WHERE product_code IS NULL AND NOT is_deleted
GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;

SELECT lineage,COUNT(*) AS active_rows,
       COUNT(*) FILTER (WHERE product_code IS NULL) AS null_rows,
       COUNT(*) FILTER (WHERE product_code IS NOT NULL) AS nonnull_rows
FROM products
WHERE NOT is_deleted
GROUP BY lineage ORDER BY lineage;
COMMIT;
```

원문 결과:

```text
all_rows=3237 | all_null=441 | all_empty_string=0 | active_null=388

BUNDLE | is_deleted=false | 343
BUNDLE | is_deleted=true  | 16
SINGLE | is_deleted=false | 45
SINGLE | is_deleted=true  | 37

2026-07 | 00000000-0000-0000-0000-000000000001 | purchase_source=NULL | BUNDLE | 343
2026-07 | 00000000-0000-0000-0000-000000000001 | purchase_source=NULL | SINGLE | 43
2026-08 | a0000000-0000-0000-0000-000000000003 | purchase_source=NULL | SINGLE | 2

2026-07-28 | system actor | BUNDLE | 343 | 20:33:38.623006 .. 20:34:04.581442
2026-07-28 | system actor | SINGLE |  43 | 20:33:36.285549 .. 20:34:05.046584
2026-08-09 | dev_manager  | SINGLE |   2 | 19:34:29.480065 .. 19:34:44.528204

ECOUNT | active_rows=1963 | null_rows=0   | nonnull_rows=1963
SHEET  | active_rows=1121 | null_rows=388 | nonnull_rows=733
```

최종 재검증에서 활성 388건 중 `model_code IS NULL/blank`는 0건, `model_name IS NULL/blank`도 0건이었다. 즉 물리 `product_code`만 비어 있고 두 모델 축은 388/388 채워져 있다.

요청의 “전체 제품 NULL 388”은 물리 전체 행 조건이 아니라 **활성 조건을 포함한 수**다. 삭제행까지 세면 441이다.

7월 28일 386건의 분류 분포:

| product_category | product_type | rows |
|---|---|---:|
| COMMERCIAL_MULTI | BUNDLE | 72 |
| COMMERCIAL_MULTI | SINGLE | 20 |
| HOME_MULTI | SINGLE | 2 |
| SINGLE_PART | SINGLE | 21 |
| SINGLE_SET | BUNDLE | 271 |

8월 9일 두 행 원문:

| name | model_name/model_code | product_type | lineage | purchase_source | created_by |
|---|---|---|---|---|---|
| 판넬 (360CST / 원형) 미내장 | PC6NUNK1N | SINGLE | SHEET | NULL | `dev_manager` |
| 냉난방 프리미엄 스탠드 실내기 | AP110RNPPHH1 | SINGLE | SHEET | NULL | `dev_manager` |

`00000000-…-0001`은 auth `accounts`에 존재하지 않는 시스템 actor이고, 386건이 약 29초 안에 생겼다. 나머지 2건도 `dev_manager`가 15초 간격으로 실행한 SHEET 동기화 결과다. 화면 수기 등록이나 QA 품목명이 아니라 **시트 적재 계보**다.

코드 근거:

- `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:408-423` — `seedFromSheet`는 `lineage=SHEET`, `modelCode`를 쓰지만 `productCode`를 쓰지 않는다.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1312-1337` — 신규 시트 행을 위 factory로 저장한다.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:391-405` — 이카운트 INSERT는 `model_name`, `model_code`, `product_code` 모두 `:code`를 쓴다.
- 같은 파일 `:354-365,441-460,586-594` — 이카운트 활성 탐색/복구/갱신은 물리 `product_code`를 사용한다.

따라서 388건 중 이카운트 적재분 0, 시트 적재분 388, 화면 수기 등록으로 확인된 것 0, QA 산물로 확인된 것 0이다.

### 5.2 #1132 V37 72세트

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT installed_rank,version,description,script,installed_on,success
FROM flyway_schema_history
WHERE version IN ('36','37')
ORDER BY installed_rank;

SELECT COUNT(DISTINCT bc.bundle_product_id) AS v37_bundles,
       COUNT(*) AS v37_component_rows,
       COUNT(DISTINCT bc.bundle_product_id) FILTER (WHERE p.product_code IS NULL) AS null_code_bundles,
       COUNT(DISTINCT bc.bundle_product_id)
         FILTER (WHERE p.model_code IS NOT NULL AND p.model_name IS NOT NULL) AS model_fields_present_bundles
FROM bundle_component bc
JOIN products p ON p.id=bc.bundle_product_id
WHERE bc.modified_by='V37__PR1132';
COMMIT;
```

원문 결과:

```text
V36 | V36__add_classification_fixed_discount_rate.sql | 2026-08-11 08:39:59.483320 | success
V37 | V37__mark_active_bundle_components_default.sql  | 2026-08-11 08:39:59.522423 | success
v37_bundles=72 | v37_component_rows=137 | null_code_bundles=72 | model_fields_present_bundles=72
```

72세트 전부 2026-07-28 시스템 actor가 만든 SHEET/BUNDLE이고 `purchase_source IS NULL`이다.

주의: 공유 DB에는 V36/V37이 적용됐지만 현재 워크트리의 아래 read-only 명령은 두 파일을 0개로 냈다.

```powershell
git ls-files -- 'services/product-service/src/main/resources/db/migration/V36*' `
  'services/product-service/src/main/resources/db/migration/V37*'
# V36_V37_TRACKED_COUNT=0
```

즉 V37 대상은 DB의 `modified_by='V37__PR1132'`로 확정했지만, 현재 tracked 소스에서 V37 SQL 원문을 재현할 수는 없다.

## 6. 배정 ② — `product_code` 전수 사용처 분류

실행 원문:

```powershell
git grep -n -I -E 'productCode|product_code'
git grep -l -I -E 'productCode|product_code' -- clients services
```

결과는 repo 전체 2,080 매치 라인/456파일, `clients`·`services` 202파일이었다. 테스트·문서·migration·fixture를 제외한 runtime 후보는 111파일이다.

| runtime 범위 | 파일 수 | 분류 | 388 물리 NULL과의 관계 |
|---|---:|---|---|
| `clients/desktop` | 21 | ② 표시·입력, 일부 ① API 조회 입력 | 물리 컬럼을 직접 읽지 않고 API `productCode`를 소비한다. |
| `clients/mobile-staff` | 3 | ② 표시·입력 | 모델/품목 표시 및 문서 payload 필드다. |
| `clients/web` | 5 | ② 표시·견적 계산, ③ slip 내부 전송 | 견적 slip bridge는 legacy `PROD_CD`/모델값을 전송한다. |
| `services/accounting-service` | 11 | ① 자체 전표 snapshot/import 키, ② 표시 | 제품 마스터 물리 컬럼 조인이 아니다. 이카운트 **수신 import** 값이다. |
| `services/dashboard-service` | 5 | ① 자체 realtime stock 키, ② 표시 | dashboard 자체 테이블 코드다. |
| `services/inventory-service` | 35 | ① `stock_instances.product_code` 조회/FIFO 키, ② 표시 | product API가 준 노출 코드(현재 model name)를 별도 저장·조회한다. |
| `services/partner-order-service` | 2 | ③ 주문→전표 내부 전송 | `PartnerOrderConvertService.java:155`, merge `:171` 모두 `line.getModelName()`을 보낸다. |
| `services/product-service` | 15 | ① 물리 코드/alias/model 조회, ② API 표시, 이카운트 수신 | 388에 직접 닿는 유일한 물리 컬럼 소관이다. |
| `services/slip-service` | 14 | ③ inventory 내부 전송·보상, ② 전표 표시 | ProductSummary의 노출 `productCode`를 전달한다. |

### 6.1 runtime 후보 111파일 전수 목록

아래 분류는 파일의 `productCode/product_code` 심벌 용도다. ①은 조회·도메인 키, ②는 표시·DTO·snapshot, ③은 외부 또는 서비스간 전송이다. 한 파일이 둘 이상이면 복수 표기했다. 서로 다른 서비스의 동명 필드는 물리 `products.product_code`와 동일하다고 간주하지 않았다.

- ①② `clients/desktop/src/renderer/api/compensationFailureApi.ts`
- ①② `clients/desktop/src/renderer/api/dpsByProductApi.ts`
- ①② `clients/desktop/src/renderer/api/dpsCompareApi.ts`
- ①② `clients/desktop/src/renderer/api/inventory.ts`
- ①② `clients/desktop/src/renderer/api/mock.ts`
- ①② `clients/desktop/src/renderer/api/productApi.ts`
- ①② `clients/desktop/src/renderer/api/productCatalogApi.ts`
- ①② `clients/desktop/src/renderer/api/purchaseAccountingSlipApi.ts`
- ①② `clients/desktop/src/renderer/api/quantitySyncApi.ts`
- ①② `clients/desktop/src/renderer/api/safetyStockApi.ts`
- ①② `clients/desktop/src/renderer/api/salesAccountingSlipApi.ts`
- ①② `clients/desktop/src/renderer/api/slipAllocationSourceApi.ts`
- ①② `clients/desktop/src/renderer/components/SlipLineAllocationEditor.tsx`
- ①② `clients/desktop/src/renderer/routes/CompensationFailuresPage.tsx`
- ①② `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx`
- ①② `clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx`
- ①② `clients/desktop/src/renderer/routes/SafetyStockAlertsPage.tsx`
- ①② `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipFormPage.tsx`
- ①② `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx`
- ①② `clients/desktop/src/renderer/routes/warehouse/DpsByProductPage.tsx`
- ①② `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx`
- ①② `clients/mobile-staff/src/api/sales.ts`
- ①② `clients/mobile-staff/src/screens/sales/PartnerOrderCreateScreen.tsx`
- ①② `clients/mobile-staff/src/screens/sales/QuotationCreateScreen.tsx`
- ③ `clients/web/estimate-app/lib/slip-bridge.js`
- ①② `clients/web/estimate-app/public/quantitySync.js`
- ①② `clients/web/estimate-app/src/quantitySync.ts`
- ①② `clients/web/estimate-app/views/index.ejs`
- ①② `clients/web/order-app/src/quantitySync.ts`
- ② `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/PurchaseAccountingSlipLine.java`
- ② `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlipLine.java`
- ① `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/AbstractEcountSlipImporter.java`
- ① `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountSalesSlipLineImporter.java`
- ① `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/GasCategoryAxis.java`
- ② `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PurchaseAccountingSlipCreateAttemptService.java`
- ② `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipCreateAttemptService.java`
- ② `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CreatePurchaseAccountingSlipRequest.java`
- ② `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CreateSalesAccountingSlipRequest.java`
- ② `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/PurchaseAccountingSlipResponse.java`
- ② `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/SalesAccountingSlipResponse.java`
- ①② `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/controller/DashboardAdminController.java`
- ①② `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/domain/RealTimeStock.java`
- ①② `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/dto/RealTimeStockResponse.java`
- ①② `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/seed/DashboardSnapshotSeeder.java`
- ①② `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/service/RealTimeStockService.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/OutboundSlipLineSummary.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/ProductClient.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/ProductSummary.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/SlipServiceClient.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/StockInstance.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/DpsByProductPivotRow.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/InboundInspectionLineRepository.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/StockInstanceRepository.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/seed/StockBalanceSeeder.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/seed/StockInstanceSeeder.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsByProductService.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsCompareGroupBy.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsCompareService.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsExcelParser.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsExcelRow.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SafetyStockService.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SourceOperationJournalWriter.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockExcelExportService.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java`
- ① `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockInstanceController.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/BatchInboundInstanceRequest.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/CreateInstanceRequest.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/DpsByProductResponse.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/DpsByProductRow.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/RecallBatchInstanceRequest.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/ReleaseBatchInstanceRequest.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/ResellBatchInstanceRequest.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/ReserveBatchInstanceRequest.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/RowMismatch.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/SafetyStockAlertResponse.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/ShipBatchInstanceRequest.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/StockBalanceResponse.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/StockInstanceResponse.java`
- ①② `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/UnrecallBatchInstanceRequest.java`
- ③ `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java`
- ③ `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java`
- ①② `services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java`
- ①② `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java`
- ①② `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java`
- ① `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java`
- ①② `services/product-service/src/main/java/com/samhanair/logis/product/seed/HvacProductSeeder.java`
- ①② `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleComponentService.java`
- ① `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java`
- ① `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java`
- ①② `services/product-service/src/main/java/com/samhanair/logis/product/service/QuantitySyncRuleService.java`
- ①② `services/product-service/src/main/java/com/samhanair/logis/product/web/GlobalExceptionHandler.java`
- ①② `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java`
- ② `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/LookupByCodeRequest.java`
- ② `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java`
- ② `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySyncProductRef.java`
- ② `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySyncRuleRequest.java`
- ③ `services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java`
- ③ `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ProductSummary.java`
- ③ `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SerialCompensationFailure.java`
- ②③ `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishLineRequest.java`
- ②③ `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java`
- ②③ `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java`
- ③ `services/slip-service/src/main/java/com/samhanair/logis/slip/service/CompensationAlertNotifier.java`
- ③ `services/slip-service/src/main/java/com/samhanair/logis/slip/service/CompensationAuditWriter.java`
- ③ `services/slip-service/src/main/java/com/samhanair/logis/slip/service/CompensationRetryService.java`
- ③ `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java`
- ②③ `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java`
- ③ `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/CompensationFailureResponse.java`
- ②③ `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/OutboundSlipLineResponse.java`
- ②③ `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipSummary.java`

핵심 좌표별 판정:

1. **① 조회 키 — 물리 `products.product_code`:**
   - `ProductRepository.java:174-176`은 물리 코드 exact 조회/존재 확인이다.
   - `ProductService.java:228-250`은 `product_code exact → alias_code → model_name exact`를 모두 후보로 합친다. 따라서 물리 코드 NULL이어도 388건은 채워진 model name으로 조회된다.
   - `EcountProductImporter.java:354-365,391-405,441-460,586-594`는 이카운트 수신 identity로 물리 코드를 쓴다. 현재 ECOUNT 계보 NULL은 0건이다.
2. **② 표시:**
   - `ProductSummaryResponse.java:145-156,203-205`는 응답 필드 `productCode`를 `p.getModelName()`으로 만든다. 388건은 model_name/model_code가 전부 있으므로 표시 응답이 빈 값이 아니다.
   - `QuantitySyncRuleService.java:656-661`도 model_code, 없으면 model_name을 쓴다.
   - desktop/mobile/inventory/dashboard의 `productCode`는 이 노출값 또는 각 서비스 자체 snapshot code다.
3. **③ 외부/서비스 간 전송:**
   - `SlipService.java:936,948,1144,1181,1236,1435,1476`은 ProductSummary의 `product.productCode()`를 inventory 요청에 보낸다. 현재 값은 model name이다.
   - `PartnerOrderConvertService.java:155`, `PartnerOrderMergeConvertService.java:171`은 저장된 `modelName`을 slip `productCode`로 보낸다.
   - 세금계산서 생성은 `TaxInvoiceService.java:106,160,318`의 필수 `itemName`을 사용하고 `TaxInvoiceLine`에는 제품 물리 코드 필드가 없다.
   - `ETaxClientImpl.java:126-131`은 NTS 실호출 자체가 미구현이며 실패를 반환한다. 따라서 물리 `product_code`가 빈 채 NTS로 나가는 현재 경로는 없다.
   - `EcountRemoteImportClient` 및 `EcountProductImporter`는 외부 **수신** 경로다. tracked runtime에서 제품 물리 `product_code`를 이카운트로 송신하는 경로는 발견되지 않았다.

따라서 “물리 `product_code`가 NULL이면 388건이 모든 조회에서 안 보인다”는 명제는 현 코드에서는 성립하지 않는다. 물리 exact 1단계는 실패하지만 model name fallback과 응답 매핑이 도달을 보존한다. 다만 다른 서비스의 동명 `productCode` 컬럼/DTO가 전부 같은 의미라는 뜻은 아니다.

## 7. 배정 ② — 문서 도달과 외부 전송 실측

388 UUID는 다음 SQL로 읽고 메모리에서 SQL `IN` literal로 확장했다. DB 간 임시 테이블·write는 사용하지 않았다.

```sql
BEGIN TRANSACTION READ ONLY;
SELECT id
FROM products
WHERE product_code IS NULL AND NOT is_deleted
ORDER BY id;
COMMIT;
```

확장된 388 UUID에 각 DB에서 실행한 SQL 본문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT 'estimate_lines' AS source,
       COUNT(DISTINCT el.product_id) AS products,
       COUNT(DISTINCT e.id) AS documents,COUNT(*) AS lines,
       COUNT(DISTINCT el.product_id) FILTER (WHERE NOT e.is_deleted AND NOT el.is_deleted) AS active_products,
       COUNT(DISTINCT e.id) FILTER (WHERE NOT e.is_deleted AND NOT el.is_deleted) AS active_documents,
       COUNT(*) FILTER (WHERE NOT e.is_deleted AND NOT el.is_deleted) AS active_lines
FROM estimate_lines el JOIN estimates e ON e.id=el.estimate_id
WHERE el.product_id IN (/* 위 SELECT의 388 UUID를 ::uuid literal로 전개 */);

SELECT 'slip_lines' AS source,
       COUNT(DISTINCT sl.product_id) AS products,
       COUNT(DISTINCT s.id) AS documents,COUNT(*) AS lines,
       COUNT(DISTINCT sl.product_id) FILTER (WHERE NOT s.is_deleted AND NOT sl.is_deleted) AS active_products,
       COUNT(DISTINCT s.id) FILTER (WHERE NOT s.is_deleted AND NOT sl.is_deleted) AS active_documents,
       COUNT(*) FILTER (WHERE NOT s.is_deleted AND NOT sl.is_deleted) AS active_lines,
       COALESCE(SUM(sl.line_total) FILTER (WHERE NOT s.is_deleted AND NOT sl.is_deleted),0) AS active_amount
FROM slip_lines sl JOIN slips s ON s.id=sl.slip_id
WHERE sl.product_id IN (/* 같은 388 UUID */);
COMMIT;
```

`partner_order_lines/partner_orders`, `order_lines/orders`에도 같은 COUNT 본문과 같은 388 UUID를 사용했다.

원문 결과:

| source | 전체 products/docs/lines | 활성 products/docs/lines | 활성 금액 |
|---|---|---|---:|
| estimate_lines | 0 / 0 / 0 | 0 / 0 / 0 | 0 |
| slip_lines | 2 / 23 / 25 | 2 / 23 / 23 | 4,893,096 |
| partner_order_lines | 0 / 0 / 0 | 0 / 0 / 0 | 0 |
| accounting order_lines | 0 / 0 / 0 | 0 / 0 / 0 | 0 |

도달한 두 제품:

| name | model_name/model_code | 물리 product_code | lineage | created_at/by |
|---|---|---|---|---|
| MCU KIT 6실형(HR, WATER HR용) | MCU-S6NDB1N | NULL | SHEET | 2026-07-28 20:34:03 / system actor |
| 실외기 일자발 | SI-AL600A | NULL | SHEET | 2026-07-28 20:33:36 / system actor |

두 제품의 활성 전표 23건/23라인은 전부 `DRAFT / OUTBOUND / MANUAL`, 작성자는 `dev_manager`다. DB에 QA memo 표식은 없으므로 “실업무”라고 확정할 수도, 명시적 QA라고 확정할 수도 없다. 단, DRAFT이므로 accept/ship/inbound inventory 호출에 도달하지 않았다.

inventory 실측 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT clock_timestamp() AS measured_at;
SELECT product_id,product_code,status,COUNT(*) AS instances
FROM stock_instances
WHERE product_id IN (
  'd0a133a3-319e-4cc7-86d1-f34fc8c687aa'::uuid,
  'b3986128-4436-46e0-aef1-53b28d169814'::uuid
)
OR product_code IN ('MCU-S6NDB1N','SI-AL600A')
GROUP BY product_id,product_code,status
ORDER BY product_code,status;
COMMIT;
```

결과는 **0행**이다. 즉 코드 계약상 inventory로 보낼 값은 nonblank model name이지만, 388건에서 실제 외부/서비스간 전송에 성공한 표본은 없다. “빈 값으로 전송 실패”도 관측 0, “정상 전송”도 관측 0이므로 **실전송 판정 불가**다.

#1132 V37 72세트 UUID만 같은 방식으로 대조한 결과는 견적 0/전표 0/partner order 0/accounting order 0이다. 요청의 발화 조건에 따라 이 72세트의 사용자 경로는 **결함 없음이 아니라 판정 불가**다.

## 8. 3축 대조

실행 원문:

```powershell
git ls-files
git grep -n -I -E 'productCode|product_code'
gh issue list --state all --limit 400
```

- `git ls-files`: tracked 18,619파일. 제품 migration tracked 파일은 35개이고 V36/V37은 현재 0개다.
- `git grep`: repo 전체 2,080 매치 라인/456파일, runtime 후보 111파일. 위 6절에서 물리 조회/표시/외부·서비스간 전송으로 분류했다.
- `gh issue list --state all --limit 400`: 205건(OPEN 27, CLOSED 178)을 모두 대조했다.

관련 CLOSED 포함 대조:

| 번호 | 상태 | 의미 |
|---|---|---|
| #1000 | CLOSED | 순번코드 → 모델명=노출 품목코드 전환. 현 `ProductSummaryResponse.productCode=model_name`의 배경. |
| #1051 | OPEN | 전표가 없는 품목을 참조하는 연결 끊김 전수 조사. 이번 388은 반대 방향(품목은 있고 문서 참조가 거의 없음). |
| #1085 | OPEN | QA797 공유 잔재. 이번 28 NULL 중 제외한 2라인의 직접 분류 근거. |
| #1086 | OPEN | model_code 부재 33건. 이번 388은 model_code/model_name 전건 존재라 같은 집합이 아니다. |
| #1096 | CLOSED | 테스트 시더 정리. 26라인의 LOADTEST/QA provenance 대조에 사용. |
| #1155 | CLOSED | `partner_code` 공백 계열 4번째 결함. “물리 코드 NULL=즉시 결함”으로 단정하지 않고 도달을 별도 측정한 이유. |

`#1132`는 `gh issue view 1132`가 issue가 아니라 OPEN PR URL을 반환했다. 해당 PR의 V37 적용 흔적은 공유 DB에 있지만 현재 tracked V37 파일은 없다는 불일치를 위에서 분리했다.

## 9. 최종 판정

| 질문 | 판정 | 수치 근거 |
|---|---|---|
| 26건이 실데이터인가 | 아니오 | 명시적 QA/LOADTEST/probe 26/26, 실업무 0/26 |
| 사용자가 할인 입력 후 유실됐는가 | 이 26건에서는 아니오 | 할인율 요청/정규화 컬럼 0, 금액 정합 26/26 |
| D-G2 역사 할인율을 판정할 수 있는가 | 판정 불가 | 정규화 할인율 원문 0, 26라인 VAT포함 입력단가 NULL |
| 388건이 이카운트/화면/QA 산물인가 | 이카운트 0, 화면 0, QA 확정 0, SHEET 388 | ECOUNT NULL 0, SHEET NULL 388 |
| 388건이 현재 조회에서 안 보이는가 | 관측된 경로에서는 아니오 | API 노출 model_name, lookup model_name fallback, 문서 도달 제품 2 |
| 388건이 외부로 빈 값 전송되는가 | 판정 불가 | 도달 2제품은 DRAFT만, inventory instance 0, NTS 실호출 미구현 |
| V37 72세트의 사용자 도달 결함인가 | 판정 불가 | 견적·전표·주문 사용 0제품/0문서/0라인 |

코드 또는 DB 수정 제안은 하지 않는다. 본 감사가 확정하는 것은 “빈 값의 의미와 현 표본의 도달성”까지다.
