# D-G2 · D-G3 구현 전 실 데이터 영향 측정

## 1. 결론(4줄)

- **D-G2 영향:** 견적 원시 재구성치는 **3전표·3라인·1,060,800원**(영향 전표 총액 2,070,000원, 모두 `>49%`)이지만 전부 확인된 QA 전표였고, QA 제외 관측치는 **견적 0전표·0라인·0원 / 주문 0전표·0라인·0원**이다.
- **D-G2 판정:** **판정 불가** — QA 제외 견적 43라인 중 26라인은 `unit_price_with_vat IS NULL`, 활성 주문 4전표는 전부 QA, 견적→주문 연결은 전체 2,025전표 중 0건이라 실제 49% 견적 및 전환 차액 표본이 없다.
- **D-G3 영향:** 현 공유 DB의 `9199`·`9549`·`1089`는 각각 **전체 0라인 / 활성 0전표 / 차변 0원 / 대변 0원 / 차변-대변 잔액 0원**이고, 현 계정과목 마스터에도 세 코드가 모두 없다.
- **D-G3 판정:** `9199`·`9549`는 **판정 불가**, `1089`는 **D-G3 재질문 대상 아님** — #1072가 이카운트 정본 외상매출금으로 이미 확정했으며, 현재 0건은 환경·이관 표본 부재이지 특례 영향 0의 증거가 아니다.

## 2. 측정 조건과 해석 경계

- 측정일: 2026-08-11 KST
- DB 접근: 모든 실행 SQL을 `BEGIN TRANSACTION READ ONLY`와 `statement_timeout='30s'` 안에서 수행했다.
- 코드·스키마·DB 변경, 컨테이너 lifecycle 조작, 배포, git 변경은 하지 않았다.
- `할인율 = (품목 정가 - 저장 VAT 포함 단가) / 품목 정가 × 100` 재구성은 서로 다른 DB의 읽기 결과를 메모리에서 `product_id`로 대조했다. DB에 할인율 원문이 없는 정규화 견적·주문에는 이 값이 **현재 품목 마스터 기준 재구성치**일 뿐 역사적 권위값이 아니다.
- 금액은 영향 라인의 `line_total`/`subtotal` 합계를 본값으로 삼고, 해당 전표의 `total_amount` 합계는 별도로 적었다.
- 구간은 요청의 “48% 초과”를 따라 `(48%, 49%]`와 `>49%`로 나눴다. 정확히 48%인 행은 영향 건수에서 제외하고 별도 표시했다.

## 3. D-G2 — 코드 좌표 원문 확인

### 3.1 현행 견적 앱: 49%는 상수가 아니라 `45% + 4%p`

현행 파일은 [`clients/web/estimate-app/views/index.ejs`](../../clients/web/estimate-app/views/index.ejs)이다.

```text
13916:  function getTierBonusRate(sum) {
13917:    if (sum >= 100000000) return 0.04;
13918:    if (sum >= 50000000)  return 0.03;
13919:    if (sum >= 30000000)  return 0.02;
13920:    if (sum >= 10000000)  return 0.01;
13925:  function isStandard45(rate) {
13926:    return Math.abs(rate - 0.45) < 0.001;
13945:    if(isStandard45(calcH)) {
13947:      const hBonus = getTierBonusRate(hSum);
13948:      if(hBonus > 0) calcH += hBonus;
13952:    if(isStandard45(calcC)) {
13954:      const cBonus = getTierBonusRate(cSum);
13955:      if(cBonus > 0) calcC += cBonus;
13968:      /* 복구 */
13969:      window.DISCOUNT_RATE_HOME = oldH;
13970:      window.DISCOUNT_RATE_COMM = oldC;
```

따라서 최대값은 `0.45 + 0.04 = 0.49`이다. 파일 안에 `0.49` 리터럴은 없다. 임시 계산률은 콜백 뒤 복구되므로 저장된 기본 폼 비율 45%만 보고 49% 적용 여부를 판정할 수 없다.

레거시 원본도 같은 구조다.

```text
tools/legacy-gas/종합견적서/index.html:13329-13333  0.04/0.03/0.02/0.01 tier
tools/legacy-gas/종합견적서/index.html:13361        if(hBonus > 0) calcH += hBonus;
tools/legacy-gas/종합견적서/index.html:13368        if(cBonus > 0) calcC += cBonus;
```

### 3.2 현행 주문 앱: 48% 리터럴 clamp 확인

현행 파일은 [`clients/web/order-app/index.html`](../../clients/web/order-app/index.html)이다.

```text
8093:  function getTierBonusRate(sum) {
8094:    if (sum >= 100000000) return 0.04;
8095:    if (sum >= 50000000)  return 0.03;
8096:    if (sum >= 30000000)  return 0.02;
8097:    if (sum >= 10000000)  return 0.01;
8102:  function isStandard45(rate) {
8103:    return Math.abs(rate - 0.45) < 0.001;
8127:      if(hBonus > 0) calcH = Math.min(calcH + hBonus, 0.48);
8134:      if(cBonus > 0) calcC = Math.min(calcC + cBonus, 0.48);
```

