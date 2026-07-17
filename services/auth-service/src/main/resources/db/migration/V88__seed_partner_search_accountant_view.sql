-- #825 슬2 — ACCOUNTANT partners.search VIEW 복구.
--
-- role/template/group source는 can_view만 additive grant 한다.
-- 기존 can_edit 및 7-action 값은 신규 계정/그룹의 기존 계약을 보존해야 하므로 갱신하지 않는다.
-- account_page_permissions는 V39/V43 이후 실 enforcement 캐시다.
-- 실권한 = 활성 그룹 action BOOL_OR, 단 활성 account override가 있으면 override가 최우선이다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), 'ACCOUNTANT', 'partners.search', TRUE, FALSE,
     NOW(), 'v88-partner-search-accountant', NOW(), 'v88-partner-search-accountant', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE;

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), 'ACCOUNTANT', 'partners.search', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
     NOW(), 'v88-partner-search-accountant', NOW(), 'v88-partner-search-accountant', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE;

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000104'::uuid, 'partners.search',
     TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
     NOW(), 'v88-partner-search-accountant', NOW(), 'v88-partner-search-accountant', FALSE)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE;

WITH eligible_accounts AS (
    SELECT a.id AS account_id
      FROM accounts a
     WHERE a.is_deleted = FALSE
       AND a.enabled = TRUE
       AND EXISTS (
           SELECT 1
             FROM account_groups target_ag
             JOIN permission_groups target_pg
               ON target_pg.id = target_ag.group_id
              AND target_pg.is_deleted = FALSE
            WHERE target_ag.account_id = a.id
              AND target_ag.group_id = '00000000-0000-0000-0000-000000000104'::uuid
              AND target_ag.is_deleted = FALSE
       )
       AND NOT EXISTS (
           SELECT 1
             FROM account_groups master_ag
             JOIN permission_groups master_pg
               ON master_pg.id = master_ag.group_id
              AND master_pg.is_deleted = FALSE
              AND master_pg.is_system_master = TRUE
            WHERE master_ag.account_id = a.id
              AND master_ag.is_deleted = FALSE
       )
), group_effective AS (
    SELECT ag.account_id,
           gpp.page_code,
           BOOL_OR(gpp.can_view) AS can_view,
           BOOL_OR(gpp.can_create) AS can_create,
           BOOL_OR(gpp.can_update) AS can_update,
           BOOL_OR(gpp.can_delete) AS can_delete,
           BOOL_OR(gpp.can_restore) AS can_restore,
           BOOL_OR(gpp.can_download) AS can_download,
           BOOL_OR(gpp.can_print) AS can_print
      FROM eligible_accounts ea
      JOIN account_groups ag
        ON ag.account_id = ea.account_id
       AND ag.is_deleted = FALSE
      JOIN permission_groups pg
        ON pg.id = ag.group_id
       AND pg.is_deleted = FALSE
      JOIN group_page_permissions gpp
        ON gpp.group_id = ag.group_id
       AND gpp.is_deleted = FALSE
     GROUP BY ag.account_id, gpp.page_code
), override_effective AS (
    SELECT apo.account_id,
           apo.page_code,
           apo.can_view,
           apo.can_create,
           apo.can_update,
           apo.can_delete,
           apo.can_restore,
           apo.can_download,
           apo.can_print
      FROM eligible_accounts ea
      JOIN account_permission_overrides apo
        ON apo.account_id = ea.account_id
       AND apo.is_deleted = FALSE
), effective_pages AS (
    SELECT account_id, page_code FROM group_effective
    UNION
    SELECT account_id, page_code FROM override_effective
)
INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), pages.account_id, pages.page_code,
       COALESCE(overrides.can_view, groups.can_view, FALSE),
       COALESCE(overrides.can_create, groups.can_create, FALSE),
       COALESCE(overrides.can_update, groups.can_update, FALSE),
       COALESCE(overrides.can_delete, groups.can_delete, FALSE),
       COALESCE(overrides.can_restore, groups.can_restore, FALSE),
       COALESCE(overrides.can_download, groups.can_download, FALSE),
       COALESCE(overrides.can_print, groups.can_print, FALSE),
       NOW(), 'v88-partner-search-accountant', NOW(), 'v88-partner-search-accountant', FALSE
  FROM effective_pages pages
  LEFT JOIN group_effective groups
    ON groups.account_id = pages.account_id
   AND groups.page_code = pages.page_code
  LEFT JOIN override_effective overrides
    ON overrides.account_id = pages.account_id
   AND overrides.page_code = pages.page_code
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v88-partner-search-accountant';
