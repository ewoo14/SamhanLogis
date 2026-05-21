-- V26__seed_mig20_reimport_page_code.sql
-- MIG-20 이카운트 raw 재import 수동 trigger 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER', 'ecount.reimport', TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