레거시 주문 원본도 동일하다.

```text
tools/legacy-gas/거래처 발송 주문서/index.html:7758  if(hBonus > 0) calcH = Math.min(calcH + hBonus, 0.48);
tools/legacy-gas/거래처 발송 주문서/index.html:7765  if(cBonus > 0) calcC = Math.min(calcC + cBonus, 0.48);
```

## 4. D-G2 — 할인율이 실제로 어디에 저장되는가

### 4.1 웹 견적 스냅샷

`quote_snapshots.snapshot_state` JSONB에는 다음이 저장된다.

- 전표 기본 가변 DC: `form.home_rate.v`, `form.comm_rate.v` — **비율**을 백분율 문자열(예: `45`)로 저장한다. tier DC도 금액이 아니라 이 비율에 더하는 `%p`다.
- 라인별 DC 상태: `core.homeDc[model]`, `core.commDc[model]`의 `{fix, var}`
- `fix`: 라인 단위 **고정 할인율**이다. 숫자가 1보다 크면 `/100` 하는 원문 때문에 `45`는 45%가 되며, 원화 할인액이 아니다. `var`는 전표 기본 가변 DC 적용 여부다.
- 수량: `core.homeQty`, `core.commQty`
- 전표 합계: 정규 컬럼 `supply_amount`, `vat_amount`, `total_amount`

코드 원문은 다음과 같다.

```text
clients/web/estimate-app/views/index.ejs:3131  function parseFixedDc(dc){
clients/web/estimate-app/views/index.ejs:3134  const v = dc > 1 ? dc/100 : dc;
clients/web/estimate-app/views/index.ejs:3135  return Math.min(Math.max(v,0),0.99);
clients/web/estimate-app/views/index.ejs:16979 function takeSnapshot() {
clients/web/estimate-app/views/index.ejs:17059 homeDc[m] = {
clients/web/estimate-app/views/index.ejs:17060   fix: fixInp ? fixInp.value : '',
clients/web/estimate-app/views/index.ejs:17061   var: varChk ? varChk.checked : false
clients/web/estimate-app/views/index.ejs:17074 commDc[m] = {
```

즉, **tier 비율은 섹션/전표 계산 단위, `fix` 고정 할인율은 라인 단위**로 별개다. 레거시가 “정액DC”라고 부르는 원화 옵션·거래처 차감액은 할인율 컬럼으로 저장되지 않고 최종 단가에 녹는다. 다만 tier 보너스 계산률은 `window.LATEST_CALC_RATES`에만 두고 기본률을 복구하므로 snapshot의 `form.*_rate`가 tier 적용률의 역사 원문은 아니다.

### 4.2 정규화 견적·주문

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('estimates','estimate_lines','quote_snapshots')
  AND (column_name LIKE '%discount%' OR column_name LIKE '%rate%' OR column_name LIKE '%price%'
       OR column_name LIKE '%amount%' OR column_name IN ('snapshot_state','estimate_id','product_id','quantity'))
ORDER BY table_name, ordinal_position;
COMMIT;
```

결과 원문:

```text
estimate_lines  | estimate_id         | uuid
estimate_lines  | product_id          | uuid
estimate_lines  | quantity            | integer
estimate_lines  | unit_price          | numeric
estimate_lines  | supply_amount       | numeric
estimate_lines  | vat_amount          | numeric
estimate_lines  | unit_price_with_vat | numeric
estimates       | total_amount        | numeric
quote_snapshots | snapshot_state      | jsonb
quote_snapshots | supply_amount       | numeric
quote_snapshots | vat_amount          | numeric
quote_snapshots | total_amount        | numeric
```

`estimate_lines`에는 할인율·할인액·고정/가변 DC 구분이 없다. `partner_order_lines`도 `price_vat/subtotal/supply_amount/vat_amount/amount_authority`만 있고 할인율·할인액은 없다. 주문 웹 전송 객체에는 아래 값이 있으나 주문 정규화 테이블로 보존되지 않는다.

```text
clients/web/order-app/index.html:6725  homeRate: window.LATEST_CALC_RATES?.home,
clients/web/order-app/index.html:6726  commRate: window.LATEST_CALC_RATES?.comm,
```

따라서 정규화 문서는 저장 단가와 현재 품목 정가를 대조하는 재구성 외에는 48% 초과를 직접 SQL 판정할 수 없고, 그 재구성으로는 정액DC와 가변DC를 분리할 수 없다.

## 5. D-G2 — 먼저 수행한 행 분포

### 5.1 정규화 견적 월·일/작성자 분포

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT date_trunc('month', e.created_at) AS created_month,
       e.created_by,
       COUNT(DISTINCT e.id) AS estimate_count,
       COUNT(DISTINCT e.id) FILTER (WHERE NOT e.is_deleted) AS active_estimate_count,
       COUNT(el.id) FILTER (WHERE NOT e.is_deleted AND NOT el.is_deleted) AS active_line_count,
       COALESCE(SUM(el.line_total) FILTER (WHERE NOT e.is_deleted AND NOT el.is_deleted),0) AS active_line_total
FROM estimates e
LEFT JOIN estimate_lines el ON el.estimate_id=e.id
GROUP BY date_trunc('month', e.created_at), e.created_by
ORDER BY created_month, e.created_by;

SELECT e.created_at::date AS created_date,
       e.created_by,
       COUNT(DISTINCT e.id) AS estimate_count,
       COUNT(DISTINCT e.id) FILTER (WHERE NOT e.is_deleted) AS active_estimate_count,
       COUNT(el.id) FILTER (WHERE NOT e.is_deleted AND NOT el.is_deleted) AS active_line_count,
       COALESCE(SUM(el.line_total) FILTER (WHERE NOT e.is_deleted AND NOT el.is_deleted),0) AS active_line_total
FROM estimates e
LEFT JOIN estimate_lines el ON el.estimate_id=e.id
GROUP BY e.created_at::date, e.created_by
ORDER BY created_date, e.created_by;
COMMIT;
```

