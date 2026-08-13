# #1144 회계전표 매출·매입 — 집PC 선행 데이터 정합성 정찰

> 실측일: 2026-08-13 20:21 KST  
> 대상: 집PC `samhan-postgres`의 `slip_db`, `accounting_db` 및 `partner_code` 보유 서비스 DB  
> 기준 코드: 로컬 `main`  
> 선행 자료: `git show origin/feat/1144-accounting-slip-link:docs/dev-reports/2026-08-13-1144-recon-sol.md`  
> 제약: 코드 수정 없음, Git 쓰기 없음, DB 쓰기 없음. 모든 DB 측정은 `BEGIN TRANSACTION READ ONLY` 또는 `BEGIN READ ONLY`와 `ROLLBACK`으로 실행했다.

## 0. 즉시 판정

집PC 원시 수치는 회사PC 정찰과 다르다. 다만 오늘 알려진 QA 전표를 분리하면 실 업무 후보와 기존 고아 allocation 수치는 회사PC 정찰과 같아진다.

| 항목 | 집PC 원시 | 알려진 QA 제외 |
|---|---:|---:|
| 생성 조건 충족 OUTBOUND | 3건 / 6라인 | **2건 / 5라인** |
| 생성 조건 충족 INBOUND | 1건 / 1라인 | **0건 / 0라인** |
| 활성 매출 회계전표 | 1건 | **0건** |
| 활성 매입 회계전표 | 1건 | **0건** |
| 활성 매출 allocation | 2건 | **1건** |
| 활성 매입 allocation | 1건 | **0건** |
| 삭제된 원천 전표 아래 활성 allocation | **1건** | **1건** |

추가 발견은 다음과 같다.

- 집PC의 알려진 QA 원천 4건은 더 이상 모두 DRAFT가 아니다. `OUTBOUND 2026/08/13-3`과 `INBOUND 2026/08/13-1`이 현재 `CONFIRMED`이고 각각 활성 회계전표와 allocation을 갖는다.
- UUID가 있으면서 `partner_code`가 빈 활성 행은 `slip_db.slips` 9건, `accounting_db.tax_invoices` 13건이다. 활성 매출·매입 회계전표 헤더에는 없다.
- `chart_of_accounts`는 활성 353행(3자리 77, 4자리 275, 기타 1)인데, `journal_lines` 309행과 `cash_receipts`의 계정코드 51행은 모두 3자리다.
- 현재 #1144 구현 계획과 회계 서비스의 관련 쓰기·집계 코드는 `110`, `201/210`, `255`, `401` 3자리 코드를 명시한다.
- `flyway_schema_history`에는 V101 적용 기록이 없다. 데이터에는 4자리 계정 275개가 있지만 분개 이관은 일어나지 않은 혼재 상태다.

## 1. 생성 가능한 실 전표 — 매출·매입 건수와 라인 수

여기서 “생성 조건 충족”은 현재 생성 서비스가 검사하는 활성 `CONFIRMED`, 거래처 UUID·코드·명 모두 채움, 활성 라인 존재 조건이다. 알려진 QA 여부는 전표번호와 유형으로 별도 분류했다.

### 실행 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
WITH classified AS (
  SELECT s.id,s.slip_type,
         CASE WHEN (s.slip_type='OUTBOUND'
                         AND s.slip_no IN ('2026/08/13-1','2026/08/13-2','2026/08/13-3'))
                    OR (s.slip_type='INBOUND' AND s.slip_no='2026/08/13-1')
              THEN 'KNOWN_QA' ELSE 'NON_QA' END AS qa_class
  FROM slips s
  WHERE s.is_deleted=false AND s.status='CONFIRMED'
    AND s.partner_id IS NOT NULL
    AND NULLIF(BTRIM(s.partner_code),'') IS NOT NULL
    AND NULLIF(BTRIM(s.partner_name),'') IS NOT NULL
)
SELECT c.qa_class,c.slip_type,
       COUNT(DISTINCT c.id) AS candidate_slips,
       COUNT(l.id) AS candidate_lines
FROM classified c
JOIN slip_lines l ON l.slip_id=c.id AND l.is_deleted=false
GROUP BY c.qa_class,c.slip_type
ORDER BY c.qa_class,c.slip_type;
ROLLBACK;
```

### 출력 원문

```text
BEGIN
 qa_class | slip_type | candidate_slips | candidate_lines
----------+-----------+-----------------+-----------------
 KNOWN_QA | INBOUND   |               1 |               1
 KNOWN_QA | OUTBOUND  |               1 |               1
 NON_QA   | OUTBOUND  |               2 |               5
(3 rows)

ROLLBACK
```

### 실 전표 상세 확인 쿼리

UUID 값은 출력하지 않고 채움 여부만 `SET/EMPTY`로 표시했다.

```sql
BEGIN TRANSACTION READ ONLY;
SELECT s.slip_type,s.slip_no,s.status,s.is_deleted,
       CASE WHEN s.partner_id IS NULL THEN 'EMPTY' ELSE 'SET' END AS partner_uuid,
       COALESCE(NULLIF(BTRIM(s.partner_code),''),'<EMPTY>') AS partner_code,
       COALESCE(NULLIF(BTRIM(s.partner_name),''),'<EMPTY>') AS partner_name,
       COUNT(l.id) FILTER (WHERE l.is_deleted=false) AS active_lines,
       CASE WHEN
         (s.slip_type='OUTBOUND' AND s.slip_no IN ('2026/08/13-1','2026/08/13-2','2026/08/13-3'))
         OR (s.slip_type='INBOUND' AND s.slip_no='2026/08/13-1')
       THEN 'KNOWN_QA' ELSE 'NON_QA' END AS qa_class
