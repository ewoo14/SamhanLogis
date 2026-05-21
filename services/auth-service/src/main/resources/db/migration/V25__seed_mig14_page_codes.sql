-- V25__seed_mig14_page_codes.sql
-- MIG-14 admin UI 4 화면 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'ecount.mig14.cash-list',      TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig14.order-list',     TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig14.aging-snapshot', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig14.ledger',         TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig14.cash-list',      TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig14.order-list',     TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig14.aging-snapshot', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig14.ledger',         TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'ecount.mig14.cash-list',      TRUE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'ecount.mig14.order-list',     TRUE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'ecount.mig14.aging-snapshot', TRUE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'ecount.mig14.ledger',         TRUE, FALSE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
