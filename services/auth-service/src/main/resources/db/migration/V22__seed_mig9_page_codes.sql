-- V22__seed_mig9_page_codes.sql
-- MIG-9 Cash -> Journal 자동 생성 화면 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'ecount.mig9.cash-journal.disbursement', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig9.cash-journal.disbursement', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig9.cash-journal.receipt', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig9.cash-journal.receipt', TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
