-- V30__seed_sp_d6_2_page_codes.sql
-- SP-D6-2 groupware + product + partner-order @RequirePermission migration 신규 PageCode seed

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER', 'messenger.admin', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'messenger.admin', TRUE, TRUE, NOW(), 'system', FALSE),

    (gen_random_uuid(), 'MASTER', 'messenger.send', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'messenger.send', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'SALES', 'messenger.send', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'messenger.send', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'WAREHOUSE', 'messenger.send', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'INVENTORY', 'messenger.send', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DEVELOPER', 'messenger.send', TRUE, TRUE, NOW(), 'system', FALSE),

    (gen_random_uuid(), 'MASTER', 'products.edit-requests', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'products.edit-requests', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'SALES', 'products.edit-requests', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT', 'products.edit-requests', TRUE, TRUE, NOW(), 'system', FALSE),

    (gen_random_uuid(), 'MASTER', 'products.ecount-import', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'products.ecount-import', TRUE, TRUE, NOW(), 'system', FALSE),

    (gen_random_uuid(), 'DEVELOPER', 'products.list', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DEVELOPER', 'products.admin', TRUE, TRUE, NOW(), 'system', FALSE),

    (gen_random_uuid(), 'MASTER', 'sales.partner-order.edit-requests', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'sales.partner-order.edit-requests', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'SALES', 'sales.partner-order.edit-requests', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER', 'sales.partner-order.edit-requests', TRUE, TRUE, NOW(), 'system', FALSE),

    (gen_random_uuid(), 'MASTER', 'sales.partner-order.tutorial', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'sales.partner-order.tutorial', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER', 'sales.partner-order.tutorial', TRUE, TRUE, NOW(), 'system', FALSE),

    (gen_random_uuid(), 'PARTNER', 'sales.partner-order.list', TRUE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER', 'sales.partner-order.draft', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER', 'sales.partner-order.confirm', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER', 'sales.partner-order.history', TRUE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER', 'sales.partner-order.print', TRUE, FALSE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
