-- V34__ensure_aging_snapshot_and_ledger_staging_present.sql
-- MIG-14 admin 화면 graceful-empty 보강.
-- 증상: /accounting/aging-snapshot, /ledger/sales, /ledger/purchase 진입 시
--       partner_aging_snapshot / staging.ecount_sales_ledger_raw /
--       staging.ecount_purchase_ledger_raw 부재 → 500 "bad SQL grammar".
-- 목적: 세 객체가 항상 존재하도록 멱등 재선언. 데이터 부재 시 빈 결과 반환(MIG 임포트가 채움).
-- 주의: 이미 존재하면 보존(materialized view 는 미존재 시에만 생성). 새로운 컬럼/스키마 변경 없음.

----------------------------------------------------------------------
-- 1) staging 스키마 + 매출장/매입장 raw 테이블 멱등 보장
--    (V31 과 동일 정의. 로컬 DB 가 V31 이전 baseline 이거나 staging 미생성인 경우 보강)
----------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.ecount_sales_ledger_raw (
    source_file_hash   VARCHAR(64) NOT NULL,
    source_row_no      INT         NOT NULL,
    transaction_ref    VARCHAR(50),
    transaction_date   DATE,
    sequence_no        INT,
    transaction_type   TEXT,
    electronic_type    TEXT,
    partner_code       VARCHAR(50),
    partner_name       TEXT,
    description        TEXT,
    supply_amount      NUMERIC(15,2),
    vat_amount         NUMERIC(15,2),
    total_amount       NUMERIC(15,2),
    raw_payload        TEXT,
    transform_status   VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    reject_reason      TEXT,
    imported_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by        VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',

    -- BaseEntity 7 audit
    created_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by         VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    modified_at        TIMESTAMP,
    modified_by        VARCHAR(50),
    deleted_at         TIMESTAMP,
    deleted_by         VARCHAR(50),
    is_deleted         BOOLEAN     NOT NULL DEFAULT FALSE,

    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_sales_ledger_raw_date
    ON staging.ecount_sales_ledger_raw (transaction_date)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_ecount_sales_ledger_raw_partner
    ON staging.ecount_sales_ledger_raw (partner_name)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_ecount_sales_ledger_raw_partner_code
    ON staging.ecount_sales_ledger_raw (partner_code)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS staging.ecount_purchase_ledger_raw (
    source_file_hash   VARCHAR(64) NOT NULL,
    source_row_no      INT         NOT NULL,
    transaction_ref    VARCHAR(50),
    transaction_date   DATE,
    sequence_no        INT,
    transaction_type   TEXT,
    electronic_type    TEXT,
    partner_code       VARCHAR(50),
    partner_name       TEXT,
    description        TEXT,
    supply_amount      NUMERIC(15,2),
    vat_amount         NUMERIC(15,2),
    total_amount       NUMERIC(15,2),
    raw_payload        TEXT,
    transform_status   VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    reject_reason      TEXT,
    imported_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by        VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',

    -- BaseEntity 7 audit
    created_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by         VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    modified_at        TIMESTAMP,
    modified_by        VARCHAR(50),
    deleted_at         TIMESTAMP,
    deleted_by         VARCHAR(50),
    is_deleted         BOOLEAN     NOT NULL DEFAULT FALSE,

    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_purchase_ledger_raw_date
    ON staging.ecount_purchase_ledger_raw (transaction_date)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_ecount_purchase_ledger_raw_partner
    ON staging.ecount_purchase_ledger_raw (partner_name)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_ecount_purchase_ledger_raw_partner_code
    ON staging.ecount_purchase_ledger_raw (partner_code)
    WHERE is_deleted = FALSE;

----------------------------------------------------------------------
-- 2) partner_aging_snapshot MATERIALIZED VIEW 멱등 보장
--    이미 존재하면 보존(populated 데이터/refresh 상태 유지). 미존재 시에만 생성.
--    accounting_db 에는 partners 테이블이 없으므로(서비스 경계) journal_lines 기반
--    정의(V30 ELSE 분기)를 사용. net_* 컬럼 포함 — AccountingAdminQuery 가 select.
----------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.partner_aging_snapshot') IS NULL THEN
        IF to_regclass('public.partners') IS NOT NULL THEN
            EXECUTE $view$
                CREATE MATERIALIZED VIEW partner_aging_snapshot AS
                SELECT
                    p.id AS partner_id,
                    p.name AS partner_name,
                    COALESCE(SUM(CASE
                        WHEN j.id IS NOT NULL AND jl.debit_amount > 0 AND jl.account_code IN ('110')
                        THEN jl.debit_amount ELSE 0 END), 0) AS total_receivable,
                    COALESCE(SUM(CASE
                        WHEN j.id IS NOT NULL AND jl.credit_amount > 0 AND jl.account_code IN ('201')
                        THEN jl.credit_amount ELSE 0 END), 0) AS total_payable,
                    COALESCE(SUM(CASE
                        WHEN j.id IS NOT NULL AND jl.debit_amount > 0 AND jl.account_code IN ('101', '102')
                        THEN jl.debit_amount ELSE 0 END), 0) AS total_receipt,
                    COALESCE(SUM(CASE
                        WHEN j.id IS NOT NULL AND jl.credit_amount > 0 AND jl.account_code IN ('101', '102')
                        THEN jl.credit_amount ELSE 0 END), 0) AS total_disbursement,
                    COALESCE(SUM(CASE
                        WHEN j.id IS NOT NULL AND jl.account_code IN ('110')
                        THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
                        ELSE 0 END), 0) AS net_receivable,
                    COALESCE(SUM(CASE
                        WHEN j.id IS NOT NULL AND jl.account_code IN ('201')
                        THEN COALESCE(jl.credit_amount, 0) - COALESCE(jl.debit_amount, 0)
                        ELSE 0 END), 0) AS net_payable,
                    COALESCE(SUM(CASE
                        WHEN j.id IS NOT NULL AND jl.account_code IN ('101', '102')
                        THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
                        ELSE 0 END), 0) AS net_cash,
                    NOW() AS last_refreshed_at
                FROM partners p
                LEFT JOIN journal_lines jl
                  ON jl.partner_id = p.id
                 AND jl.is_deleted = FALSE
                LEFT JOIN journals j
                  ON j.id = jl.journal_id
                 AND j.is_deleted = FALSE
                 AND j.status = 'POSTED'
                WHERE p.is_deleted = FALSE
                GROUP BY p.id, p.name
            $view$;
        ELSE
            EXECUTE $view$
                CREATE MATERIALIZED VIEW partner_aging_snapshot AS
                SELECT
                    jl.partner_id AS partner_id,
                    NULL::VARCHAR(100) AS partner_name,
                    COALESCE(SUM(CASE
                        WHEN jl.debit_amount > 0 AND jl.account_code IN ('110')
                        THEN jl.debit_amount ELSE 0 END), 0) AS total_receivable,
                    COALESCE(SUM(CASE
                        WHEN jl.credit_amount > 0 AND jl.account_code IN ('201')
                        THEN jl.credit_amount ELSE 0 END), 0) AS total_payable,
                    COALESCE(SUM(CASE
                        WHEN jl.debit_amount > 0 AND jl.account_code IN ('101', '102')
                        THEN jl.debit_amount ELSE 0 END), 0) AS total_receipt,
                    COALESCE(SUM(CASE
                        WHEN jl.credit_amount > 0 AND jl.account_code IN ('101', '102')
                        THEN jl.credit_amount ELSE 0 END), 0) AS total_disbursement,
                    COALESCE(SUM(CASE
                        WHEN jl.account_code IN ('110')
                        THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
                        ELSE 0 END), 0) AS net_receivable,
                    COALESCE(SUM(CASE
                        WHEN jl.account_code IN ('201')
                        THEN COALESCE(jl.credit_amount, 0) - COALESCE(jl.debit_amount, 0)
                        ELSE 0 END), 0) AS net_payable,
                    COALESCE(SUM(CASE
                        WHEN jl.account_code IN ('101', '102')
                        THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
                        ELSE 0 END), 0) AS net_cash,
                    NOW() AS last_refreshed_at
                FROM journal_lines jl
                JOIN journals j
                  ON j.id = jl.journal_id
                 AND j.is_deleted = FALSE
                 AND j.status = 'POSTED'
                WHERE jl.is_deleted = FALSE
                  AND jl.partner_id IS NOT NULL
                GROUP BY jl.partner_id
            $view$;
        END IF;
    END IF;
END
$$;

-- REFRESH MATERIALIZED VIEW CONCURRENTLY 가 요구하는 UNIQUE 인덱스(멱등).
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_aging_snapshot_partner_id
    ON partner_aging_snapshot (partner_id);