월 분포 결과:

| 월 | created_by | 전체 전표 | 활성 전표 | 활성 라인 | 활성 라인 합계 |
|---|---|---:|---:|---:|---:|
| 2026-06 | `a0000000-0000-0000-0000-000000000003` | 497 | 0 | 0 | 0원 |
| 2026-06 | `a0000000-0000-0000-0000-000000000004` | 1,430 | 0 | 0 | 0원 |
| 2026-07 | `a0000000-0000-0000-0000-000000000001` | 5 | 0 | 0 | 0원 |
| 2026-07 | `a0000000-0000-0000-0000-000000000003` | 72 | 29 | 51 | 5,236,000원 |
| 2026-07 | `a0000000-0000-0000-0000-000000000004` | 2 | 0 | 0 | 0원 |
| 2026-08 | `a0000000-0000-0000-0000-000000000001` | 28 | 15 | 17 | 639,917,801원 |
| 2026-08 | `a0000000-0000-0000-0000-000000000003` | 11 | 8 | 20 | 10,185,002원 |
| 2026-08 | `a0000000-0000-0000-0000-000000000004` | 18 | 18 | 18 | 1,570,250원 |

활성 전체 원문 집계는 **70전표·106라인·656,909,053원**이다. 일/작성자 분포에서 7월 16~17일 `a0000000-0000-0000-0000-000000000003` 51라인·5,236,000원이 한 덩어리로 나타났고, 이는 아래 QA797 분리 결과와 정확히 일치했다. 8월 10일 `a0000000-0000-0000-0000-000000000001`은 9전표·11라인·639,911,807원으로 별도 덩어리였다.

### 5.2 웹 견적 snapshot 월·일/작성자 분포

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT date_trunc('month', created_at) AS created_month,
       COUNT(*) AS snapshot_count,
       COUNT(*) FILTER (WHERE NOT is_deleted) AS active_snapshot_count,
       COALESCE(SUM(total_amount) FILTER (WHERE NOT is_deleted),0) AS active_total_amount
FROM quote_snapshots
GROUP BY date_trunc('month', created_at)
ORDER BY created_month;

SELECT created_at::date AS created_date,
       created_by,
       COUNT(*) AS snapshot_count,
       COUNT(*) FILTER (WHERE NOT is_deleted) AS active_snapshot_count,
       COALESCE(SUM(total_amount) FILTER (WHERE NOT is_deleted),0) AS active_total_amount
FROM quote_snapshots
GROUP BY created_at::date, created_by
ORDER BY created_date, created_by;
COMMIT;
```

결과 원문:

```text
2026-08                                  4 snapshots / active 4 / 3,226,230원
2026-08-02 | system-internal            1 snapshot  / active 1 / 3,222,230원
2026-08-08 | system-internal            3 snapshots / active 3 /     4,000원
```

### 5.3 주문 월·일/작성자 분포

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT date_trunc('month', po.created_at) AS created_month,
       po.created_by,
       COUNT(DISTINCT po.id) AS order_count,
       COUNT(DISTINCT po.id) FILTER (WHERE NOT po.is_deleted) AS active_order_count,
       COUNT(pol.id) FILTER (WHERE NOT po.is_deleted AND NOT pol.is_deleted) AS active_line_count,
       COALESCE(SUM(pol.subtotal) FILTER (WHERE NOT po.is_deleted AND NOT pol.is_deleted),0) AS active_line_subtotal
FROM partner_orders po
LEFT JOIN partner_order_lines pol ON pol.partner_order_id = po.id
GROUP BY date_trunc('month', po.created_at), po.created_by
ORDER BY created_month, po.created_by;

SELECT po.created_at::date AS created_date,
       po.created_by,
       COUNT(DISTINCT po.id) AS order_count,
       COUNT(DISTINCT po.id) FILTER (WHERE NOT po.is_deleted) AS active_order_count,
       COUNT(pol.id) FILTER (WHERE NOT po.is_deleted AND NOT pol.is_deleted) AS active_line_count,
       COALESCE(SUM(pol.subtotal) FILTER (WHERE NOT po.is_deleted AND NOT pol.is_deleted),0) AS active_line_subtotal
FROM partner_orders po
LEFT JOIN partner_order_lines pol ON pol.partner_order_id = po.id
GROUP BY po.created_at::date, po.created_by
ORDER BY created_date, po.created_by;
COMMIT;
```

