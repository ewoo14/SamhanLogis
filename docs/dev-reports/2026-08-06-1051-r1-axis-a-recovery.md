# #1051 D2 R1 축 A 복구 — 회사PC 재측정 중단 보고

> 측정일: 2026-08-06 09:45 KST
> PC: 회사PC
> 브랜치: `fix/1051-slip-product-link-audit`
> HEAD: `af829b407383bb53c43422d916801e7e70a010ce`
> 상태: **BLOCKED — 집PC와 회사PC의 대상 집합이 다르므로 복구하지 않음**

## 1. 결론

개발책임자 지시에 따라 DB를 먼저 다시 셌다. 집PC의 ③④ 전제와 회사PC 측정값이 다르므로 5건을 고치지 않고 중단한다.

회사PC에서 확인된 값은 다음과 같다.

```text
slip_lines        전체 449 / 비삭제 290 / product DB 전체에 없는 product_id 행 0
partner_order_lines 전체 648 / 비삭제 646 / product DB 전체에 없는 product_id 행 61
product_db.products 전체 3063 / 비삭제 3061
partner_order_lines의 누락 UUID 7개
```

집PC 대조값은 `slip_lines` 3건, `partner_order_lines` 2건, 모델명 후보 4개였다. 회사PC에서는 그 5건의 원문 행이 재현되지 않았고, 후보 모델명 4개도 활성 product에서 모두 0건이다.

## 2. 회사PC 재측정 — 원문 SQL과 실행 결과

### 2.1 원본 추출 SQL

```sql
SELECT id::text, product_id::text, is_deleted
FROM slip_lines;

SELECT id::text, product_id::text, is_deleted
FROM partner_order_lines;

SELECT id::text, is_deleted, model_code, name, model_name
FROM products;
```

위 세 SQL의 결과를 업무 DB별로 추출하고, `product_db.products`의 전체 UUID 집합 및 비삭제 UUID 집합과 읽기 전용으로 대조했다. 회사PC 집합 대조 결과는 다음과 같다.

```text
slip_lines total_rows=449 active_rows=290 active_product_refs=27 missing_product_rows=0 missing_product_refs=0
partner_order_lines total_rows=648 active_rows=646 active_product_refs=339 missing_product_rows=61 missing_product_refs=7
partner_order_lines missing_ids=01949ab7-e922-35c6-b289-5337d867a0ee,508ffc15-4ebe-363e-a395-389ba0d6b6a7,51e16f88-98ce-359c-b4e5-c6641325c5bd,a9d88f27-98af-3009-8e1f-3d9a390c41f4,aa757c01-0000-4000-8000-000000009001,ae339262-7ca9-3f7c-8418-4339e88b3466,e35ae4a5-0505-36a1-bbf2-b2abea094b8a
products total_rows=3063 active_rows=3061 all_product_ids=3063
```

### 2.2 행 수 SQL

```sql
SELECT clock_timestamp() AS measured_at,
       'slip_lines' AS table_name,
       count(*) AS total_lines,
       count(*) FILTER (WHERE is_deleted=false) AS active_lines
FROM slip_lines;
```

```text
          measured_at          | table_name | total_lines | active_lines
-------------------------------+------------+-------------+--------------
 2026-08-06 09:45:14.723438+09 | slip_lines |         449 |          290
(1 row)
```

```sql
SELECT clock_timestamp() AS measured_at,
       'partner_order_lines' AS table_name,
       count(*) AS total_lines,
       count(*) FILTER (WHERE is_deleted=false) AS active_lines
FROM partner_order_lines;
```

```text
          measured_at          |     table_name      | total_lines | active_lines
-------------------------------+---------------------+-------------+--------------
 2026-08-06 09:45:14.723457+09 | partner_order_lines |         648 |          646
(1 row)
```

```sql
SELECT clock_timestamp() AS measured_at,
       'products' AS table_name,
       count(*) AS total_products,
       count(*) FILTER (WHERE is_deleted=false) AS active_products
FROM products;
```

```text
          measured_at          | table_name | total_products | active_products
-------------------------------+------------+----------------+-----------------
 2026-08-06 09:45:14.723469+09 | products   |           3063 |            3061
(1 row)
```

### 2.3 후보 모델명 SQL

