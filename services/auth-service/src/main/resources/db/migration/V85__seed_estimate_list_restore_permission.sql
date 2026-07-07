-- E2 estimate list strikethrough restore.
--
-- estimates.list 는 기존 견적 목록/작성/수정 page-code 다. 복원은 soft-delete undo 이므로
-- 동일 페이지에 can_restore 를 additive grant 한다.
--
-- V10(role_page_permissions)+V39 backfill 기준 MASTER/MANAGER/SALES 는 이미
-- view/create/update/delete 전부 TRUE 인 반면 can_restore 만 없어 삭제는 되는데 복원은
-- MASTER 로만 병목되는 비대칭이 있었다. 목록 복원은 목록 운영 액션이라 삭제 권한을 이미
-- 보유한 3역할(MASTER/MANAGER/SALES) 모두에 부여한다(V83 거래처주문·V84 판매전표와 정합).
--
-- ON CONFLICT DO UPDATE 는 can_restore 만 갱신한다 — 기존 행의 view/create/update/delete
-- 값은 이 마이그레이션 관할 밖이라 덮어쓰지 않는다(V83/V84 와 동일한 좁힌 범위).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.role_code,
    'estimates.list',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    NOW(),
    'v85-estimate-list-restore',
    NOW(),
    'v85-estimate-list-restore',
    FALSE
FROM (VALUES
    ('MASTER'),
    ('MANAGER'),
    ('SALES')
) AS roles(role_code)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_restore = TRUE,
    modified_at = NOW(),
    modified_by = 'v85-estimate-list-restore';

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.group_id,
    'estimates.list',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    NOW(),
    'v85-estimate-list-restore',
    NOW(),
    'v85-estimate-list-restore',
    FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000100'::uuid),
    ('00000000-0000-0000-0000-000000000101'::uuid),
    ('00000000-0000-0000-0000-000000000102'::uuid)
) AS roles(group_id)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_restore = TRUE,
    modified_at = NOW(),
    modified_by = 'v85-estimate-list-restore';

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
    'v85-estimate-list-restore',
    NOW(),
    'v85-estimate-list-restore',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code = 'estimates.list'
WHERE ag.is_deleted = FALSE
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
    modified_by = 'v85-estimate-list-restore';
