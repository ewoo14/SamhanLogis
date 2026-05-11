# 도메인 정합성 검증 SQL — supplier-profile-and-grid-ux

슬라이스: `supplier-profile-and-grid-ux`
작성일: 2026-05-11
QA 담당: QA agent (SupplierProfile + DataGrid UX)

---

## 검증 항목 목록

| # | 항목 | 대상 테이블 | 기대 결과 |
|---|------|------------|-----------|
| DI-1 | primary 사업자 단일성 | supplier_profiles | `is_primary=true AND deleted_flag=false` row count = 1 |
| DI-2 | 사업자등록번호 10자리 형식 | supplier_profiles | 모든 활성 레코드의 business_number 가 숫자 10자리 |
| DI-3 | TaxInvoiceBatch 공급자 정합성 | tax_invoice_batches | dataSnapshotJson 내 공급자 사업자번호 ↔ 현재 primary supplier |
| DI-4 | soft delete 일관성 | supplier_profiles | deleted_flag=true 레코드는 is_primary=false 이어야 함 |
| DI-5 | DataGrid 클립보드 TSV — Journal 복식부기 invariant | accounting_journal_lines | sum(debit) = sum(credit) per journal_id |

총 검증 항목: **5건**

---

## DI-1: primary 사업자 단일성

활성 레코드 중 `is_primary=true` 인 행이 정확히 1개이어야 한다.
동시에 2개 이상의 primary 사업자가 존재하면 세금계산서 일괄발행 시 공급자 정보 충돌 발생.

```sql
-- accounting_db (accounting-service)
SELECT COUNT(*) AS primary_count
FROM supplier_profiles
WHERE is_primary = true
  AND deleted_flag = false;

-- 기대값: primary_count = 1
-- 실패 조건: 0 (primary 없음) 또는 2 이상 (중복 primary)

-- 추가 검증: primary 변경 트랜잭션 후에도 단일성 유지
SELECT sp.id, sp.company_name, sp.is_primary, sp.updated_at
FROM supplier_profiles sp
WHERE sp.deleted_flag = false
ORDER BY sp.is_primary DESC, sp.updated_at DESC;
```

---

## DI-2: 사업자등록번호 10자리 유효 형식

모든 활성 사업자 레코드의 `business_number` 는 숫자 10자리 (하이픈 제거 기준) 이어야 한다.
한국 사업자등록번호 형식: `XXX-XX-XXXXX` (10자리 숫자).

```sql
-- accounting_db
SELECT id,
       company_name,
       business_number,
       LENGTH(REGEXP_REPLACE(business_number, '[^0-9]', '', 'g')) AS digit_count
FROM supplier_profiles
WHERE deleted_flag = false
  AND (
      LENGTH(REGEXP_REPLACE(business_number, '[^0-9]', '', 'g')) != 10
      OR business_number IS NULL
      OR business_number = ''
  );

-- 기대값: 0 rows (모든 활성 사업자의 사업자등록번호가 유효)
-- 실패 조건: 1 rows 이상 → 해당 레코드 데이터 정정 필요

-- seed 데이터 확인: 2148720659 (삼한공조시스템, 10자리)
SELECT business_number,
       CASE
           WHEN LENGTH(REGEXP_REPLACE(business_number, '[^0-9]', '', 'g')) = 10
           THEN 'VALID'
           ELSE 'INVALID'
       END AS format_check
FROM supplier_profiles
WHERE deleted_flag = false;
```

---

## DI-3: TaxInvoiceBatch 공급자 정보 정합성

세금계산서 일괄발행 배치의 `data_snapshot_json` 내 공급자 사업자번호가
현재 primary supplier 의 `business_number` 와 일치해야 한다.
primary supplier 가 변경된 이후 생성된 배치부터 새로운 공급자 정보가 반영되어야 함.

```sql
-- accounting_db
-- Step 1: 현재 primary supplier 확보
WITH primary_supplier AS (
    SELECT business_number AS primary_biz_num,
           company_name    AS primary_company
    FROM supplier_profiles
    WHERE is_primary = true
      AND deleted_flag = false
    LIMIT 1
),
-- Step 2: 최근 10건 배치의 snapshot 내 공급자 사업자번호 추출
recent_batches AS (
    SELECT id,
           batch_no,
           created_at,
           data_snapshot_json::jsonb -> 'supplierBizNum' AS snapshot_biz_num_raw
    FROM tax_invoice_batches
    ORDER BY created_at DESC
    LIMIT 10
)
-- Step 3: 비교
SELECT rb.id,
       rb.batch_no,
       rb.created_at,
       rb.snapshot_biz_num_raw::text AS snapshot_biz_num,
       ps.primary_biz_num,
       CASE
           WHEN rb.snapshot_biz_num_raw::text = '"' || ps.primary_biz_num || '"'
           THEN 'MATCH'
           ELSE 'MISMATCH'
       END AS integrity_check
FROM recent_batches rb
CROSS JOIN primary_supplier ps
ORDER BY rb.created_at DESC;

-- 기대값: integrity_check = 'MATCH' (primary supplier 변경 이후 생성 배치 기준)
-- 허용 예외: primary 변경 이전 배치는 이전 사업자번호가 snapshot 에 보존 (히스토리 유지 정상)
```

