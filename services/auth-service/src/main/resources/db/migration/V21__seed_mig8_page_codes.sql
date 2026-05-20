-- V21__seed_mig8_page_codes.sql
-- MIG-8 Order 도메인 staging transform 화면 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'ecount.mig8.order', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig8.order', TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