FROM slips s
LEFT JOIN slip_lines l ON l.slip_id=s.id
WHERE (s.is_deleted=false AND s.status='CONFIRMED')
   OR (s.slip_type='OUTBOUND' AND s.slip_no IN ('2026/08/13-1','2026/08/13-2','2026/08/13-3'))
   OR (s.slip_type='INBOUND' AND s.slip_no='2026/08/13-1')
   OR (s.slip_type='OUTBOUND' AND s.slip_no='2026/07/27-64')
GROUP BY s.id,s.slip_type,s.slip_no,s.status,s.is_deleted,
         s.partner_id,s.partner_code,s.partner_name
ORDER BY qa_class,s.slip_type,s.slip_no;
ROLLBACK;
```

### 출력 원문

```text
 slip_type |    slip_no    |  status   | is_deleted | partner_uuid | partner_code |    partner_name    | active_lines | qa_class
-----------+---------------+-----------+------------+--------------+--------------+--------------------+--------------+----------
 INBOUND   | 2026/08/13-1  | CONFIRMED | f          | SET          | P-2026-0017  | 원주에어컨공업     |            1 | KNOWN_QA
 OUTBOUND  | 2026/08/13-1  | DRAFT     | f          | SET          | P-2026-0017  | 원주에어컨공업     |            1 | KNOWN_QA
 OUTBOUND  | 2026/08/13-2  | DRAFT     | f          | SET          | P-2026-0017  | 원주에어컨공업     |            1 | KNOWN_QA
 OUTBOUND  | 2026/08/13-3  | CONFIRMED | f          | SET          | P-2026-0017  | 원주에어컨공업     |            1 | KNOWN_QA
 INBOUND   | 2026/08/09-6  | CONFIRMED | f          | SET          | <EMPTY>      | ?????              |            1 | NON_QA
 OUTBOUND  | 2026/07/27-64 | REJECTED  | t          | SET          | P-2026-0018  | 강릉HVAC솔루션     |            0 | NON_QA
 OUTBOUND  | 2026/08/03-6  | CONFIRMED | f          | SET          | 2148720659   | (주)삼한공조시스템 |            4 | NON_QA
 OUTBOUND  | 2026/08/07-3  | CONFIRMED | f          | SET          | 000011111111 | 한울냉열시스템     |            1 | NON_QA
(8 rows)
```

판정: 알려진 QA 제외 시 생성 가능한 실 전표는 **매출 2건/5라인, 매입 0건/0라인**이다. 매입의 비-QA CONFIRMED 1건은 UUID만 있고 거래처 코드가 비어 생성 조건을 충족하지 않는다.

## 2. 활성 회계전표 — 매출·매입

### 실행 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
WITH classified AS (
 SELECT 'SALES'::text AS accounting_type,h.status,
        CASE WHEN EXISTS (
          SELECT 1
          FROM sales_accounting_slip_lines l
          JOIN sales_accounting_slip_allocations a
            ON a.sales_slip_line_id=l.id AND a.is_deleted=false
          WHERE l.slip_id=h.id
            AND a.source_slip_no IN ('2026/08/13-1','2026/08/13-2','2026/08/13-3')
        ) THEN 'KNOWN_QA' ELSE 'NON_QA' END AS qa_class
 FROM sales_accounting_slips h WHERE h.is_deleted=false
 UNION ALL
 SELECT 'PURCHASE',h.status,
        CASE WHEN EXISTS (
          SELECT 1
          FROM purchase_accounting_slip_lines l
          JOIN purchase_accounting_slip_allocations a
            ON a.purchase_slip_line_id=l.id AND a.is_deleted=false
          WHERE l.slip_id=h.id AND a.source_slip_no='2026/08/13-1'
        ) THEN 'KNOWN_QA' ELSE 'NON_QA' END
 FROM purchase_accounting_slips h WHERE h.is_deleted=false
)
SELECT accounting_type,qa_class,status,COUNT(*) AS active_slips
FROM classified
GROUP BY accounting_type,qa_class,status
ORDER BY accounting_type,qa_class,status;
ROLLBACK;
```

### 출력 원문

```text
BEGIN
 accounting_type | qa_class | status | active_slips
-----------------+----------+--------+--------------
 PURCHASE        | KNOWN_QA | DRAFT  |            1
 SALES           | KNOWN_QA | DRAFT  |            1
(2 rows)

ROLLBACK
```

판정: 원시 집계는 매출 1건, 매입 1건이다. 둘 다 알려진 QA 원천에 연결된 DRAFT이므로 QA 제외 활성 실 회계전표는 **매출 0건, 매입 0건**이다.

## 3. 고아 allocation — 삭제된 원천 전표 아래 활성 행

### accounting_db 실행 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
SELECT 'SALES' AS accounting_type,
       source_slip_no,source_line_no,
       CASE WHEN source_slip_id IS NULL THEN 'EMPTY' ELSE 'SET' END AS source_uuid,
       CASE WHEN source_line_id IS NULL THEN 'EMPTY' ELSE 'SET' END AS source_line_uuid,
       allocated_qty,allocated_amount,h.slip_no AS accounting_slip_no,
       h.status AS accounting_status,h.is_deleted AS accounting_deleted,
       l.is_deleted AS accounting_line_deleted,a.is_deleted AS allocation_deleted
FROM sales_accounting_slip_allocations a
JOIN sales_accounting_slip_lines l ON l.id=a.sales_slip_line_id
JOIN sales_accounting_slips h ON h.id=l.slip_id
WHERE a.is_deleted=false
UNION ALL
SELECT 'PURCHASE',source_slip_no,source_line_no,
       CASE WHEN source_slip_id IS NULL THEN 'EMPTY' ELSE 'SET' END,
       CASE WHEN source_line_id IS NULL THEN 'EMPTY' ELSE 'SET' END,
       allocated_qty,allocated_amount,h.slip_no,h.status,
       h.is_deleted,l.is_deleted,a.is_deleted