```sql
WITH target(model_name,snapshot_name) AS (VALUES
 ('AR07TXEAAWKNEU-03','Product A'),
 ('AR07TXEAAWKNEU-03','Samsung Product A'),
 ('AR05TXEAAWKNEU-11','삼성 윈드프리 5평형'),
 ('AR13TXEAAWKNEU-06','삼성 윈드프리 13평형'))
SELECT t.model_name,t.snapshot_name,p.id AS candidate_product_id,p.name AS candidate_name,
       p.model_name AS candidate_model_name,p.model_code AS candidate_model_code,
       (SELECT count(*) FROM products p2 WHERE p2.is_deleted=false AND btrim(p2.model_name)=btrim(t.model_name)) AS active_model_name_candidates,
       (SELECT count(*) FROM products p3 WHERE p3.is_deleted=false AND btrim(p3.name)=btrim(t.snapshot_name)) AS active_snapshot_name_candidates
FROM target t LEFT JOIN products p
  ON p.is_deleted=false AND btrim(p.model_name)=btrim(t.model_name)
ORDER BY t.model_name,t.snapshot_name,p.id;
```

```text
    model_name     |    snapshot_name     | candidate_product_id | candidate_name | candidate_model_name | candidate_model_code | active_model_name_candidates | active_snapshot_name_candidates
-------------------+----------------------+----------------------+----------------+----------------------+----------------------+------------------------------+---------------------------------
 AR05TXEAAWKNEU-11 | 삼성 윈드프리 5평형  |                      |                |                      |                      |                            0 |                               0
 AR07TXEAAWKNEU-03 | Product A            |                      |                |                      |                      |                            0 |                               0
 AR07TXEAAWKNEU-03 | Samsung Product A    |                      |                |                      |                      |                            0 |                               0
 AR13TXEAAWKNEU-06 | 삼성 윈드프리 13평형 |                      |                |                      |                      |                            0 |                               0
(4 rows)
```

### 2.4 집PC에서 보고된 ③ slip 3건 재조회 SQL

```sql
SELECT s.slip_no,s.slip_type,s.status,s.source_type,s.source_id,
       sl.id AS line_id,sl.product_id,sl.model_name,sl.product_name,
       sl.quantity,sl.unit_price,sl.line_total,sl.created_at,sl.created_by
FROM slip_lines sl JOIN slips s ON s.id=sl.slip_id
WHERE sl.created_at::date='2026-05-30' AND sl.created_by='system-internal'
ORDER BY s.slip_no,sl.id;
```

```text
 slip_no | slip_type | status | source_type | source_id | line_id | product_id | model_name | product_name | quantity | unit_price | line_total | created_at | created_by
---------+-----------+--------+-------------+-----------+---------+------------+------------+--------------+----------+------------+------------+------------+------------
(0 rows)
```

### 2.5 집PC에서 보고된 ④ partner_order 2건 재조회 SQL

```sql
SELECT po.order_no,po.status,po.is_deleted AS order_is_deleted,
       pol.id AS line_id,pol.product_id,pol.model_name,pol.product_name,pol.category_key,
       pol.quantity,pol.price_vat,pol.subtotal,pol.created_at,pol.created_by
FROM partner_order_lines pol JOIN partner_orders po ON po.id=pol.partner_order_id
WHERE pol.product_id IN
 ('77fabff4-6917-3846-ad8c-3616eba3a219','a4055da1-c827-33c3-bd7f-c559e59db594')
ORDER BY po.order_no;
```

```text
 order_no | status | order_is_deleted | line_id | product_id | model_name | product_name | category_key | quantity | price_vat | subtotal | created_at | created_by
----------+--------+------------------+---------+------------+------------+--------------+--------------+----------+-----------+----------+------------+------------
(0 rows)
```

## 3. 집PC 값과 다른 점

| 항목 | 집PC 대조값 | 회사PC 실측값 | 판정 |
|---|---:|---:|---|
| `slip_lines` ③ 대상 | 3건 | 0건 | 불일치 — 복구 중단 |
| `partner_order_lines` ④ 대상 | 2건 | 0건(집PC UUID 기준), 활성 누락 전체 61건 | 불일치 — 다른 61건을 이 트랙에 편입하지 않음 |
| 후보 모델명 활성 후보 | 4개 모델명에 후보 존재 | 4개 모델명 모두 후보 0건 | 불일치 — 연결 후보 없음 |
| snapshot 이름 | `Product A`, `Samsung Product A`, `삼성 윈드프리 5평형`, `삼성 윈드프리 13평형` | 위 5건 재조회 0행 | 원문 행 부재 |

회사PC에서 발견된 `partner_order_lines` 활성 누락 61건은 집PC의 ④ 2건과 다른 7개 UUID 집합이다. 이는 ③④의 생성 원인을 하나로 단정할 근거가 아니며, 이번 5건의 대체 복구 대상으로도 취급하지 않았다.

셋째 가능성은 **DB 시드/적재 시점 또는 공유 DB 상태가 PC별로 달라 집PC의 5건이 회사PC에 존재하지 않는 것**이다. 현재 측정만으로 삭제·재생성·다른 생성 경로 중 어느 것인지 단정하지 않는다.

## 4. 5건별 판정

