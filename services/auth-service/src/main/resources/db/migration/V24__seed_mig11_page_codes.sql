-- V24__seed_mig11_page_codes.sql
-- MIG-11 매출장/매입장 XLSX import 화면 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'ecount.mig11.sales-ledger',    TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig11.purchase-ledger', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig11.sales-ledger',    TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig11.purchase-ledger', TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