FROM purchase_accounting_slip_allocations a
JOIN purchase_accounting_slip_lines l ON l.id=a.purchase_slip_line_id
JOIN purchase_accounting_slips h ON h.id=l.slip_id
WHERE a.is_deleted=false
ORDER BY accounting_type,source_slip_no,source_line_no;
ROLLBACK;
```

### 출력 원문

```text
 accounting_type | source_slip_no | source_line_no | source_uuid | source_line_uuid | allocated_qty | allocated_amount | accounting_slip_no | accounting_status | accounting_deleted | accounting_line_deleted | allocation_deleted
-----------------+----------------+----------------+-------------+------------------+---------------+------------------+--------------------+-------------------+--------------------+-------------------------+-------------------
 PURCHASE        | 2026/08/13-1   |              1 | SET         | SET              |         1.000 |        600600.00 | 2026/08/13-6831    | DRAFT             | f                  | f                       | f
 SALES           | 2026/07/27-64  |              1 | SET         | SET              |         3.000 |        330000.00 | 2026/07/26-1027    | POSTED            | t                  | t                       | f
 SALES           | 2026/08/13-3   |              1 | SET         | SET              |         1.000 |       1001000.00 | 2026/08/13-5591    | DRAFT             | f                  | f                       | f
(3 rows)
```

### slip_db 원천 상태 확인 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
SELECT s.slip_type,s.slip_no,s.status,s.is_deleted,
       COUNT(l.id) AS all_lines,
       COUNT(l.id) FILTER (WHERE l.is_deleted=false) AS active_lines
FROM slips s
LEFT JOIN slip_lines l ON l.slip_id=s.id
WHERE (s.slip_type='OUTBOUND'
       AND s.slip_no IN ('2026/07/27-64','2026/08/13-1','2026/08/13-2','2026/08/13-3'))
   OR (s.slip_type='INBOUND' AND s.slip_no='2026/08/13-1')
GROUP BY s.id,s.slip_type,s.slip_no,s.status,s.is_deleted
ORDER BY s.slip_type,s.slip_no;
ROLLBACK;
```

### 출력 원문

```text
 slip_type |    slip_no    |  status   | is_deleted | all_lines | active_lines
-----------+---------------+-----------+------------+-----------+-------------
 INBOUND   | 2026/08/13-1  | CONFIRMED | f          |         1 |            1
 OUTBOUND  | 2026/07/27-64 | REJECTED  | t          |         2 |            0
 OUTBOUND  | 2026/08/13-1  | DRAFT     | f          |         1 |            1
 OUTBOUND  | 2026/08/13-2  | DRAFT     | f          |         1 |            1
 OUTBOUND  | 2026/08/13-3  | CONFIRMED | f          |         1 |            1
(5 rows)
```

판정: 삭제된 원천 `OUTBOUND 2026/07/27-64` 아래 활성 매출 allocation이 **1건** 있다. 그 allocation의 회계전표 헤더와 회계 라인도 삭제 상태지만 allocation 자체는 활성이다. 나머지 활성 allocation 2건은 오늘 알려진 QA 원천이다.

## 4. 조인 키 공백 — UUID만 채워진 행과 `partner_code` 전수 집계

### 4.1 UUID/코드 쌍을 가진 테이블 전수 발견 쿼리

아래 쿼리를 서비스 DB 14개에 반복 실행했다.

```sql
BEGIN READ ONLY;
SELECT '<DB>',c1.table_schema,c1.table_name
FROM information_schema.columns c1
JOIN information_schema.columns c2
  ON c2.table_schema=c1.table_schema AND c2.table_name=c1.table_name
WHERE c1.column_name='partner_id'
  AND c2.column_name='partner_code'
  AND c1.table_schema NOT IN ('pg_catalog','information_schema')
ORDER BY c1.table_schema,c1.table_name;
ROLLBACK;
```

### 출력 원문

```text
accounting_db|public|bank_depositor_partner_mapping
accounting_db|public|purchase_accounting_slips
accounting_db|public|sales_accounting_slips
accounting_db|public|tax_invoices
accounting_db|staging|ecount_deposit_report_raw
accounting_db|staging|ecount_expense_voucher_raw
partner_db|public|partner_revisions
partner_order_db|public|partner_orders
slip_db|public|slips
```

### 4.2 모든 물리 `partner_code` 컬럼 전수 공백률 쿼리

각 DB의 모든 `partner_code` 컬럼을 `information_schema`에서 얻은 뒤 아래 SELECT를 실행했다. `is_deleted` 컬럼이 있는 테이블은 활성 행만, 없으면 전체 행을 분모로 삼았다. `partner_id`가 있는 테이블은 `uuid_filled`, `uuid_only`도 함께 셌다.

```sql
BEGIN READ ONLY;
SELECT '<db.schema.table>' AS relation,
       COUNT(*) AS scope_rows,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(partner_code),'') IS NOT NULL) AS code_filled,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(partner_code),'') IS NULL) AS blank_rows,
       ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(partner_code),'') IS NULL)
             / NULLIF(COUNT(*),0), 2) AS blank_pct,
       COUNT(*) FILTER (WHERE partner_id IS NOT NULL) AS uuid_filled,
       COUNT(*) FILTER (
           WHERE partner_id IS NOT NULL
             AND NULLIF(BTRIM(partner_code),'') IS NULL
       ) AS uuid_only
FROM <schema.table>
-- is_deleted 컬럼이 있으면: WHERE is_deleted=false
;
ROLLBACK;
```

### 출력 원문

열 순서: `relation|scope_rows|code_filled|blank_rows|blank_pct|uuid_filled|uuid_only`. 빈 마지막 열은 해당 테이블에 `partner_id`가 없어 UUID 집계 대상이 아니라는 뜻이다.