활성 분포:

| 작성일 | created_by | 활성 전표 | 활성 라인 | 라인 합계 |
|---|---|---:|---:|---:|
| 2026-06-08 | `a0000000-0000-0000-0000-000000000004` | 2 | 2 | 2,400,000원 |
| 2026-07-30 | `d7ac77d4-db1e-45d1-a0bf-e3345cab4f26` | 1 | 2 | 104,665원 |
| 2026-08-07 | `d7ac77d4-db1e-45d1-a0bf-e3345cab4f26` | 1 | 4 | 3,152,072원 |

## 6. D-G2 — 영향 측정 결과

### 6.1 정규화 견적: 현재 품목 마스터 기준 재구성

서로 다른 DB를 수정하거나 임시 테이블을 만들지 않고 다음 두 SELECT 결과만 메모리에서 `product_id`로 대조했다.

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT e.id AS estimate_id, e.estimate_no, e.created_at, e.created_by,
       e.total_amount AS estimate_total,
       el.id AS line_id, el.product_id, el.quantity,
       el.unit_price_with_vat, el.line_total
FROM estimates e
JOIN estimate_lines el ON el.estimate_id=e.id
WHERE NOT e.is_deleted AND NOT el.is_deleted;
COMMIT;
```

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT id AS product_id, model_code, name, release_price, delivery_price,
       fixed_discount_rate, has_variable_discount, is_deleted, created_at, modified_at
FROM products;
COMMIT;
```

재구성 결과:

| 범위 | 전표 | 라인 | `(48%,49%]` | `>49%` | 영향 라인 금액 | 영향 전표 총액 |
|---|---:|---:|---:|---:|---:|---:|
| 활성 원시 데이터 | 70 | 106 | 0 | **3** | **1,060,800원** | **2,070,000원** |
| 원시 데이터 중 할인율 재구성 가능 | — | 78 | 0 | 3 | 1,060,800원 | 2,070,000원 |
| QA797 + 확인된 QA 전표 제외 | 라인 보유 38 | 43 | **0** | **0** | **0원** | **0원** |
| 제외 후 할인율 재구성 가능 | — | 17 | 0 | 0 | 0원 | 0원 |
| 제외 후 할인율 재구성 불가 | — | **26** | 판정 불가 | 판정 불가 | 판정 불가 | 판정 불가 |

원시 `>49%` 3라인의 원문:

| 견적번호 | 생성일시 | created_by | 모델 | 정가 | 저장 VAT 포함 단가 | 재구성 할인율 | 라인 금액 | 전표 총액 |
|---|---|---|---|---:|---:|---:|---:|---:|
| `2026/08/07-4` | 2026-08-07 17:17 | `a0000000-0000-0000-0000-000000000003` | `AC023CX1DBC1` | 708,400원 | 353,600원 | 50.084698% | 353,600원 | 690,000원 |
| `2026/08/07-5` | 2026-08-07 18:16 | `a0000000-0000-0000-0000-000000000003` | `AC023CX1DBC1` | 708,400원 | 353,600원 | 50.084698% | 353,600원 | 690,000원 |
| `2026/08/07-12` | 2026-08-07 19:24 | `a0000000-0000-0000-0000-000000000003` | `AC023CX1DBC1` | 708,400원 | 353,600원 | 50.084698% | 353,600원 | 690,000원 |

세 전표는 다음 tracked 실 QA 보고서가 직접 생성 사실을 확정한다.

- `docs/dev-reports/2026-08-07-1096-s8-reconvergence-and-live-qa.md:227` — `2026/08/07-4` GUI 생성
- `docs/dev-reports/2026-08-07-1096-s10-reconvergence-and-live-qa.md:123-126` — `2026/08/07-5` GUI 생성
- `docs/dev-reports/2026-08-07-1096-s12-reconvergence-and-live-qa.md:98` — `2026/08/07-12` GUI 생성
- `clients/desktop/playwright/1095-r7-real-qa/1095-r7-status-reopen-real-qa.spec.ts:326` — `2026/08/07-12` 재사용

