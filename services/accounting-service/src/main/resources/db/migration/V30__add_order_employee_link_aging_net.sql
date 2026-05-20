-- V30__add_order_employee_link_aging_net.sql
-- MIG-10 Order Employee cross-link + partner_aging_snapshot net 컬럼 보정.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS manager_employee_id UUID;

DO $$
BEGIN
    IF to_regclass('public.employees') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM pg_constraint
            WHERE conname = 'orders_manager_employee_fk'
              AND conrelid = 'orders'::regclass
       ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_manager_employee_fk
            FOREIGN KEY (manager_employee_id) REFERENCES employees(id);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_orders_manager_employee_id
    ON orders (manager_employee_id)
    WHERE is_deleted = FALSE;

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
                    WHEN j.id IS NOT NULL AND jl.debit_amount > 0 AND coa.name = '외상매출금'
                    THEN jl.debit_amount ELSE 0 END), 0) AS total_receivable,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND jl.credit_amount > 0 AND coa.name = '외상매입금'
                    THEN jl.credit_amount ELSE 0 END), 0) AS total_payable,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND jl.debit_amount > 0 AND coa.name IN ('보통예금', '현금')
                    THEN jl.debit_amount ELSE 0 END), 0) AS total_receipt,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND jl.credit_amount > 0 AND coa.name IN ('보통예금', '현금')
                    THEN jl.credit_amount ELSE 0 END), 0) AS total_disbursement,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND coa.name = '외상매출금'
                    THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
                    ELSE 0 END), 0) AS net_receivable,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND coa.name = '외상매입금'
                    THEN COALESCE(jl.credit_amount, 0) - COALESCE(jl.debit_amount, 0)
                    ELSE 0 END), 0) AS net_payable,
                COALESCE(SUM(CASE
                    WHEN j.id IS NOT NULL AND coa.name IN ('보통예금', '현금')
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
            LEFT JOIN chart_of_accounts coa
              ON coa.code = jl.account_code
             AND coa.is_deleted = FALSE
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
                    WHEN jl.debit_amount > 0 AND coa.name = '외상매출금'
                    THEN jl.debit_amount ELSE 0 END), 0) AS total_receivable,
                COALESCE(SUM(CASE
                    WHEN jl.credit_amount > 0 AND coa.name = '외상매입금'
                    THEN jl.credit_amount ELSE 0 END), 0) AS total_payable,
                COALESCE(SUM(CASE
                    WHEN jl.debit_amount > 0 AND coa.name IN ('보통예금', '현금')
                    THEN jl.debit_amount ELSE 0 END), 0) AS total_receipt,
                COALESCE(SUM(CASE
                    WHEN jl.credit_amount > 0 AND coa.name IN ('보통예금', '현금')
                    THEN jl.credit_amount ELSE 0 END), 0) AS total_disbursement,
                COALESCE(SUM(CASE
                    WHEN coa.name = '외상매출금'
                    THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
                    ELSE 0 END), 0) AS net_receivable,
                COALESCE(SUM(CASE
                    WHEN coa.name = '외상매입금'
                    THEN COALESCE(jl.credit_amount, 0) - COALESCE(jl.debit_amount, 0)
                    ELSE 0 END), 0) AS net_payable,
                COALESCE(SUM(CASE
                    WHEN coa.name IN ('보통예금', '현금')
                    THEN COALESCE(jl.debit_amount, 0) - COALESCE(jl.credit_amount, 0)
                    ELSE 0 END), 0) AS net_cash,
                NOW() AS last_refreshed_at
            FROM journal_lines jl
            JOIN journals j
              ON j.id = jl.journal_id
             AND j.is_deleted = FALSE
             AND j.status = 'POSTED'
            LEFT JOIN chart_of_accounts coa
              ON coa.code = jl.account_code
             AND coa.is_deleted = FALSE
            WHERE jl.is_deleted = FALSE
              AND jl.partner_id IS NOT NULL
            GROUP BY jl.partner_id
        $view$;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_aging_snapshot_partner_id
    ON partner_aging_snapshot (partner_id);