```text
accounting_db.public.bank_depositor_partner_mapping|4|4|0|0.00|4|0
accounting_db.public.purchase_accounting_slips|1|1|0|0.00|1|0
accounting_db.public.sales_accounting_slips|1|1|0|0.00|1|0
accounting_db.public.tax_invoice_batch_exclusions|0|0|0|||
accounting_db.public.tax_invoices|19|6|13|68.42|19|13
accounting_db.staging.ecount_deposit_report_raw|0|0|0||0|0
accounting_db.staging.ecount_expense_voucher_raw|0|0|0||0|0
accounting_db.staging.ecount_purchase_ledger_raw|0|0|0|||
accounting_db.staging.ecount_sales_ledger_raw|0|0|0|||
accounting_db.staging.ecount_sales_slip_line_raw|0|0|0|||
accounting_db.staging.ecount_tax_invoice_raw|0|0|0|||
dc_config_db.public.partners|210|210|0|0.00||
notification_db.public.partner_chat_room_mappings|112|112|0|0.00||
partner_auth_db.public.partner_auth|2|2|0|0.00||
partner_db.public.blocked_partners|0|0|0|||
partner_db.public.partner_revisions|16|16|0|0.00|16|0
partner_db.public.partners|7309|7309|0|0.00||
partner_order_db.public.partner_order_drafts|11|11|0|0.00||
partner_order_db.public.partner_order_front_event_log|383|0|383|100.00||
partner_order_db.public.partner_order_history|5988|5988|0|0.00||
partner_order_db.public.partner_orders|4|4|0|0.00|2|0
partner_order_db.public.partner_tutorial_state|0|0|0|||
slip_db.public.slips|192|100|92|47.92|109|9
```

### 4.3 활성 원천 전표 유형별 UUID/코드 공백률 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
SELECT slip_type,
       COUNT(*) AS active_rows,
       COUNT(*) FILTER (WHERE partner_id IS NOT NULL) AS uuid_filled,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(partner_code),'') IS NOT NULL) AS code_filled,
       COUNT(*) FILTER (
           WHERE partner_id IS NOT NULL
             AND NULLIF(BTRIM(partner_code),'') IS NULL
       ) AS uuid_only,
       ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(partner_code),'') IS NULL)
             / NULLIF(COUNT(*),0), 2) AS blank_pct
FROM slips
WHERE is_deleted=false
GROUP BY slip_type
ORDER BY slip_type;
ROLLBACK;
```

### 출력 원문

```text
 slip_type | active_rows | uuid_filled | code_filled | uuid_only | blank_pct
-----------+-------------+-------------+-------------+-----------+----------
 INBOUND   |          43 |          41 |          32 |         9 |     25.58
 OUTBOUND  |         149 |          68 |          68 |         0 |     54.36
(2 rows)
```

판정:

- UUID만 있고 `partner_code`가 빈 활성 행: `slips` INBOUND 9건, `tax_invoices` 13건. 다른 UUID/코드 쌍 테이블은 0건이다.
- `slips` OUTBOUND의 빈 코드 81건은 UUID도 없는 행이므로 “UUID만 있고 코드 없음”에는 포함하지 않았다.
- `partner_order_front_event_log.partner_code`는 383/383행이 비어 있지만 이 테이블에는 `partner_id`도 없다. UUID/코드 불일치 집계가 아니라 코드-only 컬럼 공백 집계다.
- 표본 0인 8개 테이블은 공백률을 계산하지 않았다.

## 5. N:M 연결 구조 — 실제 사용 현황

### 실행 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
SELECT 'SALES' AS accounting_type,
       COUNT(*) AS active_allocations,
       COUNT(*) FILTER (WHERE a.source_slip_id IS NOT NULL) AS source_uuid_filled,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(a.source_slip_no),'') IS NOT NULL) AS source_no_filled,
       COUNT(*) FILTER (WHERE a.source_line_id IS NOT NULL) AS source_line_uuid_filled,
       COUNT(*) FILTER (WHERE a.source_line_no IS NOT NULL) AS source_line_no_filled,
       COUNT(*) FILTER (WHERE h.is_deleted=true) AS deleted_parent_slip,
       COUNT(*) FILTER (WHERE l.is_deleted=true) AS deleted_parent_line,
       COUNT(DISTINCT a.source_slip_id) AS distinct_source_slips,
       COUNT(DISTINCT a.source_line_id) AS distinct_source_lines,
       COUNT(DISTINCT l.slip_id) AS distinct_accounting_slips
FROM sales_accounting_slip_allocations a
JOIN sales_accounting_slip_lines l ON l.id=a.sales_slip_line_id
JOIN sales_accounting_slips h ON h.id=l.slip_id
WHERE a.is_deleted=false
UNION ALL
SELECT 'PURCHASE',COUNT(*),
       COUNT(*) FILTER (WHERE a.source_slip_id IS NOT NULL),
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(a.source_slip_no),'') IS NOT NULL),
       COUNT(*) FILTER (WHERE a.source_line_id IS NOT NULL),
       COUNT(*) FILTER (WHERE a.source_line_no IS NOT NULL),
       COUNT(*) FILTER (WHERE h.is_deleted=true),
       COUNT(*) FILTER (WHERE l.is_deleted=true),
       COUNT(DISTINCT a.source_slip_id),
       COUNT(DISTINCT a.source_line_id),
       COUNT(DISTINCT l.slip_id)
FROM purchase_accounting_slip_allocations a
JOIN purchase_accounting_slip_lines l ON l.id=a.purchase_slip_line_id
JOIN purchase_accounting_slips h ON h.id=l.slip_id
WHERE a.is_deleted=false;

SELECT 'SALES_BY_SOURCE_LINE' AS axis,
       COALESCE(MAX(n),0) AS max_allocations_per_source_line,
       COUNT(*) FILTER (WHERE n>1) AS source_lines_with_many
FROM (
  SELECT source_line_id,COUNT(*) n
  FROM sales_accounting_slip_allocations
  WHERE is_deleted=false GROUP BY source_line_id
) x
UNION ALL
SELECT 'PURCHASE_BY_SOURCE_LINE',COALESCE(MAX(n),0),COUNT(*) FILTER (WHERE n>1)
FROM (
  SELECT source_line_id,COUNT(*) n
  FROM purchase_accounting_slip_allocations
  WHERE is_deleted=false GROUP BY source_line_id
) x;

SELECT 'SALES_PER_ACCOUNTING_LINE' AS axis,
       COALESCE(MAX(n),0) AS max_allocations_per_accounting_line,
       COUNT(*) FILTER (WHERE n>1) AS accounting_lines_with_many
FROM (
  SELECT sales_slip_line_id,COUNT(*) n
  FROM sales_accounting_slip_allocations
  WHERE is_deleted=false GROUP BY sales_slip_line_id
) x
UNION ALL
SELECT 'PURCHASE_PER_ACCOUNTING_LINE',COALESCE(MAX(n),0),COUNT(*) FILTER (WHERE n>1)
FROM (
  SELECT purchase_slip_line_id,COUNT(*) n
  FROM purchase_accounting_slip_allocations
  WHERE is_deleted=false GROUP BY purchase_slip_line_id
) x;
ROLLBACK;
```