추가 제외 근거:

- 활성 `QA797`은 **25전표·51라인·5,236,000원**이었다. #1085와 `V117__soft_delete_test_seed_documents.sql`의 QA 잔재 정리 대상에 해당한다.
- 활성 `9,999,999,999,999원` 경계값 라인은 **0건**이었다.
- 위 세 QA 전표는 합계 **3전표·12라인·2,070,000원**이며, 그중 `>49%`로 재구성된 라인이 각 1개다.
- QA 제외 26라인의 재구성 실패 원인은 전부 `estimate_lines.unit_price_with_vat IS NULL`이다. 따라서 이 26라인을 48% 이하라고 간주하지 않았다.
- 원시 3라인도 DB에는 고정/가변 DC 원문이 없으므로 “49% tier가 실제 적용됐다”는 증거가 아니다. 정가 대비 결과가 49%를 넘는다는 사실만 재구성할 수 있다.

### 6.2 웹 견적 snapshot

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
WITH active_snapshots AS (
  SELECT * FROM quote_snapshots WHERE NOT is_deleted
), selected_lines AS (
  SELECT s.id, s.cust_name, s.total_amount, 'HOME' AS section,
         q.elem->>0 AS model_code, (q.elem->>1)::numeric AS quantity,
         CASE
           WHEN COALESCE(s.snapshot_state->'core'->'homeDc'->(q.elem->>0)->>'fix','') ~ '^[0-9]+([.][0-9]+)?$'
             THEN (s.snapshot_state->'core'->'homeDc'->(q.elem->>0)->>'fix')::numeric
           WHEN COALESCE((s.snapshot_state->'core'->'homeDc'->(q.elem->>0)->>'var')::boolean,false)
             THEN (s.snapshot_state->'form'->'home_rate'->>'v')::numeric
         END AS stored_rate_percent
  FROM active_snapshots s
  CROSS JOIN LATERAL jsonb_array_elements(s.snapshot_state->'core'->'homeQty') AS q(elem)
  WHERE (q.elem->>1)::numeric > 0
  UNION ALL
  SELECT s.id, s.cust_name, s.total_amount, 'COMM',
         q.elem->>0, (q.elem->>1)::numeric,
         CASE
           WHEN COALESCE(s.snapshot_state->'core'->'commDc'->(q.elem->>0)->>'fix','') ~ '^[0-9]+([.][0-9]+)?$'
             THEN (s.snapshot_state->'core'->'commDc'->(q.elem->>0)->>'fix')::numeric
           WHEN COALESCE((s.snapshot_state->'core'->'commDc'->(q.elem->>0)->>'var')::boolean,false)
             THEN (s.snapshot_state->'form'->'comm_rate'->>'v')::numeric
         END
  FROM active_snapshots s
  CROSS JOIN LATERAL jsonb_array_elements(s.snapshot_state->'core'->'commQty') AS q(elem)
  WHERE (q.elem->>1)::numeric > 0
)
SELECT COUNT(*) AS selected_line_count,
       COUNT(*) FILTER (WHERE stored_rate_percent IS NOT NULL) AS line_count_with_stored_rate,
       COUNT(*) FILTER (WHERE stored_rate_percent > 48 AND stored_rate_percent <= 49) AS line_count_over_48_through_49,
       COUNT(*) FILTER (WHERE stored_rate_percent > 49) AS line_count_over_49,
       COUNT(DISTINCT id) FILTER (WHERE stored_rate_percent > 48) AS snapshot_count_over_48
