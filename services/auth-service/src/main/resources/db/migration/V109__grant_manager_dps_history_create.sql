-- V104: MANAGER DPS 비교 결과 저장 권한 보강
-- inventory.dps 페이지는 비교 조회뿐 아니라 AUTO_LATEST/MANUAL_NAMED 결과 저장을 제공한다.
-- 권한 범위를 넓히지 않고, 이미 정식 DPS 사용 역할인 MANAGER에 CREATE만 additive grant 한다.

UPDATE role_page_permission_templates
SET can_create = TRUE,
    modified_at = NOW(),
    modified_by = 'v104-manager-dps-history-create'
WHERE role_code = 'MANAGER'
  AND page_code = 'inventory.dps'
  AND is_deleted = FALSE
  AND can_create = FALSE;

UPDATE group_page_permissions
SET can_create = TRUE,
    modified_at = NOW(),
    modified_by = 'v104-manager-dps-history-create'
WHERE group_id = '00000000-0000-0000-0000-000000000101'::uuid
  AND page_code = 'inventory.dps'
  AND is_deleted = FALSE
  AND can_create = FALSE;

UPDATE account_page_permissions app
SET can_create = TRUE,
    modified_at = NOW(),
    modified_by = 'v104-manager-dps-history-create'
FROM accounts a
JOIN account_groups ag
  ON ag.account_id = a.id
 AND ag.group_id = '00000000-0000-0000-0000-000000000101'::uuid
 AND ag.is_deleted = FALSE
WHERE app.account_id = a.id
  AND app.page_code = 'inventory.dps'
  AND app.is_deleted = FALSE
  AND a.is_deleted = FALSE
  AND a.enabled = TRUE
  AND app.can_create = FALSE;

INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), a.id, t.page_code,
       t.can_view, t.can_create, t.can_update, t.can_delete,
       t.can_restore, t.can_download, t.can_print,
       NOW(), 'v104-manager-dps-history-create', NOW(), 'v104-manager-dps-history-create', FALSE
FROM accounts a
JOIN account_groups ag
  ON ag.account_id = a.id
 AND ag.group_id = '00000000-0000-0000-0000-000000000101'::uuid
 AND ag.is_deleted = FALSE
JOIN role_page_permission_templates t
  ON t.role_code = 'MANAGER'
 AND t.page_code = 'inventory.dps'
 AND t.is_deleted = FALSE
WHERE a.is_deleted = FALSE
  AND a.enabled = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM account_page_permissions app
      WHERE app.account_id = a.id
        AND app.page_code = 'inventory.dps'
        AND app.is_deleted = FALSE
  );
