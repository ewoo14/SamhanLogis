-- V30__add_order_employee_link_aging_net.sql
-- MIG-10 Order Employee cross-link + partner_aging_snapshot net 컬럼 보정.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS manager_employee_id UUID;

COMMENT ON COLUMN orders.manager_employee_id IS
    'MIG-10 manager Employee UUID logical reference. service boundary: employees 는 user_db 의 도메인, accounting_db 에서 FK 강제 불가. application-level (EmployeeLookupClient) 검증으로 참조 무결성 보장.';

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
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_aging_snapshot_partner_id
    ON partner_aging_snapshot (partner_id);
