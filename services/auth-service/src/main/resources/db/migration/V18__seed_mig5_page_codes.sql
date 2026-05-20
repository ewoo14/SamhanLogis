-- V18__seed_mig5_page_codes.sql
-- MIG-5 이카운트 창고이동/지출결의서/입금보고서 import 화면 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',   'ecount.mig5.stock-transfer',  TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',   'ecount.mig5.expense-voucher', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',   'ecount.mig5.deposit-report',  TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig5.stock-transfer',  TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig5.expense-voucher', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig5.deposit-report',  TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig5.stock-transfer',  FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig5.expense-voucher', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig5.deposit-report',  FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig5.stock-transfer',  FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig5.expense-voucher', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig5.deposit-report',  FALSE, FALSE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;