FROM selected_lines;
COMMIT;
```

결과 원문:

```text
selected_line_count=9
line_count_with_stored_rate=1
line_count_over_48_through_49=0
line_count_over_49=0
snapshot_count_over_48=0
```

활성 snapshot 4건은 모두 QA였다.

| cust_name | 전표 총액 | QA 근거 |
|---|---:|---|
| `QA 견적 수정 2026-08-02` | 3,222,230원 | `clients/web/estimate-app/scripts/qa-1009-live.mjs:219` |
| `QA-875-live-1786131344007` | 2,000원 | 이름 자체 및 #875 실 QA |
| `S9-875-20260807200351` | 2,000원 | `docs/dev-reports/2026-08-08-875-s9-premerge-reconvergence.md:155` |
| `S3-1135-%_\` | 0원 | `docs/dev-reports/2026-08-08-1135-s3-live-qa-reachable-surfaces.md:48-60` |

따라서 snapshot 원시 관측치도 `>48%` 0건이지만, QA 제외 후 모집단 자체가 0이므로 실 견적 영향 판정에는 사용할 수 없다.

### 6.3 주문

활성 주문 원문은 4전표·8라인이다. 현재 품목 정가와 저장 `price_vat` 대조 결과:

| 구간 | 전표 | 라인 | 라인 금액 |
|---|---:|---:|---:|
| `(48%,49%]` | 0 | 0 | 0원 |
| `>49%` | 0 | 0 | 0원 |
| 정확히 `48%` | 1 | 2 | 3,046,472원 |

정확히 48%인 두 라인은 `2026/08/07-1`의 `AJ060MXHNBC1` 2개 중복 라인이며, 각 `2,929,300원 → 1,523,236원`이다. 그러나 활성 주문 전부가 QA다.

- `2026/06/08-1980`, `-1982`: 라인 `remark=LOADTEST-*`
- `2026/07/30-1`: `docs/qa/985-confirm-price-live/R5-REPORT.md:49-105`가 생성한 실 QA 주문
- `2026/08/07-1`: `memo=S6-직접저장-1786115763971`; QA 주문 생성 흐름

`partner_order_drafts`도 활성 11건 전부 `label` 또는 payload에 QA 표식이 있다. payload의 주문률 분포는 `0/0` 6건, `0.48/0.48` 2건, 비율 없음 3건이고 `>0.48`은 0건이다.

따라서 “주문 clamp가 실제로 안 걸린다”는 표본은 발견되지 않았다. 반대로 QA 제외 실 주문 표본도 0건이므로 clamp 정상 작동을 실 데이터로 확정할 수도 없다.

### 6.4 견적→주문 전환 금액 차이

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT COUNT(*) AS all_orders,
       COUNT(*) FILTER (WHERE NOT is_deleted) AS active_orders,
       COUNT(*) FILTER (WHERE source_estimate_id IS NOT NULL) AS all_linked_to_estimate,
       COUNT(*) FILTER (WHERE NOT is_deleted AND source_estimate_id IS NOT NULL) AS active_linked_to_estimate
FROM partner_orders;

SELECT date_trunc('month', created_at) AS created_month,
       created_by,
       COUNT(*) AS order_count,
       COUNT(*) FILTER (WHERE source_estimate_id IS NOT NULL) AS linked_count
FROM partner_orders
GROUP BY date_trunc('month', created_at), created_by
ORDER BY created_month, created_by;

SELECT created_at::date AS created_date,
       created_by,
       COUNT(*) AS order_count,
       COUNT(*) FILTER (WHERE source_estimate_id IS NOT NULL) AS linked_count
FROM partner_orders
GROUP BY created_at::date, created_by
ORDER BY created_date, created_by;
COMMIT;
```

결과 원문:

```text
all_orders=2025
active_orders=4
all_linked_to_estimate=0
active_linked_to_estimate=0
모든 월/created_by group linked_count=0
모든 created_at::date/created_by group linked_count=0
```

따라서 금액이 달라진 전환 건은 **0건이라고 판정한 것이 아니라 비교 가능한 전환 쌍이 0건**이다. 현재 데이터만으로는 기존 문제인지 D-G2가 새로 만드는 문제인지 판정할 수 없다.

## 7. D-G3 — 코드 좌표와 현 chart 규칙

### 7.1 레거시 특례 원문

[`tools/legacy-gas/거래처별 원장생성 프로그램/Index.html`](../../tools/legacy-gas/거래처별%20원장생성%20프로그램/Index.html):

```text
704: if (lr.account === '9199') sAmt = lr.credit;
705: else if (lr.account === '9549') rAmt = lr.debit;
706: else if (lr.account === '1089') { sAmt = lr.debit; rAmt = lr.credit; }
892: const TARGET_ACC = ["1089", "9199", "9549"];
```

의미는 `9199 credit → sale`, `9549 debit → receipt`, `1089 debit → sale / credit → receipt`이다.

### 7.2 현 원장 규칙 원문

```text
shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerCollectionContract.java:19  LEGACY_REVENUE_CODES = Set.of("401")
shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerCollectionContract.java:20  LEGACY_RECEIVABLE_CODES = Set.of("110")
shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerCollectionContract.java:22  CASH_AND_SETTLEMENT_CODES = Set.of("102")
shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerCollectionContract.java:144 revenueCodes.contains(accountCode)
shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerCollectionContract.java:145 || "9049".equals(accountCode)
services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:573-587
  chart에서 이름이 외상매출금/상품매출/외상매입금인 leaf 코드를 동적으로 선택하고,
  없으면 110/401/201로 fallback
```

현 코드에는 `9199`·`9549` 특례가 없고, `1089`도 literal 특례가 아니다. #1072의 chart 정본 전환이 완료되어 `1089=외상매출금` leaf가 들어오면 동적 receivable code가 되는 구조다.

## 8. D-G3 — 먼저 수행한 행 분포와 실측

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT date_trunc('month', j.created_at) AS created_month,
       COUNT(DISTINCT j.id) AS journal_count,
       COUNT(jl.id) AS line_count,
       COUNT(jl.id) FILTER (WHERE jl.account_code IN ('9199','9549','1089')) AS target_line_count
