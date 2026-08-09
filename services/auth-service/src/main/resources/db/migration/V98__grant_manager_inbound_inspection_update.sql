-- V98: MANAGER 입고 검수 완료 권한 부여.
--
-- 개발책임자 결정(2026-08-09): MANAGER도 INSPECTING -> COMPLETED를 수행한다.
-- 검수 완료의 실제 권한 요구는 slip.transfer.process:UPDATE와
-- inbound.inspection:UPDATE의 동시 충족이며, 전자는 MANAGER가 이미 보유한다.
--
-- canonical enforcement 경로(role template/group/account cache)에서
-- inbound.inspection의 UPDATE만 additive grant 한다. 다른 역할과 다른 액션은
-- 변경하지 않는다. 각 UPDATE는 기존 행의 나머지 비트를 보존한다.

-- 1) 역할 템플릿: MANAGER만 UPDATE를 연다.
UPDATE role_page_permission_templates
SET can_update = TRUE,
    modified_at = NOW(),
    modified_by = 'v98-manager-inbound-inspection'
WHERE role_code = 'MANAGER'
  AND page_code = 'inbound.inspection'
  AND is_deleted = FALSE
  AND can_update = FALSE;

-- 2) 기본 MANAGER 그룹: 다른 역할 그룹은 대상에서 제외한다.
UPDATE group_page_permissions
SET can_update = TRUE,
    modified_at = NOW(),
    modified_by = 'v98-manager-inbound-inspection'
WHERE group_id = '00000000-0000-0000-0000-000000000101'::uuid
  AND page_code = 'inbound.inspection'
  AND is_deleted = FALSE
  AND can_update = FALSE;

-- 3) 실효 계정 캐시: 활성 MANAGER 계정의 기존 행에서 UPDATE만 연다.
UPDATE account_page_permissions app
SET can_update = TRUE,
    modified_at = NOW(),
    modified_by = 'v98-manager-inbound-inspection'
FROM accounts a
JOIN account_groups ag
  ON ag.account_id = a.id
 AND ag.group_id = '00000000-0000-0000-0000-000000000101'::uuid
 AND ag.is_deleted = FALSE
WHERE a.id = app.account_id
  AND a.is_deleted = FALSE
  AND a.enabled = TRUE
  AND app.page_code = 'inbound.inspection'
  AND app.is_deleted = FALSE
  AND app.can_update = FALSE;

-- V39 이후 계정 캐시가 아직 없는 활성 MANAGER 계정은 템플릿의 현재 비트를
-- 그대로 materialize한다. 기존 계정 행은 위 UPDATE가 UPDATE만 바꾼다.
INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), a.id, t.page_code,
       t.can_view, t.can_create, t.can_update, t.can_delete,
       t.can_restore, t.can_download, t.can_print,
       NOW(), 'v98-manager-inbound-inspection', NOW(), 'v98-manager-inbound-inspection', FALSE
FROM accounts a
JOIN account_groups ag
  ON ag.account_id = a.id
 AND ag.group_id = '00000000-0000-0000-0000-000000000101'::uuid
 AND ag.is_deleted = FALSE
JOIN role_page_permission_templates t
  ON t.role_code = 'MANAGER'
 AND t.page_code = 'inbound.inspection'
 AND t.is_deleted = FALSE
WHERE a.is_deleted = FALSE
  AND a.enabled = TRUE
  AND NOT EXISTS (
      SELECT 1
      FROM account_page_permissions app
      WHERE app.account_id = a.id
        AND app.page_code = 'inbound.inspection'
        AND app.is_deleted = FALSE
  );