### 출력 원문

```text
 accounting_type | active_allocations | source_uuid_filled | source_no_filled | source_line_uuid_filled | source_line_no_filled | deleted_parent_slip | deleted_parent_line | distinct_source_slips | distinct_source_lines | distinct_accounting_slips
-----------------+--------------------+--------------------+------------------+-------------------------+-----------------------+---------------------+---------------------+-----------------------+-----------------------+--------------------------
 SALES           |                  2 |                  2 |                2 |                       2 |                     2 |                   1 |                   1 |                     2 |                     2 |                         2
 PURCHASE        |                  1 |                  1 |                1 |                       1 |                     1 |                   0 |                   0 |                     1 |                     1 |                         1
(2 rows)

          axis           | max_allocations_per_source_line | source_lines_with_many
-------------------------+---------------------------------+-----------------------
 SALES_BY_SOURCE_LINE    |                               1 |                     0
 PURCHASE_BY_SOURCE_LINE |                               1 |                     0
(2 rows)

             axis             | max_allocations_per_accounting_line | accounting_lines_with_many
------------------------------+-------------------------------------+---------------------------
 SALES_PER_ACCOUNTING_LINE    |                                   1 |                         0
 PURCHASE_PER_ACCOUNTING_LINE |                                   1 |                         0
(2 rows)
```

판정: 연결 테이블은 실제로 사용 중이다. 활성 3행 모두 원천 전표 UUID/번호와 원천 라인 UUID/번호가 채워져 있다. 현재 표본에서는 원천 라인 하나가 여러 회계 라인에 연결되거나 회계 라인 하나가 여러 원천 라인에 연결된 실적은 0건이며, 관측된 최대 다중도는 양쪽 모두 1이다.

## 6. 계정과목 의존 — 3자리와 4자리

### 6.1 계정과목·분개 길이 실측 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
SELECT 'chart_of_accounts' AS relation,
       COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE is_deleted=false) AS active_rows,
       COUNT(*) FILTER (WHERE is_deleted=false AND code ~ '^[0-9]{3}$') AS active_3digit,
       COUNT(*) FILTER (WHERE is_deleted=false AND code ~ '^[0-9]{4}$') AS active_4digit,
       COUNT(*) FILTER (WHERE is_deleted=false AND code !~ '^[0-9]{3,4}$') AS active_other
FROM chart_of_accounts
UNION ALL
SELECT 'journal_lines',COUNT(*),COUNT(*) FILTER (WHERE is_deleted=false),
       COUNT(*) FILTER (WHERE is_deleted=false AND account_code ~ '^[0-9]{3}$'),
       COUNT(*) FILTER (WHERE is_deleted=false AND account_code ~ '^[0-9]{4}$'),
       COUNT(*) FILTER (WHERE is_deleted=false AND account_code !~ '^[0-9]{3,4}$')
FROM journal_lines;
ROLLBACK;
```

### 출력 원문

```text
     relation      | total_rows | active_rows | active_3digit | active_4digit | active_other
-------------------+------------+-------------+---------------+---------------+-------------
 chart_of_accounts |        353 |         353 |            77 |           275 |            1
 journal_lines     |        309 |         309 |           309 |             0 |            0
