-- V44__assign_accounts_to_groups.sql
-- 기존 활성 계정을 V43 기본 권한그룹에 1건씩 배속한다.
--
-- 정합 검증 쿼리:
--   시드 직후 account_permission_overrides 는 비어 있으므로 실권한은 union(single role group) 이다.
--   V43 group_page_permissions 는 role_page_permission_templates 를 그대로 복사했으므로,
--   기존 account_page_permissions 와 아래 expected 결과가 동치여야 한다.
--
--   WITH expected AS (
--       SELECT a.id AS account_id, gpp.page_code,
--              gpp.can_view, gpp.can_create, gpp.can_update, gpp.can_delete,
--              gpp.can_restore, gpp.can_download, gpp.can_print
--       FROM accounts a
--       JOIN account_groups ag ON ag.account_id = a.id AND ag.is_deleted = FALSE
--       JOIN group_page_permissions gpp ON gpp.group_id = ag.group_id AND gpp.is_deleted = FALSE
--       WHERE a.is_deleted = FALSE AND a.enabled = TRUE AND a.role <> 'MASTER'
--   )
--   SELECT *
--   FROM (
--       SELECT * FROM expected
--       EXCEPT
--       SELECT account_id, page_code, can_view, can_create, can_update, can_delete,
--              can_restore, can_download, can_print
--       FROM account_page_permissions
--       WHERE is_deleted = FALSE
--   ) diff_expected_minus_actual
--   UNION ALL
--   SELECT *
--   FROM (
--       SELECT account_id, page_code, can_view, can_create, can_update, can_delete,
--              can_restore, can_download, can_print
--       FROM account_page_permissions
--       WHERE is_deleted = FALSE
--       EXCEPT
--       SELECT * FROM expected
--   ) diff_actual_minus_expected;

INSERT INTO account_groups
    (id, account_id, group_id,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    a.id,
    role_groups.group_id,
    NOW(),
    'v44-assign-accounts-to-groups',
    NOW(),
    'v44-assign-accounts-to-groups',
    FALSE
FROM accounts a
JOIN (
    VALUES
        ('MASTER',     '00000000-0000-0000-0000-000000000100'::uuid),
        ('MANAGER',    '00000000-0000-0000-0000-000000000101'::uuid),
        ('SALES',      '00000000-0000-0000-0000-000000000102'::uuid),
        ('WAREHOUSE',  '00000000-0000-0000-0000-000000000103'::uuid),
        ('ACCOUNTANT', '00000000-0000-0000-0000-000000000104'::uuid),
        ('INVENTORY',  '00000000-0000-0000-0000-000000000105'::uuid),
        ('DISPATCH',   '00000000-0000-0000-0000-000000000106'::uuid),
        ('DRIVER',     '00000000-0000-0000-0000-000000000107'::uuid),
        ('STAFF',      '00000000-0000-0000-0000-000000000108'::uuid),
        ('DEVELOPER',  '00000000-0000-0000-0000-000000000109'::uuid)
) AS role_groups(role_code, group_id)
  ON role_groups.role_code = a.role
WHERE a.is_deleted = FALSE
  AND a.enabled = TRUE
ON CONFLICT (account_id, group_id) WHERE is_deleted = FALSE DO NOTHING;
