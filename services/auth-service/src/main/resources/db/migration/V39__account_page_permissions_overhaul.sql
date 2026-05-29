-- V39__account_page_permissions_overhaul.sql
-- Phase 1 권한 재편: role×page×VIEW/EDIT -> account×page×7-action.
--
-- 보존 매핑 산출 근거:
--   RESTORE: inventory §2-2, slip §2-2 endpoint 현행 guard bit(EDIT) + V35/V36 seed.
--   DOWNLOAD: menu-inventory §2-3 의 기존 outbound export endpoint + 현행 guard bit + V8/V34/V36/V37 seed.
--             CSV/Excel import inbound endpoint 는 다운로드가 아니므로 can_download 에 매핑하지 않는다.
--   PRINT: menu-inventory §2-4 의 기존 HTML print view/endpoint + 현행 guard bit(VIEW) + V7/V8/V10/V36 seed.
--
-- RESTORE preservation:
--   inventory.warehouse.admin: EDIT -> MASTER, MANAGER
--   slip.audit-revert:         EDIT -> MASTER, MANAGER
--
-- DOWNLOAD preservation:
--   accounting.journals:       VIEW -> MASTER, MANAGER, ACCOUNTANT
--   accounting.hometax-export: VIEW -> MASTER, MANAGER, ACCOUNTANT
--   inventory.dps:             VIEW -> MASTER, MANAGER, WAREHOUSE, INVENTORY
--   inventory.stock-balance:   EDIT -> MASTER, MANAGER, WAREHOUSE, INVENTORY
--   slip.print.export:         EDIT -> MASTER, MANAGER
--   partners.edit:             VIEW -> MASTER, MANAGER
--
-- PRINT preservation:
--   accounting.tax-invoice.list: VIEW -> MASTER, MANAGER, ACCOUNTANT
--   accounting.statement-batch:  VIEW -> MASTER, MANAGER, ACCOUNTANT
--   accounting.partner-ledger:   VIEW -> MASTER, MANAGER, ACCOUNTANT
--   accounting.reports:          VIEW -> MASTER, MANAGER, ACCOUNTANT
--   sales.partner-order.print:   VIEW -> MASTER, MANAGER, SALES, WAREHOUSE
--   slip.print.next-day:         VIEW -> MASTER, MANAGER, SALES

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS role_page_permission_templates (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    role_code       VARCHAR(20)  NOT NULL,
    page_code       VARCHAR(100) NOT NULL,
    can_view        BOOLEAN      NOT NULL DEFAULT FALSE,
    can_create      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_update      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_delete      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_restore     BOOLEAN      NOT NULL DEFAULT FALSE,
    can_download    BOOLEAN      NOT NULL DEFAULT FALSE,
    can_print       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT role_page_permission_templates_pk PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rppt_active
    ON role_page_permission_templates (role_code, page_code)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_rppt_role
    ON role_page_permission_templates (role_code)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_rppt_page
    ON role_page_permission_templates (page_code)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS account_page_permissions (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    account_id      UUID         NOT NULL,
    page_code       VARCHAR(100) NOT NULL,
    can_view        BOOLEAN      NOT NULL DEFAULT FALSE,
    can_create      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_update      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_delete      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_restore     BOOLEAN      NOT NULL DEFAULT FALSE,
    can_download    BOOLEAN      NOT NULL DEFAULT FALSE,
    can_print       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT account_page_permissions_pk PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_active
    ON account_page_permissions (account_id, page_code)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_app_account
    ON account_page_permissions (account_id)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_app_page
    ON account_page_permissions (page_code)
    WHERE is_deleted = FALSE;

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    rpp.role_code,
    rpp.page_code,
    rpp.can_view,
    rpp.can_edit,
    rpp.can_edit,
    rpp.can_edit,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    'v39-role-template',
    NOW(),
    'v39-role-template',
    FALSE
FROM role_page_permissions rpp
WHERE rpp.is_deleted = FALSE
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;

UPDATE role_page_permission_templates t
SET    can_restore = TRUE,
       modified_at = NOW(),
       modified_by = 'v39-preserve-restore'
WHERE  t.is_deleted = FALSE
  AND  (t.role_code, t.page_code) IN (
    VALUES
        ('MASTER',  'inventory.warehouse.admin'),
        ('MANAGER', 'inventory.warehouse.admin'),
        ('MASTER',  'slip.audit-revert'),
        ('MANAGER', 'slip.audit-revert')
  );

UPDATE role_page_permission_templates t
SET    can_download = TRUE,
       modified_at = NOW(),
       modified_by = 'v39-preserve-download'
WHERE  t.is_deleted = FALSE
  AND  (t.role_code, t.page_code) IN (
    VALUES
        ('MASTER',     'accounting.journals'),
        ('MANAGER',    'accounting.journals'),
        ('ACCOUNTANT', 'accounting.journals'),
        ('MASTER',     'accounting.hometax-export'),
        ('MANAGER',    'accounting.hometax-export'),
        ('ACCOUNTANT', 'accounting.hometax-export'),
        ('MASTER',     'inventory.dps'),
        ('MANAGER',    'inventory.dps'),
        ('WAREHOUSE',  'inventory.dps'),
        ('INVENTORY',  'inventory.dps'),
        ('MASTER',     'inventory.stock-balance'),
        ('MANAGER',    'inventory.stock-balance'),
        ('WAREHOUSE',  'inventory.stock-balance'),
        ('INVENTORY',  'inventory.stock-balance'),
        ('MASTER',     'slip.print.export'),
        ('MANAGER',    'slip.print.export'),
        ('MASTER',     'partners.edit'),
        ('MANAGER',    'partners.edit')
  );

UPDATE role_page_permission_templates t
SET    can_print = TRUE,
       modified_at = NOW(),
       modified_by = 'v39-preserve-print'
WHERE  t.is_deleted = FALSE
  AND  (t.role_code, t.page_code) IN (
    VALUES
        ('MASTER',     'accounting.tax-invoice.list'),
        ('MANAGER',    'accounting.tax-invoice.list'),
        ('ACCOUNTANT', 'accounting.tax-invoice.list'),
        ('MASTER',     'accounting.statement-batch'),
        ('MANAGER',    'accounting.statement-batch'),
        ('ACCOUNTANT', 'accounting.statement-batch'),
        ('MASTER',     'accounting.partner-ledger'),
        ('MANAGER',    'accounting.partner-ledger'),
        ('ACCOUNTANT', 'accounting.partner-ledger'),
        ('MASTER',     'accounting.reports'),
        ('MANAGER',    'accounting.reports'),
        ('ACCOUNTANT', 'accounting.reports'),
        ('MASTER',     'sales.partner-order.print'),
        ('MANAGER',    'sales.partner-order.print'),
        ('SALES',      'sales.partner-order.print'),
        ('WAREHOUSE',  'sales.partner-order.print'),
        ('MASTER',     'slip.print.next-day'),
        ('MANAGER',    'slip.print.next-day'),
        ('SALES',      'slip.print.next-day')
  );

INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    a.id,
    t.page_code,
    t.can_view,
    t.can_create,
    t.can_update,
    t.can_delete,
    t.can_restore,
    t.can_download,
    t.can_print,
    NOW(),
    'v39-account-materialize',
    NOW(),
    'v39-account-materialize',
    FALSE
FROM accounts a
JOIN role_page_permission_templates t
  ON t.role_code = a.role
 AND t.is_deleted = FALSE
WHERE a.is_deleted = FALSE
  AND a.enabled = TRUE
  AND a.role NOT IN ('MASTER', 'PARTNER')
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO NOTHING;

COMMENT ON TABLE role_page_permissions IS
    'DEPRECATED by V39: enforcement moved to account_page_permissions; role rows are retained for rollback/reference only.';