(2 rows)
```

### 6.2 계정코드 참조 컬럼 전수 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
SELECT 'journal_lines.account_code' AS key_column,
       COUNT(*) FILTER (WHERE is_deleted=false) AS scope_rows,
       COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(account_code),'') IS NULL) AS blank_rows,
       ROUND(100.0*COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(account_code),'') IS NULL)
             /NULLIF(COUNT(*) FILTER (WHERE is_deleted=false),0),2) AS blank_pct,
       COUNT(*) FILTER (WHERE is_deleted=false AND account_code ~ '^[0-9]{3}$') AS code_3digit,
       COUNT(*) FILTER (WHERE is_deleted=false AND account_code ~ '^[0-9]{4}$') AS code_4digit
FROM journal_lines
UNION ALL
SELECT 'bank_accounts.account_code',COUNT(*) FILTER (WHERE is_deleted=false),
       COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(account_code),'') IS NULL),
       ROUND(100.0*COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(account_code),'') IS NULL)
             /NULLIF(COUNT(*) FILTER (WHERE is_deleted=false),0),2),
       COUNT(*) FILTER (WHERE is_deleted=false AND account_code ~ '^[0-9]{3}$'),
       COUNT(*) FILTER (WHERE is_deleted=false AND account_code ~ '^[0-9]{4}$')
FROM bank_accounts
UNION ALL
SELECT 'bank_accounts.chart_account_code',COUNT(*) FILTER (WHERE is_deleted=false),
       COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(chart_account_code),'') IS NULL),
       ROUND(100.0*COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(chart_account_code),'') IS NULL)
             /NULLIF(COUNT(*) FILTER (WHERE is_deleted=false),0),2),
       COUNT(*) FILTER (WHERE is_deleted=false AND chart_account_code ~ '^[0-9]{3}$'),
       COUNT(*) FILTER (WHERE is_deleted=false AND chart_account_code ~ '^[0-9]{4}$')
FROM bank_accounts
UNION ALL
SELECT 'cash_receipts.debit_account_code',COUNT(*) FILTER (WHERE is_deleted=false),
       COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(debit_account_code),'') IS NULL),
       ROUND(100.0*COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(debit_account_code),'') IS NULL)
             /NULLIF(COUNT(*) FILTER (WHERE is_deleted=false),0),2),
       COUNT(*) FILTER (WHERE is_deleted=false AND debit_account_code ~ '^[0-9]{3}$'),
       COUNT(*) FILTER (WHERE is_deleted=false AND debit_account_code ~ '^[0-9]{4}$')
FROM cash_receipts
UNION ALL
SELECT 'cash_receipts.credit_account_code',COUNT(*) FILTER (WHERE is_deleted=false),
       COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(credit_account_code),'') IS NULL),
       ROUND(100.0*COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(credit_account_code),'') IS NULL)
             /NULLIF(COUNT(*) FILTER (WHERE is_deleted=false),0),2),
       COUNT(*) FILTER (WHERE is_deleted=false AND credit_account_code ~ '^[0-9]{3}$'),
       COUNT(*) FILTER (WHERE is_deleted=false AND credit_account_code ~ '^[0-9]{4}$')
FROM cash_receipts
UNION ALL
SELECT 'card_master.linked_account_code',COUNT(*) FILTER (WHERE is_deleted=false),
       COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(linked_account_code),'') IS NULL),
       ROUND(100.0*COUNT(*) FILTER (WHERE is_deleted=false AND NULLIF(BTRIM(linked_account_code),'') IS NULL)
             /NULLIF(COUNT(*) FILTER (WHERE is_deleted=false),0),2),
       COUNT(*) FILTER (WHERE is_deleted=false AND linked_account_code ~ '^[0-9]{3}$'),
       COUNT(*) FILTER (WHERE is_deleted=false AND linked_account_code ~ '^[0-9]{4}$')
FROM card_master;
ROLLBACK;
```

### 출력 원문

```text
            key_column             | scope_rows | blank_rows | blank_pct | code_3digit | code_4digit
-----------------------------------+------------+------------+-----------+-------------+------------
 journal_lines.account_code        |        309 |          0 |      0.00 |         309 |           0
 bank_accounts.account_code        |          0 |          0 |    <NULL> |           0 |           0
 bank_accounts.chart_account_code  |          0 |          0 |    <NULL> |           0 |           0
 cash_receipts.debit_account_code  |         51 |          0 |      0.00 |          51 |           0
 cash_receipts.credit_account_code |         51 |          0 |      0.00 |          51 |           0
 card_master.linked_account_code   |          0 |          0 |    <NULL> |           0 |           0
(6 rows)
```

### 6.3 #1144 관련 코드의 실제 사용 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
SELECT jl.account_code,COUNT(*) AS active_lines,
       COUNT(*) FILTER (WHERE j.status='DRAFT') AS draft_lines,
       COUNT(*) FILTER (WHERE j.status='POSTED') AS posted_lines,
       COUNT(*) FILTER (WHERE j.status='REVERSED') AS reversed_lines
FROM journal_lines jl
JOIN journals j ON j.id=jl.journal_id
WHERE jl.is_deleted=false AND j.is_deleted=false
  AND jl.account_code IN ('110','255','401','201','1089','2559','4019','2519')
GROUP BY jl.account_code
ORDER BY jl.account_code;

SELECT code,name,is_leaf,
       CASE WHEN code ~ '^[0-9]{3}$' THEN '3'
            WHEN code ~ '^[0-9]{4}$' THEN '4'
            ELSE 'OTHER' END AS digits
FROM chart_of_accounts
WHERE is_deleted=false
  AND code IN ('110','255','401','201','1089','2559','4019','2519')
ORDER BY code;
ROLLBACK;
```

### 출력 원문

```text
 account_code | active_lines | draft_lines | posted_lines | reversed_lines
--------------+--------------+-------------+--------------+---------------
 110          |           99 |           9 |           65 |             25
 201          |            3 |           0 |            3 |              0
 255          |            7 |           0 |            5 |              2
 401          |           42 |           5 |           32 |              5
(4 rows)

 code |     name     | is_leaf | digits
------+--------------+---------+-------
 1089 | 외상매출금   | t       | 4
 110  | 외상매출금   | t       | 3
 201  | 외상매입금   | t       | 3
 2519 | 외상매입금   | t       | 4
 255  | 부가세예수금 | t       | 3
 2559 | 부가세예수금 | t       | 4
 401  | 상품매출     | t       | 3
 4019 | 상품매출     | t       | 4
(8 rows)
```

### 6.4 Flyway 적용 상태 쿼리

```sql
BEGIN TRANSACTION READ ONLY;
SELECT installed_rank,version,description,success
FROM flyway_schema_history
WHERE version IN ('101')
   OR description ILIKE '%account%canon%'
   OR description ILIKE '%ecount%account%'
ORDER BY installed_rank;

SELECT installed_rank,version,description,success
FROM flyway_schema_history
ORDER BY installed_rank DESC
LIMIT 8;
ROLLBACK;
```

### 출력 원문

```text
 installed_rank | version |           description           | success
----------------+---------+---------------------------------+--------
             22 | 22      | add ecount account card staging | t
(1 row)

 installed_rank | version |                 description                  | success
----------------+---------+----------------------------------------------+--------
             72 | 98      | add sales commission rate contract snapshot  | t
             71 | 97      | add sales commission settlement              | t
             70 | 96      | add partner ledger snapshot lineage          | t
             69 | 68      | add cash receipt lines json                  | t
             68 | 95      | add document snapshot type                   | t
             67 | 67      | preserve sales category axis                 | t
             66 | 66      | add user codef import scope version          | t
             65 | 65      | add user codef import scope refs consistency | t
