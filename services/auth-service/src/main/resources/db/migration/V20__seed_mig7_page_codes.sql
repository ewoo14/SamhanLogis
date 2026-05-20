-- V20__seed_mig7_page_codes.sql
-- MIG-7 Cash 도메인 staging transform 화면 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'ecount.mig7.cash-disbursement', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig7.cash-receipt',      TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig7.cash-disbursement', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig7.cash-receipt',      TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
