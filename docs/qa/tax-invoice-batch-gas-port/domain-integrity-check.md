# 세금계산서 일괄발행 GAS 이식 — 도메인 정합성 SQL 검증

> 슬라이스: `tax-invoice-batch-gas-port`
> 작성일: 2026-05-11
> 담당: QA agent
> DB: `accounting_db` (PostgreSQL 16)

---

## 검증 항목 목록 (4건)

| # | 항목 | 테이블 |
|---|---|---|
| 1 | tax_invoice_batches row count + 평균 splitFileCount | tax_invoice_batches |
| 2 | tax_invoice_batch_exclusions unique(partner_code) 위반 0건 | tax_invoice_batch_exclusions |
| 3 | 저장 이력 처리일자 월별 분포 | tax_invoice_batches |
| 4 | BE preview 응답 row 수 vs DB 실제 매출 전표 수 매칭 | tax_invoice_batches + tax_invoices |

---

## 검증 1: tax_invoice_batches row count + 평균 splitFileCount

배치 저장 건수와 파일 분할 평균값을 확인하여 데이터 적재 이상을 탐지.

```sql
-- tax_invoice_batches 전체 현황
SELECT
    COUNT(*)                                          AS total_batch_count,
    COUNT(*) FILTER (WHERE status = 'COMPLETED')      AS completed_count,
    COUNT(*) FILTER (WHERE status = 'DOWNLOADED')     AS downloaded_count,
    COUNT(*) FILTER (WHERE status = 'DRAFT')          AS draft_count,
    ROUND(AVG(split_file_count), 2)                   AS avg_split_file_count,
    MIN(split_file_count)                             AS min_split_file_count,
    MAX(split_file_count)                             AS max_split_file_count,
    SUM(total_row_count)                              AS total_row_sum
FROM tax_invoice_batches
WHERE is_deleted = false;
```

**기대 결과**:
- `total_batch_count >= 0` (신규 배포 직후 0 허용)
- `avg_split_file_count = CEIL(avg_total_row_count / 100)` 와 근사
- `draft_count = 0` (preview 완료 후 COMPLETED 전이 확인 — DRAFT 잔존 시 비정상)

---

## 검증 2: tax_invoice_batch_exclusions unique(partner_code) 위반 0건

active row(is_deleted=false) 기준 partnerCode 중복 등록 0건을 확인.

```sql
-- active 제외 거래처 코드 중복 탐지
SELECT
    partner_code,
    COUNT(*) AS duplicate_count
FROM tax_invoice_batch_exclusions
WHERE is_deleted = false
GROUP BY partner_code
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 기대: 0 rows returned (중복 없음)
```

```sql
-- partial unique index 정의 확인 (스키마 검증)
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'tax_invoice_batch_exclusions'
  AND indexdef ILIKE '%is_deleted%';

-- 기대: partner_code WHERE is_deleted = false unique index 존재
```

**기대 결과**:
- 첫 번째 쿼리: 0 rows (중복 없음)
- 두 번째 쿼리: partial unique index 확인

---

## 검증 3: 저장 이력 처리일자 월별 분포

처리일자(processed_at) 기준 월별 집계로 배치 작업 빈도 분포를 확인.

```sql
-- 월별 배치 처리 건수 + 합계 row 수
SELECT
    TO_CHAR(processed_at, 'YYYY-MM')    AS process_month,
    COUNT(*)                             AS batch_count,
    SUM(total_row_count)                 AS total_rows,
    ROUND(AVG(total_row_count), 1)       AS avg_rows_per_batch,
    MAX(split_file_count)                AS max_split_files
FROM tax_invoice_batches
WHERE is_deleted = false
  AND processed_at IS NOT NULL
GROUP BY TO_CHAR(processed_at, 'YYYY-MM')
ORDER BY process_month DESC
LIMIT 12;
```

**기대 결과**:
- 월별 배치 건수가 존재하는 경우 연속성 확인 (중간 월 누락 없음)
- `avg_rows_per_batch`가 비즈니스 규모에 적합한 범위 (1 ~ 5,000)

```sql
-- 처리일자 NULL 배치 탐지 (DRAFT 상태 제외)
SELECT COUNT(*) AS null_processed_at_count
FROM tax_invoice_batches
WHERE is_deleted = false
  AND status IN ('COMPLETED', 'DOWNLOADED')
  AND processed_at IS NULL;

-- 기대: 0 (COMPLETED/DOWNLOADED 는 반드시 processed_at 존재)
```

---

## 검증 4: BE preview 응답 row 수 vs DB 실제 매출 전표 수 매칭

preview totalRowCount와 DB의 실제 ISSUED 세금계산서 라인 수(=홈택스 행 수)가 일치하는지 검증.

```sql
-- 특정 배치의 총 row 수와 DB 기준 ISSUED 세금계산서 라인 수 비교
-- :batch_no = 검증할 배치번호 (예: 'TIB-202605-001')
WITH batch_meta AS (
    SELECT
        id                AS batch_id,
        batch_no,
        total_row_count   AS batch_total_rows,
        source_from_date  AS from_date,
        source_to_date    AS to_date,
        excluded_partner_codes
    FROM tax_invoice_batches
    WHERE batch_no = :batch_no
      AND is_deleted = false
),
db_line_count AS (
    SELECT
        COUNT(CASE WHEN til.id IS NOT NULL THEN 1 END)  AS line_row_count,
        COUNT(CASE WHEN til.id IS NULL     THEN 1 END)  AS header_only_count
    FROM tax_invoices ti
    LEFT JOIN tax_invoice_lines til ON til.tax_invoice_id = ti.id AND til.is_deleted = false
    WHERE ti.status = 'ISSUED'
      AND ti.supply_date BETWEEN (SELECT from_date FROM batch_meta)
                              AND (SELECT to_date   FROM batch_meta)
      AND ti.is_deleted = false
      -- 제외 거래처 필터 (partner_code 컬럼이 tax_invoices 에 존재하는 경우)
      -- AND ti.partner_code NOT IN (
      --     SELECT TRIM(unnest(string_to_array(excluded_partner_codes, ',')))
      --     FROM batch_meta
      --     WHERE excluded_partner_codes IS NOT NULL
      -- )
)
SELECT
    bm.batch_no,
    bm.batch_total_rows                                 AS preview_row_count,
    (dlc.line_row_count + dlc.header_only_count)        AS db_row_count,
    dlc.line_row_count,
    dlc.header_only_count,
    bm.batch_total_rows
        - (dlc.line_row_count + dlc.header_only_count)  AS row_diff
FROM batch_meta bm
CROSS JOIN db_line_count dlc;
```

**기대 결과**:
- `row_diff = 0` (preview 결과와 DB 실제 데이터 완전 일치)
- 불일치 시 원인 조사: 제외 거래처 필터 미적용, DRAFT 포함, 날짜 경계 오차

```sql
-- 전체 배치 totalRowCount vs 음수/0 이상 이상치 탐지
SELECT
    batch_no,
    total_row_count,
    split_file_count,
    status,
    processed_at
FROM tax_invoice_batches
WHERE is_deleted = false
  AND (
      total_row_count < 0
   OR split_file_count < 0
   OR (total_row_count = 0 AND status = 'COMPLETED')
  )
ORDER BY processed_at DESC;

-- 기대: 0 rows (totalRowCount 음수/분할 음수/완료 후 0건 이상치 없음)
```
