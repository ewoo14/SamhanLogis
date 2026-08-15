-- V108: GROUP_BASED 계정의 실효 권한 캐시 backfill.
--
-- V43/V44가 역할 그룹과 계정 배속은 만들었지만, 이미 존재하던 계정의
-- account_page_permissions를 모든 group_page_permissions 기준으로 재동기화하지
-- 못한 경우가 있다. enforcement는 account_page_permissions만 읽으므로,
-- 역할 템플릿에 grant가 있어도 GROUP_BASED 계정은 403이 될 수 있다.
--
-- 그룹 권한의 7-action BOOL_OR를 materialize하되, 명시적 account override가
-- 있으면 materializer와 동일하게 override를 우선한다. system-master 계정은
-- account cache가 아니라 bypass 경로를 사용하므로 대상에서 제외한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- messenger.admin의 canonical MANAGER 그룹 비트를 명시적으로 보장한다.
-- MASTER는 system-master bypass이고 SALES/ACCOUNTANT에는 이 행을 만들지 않는다.
INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000101'::uuid, 'messenger.admin',
     TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE,
     NOW(), 'v108-group-permission-backfill', NOW(), 'v108-group-permission-backfill', FALSE)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v108-group-permission-backfill';

-- 현재 그룹 권한을 account-form enforcement cache에 재-materialize한다.
-- account override가 있으면 해당 page의 7-action을 그대로 사용한다.
INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    effective.account_id,
    effective.page_code,
    effective.can_view,
    effective.can_create,
    effective.can_update,
    effective.can_delete,
    effective.can_restore,
    effective.can_download,
    effective.can_print,
    NOW(),
    'v108-group-permission-backfill',
    NOW(),
    'v108-group-permission-backfill',
    FALSE
FROM (
    SELECT
        ag.account_id,
        gpp.page_code,
        COALESCE(BOOL_OR(apo.can_view), BOOL_OR(gpp.can_view)) AS can_view,
        COALESCE(BOOL_OR(apo.can_create), BOOL_OR(gpp.can_create)) AS can_create,
        COALESCE(BOOL_OR(apo.can_update), BOOL_OR(gpp.can_update)) AS can_update,
        COALESCE(BOOL_OR(apo.can_delete), BOOL_OR(gpp.can_delete)) AS can_delete,
        COALESCE(BOOL_OR(apo.can_restore), BOOL_OR(gpp.can_restore)) AS can_restore,
        COALESCE(BOOL_OR(apo.can_download), BOOL_OR(gpp.can_download)) AS can_download,
        COALESCE(BOOL_OR(apo.can_print), BOOL_OR(gpp.can_print)) AS can_print
    FROM account_groups ag
    JOIN accounts a
      ON a.id = ag.account_id
     AND a.is_deleted = FALSE
     AND a.enabled = TRUE
    JOIN group_page_permissions gpp
      ON gpp.group_id = ag.group_id
     AND gpp.is_deleted = FALSE
    LEFT JOIN account_permission_overrides apo
      ON apo.account_id = ag.account_id
     AND apo.page_code = gpp.page_code
     AND apo.is_deleted = FALSE
    WHERE ag.is_deleted = FALSE
      AND NOT EXISTS (
          SELECT 1
          FROM account_groups system_membership
          JOIN permission_groups system_group
            ON system_group.id = system_membership.group_id
           AND system_group.is_deleted = FALSE
           AND system_group.is_system_master = TRUE
          WHERE system_membership.account_id = ag.account_id
            AND system_membership.is_deleted = FALSE
      )
    GROUP BY ag.account_id, gpp.page_code
) effective
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v108-group-permission-backfill';
