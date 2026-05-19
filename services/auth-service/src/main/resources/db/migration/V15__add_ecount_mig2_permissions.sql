-- V15__add_ecount_mig2_permissions.sql
-- MIG-2 이카운트 마스터 5종 import 화면 권한 seed.
-- 권한: MASTER / MANAGER edit only. 다른 역할은 fallback=false 유지.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'ecount.mig2.product',    TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig2.account',    TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig2.department', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig2.warehouse',  TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',  'ecount.mig2.card',       TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig2.product',    TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig2.account',    TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig2.department', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig2.warehouse',  TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig2.card',       TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
