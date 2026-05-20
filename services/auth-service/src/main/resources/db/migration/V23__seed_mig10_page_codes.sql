-- V23__seed_mig10_page_codes.sql
-- MIG-10 Order manager_name -> Employee cross-link backfill 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'ecount.mig10.order-employee-backfill', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'ecount.mig10.order-employee-backfill', TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