FROM journals j
LEFT JOIN journal_lines jl ON jl.journal_id = j.id AND NOT jl.is_deleted
WHERE NOT j.is_deleted
GROUP BY date_trunc('month', j.created_at)
ORDER BY created_month;

SELECT j.created_at::date AS created_date,
       j.created_by,
       COUNT(DISTINCT j.id) AS journal_count,
       COUNT(jl.id) AS line_count,
       COUNT(jl.id) FILTER (WHERE jl.account_code IN ('9199','9549','1089')) AS target_line_count
FROM journals j
LEFT JOIN journal_lines jl ON jl.journal_id = j.id AND NOT jl.is_deleted
WHERE NOT j.is_deleted
GROUP BY j.created_at::date, j.created_by
ORDER BY created_date, j.created_by;
COMMIT;
```

월 결과 원문:

| created_month | journal_count | line_count | target_line_count |
|---|---:|---:|---:|
| 2026-01 | 3 | 8 | 0 |
| 2026-02 | 2 | 5 | 0 |
| 2026-03 | 1 | 2 | 0 |
| 2026-04 | 5 | 13 | 0 |
| 2026-06 | 47 | 123 | 0 |
| 2026-07 | 58 | 124 | 0 |
| 2026-08 | 9 | 18 | 0 |
| 2026-12 | 1 | 2 | 0 |
| 2027-01 | 7 | 14 | 0 |

일/작성자 결과는 29개 group이었고 모든 `target_line_count=0`이었다. 날짜는 2026-01-15부터 2027-01-30까지 분포했고 작성자는 `SYSTEM_SEED`, `system`, `a0000000-0000-0000-0000-000000000001`, `a0000000-0000-0000-0000-000000000003`, `a0000000-0000-0000-0000-000000000005`, `299c25e1-0206-4d05-b763-babcabc49001`였다. 즉 특정 월을 잘못 고른 결과가 아니다.

세 코드의 전체/활성 건수·잔액 실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT v.account_code,
       COUNT(jl.id) AS all_line_count,
       COUNT(jl.id) FILTER (WHERE NOT jl.is_deleted AND NOT j.is_deleted) AS active_line_count,
       COUNT(DISTINCT jl.journal_id) FILTER (WHERE NOT jl.is_deleted AND NOT j.is_deleted) AS active_journal_count,
       COALESCE(SUM(jl.debit_amount) FILTER (WHERE NOT jl.is_deleted AND NOT j.is_deleted),0) AS active_debit_amount,
       COALESCE(SUM(jl.credit_amount) FILTER (WHERE NOT jl.is_deleted AND NOT j.is_deleted),0) AS active_credit_amount,
       COALESCE(SUM(jl.debit_amount - jl.credit_amount)
         FILTER (WHERE NOT jl.is_deleted AND NOT j.is_deleted),0) AS active_debit_minus_credit_balance
FROM (VALUES ('9199'),('9549'),('1089')) AS v(account_code)
LEFT JOIN journal_lines jl ON jl.account_code = v.account_code
LEFT JOIN journals j ON j.id = jl.journal_id
GROUP BY v.account_code
ORDER BY v.account_code;
COMMIT;
```

결과 원문:

| account_code | all_line_count | active_line_count | active_journal_count | debit | credit | debit-credit balance |
|---|---:|---:|---:|---:|---:|---:|
| 1089 | 0 | 0 | 0 | 0원 | 0원 | 0원 |
| 9199 | 0 | 0 | 0 | 0원 | 0원 | 0원 |
| 9549 | 0 | 0 | 0 | 0원 | 0원 | 0원 |

집PC 0건은 현재 회사PC 공유 DB에서도 재현됐다. 그러나 전체 행 자체가 없으므로 특례 적용 전후 차액은 산출할 수 없다.

## 9. D-G3 — 0이 아닌 표본이 있어야 할 위치

### 9.1 현 계정과목 마스터

