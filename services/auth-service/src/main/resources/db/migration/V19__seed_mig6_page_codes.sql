-- V19__seed_mig6_page_codes.sql
-- MIG-6 이카운트 잔여 마스터 5종 import 화면 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'ecount.mig6.bank-account',       TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig6.employee',           TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig6.employee-card',      TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig6.payroll-employee',   TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig6.fixed-asset-type',   TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig6.bank-account',       TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig6.employee',           TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig6.employee-card',      TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig6.payroll-employee',   TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig6.fixed-asset-type',   TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
