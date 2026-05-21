-- V27__seed_mig21_ops_dashboard_page_code.sql
-- MIG-21 이카운트 마이그레이션 운영 대시보드 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER', 'ecount.mig.ops-dashboard', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig.ops-dashboard', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'ecount.mig.ops-dashboard', TRUE, FALSE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