(8 rows)
```

### 6.5 코드·#1144 계획의 자리수 전제 검색 명령

```powershell
rg -n 'ACCOUNT_RECEIVABLES =|ACCOUNT_VAT_PAYABLE =|ACCOUNT_REVENUE =|자동 분개:' `
  services/accounting-service/src/main/java

rg -n '110|201/210|Q10' `
  docs/dev-reports/2026-08-08-1144-implementation-plan.md
```

### 출력 원문

```text
services/accounting-service/src/main/java\com\samhanair\logis\accounting\service\SalesAggregateService.java:50:    public static final String ACCOUNT_RECEIVABLES = "110";
services/accounting-service/src/main/java\com\samhanair\logis\accounting\service\SalesAggregateService.java:52:    public static final String ACCOUNT_REVENUE = "401";
services/accounting-service/src/main/java\com\samhanair\logis\accounting\service\TaxInvoiceService.java:70:    public static final String ACCOUNT_RECEIVABLES = "110";
services/accounting-service/src/main/java\com\samhanair\logis\accounting\service\TaxInvoiceService.java:72:    public static final String ACCOUNT_VAT_PAYABLE = "255";
services/accounting-service/src/main/java\com\samhanair\logis\accounting\service\TaxInvoiceService.java:74:    public static final String ACCOUNT_REVENUE = "401";
services/accounting-service/src/main/java\com\samhanair\logis\accounting\service\TaxInvoiceService.java:226:     * <p>자동 분개: (차) 110 / (대) 255+401. partnerId 라인 전파.

37:4. **P0-D 분개 인과 정렬(규칙 6·8)**: POSTED 매출전표가 채권 잔액을 바꾸지 않고 세금계산서 발행이 110 분개를 만드는 현행은 명세와 인과가 반대다. 다만 이 단계는 가장 위험하므로 Q4·Q10 및 기준선 측정 뒤에만 실행한다.
244:- M2: 매출·매입 회계전표 라인의 계정코드와 VAT 계정 매핑. 매출은 110 차변의 상대 계정, 매입은 201/210 대변의 상대 계정을 어떤 필드가 제공하는지 측정한다.
254:1. 매출전표 POST 전후 110 잔액 델타 0인 현행을 RED 테스트로 고정한다.
255:2. 매입전표 POST 전후 201/210 잔액 계약을 RED 테스트로 만든다.
263:- 매출 POST 1회: 110 채권이 총금액만큼 정확히 증가하고 대차 합계가 0.
264:- 매입 POST 1회: 결정된 201/210 채무가 총금액만큼 정확히 증가하고 대차 합계가 0.
659:| **Q10** | 매출전표 POST 분개와 매입전표 POST 분개의 정확한 상대 계정 및 VAT 계정은 무엇입니까? 세금계산서 발행 시 현행 110 분개는 제거하는 것이 맞습니까? | S1-B |
```

판정: 집PC의 계정 마스터에는 3자리와 4자리가 함께 있으나 실제 분개와 현금입금 참조는 전부 3자리다. #1144 계획도 `110`, `201/210`을 직접 전제로 하고, 현재 관련 쓰기 코드는 `110/255/401`을 사용한다. 2026-08-13 결정의 4자리 정본(`1089/2519/2559/4019`)과 일치하지 않는다. 이는 구현 방안이 아니라 현재 데이터·코드 전제의 불일치 발견이다.

## 7. QA 잔재와 실 데이터 분리

### 전표 잔재

오늘 전달받은 식별자를 그대로 사용했다.

| 유형 | 전표번호 | 현재 상태 | 거래처 | 활성 라인 | 연결 현황 | 분류 근거 |
|---|---|---|---|---:|---|---|
| OUTBOUND | `2026/08/13-1` | DRAFT | `P-2026-0017 원주에어컨공업` | 1 | 없음 | 사용자 제공 QA 식별자 일치 |
| OUTBOUND | `2026/08/13-2` | DRAFT | `P-2026-0017 원주에어컨공업` | 1 | 없음 | 사용자 제공 QA 식별자 일치 |
| OUTBOUND | `2026/08/13-3` | CONFIRMED | `P-2026-0017 원주에어컨공업` | 1 | 매출 DRAFT 1건/allocation 1건 | 사용자 제공 QA 식별자 일치 |
| INBOUND | `2026/08/13-1` | CONFIRMED | `P-2026-0017 원주에어컨공업` | 1 | 매입 DRAFT 1건/allocation 1건 | 사용자 제공 QA 식별자 일치 |

상태가 안내의 “전부 DRAFT”와 달라졌으므로 상태를 QA 판정 근거로 사용하지 않았다.

### QA 창고 4건

오늘 생성된 `WH-*` 코드와 2026-08-13 생성일을 사용해 분리했다. 다른 날짜의 QA 명칭 창고는 오늘 경고한 4건에 포함하지 않았다.

```sql
BEGIN TRANSACTION READ ONLY;
SELECT code,name,type,address,created_at,is_deleted,
       CASE WHEN code LIKE 'WH-%' AND created_at::date=DATE '2026-08-13'
            THEN 'KNOWN_QA' ELSE 'NON_QA' END AS qa_class
FROM warehouses
WHERE code LIKE 'WH-%' AND created_at::date=DATE '2026-08-13'
ORDER BY qa_class,created_at DESC,code;

SELECT COUNT(*) FILTER (WHERE is_deleted=false) AS active_total,
       COUNT(*) FILTER (
         WHERE is_deleted=false AND code LIKE 'WH-%'
           AND created_at::date=DATE '2026-08-13'
       ) AS known_qa,
       COUNT(*) FILTER (
         WHERE is_deleted=false
           AND NOT(code LIKE 'WH-%' AND created_at::date=DATE '2026-08-13')
       ) AS active_excluding_known_qa