| 구분 | 집PC에서 지목된 행 | 회사PC 판정 | 근거 |
|---|---|---|---|
| ③-1 | `2026/05/30-1` / line `15cc9c43-a3d8-4a09-abb4-e25d75e4dfc1` | 잇지 않음 — 중단 | 재조회 SQL이 0행이며 회사PC 후보 모델명도 0건 |
| ③-2 | `2026/05/30-2` / line `3c4ceb75-1e26-4e9d-a879-97d9b2d55545` | 잇지 않음 — 중단 | 재조회 SQL이 0행이며 회사PC 후보 모델명도 0건 |
| ③-3 | `2026/05/30-3` / line `e3f433a7-4b05-4026-94c9-2a7509390a58` | 잇지 않음 — 중단 | 재조회 SQL이 0행이며 회사PC 후보 모델명도 0건 |
| ④-1 | `2026/06/08-1982` / home UUID `77fabff4-6917-3846-ad8c-3616eba3a219` | 잇지 않음 — 중단 | 지정 UUID 재조회 SQL이 0행이며 회사PC 후보 모델명도 0건 |
| ④-2 | `2026/06/08-1983` / home UUID `a4055da1-c827-33c3-bd7f-c559e59db594` | 잇지 않음 — 중단 | 지정 UUID 재조회 SQL이 0행이며 회사PC 후보 모델명도 0건 |

위 판정은 “회사PC에서 복구할 5건이 아니다”라는 확정 판정이 아니라, 개발책임자가 지정한 **회사PC 재측정 불일치 시 중단 규칙**에 따른 작업 중단 판정이다. 원문 행이 없는 상태에서 다른 UUID나 다른 SKU로 연결하지 않았다.

## 5. RED-A / RED-B 및 전후 대조

### RED-A

```text
RED-A: BLOCKED
사유: 회사PC의 지정 5건 재조회 결과 ③ 0행, ④ 0행.
결과: 복구된 대상 0건, 실재 product 참조로 바뀐 대상 0건.
```

RED-A는 대상 행 자체가 없어 실행할 수 없다. 5건을 다른 행에 대응시켜 통과시키지 않았다.

### RED-B

```text
RED-B-1 후보가 유일하지 않은 건 자동 연결 금지: NOT EXERCISED / NO AUTO-LINK
실행 결과: 후보 SQL에서 4개 입력 모두 active_model_name_candidates=0,
           active_snapshot_name_candidates=0. 비유일 후보는 발생하지 않았고 자동 연결 0건.

RED-B-2 복구 대상이 아닌 행의 product_id 불변: PASS BY NON-ACTION
실행 결과: DB UPDATE/INSERT/DELETE 0회. 다른 트랙의 행을 조회·변경하지 않음.

RED-B-3 복구 행의 금액·품목명 snapshot 보존: BLOCKED / NOT APPLICABLE
실행 결과: 회사PC에 복구 행이 없어 보존 대상 0건.
```

### 복구 전후 카운트 대조

복구 SQL은 실행하지 않았으므로 “복구 후”는 **복구를 시도하지 않은 현재 DB 재확인값**이다.

```text
항목                         복구 전             복구 후/현재 재확인       변경
slip_lines 전체/비삭제       449 / 290            449 / 290                 0
partner_order_lines 전체/비삭제 648 / 646         648 / 646                 0
product_db.products 전체/비삭제 3063 / 3061       3063 / 3061               0
지정 ③ slip 재조회           0행                 0행                      0
지정 ④ order 재조회          0행                 0행                      0
```

`RED-A`를 충족하지 못하고 회사PC 전제가 집PC와 다르므로 여기서 중단한다. 전체 테스트, Docker 재빌드/재배포, 코드 변경, 마이그레이션, 커밋, 푸시는 실행하지 않았다.

복구 SQL을 실행하지 않은 뒤 같은 카운트와 지정 행 존재 여부를 다시 조회한 원문 결과:

```text
          measured_at          | table_name | total_lines | active_lines
-------------------------------+------------+-------------+--------------
 2026-08-06 09:47:44.330775+09 | slip_lines |         449 |          290
(1 row)

          measured_at          |     table_name      | total_lines | active_lines
-------------------------------+---------------------+-------------+--------------
 2026-08-06 09:47:44.313688+09 | partner_order_lines |         648 |          646
(1 row)

          measured_at          | table_name | total_products | active_products
-------------------------------+------------+----------------+-----------------
 2026-08-06 09:47:44.328147+09 | products   |           3063 |            3061
(1 row)

 designated_slip_rows
----------------------
                    0
(1 row)

 designated_partner_order_rows
-------------------------------
                             0
(1 row)
```

## 6. 신규 파일

```text
docs/dev-reports/2026-08-06-1051-r1-axis-a-recovery.md
```
