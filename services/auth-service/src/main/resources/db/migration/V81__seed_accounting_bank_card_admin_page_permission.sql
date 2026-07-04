-- V81__seed_accounting_bank_card_admin_page_permission.sql
-- 계좌/카드 관리 page-code: accounting.bank-card-admin.
--
-- 기본 grant:
--   * MASTER / MANAGER: VIEW + CREATE + UPDATE + DELETE
--   * ACCOUNTANT: VIEW only

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.role_code,
    'accounting.bank-card-admin',
    TRUE,
    roles.can_edit,
    NOW(),
    'v81-accounting-bank-card-admin',
    NOW(),
    'v81-accounting-bank-card-admin',
    FALSE
FROM (VALUES
    ('MASTER', TRUE),
    ('MANAGER', TRUE),
    ('ACCOUNTANT', FALSE)
) AS roles(role_code, can_edit)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE,
    can_edit = EXCLUDED.can_edit,
    modified_at = NOW(),
    modified_by = 'v81-accounting-bank-card-admin';

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.role_code,
    'accounting.bank-card-admin',
    TRUE,
    roles.can_mutate,
    roles.can_mutate,
    roles.can_mutate,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    'v81-accounting-bank-card-admin',
    NOW(),
    'v81-accounting-bank-card-admin',
    FALSE
FROM (VALUES
    ('MASTER', TRUE),
    ('MANAGER', TRUE),
    ('ACCOUNTANT', FALSE)
) AS roles(role_code, can_mutate)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = FALSE,
    can_download = FALSE,
    can_print = FALSE,
    modified_at = NOW(),
    modified_by = 'v81-accounting-bank-card-admin';

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    groups.group_id,
    'accounting.bank-card-admin',
    TRUE,
    groups.can_mutate,
    groups.can_mutate,
    groups.can_mutate,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    'v81-accounting-bank-card-admin',
    NOW(),
    'v81-accounting-bank-card-admin',
    FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000100'::uuid, TRUE),
    ('00000000-0000-0000-0000-000000000101'::uuid, TRUE),
    ('00000000-0000-0000-0000-000000000104'::uuid, FALSE)
) AS groups(group_id, can_mutate)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = FALSE,
    can_download = FALSE,
    can_print = FALSE,
    modified_at = NOW(),
    modified_by = 'v81-accounting-bank-card-admin';

INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    ag.account_id,
    gpp.page_code,
    BOOL_OR(gpp.can_view),
    BOOL_OR(gpp.can_create),
    BOOL_OR(gpp.can_update),
    BOOL_OR(gpp.can_delete),
    BOOL_OR(gpp.can_restore),
    BOOL_OR(gpp.can_download),
    BOOL_OR(gpp.can_print),
    NOW(),
    'v81-accounting-bank-card-admin',
    NOW(),
    'v81-accounting-bank-card-admin',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code = 'accounting.bank-card-admin'
WHERE ag.is_deleted = FALSE
  AND EXISTS (
      SELECT 1
        FROM account_groups target_ag
       WHERE target_ag.account_id = ag.account_id
         AND target_ag.group_id IN (
             '00000000-0000-0000-0000-000000000100'::uuid,
             '00000000-0000-0000-0000-000000000101'::uuid,
             '00000000-0000-0000-0000-000000000104'::uuid
         )
         AND target_ag.is_deleted = FALSE
  )
  AND NOT EXISTS (
      SELECT 1
      FROM account_groups sg
      JOIN permission_groups pg
        ON pg.id = sg.group_id
       AND pg.is_deleted = FALSE
       AND pg.is_system_master = TRUE
      WHERE sg.account_id = ag.account_id
        AND sg.is_deleted = FALSE
  )
GROUP BY ag.account_id, gpp.page_code
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v81-accounting-bank-card-admin';