FROM warehouses;
ROLLBACK;
```

```text
      code      |          name          |     type     |          address           |         created_at         | is_deleted | qa_class
----------------+------------------------+--------------+----------------------------+----------------------------+------------+---------
 WH-Q4YVWF      | QA1189-RC-1935-창고-후 | HEADQUARTERS | QA1189-RC-1935 공유DB 레인 | 2026-08-13 19:46:15.911626 | f          | KNOWN_QA
 WH-D9957V      | QA1189-RC-1935-창고-후 | HEADQUARTERS | QA1189-RC-1935 공유DB 레인 | 2026-08-13 19:45:44.152219 | f          | KNOWN_QA
 WH-F8D5PU      | QA1189-RC-1935-창고-후 | HEADQUARTERS | QA1189-RC-1935 공유DB 레인 | 2026-08-13 19:44:33.838918 | f          | KNOWN_QA
 WH-HCP5WG      | QA1189-RC-1935-창고-후 | HEADQUARTERS | QA1189-RC-1935 공유DB 레인 | 2026-08-13 19:43:31.933212 | f          | KNOWN_QA

 active_total | known_qa | active_excluding_known_qa
--------------+----------+--------------------------
           12 |        4 |                         8
(1 row)
```

창고 4건은 #1144 후보 전표·회계전표·allocation 건수에는 포함하지 않았다.

## 8. 회사PC 정찰과 어긋나는 지점

회사PC 값은 사용자가 제공한 수치와 선행 정찰 문서의 회사PC 측정값이다. 집PC 값은 이 문서의 쿼리 출력만 사용했다.

| 항목 | 회사PC | 집PC 원시 | 집PC QA 제외 | 차이 |
|---|---:|---:|---:|---|
| `chart_of_accounts` | 354 | 353 | 해당 없음 | 집PC가 1행 적음 |
| `journal_lines` | 7,275 | 309 | 해당 없음 | 집PC가 6,966행 적음 |
| `255` 사용 | 0 | 7 | 해당 없음 | 집PC에만 7행 |
| 활성 원천 INBOUND | 42 | 43 | 42 | QA 1건을 빼면 같음 |
| 활성 원천 OUTBOUND | 146 | 149 | 146 | QA 3건을 빼면 같음 |
| CONFIRMED OUTBOUND | 2 | 3 | 2 | QA `2026/08/13-3` 1건 |
| CONFIRMED INBOUND | 1 | 2 | 1 | QA `2026/08/13-1` 1건 |
| 생성 가능 매출 | 2건/5라인 | 3건/6라인 | 2건/5라인 | QA 제외 시 같음 |
| 생성 가능 매입 | 0건 | 1건/1라인 | 0건 | QA 제외 시 같음 |
| 활성 매출 회계전표 | 0 | 1 | 0 | QA 매출 DRAFT 1건 |
| 활성 매입 회계전표 | 0 | 1 | 0 | QA 매입 DRAFT 1건 |
| 활성 매출 allocation | 1 | 2 | 1 | QA 매출 allocation 1건 |
| 활성 매입 allocation | 0 | 1 | 0 | QA 매입 allocation 1건 |
| 삭제 원천 아래 활성 allocation | 1 | 1 | 1 | 같음 |
| CONFIRMED INBOUND UUID-only | 1 | 1 | 1 | 같음 |

## 9. 판정 불가로 남긴 것

1. 비-QA 매입 생성 가능 표본이 0건이므로 실 업무 매입 회계전표 생성 결과는 데이터로 판정할 수 없다.
2. 현재 활성 allocation 3건의 양쪽 다중도가 모두 1이라 N:M 스키마의 실제 N>1 사용은 판정할 수 없다.
3. `bank_accounts`와 `card_master` 활성 표본이 0건이라 해당 계정코드의 공백률·자리수 분포는 판정할 수 없다.
4. 6개 accounting staging `partner_code` 테이블과 `tax_invoice_batch_exclusions`, `blocked_partners`, `partner_tutorial_state`는 표본 0이라 공백률을 계산하지 않았다.
5. `flyway_schema_history`에는 V101 기록이 없는데 `chart_of_accounts`에는 4자리 275개가 있다. SELECT 정찰만으로 그 275행의 투입 경로는 판정할 수 없다.
6. `partner_order_front_event_log.partner_code` 383행 공백이 업무 조인 실패를 일으키는지는 이 데이터 집계만으로 판정하지 않았다. UUID 쌍이 없는 이벤트 로그 컬럼이라는 물리 사실만 확인했다.

## 10. 개발책임자 판단이 필요한 질문

1. `tax_invoices`의 UUID-only 활성 13건을 #1144 선행 정합성 판단 범위에 포함할지, 기존 별도 자료로 분리할지 판단이 필요하다.
2. 삭제된 원천·회계 헤더·회계 라인 아래 홀로 활성인 매출 allocation 1건을 #1144 기준선에서 유효 연결로 볼지 고아 자료로 볼지 판단이 필요하다.
3. 오늘 QA 원천에서 생성된 활성 매출·매입 DRAFT 각 1건과 allocation 각 1건을 이후 #1144 측정에서도 계속 QA 잔재로 제외할지 판단이 필요하다.
4. 4자리 계정 마스터 275행이 있으나 실제 참조가 전부 3자리이고 V101 적용 기록이 없는 현재 집PC 상태를 #1144의 유효 선행 기준선으로 볼지 판단이 필요하다.

## 11. 정찰 종료 상태

- 최초 여유 RAM: 22.425GB
- 보고서 작성 직전 여유 RAM: 20.268GB
- 1.0GB 중단선 미도달
- DB 쓰기 0건
- 코드 수정 0건
- Git 쓰기 0건
- 생성 파일: 본 정찰 보고서 1개
