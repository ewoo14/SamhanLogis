-- V37__seed_sp_d6_7_accounting_page_codes.sql
-- SP-D6-7 accounting-service @RequirePermission migration 신규 PageCode seed.
-- 11-role matrix 를 완성하고 기존 MIG-7/MIG-11/accounting.edit-requests 누락 row 를 보강한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

WITH roles(role_code) AS (
    VALUES
        ('MASTER'),
        ('MANAGER'),
        ('ACCOUNTANT'),
        ('SALES'),
        ('WAREHOUSE'),
        ('DISPATCH'),
        ('INVENTORY'),
        ('DEVELOPER'),
        ('PARTNER'),
        ('STAFF'),
        ('DRIVER')
),
pages(page_code) AS (
    VALUES
        ('accounting.edit-requests'),
        ('accounting.edit-requests.decide'),
        ('accounting.tax-invoice.cancel'),
        ('accounting.tax-invoice.issue-request'),
        ('accounting.tax-invoice.realtime'),
        ('accounting.tax-invoice.inbound.manage'),
        ('accounting.hometax-export'),
        ('accounting.daily-closing.run'),
        ('accounting.daily-closing.unlock'),
        ('accounting.period-close.reverse'),
        ('accounting.journals.realtime'),
        ('accounting.balances.trial-balance'),
        ('accounting.sales-slip.accounting'),
        ('accounting.purchase-slip.accounting'),
        ('accounting.supplier-profiles'),
        ('ecount.mig7.cash-disbursement'),
        ('ecount.mig7.cash-receipt'),
        ('ecount.mig11.sales-ledger'),
        ('ecount.mig11.purchase-ledger')
),
grants(page_code, role_code, can_view, can_edit) AS (
    VALUES
        -- 회계 수정 요청: ACCOUNTANT/MASTER 생성, MASTER/MANAGER 승인/거절 분리.
        ('accounting.edit-requests',        'MASTER',     TRUE, TRUE),
        ('accounting.edit-requests',        'MANAGER',    TRUE, FALSE),
        ('accounting.edit-requests',        'ACCOUNTANT', TRUE, TRUE),
        ('accounting.edit-requests.decide', 'MASTER',     TRUE, TRUE),
        ('accounting.edit-requests.decide', 'MANAGER',    TRUE, TRUE),

        -- 세금계산서 운영.
        ('accounting.tax-invoice.cancel',         'MASTER',     TRUE, TRUE),
        ('accounting.tax-invoice.cancel',         'MANAGER',    TRUE, TRUE),
        ('accounting.tax-invoice.cancel',         'ACCOUNTANT', TRUE, TRUE),
        ('accounting.tax-invoice.issue-request',  'MASTER',     TRUE, TRUE),
        ('accounting.tax-invoice.issue-request',  'MANAGER',    TRUE, TRUE),
        ('accounting.tax-invoice.issue-request',  'ACCOUNTANT', TRUE, TRUE),
        ('accounting.tax-invoice.realtime',       'MASTER',     TRUE, FALSE),
        ('accounting.tax-invoice.realtime',       'ACCOUNTANT', TRUE, FALSE),
        ('accounting.tax-invoice.inbound.manage', 'MASTER',     TRUE, TRUE),
        ('accounting.tax-invoice.inbound.manage', 'ACCOUNTANT', TRUE, TRUE),
        ('accounting.hometax-export',             'MASTER',     TRUE, TRUE),
        ('accounting.hometax-export',             'MANAGER',    TRUE, TRUE),
        ('accounting.hometax-export',             'ACCOUNTANT', TRUE, TRUE),

        -- 마감/시산/분개 realtime.
        ('accounting.daily-closing.run',       'MASTER',     TRUE, TRUE),
        ('accounting.daily-closing.run',       'MANAGER',    TRUE, TRUE),
        ('accounting.daily-closing.run',       'ACCOUNTANT', TRUE, TRUE),
        ('accounting.daily-closing.unlock',    'MASTER',     TRUE, TRUE),
        ('accounting.period-close.reverse',    'MASTER',     TRUE, TRUE),
        ('accounting.journals.realtime',       'MASTER',     TRUE, FALSE),
        ('accounting.journals.realtime',       'ACCOUNTANT', TRUE, FALSE),
        ('accounting.balances.trial-balance',  'MASTER',     TRUE, FALSE),
        ('accounting.balances.trial-balance',  'ACCOUNTANT', TRUE, FALSE),

        -- 회계 전표/거래처 원장 보조 도메인.
        ('accounting.sales-slip.accounting',    'MASTER',     TRUE, TRUE),
        ('accounting.sales-slip.accounting',    'ACCOUNTANT', TRUE, TRUE),
        ('accounting.purchase-slip.accounting', 'MASTER',     TRUE, TRUE),
        ('accounting.purchase-slip.accounting', 'ACCOUNTANT', TRUE, TRUE),
        ('accounting.supplier-profiles',        'MASTER',     TRUE, TRUE),
        ('accounting.supplier-profiles',        'MANAGER',    TRUE, TRUE),
        ('accounting.supplier-profiles',        'ACCOUNTANT', TRUE, FALSE),

        -- 기존 MIG-7/MIG-11 seed 는 MASTER/MANAGER TRUE 보존, 나머지 role FALSE.
        ('ecount.mig7.cash-disbursement', 'MASTER',  TRUE, TRUE),
        ('ecount.mig7.cash-disbursement', 'MANAGER', TRUE, TRUE),
        ('ecount.mig7.cash-receipt',      'MASTER',  TRUE, TRUE),
        ('ecount.mig7.cash-receipt',      'MANAGER', TRUE, TRUE),
        ('ecount.mig11.sales-ledger',     'MASTER',  TRUE, TRUE),
        ('ecount.mig11.sales-ledger',     'MANAGER', TRUE, TRUE),
        ('ecount.mig11.purchase-ledger',  'MASTER',  TRUE, TRUE),
        ('ecount.mig11.purchase-ledger',  'MANAGER', TRUE, TRUE)
)
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
SELECT
    gen_random_uuid(),
    r.role_code,
    p.page_code,
    COALESCE(g.can_view, FALSE),
    COALESCE(g.can_edit, FALSE),
    NOW(),
    'system',
    FALSE
FROM pages p
CROSS JOIN roles r
LEFT JOIN grants g
    ON g.page_code = p.page_code
   AND g.role_code = r.role_code
ON CONFLICT DO NOTHING;

-- V28 에서 MANAGER edit=true 로 들어간 기존 row 를 V37 권한 분리 계약에 맞춘다.
UPDATE role_page_permissions
SET can_edit = FALSE
WHERE role_code = 'MANAGER'
  AND page_code = 'accounting.edit-requests'
  AND is_deleted = FALSE;