실행 SQL 원문:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT code, name, category, is_leaf, is_deleted, created_at, created_by
FROM chart_of_accounts
WHERE code IN ('110', '201', '401', '9199', '9549', '1089', '9049')
ORDER BY code;
COMMIT;
```

결과 원문:

```text
110 | 외상매출금 | ASSET     | leaf | active | 2026-06-23 | SYSTEM
201 | 외상매입금 | LIABILITY | leaf | active | 2026-06-23 | SYSTEM
401 | 상품매출   | REVENUE   | leaf | active | 2026-06-23 | SYSTEM
```

`9199`·`9549`·`1089`·`9049`는 결과에 없었다. 현 chart는 총 77개 모두 활성이고, 세 역할은 110/201/401 구체계다.

### 9.2 로컬 이관 대기 raw

`docs/migration/ecount-data/raw/`의 실 파일은 다음 네 개뿐이다.

```text
거래처-Excel다운로드.csv
품목-Excel다운로드.csv
품목-Excel다운로드-20260802.xlsx
품목관계리스트-Excel다운로드.xlsx
```

계정과목·분개·원장 export는 없다. CSV exact-field 검색은 세 코드 모두 0건이었다. 품목 xlsx의 worksheet XML에서 `1089` 숫자 토큰 14개가 보였으나 `sharedStrings.xml`에는 0개였고, 이는 품목 시트의 shared-string 인덱스이지 계정코드 행이 아니다. `tools/`에도 원장 원본 데이터 파일은 없고, 업로드된 원장 파일을 파싱하는 HTML 프로그램만 있다.

따라서 `9199`·`9549`의 0이 아닌 영향액을 보려면 **레거시 거래처별 원장 업로드 원본 또는 그 원본이 이관된 DB**가 필요하다. 현재 workspace에는 그 원본이 없다. 새로 만들 대상이 아니라, 아직 이관되지 않은 원본 범주의 부재다.

### 9.3 #1072와 `1089`

`gh issue view 1072` 원문이 확정한 내용:

```text
개발책임자 결정 (2026-08-05) — 이카운트 계정과목 체계(1089·4019·2519 계열)가 정본
1089 | 외상매출금 | 2,435 lines | 746 journals | debit 6,730,209,774 | credit 6,436,930,757
개발책임자 결정 (2026-08-06) — 3코드만 전환하지 않고 전 목록을 먼저 확정
확정됨: 1089 외상매출금 · 4019 상품매출 · 2519 외상매입금
```

위 2,435라인은 #1072가 조사한 다른 시점/환경의 역사 실측이며 현재 DB 측정값으로 재사용하지 않았다. 다만 “어디를 봐야 0이 아닌가”에 대한 직접 증거다. 현재 회사PC DB의 0건은 그 2026-05-22 이관분이 이 환경에 없다는 뜻이다.

따라서 D-G3 특례 후보는 `9199`·`9549`만 남는다. `1089`는 별도 literal 특례로 재질문할 코드가 아니라 #1072의 전체 chart 정본 전환에서 처리할 이미 확정된 외상매출금 코드다.

## 10. 3축 대조

실행 원문:

```powershell
git ls-files -- "clients/web/order-app/index.html" `
  "clients/web/estimate-app/views/index.ejs" `
  "tools/legacy-gas/종합견적서/index.html" `
  "tools/legacy-gas/거래처 발송 주문서/index.html" `
  "tools/legacy-gas/거래처별 원장생성 프로그램/Index.html" `
  "docs/migration/ecount-data/raw/*"

git grep -n -E "Math\.min\(calc[HC] \+ [hc]Bonus, 0\.48\)|calc[HC] \+= [hc]Bonus|lr\.account === '(9199|9549|1089)'" -- `
  "clients/web/order-app/index.html" "tools/legacy-gas/*.html" "tools/legacy-gas/**/*.html"

gh issue list --state all --limit 400 --json number,title,state,closedAt
```

대조 결과:

- `git ls-files`: 현행 견적·주문, 레거시 견적·주문·원장 프로그램은 모두 tracked. raw 하위 tracked 파일은 `.gitkeep`만이다.
- `git grep`: 견적 무clamp, 주문 0.48 clamp, 세 원장 특례 좌표를 위 줄번호로 확인했다.
- `gh issue list`: CLOSED 포함 205건. 관련 항목은 #1008(CLOSED, 전역DC 48% 검증), #1072(OPEN, 이카운트 계정 정본), #1085(OPEN, QA797 잔재), #1090(OPEN, 정액 할인 분류 정본)이다.
- “없다”는 결론은 위 세 축에 DB·filesystem read를 더 대조한 뒤에만 사용했다. `1089`는 이미 #1072에 있으므로 새 결정 대상으로 올리지 않았다.

## 11. 개발책임자 결정용 판정

| 결정 | 관측 영향 | 구현 전 판정 |
|---|---|---|
| D-G2 견적/주문 48% 통일 | QA 제외 관측 영향 0전표·0라인·0원. 원시 `>49%` 3라인은 전부 QA. 주문 `>48%` 0건. | **실 데이터 영향 확정 불가.** 견적 26라인의 할인율 원문이 없고 실 주문·전환 표본이 0이다. 통일 시 49% 역사 견적 소급 불일치를 수치로 부정할 수 없다. |
| D-G3 `9199` | 0라인·0원, chart 미등록, raw 원장 없음 | **판정 불가.** 레거시 원장 원본 또는 그 이관 DB가 필요하다. |
| D-G3 `9549` | 0라인·0원, chart 미등록, raw 원장 없음 | **판정 불가.** 레거시 원장 원본 또는 그 이관 DB가 필요하다. |
| D-G3 `1089` | 현재 DB 0라인·0원이나 #1072 역사 환경 2,435라인 | **D-G3에서 제외.** #1072의 이미 확정된 이카운트 외상매출금 정본이며 전체 chart 전환 범위다. |
