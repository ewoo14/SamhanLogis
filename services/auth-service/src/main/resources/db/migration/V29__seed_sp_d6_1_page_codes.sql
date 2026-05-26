-- V29__seed_sp_d6_1_page_codes.sql
-- SP-D6-1 system.* + dc-config.import + dashboard.admin PageCode seed

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER', 'system.permission-admin', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER', 'system.password-admin', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER', 'system.account-admin', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER', 'dc-config.import', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER', 'dashboard.admin', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'dashboard.admin', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER', 'sales.partner-dc-config', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'sales.partner-dc-config', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'SALES', 'sales.partner-dc-config', TRUE, FALSE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