---

## DI-4: soft delete 일관성

`deleted_flag=true` 인 레코드는 `is_primary=false` 이어야 한다.
삭제된 사업자가 primary 로 남아있으면 TaxInvoiceBatch 조회 시 오류 발생.

```sql
-- accounting_db
SELECT COUNT(*) AS invalid_deleted_primary_count
FROM supplier_profiles
WHERE deleted_flag = true
  AND is_primary = true;

-- 기대값: invalid_deleted_primary_count = 0
-- 실패 조건: 1 이상 → soft delete 로직 결함

-- 전체 현황 확인
SELECT
    SUM(CASE WHEN deleted_flag = false AND is_primary = true  THEN 1 ELSE 0 END) AS active_primary,
    SUM(CASE WHEN deleted_flag = false AND is_primary = false THEN 1 ELSE 0 END) AS active_non_primary,
    SUM(CASE WHEN deleted_flag = true  AND is_primary = false THEN 1 ELSE 0 END) AS deleted_non_primary,
    SUM(CASE WHEN deleted_flag = true  AND is_primary = true  THEN 1 ELSE 0 END) AS deleted_primary_INVALID
FROM supplier_profiles;
```

---

## DI-5: Journal 복식부기 invariant (DataGrid 회귀 가드)

DataGrid 의 셀 복사(Ctrl+C) 기능으로 내보낸 데이터가 원장 데이터와 일치하는지
간접 검증하기 위해 journal 복식부기 불변식을 확인한다.
각 journal 내 차변 합계 = 대변 합계 이어야 한다.

```sql
-- accounting_db
SELECT j.id        AS journal_id,
       j.journal_no,
       j.status,
       SUM(jl.debit_amount)  AS total_debit,
       SUM(jl.credit_amount) AS total_credit,
       SUM(jl.debit_amount) - SUM(jl.credit_amount) AS balance_diff
FROM accounting_journals j
JOIN accounting_journal_lines jl ON jl.journal_id = j.id
WHERE j.deleted_flag = false
  AND j.status IN ('POSTED', 'REVERSED')
GROUP BY j.id, j.journal_no, j.status
HAVING ABS(SUM(jl.debit_amount) - SUM(jl.credit_amount)) > 0.01;

-- 기대값: 0 rows (모든 전기 완료 journal 의 차변 합계 = 대변 합계)
-- 허용 오차: 0.01 (부동소수점 오차)
-- 실패 조건: 1 rows 이상 → 복식부기 invariant 위반 (서비스 결함)

-- 전체 요약
SELECT
    COUNT(*)                          AS total_posted_journals,
    SUM(CASE WHEN ABS(SUM(jl.debit_amount) - SUM(jl.credit_amount)) <= 0.01
             THEN 1 ELSE 0 END)       AS balanced_journals,
    SUM(CASE WHEN ABS(SUM(jl.debit_amount) - SUM(jl.credit_amount)) > 0.01
             THEN 1 ELSE 0 END)       AS unbalanced_journals
FROM accounting_journals j
JOIN accounting_journal_lines jl ON jl.journal_id = j.id
WHERE j.deleted_flag = false
  AND j.status = 'POSTED'
GROUP BY j.id;
```

---

## 실행 방법

```bash
# accounting_db 직접 접근 (로컬 환경)
psql -h localhost -p 5432 -U samhan -d accounting_db

# Docker 컨테이너 내부에서 실행
docker exec -it accounting-postgres psql -U samhan -d accounting_db

# 또는 Testcontainers IT 실행 시 자동 검증 (SupplierProfileFEMatchIT)
cd services/accounting-service
./gradlew test --tests "*.SupplierProfileFEMatchIT" -i
```

---

## 실행 결과 기록

| 항목 | 실행 일시 | 결과 | 비고 |
|------|----------|------|------|
| DI-1 | — | 미실행 (BE agent 완료 후 실행) | supplier_profiles 테이블 생성 전 |
| DI-2 | — | 미실행 | 동일 |
| DI-3 | — | 미실행 | tax_invoice_batches 테이블 생성 전 |
| DI-4 | — | 미실행 | 동일 |
| DI-5 | — | 미실행 | accounting_journals 시드 후 실행 |
