-- V29__add_cash_journal_aging_snapshot.sql
-- MIG-9 Cash -> Journal 멱등 키 + partner aging snapshot materialized view.

ALTER TABLE journals
    ALTER COLUMN journal_no TYPE VARCHAR(40);

ALTER TABLE journals
    ADD COLUMN IF NOT EXISTS source_ref VARCHAR(100);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'journals_source_type_ref_uk'
           AND conrelid = 'journals'::regclass
    ) THEN
        ALTER TABLE journals
            ADD CONSTRAINT journals_source_type_ref_uk UNIQUE (source_type, source_ref);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ix_journals_source_ref_active
    ON journals (source_type, source_ref, is_deleted);

DROP MATERIALIZED VIEW IF EXISTS partner_aging_snapshot;

DO $$
BEGIN
    IF to_regclass('public.partners') IS NOT NULL THEN
        EXECUTE $view$
            CREATE MATERIALIZED VIEW partner_aging_snapshot AS
            SELECT
                p.id AS partner_id,
                p.name AS partner_name,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND jl.debit_amount > 0 AND jl.account_code = '110' THEN jl.debit_amount
                    ELSE 0 END), 0) AS total_receivable,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND jl.credit_amount > 0 AND jl.account_code = '201' THEN jl.credit_amount
                    ELSE 0 END), 0) AS total_payable,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND jl.debit_amount > 0 AND jl.account_code IN ('101', '102') THEN jl.debit_amount
                    ELSE 0 END), 0) AS total_receipt,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND jl.credit_amount > 0 AND jl.account_code IN ('101', '102') THEN jl.credit_amount
                    ELSE 0 END), 0) AS total_disbursement,
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
                    WHEN jl.debit_amount > 0 AND jl.account_code = '110' THEN jl.debit_amount
                    ELSE 0 END), 0) AS total_receivable,
                COALESCE(SUM(CASE
                    WHEN jl.credit_amount > 0 AND jl.account_code = '201' THEN jl.credit_amount
                    ELSE 0 END), 0) AS total_payable,
                COALESCE(SUM(CASE
                    WHEN jl.debit_amount > 0 AND jl.account_code IN ('101', '102') THEN jl.debit_amount
                    ELSE 0 END), 0) AS total_receipt,
                COALESCE(SUM(CASE
                    WHEN jl.credit_amount > 0 AND jl.account_code IN ('101', '102') THEN jl.credit_amount
                    ELSE 0 END), 0) AS total_disbursement,
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
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_aging_snapshot_partner_id
    ON partner_aging_snapshot (partner_id);
